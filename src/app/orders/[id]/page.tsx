"use client";

import { useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { useAuthGuard } from "@/lib/use-auth-guard";

type AuditLog = {
  id: string;
  fromStatus: string;
  toStatus: string;
  actorRole: string;
  note: string | null;
  createdAt: string;
};

type OrderDetail = {
  id: string;
  status: string;
  amount: number;
  createdAt: string;
  deliveredAt: string | null;
  completedAt: string | null;
  autoReleaseAt: string | null;
  service: { title: string; description: string };
  buyer: { name: string };
  seller: { name: string };
  auditLogs: AuditLog[];
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

const roleLabel: Record<string, string> = { BUYER: "Pembeli", SELLER: "Penjual", SYSTEM: "Sistem (otomatis)" };

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const { me, checking } = useAuthGuard();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    const res = await fetch(`/api/orders/${params.id}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Gagal memuat order");
      return;
    }
    setOrder(data.order);
  }, [params.id]);

  useEffect(() => {
    if (me) loadOrder();
  }, [me, loadOrder]);

  if (checking) return <p className="p-10 text-center text-slate-500">Memuat...</p>;
  if (!me) return null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Nav name={me.name} balance={me.balance} />

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {order && (
        <>
          <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
            <h1 className="text-xl font-bold text-brand-700">{order.service.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{order.service.description}</p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Jumlah (Escrow)</p>
                <p className="font-semibold">{formatRupiah(order.amount)}</p>
              </div>
              <div>
                <p className="text-slate-500">Status</p>
                <p className="font-semibold">{order.status}</p>
              </div>
              <div>
                <p className="text-slate-500">Pembeli</p>
                <p className="font-semibold">{order.buyer.name}</p>
              </div>
              <div>
                <p className="text-slate-500">Penjual</p>
                <p className="font-semibold">{order.seller.name}</p>
              </div>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-100 px-6 py-4 font-semibold text-slate-800">
              Riwayat Perubahan Status (Audit Log)
            </h2>
            <ol className="flex flex-col gap-4 p-6">
              {order.auditLogs.map((log) => (
                <li key={log.id} className="flex gap-3 text-sm">
                  <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-brand-500" />
                  <div>
                    <p className="font-medium text-slate-700">
                      {log.fromStatus} → {log.toStatus}{" "}
                      <span className="font-normal text-slate-400">oleh {roleLabel[log.actorRole]}</span>
                    </p>
                    {log.note && <p className="text-slate-500">{log.note}</p>}
                    <p className="text-xs text-slate-400">
                      {new Date(log.createdAt).toLocaleString("id-ID")}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </main>
  );
}
