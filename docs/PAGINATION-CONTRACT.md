# Kontrak Pagination — Grooma API

> **Sumber kebenaran tunggal** untuk bentuk pagination di seluruh `/api/v1`. Sebelum dokumen ini ada, satu-satunya catatan jujur soal perbedaan bentuk antar endpoint adalah sebuah komentar kode di `app/scalar/docs/_schemas.ts`, dan `docs/PERFORMANCE-AUDIT.md` justru mengklaim kondisi yang tidak sesuai kode (lihat §9).
>
> **Status dokumen:** audit per **2026-10-19** terhadap `app/api/v1/**`, `services/*.ts`, dan `validations/*.ts`. Kolom "Sekarang" di §7 adalah kondisi kode yang terverifikasi, **bukan** target. Kolom "Target" adalah kontrak yang dinormatifkan dokumen ini dan **belum diimplementasikan** — pembaruan kode dijadwalkan sebagai tahap terpisah (§10).

---

## 1. Kapan sebuah `GET` wajib paginated

Sebuah endpoint `GET` **wajib** mendukung pagination bila jumlah baris yang dikembalikannya tumbuh seiring pemakaian dan tidak punya batas atas struktural.

| Kategori | Aturan | Contoh |
|---|---|---|
| **Daftar koleksi** — jumlah baris tumbuh dari aktivitas operasional | **Wajib paginated** | `/transactions`, `/customers`, `/inventory`, `/users` |
| **Daftar tersemat (sub-resource)** — tumbuh per resource induk | **Wajib paginated** | `/inventory/{id}/stock-movements` |
| **Aggregate dengan kardinalitas terbatas enum** — jumlah baris dibatasi jumlah nilai enum | Tidak perlu paginated, tapi **wajib didokumentasikan batasnya** | `/dashboard/transactions` (3 facet × enum status) |
| **Aggregate top-N** — sengaja dipotong di server | Tidak paginated, tapi **nilai N wajib eksplisit di dokumentasi dan di response** | `/dashboard/services`, `/dashboard/inventory` |
| **Aggregate berbasis bucket waktu** — jumlah bucket ditentukan rentang `from`/`to` yang dikirim client | **Wajib ada batas jumlah bucket** (bukan pagination) | `/dashboard/revenue` |
| **Resource tunggal** | Tidak berlaku | `/transactions/{id}`, `/profile`, `/subscription` |

Patokan praktis: kalau sebuah daftar bisa menembus **200 baris** di deployment yang sudah berjalan setahun, daftar itu wajib paginated. Argumen "jumlahnya kan sedikit" tidak cukup — yang menentukan adalah ada/tidaknya batas atas struktural, bukan perkiraan volume. Satu cabang bisa punya puluhan ribu customer; `GET /customers` tanpa batas atas berarti satu request bisa menarik seluruh tabel customer ke memori proses serverless.

---

## 2. Request — query parameter

Pagination Grooma berbasis **offset** (`page`/`limit`), bukan cursor.

| Parameter | Tipe | Default | Batas | Catatan |
|---|---|---|---|---|
| `page` | integer | `1` | `>= 1` | Nomor halaman, **1-based** (bukan 0-based) |
| `limit` | integer | `20` | `1 … 100` | Jumlah baris per halaman |

Aturan normatif:

1. **Validasi wajib lewat Zod schema di `validations/`**, bukan parsing manual di route handler. Pakai `z.coerce.number()` karena query string selalu string.
2. **Kedua parameter opsional.** Request tanpa `page`/`limit` harus tetap berhasil dan memakai default — ini yang menjaga kompatibilitas klien mobile yang sudah beredar ketika pagination ditambahkan ke endpoint yang sebelumnya tidak punya.
3. **`limit` wajib punya batas atas `100`.** Tidak ada `limit=all`, tidak ada `limit=-1`, tidak ada cara apa pun bagi client untuk meminta seluruh koleksi dalam satu request.
4. **Nilai di luar batas = `400 VALIDATION_ERROR`**, bukan dipotong diam-diam ke nilai terdekat. `limit=500` ditolak; ia tidak boleh berubah menjadi `limit=100` tanpa pemberitahuan.
5. **Schema list query memakai `.strict()`** seperti seluruh schema lain di repo ini — parameter tak dikenal ditolak, bukan diabaikan. Konsekuensinya: menambah dukungan `page`/`limit` ke endpoint yang schema-nya sudah `.strict()` (seluruh `/dashboard/*`) adalah perubahan schema, bukan cuma perubahan service.

