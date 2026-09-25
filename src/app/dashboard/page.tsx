"use client";

import { useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { useAuthGuard } from "@/lib/use-auth-guard";

type Service = {
  id: string;
  title: string;
  description: string;
  price: number;
  sellerName: string;
  sellerId: string;
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);
}

export default function DashboardPage() {
  const { me, checking } = useAuthGuard();
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", price: "" });
  const [formBusy, setFormBusy] = useState(false);

  const loadServices = useCallback(async () => {
    const res = await fetch("/api/services");
    if (res.ok) setServices((await res.json()).services);
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  async function handleOrder(serviceId: string) {
    setError(null);
    setBusyId(serviceId);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal memesan");
        return;
      }
      window.location.href = "/orders";
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreateService(event: React.FormEvent) {
    event.preventDefault();
    setFormBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, price: Number(form.price) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Gagal membuka jasa");
        return;
      }
      setForm({ title: "", description: "", price: "" });
      setShowForm(false);
      await loadServices();
    } finally {
      setFormBusy(false);
    }
  }

  if (checking) return <p className="p-10 text-center text-slate-500">Memuat...</p>;
  if (!me) return null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Nav name={me.name} balance={me.balance} />

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-700">Jelajahi Jasa</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showForm ? "Batal" : "+ Buka Jasa"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreateService} className="mb-8 rounded-xl border border-slate-200 bg-white p-5">
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Judul jasa"
            required
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Deskripsi"
            required
            rows={3}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <input
            type="number"
            min={1}
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            placeholder="Harga (Rp)"
            required
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={formBusy}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {formBusy ? "Menyimpan..." : "Buka Jasa"}
          </button>
        </form>
      )}

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      <div className="flex flex-col gap-4">
        {services.map((service) => (
          <div key={service.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">{service.title}</h3>
              <span className="font-semibold text-brand-700">{formatRupiah(service.price)}</span>
            </div>
            <p className="mb-3 text-sm text-slate-500">{service.description}</p>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>oleh {service.sellerName}</span>
              {service.sellerId !== me.id && (
                <button
                  onClick={() => handleOrder(service.id)}
                  disabled={busyId === service.id}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {busyId === service.id ? "Memproses..." : "Pesan & Bayar"}
                </button>
              )}
            </div>
          </div>
        ))}
        {services.length === 0 && <p className="text-center text-sm text-slate-400">Belum ada jasa.</p>}
      </div>
    </main>
  );
}
