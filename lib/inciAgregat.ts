import type { SupabaseClient } from "@supabase/supabase-js";

export type InciEntry = {
  name: string;
  pct: number;
  cas: string | null;
  fungsi: string | null;
};

/**
 * Satu baris formula yang mau diurai jadi INCI. Menunjuk `material_id`
 * ATAU `item_id`: formula produk cuma kenal item, formula R&D boleh
 * menunjuk material yang belum pernah diadakan.
 */
export type BarisInci = {
  material_id: string | null;
  item_id: string | null;
  percentage: number;
  /** Nama untuk kalimat peringatan kalau barisnya tidak bisa diurai. */
  label: string;
};

type MaterialInci = {
  id: string;
  item_id: string | null;
  tradename: string;
  material_inci: {
    inci_master_id: string | null;
    inci_name: string;
    percentage: number;
  }[];
};

type Master = {
  id: string;
  inci_name: string;
  cas_number: string | null;
  function: string | null;
};

/**
 * Daftar INCI satu formula: komposisi INCI tiap material dikalikan
 * persen bahannya, komponen yang sama dijumlahkan, urut dari kandungan
 * terbesar.
 *
 * Satu-satunya rumus INCI formula, dipakai detail Products dan detail
 * R&D. Dua layar yang mengurai formula yang sama jadi daftar INCI yang
 * berbeda akan membuat label kemasan tergantung dari layar mana orang
 * menyalinnya.
 *
 * CAS & function dibaca dari `inci_master` saat dipakai, lewat
 * `inci_master_id` kalau ada, kalau tidak dicocokkan lewat namanya.
 */
export async function agregatInci(
  supabase: SupabaseClient,
  organizationId: string,
  baris: BarisInci[]
): Promise<{ entries: InciEntry[]; warnings: string[] }> {
  const warnings: string[] = [];
  if (baris.length === 0) return { entries: [], warnings };

  const materialIds = [
    ...new Set(baris.map((b) => b.material_id).filter((v): v is string => !!v)),
  ];
  const itemIds = [
    ...new Set(
      baris
        .filter((b) => !b.material_id && b.item_id)
        .map((b) => b.item_id as string)
    ),
  ];

  const kolom =
    "id, item_id, tradename, material_inci(inci_master_id, inci_name, percentage)";
  const [byMat, byItem] = await Promise.all([
    materialIds.length > 0
      ? supabase
          .from("materials")
          .select(kolom)
          .eq("organization_id", organizationId)
          .in("id", materialIds)
      : Promise.resolve({ data: [] }),
    itemIds.length > 0
      ? supabase
          .from("materials")
          .select(kolom)
          .eq("organization_id", organizationId)
          .in("item_id", itemIds)
      : Promise.resolve({ data: [] }),
  ]);

  const matById = new Map(
    ((byMat.data || []) as unknown as MaterialInci[]).map((m) => [m.id, m])
  );
  const matByItem = new Map(
    ((byItem.data || []) as unknown as MaterialInci[]).map((m) => [m.item_id, m])
  );

  const agg = new Map<string, number>();
  const masterIdByName = new Map<string, string>();

  for (const b of baris) {
    const mat = b.material_id
      ? matById.get(b.material_id)
      : b.item_id
        ? matByItem.get(b.item_id)
        : undefined;
    if (!mat) {
      warnings.push(
        b.material_id
          ? `"${b.label}" tidak ditemukan di master Material`
          : `"${b.label}" belum ter-link ke Material`
      );
      continue;
    }
    if (mat.material_inci.length === 0) {
      warnings.push(`Material "${mat.tradename}" belum punya komposisi INCI`);
      continue;
    }
    for (const inci of mat.material_inci) {
      const kontribusi = (Number(b.percentage) * Number(inci.percentage)) / 100;
      agg.set(inci.inci_name, (agg.get(inci.inci_name) || 0) + kontribusi);
      if (inci.inci_master_id && !masterIdByName.has(inci.inci_name)) {
        masterIdByName.set(inci.inci_name, inci.inci_master_id);
      }
    }
  }

  const info = new Map<string, { cas: string | null; fungsi: string | null }>();
  if (agg.size > 0) {
    const ids = [...new Set(masterIdByName.values())];
    const names = [...agg.keys()];
    const [byId, byName] = await Promise.all([
      ids.length > 0
        ? supabase
            .from("inci_master")
            .select("id, inci_name, cas_number, function")
            .eq("organization_id", organizationId)
            .in("id", ids)
        : Promise.resolve({ data: [] }),
      supabase
        .from("inci_master")
        .select("id, inci_name, cas_number, function")
        .eq("organization_id", organizationId)
        .in("inci_name", names),
    ]);
    const masterById = new Map(
      ((byId.data || []) as Master[]).map((m) => [m.id, m])
    );
    const masterByName = new Map(
      ((byName.data || []) as Master[]).map((m) => [m.inci_name, m])
    );
    for (const name of names) {
      const idMaster = masterIdByName.get(name);
      const m =
        (idMaster ? masterById.get(idMaster) : undefined) ??
        masterByName.get(name);
      info.set(name, {
        cas: m?.cas_number?.trim() || null,
        fungsi: m?.function?.trim() || null,
      });
    }
  }

  const entries: InciEntry[] = Array.from(agg, ([name, pct]) => ({
    name,
    pct,
    cas: info.get(name)?.cas ?? null,
    fungsi: info.get(name)?.fungsi ?? null,
  })).sort((a, b) => b.pct - a.pct);

  return { entries, warnings };
}
