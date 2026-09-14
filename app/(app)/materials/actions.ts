"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import { toResult, type ActionResult } from "@/lib/actionResult";

export type InciRow = {
  inci_master_id: string;
  inci_name: string;
  percentage: number;
};

type MaterialPayload = {
  material_code: string;
  tradename: string;
  supplier_id: string | null;
  origin: string | null;
  noc: string | null;
  kategori: "Bahan Baku" | "Kemasan";
  keterangan: string | null;
  /**
   * Harga penawaran supplier, TANPA PPN. Cuma dipakai kalau bahannya
   * belum pernah dibeli; begitu ada pembelian, `harga_per_unit` yang
   * menang. Tidak pernah jadi HPP.
   */
  harga_referensi: number | null;
  /**
   * MOQ supplier. Dipakai kalau materialnya belum punya item stok;
   * yang sudah punya memakai `items.moq`.
   */
  moq: number | null;
  inci_rows: InciRow[];
};

export async function createMaterial(
  data: MaterialPayload
): Promise<ActionResult> {
  return toResult(() => createMaterialImpl(data), "Gagal menyimpan material");
}

async function createMaterialImpl(data: MaterialPayload) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }

  if (!data.material_code || !data.tradename) {
    throw new Error("Kode material & tradename wajib diisi");
  }

  // Cegah double input: kode material sama (case-insensitive) di org ini
  const { data: dup } = await supabase
    .from("materials")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("material_code", data.material_code.trim());
  if (dup && dup.length > 0) {
    throw new Error(`Kode material "${data.material_code.trim()}" sudah terdaftar`);
  }

  const { data: material, error } = await supabase
    .from("materials")
    .insert({
      material_code: data.material_code.trim(),
      tradename: data.tradename.trim(),
      supplier_id: data.supplier_id || null,
      origin: data.origin || null,
      noc: data.noc || null,
      kategori: data.kategori,
      keterangan: data.keterangan,
      harga_referensi: data.harga_referensi,
      moq: data.moq,
      organization_id: organizationId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const validInci = data.inci_rows.filter((r) => r.inci_name && r.percentage >= 0);
  if (validInci.length > 0) {
    const { error: inciError } = await supabase.from("material_inci").insert(
      validInci.map((r) => ({
        material_id: material.id,
        inci_master_id: r.inci_master_id || null,
        inci_name: r.inci_name,
        percentage: r.percentage,
        organization_id: organizationId,
      }))
    );

    if (inciError) {
      throw new Error(inciError.message);
    }
  }

  revalidatePath("/materials");
}

export async function updateMaterial(
  id: string,
  data: MaterialPayload
): Promise<ActionResult> {
  return toResult(
    () => updateMaterialImpl(id, data),
    "Gagal menyimpan material"
  );
}

async function updateMaterialImpl(id: string, data: MaterialPayload) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!data.material_code || !data.tradename) {
    throw new Error("Kode material & tradename wajib diisi");
  }

  // Cegah double input: kode sama di material LAIN (case-insensitive)
  const { data: dup } = await supabase
    .from("materials")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("material_code", data.material_code.trim())
    .neq("id", id);
  if (dup && dup.length > 0) {
    throw new Error(`Kode material "${data.material_code.trim()}" sudah terdaftar`);
  }

  const kode = data.material_code.trim();
  const tradename = data.tradename.trim();

  /* Item stok yang ter-link dibaca SEBELUM tulisan pertama, bersama
     penjaga nama dobelnya. supabase-js tidak punya transaksi, jadi
     penjaga yang dipasang di tengah akan meninggalkan material yang
     sudah terlanjur berganti nama sementara itemnya tidak, yaitu persis
     keadaan yang seluruh sinkronisasi ini mau hapus. Alasan yang sama
     dengan `assertVarianBerstokTidakHilang` di updateProduct. */
  const { data: matRow } = await supabase
    .from("materials")
    .select("item_id, tradename")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  const { data: itemRow } = matRow?.item_id
    ? await supabase
        .from("items")
        .select("nama")
        .eq("id", matRow.item_id)
        .maybeSingle()
    : { data: null };

  /* Nama item ikut berubah HANYA selama gudang belum menamainya sendiri.

     Kolomnya di form Stock Items memang berlabel "nama sehari-hari di
     gudang": tradename katalog supplier boleh panjang dan penuh kode,
     dan orang gudang berhak memendekkannya. Menimpa nama itu tiap kali
     ada orang menyunting materialnya (bahkan cuma untuk mengganti MOQ)
     akan menghapus keputusan yang sengaja dibuat, diam-diam.

     Jadi polanya sama dengan `hargaManual` di InvoiceForm dan
     `taxManual` di POForm: isian otomatis berhenti begitu manusia
     menyentuhnya. Yang dibandingkan nama item dengan tradename LAMA,
     bukan yang baru diketik, karena yang mau diketahui adalah "item ini
     masih ikut materialnya atau sudah dinamai sendiri". */
  const namaItemIkut =
    !!matRow?.item_id &&
    (itemRow?.nama ?? "").trim().toLowerCase() ===
      String(matRow.tradename ?? "").trim().toLowerCase();

  if (namaItemIkut && matRow?.item_id) {
    // Nama item wajib unik di satu organisasi, aturan yang sama dengan
    // form Stock Items. Ditolak di sini supaya tidak ada material yang
    // tersimpan dengan nama yang itemnya gagal ikuti.
    const { data: dupItem } = await supabase
      .from("items")
      .select("kode")
      .eq("organization_id", organizationId)
      .ilike("nama", tradename)
      .neq("id", matRow.item_id);
    if (dupItem && dupItem.length > 0) {
      throw new Error(
        `Nama "${tradename}" sudah dipakai item stok lain (${dupItem[0].kode}). Pakai nama lain, atau rapikan dulu itemnya lewat menu Stock Items.`
      );
    }
  }

  const { error } = await supabase
    .from("materials")
    .update({
      material_code: kode,
      tradename,
      supplier_id: data.supplier_id || null,
      origin: data.origin || null,
      noc: data.noc || null,
      kategori: data.kategori,
      keterangan: data.keterangan,
      harga_referensi: data.harga_referensi,
      moq: data.moq,
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  /* Kode selalu ikut, nama ikut selama item stoknya belum dinamai
     sendiri (lihat `namaItemIkut` di atas): satu bahan, satu identitas.
     Sebelumnya cuma kodenya, dan akibatnya bahan yang sama bisa bernama
     "Cetiol CC" di R&D lalu "Cetyl Ethylhexanoate" di gudang tanpa ada
     error apa pun yang memberi tahu. Dua nama untuk satu barang adalah
     undangan salah pilih di form PO dan di lembar opname, dan baru
     ketahuan sesudah stoknya bergerak.

     Aman untuk seluruh riwayat: mutasi bahan menyimpan `item_id`, bukan
     teks namanya, jadi stok, HPP, PO lama, dan batch produksi tidak
     bergerak sedikit pun. Itu yang membedakannya dengan nama varian
     produk jadi, yang justru TIDAK boleh ikut berganti diam-diam karena
     di sana namanya sendiri yang jadi kunci stok.

     Error-nya dilempar, tidak ditelan seperti versi lama: item yang
     gagal mengikuti berarti dua layar kembali berbeda nama, dan itu
     harus kelihatan sekarang, bukan berbulan-bulan lagi. */
  if (matRow?.item_id) {
    const { error: itemError } = await supabase
      .from("items")
      .update(namaItemIkut ? { kode, nama: tradename } : { kode })
      .eq("id", matRow.item_id);
    if (itemError) throw new Error(itemError.message);
  }

  await supabase.from("material_inci").delete().eq("material_id", id);

  const validInci = data.inci_rows.filter((r) => r.inci_name && r.percentage >= 0);
  if (validInci.length > 0) {
    const { error: inciError } = await supabase.from("material_inci").insert(
      validInci.map((r) => ({
        material_id: id,
        inci_master_id: r.inci_master_id || null,
        inci_name: r.inci_name,
        percentage: r.percentage,
        organization_id: organizationId,
      }))
    );

    if (inciError) {
      throw new Error(inciError.message);
    }
  }

  revalidatePath("/materials");
}