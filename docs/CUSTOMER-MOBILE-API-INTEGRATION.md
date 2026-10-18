# Integrasi Mobile (Flutter) — Grooma API — Modul Customer

> Dokumen ini khusus modul **Customer**. Base URL, model sesi cookie, dan setup `dio` **tidak diulang di sini** — lihat `docs/AUTH-MOBILE-API-INTEGRATION.md` bagian 1–2.

---

## 0. Dua Hal Penting yang Beda dari Modul Lain

1. **Customer TIDAK terikat cabang sama sekali.** Tidak ada field `branch` di model Customer, dan tidak ada pengecekan branch-access di endpoint manapun di modul ini (beda dari Transaksi/Inventaris yang selalu `requireBranchAccess`). Semua customer **dibagi lintas cabang** dalam satu bisnis — AGENT dari cabang manapun bisa lihat & edit customer yang sama, bukan cuma customer "milik" cabangnya.

2. **Bentuk response BEDA tergantung role yang login — bukan cuma soal boleh/tidak boleh akses.** 5 field (`email`, `gender`, `birthDate`, `address`, `notes`) **hanya muncul di response untuk HOST**. Untuk AGENT, kelima key itu **tidak ada sama sekali** di JSON (bukan `null`, bukan string kosong — key-nya benar-benar absen). Ini berlaku di **semua** endpoint yang mengembalikan data customer (list, detail, create, update, status), termasuk saat AGENT sendiri yang baru melakukan create/update. Jangan bikin model Dart dengan field-field itu sebagai non-nullable/required — parsing response AGENT akan gagal.

---

## 1. Ringkasan

| Method | Endpoint | Role | Subscription Policy |
|---|---|---|---|
| GET | `/api/v1/customers` | HOST, AGENT | `EXEMPT_AGENT` |
| POST | `/api/v1/customers` | HOST, AGENT | `EXEMPT_AGENT` |
| GET | `/api/v1/customers/:id` | HOST, AGENT | `EXEMPT_AGENT` |
| PATCH | `/api/v1/customers/:id` | HOST, AGENT | `EXEMPT_AGENT` |
| PATCH | `/api/v1/customers/:id/status` | **HOST only** | `ENFORCED` (default) — tidak relevan karena AGENT sudah `403` duluan |

4 dari 5 endpoint `EXEMPT_AGENT` — AGENT tetap bisa cari/buat/lihat/edit customer meski subscription HOST nunggak (bagian dari alur melayani customer yang sedang di tempat). Mengaktifkan/nonaktifkan customer murni keputusan administratif HOST, tidak dikecualikan.

---

## 2. GET /api/v1/customers — Cari/List Customer

### Query Params

| Param | Tipe | Catatan |
|---|---|---|
| `search` | `string` | Cocok ke `name` (regex, case-insensitive) **atau** `phone` (lihat normalisasi di §2.1) |

⚠️ **TIDAK ADA PAGINATION di endpoint ini** — tidak ada `page`/`limit` sama sekali. Kalau `search` tidak diisi, endpoint ini mengembalikan **SELURUH customer** dalam satu response, terurut alfabetis. Untuk bisnis yang sudah punya ribuan customer, ini bisa jadi payload besar.

**Rekomendasi:** jangan panggil endpoint ini tanpa `search` untuk kebutuhan "browse semua customer" — desain UI supaya AGENT/HOST selalu mengetik minimal beberapa karakter dulu (nama atau nomor HP) sebelum query dikirim, mis. debounce search-as-you-type dengan minimal 2–3 karakter. Kalau memang butuh daftar lengkap untuk ditampilkan sekaligus, siapkan virtualized list di sisi Flutter karena semua data datang dalam satu response.

### 2.1. Normalisasi Nomor HP — Tidak Perlu Dilakukan di Client

Backend otomatis mencocokkan varian format nomor Indonesia saat `search` maupun saat deteksi duplikat di create (§3): `0812xxxxxxx`, `62812xxxxxxx`, dan `+62812xxxxxxx` dianggap **nomor yang sama**. Kirim apa adanya dari input user, tidak perlu normalisasi manual di Flutter sebelum search/create.

### Response `200 OK`

**Dilihat oleh HOST** (semua field muncul):

