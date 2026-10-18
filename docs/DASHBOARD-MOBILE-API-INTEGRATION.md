# Integrasi Mobile (Flutter) — Grooma API — Modul Dashboard

> Dokumen ini khusus modul **Dashboard** (6 endpoint analitik, semua `GET`). Base URL, model sesi cookie, dan cara setup `dio` + cookie jar **tidak diulang di sini** — lihat `docs/AUTH-MOBILE-API-INTEGRATION.md` bagian 1–2, wajib dibaca dulu karena setiap endpoint di bawah butuh cookie sesi yang valid.

---

## 0. Ringkasan 6 Endpoint

| Method | Endpoint | Isi | Scope HOST | Scope AGENT |
|---|---|---|---|---|
| GET | `/api/v1/dashboard/summary` | Total revenue, jumlah transaksi, AOV, unique customer | Semua cabang (atau 1 cabang via `branchId`) | Cabang sendiri saja |
| GET | `/api/v1/dashboard/revenue` | Revenue per periode + breakdown metode bayar | sda | sda |
| GET | `/api/v1/dashboard/services` | Top 10 layanan terlaris by revenue | sda | sda |
| GET | `/api/v1/dashboard/agents` | Performa per AGENT | Semua AGENT (atau 1 via `agentId`) | **Diri sendiri saja** |
| GET | `/api/v1/dashboard/transactions` | Jumlah transaksi per status/payment status/metode bayar | Semua cabang (atau 1 via `branchId`) | Cabang sendiri saja |
| GET | `/api/v1/dashboard/inventory` | Item stok yang sudah di/di bawah `minimumStock`, maks 20 | Semua cabang (atau 1 via `branchId`) | Cabang sendiri saja |

Semua endpoint: **tidak ada request body**, auth lewat cookie `grooma_session`, dan **digerbangi subscription HOST** — beda dari beberapa endpoint POS lain, keenam endpoint ini pakai policy `ENFORCED` penuh: kalau subscription HOST berstatus `PAST_DUE`/`EXPIRED`/`CANCELLED`, **HOST *dan* AGENT sama-sama kena 402** di seluruh modul ini (§23.4.1 PRD — dashboard sengaja tidak termasuk endpoint yang dikecualikan buat AGENT).

---

## 1. Headers (sama di keenam endpoint)

| Header | Wajib | Value |
|---|---|---|
| Cookie `grooma_session` | Ya (otomatis lewat cookie jar) | — |
| `Accept` | Disarankan | `application/json` |

Tidak ada `Content-Type`/body — semua parameter dikirim lewat **query string**.

---

## 2. Query Params Umum — summary, revenue, services, agents, transactions

Kelima endpoint ini (**kecuali `inventory`**, yang param-nya beda sendiri — lihat §3.6) berbagi schema query yang sama persis:

| Param | Tipe | Default | Catatan |
|---|---|---|---|
| `period` | `DAY \| WEEK \| MONTH \| YEAR` | `MONTH` | Diabaikan kalau `from` dikirim (lihat catatan di bawah) |
| `from` | `string` (ISO 8601) | — | Dikirim via `z.coerce.date()` — kirim format ISO 8601, mis. `2026-10-01` atau `2026-10-01T00:00:00.000Z` |
| `to` | `string` (ISO 8601) | `now` | Kalau tidak dikirim, default ke waktu request saat ini |
| `compare` | `boolean` | `false` | **Diterima tapi belum diimplementasikan — tidak berpengaruh ke response sama sekali.** Jangan bangun UI "bandingkan periode" berdasarkan param ini dulu. |
| `branchId` | `string` | — | **HOST only.** Untuk AGENT, param ini diterima tapi **diabaikan diam-diam** (tidak error) — branch yang dipakai selalu dari sesi login AGENT itu sendiri. |
| `agentId` | `string` | — | **HOST only, dan hanya berpengaruh di `/dashboard/agents`.** Di keempat endpoint lain (summary/revenue/services/transactions) param ini diterima oleh validasi tapi **tidak dipakai sama sekali** oleh endpoint tersebut. Untuk AGENT, selalu dipaksa ke dirinya sendiri. |

**Soal `period` vs `from`/`to` secara presisi:** `period` cuma dipakai untuk menghitung `from` ketika `from` **tidak** dikirim (mundur dari `to` sebesar 1 hari/7 hari/1 bulan/1 tahun). Begitu `from` dikirim — dengan atau tanpa `to` — `period` diabaikan total.

Validasi: kalau `from` dan `to` dikirim bersamaan, `from` harus ≤ `to`, atau request ditolak `400`. Semua query ini **strict** — field query selain yang terdaftar di atas akan ditolak `400`.

---

