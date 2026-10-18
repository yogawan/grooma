# Integrasi Mobile (Flutter) — Grooma API — Modul Transaction Change Requests (Approval Workflow)

> Dokumen ini khusus alur **pengajuan & approval koreksi transaksi** (ganti service/customer/diskon/jam pada transaksi yang **sudah dibuat**). Base URL, model sesi cookie, dan setup `dio` **tidak diulang di sini** — lihat `docs/AUTH-MOBILE-API-INTEGRATION.md` bagian 1–2. Untuk create/list/detail/complete/cancel/receipt transaksi itu sendiri, lihat `docs/TRANSACTION-MOBILE-API-INTEGRATION.md`.

---

## 0. Konsep Penting — Baca Dulu Sebelum Lanjut

**Tidak ada entity "change request" yang berdiri sendiri.** Tidak ada collection/model/`_id` sendiri untuk sebuah change request. Seluruh state-nya nempel langsung di dokumen `Transaction` yang bersangkutan:

- `transaction.changeRequest` — status pengajuan **terkini/terakhir** (`NONE`/`PENDING`/`APPROVED`/`REJECTED`) beserta siapa yang minta, alasan, apa yang diminta, siapa yang review, dst. Field ini **ditimpa penuh** setiap ada pengajuan baru — riwayat pengajuan lama yang sudah diputuskan tidak disimpan di sini.
- `transaction.changeHistory[]` — log permanen **append-only**, isinya cuma perubahan yang **benar-benar diterapkan** (yang di-APPROVE). Pengajuan yang di-REJECT tidak pernah masuk ke sini.

**Konsekuensi langsung ke URL:** parameter `:id` di **semua** endpoint `/transaction-change-requests/:id*` di bawah **adalah `_id` milik `Transaction`**, bukan id entity lain. Dan **response dari kelima endpoint di modul ini selalu `{ transaction: {...} }`** (bentuk Transaction penuh seperti di dokumen POS core), tidak pernah ada object `changeRequest` berdiri sendiri yang dikembalikan terpisah.

---

## 1. Ringkasan 5 Endpoint

| Method | Endpoint | Role | Catatan |
|---|---|---|---|
| POST | `/api/v1/transactions/:id/change-requests` | HOST, AGENT (cabang sendiri) | Ajukan koreksi |
| GET | `/api/v1/transaction-change-requests` | **HOST only** | List semua yang `PENDING`, lintas cabang |
| GET | `/api/v1/transaction-change-requests/:id` | HOST, atau **AGENT yang mengajukan sendiri** | Lihat status satu pengajuan |
| POST | `/api/v1/transaction-change-requests/:id/approve` | **HOST only** | Tidak bisa approve pengajuan sendiri |
| POST | `/api/v1/transaction-change-requests/:id/reject` | **HOST only** | `reviewNote` wajib |

⚠️ **Subscription gating modul ini `ENFORCED` penuh** — beda dari dokumen POS core (`EXEMPT_AGENT`). Kalau subscription HOST nunggak (`PAST_DUE`/`EXPIRED`/`CANCELLED`), **AGENT JUGA kena `402`** di kelima endpoint ini, tidak dikecualikan seperti create/list/complete transaksi. PRD §23.4.1 sengaja mengunci modul ini untuk kedua role karena mengajukan/approve koreksi bukan bagian dari "menyelesaikan customer yang sedang di kursi".

---

## 2. POST /api/v1/transactions/:id/change-requests — Ajukan Koreksi

`:id` = id transaksi yang mau dikoreksi.

### Request

```json
{
  "reason": "Customer sebenarnya minta layanan Haircut + Beard Trim, salah input service",
  "requestedChanges": {
    "serviceId": "66bb22cc33dd44ee55ff6611",
    "discountAmount": 10000
  }
}
```

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `reason` | `string` | **Ya** | 1–1000 karakter |
| `requestedChanges` | `object` | **Ya** | **Minimal 1 key** harus diisi |
| `requestedChanges.serviceId` | `string` | Tidak | |
| `requestedChanges.customerId` | `string \| null` | Tidak | `null` valid — buat mengoreksi "transaksi ini seharusnya tanpa customer" atau sebaliknya |
| `requestedChanges.discountAmount` | `number` | Tidak | |
| `requestedChanges.serviceHourType` | `"REGULAR" \| "OVERTIME"` | Tidak | |

