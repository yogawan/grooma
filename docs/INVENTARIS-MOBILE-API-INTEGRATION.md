# Integrasi Mobile (Flutter) — Grooma API — Modul Inventaris

> Dokumen ini khusus modul **Inventaris**: CRUD item + riwayat pergerakan stok (stock movements). Base URL, model sesi cookie, dan setup `dio` **tidak diulang di sini** — lihat `docs/AUTH-MOBILE-API-INTEGRATION.md` bagian 1–2.

---

## 0. Ringkasan

| Method | Endpoint | Role | Catatan |
|---|---|---|---|
| GET | `/api/v1/inventory` | HOST, AGENT (cabang sendiri) | |
| POST | `/api/v1/inventory` | HOST, AGENT (cabang sendiri) | |
| GET | `/api/v1/inventory/:id` | HOST, AGENT (cabang sendiri) | |
| PATCH | `/api/v1/inventory/:id` | HOST, AGENT (cabang sendiri) | **`quantity` tidak bisa diubah lewat sini** |
| DELETE | `/api/v1/inventory/:id` | HOST, AGENT (cabang sendiri) | Soft-delete (`isActive: false`), bukan hapus permanen |
| GET | `/api/v1/inventory/:id/stock-movements` | HOST, AGENT (cabang sendiri) | Riwayat pergerakan stok |
| POST | `/api/v1/inventory/:id/stock-movements` | HOST, AGENT (cabang sendiri) | **Satu-satunya cara mengubah `quantity`** |

⚠️ **Subscription gating modul ini `ENFORCED` penuh** (sama seperti Dashboard dan Change Requests, **beda** dari modul Transaksi POS core yang `EXEMPT_AGENT`). Kalau subscription HOST nunggak, **AGENT JUGA kena `402`** di seluruh endpoint inventaris ini — tidak ada pengecualian untuk AGENT di modul ini (PRD §23.4.1).

---

## 1. GET /api/v1/inventory — List Item

### Query Params

| Param | Tipe | Default | Catatan |
|---|---|---|---|
| `page` | `integer` | `1` | |
| `limit` | `integer` | `20` | Maks `100` |
| `branchId` | `string` | — | **HOST only** — diabaikan untuk AGENT |
| `search` | `string` | — | Cocok ke **`name`** (bukan `itemCode`), case-insensitive, substring |
| `lowStockOnly` | `boolean` | — | `true` = hanya item dengan `quantity <= minimumStock` |

Terurut alfabetis berdasarkan `name` (bukan terbaru, bukan quantity).

### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "_id": "66cc00112233445566778899",
        "id": "66cc00112233445566778899",
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
    ],
    "pagination": { "page": 1, "limit": 20, "total": 47, "totalPages": 3 }
  }
}
```

Key array-nya **`items`** — beda dengan endpoint `GET /dashboard/inventory` (dokumen Dashboard) yang key-nya `inventory`. Dua endpoint berbeda, dua nama key berbeda, jangan ketukar saat parsing.

`totalValue` (`quantity * unitCost`) dan `isLowStock` (`quantity <= minimumStock`) adalah **virtual field** — sudah dihitung backend, tidak perlu dihitung ulang di app.

⚠️ **Tidak ada filter `isActive` di endpoint ini, dan tidak ada query param untuk menyaring berdasarkan status aktif.** Item yang sudah di-soft-delete (`isActive: false`, lihat §5) **tetap muncul** di list ini secara default — tidak otomatis disembunyikan. Kalau app mau tampilan "item aktif saja", itu harus difilter **di sisi client** dari field `isActive` pada tiap item, karena server tidak menyediakan toggle untuk ini.

---

## 2. POST /api/v1/inventory — Tambah Item

### Request Body

```json
{
  "itemCode": "INV-0013",
  "branchId": "66ffaa0011223344556677aa",
  "name": "Shampoo Anti Ketombe 200ml",
  "category": "HAIR_PRODUCT",
  "unit": "PCS",
  "quantity": 10,
  "unitCost": 25000,
  "minimumStock": 5,
  "supplier": "PT Sumber Rambut"
}
```

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `itemCode` | `string` | **Ya** | 1–32 karakter, **harus unik di seluruh sistem** (409 kalau sudah dipakai) |
| `branchId` | `string` | **Wajib untuk HOST**, diabaikan untuk AGENT | HOST tidak punya "cabang sendiri" jadi harus menyebutkan cabang tujuan secara eksplisit; AGENT selalu memakai cabang dari sesi login-nya apapun yang dikirim |
| `name` | `string` | **Ya** | 1–100 karakter |
| `category` | `"HAIR_PRODUCT"\|"EQUIPMENT"\|"CONSUMABLE"\|"OTHER"` | Tidak | Default `"OTHER"` kalau tidak dikirim |
| `unit` | `string` | Tidak | Default `"PCS"` |
| `quantity` | `integer` | Tidak | Default `0`. **Kalau diisi > 0, otomatis tercatat sebagai 1 stock movement `IN`** dengan alasan "Initial stock on item creation" — lihat §6 |
| `unitCost` | `number` | Tidak | Default `0` |
| `minimumStock` | `integer` | Tidak | Default `5` (dari sisi server kalau tidak dikirim) |
| `supplier` | `string` | Tidak | Maks 100 karakter |

Schema **strict** — field asing ditolak 400.

### Status Code

| Status | `error.code` | Kapan |
|---|---|---|
| `201` | — | Sukses, body `{item}` |
| `400` | `VALIDATION_ERROR` | Field tidak sesuai schema, **atau HOST tidak mengirim `branchId`**, **atau `branchId` yang dikirim tidak ada cabangnya** |
| `403` | `FORBIDDEN` | Bukan HOST/AGENT |
| `409` | `CONFLICT` | `itemCode` sudah dipakai item lain |
| `422` | `BUSINESS_RULE_VIOLATION` | AGENT belum punya cabang ditugaskan (kasus langka) |

---

## 3. GET /api/v1/inventory/:id — Detail Item

Bentuk response identik satu item di `items[]` pada §1, dibungkus `{ item: {...} }`.

| Status | Kapan |
|---|---|
| `200` | Sukses |
| `403` | AGENT dari cabang lain |
| `404` | Item tidak ditemukan |

---

## 4. PATCH /api/v1/inventory/:id — Update Item

### Request Body (semua optional)

| Field | Tipe | Catatan |
|---|---|---|
| `name` | `string` | 1–100 karakter |
| `category` | enum | |
| `unit` | `string` | Maks 20 karakter |
| `unitCost` | `number` | |
| `minimumStock` | `integer` | |
| `supplier` | `string` | Maks 100 karakter |

⚠️ **`itemCode` immutable (tidak ada di schema ini), dan `quantity` TIDAK BISA diubah lewat endpoint ini sama sekali** — field itu bahkan tidak dikenal oleh schema (dikirim pun akan ditolak 400 karena strict). Satu-satunya cara mengubah jumlah stok adalah lewat `POST .../stock-movements` (§7), supaya setiap perubahan jumlah selalu punya jejak audit. Jangan bikin form edit item yang punya field quantity langsung-edit — harus lewat alur stock movement.

Endpoint ini **tidak mengecek `isActive`** — item yang sudah di-soft-delete tetap bisa diedit field-field di atas (tidak diblokir seperti stock-movements di §7).

| Status | Kapan |
|---|---|
| `200` | Sukses, body `{item}` |
| `400` | Validasi gagal |
| `403` | AGENT dari cabang lain |
| `404` | Item tidak ditemukan |

---

## 5. DELETE /api/v1/inventory/:id — Soft Delete

HTTP method-nya `DELETE` sungguhan, tapi **tidak pernah menghapus data** — hanya set `isActive: false`. Response `200` (bukan `204`), isinya `{item}` (item yang sudah berstatus nonaktif), bukan body kosong.

Setelah soft-delete:
- Item **tetap muncul** di `GET /inventory` (§1 — tidak ada filter `isActive` otomatis).
- Field-fieldnya **masih bisa di-PATCH** (§4).
- **Tidak bisa** lagi menerima stock movement baru (§7 akan menolak dengan `422`).

| Status | Kapan |
|---|---|
| `200` | Sukses |
| `403` | AGENT dari cabang lain |
| `404` | Item tidak ditemukan |

---

## 6. GET /api/v1/inventory/:id/stock-movements — Riwayat Pergerakan Stok

### Query Params

Hanya `page`/`limit` (maks 100) — tidak ada filter `movementType` atau tanggal. Terurut dari yang terbaru.

### Response `200 OK`

```json
{
  "success": true,
  "data": {
    "movements": [
      {
        "_id": "66dd11223344556677889900",
        "inventory": "66cc00112233445566778899",
        "branch": "66ffaa0011223344556677aa",
        "movementType": "OUT",
        "quantity": 3,
        "previousQuantity": 10,
        "newQuantity": 7,
        "reason": "Dipakai untuk layanan hari ini",
        "performedBy": { "_id": "66ab12cd34ef56ab78cd90aa", "name": "Budi Santoso" },
        "createdAt": "2026-10-18T07:00:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 12, "totalPages": 1 }
  }
}
```

Bisa diakses meski item-nya sudah di-soft-delete (§5) — melihat riwayat lama tidak diblokir, cuma bikin riwayat baru yang diblokir.

---

## 7. POST /api/v1/inventory/:id/stock-movements — Catat Pergerakan Stok

**Satu-satunya cara mengubah `quantity` sebuah item.** Body-nya **berbeda bentuk tergantung `movementType`** — perhatikan field mana yang dipakai di masing-masing:

| `movementType` | Field jumlah | Artinya | Field lain |
|---|---|---|---|
| `"IN"` | `quantity` (angka positif) | **Tambahan** — barang masuk, `quantity` baru = lama + ini | `reason` (1–500 char) |
| `"OUT"` | `quantity` (angka positif) | **Pengurangan** — barang keluar/dipakai, `quantity` baru = lama − ini | `reason` (1–500 char) |
| `"ADJUSTMENT"` | `newQuantity` (integer ≥ 0) | **Nilai akhir absolut** — hasil stock-take fisik, langsung jadi nilai baru (bukan delta) | `reason` (1–500 char) |

⚠️ **`IN`/`OUT` pakai field `quantity` (delta/selisih), `ADJUSTMENT` pakai field `newQuantity` (nilai akhir) — dua field yang berbeda nama, jangan asal kirim `quantity` untuk ketiganya.** Schema-nya `discriminatedUnion` berdasarkan `movementType`, jadi kirim field yang salah (mis. `newQuantity` untuk `IN`) akan ditolak `400`.

### Contoh Request

**IN** (barang masuk/restock):
```json
{ "movementType": "IN", "quantity": 20, "reason": "Restock dari supplier" }
```

**OUT** (barang keluar/terpakai):
```json
{ "movementType": "OUT", "quantity": 3, "reason": "Dipakai untuk layanan hari ini" }
```

**ADJUSTMENT** (koreksi hasil stock-take fisik):
```json
{ "movementType": "ADJUSTMENT", "newQuantity": 15, "reason": "Koreksi setelah stock-take fisik bulanan" }
```

### Response `201 Created`

```json
{
  "success": true,
  "data": {
    "item": { "...": "... (item dengan quantity sudah terupdate)" },
    "movement": {
      "_id": "66dd11223344556677889911",
      "inventory": "66cc00112233445566778899",
      "branch": "66ffaa0011223344556677aa",
      "movementType": "IN",
      "quantity": 20,
      "previousQuantity": 7,
      "newQuantity": 27,
      "reason": "Restock dari supplier",
      "performedBy": "66ab12cd34ef56ab78cd90aa",
      "createdAt": "2026-10-18T09:30:00.000Z"
    }
  }
}
```

⚠️ **`movement.quantity` yang DISIMPAN/dikembalikan selalu angka selisih absolut (`|newQuantity - previousQuantity|`), tidak pernah negatif** — ini juga berlaku untuk `ADJUSTMENT`, meskipun request-nya mengirim `newQuantity`, bukan `quantity`. Kalau mau tahu arah perubahannya (naik/turun) untuk `ADJUSTMENT`, bandingkan sendiri `newQuantity` vs `previousQuantity` pada movement itu — jangan andalkan tanda `quantity` karena memang selalu positif.

Response ini populated `performedBy` sebagai ObjectId mentah (bukan `{_id, name}`) — beda dengan response list movements di §6 yang sudah populated. Kalau butuh nama langsung, pakai data user yang sedang login (karena `performedBy` selalu user yang memanggil endpoint ini).

### Status Code

| Status | `error.code` | Kapan |
|---|---|---|
| `201` | — | Sukses |
| `400` | `VALIDATION_ERROR` | Field salah untuk `movementType` yang dikirim, atau `reason` kosong |
| `403` | `FORBIDDEN` | AGENT dari cabang lain |
| `404` | `NOT_FOUND` | Item tidak ditemukan |
| `422` | `BUSINESS_RULE_VIOLATION` | Item sudah `isActive: false` (§5), **atau** `OUT`/`ADJUSTMENT` yang hasilnya bikin stok jadi negatif |

Operasi ini atomic (transaksi MongoDB) dan otomatis retry kalau ada dua adjustment bersamaan ke item yang sama — tidak perlu app menangani race condition ini sendiri, cukup kirim request seperti biasa.

---

## 8. Status Code — Ringkasan Semua Endpoint

| Status | `error.code` | Catatan |
|---|---|---|
| `400` | `VALIDATION_ERROR` | |
| `401` | `UNAUTHENTICATED` | |
| `402` | `PAYMENT_REQUIRED` | **Berlaku untuk HOST maupun AGENT** (§0) |
| `403` | `FORBIDDEN` | Role salah atau beda cabang |
| `404` | `NOT_FOUND` | |
| `409` | `CONFLICT` | Hanya saat create — `itemCode` duplikat |
| `422` | `BUSINESS_RULE_VIOLATION` | Agent tanpa cabang, item inactive, atau stok akan negatif |
| `500` | `INTERNAL_ERROR` | |

---

## 9. Catatan Implementasi Flutter

- **Selalu tampilkan badge/indikator `isActive`** di list item — item nonaktif tidak otomatis hilang dari `GET /inventory` (§1), jadi UI yang tidak menandainya akan terlihat seperti stok normal padahal sudah "dihapus".
- **Form stock movement sebaiknya punya 3 varian field, bukan 1 field generik** — pilih `movementType` dulu (IN/OUT/ADJUSTMENT) baru tampilkan field yang sesuai (`quantity` untuk IN/OUT, `newQuantity` untuk ADJUSTMENT). Jangan kirim `quantity` untuk ADJUSTMENT, akan ditolak 400.
- **Form tambah item untuk role HOST wajib ada picker cabang** (karena `branchId` wajib), **untuk AGENT sembunyikan field itu** (toh diabaikan backend, dan kalau sampai jadi bingung UI malah salah arah).
- **402 di modul ini menimpa AGENT juga** (§0) — beda dari modul Transaksi POS core. Kalau app sudah punya state "terkunci karena subscription" untuk HOST, state yang sama harus berlaku untuk AGENT di seluruh layar inventaris.
- Setelah berhasil POST stock-movement, response sudah mengembalikan `item` yang ter-update — tidak perlu fetch ulang `GET /inventory/:id` secara terpisah untuk refresh angka quantity di UI.
