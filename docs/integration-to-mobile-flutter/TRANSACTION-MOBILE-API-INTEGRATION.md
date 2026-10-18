# Integrasi Mobile (Flutter) — Grooma API — Modul Transaksi (POS Core)

> Dokumen ini khusus **POS core**: create, list, detail, complete, cancel, receipt — plus dua endpoint `/payments/*` pendukung yang dibutuhkan untuk menuntaskan alur QRIS. Base URL, model sesi cookie, dan setup `dio` **tidak diulang di sini** — lihat `docs/AUTH-MOBILE-API-INTEGRATION.md` bagian 1–2.
>
> **Di luar scope dokumen ini:** alur pengajuan & approval koreksi transaksi (`/transactions/:id/change-requests`, `/transaction-change-requests/*`) — itu di `docs/TRANSACTION-CHANGE-REQUESTS-MOBILE-API-INTEGRATION.md`.

---

## 0. Ringkasan

| Method | Endpoint | Role | Catatan |
|---|---|---|---|
| POST | `/api/v1/transactions` | **AGENT only** | HOST tidak bisa membuat transaksi (403) |
| GET | `/api/v1/transactions` | HOST, AGENT | AGENT lihat **seluruh transaksi cabangnya**, bukan cuma miliknya sendiri |
| GET | `/api/v1/transactions/:id` | HOST, AGENT (cabang sendiri) | |
| POST | `/api/v1/transactions/:id/complete` | **AGENT only** | |
| POST | `/api/v1/transactions/:id/cancel` | HOST, AGENT (cabang sendiri) | |
| GET | `/api/v1/transactions/:id/receipt` | HOST, AGENT (cabang sendiri) | **Side-effect:** increment print count tiap dipanggil |
| POST | `/api/v1/payments/qris` | **AGENT only** | Buat/retry QRIS untuk transaksi yang sudah ada |
| GET | `/api/v1/payments/:id` | HOST, AGENT (cabang sendiri) | Polling status pembayaran |

**Subscription gating keenam endpoint `/transactions/*` dan `/payments/*` di atas pakai policy `EXEMPT_AGENT`** — beda dari modul change-request (`ENFORCED` penuh, lihat dokumen terpisah). Artinya: kalau subscription HOST nunggak, **AGENT tetap bisa jalan normal** (create/list/detail/complete/cancel/receipt/bayar) — ini sengaja, supaya customer yang sudah duduk di kursi tidak disandera tagihan HOST yang telat bayar (PRD §23.4.1). **HOST** yang hit endpoint `GET`/`cancel` di modul ini tetap kena `402` kalau nunggak.

---

## 1. POST /api/v1/transactions — Buat Transaksi

### Headers

| Header | Wajib | Value |
|---|---|---|
| `Content-Type` | Ya | `application/json` |
| Cookie `grooma_session` | Ya | — |
| `Idempotency-Key` | **Sangat disarankan, lihat §1.4** | String unik per percobaan submit (mis. UUID v4) |

### Request Body

```json
{
  "customerId": "66aa11bb22cc33dd44ee55ff",
  "serviceId": "66bb22cc33dd44ee55ff6600",
  "paymentMethod": "QRIS",
  "discountAmount": 0,
  "serviceHourType": "REGULAR"
}
```

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `customerId` | `string` | Tidak | Kalau tidak dikirim, transaksi tanpa customer tercatat (`customer: null`) |
| `serviceId` | `string` | **Ya** | |
| `paymentMethod` | `"CASH" \| "QRIS"` | **Ya** | |
| `discountAmount` | `number` | Tidak | Default `0`. Tidak boleh melebihi harga service (422 kalau melebihi) |
| `serviceHourType` | `"REGULAR" \| "OVERTIME"` | Tidak | Default `"REGULAR"`. **Hanya tercatat untuk laporan, tidak memengaruhi harga sama sekali** |

Schema **strict** — field seperti `agentId`, `branchId`, `total`, `ownerRevenue`, `employeeRevenue`, `serviceSnapshot` **akan ditolak 400** kalau dikirim. Semua nilai itu **selalu dihitung ulang di server** dari data `Service` yang live di database saat request masuk — apapun yang dikirim client untuk field-field itu tidak pernah dipercaya (§8.3 PRD). `agent`/`branch` transaksi juga selalu diambil dari sesi login, bukan dari body.

### Cara Harga Dihitung (untuk referensi/debug, bukan sesuatu yang dihitung di client)