Bentuk Zod kanonik — persis yang sudah dipakai `validations/transactionSchema.ts`, `inventorySchema.ts`, `approvalSchema.ts`, dan `subscriptionSchema.ts`:

```ts
page: z.coerce.number().int().positive().optional().default(1),
limit: z.coerce.number().int().positive().max(100).optional().default(20),
```

### Cursor pagination

PRD §7.7 menyebut opsi *"Gunakan pagination berbasis cursor jika volume transaksi sudah besar"*. Keputusan untuk v1: **tetap offset-based di seluruh endpoint**, agar satu bentuk saja yang harus dipahami client (keputusan ini sudah tercatat sebagai pilihan Phase 3 dan Phase 4 di `docs/PLAN-GROOMA.md`).

Bila cursor dibutuhkan nanti, ia ditambahkan sebagai **mode tambahan yang opt-in**, bukan pengganti: parameter `cursor` baru, `data.pagination.nextCursor` baru, dan `page`/`limit` tetap bekerja. Mengubah endpoint yang ada dari offset ke cursor adalah breaking change dan memerlukan `/api/v2`.

---

## 3. Response — envelope

Seluruh response sukses memakai envelope `{ success, data }` yang sama seperti endpoint lain (PRD §14). Di dalam `data`:

1. **Satu key array bernama sesuai resource-nya** — bukan key generik `items` untuk semua endpoint.
2. **Satu objek `pagination`** dengan **empat** field wajib.

```json
{
  "success": true,
  "data": {
    "transactions": [ { "...": "..." } ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 137,
      "totalPages": 7
    }
  }
}
```

| Field | Tipe | Arti |
|---|---|---|
| `page` | integer | Halaman yang **benar-benar dilayani** (bukan yang diminta, bila berbeda) |
| `limit` | integer | `limit` efektif yang dipakai untuk query ini |
| `total` | integer | Jumlah **seluruh** baris yang cocok filter, mengabaikan `page`/`limit` |
| `totalPages` | integer | `Math.ceil(total / limit)`; bernilai `0` bila `total === 0` |

Aturan normatif:

1. **Nama field keempat adalah `totalPages`.** Bukan `pages`, bukan `pageCount`, bukan `last_page`. Lihat §9.1 — ada satu endpoint yang hari ini memakai `pages` dan itu harus dirapikan.
2. **Empat field itu wajib ada semuanya**, termasuk pada hasil kosong. Daftar kosong adalah `{ "<resource>": [], "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }` — **bukan** `data: null` dan bukan objek `pagination` yang dihilangkan.
3. **`page` dan `limit` di response wajib memantulkan nilai yang dipakai query**, bukan konstanta hardcode. Early-return "tidak ada data" yang mengembalikan `limit: 20` padahal client mengirim `limit=50` adalah bug (§9.2).
4. **Tidak ada pagination lewat HTTP header.** Tidak ada `X-Total-Count`, tidak ada `Link: rel="next"`. Seluruh metadata ada di body. (`docs/TESTING.md` sempat menyebut "pagination headers" — itu keliru dan sudah dikoreksi.)
5. **Tidak ada `hasNextPage`/`hasPrevPage`.** Keduanya dapat diturunkan client dari `page` dan `totalPages`; menambahkannya hanya memperbanyak field yang harus dijaga konsisten.

---

## 4. Urutan (`sort`) wajib deterministik

Ini prasyarat kebenaran, bukan kosmetik. Pagination offset menerjemahkan `page` menjadi `skip`, dan `skip` hanya bermakna bila urutan baris **stabil antar request**. Bila kunci sort tidak unik, dokumen-dokumen yang nilainya seri boleh muncul dalam urutan berbeda di tiap query — akibatnya satu baris bisa **terlewat** atau **muncul dua kali** saat client berpindah halaman.

Aturan normatif:

1. **Setiap query paginated wajib punya `sort` eksplisit.** Tanpa `sort`, MongoDB tidak menjamin urutan apa pun.
2. **Setiap `sort` wajib diakhiri tie-breaker unik**, yaitu `_id`, dengan arah yang sama seperti kunci utamanya: `.sort({ createdAt: -1, _id: -1 })`.
3. Index pendukung sebaiknya mengikuti bentuk sort tersebut — lihat rekomendasi compound index di `docs/PERFORMANCE-AUDIT.md`.

