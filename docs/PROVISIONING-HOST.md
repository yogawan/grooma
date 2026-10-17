# Provisioning Deployment HOST Baru

Grooma di-deploy **satu instance per HOST (satu bisnis barbershop)** — isolasi antar bisnis terjadi di level infrastruktur, bukan di level query (PRD §3.5). Dokumen ini adalah checklist untuk menambahkan satu bisnis baru.

---

## 0. Tentukan Mode Pembayaran Lebih Dulu

Satu pertanyaan ini menentukan sisa prosesnya (PRD §9.6):

| | HOST ingin QRIS diproses lewat sistem kita | HOST pakai QRIS miliknya sendiri |
|---|---|---|
| `PAYMENT_INTEGRATION_MODE` | `MANAGED` | `SELF_RECORDED` |
| Akun Midtrans baru | **Perlu dibuat** (milik HOST) | **Tidak perlu** |
| `MIDTRANS_*` env | Wajib diisi | Dikosongkan |
| `paymentStatus` awal transaksi QRIS | `PENDING` → `PAID` lewat webhook | langsung `PAID` |
| Peran Grooma atas dana | Tidak pernah memegang dana — settle langsung ke rekening HOST | Tidak pernah menyentuh dana |

---

## 1. Siapkan Database

Buat database/cluster baru dan catat connection string-nya sebagai `MONGODB_URI`. Satu database per bisnis — jangan pernah membagi database antar HOST, karena tidak ada tenant boundary di dalam kode (PRD §3.5).

## 2. Siapkan Akun Midtrans — Hanya Jika `MANAGED`

Daftarkan akun Midtrans **atas nama bisnis HOST tersebut**, lalu ambil Server Key & Client Key-nya. Settlement akan masuk ke saldo dan rekening bank HOST, bukan ke Grooma.

Lewati langkah ini sepenuhnya untuk `SELF_RECORDED`.

> **Akun Midtrans di langkah ini hanya untuk transaksi POS.** Tagihan subscription HOST ke Grooma selalu memakai akun Midtrans milik Grooma sendiri (§23.1/§23.8, kredensial `GROOMA_BILLING_MIDTRANS_*` di langkah 3), terlepas dari mode di atas — dua akun yang sepenuhnya terpisah, jangan dicampur.

## 3. Buat Deployment & Set Environment Variables

Lihat `.env.example` untuk daftar lengkap. Yang berbeda per deployment:

```bash
MONGODB_URI=...                      # unik per bisnis (langkah 1)
SESSION_SECRET=...                   # unik per deployment, mis. `openssl rand -hex 32`
APPLICATION_ENVIRONMENT=production
INTERNAL_CRON_SECRET=...             # unik per deployment

TRUSTED_PROXY_HOP_COUNT=1            # WAJIB di produksi — lihat catatan di bawah
REQUIRE_IDEMPOTENCY_KEY=false        # jadikan true setelah app mobile kirim header

PAYMENT_INTEGRATION_MODE=MANAGED     # atau SELF_RECORDED (langkah 0)

# Hanya untuk MANAGED — kosongkan seluruhnya untuk SELF_RECORDED:
MIDTRANS_SERVER_KEY=...
MIDTRANS_CLIENT_KEY=...
MIDTRANS_IS_PRODUCTION=true

# WAJIB di SEMUA deployment, termasuk SELF_RECORDED — akun Midtrans Grooma
# sendiri untuk menagih subscription HOST, sepenuhnya terpisah dari akun di
# atas (§23.1/§23.8). Nilainya SAMA di seluruh fleet deployment (satu akun
# Grooma), bukan per-HOST seperti MIDTRANS_* di atas — minta ke tim internal,
# jangan buat akun baru per deployment.
GROOMA_BILLING_MIDTRANS_SERVER_KEY=...
GROOMA_BILLING_MIDTRANS_CLIENT_KEY=...
GROOMA_BILLING_MIDTRANS_IS_PRODUCTION=true
```

**Jangan menyalin `SESSION_SECRET` atau `INTERNAL_CRON_SECRET` antar deployment.** Secret yang sama di banyak instance berarti satu kebocoran membuka semuanya. `GROOMA_BILLING_MIDTRANS_*` adalah pengecualian yang disengaja — nilai itu **harus** sama di semua deployment.

Aplikasi sengaja **gagal start** bila `PAYMENT_INTEGRATION_MODE=MANAGED` tetapi kredensial Midtrans HOST kosong, **atau** bila `GROOMA_BILLING_MIDTRANS_SERVER_KEY`/`CLIENT_KEY` kosong apa pun mode-nya (`lib/paymentConfig.ts`) — kesalahan konfigurasi muncul saat deploy, bukan saat kasir pertama kali melayani pelanggan atau saat invoice subscription pertama gagal dibuat.

### `TRUSTED_PROXY_HOP_COUNT` — wajib dan tidak boleh ditebak

Nilai ini adalah **jumlah proxy di depan deployment yang menambahkan entri ke `X-Forwarded-For`**. Rate limit login memakainya untuk menentukan alamat klien yang sebenarnya; salah nilai berarti throttle login bisa dilewati dengan mengirim header palsu.

> **Status keputusan (Okt 2026): nilainya sengaja belum ditetapkan**, menunggu platform hosting diputuskan. Implementasinya tidak diubah dan tidak ada nilai yang ditebak. **Tentukan nilai ini sebelum deployment pada lingkungan yang mensyaratkannya** — produksi akan gagal start tanpanya.

