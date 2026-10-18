# Integrasi Mobile (Flutter) — Grooma API — Tab Kelola (HOST)

> Dokumen ini mencakup **4 sub-halaman di tab Kelola** (lihat `docs/MOBILE-BOTTOM-NAVBAR.md`): **Cabang**, **Karyawan**, **Layanan**, dan **Subscription & Billing**. Base URL, model sesi cookie, dan setup `dio` **tidak diulang di sini** — lihat `docs/AUTH-MOBILE-API-INTEGRATION.md` bagian 1–2.

---

## 0. Ringkasan & Policy

| Sub-halaman | Endpoint | Role |
|---|---|---|
| **Cabang** | `/api/v1/branches*` | Baca: HOST + AGENT · Tulis: **HOST only** |
| **Karyawan** | `/api/v1/users*` | **HOST only** (semuanya) |
| **Layanan** | `/api/v1/services*` | Baca: HOST + AGENT · Tulis: **HOST only** |
| **Subscription** | `/api/v1/subscription*` | **HOST only** (semuanya, read-only) |

### Subscription Gating — Beda-beda per Sub-halaman

| Sub-halaman | Policy | Artinya saat langganan HOST nunggak |
|---|---|---|
| Cabang, Karyawan | `ENFORCED` | HOST **dan** AGENT sama-sama `402` |
| Layanan (baca) | `EXEMPT_AGENT` | AGENT tetap bisa baca daftar layanan (butuh untuk input transaksi); HOST `402` |
| Layanan (tulis) | `ENFORCED` | HOST `402` |
| **Subscription** | `EXEMPT_ALL` | **Selalu bisa diakses** — ini justru satu-satunya pintu HOST untuk bayar dan memulihkan akses |

> **Konsekuensi untuk UI:** saat langganan lapsed, dari seluruh tab Kelola **hanya sub-halaman Subscription yang masih hidup**. Tiga lainnya balas `402`. Arahkan HOST langsung ke sana lewat layar blocker, jangan biarkan menabrak 402 satu per satu (lihat `MOBILE-BOTTOM-NAVBAR.md` bagian state terkunci).

### ⚠️ Tiga Ketidakkonsistenan Lintas Sub-modul yang Gampang Bikin Bug

Keempat sub-modul ini ditulis di waktu berbeda dan **tidak seragam**. Tiga hal ini wajib diperhatikan saat bikin model/shared widget:

**1. Endpoint ubah status: ada yang pakai enum string, ada yang boolean.**

| Resource | Body |
|---|---|
| Cabang | `{ "status": "ACTIVE" }` ← enum string |
| Karyawan | `{ "status": "ACTIVE" }` ← enum string |
| Layanan | `{ "isActive": true }` ← **boolean** |
| (Customer, di dokumen lain) | `{ "isActive": true }` ← boolean |

**2. Nama field id: ada yang `_id`, ada yang `id`.**

| Resource | Field id |
|---|---|
| Cabang, Layanan, Subscription, Invoice | `_id` |
| **Karyawan** | **`id`** (plus `branch` jadi `{id, name}`, bukan `{_id, name}`) |

**3. Keempat endpoint list sekarang berpaginasi dengan bentuk yang sama.** *(Berubah 2026-10-19 — sebelumnya Cabang/Karyawan/Layanan mengembalikan seluruh data sekaligus, dan invoice memakai key `pages`.)*

| Resource | Pagination | Search/filter server-side |
|---|---|---|
| Cabang | `page`/`limit` | ❌ tidak ada |
| Karyawan | `page`/`limit` | ❌ tidak ada |
| Layanan | `page`/`limit` | ❌ tidak ada |
| Invoice subscription | `page`/`limit` | ✅ `status` (**sekarang berfungsi**, lihat §4.3) |

Bentuk `pagination`-nya identik di keempatnya dan sama dengan modul lain — `{page, limit, total, totalPages}`. Kontrak lengkapnya **tidak diulang di sini**: lihat `AUTH-MOBILE-API-INTEGRATION.md` §2.1.