**Hanya 4 field di atas yang bisa diajukan.** `paymentMethod`, status, `branch`, `agent` **tidak bisa** dikoreksi lewat jalur ini sama sekali (schema `.strict()` menolak field lain dengan 400) — itu masing-masing punya mekanismenya sendiri (ganti metode bayar tidak ada endpoint-nya; status pakai complete/cancel; branch/agent permanen sejak transaksi dibuat).

### Response `201 Created`

```json
{
  "success": true,
  "data": {
    "transaction": {
      "_id": "671234abcd5678ef90123456",
      "transactionCode": "GRM-20261018-412837",
      "...": "... (field transaksi lain seperti biasa)",
      "changeRequest": {
        "status": "PENDING",
        "requestedBy": "66ab12cd34ef56ab78cd90aa",
        "reason": "Customer sebenarnya minta layanan Haircut + Beard Trim, salah input service",
        "requestedChanges": { "serviceId": "66bb22cc33dd44ee55ff6611", "discountAmount": 10000 },
        "requestedAt": "2026-10-18T09:00:00.000Z"
      }
    }
  }
}
```

Perhatikan: **field transaksi utama (`total`, `serviceSnapshot`, dst.) belum berubah sama sekali** di titik ini — pengajuan hanya "dicatat niatnya", efeknya baru benar-benar diterapkan kalau HOST approve (§5).

### Status Code

| Status | `error.code` | Kapan |
|---|---|---|
| `201` | — | Pengajuan tersimpan |
| `400` | `VALIDATION_ERROR` | `reason` kosong, `requestedChanges` kosong/semua field tidak diisi, atau ada field di luar whitelist |
| `401` | `UNAUTHENTICATED` | |
| `402` | `PAYMENT_REQUIRED` | Subscription HOST lapsed — **berlaku untuk AGENT juga** (lihat §1) |
| `403` | `FORBIDDEN` | AGENT dari cabang lain |
| `404` | `NOT_FOUND` | Transaksi tidak ditemukan |
| `409` | `CONFLICT` | Transaksi sudah `CANCELLED`, **atau sudah ada pengajuan `PENDING` lain yang masih aktif** (hanya 1 pengajuan aktif per transaksi) |
| `422` | `BUSINESS_RULE_VIOLATION` | `serviceId`/`customerId` yang diajukan tidak ada/tidak aktif |

Kalau dapat `409` karena sudah ada pengajuan `PENDING`, tidak ada cara "update" pengajuan yang sudah ada — harus menunggu HOST approve/reject dulu (§4/§5), baru bisa ajukan lagi dengan data yang benar.

---

## 3. GET /api/v1/transaction-change-requests — Antrian Approval (HOST)

**HOST only** (403 untuk AGENT — ini endpoint "kotak masuk approval" milik HOST, bukan untuk AGENT).

### Query Params

| Param | Default | Catatan |
|---|---|---|
| `page` | `1` | |
| `limit` | `20`, maks `100` | |

⚠️ **Tidak ada filter `branchId` di endpoint ini** — HOST dengan banyak cabang melihat **seluruh** pengajuan `PENDING` lintas cabang dalam satu list tanpa bisa difilter per cabang dari query. Kalau butuh grouping per cabang di UI, lakukan di sisi client dari field `transaction.branch` pada tiap item.

> ⚠️ **Grouping per cabang di client × pagination:** pengelompokan itu hanya berlaku atas halaman yang sudah di-fetch, jadi header grup bisa muncul berulang saat halaman berikutnya datang. Untuk antrian approval yang biasanya pendek, cara paling sederhana: kirim `limit=100` sekali, dan baru tangani paging kalau `totalPages > 1`.