## 3. Detail per Endpoint

### 3.1. GET /api/v1/dashboard/summary

Headline totals untuk periode yang dipilih. **Transaksi `CANCELLED` selalu dikeluarkan dari hitungan** (berlaku di seluruh modul ini kecuali `inventory`), dan `totalRevenue`/`avgOrderValue` hanya menghitung transaksi dengan `paymentStatus: PAID`.

```
GET /api/v1/dashboard/summary?period=MONTH
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalRevenue": 4250000,
      "transactionCount": 38,
      "avgOrderValue": 111842,
      "uniqueCustomers": 29
    }
  }
}
```

Kalau tidak ada transaksi sama sekali di rentang tersebut, **tetap `200`** dengan semua nilai `0` (bukan `404`/objek kosong).

### 3.2. GET /api/v1/dashboard/revenue

```
GET /api/v1/dashboard/revenue?period=MONTH
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "revenue": {
      "byPeriod": [
        {
          "_id": { "year": 2026, "month": 10 },
          "revenue": 4250000,
          "transactionCount": 38,
          "ownerRevenue": 2975000,
          "agentRevenue": 1275000
        }
      ],
      "paymentBreakdown": [
        { "_id": "CASH", "count": 20, "revenue": 2100000 },
        { "_id": "QRIS", "count": 18, "revenue": 2150000 }
      ]
    }
  }
}
```

⚠️ **Bentuk `_id` di `byPeriod` berubah tergantung `period`** — ini bukan bug, tapi harus ditangani berbeda saat parsing untuk chart:

| `period` | Bentuk `_id` | Contoh |
|---|---|---|
| `DAY` | `string` (`"YYYY-MM-DD"`) | `"2026-10-15"` |
| `WEEK` | `{ year: number, week: number }` | `{ "year": 2026, "week": 41 }` |
| `MONTH` | `{ year: number, month: number }` | `{ "year": 2026, "month": 10 }` |
| `YEAR` | `number` | `2026` |

`paymentBreakdown[]._id` selalu salah satu dari `"CASH" \| "QRIS"`.

### 3.3. GET /api/v1/dashboard/services

Top 10 layanan terlaris by revenue pada periode tersebut, urut descending.

```
GET /api/v1/dashboard/services?period=MONTH
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "services": [
      {
        "_id": "66ab12cd34ef56ab78cd90ef",
        "serviceName": "Haircut + Styling",
        "count": 15,
        "revenue": 1500000,
        "avgOrderValue": 100000
      }
    ]
  }
}
```

`serviceName` adalah **snapshot nama service saat transaksi dibuat** (`serviceSnapshot.name`), bukan nama service saat ini — kalau nama service pernah diganti setelah transaksi lama tercatat, baris lama tetap menampilkan nama lama. Maksimal 10 item, tidak ada pagination di endpoint ini.

### 3.4. GET /api/v1/dashboard/agents

```
GET /api/v1/dashboard/agents?period=MONTH
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "_id": "66ab12cd34ef56ab78cd90aa",
        "agentName": "66ab12cd34ef56ab78cd90aa",
        "transactionCount": 22,
        "totalRevenue": 2450000,
        "agentRevenue": 735000
      }
    ]
  }
}
```

🐛 **Bug yang diketahui:** `agentName` **bukan nama agent** — nilainya persis sama dengan `_id` (ObjectId mentah), karena query aggregate-nya tidak pernah join/populate ke koleksi `users`. Kalau butuh nama agent untuk ditampilkan di UI, ambil dari `GET /users/:id` memakai `_id` dari sini (atau dari daftar `/users` yang sudah di-fetch sebelumnya), jangan render `agentName` langsung ke layar. Tidak di-limit (beda dari `/services` yang dibatasi 10) — untuk HOST dengan banyak AGENT, siapkan UI list yang scrollable.

AGENT yang hit endpoint ini **hanya pernah melihat satu baris** (dirinya sendiri), berapa pun `agentId` yang dikirim.

### 3.5. GET /api/v1/dashboard/transactions

```
GET /api/v1/dashboard/transactions?period=MONTH
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "stats": {
      "byStatus": [
        { "_id": "COMPLETED", "count": 35 },
        { "_id": "PENDING", "count": 3 }
      ],
      "byPaymentStatus": [
        { "_id": "PAID", "count": 36 },
        { "_id": "PENDING", "count": 2 }
      ],
      "byPaymentMethod": [
        { "_id": "CASH", "count": 20 },
        { "_id": "QRIS", "count": 18 }
      ]
    }
  }
}
```