> ⚠️ **Ketiga list Cabang/Karyawan/Layanan dulu mengembalikan SELURUH data; sekarang default 20 baris.** Ini memutus perilaku lama tanpa error apa pun — baca `AUTH-MOBILE-API-INTEGRATION.md` §2.1.4 sebelum rilis. Search & filter untuk ketiganya masih harus di sisi client, jadi kalau layar melakukan filter lokal atas hasil fetch, **sekarang ia memfilter 20 baris pertama saja**, bukan seluruh data.
>
> `pages` di invoice masih dikirim berdampingan dengan `totalPages` demi build lama, tapi sudah deprecated — pakai `totalPages`.

---

# 1. Cabang — `/api/v1/branches`

## 1.1. GET /api/v1/branches — List Cabang

### Query Params

| Param | Tipe | Default | Catatan |
|---|---|---|---|
| `page` | `integer` | `1` | |
| `limit` | `integer` | `20` | Maks `100` |

Tidak ada param search/filter. Terurut berdasarkan `name` (dengan tie-breaker `_id`, jadi urutannya stabil antar halaman).

AGENT **boleh** memanggil ini (tidak ada `requireRole`), tapi hanya menerima **satu cabang: miliknya sendiri**. Berguna untuk menampilkan info cabang di halaman Profil AGENT. Untuk AGENT, `pagination` tetap terisi penuh dengan `total: 1` — bentuk response-nya identik dengan HOST, cuma isinya satu baris, jadi tidak perlu jalur parsing khusus per role.

> AGENT yang belum punya cabang ditugaskan (kasus langka) dapat `200` dengan `branches: []` dan `total: 0` — bukan error.

```json
{
  "success": true,
  "data": {
    "branches": [
      {
        "_id": "66ffaa0011223344556677aa",
        "branchCode": "KMG",
        "name": "Cabang Kemang",
        "address": "Jl. Kemang Raya No. 1",
        "phone": "021-7654321",
        "timezone": "Asia/Jakarta",
        "status": "ACTIVE",
        "createdAt": "2026-01-05T04:00:00.000Z",
        "updatedAt": "2026-09-20T07:30:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
  }
}
```

⚠️ **Picker cabang di form tambah/edit karyawan (§2.2) butuh daftar lengkap.** Dengan default 20, bisnis dengan lebih dari 20 cabang akan punya cabang yang tidak bisa dipilih sama sekali. Kirim `limit=100` dan cek `totalPages` sebelum membangun daftar pilihannya.

## 1.2. POST /api/v1/branches — Tambah Cabang

**HOST only.**

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `branchCode` | `string` | **Ya** | 1–32 karakter, **unik**, **tidak bisa diubah setelah dibuat** |
| `name` | `string` | **Ya** | 1–100 karakter |
| `address` | `string` | Tidak | Maks 255 |
| `phone` | `string` | Tidak | Maks 32 |
| `timezone` | `string` | Tidak | Default `"Asia/Jakarta"`. **Harus IANA timezone valid** (mis. `Asia/Makassar`, `Asia/Jayapura`) — string ngawur ditolak `400` |

> `timezone` bukan sekadar kosmetik: dipakai untuk membentuk tanggal pada `transactionCode` (`GRM-YYYYMMDD-XXXXXX`). Cabang di WITA/WIT harus diset benar, atau kode transaksi memakai tanggal yang salah di sekitar tengah malam.

| Status | Kapan |
|---|---|
| `201` | Sukses, body `{branch}` |
| `400` | Validasi gagal / timezone bukan IANA valid |
| `403` | Bukan HOST |
| `409` | `branchCode` sudah dipakai |

## 1.3. GET /api/v1/branches/:id — Detail Cabang

HOST bisa cabang manapun; AGENT **hanya cabangnya sendiri** (`403` untuk cabang lain).

## 1.4. PATCH /api/v1/branches/:id — Ubah Cabang