```
subtotal       = Service.price
total           = subtotal - discountAmount
ownerRevenue    = round(total * Service.revenueSharing.ownerPercentage / 100)
employeeRevenue = total - ownerRevenue   // sisa, supaya selalu pas tanpa selisih pembulatan
pointsEarned    = floor(total / 1000)     // 1.000 IDR = 1 poin
```

### Response `201 Created`

**Kasus CASH** (langsung lunas):

```json
{
  "success": true,
  "data": {
    "transaction": {
      "_id": "671234abcd5678ef90123456",
      "transactionCode": "GRM-20261018-412837",
      "branch": "66ffaa0011223344556677aa",
      "agent": "66ab12cd34ef56ab78cd90aa",
      "customer": "66aa11bb22cc33dd44ee55ff",
      "service": "66bb22cc33dd44ee55ff6600",
      "serviceSnapshot": { "name": "Haircut + Styling", "price": 100000, "ownerPercentage": 70, "employeePercentage": 30 },
      "paymentMethod": "CASH",
      "paymentStatus": "PAID",
      "transactionStatus": "PENDING",
      "serviceHourType": "REGULAR",
      "subtotal": 100000,
      "discountAmount": 0,
      "total": 100000,
      "ownerRevenue": 70000,
      "employeeRevenue": 30000,
      "pointsEarned": 100,
      "paidAt": "2026-10-18T08:00:00.000Z",
      "completedAt": null,
      "changeRequest": { "status": "NONE" },
      "receipt": { "printed": false, "printCount": 0 },
      "createdAt": "2026-10-18T08:00:00.000Z",
      "updatedAt": "2026-10-18T08:00:00.000Z"
    },
    "payment": null,
    "paymentError": null
  }
}
```

⚠️ **`branch`/`agent`/`customer`/`service` di response `create` adalah ObjectId mentah (string), BUKAN object `{id, name}`** — beda dari response `list`/`detail` yang populated (lihat §3). Endpoint create tidak melakukan `.populate()` sama sekali. Kalau butuh nama cabang/agent/customer langsung setelah create, ambil dari state yang sudah ada di app (sesi login, pilihan customer di form), jangan berharap response ini menyediakannya.

**Kasus QRIS, mode `MANAGED` (default), sukses bikin QR:**

```json
{
  "success": true,
  "data": {
    "transaction": { "...": "...", "paymentMethod": "QRIS", "paymentStatus": "PENDING", "paidAt": null },
    "payment": {
      "_id": "66cc00112233445566778800",
      "transaction": "671234abcd5678ef90123456",
      "provider": "MIDTRANS",
      "providerOrderId": "GRM-20261018-412837",
      "status": "PENDING",
      "grossAmount": 100000,
      "currency": "IDR",
      "qrCodeUrl": "https://api.midtrans.com/v2/qris/.../qr-code",
      "qrString": "00020101021226...",
      "expiresAt": "2026-10-18T08:15:00.000Z"
    },
    "paymentError": null
  }
}
```

**Kasus QRIS, panggilan ke Midtrans gagal saat create** (jaringan/Midtrans down):

```json
{
  "success": true,
  "data": {
    "transaction": { "...": "...", "paymentMethod": "QRIS", "paymentStatus": "PENDING" },
    "payment": null,
    "paymentError": "Failed to create QRIS charge: ..."
  }
}
```

⚠️ **Status tetap `201` (sukses), bukan error** — transaksinya **sudah tersimpan** sebagai sale of record, cuma QR code-nya gagal dibuat. **Cek `paymentError` setiap kali `paymentMethod: QRIS`** — kalau tidak `null`, tampilkan state "gagal buat QR" dan arahkan ke `POST /payments/qris` (§7) untuk retry pakai `transaction._id` yang sudah didapat ini. Jangan anggap `paymentError != null` sebagai transaksi gagal — transaksinya tetap ada, cuma belum ada cara bayar.

**Kasus QRIS pada deployment `SELF_RECORDED`:** `paymentStatus` langsung `"PAID"`, `payment: null`, `paymentError: null` — identik pola responnya seperti CASH. Tidak pernah ada Payment/QR sama sekali pada mode ini (HOST pakai QRIS miliknya sendiri di luar Grooma).

### Status Code