**Kondisi sekarang:** *tidak satu pun* dari lima endpoint paginated yang ada memenuhi aturan 2. Kunci sort yang dipakai semuanya non-unik:

| Endpoint | `sort` sekarang | Risiko |
|---|---|---|
| `GET /transactions` | `{ createdAt: -1 }` | Transaksi yang dibuat pada milidetik yang sama bisa bergeser antar halaman |
| `GET /transaction-change-requests` | `{ "changeRequest.requestedAt": -1 }` | Sama |
| `GET /inventory` | `{ name: 1 }` | **Paling rawan** — nama item duplikat antar cabang itu normal |
| `GET /inventory/{id}/stock-movements` | `{ createdAt: -1 }` | Dua movement dari satu transaksi batch bisa seri |
| `GET /subscription/invoices` | `{ createdAt: -1 }` | Volume kecil, dampak praktis rendah |

---

## 5. Perilaku error & edge case

| Kasus | Perilaku wajib |
|---|---|
| `page=0`, `page=-1`, `page=abc` | `400 VALIDATION_ERROR` |
| `limit=0`, `limit=101`, `limit=abc` | `400 VALIDATION_ERROR` |
| `page` melebihi `totalPages` (mis. `page=99` dari 7 halaman) | **`200`** dengan array kosong + `pagination` terisi benar (`page: 99`, `total: 137`, `totalPages: 7`). **Bukan `404`** — halaman kosong bukan resource yang hilang, dan client butuh `total`/`totalPages` untuk memperbaiki posisinya |
| Filter tidak cocok apa pun | `200`, array kosong, `total: 0`, `totalPages: 0` |
| `page`/`limit` dikirim ke endpoint yang belum mendukungnya | `400` bila schema-nya `.strict()`. **Jangan** diam-diam diabaikan — diam-diam diabaikan membuat client yakin sudah memaginasi padahal menerima seluruh koleksi |

Satu aturan tambahan yang berlaku umum: **parameter query yang divalidasi wajib benar-benar dipakai.** Menerima sebuah filter di schema lalu tidak meneruskannya ke query adalah bentuk kegagalan yang paling sulit terdeteksi client — responsnya `200` dan tampak benar. Ini sedang terjadi pada `status` di `GET /subscription/invoices` (§9.3).

---

## 6. Endpoint aggregate (`/dashboard/*`) — capped, bukan paginated

Endpoint dashboard mengembalikan hasil agregasi, bukan daftar resource. Memaginasi top-N tidak bermakna (halaman 2 dari "top 10" adalah kontradiksi). Kebijakannya: **batasi di server, dan nyatakan batas itu di dokumentasi**.

| Endpoint | Bentuk | Batas sekarang | Target |
|---|---|---|---|
| `/dashboard/summary` | objek tunggal | — | Tidak berlaku |
| `/dashboard/transactions` | 3 facet, dikelompokkan per enum status | Terbatas kardinalitas enum (≤ 5 baris per facet) | Cukup; dokumentasikan bahwa batasnya struktural |
| `/dashboard/services` | array top-N service | `$limit: 10` (hardcode) | Pertahankan cap; ekspos `limit` sebagai query param opsional (`1…50`, default `10`) dan kembalikan nilai efektifnya di response |
| `/dashboard/inventory` | array item low-stock | `.limit(20)` (hardcode) | Sama polanya (`1…100`, default `20`). Ini daftar *actionable* — HOST dengan 60 item low-stock hari ini hanya melihat 20 tanpa indikasi apa pun bahwa daftarnya terpotong |
| `/dashboard/agents` | array performa agent | **tidak ada batas sama sekali** | Tambahkan cap. Satu-satunya hal yang membatasinya hari ini adalah jumlah agent yang pernah bertransaksi di rentang tanggal tersebut |
| `/dashboard/revenue` | `{ byPeriod: [], paymentBreakdown: [] }` | `paymentBreakdown` terbatas enum; **`byPeriod` tidak dibatasi** | Batasi jumlah bucket. `from`/`to` bebas dikirim client, jadi `?period=DAY&from=2015-01-01&to=2026-12-31` menghasilkan ribuan bucket dari satu request yang lolos validasi |

