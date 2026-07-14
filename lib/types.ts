export type UserRole = "Admin" | "Staff Gudang" | "Staff Produksi";

export interface Profile {
  id: string;
  email: string;
  nama: string;
  role: UserRole;
  aktif: boolean;
  organization_id: string;
  is_super_admin: boolean;
  allowed_modules: string[] | null;
}

export interface Organization {
  id: string;
  nama: string;
  slug: string;
  aktif: boolean;
} 

export interface Supplier {
  id: string;
  nama: string;
  alamat: string | null;
  nama_kontak: string | null;
  no_telp: string | null;
  email: string | null;
  npwp: string | null;
  organization_id: string;
}

export interface InciMaster {
  id: string;
  inci_name: string;
  cas_number: string | null;
  noael: string | null;
  function: string | null;
  reference: string | null;
  organization_id: string;
}

export interface Material {
  id: string;
  material_code: string;
  tradename: string;
  supplier_id: string | null;
  origin: string | null;
  noc: string | null;
  item_id: string | null;
  organization_id: string;
}

export interface MaterialInci {
  id: string;
  material_id: string;
  inci_master_id: string | null;
  inci_name: string;
  percentage: number;
}

export type ItemKategori = "Bahan Baku" | "Kemasan";

export interface Item {
  id: string;
  kode: string;
  nama: string;
  kategori: ItemKategori;
  satuan: string;
  stok_minimum: number;
  aktif: boolean;
  organization_id: string;
}