> **Kontrak pagination endpoint ini tidak berubah** pada pembaruan 2026-10-19 — sudah sesuai standar sejak awal. Acuan lengkapnya di `AUTH-MOBILE-API-INTEGRATION.md` §2.1. Yang berubah: urutannya sekarang **stabil** (`changeRequest.requestedAt` desc + tie-breaker `_id`).
>
> Khusus endpoint ini ada satu hal yang perlu diperhatikan soal paging: **isi list berubah saat HOST bekerja.** Setiap approve/reject mengeluarkan satu baris dari antrian `PENDING`, sehingga `total` mengecil dan baris bergeser maju. Kalau HOST sedang di halaman 2 lalu menyetujui beberapa pengajuan, halaman 2 bisa jadi kosong. **Refetch dari halaman 1 setelah setiap aksi approve/reject**, jangan mempertahankan posisi halaman.

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
        "changeRequest": {
          "status": "PENDING",
          "requestedBy": { "_id": "66ab12cd34ef56ab78cd90aa", "name": "Budi Santoso" },
          "reason": "Customer sebenarnya minta layanan Haircut + Beard Trim, salah input service",
          "requestedChanges": { "serviceId": "66bb22cc33dd44ee55ff6611", "discountAmount": 10000 },
          "requestedAt": "2026-10-18T09:00:00.000Z"
        }
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
  }
}
```

⚠️ **Key array-nya `transactions`, bukan `changeRequests`** — konsisten dengan prinsip di §0 (yang dikembalikan selalu bentuk Transaction). Terurut dari pengajuan **terbaru** (`changeRequest.requestedAt` descending). Hanya pengajuan `PENDING` yang muncul di sini — yang sudah `APPROVED`/`REJECTED` tidak akan pernah tampil di list ini lagi (lihat §4 untuk cara melihat yang sudah diputuskan).

---

## 4. GET /api/v1/transaction-change-requests/:id — Detail Satu Pengajuan

`:id` = id transaksi (§0). Endpoint ini bisa dipakai untuk pengajuan yang masih `PENDING` **maupun** yang sudah `APPROVED`/`REJECTED` (untuk AGENT mengecek "pengajuan saya diterima/ditolak belum").

⚠️ **Aturan akses di sini BEDA dari pola "branch access" di endpoint lain** — bukan "HOST + AGENT cabang yang sama", tapi **"HOST + AGENT yang mengajukan pengajuan itu sendiri"**. AGENT lain di cabang yang sama yang BUKAN pengajunya akan tetap kena `403` walau satu cabang. Kalau app AGENT mau menampilkan "status pengajuan saya", simpan `transaction._id` dari response §2 saat submit, lalu panggil endpoint ini dengan id itu — jangan asumsikan semua AGENT di cabang bisa saling lihat status pengajuan satu sama lain.

| Status | `error.code` | Kapan |
|---|---|---|
| `200` | — | Sukses, body `{transaction}` |
| `401` | `UNAUTHENTICATED` | |
| `402` | `PAYMENT_REQUIRED` | Termasuk untuk AGENT (lihat §1) |
| `403` | `FORBIDDEN` | Bukan HOST dan bukan pengaju aslinya |
| `404` | `NOT_FOUND` | Transaksi tidak ada, **atau transaksi ada tapi belum pernah punya pengajuan sama sekali** (`changeRequest.status === "NONE"`) — dua kasus ini dibalas pesan error yang sama, tidak bisa dibedakan dari response-nya |

---

## 5. POST /api/v1/transaction-change-requests/:id/approve — Setujui

**HOST only.** Body (keduanya optional):

```json
{
  "reviewNote": "Dicek dengan customer, benar salah input service",
  "approvalReference": "WA-chat-2026-10-18"
}
```

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `reviewNote` | `string` | Tidak | Maks 1000 karakter |
| `approvalReference` | `string` | Tidak | Maks 255 karakter — referensi bebas (nomor tiket, link chat, dsb.) |

### Apa yang Terjadi Saat Approve

1. **Service/customer yang diajukan divalidasi ULANG** (bukan cuma mengandalkan validasi saat submit di §2) — kalau di antara waktu submit dan approve service/customer itu jadi tidak aktif/terhapus, approve akan gagal `422` meski submission-nya dulu sukses.
2. Kalau yang diajukan menyangkut `serviceId`/`discountAmount`: `subtotal`/`total`/`ownerRevenue`/`employeeRevenue`/`serviceSnapshot` **dihitung ulang dari awal** (formula sama seperti saat create, lihat `TRANSACTION-MOBILE-API-INTEGRATION.md` §1) dan **benar-benar menggantikan** nilai lama di transaksi.
3. Satu entry baru ditambahkan ke `transaction.changeHistory[]` (permanen, berisi snapshot `before`/`after`).
4. `changeRequest.status` jadi `APPROVED`, tercatat `reviewedBy`/`reviewNote`/`reviewedAt`.

Response `200`: `{transaction}` — sudah mencerminkan nilai BARU (bukan nilai sebelum approve).

⚠️ **`pointsEarned` TIDAK ikut dihitung ulang saat approve, dan poin loyalty yang sudah dikreditkan ke customer TIDAK ikut disesuaikan**, meskipun `total` transaksinya berubah. Kalau transaksi itu sudah `PAID` sebelum di-approve (poinnya sudah masuk ke saldo customer berdasarkan `total` LAMA), approve yang mengubah harga tidak mengoreksi poin yang sudah terlanjur diberikan — ini gap yang ada di backend saat ini, bukan sesuatu yang perlu "ditunggu" di sisi app. Kalau ini penting untuk bisnis HOST, perlu proses manual terpisah atau follow-up ke tim backend, bukan sesuatu yang bisa diperbaiki dari sisi Flutter.

### Status Code

| Status | `error.code` | Kapan |
|---|---|---|
| `200` | — | Disetujui & diterapkan |
| `400` | `VALIDATION_ERROR` | `reviewNote`/`approvalReference` melebihi panjang maksimal |
| `403` | `FORBIDDEN` | Bukan HOST, **atau HOST yang sama dengan pengaju mencoba approve pengajuannya sendiri** (pemisahan tugas — lihat PRD §10.2) |
| `404` | `NOT_FOUND` | Transaksi tidak ditemukan |
| `409` | `CONFLICT` | Pengajuan sudah bukan `PENDING` lagi (sudah diputuskan sebelumnya) |
| `422` | `BUSINESS_RULE_VIOLATION` | Service/customer yang diajukan sudah tidak tersedia **di saat approve ini** (lihat poin 1 di atas) |

⚠️ **Kalau kena `422` di sini, pengajuan TETAP `PENDING`** — tidak otomatis gagal/ditolak. Karena hanya boleh ada 1 pengajuan `PENDING` aktif per transaksi (§2), AGENT tidak bisa mengajukan ulang dengan data yang benar sampai pengajuan ini diputuskan. Sediakan di UI HOST: kalau approve gagal `422`, tawarkan opsi **Reject** (§6) sebagai jalan keluar supaya AGENT bisa mengajukan ulang, karena tidak ada mekanisme "edit pengajuan yang sudah ada".

---

## 6. POST /api/v1/transaction-change-requests/:id/reject — Tolak

**HOST only.** Body:

```json
{ "reviewNote": "Service yang diminta tidak tersedia di cabang ini" }
```

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `reviewNote` | `string` | **Ya** | 1–1000 karakter — beda dari approve, di sini **wajib** diisi (alasan tolak harus tercatat) |

Transaksi **tidak disentuh sama sekali** — hanya `changeRequest.status` jadi `REJECTED` + `reviewedBy`/`reviewNote`/`reviewedAt`. Tidak ada entry baru di `changeHistory` (karena memang tidak ada yang diterapkan).

Setelah ditolak, `changeRequest.status` tidak lagi `PENDING` — AGENT **bisa langsung mengajukan pengajuan baru** pada transaksi yang sama (§2) tanpa terhalang status `REJECTED` sebelumnya.

| Status | `error.code` | Kapan |
|---|---|---|
| `200` | — | Ditolak |
| `400` | `VALIDATION_ERROR` | `reviewNote` kosong/tidak dikirim |
| `403` | `FORBIDDEN` | Bukan HOST |
| `404` | `NOT_FOUND` | Transaksi tidak ditemukan |
| `409` | `CONFLICT` | Pengajuan sudah bukan `PENDING` lagi |

---

## 7. Catatan Implementasi Flutter

- **Jangan bangun model `ChangeRequest` dengan `id` sendiri** — semua state-nya adalah bagian dari model `Transaction` yang sudah ada (field `changeRequest` dan `changeHistory`). Reuse model Transaction dari `TRANSACTION-MOBILE-API-INTEGRATION.md`, jangan buat entity baru.
- **Untuk layar "status pengajuan saya" (AGENT):** simpan `transaction._id` begitu submit (§2) sukses, lalu pakai id itu untuk polling/cek ulang via §4. Jangan desain layar "daftar pengajuan saya" dari `GET /transaction-change-requests` — endpoint itu `403` untuk AGENT.
- **Untuk layar approval HOST:** `GET /transaction-change-requests` (§3) adalah satu-satunya sumber antrian, dan tidak bisa difilter per cabang dari server — kalau HOST punya banyak cabang dan mau grouping, lakukan di client.
- **Tombol Approve di UI HOST harus siap menangani `422`** sebagai hasil yang valid (bukan cuma `400`/`500` generic) — lihat peringatan di §5 soal pengajuan yang tetap `PENDING` dan perlunya fallback ke Reject.
- **402 di modul ini berlaku untuk AGENT juga** (§1) — beda dari dokumen POS core. Kalau app sudah punya state "terkunci karena subscription" untuk HOST, state yang sama harus berlaku untuk AGENT khusus di layar submit-pengajuan ini, meskipun AGENT itu bebas membuat transaksi baru seperti biasa.
