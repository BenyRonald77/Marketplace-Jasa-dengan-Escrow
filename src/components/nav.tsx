"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function Nav({ name, balance }: { name: string; balance: number }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(balance);

  return (
    <nav className="mb-8 flex items-center justify-between border-b border-slate-200 pb-4">
      <div className="flex gap-4">
        <Link
          href="/dashboard"
          className={`text-sm font-medium ${pathname === "/dashboard" ? "text-brand-700" : "text-slate-500 hover:text-brand-600"}`}
        >
          Jelajahi Jasa
        </Link>
        <Link
          href="/orders"
          className={`text-sm font-medium ${pathname === "/orders" ? "text-brand-700" : "text-slate-500 hover:text-brand-600"}`}
        >
          Order Saya
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-500">
          {name} · <span className="font-semibold text-brand-700">{rupiah}</span>
        </span>
        <button onClick={handleLogout} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          Keluar
        </button>
      </div>
    </nav>
  );
}