Aturan normatif untuk endpoint ber-cap: **response wajib memberi tahu client bahwa hasilnya dipotong.** Minimal sertakan `limit` efektif yang dipakai; idealnya `total` tak terpotong juga, supaya UI bisa menampilkan "20 dari 60". Daftar terpotong yang tidak bisa dibedakan dari daftar lengkap adalah data yang menyesatkan, bukan sekadar data yang tidak lengkap.

---

## 7. Inventaris endpoint — kondisi sekarang vs target

Seluruh baris "Sekarang" diverifikasi langsung terhadap kode pada 2026-10-19.

### 7.1. Sudah paginated

| Endpoint | Key array | Field pagination | Param lain | Keterangan |
|---|---|---|---|---|
| `GET /transactions` | `transactions` | `page, limit, total, totalPages` | `search`, `paymentStatus`, `transactionStatus`, `from`, `to`, `branchId`, `agentId` | ✅ Sesuai kontrak (kecuali tie-breaker sort, §4) |
| `GET /transaction-change-requests` | `transactions` | `page, limit, total, totalPages` | — | ✅ Sesuai kontrak (idem) |
| `GET /inventory` | `items` | `page, limit, total, totalPages` | `branchId`, `search`, `lowStockOnly` | ✅ Sesuai kontrak (idem) |
| `GET /inventory/{id}/stock-movements` | `movements` | `page, limit, total, totalPages` | — | ✅ Sesuai kontrak (idem) |
| `GET /subscription/invoices` | `invoices` | `page, limit, total, pages` ← **bukan `totalPages`** | `status` (diterima, **tidak dipakai**) | ⚠️ Tiga penyimpangan — §9.1, §9.2, §9.3 |

### 7.2. Belum paginated — harus ditambahkan

| Endpoint | Key array | Param sekarang | Yang harus ditambahkan | Mengapa ini mendesak |
|---|---|---|---|---|
| `GET /customers` | `customers` | `search` (dibaca langsung dari `searchParams`, **tanpa Zod schema**) | `page`, `limit`, + schema `listCustomersQuerySchema` baru | Koleksi dengan pertumbuhan tercepat di sistem — satu baris per pelanggan yang pernah datang. Tanpa `search`, endpoint ini mengembalikan **seluruh** tabel customer |
| `GET /users` | `users` | tidak ada | `page`, `limit` (+ `search`/`status` bila berguna) | Satu baris per pegawai lintas cabang; `docs/PERFORMANCE-AUDIT.md` sendiri memperkirakan "ratusan per cabang" |
| `GET /services` | `services` | tidak ada | `page`, `limit` | Katalog memang relatif stabil, tapi tidak punya batas atas struktural; dipaginasi agar bentuknya seragam |
| `GET /branches` | `branches` | tidak ada | `page`, `limit` | Volume terendah di daftar ini (AGENT selalu dapat ≤ 1 baris). Tetap dipaginasi demi keseragaman, prioritas terakhir |

Catatan untuk keempatnya: belum ada `*QuerySchema` sama sekali di `validations/` untuk endpoint-endpoint ini, jadi penambahan pagination berarti membuat schema baru, bukan menambah field ke schema yang sudah ada.

**Kompatibilitas klien yang sudah beredar.** Menambahkan `data.pagination` ke response yang sebelumnya hanya berisi array bersifat **aditif** — client lama yang membaca `data.customers` tetap bekerja. Yang **breaking** adalah kemunculan `limit` default: client yang hari ini menerima 5.000 customer dalam satu request besok hanya menerima 20. Jadi perubahan ini wajib dikoordinasikan dengan `docs/integration-to-mobile-flutter/` (tahap terpisah, lihat §10) — bukan di-deploy sepihak.

### 7.3. Tidak berlaku (resource tunggal)

`/auth/me`, `/profile`, `/subscription`, `/subscription/invoices/{id}`, `/branches/{id}`, `/customers/{id}`, `/services/{id}`, `/users/{id}`, `/inventory/{id}`, `/transactions/{id}`, `/transactions/{id}/receipt`, `/transaction-change-requests/{id}`, `/payments/{id}`, `/dashboard/summary`.

---

## 8. Ringkasan kepatuhan