**HOST only.** Field: `name`, `address`, `phone`, `timezone` (semua optional). **`branchCode` tidak ada di schema** — immutable, dikirim pun ditolak `400`.

## 1.5. PATCH /api/v1/branches/:id/status — Aktif/Nonaktifkan

**HOST only.** Body: `{ "status": "ACTIVE" }` atau `{ "status": "INACTIVE" }` — **enum string, bukan boolean**.

> Efeknya ke operasional: AGENT **tidak bisa membuat transaksi** di cabang yang `INACTIVE` (`422 "Branch is not active."`). Data lama tidak terpengaruh.

---

# 2. Karyawan — `/api/v1/users`

**Seluruh endpoint di bagian ini HOST only** (`403` untuk AGENT).

## 2.1. GET /api/v1/users — List Karyawan

### Query Params

| Param | Tipe | Default | Catatan |
|---|---|---|---|
| `page` | `integer` | `1` | |
| `limit` | `integer` | `20` | Maks `100` |

**Tidak ada search, tidak ada filter role/status** — hanya pagination. Terurut dari yang terbaru dibuat (`createdAt` desc, tie-breaker `_id`).

⚠️ **Konsekuensi gabungan pagination + tanpa search:** pencarian/filter staf tetap harus dilakukan **di sisi Flutter**, tapi sekarang yang tersedia untuk difilter hanya halaman yang sudah di-fetch. Layar "cari karyawan" yang dulu memfilter seluruh daftar sekarang memfilter 20 baris pertama saja. Pilihan: naikkan `limit` ke `100`, atau fetch seluruh halaman di muka (loop sampai `page > totalPages`) sebelum memfilter secara lokal.

