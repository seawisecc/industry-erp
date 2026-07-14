import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import UserForm from "../UserForm";

export default function NewUserPage() {
  return (
    <div className="max-w-2xl">
      <Link
        href="/users"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Pengguna
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Tambah Pengguna
      </h1>
      <p className="text-muted text-sm mb-6">
        User baru langsung bisa login dengan email &amp; password ini.
      </p>

      <UserForm />
    </div>
  );
}