| | Jumlah | Endpoint |
|---|---|---|
Denominatornya adalah endpoint `GET` yang **jumlah barisnya tidak punya batas atas struktural** — itulah definisi "berpotensi mengembalikan banyak data". Endpoint yang sudah dipotong keras di server tidak masuk hitungan ini karena volumenya memang tidak bisa membengkak; masalahnya di sana jenis lain (lihat tabel kedua).

| | Jumlah | Endpoint |
|---|---|---|
| ✅ Paginated & sesuai kontrak | **4** | `/transactions`, `/transaction-change-requests`, `/inventory`, `/inventory/{id}/stock-movements` |
| ⚠️ Paginated tapi menyimpang bentuknya | **1** | `/subscription/invoices` |
| ❌ Daftar tanpa pagination | **4** | `/customers`, `/users`, `/services`, `/branches` |
| ❌ Aggregate tanpa batas | **2** | `/dashboard/agents`, `/dashboard/revenue` (`byPeriod`) |
| | **11** | |

**4 dari 11** memenuhi kontrak hari ini.

Di luar denominator — volumenya sudah aman, tapi masih melanggar kewajiban "beri tahu client kalau hasilnya dipotong" (§6):

| | Jumlah | Endpoint |
|---|---|---|
| Ber-cap, batas tidak diekspos ke client | **2** | `/dashboard/services` (cap 10), `/dashboard/inventory` (cap 20) |
| Terbatas kardinalitas enum — tidak perlu tindakan | **1** | `/dashboard/transactions` |

---

## 9. Inkonsistensi terkonfirmasi di kode

Semuanya **sengaja dibiarkan** pada tahap dokumentasi ini; dicatat agar tahap kode punya daftar kerja yang eksplisit.

### 9.1. `pages` vs `totalPages`

`services/billingService.ts` mengembalikan `pagination.pages`, sedangkan `transactionService.ts`, `inventoryService.ts`, dan `approvalService.ts` mengembalikan `pagination.totalPages`. Nilainya identik (`Math.ceil(total / limit)`), namanya berbeda. Satu-satunya endpoint yang terdampak: `GET /subscription/invoices`.

Inkonsistensi ini **sudah terdokumentasi dengan benar** di spec Scalar — `app/scalar/docs/_schemas.ts` mendefinisikan dua schema terpisah (`Pagination` dan `PaginationAlt`) dengan komentar yang menyatakan terang-terangan bahwa ini *"a real inconsistency in the current implementation, not a documentation typo"*. Spec-nya jujur; implementasinya yang perlu disatukan.

**Keputusan:** `totalPages` menang (4 endpoint lawan 1). Jalur migrasi yang disarankan: kirim **kedua** field dari `billingService` untuk satu rilis, perbarui `docs/integration-to-mobile-flutter/`, baru hapus `pages` — supaya build mobile yang sudah beredar tidak pecah. `PaginationAlt` dihapus dari spec Scalar di akhir migrasi.

### 9.2. `pagination` hardcode pada early-return

`app/api/v1/subscription/invoices/route.ts` mengembalikan `pagination: { page: 1, limit: 20, total: 0, pages: 0 }` ketika HOST belum punya record `Subscription`. Dua masalah: nilainya hardcode (client yang mengirim `limit=50` menerima `limit: 20`), dan `parsed` bahkan belum dihitung di titik itu sehingga `page`/`limit` yang diminta tidak diketahui. Early-return terjadi **sebelum** validasi query, jadi `?limit=abc` pun membalas `200` di jalur ini sementara jalur normalnya `400`.

### 9.3. Parameter `status` diterima lalu dibuang

`listSubscriptionInvoicesQuerySchema` memvalidasi `status` (`PENDING`/`PAID`/`FAILED`/`EXPIRED`/`REFUNDED`), tapi route hanya meneruskan `parsed.data.page` dan `parsed.data.limit` ke `listInvoicesBySubscription()`, dan fungsi itu memfilter hanya dengan `{ subscription: subscriptionId }`. Akibatnya `?status=PAID` membalas `200` berisi invoice **semua** status. Spec Scalar (`app/scalar/docs/paths/subscription.ts`) juga mengiklankan parameter ini tanpa catatan.

Ini bukan murni soal pagination, tapi satu kelas bug dengan §5: filter yang tidak dipakai membuat `total` dan `totalPages` menghitung populasi yang berbeda dari yang client minta.

### 9.4. Tidak ada tie-breaker sort

Lihat §4 — berlaku pada kelima endpoint paginated.