> Akun platform internal (`GROOMA_ADMIN`) tidak muncul di list ini, dan `pagination.total` **juga tidak menghitungnya** — `total` konsisten dengan baris yang benar-benar dikembalikan, jadi tidak akan ada selisih yang membingungkan antara `total` dan jumlah baris yang bisa ditelusuri.

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "66ab12cd34ef56ab78cd90aa",
        "username": "budi_agent",
        "name": "Budi Santoso",
        "role": "AGENT",
        "branch": { "id": "66ffaa0011223344556677aa", "name": "Cabang Kemang" },
        "phone": "08123456789",
        "status": "ACTIVE",
        "createdAt": "2026-09-01T10:30:00.000Z",
        "updatedAt": "2026-10-15T14:20:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 12, "totalPages": 1 }
  }
}
```

Perhatikan: `id` (bukan `_id`), dan `branch` berbentuk `{id, name}` — **bentuknya identik dengan response `GET /profile`**, jadi model Dart bisa dipakai bersama (lihat `PROFILE-MOBILE-API-INTEGRATION.md` §1). Ketidakkonsistenan `id` vs `_id` ini **hanya berlaku untuk item di dalam array**; objek `pagination` sendiri bentuknya sama di seluruh backend.

## 2.2. POST /api/v1/users — Tambah Akun Staf

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `username` | `string` | **Ya** | 3–64 karakter, **otomatis di-lowercase server-side**, unik |
| `password` | `string` | **Ya** | 8–128 karakter |
| `name` | `string` | **Ya** | 1–100 karakter |
| `role` | `"HOST"` \| `"AGENT"` | **Ya** | |
| `branch` | `string \| null` | **Tergantung role** | **Wajib diisi kalau `role: "AGENT"`; wajib kosong/null kalau `role: "HOST"`** |
| `phone` | `string` | Tidak | Maks 32 |

⚠️ **Aturan `branch` itu saling-kunci dengan `role` dan ditegakkan di level model:** AGENT tanpa branch ditolak, HOST dengan branch juga ditolak (dua-duanya `400`). Form Flutter harus mengikuti: pilih role dulu → kalau AGENT tampilkan picker cabang (wajib), kalau HOST sembunyikan field cabang sepenuhnya.

| Status | Kapan |
|---|---|
| `201` | Sukses |
| `400` | Validasi gagal, aturan role↔branch dilanggar, atau `branch` menunjuk cabang yang tidak ada |
| `403` | Bukan HOST |
| `409` | `username` sudah dipakai |

## 2.3. GET /api/v1/users/:id — Detail Staf

Akun platform internal (`GROOMA_ADMIN`) **tidak pernah muncul** di list maupun detail — kalau id-nya ditebak sekalipun, balasannya `404`, seolah tidak ada.

## 2.4. PATCH /api/v1/users/:id — Ubah Staf

Field: `name`, `role`, `branch`, `phone` (semua optional).

⚠️ **`username` immutable, dan `password` TIDAK ADA di endpoint ini.**

### ‼️ Belum Ada Fitur Reset Password oleh HOST

Satu-satunya jalur ganti password di seluruh backend adalah `POST /auth/change-password`, yang **mewajibkan user login sendiri dan tahu password lamanya**. Artinya: **kalau AGENT lupa password, HOST TIDAK PUNYA cara apa pun untuk mereset lewat API.**

Jangan bangun layar "Reset Password Karyawan" di tab Kelola — endpoint-nya memang tidak ada. Workaround operasional satu-satunya saat ini: HOST menonaktifkan akun lama (§2.5) lalu membuat akun baru (§2.2). Kalau fitur ini dibutuhkan, perlu endpoint baru di backend dulu.

> Catatan terkait: saat user berhasil ganti password sendiri, **semua sesi lain miliknya otomatis dicabut** — perangkat lain yang masih login akan mulai menerima `401` dan harus login ulang. Perangkat yang dipakai mengganti password tetap login.

## 2.5. PATCH /api/v1/users/:id/status — Aktif/Nonaktifkan Akun

Body: `{ "status": "ACTIVE" }` atau `{ "status": "INACTIVE" }` — **enum string** (sama seperti Cabang, beda dengan Layanan).

> Efek langsung: akun `INACTIVE` **tidak bisa login** (`403 ACCOUNT_INACTIVE`), dan **sesi yang sedang aktif langsung berhenti berfungsi** — validasi sesi mengecek status user di tiap request, jadi AGENT yang sedang memegang HP langsung dapat `401` begitu dinonaktifkan. Tidak perlu menunggu sesinya kedaluwarsa.

---

# 3. Layanan — `/api/v1/services`

## 3.1. GET /api/v1/services — List Layanan

### Query Params

| Param | Tipe | Default | Catatan |
|---|---|---|---|
| `page` | `integer` | `1` | |
| `limit` | `integer` | `20` | Maks `100` |

Tidak ada param search/filter. Terurut `name` (tie-breaker `_id`).

⚠️ **Isi daftarnya berbeda tergantung role, dan ini dipaksa server-side:**

| Role | Yang dikembalikan |
|---|---|
| **HOST** | **Semua** layanan, termasuk yang `isActive: false` |
| **AGENT** | **Hanya** layanan `isActive: true` |

AGENT tidak bisa memaksa melihat layanan nonaktif lewat query apa pun. Jadi di layar "pilih layanan" saat buat transaksi, AGENT otomatis hanya melihat yang valid dipakai — tidak perlu filter tambahan di client.

**`pagination.total` ikut mengikuti filter role tersebut**: untuk AGENT, `total` adalah jumlah layanan **aktif** saja, bukan jumlah seluruh layanan. Jadi `total` selalu cocok dengan apa yang bisa ditelusuri role itu — tidak akan ada halaman yang "hilang" karena difilter.

```json
{
  "success": true,
  "data": {
    "services": [
      {
        "_id": "66bb22cc33dd44ee55ff6600",
        "serviceCode": "SRV-001",
        "name": "Haircut + Styling",
        "description": "Potong rambut plus styling",
        "category": "HAIRCUT",
        "price": 100000,
        "durationMinutes": 45,
        "revenueSharing": { "ownerPercentage": 70, "employeePercentage": 30 },
        "isActive": true,
        "createdAt": "2026-01-05T04:00:00.000Z",
        "updatedAt": "2026-09-20T07:30:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 8, "totalPages": 1 }
  }
}
```

### ⚠️ Ini Endpoint Paling Rawan dari Perubahan Pagination

Layar **"pilih layanan" saat AGENT membuat transaksi** memanggil endpoint ini dan butuh daftar yang bisa dipilih seluruhnya. Dengan default `limit: 20`, bisnis dengan lebih dari 20 layanan aktif akan punya layanan yang **tidak bisa dipilih sama sekali** — tanpa error, tanpa indikasi apa pun di UI.

Ini bukan hipotetis: katalog layanan barbershop (potong, cuci, cat, perawatan, paket, variasi harga anak/dewasa) gampang melewati 20. Perbaiki layar itu **sebelum** backend ini dirilis: kirim `limit=100`, dan kalau `totalPages > 1` ambil halaman berikutnya sampai habis sebelum membangun daftar pilihan.

## 3.2. GET /api/v1/services/:id — Detail Layanan

HOST + AGENT. ⚠️ **Tidak ada filter `isActive` di sini** — beda dari list (§3.1). AGENT yang memegang id layanan nonaktif **tetap bisa mengambil detailnya** lewat endpoint ini. Tidak berbahaya (read-only, dan transaksi dengan layanan nonaktif tetap ditolak `422` saat dibuat), tapi jangan dijadikan sumber kebenaran "layanan ini masih bisa dipakai" — cek `isActive` di response-nya sendiri.

## 3.3. POST /api/v1/services — Tambah Layanan

**HOST only.**

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `serviceCode` | `string` | **Ya** | 1–32 karakter, unik, **immutable setelah dibuat** |
| `name` | `string` | **Ya** | 1–100 karakter |
| `description` | `string` | Tidak | Maks 1000 |
| `category` | `string` | Tidak | Maks 50 — **teks bebas, bukan enum** |
| `price` | `number` | **Ya** | ≥ 0 |
| `durationMinutes` | `integer` | Tidak | Default `30`, harus > 0 |
| `revenueSharing` | `object` | **Ya** | `{ ownerPercentage, employeePercentage }` |

⚠️ **`revenueSharing.ownerPercentage + employeePercentage` WAJIB tepat 100.** Kalau tidak, ditolak `400` dengan pesan "Owner and employee percentages must total 100%." Di form Flutter, paling aman pakai **satu slider/input saja** (mis. porsi owner) lalu hitung sisanya otomatis — jangan dua input bebas yang bisa menghasilkan total ≠ 100.

⚠️ **`revenueSharing` harus dikirim lengkap dua-duanya, termasuk saat PATCH.** Mengirim `{ "revenueSharing": { "ownerPercentage": 70 } }` saja akan ditolak — `employeePercentage` tetap wajib ada di dalam objeknya.

## 3.4. PATCH /api/v1/services/:id — Ubah Layanan

**HOST only.** Field: `name`, `description`, `category`, `price`, `durationMinutes`, `revenueSharing` (semua optional, tapi `revenueSharing` kalau dikirim harus lengkap — lihat §3.3). `serviceCode` immutable.

> **Penting soal harga:** mengubah `price` **tidak mengubah transaksi lama sama sekali**. Tiap transaksi menyimpan `serviceSnapshot` (nama + harga + bagi hasil saat itu), jadi riwayat dan laporan tetap memakai angka lama. Perubahan harga hanya berlaku untuk transaksi baru.

## 3.5. PATCH /api/v1/services/:id/status — Aktif/Nonaktifkan

**HOST only.** Body: `{ "isActive": false }` — **boolean, BUKAN enum string** (beda dari Cabang dan Karyawan di dokumen yang sama ini).

> Efek: layanan nonaktif hilang dari daftar pilihan AGENT (§3.1), dan transaksi baru dengan layanan itu ditolak `422`.

---

# 4. Subscription & Billing — `/api/v1/subscription`

**HOST only, semuanya read-only (`GET`).** Ini satu-satunya area yang tetap hidup saat langganan nunggak (`EXEMPT_ALL`).

## 4.1. Tidak Ada Endpoint "Bayar"

Tidak ada `POST` apa pun di modul ini. Alur bayarnya:

1. Sistem (cron billing) menerbitkan invoice **beserta QR code-nya sekaligus** di akhir periode.
2. App tinggal **menampilkan `qrCodeUrl` / `qrString`** yang sudah menempel di invoice.
3. HOST scan & bayar lewat aplikasi bank/e-wallet.
4. Midtrans memberi tahu backend lewat webhook (server-to-server, **tidak pernah sampai ke app**).
5. App perlu **polling** `GET /subscription` atau `GET /subscription/invoices` untuk tahu statusnya sudah `PAID`.

Jadi tombol "Bayar Sekarang" di UI = menampilkan QR, bukan memanggil endpoint.

## 4.2. GET /api/v1/subscription — Status Langganan

```json
{
  "success": true,
  "data": {
    "subscription": {
      "_id": "66ee99887766554433221100",
      "host": "66ab12cd34ef56ab78cd90bb",
      "plan": {
        "_id": "66ee00112233445566778899",
        "code": "BASIC",
        "name": "Paket Basic",
        "price": 299000,
        "currency": "IDR",
        "billingCycle": "MONTHLY",
        "graceDays": 7,
        "maxBranches": 3,
        "isActive": true
      },
      "status": "ACTIVE",
      "currentPeriodStart": "2026-10-01T00:00:00.000Z",
      "currentPeriodEnd": "2026-11-01T00:00:00.000Z",
      "graceEndsAt": null,
      "cancelledAt": null,
      "cancelReason": null
    }
  }
}
```

⚠️ **`subscription` bisa bernilai `null`** (tetap status `200`) — terjadi pada deployment yang baru di-provision dan belum punya langganan sama sekali. **Ini bukan error dan bukan berarti akses terkunci**: HOST tanpa record langganan justru diperlakukan sebagai akses penuh normal. UI harus menangani `null` sebagai "belum ada data langganan", bukan sebagai kondisi gagal bayar.

`plan` **selalu ter-populate** sebagai objek penuh (bukan ObjectId).

Arti `status`:

| `status` | Artinya |
|---|---|
| `ACTIVE` | Normal, semua fitur jalan |
| `PAST_DUE` | Invoice lewat jatuh tempo, masih dalam masa tenggang (`graceEndsAt`) — **akses sudah terkunci** |
| `EXPIRED` | Masa tenggang habis — akses terkunci |
| `CANCELLED` | Dibatalkan — akses terkunci |

Ketiga status selain `ACTIVE` memicu `402` di seluruh endpoint `ENFORCED`.

## 4.3. GET /api/v1/subscription/invoices — Riwayat Invoice

| Param | Default | Catatan |
|---|---|---|
| `page` | `1` | |
| `limit` | `20` (maks 100) | |
| `status` | — | `PENDING\|PAID\|FAILED\|EXPIRED\|REFUNDED`. **Sudah berfungsi sejak 2026-10-19** — lihat di bawah |

✅ **Filter `status` sekarang benar-benar diterapkan.** *(Sebelum 2026-10-19 parameter ini divalidasi lalu dibuang — `?status=PAID` membalas `200` berisi invoice semua status. Dokumen ini dulu menyarankan memfilter di sisi Flutter; saran itu sudah tidak berlaku.)*

Konsekuensi yang perlu diperhatikan kalau app sudah punya workaround filter-di-client: **`pagination.total` sekarang ikut mengikuti filter `status`.** Jadi `?status=PAID` mengembalikan `total` = jumlah invoice `PAID` saja, bukan jumlah seluruh invoice. Kalau app memfilter ulang hasilnya di client, hasilnya tidak salah — cuma pekerjaan ganda. Yang **akan** salah adalah kalau app memakai `total` dari request ber-filter sebagai "jumlah seluruh invoice" untuk ditampilkan di UI.

Nilai di luar enum tetap ditolak `400` seperti sebelumnya.

```json
{
  "success": true,
  "data": {
    "invoices": [
      {
        "_id": "66ff11223344556677889900",
        "subscription": "66ee99887766554433221100",
        "host": "66ab12cd34ef56ab78cd90bb",
        "invoiceCode": "INV-202610-000001",
        "periodStart": "2026-10-01T00:00:00.000Z",
        "periodEnd": "2026-11-01T00:00:00.000Z",
        "amount": 299000,
        "status": "PENDING",
        "dueAt": "2026-11-08T00:00:00.000Z",
        "paidAt": null,
        "provider": "MIDTRANS",
        "providerOrderId": "GRM-SUB-202610-000001",
        "qrCodeUrl": "https://api.midtrans.com/v2/qris/.../qr-code",
        "qrString": "00020101021226...",
        "expiresAt": "2026-11-08T00:00:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 4, "totalPages": 1, "pages": 1 }
  }
}
```

### `totalPages` dan `pages` — Dua Key, Nilai Sama

Endpoint ini mengirim **keduanya**, dan nilainya selalu identik:

| Key | Status | Pakai? |
|---|---|---|
| `totalPages` | Standar, sama seperti seluruh endpoint lain | ✅ **Pakai ini** |
| `pages` | Nama lama, **deprecated** | ❌ Jangan dipakai di kode baru |

*Dulu endpoint ini **hanya** mengirim `pages`, sehingga model Dart pagination tidak bisa dipakai bersama modul lain. `totalPages` ditambahkan 2026-10-19 tanpa menghapus `pages`, supaya build mobile yang sudah beredar tidak pecah saat backend di-deploy.* `pages` akan dihapus setelah app bermigrasi — **migrasikan sekarang**, jangan tunggu sampai hilang. Setelah itu model `Pagination` bersama di `AUTH-MOBILE-API-INTEGRATION.md` §2.1.6 bisa dipakai di sini tanpa penyesuaian apa pun.

### Kalau HOST Belum Punya Langganan

Response tetap `200` dengan `invoices: []`. Objek `pagination`-nya sekarang **memantulkan `page`/`limit` yang app kirim** — mis. `?limit=50` membalas `{page:1, limit:50, total:0, totalPages:0, pages:0}`.

*Dulu jalur ini mengembalikan `limit: 20` hardcode berapa pun yang diminta, dan — lebih menyesatkan — `?limit=abc` dibalas `200` di jalur ini padahal `400` di jalur normal. Keduanya sudah diperbaiki: validasi query sekarang berjalan lebih dulu, jadi `400` untuk param tidak valid berlaku konsisten entah HOST punya langganan atau tidak.*

## 4.4. GET /api/v1/subscription/invoices/:id — Detail Invoice

### 🐛🐛 ENDPOINT INI SEDANG RUSAK — SELALU `403`

**Jangan dipakai dulu, dan jangan buang waktu men-debug sisi Flutter kalau endpoint ini balas `403`** — penyebabnya di backend, bukan di app.

Detailnya: service me-*populate* field `subscription` pada invoice menjadi objek penuh, lalu route membandingkannya sebagai string dengan id langganan HOST. Perbandingan itu membandingkan `"[object Object]"` dengan id asli, sehingga **tidak pernah cocok untuk siapa pun** — termasuk pemilik sah invoice tersebut. Hasilnya `403 FORBIDDEN` di semua kasus. Belum ada test yang meng-cover route ini, jadi bug-nya lolos tanpa ketahuan.

**Workaround sampai diperbaiki:** semua data yang dibutuhkan untuk menampilkan dan membayar invoice (`amount`, `status`, `dueAt`, `qrCodeUrl`, `qrString`, `expiresAt`) **sudah lengkap tersedia di response list** (§4.3). Tampilkan halaman detail invoice dari item list yang sudah di-fetch, jangan panggil endpoint ini.

Perilaku yang *seharusnya* (setelah diperbaiki nanti): `200` dengan `{invoice}`, `403` kalau invoice milik HOST lain, `404` kalau invoice/langganan tidak ada.

---

## 5. Status Code — Ringkasan

| Status | `error.code` | Kapan |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Schema, timezone bukan IANA, revenueSharing ≠ 100, role↔branch dilanggar, branch tidak ada |
| `401` | `UNAUTHENTICATED` | |
| `402` | `PAYMENT_REQUIRED` | Cabang/Karyawan/Layanan saat langganan lapsed — **tidak pernah** di endpoint Subscription |
| `403` | `FORBIDDEN` | Bukan HOST; AGENT akses cabang lain; **plus bug di §4.4** |
| `404` | `NOT_FOUND` | Resource tidak ada (termasuk akun platform internal yang disembunyikan) |
| `409` | `CONFLICT` | `branchCode` / `username` / `serviceCode` duplikat |
| `500` | `INTERNAL_ERROR` | |

---

## 6. Catatan Implementasi Flutter

- **Jangan pakai satu widget "toggle status" generik untuk keempat resource** — Cabang & Karyawan pakai `{status: "ACTIVE"|"INACTIVE"}`, Layanan pakai `{isActive: bool}`. Bikin pemetaan eksplisit per resource.
- **Model Dart tidak bisa seragam soal id** — Karyawan pakai `id`, tiga lainnya `_id`. Model Karyawan bisa di-reuse dari `/profile` (bentuknya identik).
- **‼️ Keempat list sekarang berpaginasi, default 20 baris** (§0 poin 3) — dan ketiga di antaranya (Cabang/Karyawan/Layanan) **dulu mengembalikan seluruh data**. Audit setiap layar di tab ini sebelum rilis; tidak ada error yang akan memberi tahu kalau daftarnya terpotong.
- **Prioritas tertinggi: picker layanan di alur buat transaksi** (§3.1) dan **picker cabang di form karyawan** (§1.1). Dua layar ini butuh daftar lengkap untuk berfungsi benar — kalau terpotong, ada pilihan yang tidak akan pernah bisa dipilih user. Kirim `limit=100` + ambil halaman lanjutan kalau `totalPages > 1`.
- **Search/filter staf & layanan masih client-side, tapi sekarang cuma atas data yang sudah di-fetch** — kalau mau tetap memfilter seluruh data, fetch semua halaman dulu (loop sampai `page > totalPages`) baru filter.
- **Satu model `Pagination` untuk keempat list** — lihat `AUTH-MOBILE-API-INTEGRATION.md` §2.1.6. Abaikan field `pages` di invoice (§4.3), pakai `totalPages`.
- **Form tambah karyawan: role menentukan field cabang** (§2.2) — AGENT wajib cabang, HOST wajib tanpa cabang. Validasi di client dulu supaya user tidak kena 400 yang membingungkan.
- **Form layanan: satu input porsi bagi hasil, bukan dua** (§3.3) — hitung sisanya otomatis supaya total selalu 100.
- **Jangan bikin layar reset password karyawan** (§2.4) — endpoint-nya tidak ada sama sekali.
- **Jangan panggil `GET /subscription/invoices/:id`** (§4.4) — sedang rusak; render detail dari data list. *(Masih berlaku per 2026-10-19 — diverifikasi ulang ke kode, bug populate-nya belum diperbaiki.)*
- **Filter `status` di list invoice sudah bisa diandalkan** (§4.3) — kirim ke server, jangan filter di client lagi. Tapi ingat `total` ikut mengecil mengikuti filter.
- **Tangani `subscription: null`** sebagai keadaan normal, bukan error (§4.2).