| Status | `error.code` | Kapan |
|---|---|---|
| `201` | — | Transaksi berhasil dibuat (cek `paymentError` untuk tahu apakah QR-nya juga berhasil) |
| `400` | `VALIDATION_ERROR` | Body tidak sesuai schema, field asing, atau header `Idempotency-Key` wajib tapi tidak dikirim (§1.4) |
| `401` | `UNAUTHENTICATED` | |
| `402` | `PAYMENT_REQUIRED` | **Tidak pernah terjadi untuk AGENT** (EXEMPT_AGENT) — endpoint ini murni milik AGENT |
| `403` | `FORBIDDEN` | User login sebagai HOST (HOST tidak bisa create transaksi sama sekali) |
| `409` | `CONFLICT` | `Idempotency-Key` yang sama masih diproses request lain secara konkuren (§1.4) |
| `422` | `BUSINESS_RULE_VIOLATION` | Agent tidak punya cabang, cabang tidak aktif, service tidak tersedia/tidak aktif, customer tidak tersedia/tidak aktif, atau `discountAmount` melebihi harga service |
| `500` | `INTERNAL_ERROR` | |

### 1.4. `Idempotency-Key` — WAJIB Diperhatikan untuk Tombol "Bayar"

Tombol submit transaksi adalah target klasik double-tap/double-submit (koneksi lambat, user panik tap dua kali). Backend menyediakan guard lewat header `Idempotency-Key`:

- **Opsional secara default** di level backend ini (`REQUIRE_IDEMPOTENCY_KEY` env var, per-deployment) — tapi kalau tidak dikirim, submit ganda = **transaksi ganda** (sale tercatat dua kali, dua-duanya nyata). Tidak ada proteksi lain di belakangnya.
- **Rekomendasi kuat untuk app:** generate **satu UUID v4 per percobaan submit** (bukan per transaksi logical — regenerate UUID baru kalau user mengubah input lalu submit ulang; pakai UUID yang SAMA kalau cuma retry karena timeout/error jaringan atas request yang sama).
- Kalau key yang sama dikirim ulang dan request sebelumnya **sudah selesai**: backend tidak membuat transaksi baru, langsung mengembalikan transaksi yang sudah ada (`201` sukses, isinya transaksi lama, bukan duplikat).
- Kalau key yang sama dikirim ulang **sementara request pertama masih diproses** (dua tap nyaris bersamaan): request kedua dapat `409 CONFLICT` — app sebaiknya anggap ini "masih diproses, tunggu/jangan retry otomatis langsung".
- Kalau deployment nanti mengaktifkan `REQUIRE_IDEMPOTENCY_KEY=true`, submit tanpa header ini akan ditolak `400` — jadi kirim header ini dari sekarang meskipun saat ini masih opsional, supaya app sudah siap sebelum enforcement dinyalakan.

---

## 2. GET /api/v1/transactions — List Transaksi

### Query Params

| Param | Tipe | Default | Catatan |
|---|---|---|---|
| `page` | `integer` | `1` | |
| `limit` | `integer` | `20` | Maks `100` |
| `search` | `string` | — | Cocok ke `transactionCode` (case-insensitive, substring) |
| `paymentStatus` | `PENDING\|PAID\|FAILED\|REFUNDED\|PARTIALLY_REFUNDED` | — | |
| `transactionStatus` | `PENDING\|IN_PROGRESS\|COMPLETED\|CANCELLED` | — | Lihat catatan `IN_PROGRESS` di §9 |
| `from`, `to` | `string` (ISO 8601) | — | Filter `createdAt` |
| `branchId` | `string` | — | **HOST only** — diabaikan untuk AGENT |
| `agentId` | `string` | — | **HOST only** — diabaikan untuk AGENT |

⚠️ **AGENT melihat SELURUH transaksi di cabangnya, bukan cuma transaksi yang dia buat sendiri.** Tidak ada filter "transaksi saya" otomatis untuk AGENT — kalau butuh itu di UI, filter di sisi client berdasarkan `agent._id` yang cocok dengan id user login sendiri.

> ⚠️ **Hati-hati menggabungkan filter client-side itu dengan pagination:** memfilter "transaksi saya" atas satu halaman hasil akan menampilkan jumlah yang tidak konsisten per halaman (halaman berisi 20 transaksi cabang bisa cuma menyisakan 3 milik AGENT tersebut), dan `pagination.total` menghitung transaksi **cabang**, bukan hasil filter lokal. Kalau layar "transaksi saya" dibutuhkan, lebih baik kirim `agentId`… tapi param itu **HOST only** dan diabaikan untuk AGENT, jadi untuk sekarang pilihannya: terima inkonsistensi per halaman, atau fetch beberapa halaman sampai cukup. Jangan tampilkan `pagination.total` sebagai "jumlah transaksi saya".

