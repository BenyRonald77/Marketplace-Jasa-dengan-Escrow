# PRD — Marketplace Jasa dengan Escrow

| | |
|---|---|
| **Produk** | Marketplace Jasa dengan Escrow |
| **Versi** | 1.0 |
| **Tanggal** | 25 September 2026 |
| **Pemilik Produk** | BenyRonald77 |

---

## 1. Tujuan

Studi kasus **system design** untuk marketplace dua sisi (pembeli-penjual
jasa) dengan mekanisme **escrow**: dana pembeli ditahan platform sampai
pekerjaan dinyatakan selesai, dikelola lewat **state machine order** yang
eksplisit, **batas waktu auto-release**, dan **audit log** yang mencatat
setiap perubahan status untuk keperluan sengketa/audit.

## 2. State Machine Order

```
        bayar             seller mulai        seller kirim         buyer terima
PAID ───────────────▶ IN_PROGRESS ───────────▶ DELIVERED ───────────▶ COMPLETED
                                                    │                  (dana cair
                                                    │                   ke seller)
                                                    ▼
                                                DISPUTED
                                          (buyer keberatan,
                                           butuh penyelesaian manual)
```

- Transisi `DELIVERED → COMPLETED` bisa dipicu **buyer** (klik "Terima
  Pekerjaan") **atau otomatis oleh sistem** bila buyer tidak merespons
  dalam N hari sejak `deliveredAt` (**auto-release**, default 3 hari).
- Transisi `DELIVERED → DISPUTED` hanya bisa dipicu buyer, dan
  **membatalkan timer auto-release** — dana tetap tertahan sampai ada
  penyelesaian manual (di luar lingkup MVP: penyelesaian sengketa oleh
  admin/mediator).
- Setiap transisi yang tidak ada di diagram di atas ditolak sistem
  (mis. `PAID → COMPLETED` langsung, atau transisi oleh aktor yang tidak
  berhak — buyer tidak bisa memicu `IN_PROGRESS → DELIVERED`, dst).

## 3. Fitur MVP

1. Penjual membuka jasa (`Service`): judul, deskripsi, harga.
2. Pembeli memesan & membayar jasa → dana didebit dari saldo pembeli,
   **ditahan di escrow** (status order `PAID`), belum masuk ke saldo penjual.
3. Penjual menandai `IN_PROGRESS` lalu `DELIVERED` (mengirim hasil kerja).
4. Pembeli menandai `COMPLETED` (dana cair ke penjual) atau `DISPUTED`.
5. **Auto-release**: job terjadwal memindai order `DELIVERED` yang sudah
   melewati `autoReleaseAt` dan belum di-dispute, lalu otomatis
   menyelesaikannya (dana cair ke penjual) atas nama sistem.
6. **Audit log**: setiap perubahan status order tercatat (status lama, status
   baru, aktor — pembeli/penjual/sistem, waktu, catatan opsional), bisa
   dilihat di halaman detail order.

## 4. Kebutuhan Fungsional

| ID | Kebutuhan | Prioritas |
|---|---|---|
| FR-1 | Sistem hanya mengizinkan transisi status sesuai diagram state machine; transisi lain ditolak | Must |
| FR-2 | Hanya aktor yang berhak (pembeli/penjual/sistem) yang bisa memicu transisi tertentu | Must |
| FR-3 | Dana pembeli didebit saat order dibuat (`PAID`) dan baru masuk ke saldo penjual saat order `COMPLETED` — tidak pernah sebelum itu | Must |
| FR-4 | Setiap perubahan status ditulis ke `OrderAuditLog`, tidak bisa diubah/dihapus | Must |
| FR-5 | Order `DELIVERED` yang melewati `autoReleaseAt` tanpa di-dispute otomatis menjadi `COMPLETED` lewat job terjadwal | Must |
| FR-6 | Order berstatus `DISPUTED` tidak pernah ikut auto-release | Must |

## 5. Kebutuhan Non-Fungsional

| Kategori | Kebutuhan |
|---|---|
| **Konsistensi** | Perubahan status order + pencairan dana (bila ada) + penulisan audit log terjadi dalam satu transaksi database |
| **Auditability** | `OrderAuditLog` bersifat append-only; riwayat lengkap perubahan status selalu bisa direkonstruksi |
| **Idempotensi job** | Auto-release job aman dijalankan berkali-kali — hanya memproses order yang benar-benar masih `DELIVERED` dan sudah lewat tenggat |

## 6. Arsitektur Teknis

- Next.js (TypeScript, App Router) + Prisma ORM (SQLite dev / PostgreSQL production).
- Entitas: `User` (punya `balance`, bisa berperan pembeli maupun penjual), `Service`, `Order`, `OrderAuditLog`.
- Auto-release: endpoint HTTP terproteksi token untuk scheduler eksternal + script CLI (pola sama dengan cron project lain).

## 7. Kriteria Penerimaan

- [ ] Memesan jasa mendebit saldo pembeli dan TIDAK menambah saldo penjual (dana tertahan).
- [ ] Transisi status ilegal (mis. buyer mencoba `IN_PROGRESS → DELIVERED`) ditolak dengan pesan jelas.
- [ ] `COMPLETED` (baik manual maupun auto-release) menambah saldo penjual tepat sebesar harga order.
- [ ] Order yang di-`DISPUTED` tidak pernah ikut ter-auto-release.
- [ ] Riwayat audit log order menampilkan seluruh transisi status secara berurutan.

## 8. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Auto-release job berjalan dobel (dua scheduler tumpang tindih) | Query job hanya memproses order dengan status persis `DELIVERED`; setelah diproses status berubah jadi `COMPLETED` sehingga run berikutnya tidak menemukannya lagi (idempotent by construction) |
| Buyer mencairkan dana untuk pekerjaan yang belum benar-benar selesai | Di luar kendali sistem murni — dimitigasi lewat fitur `DISPUTED` agar buyer punya jalur keberatan sebelum dana cair |
| Race condition buyer & auto-release job memproses order yang sama bersamaan | Transisi status memakai `UPDATE ... WHERE status = 'DELIVERED'` (atomik bersyarat) — yang menang hanya salah satu, yang kalah mendapati order sudah berubah status |