### 9.5. Drift dokumentasi (sudah dikoreksi oleh dokumen ini)

Ditemukan saat audit dan **sudah diperbaiki** pada 2026-10-19:

- `docs/PERFORMANCE-AUDIT.md` §"Pagination Compliance" mengklaim `GET /users`, `GET /customers`, dan `GET /services` *"paginated (1-100, default 20)"*. Ketiganya tidak pernah paginated. Daftarnya juga melewatkan `/branches`, `/inventory/{id}/stock-movements`, `/subscription/invoices`, dan lima dari enam endpoint `/dashboard/*`. Verdict-nya menyatakan *"Pagination enforced on all list endpoints ✓"*.
- `docs/PHASE-7-SUMMARY.md` mewarisi klaim yang sama (*"all endpoints compliant"*) dari dokumen di atas.
- `docs/PLAN-GROOMA.md` punya dua baris yang saling bertabrakan dengan klaim itu — catatan Phase 2 (`/branches` dan `/services` sengaja tidak paginated, dan itu memang sesuai kode) dan ringkasan Phase 7 (*"all pagination enforced"*).
- `docs/TESTING.md` menyebut *"pagination headers"* sebagai target verifikasi; Grooma tidak pernah memakai header pagination.

Akar penyebabnya sama seperti yang tercatat untuk Scalar docs: **tidak ada yang memvalidasi klaim dokumen terhadap kode**, dan audit Phase 7 rupanya menuliskan kondisi yang diinginkan, bukan kondisi yang diperiksa.

---

## 10. Checklist rollout (tahap kode — belum dikerjakan)

Diurutkan dari risiko terendah ke tertinggi. **Belum ada satu pun yang dieksekusi**; dokumen ini hanya menetapkan kontraknya.

**Tahap 1 — perbaikan internal, tanpa dampak ke client**
- [ ] Tambahkan tie-breaker `_id` ke `sort` pada kelima query paginated yang ada (§4)
- [ ] Teruskan `status` ke `listInvoicesBySubscription()` dan filter dengannya (§9.3)
- [ ] Pindahkan validasi query ke **sebelum** early-return di `subscription/invoices`, dan pantulkan `page`/`limit` sebenarnya (§9.2)
- [ ] Angkat bentuk pagination ke satu helper bersama di `lib/` supaya `pages` vs `totalPages` tidak bisa terulang

**Tahap 2 — aditif, aman untuk client lama**
- [ ] Kirim `totalPages` **bersama** `pages` dari `billingService` (§9.1)
- [ ] Beri cap pada `/dashboard/agents` dan pada jumlah bucket `/dashboard/revenue` (§6)
- [ ] Ekspos `limit` efektif pada `/dashboard/services` dan `/dashboard/inventory` (§6)

**Tahap 3 — mengubah jumlah baris yang diterima client; wajib dikoordinasikan**
- [ ] `page`/`limit` + schema baru untuk `/customers`, lalu `/users`, `/services`, `/branches` (§7.2)
- [ ] Perbarui `app/scalar/docs/paths/*.ts` untuk setiap endpoint yang berubah
- [ ] Perbarui `docs/integration-to-mobile-flutter/` — **tahap terpisah atas instruksi user**, jangan disentuh bersamaan dengan perubahan kode
- [ ] Hapus `pages` dan `PaginationAlt` setelah klien mobile bermigrasi

**Verifikasi** (sesuai palang mutu repo ini): `tsc --noEmit`, `vitest run` (baseline all-green — kegagalan apa pun adalah regresi), `next build`, dan `biome check` yang discope ke file tersentuh.

---

## 11. Referensi

- `docs/PRD-GROOMA.md` — §7 (spesifikasi API), §7.7 (pagination daftar transaksi), §14 (format response), §16 (NFR Performance)
- `docs/PERFORMANCE-AUDIT.md` — §"Pagination Compliance" (sudah dikoreksi 2026-10-19), rekomendasi index
- `docs/PLAN-GROOMA.md` — catatan keputusan offset-vs-cursor di Phase 3 & Phase 4
- `app/scalar/docs/_schemas.ts` — schema `Pagination` / `PaginationAlt`
- `docs/integration-to-mobile-flutter/` — kontrak yang dibaca klien Flutter; **wajib ikut diperbarui** sebelum Tahap 3 dirilis