> **Kontrak pagination endpoint ini tidak berubah** pada pembaruan 2026-10-19 — sudah sesuai standar sejak awal. Acuan lengkapnya (perilaku tepi, `page` di luar rentang, model Dart bersama) di `AUTH-MOBILE-API-INTEGRATION.md` §2.1. Yang berubah: urutannya sekarang **stabil** (`createdAt` desc + tie-breaker `_id`) — relevan di sini karena transaksi yang dibuat pada detik yang sama dulu bisa bertukar posisi antar halaman.

### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "_id": "671234abcd5678ef90123456",
        "transactionCode": "GRM-20261018-412837",
        "branch": { "_id": "66ffaa0011223344556677aa", "name": "Cabang Kemang" },
        "agent": { "_id": "66ab12cd34ef56ab78cd90aa", "name": "Budi Santoso" },
        "customer": { "_id": "66aa11bb22cc33dd44ee55ff", "name": "Andi Wijaya", "phone": "08123456789" },
        "service": "66bb22cc33dd44ee55ff6600",
        "serviceSnapshot": { "name": "Haircut + Styling", "price": 100000, "ownerPercentage": 70, "employeePercentage": 30 },
        "paymentMethod": "CASH",
        "paymentStatus": "PAID",
        "transactionStatus": "COMPLETED",
        "total": 100000,
        "pointsEarned": 100,
        "createdAt": "2026-10-18T08:00:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 }
  }
}
```

Di sini `branch`/`agent`/`customer` **sudah populated** jadi object (`customer` jadi `null` kalau transaksi tidak punya customer tercatat) — beda dengan response `create` di §1. `service` tetap ObjectId mentah di semua endpoint (nama layanan selalu dari `serviceSnapshot.name`, bukan dari `service` yang di-populate).

---

## 3. GET /api/v1/transactions/:id — Detail Transaksi

Bentuk response **identik dengan satu item di `transactions[]` pada §2** (sama-sama populated `branch`/`agent`/`customer`), dibungkus `{ transaction: {...} }` (bukan array).

| Status | Kapan |
|---|---|
| `200` | Sukses |
| `403` | AGENT dari cabang lain mencoba akses transaksi ini |
| `404` | Transaksi tidak ditemukan |

---

## 4. POST /api/v1/transactions/:id/complete — Selesaikan Layanan

**AGENT only** (403 untuk HOST). Menandai layanan sudah selesai dikerjakan — set `transactionStatus: "COMPLETED"` + `completedAt`.

⚠️ **Tidak ada gate terhadap `paymentStatus` sama sekali.** Transaksi QRIS yang `paymentStatus` masih `PENDING` (customer belum/belum selesai scan QR) **tetap bisa** di-complete — "selesai dikerjakan" dan "sudah dibayar" adalah dua hal independen di backend ini. Kalau UI ingin memastikan sudah dibayar dulu sebelum tombol "Selesai" aktif, itu validasi yang harus dilakukan **di sisi app**, bukan sesuatu yang backend tolak.

| Status | `error.code` | Kapan |
|---|---|---|
| `200` | — | Sukses, body `{transaction}` (bentuk sama seperti §3) |
| `403` | `FORBIDDEN` | Bukan AGENT, atau AGENT dari cabang lain |
| `404` | `NOT_FOUND` | Transaksi tidak ditemukan |
| `409` | `CONFLICT` | Transaksi sudah `CANCELLED` atau sudah `COMPLETED` sebelumnya |

---

## 5. POST /api/v1/transactions/:id/cancel — Batalkan Transaksi

HOST maupun AGENT (cabang sendiri) bisa cancel.

⚠️ **Tidak pernah memicu refund apa pun, dan tidak menyentuh `paymentStatus`.** Kalau transaksi QRIS sudah `PAID` lalu di-cancel, uangnya **tidak otomatis dikembalikan** — `paymentStatus` tetap `PAID`, hanya `transactionStatus` yang jadi `CANCELLED`. Refund atas transaksi yang sudah terbayar adalah proses manual di luar endpoint ini (belum ada endpoint-nya di backend saat ini).

Efek samping kalau transaksi yang dibatalkan sebelumnya `PAID` dan punya customer dengan poin: poin loyalty yang sempat diberikan **otomatis dibalik/dikurangi** (best-effort, tidak pernah membuat endpoint ini gagal kalau proses pembalikan poinnya sendiri error).

| Status | `error.code` | Kapan |
|---|---|---|
| `200` | — | Sukses, body `{transaction}` |
| `403` | `FORBIDDEN` | AGENT dari cabang lain |
| `404` | `NOT_FOUND` | Transaksi tidak ditemukan |
| `409` | `CONFLICT` | Transaksi sudah `COMPLETED` (tidak bisa dibatalkan lagi) atau sudah `CANCELLED` sebelumnya |

---

## 6. GET /api/v1/transactions/:id/receipt — Data Struk

⚠️ **Ini `GET`, tapi punya side effect: setiap kali dipanggil, `receipt.printCount` bertambah 1 dan `receipt.printed`/`receipt.printedAt` ikut diupdate.** Jangan panggil endpoint ini untuk keperluan preview/cek status — hanya panggil saat benar-benar mau mencetak/menampilkan struk final ke customer. Kalau butuh data transaksi untuk preview, pakai `GET /transactions/:id` (§3) yang murni read-only.

`branch` di response ini populated lebih lengkap daripada endpoint lain — `{ _id, name, branchCode, address, phone }` (bukan cuma `name`), karena memang untuk kebutuhan header struk.

```json
{
  "success": true,
  "data": {
    "transaction": {
      "...": "... (field lain sama seperti §3)",
      "branch": {
        "_id": "66ffaa0011223344556677aa",
        "name": "Cabang Kemang",
        "branchCode": "KMG",
        "address": "Jl. Kemang Raya No. 1",
        "phone": "021-7654321"
      },
      "receipt": { "printed": true, "printedAt": "2026-10-18T08:05:00.000Z", "printCount": 1 }
    }
  }
}
```

| Status | Kapan |
|---|---|
| `200` | Sukses |
| `403` | AGENT dari cabang lain |
| `404` | Transaksi tidak ditemukan |

---

## 7. Pendukung QRIS — POST /payments/qris & GET /payments/:id

Dua endpoint ini melengkapi alur QRIS yang dimulai dari `POST /transactions` (§1) — dipakai untuk **retry** (kalau `paymentError` tidak `null`, atau QR sebelumnya sudah expired) dan untuk **polling status bayar**.

### 7.1. POST /api/v1/payments/qris — Buat/Retry QRIS

**AGENT only.** Body:

```json
{ "transactionId": "671234abcd5678ef90123456" }
```

`transactionId` wajib persis 24 karakter hex (format ObjectId) — format lain ditolak `400` sebelum sempat query database.

Response `201`: `{ "payment": { ...sama seperti bentuk payment di §1... } }`.

| Status | `error.code` | Kapan |
|---|---|---|
| `201` | — | QR baru berhasil dibuat |
| `400` | `VALIDATION_ERROR` | `transactionId` bukan format ObjectId valid |
| `403` | `FORBIDDEN` | Bukan AGENT, atau beda cabang |
| `404` | `NOT_FOUND` | Transaksi tidak ditemukan |
| `409` | `CONFLICT` | Transaksi sudah `PAID`, sudah `CANCELLED`, atau masih ada payment `PENDING` lain yang **belum expired** (harus tunggu expired dulu atau sudah dibayar) |
| `422` | `BUSINESS_RULE_VIOLATION` | `paymentMethod` transaksi bukan `QRIS`, atau deployment ini mode `SELF_RECORDED` (tidak pernah ada order Midtrans sama sekali di mode ini) |
| `502` | `PAYMENT_GATEWAY_ERROR` | Panggilan ke Midtrans gagal |

⚠️ **Beda penting dengan §1:** saat **create transaksi**, kegagalan Midtrans di-redam jadi `201` + `paymentError` (sale tetap tercatat). Saat **retry lewat endpoint ini**, kegagalan Midtrans yang sama malah jadi **`502` tegas** (tidak ada payment yang dibuat sama sekali). Tangani dua kasus ini secara berbeda di UI — retry di sini butuh pesan error + tombol "coba lagi", bukan state "sukses tapi belum bisa bayar" seperti di §1.

### 7.2. GET /api/v1/payments/:id — Polling Status

```json
{
  "success": true,
  "data": {
    "payment": {
      "_id": "66cc00112233445566778800",
      "transaction": { "_id": "671234abcd5678ef90123456", "branch": "66ffaa0011223344556677aa", "transactionCode": "GRM-20261018-412837" },
      "status": "PENDING",
      "grossAmount": 100000,
      "qrCodeUrl": "https://...",
      "qrString": "00020101...",
      "expiresAt": "2026-10-18T08:15:00.000Z",
      "paidAt": null
    }
  }
}
```

`status`: `PENDING | PAID | FAILED | EXPIRED | REFUNDED`.

**Pola polling yang disarankan** setelah menampilkan QR ke customer:
- Poll `GET /payments/:id` setiap 3–5 detik sampai `status` bukan lagi `PENDING`, ATAU sampai lewat `expiresAt`.
- `status: "PAID"` → tampilkan sukses, lanjut ke langkah berikutnya (print struk, dsb).
- `status: "EXPIRED"` atau sudah lewat `expiresAt` → tampilkan "QR kedaluwarsa", sediakan tombol yang memanggil ulang §7.1 untuk generate QR baru.
- Tidak ada webhook/push ke app — satu-satunya cara tahu pembayaran masuk adalah polling endpoint ini. Backend menerima notifikasi dari Midtrans secara terpisah (`/payments/midtrans/notification`), tapi itu server-to-server, **tidak pernah dikirim ke app**.

⚠️ **Catatan `EXPIRED` vs transaksi induknya:** kalau `Payment.status` jadi `EXPIRED`, `Transaction.paymentStatus` **tetap `PENDING`** (bukan ikut berubah) — transaksinya masih valid dan masih bisa dibayar, cuma QR code-nya yang harus diganti baru lewat §7.1. Jangan tampilkan transaksi sebagai "gagal" hanya karena satu QR-nya expired.

---

## 8. Status Code — Ringkasan Semua Endpoint di Modul Ini

```json
{
  "success": false,
  "error": { "code": "BUSINESS_RULE_VIOLATION", "message": "Service is not available." }
}
```

| Status | `error.code` | Endpoint mana saja |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Semua endpoint dengan body/query |
| `401` | `UNAUTHENTICATED` | Semua |
| `402` | `PAYMENT_REQUIRED` | Hanya bisa kena HOST (EXEMPT_AGENT) — AGENT tidak pernah |
| `403` | `FORBIDDEN` | Role salah, atau AGENT beda cabang |
| `404` | `NOT_FOUND` | Endpoint dengan `:id` |
| `409` | `CONFLICT` | complete/cancel (status tidak valid), payments/qris (sudah lunas/sudah ada pending), idempotency key masih diproses |
| `422` | `BUSINESS_RULE_VIOLATION` | create (referensi tidak valid/tidak aktif), payments/qris (bukan QRIS/mode SELF_RECORDED) |
| `500` | `INTERNAL_ERROR` | Semua |
| `502` | `PAYMENT_GATEWAY_ERROR` | payments/qris saja |

---

## 9. Catatan Implementasi Flutter

- **Generate `Idempotency-Key` per percobaan submit** (§1.4) — ini satu-satunya proteksi terhadap double-charge dari double-tap. Jangan skip meskipun saat ini masih opsional di backend.
- **`transactionStatus: "IN_PROGRESS"` ada di enum tapi tidak pernah di-set oleh endpoint manapun saat ini** — alurnya cuma `PENDING → COMPLETED` (via §4) atau `PENDING → CANCELLED` (via §5). Jangan desain UI yang mengandalkan state "sedang dikerjakan" dari backend; kalau butuh state itu, kelola sendiri di sisi app (lokal), karena backend tidak punya endpoint untuk transisi ke `IN_PROGRESS`.
- **Field `service` selalu ObjectId mentah** di semua response transaksi — nama layanan yang ditampilkan ke user selalu dari `serviceSnapshot.name`, bukan hasil populate `service`.
- **Response `create` (§1) tidak populated, response `list`/`detail`/`receipt` populated** — dua bentuk yang berbeda untuk field `branch`/`agent`/`customer`. Jangan pakai satu model Dart yang sama secara naif untuk keduanya tanpa menangani dua variannya (string vs object).
- **Setelah create dengan `paymentMethod: QRIS`, selalu cek `paymentError` sebelum menganggap QR siap ditampilkan** — kalau tidak `null`, arahkan ke flow retry (§7.1), jangan coba render `payment` yang `null`.
- **Alur approval koreksi transaksi (edit service/customer/diskon pasca-transaksi) ada di dokumen terpisah** — lihat `docs/TRANSACTION-CHANGE-REQUESTS-MOBILE-API-INTEGRATION.md`.