```json
{
  "success": true,
  "data": {
    "customers": [
      {
        "id": "66aa11bb22cc33dd44ee55ff",
        "customerCode": null,
        "name": "Andi Wijaya",
        "phone": "6281234567890",
        "customerType": "REGULAR",
        "loyaltyPoints": 450,
        "lastVisitAt": "2026-10-10T09:00:00.000Z",
        "isActive": true,
        "email": "andi@example.com",
        "gender": "MALE",
        "birthDate": "1995-05-20T00:00:00.000Z",
        "address": "Jl. Kemang Raya No. 10",
        "notes": "Suka potongan fade",
        "createdAt": "2026-01-10T08:00:00.000Z",
        "updatedAt": "2026-10-10T09:00:00.000Z"
      }
    ]
  }
}
```

**Dilihat oleh AGENT** (5 key PII hilang total, bukan `null`):

```json
{
  "success": true,
  "data": {
    "customers": [
      {
        "id": "66aa11bb22cc33dd44ee55ff",
        "customerCode": null,
        "name": "Andi Wijaya",
        "phone": "6281234567890",
        "customerType": "REGULAR",
        "loyaltyPoints": 450,
        "lastVisitAt": "2026-10-10T09:00:00.000Z",
        "isActive": true,
        "createdAt": "2026-01-10T08:00:00.000Z",
        "updatedAt": "2026-10-10T09:00:00.000Z"
      }
    ]
  }
}
```

Perhatikan: tidak ada `"email": null` di response AGENT — key `email`/`gender`/`birthDate`/`address`/`notes` memang tidak dikirim sama sekali.

---

## 3. POST /api/v1/customers — Buat Customer

### Request Body

```json
{
  "name": "Siti Rahma",
  "phone": "081298765432",
  "email": "siti@example.com",
  "gender": "FEMALE",
  "birthDate": "1998-03-15",
  "address": "Jl. Melati No. 5",
  "notes": "Alergi produk tertentu"
}
```

| Field | Tipe | Wajib | Catatan |
|---|---|---|---|
| `name` | `string` | **Ya** | 1–100 karakter |
| `phone` | `string` | Tidak | Maks 32 karakter |
| `email` | `string` | Tidak | Format email valid, maks 254 |
| `gender` | `"MALE"\|"FEMALE"\|"OTHER"\|"UNSPECIFIED"` | Tidak | Default `"UNSPECIFIED"` |
| `birthDate` | `string` (ISO 8601) | Tidak | |
| `address` | `string` | Tidak | Maks 255 |
| `notes` | `string` | Tidak | Maks 1000 |

Schema **strict**. `customerType` dan `loyaltyPoints` **tidak ada di schema manapun** (create/update) — tidak bisa diset langsung lewat API ini sama sekali. `customerType` selalu `"REGULAR"` di praktiknya (klasifikasi `"DECOY"` ditunda, belum ada jalur untuk menandainya). `loyaltyPoints` hanya berubah lewat mekanisme transaksi (credit otomatis saat transaksi lunas, reverse saat dibatalkan) — tidak pernah lewat endpoint customer manapun.

### ⚠️ `201` Tidak Selalu Berarti Record Baru

Kalau `phone` yang dikirim cocok dengan customer yang **sudah ada** (termasuk kalau beda format penulisan, lihat §2.1), backend **mengembalikan customer yang sudah ada itu** — tetap dengan status `201`, bukan `409`/`200`. Jangan asumsikan response `201` dari endpoint ini selalu berisi data kosong/baru sesuai yang baru diketik — cek dulu apakah `name`/field lain di response sama dengan yang baru diketik user; kalau beda, berarti itu match ke customer lama (mis. AGENT ketik "Andi" tapi nomornya cocok ke customer bernama "Andi Wijaya" yang sudah tercatat lengkap).

### Status Code

| Status | `error.code` | Kapan |
|---|---|---|
| `201` | — | Berhasil dibuat **atau** cocok ke customer existing by phone (lihat di atas) |
| `400` | `VALIDATION_ERROR` | `name` kosong, `email` bukan format valid, field asing, dll |
| `403` | `FORBIDDEN` | Bukan HOST/AGENT |

---

## 4. GET /api/v1/customers/:id — Detail Customer

Bentuk response sama seperti satu item di `customers[]` pada §2 (beda per role, lihat §0), dibungkus `{ customer: {...} }`.

| Status | Kapan |
|---|---|
| `200` | Sukses |
| `403` | Bukan HOST/AGENT (**tidak ada** pengecekan cabang — siapapun HOST/AGENT bisa lihat customer manapun) |
| `404` | Customer tidak ditemukan |

---

## 5. PATCH /api/v1/customers/:id — Update Customer

### Request Body (semua optional, field sama seperti create)

