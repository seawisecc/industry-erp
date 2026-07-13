"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Check } from "lucide-react";
import type { Organization } from "@/lib/types";

export default function OrgSwitcher({
  organizations,
  currentOrgId,
}: {
  organizations: Organization[];
  currentOrgId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const current = organizations.find((o) => o.id === currentOrgId);

  async function handleSelect(orgId: string) {
    setLoading(true);
    await fetch("/api/switch-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId }),
    });
    setOpen(false);
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="relative px-2 mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-[12.5px] font-medium hover:bg-white/15 transition-all"
      >
        <span className="truncate">{current?.nama || "Pilih Perusahaan"}</span>
        <ChevronsUpDown size={14} className="flex-shrink-0 opacity-70" />
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-full mt-1.5 glass rounded-lg overflow-hidden z-50 max-h-64 overflow-y-auto">
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => handleSelect(org.id)}
              disabled={loading}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-[13px] text-ink hover:bg-botanical-100 text-left"
            >
              <span className="truncate">{org.nama}</span>
              {org.id === currentOrgId && <Check size={14} className="text-botanical-700 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}