| Topologi | Nilai |
|---|---|
| `next dev` / Node langsung tanpa proxy | `0` |
| Di belakang satu platform/CDN/nginx (umum) | `1` |
| Di belakang CDN **dan** reverse proxy sendiri | `2` |

Aplikasi **gagal start** di produksi bila variabel ini tidak di-set — disengaja, karena tidak ada nilai aman yang bisa diasumsikan. Pada `0`, `X-Forwarded-For` diabaikan seluruhnya dan rate limit login memakai satu bucket bersama (aman dari spoofing, tetapi tidak membedakan klien).

**Cara memverifikasi:** setelah deploy, kirim request dengan `X-Forwarded-For: 1.2.3.4` palsu. Dengan nilai yang benar, alamat itu harus diabaikan — bukan dipakai sebagai identitas rate limit.

## 4. Seed Plan, lalu Seed Akun Awal

**Urutan ini penting.** `seed:host` sekarang sekaligus membuat `Subscription` awal HOST (§23.7), yang perlu mereferensikan `SubscriptionPlan` yang sudah ada — jalankan `seed:plan` dulu:

```bash
npm run seed:plan
```

Idempoten dan tanpa env var wajib — membuat satu `SubscriptionPlan` default (Rp50.000/bulan, PRD §23.1) kalau belum ada satu pun. Skip langkah ini kalau database sudah punya plan (mis. deployment lama yang sedang di-upgrade).

Database baru masih kosong, dan `POST /users` butuh HOST yang sudah login — jadi HOST pertama **harus** lewat script:

```bash
SEED_HOST_USERNAME=owner \
SEED_HOST_PASSWORD='<password kuat, unik per deployment>' \
SEED_HOST_NAME='Nama Pemilik' \
  npm run seed:host
```

Script ini idempoten — aman dijalankan ulang, dan tidak akan menimpa password akun yang sudah ada. Ia menolak berjalan tanpa env var, tanpa fallback hardcoded, dan juga **menolak** bila deployment ini sudah memiliki akun HOST (satu deployment = satu HOST, PRD §3.5). Kalau dijalankan ulang terhadap HOST yang sudah ada tapi belum punya `Subscription` (mis. deployment lama), ia akan membuatkan satu — aman untuk deployment yang di-upgrade dari versi sebelum §23.7.

> **Tidak ada langkah seed admin di sini.** Backend ini hanya mengenal role `HOST` dan `AGENT`. Akun `GROOMA_ADMIN` dibuat oleh backend admin terpisah yang memakai database yang sama, jadi tidak ada `seed:admin` pada provisioning deployment — lihat §3.6 PRD. Backend ini pun tidak akan menerbitkan session untuk akun admin walaupun barisnya ada di database yang sama.

**Subscription awal dibuat otomatis oleh `seed:host`** (§23.7): `status: ACTIVE`, `currentPeriodEnd` sebulan dari tanggal seed — trial gratis sebulan sebelum tagihan pertama. Tidak ada `SubscriptionInvoice` yang dibuat saat ini; cron billing yang sudah ada (langkah terakhir di checklist) otomatis menerbitkan tagihan pertama tepat di tanggal yang sama bulan berikutnya begitu `currentPeriodEnd` tercapai. Status non-paying eksplisit (`PAST_DUE`/`EXPIRED`/`CANCELLED`) memicu HTTP 402 (PRD §23.4) — `ACTIVE` berarti akses penuh tanpa batasan.

Sisanya (cabang, AGENT, layanan) dibuat normal lewat API oleh akun HOST tadi.

## 5. Build Ulang Aplikasi Mobile

Arahkan base URL aplikasi mobile ke endpoint deployment ini, lalu build dan distribusikan. Satu build aplikasi hanya melayani satu HOST.

---

## Checklist Ringkas

- [ ] Mode pembayaran ditentukan (`MANAGED` / `SELF_RECORDED`)
- [ ] Database baru dibuat, `MONGODB_URI` dicatat
- [ ] Akun Midtrans HOST dibuat — *skip bila `SELF_RECORDED`*
- [ ] Deployment dibuat; seluruh env var di-set (termasuk `GROOMA_BILLING_MIDTRANS_*`, wajib di semua mode); `SESSION_SECRET` & `INTERNAL_CRON_SECRET` unik
- [ ] Deployment berhasil start (bila gagal, cek pasangan mode ↔ kredensial Midtrans HOST, dan `GROOMA_BILLING_MIDTRANS_*`)
- [ ] `npm run seed:plan` dijalankan
- [ ] HOST pertama di-seed lewat `npm run seed:host`
- [ ] Login HOST diuji; satu cabang dibuat
- [ ] Satu transaksi uji dibuat — `MANAGED`: QRIS muncul & webhook masuk; `SELF_RECORDED`: transaksi langsung `PAID`
- [ ] Scheduled job billing diarahkan ke `/api/v1/internal/subscriptions/run-billing-cycle` deployment ini
- [ ] Aplikasi mobile di-build dengan base URL baru & diuji

---

## Catatan

**Mengubah mode pembayaran setelah berjalan** berarti mengubah env var lalu redeploy — tidak ada endpoint untuk itu (PRD §9.6). Bila berpindah dari `MANAGED` ke `SELF_RECORDED`, pastikan tidak ada transaksi `paymentStatus: PENDING` yang masih menunggu webhook; transaksi tersebut tidak akan pernah ter-settle setelah mode berubah.

**Dashboard admin lintas-HOST tidak ada di dalam deployment manapun.** Setiap database hanya memuat satu `Subscription`, sehingga pandangan platform-wide harus berada di aplikasi web admin terpusat yang mengagregasi banyak deployment (PRD §23.1).
