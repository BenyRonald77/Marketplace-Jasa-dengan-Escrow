"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { useAuthGuard } from "@/lib/use-auth-guard";

type Order = {
  id: string;
  serviceTitle: string;
  amount: number;
  status: "PAID" | "IN_PROGRESS" | "DELIVERED" | "COMPLETED" | "DISPUTED";
  buyerName: string;
  sellerName: string;
  isBuyer: boolean;
  isSeller: boolean;
  autoReleaseAt: string | null;
  createdAt: string;
};

const statusLabel: Record<Order["status"], string> = {
  PAID: "Dibayar (Escrow)",
  IN_PROGRESS: "Dikerjakan",
  DELIVERED: "Dikirim",
  COMPLETED: "Selesai",
  DISPUTED: "Sengketa",
};

const statusStyle: Record<Order["status"], string> = {
  PAID: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-sky-100 text-sky-700",
  DELIVERED: "bg-brand-100 text-brand-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  DISPUTED: "bg-rose-100 text-rose-700",
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

export default function OrdersPage() {
  const { me, checking } = useAuthGuard();
  const [orders, setOrders] = useState<Order[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    const res = await fetch("/api/orders");
    if (res.ok) setOrders((await res.json()).orders);
  }, []);

  useEffect(() => {
    if (me) loadOrders();
  }, [me, loadOrders]);

  async function handleAction(orderId: string, action: string) {
    setError(null);
    setBusyId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Aksi gagal");
        return;
      }
      await loadOrders();
    } finally {
      setBusyId(null);
    }
  }

  if (checking) return <p className="p-10 text-center text-slate-500">Memuat...</p>;
  if (!me) return null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Nav name={me.name} balance={me.balance} />
      <h1 className="mb-6 text-2xl font-bold text-brand-700">Order Saya</h1>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <div className="flex flex-col gap-4">
        {orders.map((order) => (
          <div key={order.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-2 flex items-center justify-between">
              <Link href={`/orders/${order.id}`} className="font-semibold text-slate-800 hover:underline">
                {order.serviceTitle}
              </Link>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[order.status]}`}>
                {statusLabel[order.status]}
              </span>
            </div>
            <p className="mb-3 text-sm text-slate-500">
              {formatRupiah(order.amount)} ·{" "}
              {order.isBuyer ? `Penjual: ${order.sellerName}` : `Pembeli: ${order.buyerName}`}
              {order.status === "DELIVERED" && order.autoReleaseAt && (
                <> · Auto-release: {new Date(order.autoReleaseAt).toLocaleString("id-ID")}</>
              )}
            </p>
            <div className="flex gap-2">
              {order.isSeller && order.status === "PAID" && (
                <button
                  onClick={() => handleAction(order.id, "IN_PROGRESS")}
                  disabled={busyId === order.id}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Mulai Kerjakan
                </button>
              )}
              {order.isSeller && order.status === "IN_PROGRESS" && (
                <button
                  onClick={() => handleAction(order.id, "DELIVERED")}
                  disabled={busyId === order.id}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  Kirim Hasil
                </button>
              )}
              {order.isBuyer && order.status === "DELIVERED" && (
                <>
                  <button
                    onClick={() => handleAction(order.id, "COMPLETED")}
                    disabled={busyId === order.id}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Terima & Cairkan Dana
                  </button>
                  <button
                    onClick={() => handleAction(order.id, "DISPUTED")}
                    disabled={busyId === order.id}
                    className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Ajukan Sengketa
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {orders.length === 0 && <p className="text-center text-sm text-slate-400">Belum ada order.</p>}
      </div>
    </main>
  );
}