| Field | Tipe |
|---|---|
| `name` | `string`, 1–100 |
| `phone` | `string`, maks 32 |
| `email` | `string`, format email |
| `gender` | enum |
| `birthDate` | `string` (ISO 8601) |
| `address` | `string`, maks 255 |
| `notes` | `string`, maks 1000 |

⚠️ **AGENT bisa MENGISI field `email`/`gender`/`birthDate`/`address`/`notes` lewat PATCH ini, walaupun AGENT tidak akan pernah bisa MEMBACA field itu balik lagi di response manapun.** Validasi di backend tidak membedakan role untuk field mana yang boleh ditulis — pembatasan role di sini **murni soal apa yang dikembalikan**, bukan apa yang bisa ditulis. Kalau form edit untuk AGENT di Flutter menyembunyikan field-field itu dari UI (yang memang disarankan), itu sudah cukup untuk mencegah AGENT menulisnya secara normal — tapi jangan sampai ada kode lain di app yang tidak sengaja ikut mengirim field-field itu (mis. hasil round-trip dari cache HOST) saat submit PATCH sebagai AGENT, karena backend tidak akan menolaknya.

| Status | `error.code` | Kapan |
|---|---|---|
| `200` | — | Sukses, body `{customer}` |
| `400` | `VALIDATION_ERROR` | Field tidak sesuai schema |
| `403` | `FORBIDDEN` | Bukan HOST/AGENT |
| `404` | `NOT_FOUND` | Customer tidak ditemukan |

---

## 6. PATCH /api/v1/customers/:id/status — Aktifkan/Nonaktifkan

**HOST only.** Satu-satunya endpoint di modul ini yang AGENT tidak bisa akses sama sekali (403), sesuai PRD §3.2 ("AGENT ... kecuali nonaktifkan status").

### Request Body

```json
{ "isActive": false }
```

| Field | Tipe | Wajib |
|---|---|---|
| `isActive` | `boolean` | **Ya** |

| Status | `error.code` | Kapan |
|---|---|---|
| `200` | — | Sukses, body `{customer}` |
| `400` | `VALIDATION_ERROR` | `isActive` tidak dikirim/bukan boolean |
| `403` | `FORBIDDEN` | Bukan HOST |
| `404` | `NOT_FOUND` | Customer tidak ditemukan |

Tidak ada efek lanjutan otomatis ke transaksi lama milik customer ini — menonaktifkan customer tidak mengubah riwayat transaksinya. Efeknya baru terasa ke depan: transaksi baru tidak bisa dibuat dengan customer yang `isActive: false` (lihat `TRANSACTION-MOBILE-API-INTEGRATION.md` §1 — `422 "Customer is not available."`).

---

## 7. Status Code — Ringkasan

| Status | `error.code` | Catatan |
|---|---|---|
| `400` | `VALIDATION_ERROR` | |
| `401` | `UNAUTHENTICATED` | |
| `402` | `PAYMENT_REQUIRED` | Hanya mungkin kena HOST (§1) |
| `403` | `FORBIDDEN` | Role salah — **tidak pernah karena beda cabang**, modul ini tidak kenal konsep cabang |
| `404` | `NOT_FOUND` | |
| `500` | `INTERNAL_ERROR` | |

---

## 8. Catatan Implementasi Flutter

- **Buat 2 variant model Dart (atau semua field privileged nullable) untuk Customer** — field `email`/`gender`/`birthDate`/`address`/`notes` bisa benar-benar absen dari JSON tergantung role yang login (§0). Model dengan field itu non-nullable akan gagal parse response AGENT.
- **Form edit customer untuk AGENT: sembunyikan 5 field privileged dari UI** — bukan karena backend menolaknya (backend tidak menolak, lihat §5), tapi supaya AGENT tidak bisa menulis data yang mereka sendiri tidak bisa lihat/verifikasi.
- **Endpoint list (§2) tidak berpaginasi** — desain search-first, jangan panggil tanpa query untuk "lihat semua" kecuali memang siap menerima seluruh data customer dalam satu response.
- **Jangan asumsikan `201` dari create = data kosong baru** — selalu render response-nya, bukan input form-nya, karena bisa saja backend mengembalikan customer lama yang sudah match by phone (§3).
- **Tidak perlu filter berdasarkan cabang di UI manapun untuk modul ini** — berbeda dari Transaksi/Inventaris, AGENT di sini melihat seluruh basis customer bisnis, bukan cuma cabangnya.