`byStatus` **tidak akan pernah memuat `"CANCELLED"`** — transaksi yang dibatalkan sudah difilter keluar sebelum pengelompokan ini jalan (berlaku di §3.1–§3.5, bukan cuma endpoint ini). Kalau tidak ada data pada rentang tersebut, ketiga array ini kembali kosong `[]`, tetap `200`.

### 3.6. GET /api/v1/dashboard/inventory

Endpoint ini **beda sendiri** — bukan bagian dari 5 endpoint berbasis periode di atas, query param-nya juga beda:

| Param | Tipe | Default | Catatan |
|---|---|---|---|
| `branchId` | `string` | — | HOST only, diabaikan untuk AGENT (selalu branch sesi) |
| `threshold` | `number` | `0` | **Diterima tapi tidak dipakai sama sekali.** Ambang "low stock" selalu `quantity <= minimumStock` milik tiap item sendiri-sendiri, bukan dari angka `threshold` ini. |

```
GET /api/v1/dashboard/inventory
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "inventory": [
      {
        "_id": "66cc00112233445566778899",
        "itemCode": "INV-0012",
        "branch": { "_id": "66ffaa0011223344556677aa", "name": "Cabang Kemang" },
        "name": "Pomade Matte 100g",
        "category": "HAIR_PRODUCT",
        "unit": "PCS",
        "quantity": 2,
        "unitCost": 35000,
        "minimumStock": 5,
        "supplier": "PT Sumber Rambut",
        "isActive": true,
        "totalValue": 70000,
        "isLowStock": true,
        "createdAt": "2026-09-01T03:00:00.000Z",
        "updatedAt": "2026-10-14T06:12:00.000Z"
      }
    ]
  }
}
```

Catatan isi:
- Ini **bukan** ringkasan seluruh inventaris — hanya item **aktif** dan **sedang low-stock** (`quantity <= minimumStock`), maksimal **20 item**, urut quantity paling sedikit dulu. Untuk daftar inventaris lengkap, itu endpoint `/inventory` biasa (di luar scope dokumen ini).
- `isLowStock` di response ini **selalu `true`** untuk setiap baris (konsekuensi dari filter di atas) — field ini bawaan dari model Inventory, bukan sesuatu yang dihitung khusus untuk endpoint ini.
- Tidak ada query `period`/`from`/`to` di endpoint ini — status stok memang kondisi "sekarang", bukan historis.

---

## 4. Status Code (sama di keenam endpoint)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "from: ..."
  }
}
```

| Status | `error.code` | Kapan terjadi |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Query param di luar schema, tipe salah, atau `from` > `to` |
| `401` | `UNAUTHENTICATED` | Tidak ada/kedaluwarsa cookie sesi — sama seperti endpoint lain, lihat `AUTH-MOBILE-API-INTEGRATION.md` |
| `402` | `PAYMENT_REQUIRED` | Subscription HOST sedang `PAST_DUE`/`EXPIRED`/`CANCELLED` — **berlaku untuk HOST maupun AGENT** di keenam endpoint ini |
| `403` | `FORBIDDEN` | Role login bukan `HOST`/`AGENT` — dalam praktik tidak akan pernah terjadi dari app mobile, karena backend ini memang hanya pernah mengeluarkan sesi untuk dua role itu |
| `500` | `INTERNAL_ERROR` | Error tak terduga di server |

---

## 5. Catatan Implementasi Flutter

- **Satu set widget chart/tabel bisa dipakai untuk HOST & AGENT** — endpoint dan bentuk response-nya identik untuk kedua role, yang beda cuma *scope data*-nya (ditentukan backend dari sesi, bukan dari query yang dikirim app). Untuk AGENT, cukup **sembunyikan** filter `branchId`/`agentId` di UI — mengirimnya pun tidak akan error, hanya tidak berefek (lihat §2).
- **Parsing `byPeriod` di `/revenue` harus cabang 4 jalur** sesuai `period` yang dipakai saat request (lihat tabel di §3.2) — jangan asumsikan `_id` selalu object.
- **State "terkunci karena subscription"** dibutuhkan di tab Dashboard **baik untuk HOST maupun AGENT** (beda dari beberapa tab lain yang cuma HOST yang terkunci) — lihat juga catatan di `docs/MOBILE-BOTTOM-NAVBAR.md`. Tangani `402` secara eksplisit di layer dashboard, jangan digabung begitu saja dengan handler `401` global.
- Ini data analitik, bukan push realtime — pola yang wajar: fetch saat tab dibuka/di-resume, tambahkan pull-to-refresh, tidak perlu polling berkala.
- Jangan render `agents[].agentName` langsung (lihat bug di §3.4); dan jangan bangun kontrol UI untuk `compare` (§2) atau `threshold` (§3.6) — dua param itu belum punya efek apa pun di backend saat ini.
