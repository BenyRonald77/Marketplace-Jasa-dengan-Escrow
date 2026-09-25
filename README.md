# Marketplace Jasa dengan Escrow

Studi kasus system design: marketplace dua sisi (pembeli-penjual jasa)
dengan **dana escrow** yang ditahan sampai pekerjaan selesai, dikelola
lewat **state machine order** eksplisit, **auto-release** berbasis tenggat
waktu, dan **audit log** untuk setiap perubahan status.

Lihat dokumen perencanaan lengkap di [`docs/PRD.md`](./docs/PRD.md).

## State Machine

```
        bayar             seller mulai        seller kirim         buyer terima
PAID ───────────────▶ IN_PROGRESS ───────────▶ DELIVERED ───────────▶ COMPLETED
                                                    │                  (dana cair)
                                                    ▼
                                                DISPUTED  (dana tetap tertahan)
```

`DELIVERED → COMPLETED` juga bisa dipicu otomatis oleh job **auto-release**
bila buyer tidak merespons dalam N hari (default 3, atur lewat
`AUTO_RELEASE_DAYS`). Order yang sudah `DISPUTED` tidak pernah ikut
auto-release, meski `autoReleaseAt`-nya sudah lewat.

Setiap transisi divalidasi lewat `ALLOWED_TRANSITIONS` di
[`src/lib/constants.ts`](./src/lib/constants.ts) — transisi di luar
diagram di atas, atau dipicu aktor yang tidak berhak, ditolak.

## Fitur Utama

- Penjual membuka jasa; pembeli memesan & membayar — dana langsung tertahan di escrow (saldo penjual **tidak** bertambah saat ini).
- Penjual menandai `IN_PROGRESS` → `DELIVERED`.
- Pembeli menandai `COMPLETED` (dana cair) atau `DISPUTED` (dana beku, butuh penyelesaian manual).
- Job auto-release memindai order `DELIVERED` yang kadaluarsa dan menyelesaikannya otomatis.
- Setiap perubahan status tercatat di `OrderAuditLog` (append-only) — bisa dilihat di halaman detail order.

## Menjalankan Secara Lokal

```bash
npm install
cp .env.example .env
npm run prisma:migrate   # migrasi + seed (1 penjual, 2 pembeli, 2 jasa)
npm run dev
```

Buka `http://localhost:3000/login`. Akun demo:
- Penjual: `dewi@jasa.test` / `dewi123`
- Pembeli: `eko@jasa.test` / `eko123` (saldo Rp2.000.000)
- Pembeli: `fajar@jasa.test` / `fajar123` (saldo Rp1.000.000)

## Verifikasi yang Sudah Dilakukan Saat Pengembangan

- Memesan jasa mendebit saldo pembeli; saldo penjual **tetap 0** sampai order `COMPLETED`.
- Transisi ilegal ditolak: buyer mencoba memulai pengerjaan, atau seller mencoba lompat `PAID → DELIVERED` langsung.
- `COMPLETED` (manual maupun auto-release) mencairkan dana tepat sebesar harga order ke saldo penjual.
- Order `DISPUTED` **tidak pernah** ikut ter-auto-release walau tenggat waktunya sudah lewat (diuji dengan membackdate `autoReleaseAt`).
- Audit log mencatat seluruh riwayat transisi secara berurutan dan lengkap.

## Job Auto-Release

```bash
npm run job:auto-release
```

atau lewat endpoint HTTP terproteksi token untuk scheduler eksternal
(idempotent — order yang sudah `COMPLETED` tidak akan diproses ulang):

```bash
curl -X POST https://domain-anda.com/api/cron/auto-release \
  -H "x-cron-secret: <isi sesuai CRON_SECRET di .env>"
```

Contoh workflow terjadwal: [`.github/workflows/auto-release.yml`](./.github/workflows/auto-release.yml) (jalan tiap jam).

## Struktur Proyek

```
docs/PRD.md                    Dokumen PRD & diagram state machine
prisma/schema.prisma            Skema (user, service, order, audit log)
scripts/auto-release.ts         Script CLI job auto-release
src/lib/order-service.ts        Inti: state machine, escrow hold/release, audit log
src/app/dashboard                Jelajahi & buka jasa
src/app/orders, orders/[id]      Kelola order & lihat audit log
```

## Deployment

1. Set `DATABASE_URL` ke PostgreSQL untuk production (ubah `provider` di `prisma/schema.prisma`), `JWT_SECRET`, `CRON_SECRET`.
2. Build: `npm run build`, jalankan: `npm start`.
3. Aktifkan scheduler eksternal untuk memanggil `/api/cron/auto-release` secara berkala.

## Catatan Keamanan

- Password di-hash dengan bcrypt.
- Setiap transisi status memvalidasi aktor yang berhak (mis. hanya seller yang bisa `IN_PROGRESS`/`DELIVERED`, hanya buyer yang bisa `COMPLETED`/`DISPUTED`) di level service, bukan hanya di UI.
- Update saldo & status order memakai `UPDATE ... WHERE status = '...'` atomik bersyarat untuk mencegah race condition (mis. buyer & job auto-release memproses order yang sama bersamaan).
- `OrderAuditLog` tidak punya endpoint update/delete — riwayat status selalu utuh untuk keperluan audit/sengketa.
