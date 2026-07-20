"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IdCard,
  DatabaseZap,
  Users,
  Boxes,
  FlaskConical,
  BookText,
  ClipboardList,
  PackageCheck,
  Banknote,
  Package,
  LayoutPanelLeft,
  PackageOpen,
  Contact,
  Store,
  FileText,
  ShoppingCart,
  CalendarRange,
  Wrench,
  PenLine,
  ChevronRight,
  LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "/settings": IdCard,
  "/document-signing": PenLine,
  "/data-migration": DatabaseZap,
  "/users": Users,
  "/items": Boxes,
  "/materials": FlaskConical,
  "/inci": BookText,
  "/purchase-orders": ClipboardList,
  "/receivings": PackageCheck,
  "/payments": Banknote,
  "/ppic": CalendarRange,
  "/products": Package,
  "/services": Wrench,
  "/production": LayoutPanelLeft,
  "/finished-goods": PackageOpen,
  "/clients": Contact,
  "/consignments": Store,
  "/sales-invoices": FileText,
  "/pos": ShoppingCart,
  "/sales-payments": Banknote,
};

export type SettingsCard = {
  href: string;
  title: string;
  subtitle: string;
};

export default function SettingsNav({ cards }: { cards: SettingsCard[] }) {
  const pathname = usePathname();

  return (
    <div className="glass rounded-2xl p-2.5 flex flex-col gap-1.5">
      {cards.map((card) => {
        const Icon = ICONS[card.href] || IdCard;
        const active = pathname?.startsWith(card.href);
        return (
          <Link
            key={card.href}
            href={card.href}
            className={`rounded-xl px-3 py-3 flex items-center gap-3 transition-all border ${
              active
                ? "bg-white/75 border-botanical-700/30 shadow-sm"
                : "border-transparent hover:bg-white/50"
            }`}
          >
            <div
              className={`rounded-lg p-2 flex-shrink-0 transition-colors ${
                active
                  ? "bg-botanical-700 text-white"
                  : "bg-botanical-100 text-botanical-700"
              }`}
            >
              <Icon size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={`text-[13px] font-semibold ${
                  active ? "text-botanical-700" : "text-ink"
                }`}
              >
                {card.title}
              </div>
              <div className="text-[11px] text-muted truncate">{card.subtitle}</div>
            </div>
            <ChevronRight
              size={14}
              className={`flex-shrink-0 ${
                active ? "text-botanical-700" : "text-muted/50"
              }`}
            />
          </Link>
        );
      })}
    </div>
  );
}
