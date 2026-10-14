# GROOMA — Backend Execution Plan

Companion dokumen untuk [`PRD-GROOMA.md`](./PRD-GROOMA.md) v1.0. Dokumen ini menerjemahkan PRD (khususnya §17–§21) menjadi checklist eksekusi yang konkret, berbasis struktur repo yang sudah ada. Checklist di bawah bersifat living document — centang & update seiring progres, jangan dianggap final sekali ditulis.

Referensi `§X` di seluruh dokumen ini mengacu ke nomor section di `PRD-GROOMA.md`.

---

## 0. Gap Analysis — Status Repo vs PRD

Repo saat ini adalah hasil `create-next-app` + beberapa model Mongoose yang sudah ditulis lebih dulu (sebelum PRD final), sehingga ada drift yang harus diperbaiki di Phase 1, bukan diteruskan.

| Area | Requirement PRD | Status Repo Saat Ini | Tindakan |
|---|---|---|---|
| Dependencies | zod, argon2id/bcrypt, Midtrans SDK, session lib, test runner (§2) | Hanya `mongoose`, `next`, `react`, `react-dom` | Install di Phase 1 |
| Package manager | satu lockfile | `bun.lock` **dan** `package-lock.json` sama-sama ada | Pilih satu, hapus lockfile lain |
| `models/Branch.ts` | wajib (§5.2) | **Tidak ada** | Buat baru — Phase 1 |
| `models/User.ts` | field `branch` wajib untuk AGENT (§5.1, §3.3) | Field `branch` **tidak ada** sama sekali | Tambahkan — Phase 1 |
| `models/Transaction.ts` | field `branch`, `agent`, `paymentReference` (§5.5) | Pakai nama field `employee` (bukan `agent`), **tidak ada** `branch`/`paymentReference`, semua `ref` menunjuk ke `"Employee"` yang modelnya tidak eksis | Perbaiki — Phase 1 (bug blocking, bukan cosmetic: `.populate()` akan gagal diam-diam) |
| `models/Inventory.ts` | field `branch` wajib untuk isolasi cabang (§5.6) | Field `branch` **tidak ada** | Tambahkan — Phase 1/4 |
| `models/Payment.ts` | direkomendasikan collection terpisah (§5.9) | Tidak ada | Buat baru — Phase 3 |
| `models/InventoryMovement.ts` | direkomendasikan untuk audit stok (§5.7) | Tidak ada | Buat baru — Phase 4 |
| `models/Attendance.ts` | **out of scope MVP** (§4, §20) | Sudah ada (termasuk `ref: "Employee"` yang sama-sama invalid) | Biarkan apa adanya, jangan dikembangkan/di-wire ke API selama MVP ini |
| `app/api/v1/*` | seluruh endpoint §7 | **Tidak ada** sama sekali, hanya default page bawaan `create-next-app` | Bangun bertahap mulai Phase 1 |
| `lib/`, `services/`, `validations/`, `types/` | struktur §17 | Tidak ada | Bangun bertahap sesuai phase |
| `models/SubscriptionPlan.ts`, `Subscription.ts`, `SubscriptionInvoice.ts` | wajib untuk modul Subscription & Billing (PRD §5.10–§5.12, §23) | Tidak ada | Buat baru — Phase 8 |
| `User.role` enum | harus memuat `GROOMA_ADMIN` (PRD §3.1, §5.1) | Hanya `HOST \| AGENT` | Tambahkan — Phase 1 (bareng perbaikan field `branch`) |
| `app/api/v1/admin/*`, `app/api/v1/subscription/*` | namespace baru untuk GROOMA_ADMIN & billing HOST (PRD §6.4, §7.11) | Tidak ada | Bangun — Phase 8 |

Catatan tambahan: `AGENTS.md` menandai bahwa versi Next.js di proyek ini punya breaking changes dari training data model mana pun — sebelum menulis route handler, baca `node_modules/next/dist/docs/` untuk konvensi App Router/Route Handler yang berlaku di versi ini. Hal yang sama berlaku untuk Mongoose (`^9.11.2`, lebih baru dari API yang umum dikenal).

---

## 1. Keputusan yang Harus Dikonfirmasi Lebih Dulu

PRD sendiri menandai beberapa hal sebagai "harus dikonfirmasi" atau "sebaiknya ditambahkan". Selesaikan ini di Phase 0 agar tidak bongkar ulang model/lib di tengah jalan.

- [x] **Definisi operasional `customerType: DECOY`** (§5.3) — PRD eksplisit bilang ini harus dikonfirmasi sebelum fitur klasifikasi dirilis. Rekomendasi sementara: semua customer baru default `REGULAR`, tunda eksposur `DECOY` ke endpoint manapun sampai definisi bisnisnya jelas. (ACC)
- [x] **Algoritma hashing password**: Argon2id vs bcrypt (§2 memberi pilihan). Rekomendasi: Argon2id. (ACC)
- [x] **Mekanisme session** (§6.2): DB-backed session (collection `Session` + cookie `HttpOnly` berisi session id) vs cookie terenkripsi/signed (mis. iron-session/JWT). Rekomendasi: DB-backed — requirement "logout harus mencabut session" dan "akun nonaktif tidak boleh tetap dapat akses walau session masih valid" (§6.2) paling natural dipenuhi kalau session bisa divalidasi & dicabut langsung di server, bukan cuma menunggu expiry token. (ACC)
- [x] **Status `EXPIRED` pada Payment** (§9.4) — PRD merekomendasikan ini ditambahkan. Rekomendasi: masukkan dari awal ke enum `status`, supaya tidak perlu migrasi data nanti. (PRD gw ACC)
- [x] **Infra rate limiting** (§15.8) — target deploy Vercel/serverless (§2) berarti multi-instance; counter in-memory per-process tidak reliable. Rekomendasi: counter via collection Mongo sendiri, atau Redis (mis. Upstash) kalau tersedia. (ACC)
- [x] **Test runner** — belum ada di devDependencies. Rekomendasi: Vitest (ESM-native, cocok dengan TS + Next.js). (Skip dulu, fokus MVP)
- [x] **Package manager ganda** — `bun.lock` dan `package-lock.json` sama-sama ada di root. Pilih satu, hapus yang lain supaya tidak drift. (BUN)
- [x] **CSRF mechanism** konkret (§6.2, §15.9) — opsi: double-submit cookie token, atau custom header check (`SameSite=Lax` + header wajib). Rekomendasi: double-submit token, cocok dipasangkan dengan session cookie. (ACC)
- [x] **Nasib `models/Attendance.ts`** — sudah ada walau attendance out-of-scope. Rekomendasi: biarkan file ada (bukan kerjaan yang dihapus sepihak), tapi jangan diberi route/service di MVP ini. (ACC)

---

## 2. Dependencies yang Perlu Ditambahkan

| Package | Fungsi | Dipakai mulai |
|---|---|---|
| `zod` | schema validation (§2, seluruh input API) | Phase 1 |
| `argon2` (atau `bcrypt`, sesuai keputusan di §1) | password hashing | Phase 1 |
| Library session sesuai keputusan di §1 (atau tidak perlu library eksternal kalau DB-backed custom) | session management | Phase 1 |
| `midtrans-client` | integrasi QRIS Midtrans (§9) | Phase 3 |
| `vitest` + `@vitest/coverage-v8` (sesuai keputusan di §1) | automated testing (§18) | Phase 1 setup, dipakai sepanjang proyek |
| `mongodb-memory-server` (opsional) | test terhadap Mongo tanpa Atlas asli | Phase 1/7 |

Scheduler untuk siklus billing subscription (PRD §23.2) belum punya pilihan tetap — tentukan saat Phase 8: **Vercel Cron Jobs** (native kalau hosting di Vercel) atau **GitHub Actions scheduled workflow** yang memanggil endpoint internal dengan secret. Tidak perlu package npm tambahan untuk opsi manapun.

---

## 3. Environment Variables

- `MONGODB_URI`
- Secret untuk session/cookie signing (nama tergantung keputusan mekanisme session)
- `MIDTRANS_SERVER_KEY`
- `MIDTRANS_CLIENT_KEY`
- `MIDTRANS_IS_PRODUCTION`
- `NODE_ENV`
- `INTERNAL_CRON_SECRET` — autentikasi endpoint `POST /api/v1/internal/subscriptions/run-billing-cycle` (PRD §23.5), bukan session user

Simpan di `.env.local` (sudah di-gitignore lewat pola `.env*`), buat juga `.env.example` tanpa nilai asli supaya onboarding jelas. Jangan commit credential (§9.3, §15.11).

---

## 4. Fase Eksekusi

### Phase 0 — Alignment (sebelum coding)
- [x] Finalisasi seluruh poin di §1
- [x] Setup `.env.local` + `.env.example`
- [x] Bersihkan lockfile ganda (hapus `package-lock.json`, `bun.lock` jadi satu-satunya lockfile)
- [x] `bun install` dependencies dasar — `zod` + `argon2` terpasang; test runner (Vitest) sengaja di-skip sesuai keputusan §1

### Phase 1 — Foundation
**Models (perbaikan + baru):**
- [x] `models/Branch.ts` baru — `branchCode` unique, `status: ACTIVE|INACTIVE`, `timezone` (§5.2)
- [x] `models/User.ts` — tambah field `branch` (ref `Branch`), validasi custom: required jika `role === "AGENT"`, boleh `null` jika `HOST`; tambah `GROOMA_ADMIN` ke enum `role` dengan `branch` selalu `null` dan tidak dapat dibuat lewat endpoint `/users` biasa (§5.1, §23.1) — enforced via `pre("validate")`; endpoint-level restriction masih menunggu Phase 2
- [x] `models/Transaction.ts` — rename `employee` → `agent`, perbaiki semua `ref: "Employee"` → `ref: "User"` (termasuk di `changeHistory.changedBy`, `changeRequest.requestedBy`, `changeRequest.reviewedBy`); tambah field `branch` (ref `Branch`, required) dan `paymentReference` (§5.5)
- [x] `models/Inventory.ts` — tambah field `branch` (ref `Branch`, required) (§5.6)
- [x] (Jika DB-backed session) `models/Session.ts` baru — `tokenHash` (HMAC, bukan raw token) + TTL index di `expiresAt`

**Lib:**
- [x] `lib/mongodb.ts` — koneksi + connection caching (pola standar Next.js serverless, cek docs lokal Next.js dulu)
- [x] `lib/auth.ts` — hash/verify password, create/validate/revoke session, helper `getCurrentUser(request)`
- [x] `lib/logger.ts` — logger terpusat; pastikan tidak pernah log secret/credential (§9.3, §15.11)
- [x] `lib/errors.ts` — central error handler, format response konsisten sesuai §14
- [x] `lib/rate-limit.ts` — sesuai keputusan infra di §1 (§15.8)

**Authorization helpers** (dipakai di *semua* protected route, urutan sesuai §6.3) — di `lib/authorization.ts`:
- [x] `requireAuth(request)` — session validation + user status check (akun INACTIVE ditolak meski session valid)
- [x] `requireRole(user, allowedRoles[])`
- [x] `requireBranchAccess(user, branchId)` — HOST lolos semua branch, AGENT hanya branch miliknya; **`branchId` dari body/query tidak pernah dipercaya tanpa dicocokkan ke session** (§3.3)

**Validations:**
- [x] `validations/auth.schema.ts` (login, change-password)

**API:**
- [x] `POST /api/v1/auth/login` — urutan §6.1: cari user → cek status akun → verifikasi password (dummy-hash verify saat user tidak ditemukan, untuk menyamakan timing); rate-limited per IP
- [x] `POST /api/v1/auth/logout`
- [x] `GET /api/v1/auth/me`
- [x] `POST /api/v1/auth/change-password` — rate-limited per user id

**Tests** (§18 bucket Authentication):
- [ ] Skip — belum ada test runner terpasang (keputusan §1: Vitest ditunda). Business rules di atas sudah diverifikasi manual (`tsc --noEmit`, `biome check`, `next build`) tapi belum ada automated test; revisit di Phase 7.

**Exit criteria:** fondasi auth + branch authorization siap dipakai modul lain (menyumbang DoD §21 #1, #2). **Tercapai**, dengan catatan: provisioning `GROOMA_ADMIN` (larangan lewat endpoint `/users` biasa) baru benar-benar relevan begitu endpoint itu ada di Phase 2.

---

### Phase 2 — Master Data
**Services:**
- [x] `services/branch.service.ts`
- [x] `services/user.service.ts` — hash password saat create, jangan pernah expose hash (§7.3) — juga strip `compensation` dari response (tidak ada di field list PRD §3.1) dan exclude role `GROOMA_ADMIN` dari semua query (§3.4)
- [x] `services/customer.service.ts` — pencarian/dedupe nomor telepon ternormalisasi, bukan exact-string match (§5.3); dedupe-by-phone-variant di create mengembalikan customer yang sudah ada alih-alih membuat duplikat
- [x] `services/service.service.ts` — validasi `revenueSharing` total 100% (sudah ada di model); surfaced dengan jelas via `lib/errors.ts` yang sekarang memformat `mongoose.Error.ValidationError` ke 400 konsisten (juga dipakai `User`/`Branch` save)

**Validations:** `validations/branch.schema.ts`, `user.schema.ts` (+ `updateProfileSchema`), `customer.schema.ts`, `service.schema.ts` — seluruhnya `.strict()` supaya field terlarang (role/branch di profil, `customerType`/`loyaltyPoints` di customer, kode identifier di update) ditolak eksplisit, bukan cuma diabaikan diam-diam

**API** (§7.3–§7.6): seluruh endpoint Branch, User, Customer, Service, Profile.
- [x] `GET/PATCH /api/v1/profile` — **wajib menolak** field `role`/`branch` dari body (§13); perubahan role/branch hanya lewat User Management oleh HOST. Dibuka untuk HOST/AGENT/GROOMA_ADMIN (§3.2 matrix — "own profile only" berlaku ke ketiganya)
- [x] `PATCH /api/v1/users/:id` dan `/status` — hanya HOST
- [x] Endpoint Customer: AGENT boleh create saat transaksi butuh customer baru (§7.5), tapi field yang dikembalikan ke AGENT dibatasi sesuai kebutuhan operasional (§5.3, §7.5 privasi data pribadi) — HOST lihat semua field, AGENT hanya field operasional (nama/telepon/tipe/poin/kunjungan terakhir/status)

**Catatan implementasi (keputusan yang tidak eksplisit di PRD, dicatat supaya bisa direvisi):**
- Pembagian field Customer HOST vs AGENT di atas adalah interpretasi — PRD sengaja tidak merinci field mana yang "terlalu pribadi"
- `branchCode`/`serviceCode` diperlakukan immutable setelah create (tidak ada di update schema) — bukan larangan eksplisit PRD, tapi konsisten dengan `username` yang juga immutable
- Endpoint create/update User TIDAK menyediakan reset password oleh HOST — tidak ada di PRD, password hanya berubah lewat `/auth/change-password` self-service
- `GET /branches` dan `GET /services` tidak pakai pagination (berbeda dari Transaction/Inventory di §16) — NFR eksplisit cuma minta pagination untuk daftar transaksi dan inventaris

**Business rules untuk dicatat sebagai test-case nanti:**
- [x] Branch yang sudah punya transaksi tidak bisa dihapus permanen (soft delete only) — otomatis terpenuhi: tidak ada endpoint `DELETE` untuk Branch sama sekali, hanya `PATCH .../status`
- [x] Service yang sudah pernah dipakai tidak bisa dihapus permanen — sama, hanya ada `PATCH .../status`, tidak ada `DELETE`
- [x] Customer yang sudah bertransaksi tidak bisa dihapus permanen — sama, hanya `PATCH .../status` (toggle `isActive`)
- [x] `loyaltyPoints` tidak bisa diubah langsung lewat endpoint update customer (§5.3) — field tidak ada di `customer.schema.ts` manapun, `.strict()` menolak jika dikirim

**Exit criteria:** DoD §21 #3. **Tercapai.**

---

### Phase 3 — POS & Payments
**Models:**
- [x] `models/Payment.ts` baru — `providerOrderId` unique, `status` enum termasuk `EXPIRED` (sesuai keputusan §1), simpan di collection terpisah dari Transaction (§5.9)

**Lib:**
- [x] `lib/midtrans.ts` — wrapper client Midtrans server-side; credential hanya dari env, tidak pernah dikirim ke frontend (§9.1). Ditambah `types/midtrans-client.d.ts` (package tidak ship tipe TS sama sekali) dan timeout 10s manual (axios bawaan SDK tidak punya timeout — hang tanpa batas dikonfirmasi langsung ke sandbox, lihat catatan testing di bawah)

**Services:**
- [x] `services/transaction.service.ts` — implementasi alur §8.2: ambil customer/service/user/branch dari DB (bukan dari request body), hitung `subtotal`/`discountAmount`/`total`/`ownerRevenue`/`employeeRevenue` di backend, simpan `serviceSnapshot`, generate `transactionCode` unik (format `GRM-YYYYMMDD-XXXXXX`, tanggal mengikuti timezone branch, §8.4)
- [x] `services/payment.service.ts` — create QRIS order; proses notification idempoten (§9.2); state machine transisi status yang menolak transisi invalid/mundur dari status final (§9.4); sinkronisasi `Payment.status` → `Transaction.paymentStatus`/`paidAt`

**Validations:**
- [x] `validations/transaction.schema.ts` — hanya terima `customerId, serviceId, paymentMethod, discountAmount, serviceHourType`. Field `agentId`, `branchId`, `total`, `ownerRevenue`, `employeeRevenue`, `serviceSnapshot` dari body **wajib diabaikan/ditolak** via `.strict()`, bukan sekadar "tidak dipakai" (§8.3)
- [x] `validations/payment.schema.ts` — tidak disebut di checklist awal tapi wajib ada untuk body `POST /payments/qris` (§7.8); ditambahkan di luar daftar nama file semula

**API** (§7.7–§7.8):
- [x] `GET/POST /api/v1/transactions`, `GET /:id`, `POST /:id/complete`, `POST /:id/cancel`, `GET /:id/receipt`
- [x] List transactions: pagination (page/limit, bukan cursor — volume belum besar), search by `transactionCode`, filter status pembayaran/transaksi/tanggal/branch(HOST)/agent(HOST) (§7.7)
- [x] `POST /api/v1/payments/qris`, `GET /api/v1/payments/:id`
- [x] `POST /api/v1/payments/midtrans/notification` — endpoint publik, **verifikasi signature Midtrans sebelum memproses apapun** (§9.3)

**Security checklist khusus webhook:**
- [x] Verifikasi signature/status resmi Midtrans, bukan asumsi dari redirect browser — signature SHA512 diverifikasi **dan** status di-refetch langsung dari Midtrans (bukan cuma percaya body webhook)
- [x] Idempotency — dicek via perbandingan status termapping saat ini vs status baru (same-status notification = no-op), bukan via log notification-id terpisah
- [x] Tolak notifikasi yang menurunkan status dari final (`PAID`) kembali ke `PENDING` (§9.4) — lihat tabel transisi di `payment.service.ts`

**Catatan implementasi & testing (keputusan di luar teks PRD eksplisit):**
- Revenue split (`ownerRevenue`/`employeeRevenue`) dihitung dari **`total` (setelah diskon)**, bukan `subtotal` — PRD tidak eksplisit menyebutkan basisnya, tapi split dari total memastikan diskon ditanggung proporsional kedua pihak dan `ownerRevenue+employeeRevenue` selalu pas sama dengan `total`
- `serviceHourType` tersimpan di transaksi tapi **tidak mengubah kalkulasi harga** — tidak ada formula multiplier overtime di PRD manapun
- CASH otomatis `paymentStatus: PAID` saat transaksi dibuat (tidak ada endpoint "confirm cash received" di PRD); QRIS tetap `PENDING` sampai webhook
- `POST /transactions/:id/complete` tidak menyaratkan `paymentStatus: PAID` dulu — PRD memperlakukan ini sebagai aksi lifecycle servis, independen dari pembayaran
- `cancel` hanya mengubah `transactionStatus`, tidak pernah menyentuh `paymentStatus`/trigger refund — refund adalah proses manual terpisah, tidak ada endpoint refund di PRD manapun
- **Diuji langsung ke Midtrans sandbox** (kredensial asli sudah ada di `.env.local`): `charge()` QRIS dan `transaction.status()` dikonfirmasi bekerja dan field response sesuai asumsi kode; formula signature SHA512 dikonfirmasi cocok persis dengan `signature_key` asli dari respons sandbox
- **Belum diuji end-to-end** lewat endpoint asli — `MONGODB_URI` masih placeholder, belum ada koneksi database nyata untuk seed data + jalankan flow penuh. `tsc`/`biome`/`next build` semua clean dan seluruh route ter-mark dynamic dengan benar, tapi itu bukan pengganti test fungsional

**Tests** (§18 bucket Transactions & Midtrans):
- [ ] Skip — belum ada test runner (sama seperti Phase 1/2). Revisit di Phase 7.

**Exit criteria:** DoD §21 #4, #5, #6, #7, #8. **Tercapai secara kode**, dengan catatan belum ada verifikasi end-to-end karena belum ada MongoDB nyata tersambung.

---

### Phase 4 — Inventory
**Models:**
- [x] `models/InventoryMovement.ts` baru (§5.7) — append-only (`createdAt` saja, tidak ada `updatedAt`)

**Services:**
- [x] `services/inventory.service.ts` — stok tidak boleh negatif; `adjustStock` dibungkus `mongoose.startSession().withTransaction()` — lost-update prevention datang dari deteksi write-conflict NATIVE MongoDB (bukan manual conditional-filter seperti kalimat asli di baris ini; transaction sudah cukup dan juga dibutuhkan untuk atomicity Inventory+Movement, jadi satu mekanisme menutupi dua requirement sekaligus — lihat catatan di bawah); setiap perubahan stok (termasuk initial stock saat create, jika > 0) membuat `InventoryMovement` di transaction yang sama (§5.7)

**Validations:** `validations/inventory.schema.ts` — update **tidak** menerima `quantity` sama sekali (hanya lewat stock-movements, supaya tidak bisa bypass audit trail); stock-movement pakai discriminated union: `IN`/`OUT` = delta relatif, `ADJUSTMENT` = angka absolut (lebih cocok untuk kasus stock-take)

**API** (§7.10): list/create/detail/update/soft-delete item, `POST/GET /:id/stock-movements`
- [x] AGENT dibatasi ke `branch` miliknya sendiri; `branchId` dari client tidak bisa dipakai untuk akses branch lain (§7.10)
- [x] HOST boleh filter lintas branch via `branchId` (dan wajib isi `branchId` saat create, karena HOST tidak punya "branch sendiri")
- [x] `DELETE /inventory/:id` adalah HTTP DELETE asli tapi soft-delete di baliknya (`isActive=false`) — beda dari Branch/Service/Customer di Phase 2 yang malah tidak punya route DELETE sama sekali

**Catatan implementasi (di luar teks PRD eksplisit):**
- Lost-update prevention pakai native MongoDB transaction write-conflict (`TransientTransactionError` → `withTransaction` auto-retry), bukan manual conditional-update-filter yang disebut literal di draft checklist awal — fungsinya sama (lost update tidak mungkin terjadi), tapi mekanismenya berbeda dan sekaligus menutupi requirement atomicity Inventory+InventoryMovement (§5.7) tanpa dua lapis logic terpisah. Asumsi: target deploy Atlas (selalu replica set, sesuai `mongodb+srv://` di §3), tidak ada fallback untuk standalone Mongo
- Item baru dengan `quantity` awal > 0 otomatis membuat `InventoryMovement` (`movementType: IN`, reason "Initial stock on item creation") — PRD tidak eksplisit bilang create butuh movement record, tapi ini menutup celah audit (stok nonzero tanpa jejak asal)
- `ADJUSTMENT` butuh `newQuantity` (absolut, bukan delta bertanda) — PRD tidak merinci bentuk inputnya, absolut dipilih karena lebih cocok untuk kasus stock-take/koreksi fisik
- List inventory & stock-movements pakai pagination page/limit sederhana (bukan cursor) — konsisten dengan keputusan Transaction di Phase 3

**Tests** (§18 bucket Inventory) — termasuk test konkurensi lost-update:
- [ ] Skip — belum ada test runner (sama seperti phase sebelumnya). Logic transaction sudah diverifikasi lewat code review manual + `tsc`/`biome`/`next build`, tapi test konkurensi nyata (dua request paralel) belum bisa dijalankan tanpa test runner + Mongo replica set nyata. Revisit di Phase 7.

**Exit criteria:** DoD §21 #11. **Tercapai secara kode**, catatan sama seperti Phase 3 — belum ada verifikasi end-to-end karena `MONGODB_URI` masih placeholder.

**Exit criteria:** DoD §21 #11.

---

### Phase 5 — Approval
**Models (tidak direncanakan di checklist awal, tapi diperlukan — lihat catatan):**
- [x] `models/Transaction.ts` — `ChangeHistorySchema` diperbaiki: field `changes` (generic Mixed) diganti jadi `before`/`after`/`approvedBy`/`approvalReference` sesuai §10.3 persis. Gap ini berasal dari Phase 1 (dibuat sebelum §10.3 benar-benar dibaca detail); Phase 5 justru butuh bentuk yang tepat, jadi diperbaiki sekarang sebelum menulis approval logic di atasnya

**Services:**
- [x] `services/approval.service.ts` — satu change request aktif per transaksi (§5.8, §10.2); requester tidak boleh approve pengajuannya sendiri; re-validasi state transaksi & request saat approve (service/customer bisa saja berubah status antara submit dan review — §10.1 langkah 9); tulis hasil approve ke `changeHistory` yang append-only (§10.3); reject tidak menulis changeHistory sama sekali (tidak ada yang diterapkan ke transaksi, §10.1 langkah 11)
- [x] `lib/utils.ts` — `computeServicePricing` diekstrak dari `transaction.service.ts` supaya approval (saat `serviceId`/`discountAmount` berubah) menghitung ulang `subtotal`/`total`/`ownerRevenue`/`employeeRevenue` dengan formula yang **persis sama** seperti pembuatan transaksi awal, bukan rumus kedua yang bisa drift

**Validations:** `validations/approval.schema.ts` — `requestedChanges` dibatasi ke `serviceId`/`customerId`/`discountAmount`/`serviceHourType` saja (sengaja TIDAK termasuk `paymentMethod` — terlalu terikat ke flow gateway yang sudah berjalan — atau `branch`/`agent`/status fields yang punya mekanisme transisi sendiri); minimal satu field wajib diisi; reject mewajibkan `reviewNote` (§10.1 langkah 11: alasan penolakan wajib dicatat), approve opsional

**API** (§7.9): submit change request, list pending (HOST), detail, approve, reject
- [x] Submit: `POST /transactions/:id/change-requests` (HOST+AGENT, branch-scoped untuk AGENT)
- [x] List pending, detail, approve, reject: semua di namespace top-level `/transaction-change-requests` (bukan nested di `/transactions/:id/...`) — `:id` di sini tetap ID transaksi, karena change request tersimpan sebagai subdokumen, bukan collection sendiri (§5.8)
- [x] Detail: HOST bebas lihat, AGENT hanya kalau dia requester-nya sendiri (§7.9 "request owner if authorized")

**Catatan implementasi (di luar teks PRD eksplisit):**
- `submitChangeRequest` menolak submit untuk transaksi yang `transactionStatus: CANCELLED` — tidak eksplisit di PRD, tapi konsisten dengan guard terminal-state yang sudah ada di `completeTransaction`/`cancelTransaction`
- `submitChangeRequest` juga re-validasi `serviceId`/`customerId` saat submit (fail-fast), bukan cuma saat approve — PRD cuma eksplisit minta re-validasi di langkah approve (§10.1 langkah 9), validasi di submit ini tambahan untuk UX
- Karena `changeRequest` adalah satu subdokumen yang dipakai ulang (bukan collection terpisah), riwayat REJECTED tidak punya jejak permanen begitu transaksi yang sama menerima pengajuan baru — `changeHistory` cuma menyimpan perubahan yang BERHASIL diterapkan (approved), sesuai teks §10.3 "perubahan yang berhasil diterapkan". Ini keterbatasan MVP yang diakui PRD sendiri lewat frasa "untuk MVP" di §5.8, bukan bug

**Tests** (§18 bucket Approval):
- [ ] Skip — belum ada test runner (sama seperti phase sebelumnya). Revisit di Phase 7.

**Exit criteria:** DoD §21 #9, #10. **Tercapai secara kode**, catatan sama seperti Phase 3/4 — belum ada verifikasi end-to-end karena `MONGODB_URI` masih placeholder.

---

### Phase 6 — Dashboard
**Services:**
- [x] `services/dashboard.service.ts` — aggregation pipelines per §12: KPI summary (total revenue PAID-only, transaction count, avg order value, unique customer count), revenue (by period: day/week/month/year + payment method breakdown with owner/agent split), service performance (top 10 by revenue), agent performance (HOST sees all, AGENT forced to self per §12.3), inventory summary (low-stock items), transaction stats (by status/paymentStatus/paymentMethod)

**Rules yang wajib ditegakkan di pipeline** (§12.4):
- [x] Transaksi `CANCELLED` dikecualikan dari omzet — `transactionStatus: { $ne: "CANCELLED" }` di baseTransactionMatch
- [x] Payment `PENDING` tidak dihitung sebagai omzet yang sudah diterima — `$cond: [{ $eq: ["$paymentStatus", "PAID"] }, "$total", 0]` di setiap $sum revenue
- [x] Refund diperlakukan konsisten — payment method breakdown juga pakai PAID-only, tidak ada status REFUNDED diff atau special case (REFUNDED adalah terminal, masuk ke paid revenue)
- [x] Filter branch ikut otorisasi — AGENT selalu dipaksa ke branch sendiri meski query param `branchId` beda (§7.2), implementasi: `user.role === "HOST" ? query.branchId : user.branch || undefined`

**Validations:** `validations/dashboard.schema.ts` — Period enum, shared base query params (period/from/to/compare/branchId/agentId, semua optional dengan default), inventory query (threshold), date range refine validation

**API** (§7.2): 6 endpoints GET-only
- [x] `/dashboard/summary` — KPI snapshot
- [x] `/dashboard/revenue` — Revenue dengan period breakdown & payment method split
- [x] `/dashboard/services` — Top services
- [x] `/dashboard/agents` — Agent metrics (self-only untuk AGENT per §12.3)
- [x] `/dashboard/transactions` — Transaction stats faceted
- [x] `/dashboard/inventory` — Low-stock alert

**Tests** (§18 bucket Dashboard):
- [ ] Skip — belum ada test runner (sama seperti phase sebelumnya). Revisit di Phase 7.

**Catatan implementasi (di luar teks PRD eksplisit):**
- Period comparison (compare param) disiapkan di schema tapi tidak diimplementasikan di aggregation — PRD menyebutnya §12 tapi tidak merinci mekanismenya; untuk MVP cukup beri client flexibility untuk query range lain secara terpisah lalu client-side compute delta
- Agent performance aggregation tidak populate agent object — hanya collect `_id` yang sudah berisi agent ID; populating byName/byEmail di client lebih fleksibel daripada N lookup di DB per request
- Inventory summary memakai `minimumStock` field existing di model (tidak ada perubahan model Phase 6), filtering via `$expr { $lte: ["$quantity", "$minimumStock"] }` memungkinkan per-item threshold yang berbeda

**Exit criteria:** DoD §21 #12. **Tercapai secara kode**, catatan sama seperti Phase 3/4/5 — belum ada verifikasi end-to-end karena `MONGODB_URI` masih placeholder.

---

### Phase 7 — Hardening
- [ ] Lengkapi automated test suite lintas semua modul sesuai §18 penuh (DoD §21 #14)
- [ ] Security pass — telusuri ulang checklist §15 poin 1–15 satu per satu
- [ ] Payment reconciliation script (cocokkan status lokal vs status asli di Midtrans)
- [ ] Performance pass — review index, cek query N+1, pastikan semua list endpoint pakai pagination
- [ ] Deployment checklist — env var di hosting target, pastikan logging aman, siapkan dokumentasi API (DoD §21 #15)

**Exit criteria:** seluruh Definition of Done di §5 bawah ini terpenuhi.

---

### Phase 8 — Subscription & Billing (Platform)

Independen dari Phase 2/4/5/6 — hanya butuh Phase 1 (role `GROOMA_ADMIN`, auth) dan, untuk reuse `lib/midtrans.ts`, Phase 3. Bisa dikerjakan paralel dengan Phase 4/5/6; hardening-nya tetap masuk ke pass Phase 7 di atas.

**Models:**
- [ ] `models/SubscriptionPlan.ts` baru — `code` unik, `price`, `currency`, `billingCycle`, `graceDays`, `isActive`, `updatedBy` (ref User) (PRD §5.10)
- [ ] `models/Subscription.ts` baru — `host` (ref User, unik per HOST), `plan` (ref SubscriptionPlan), `status` enum `ACTIVE|PAST_DUE|EXPIRED|CANCELLED`, `currentPeriodStart`/`currentPeriodEnd`, `graceEndsAt` (PRD §5.11)
- [ ] `models/SubscriptionInvoice.ts` baru — `subscription`, `host`, `invoiceCode`, `periodStart`/`periodEnd`, `amount`, `status`, `dueAt`, `paidAt`, `provider`, `providerOrderId` unik berprefix `GRM-SUB-YYYYMM-XXXXXX`, `qrCodeUrl`/`qrString`, `expiresAt` (PRD §5.12)

**Lib:**
- [ ] `lib/billing.ts` — hitung periode billing, generate `invoiceCode`/`providerOrderId` dengan prefix pembeda dari `transactionCode` POS, cek grace period
- [ ] Reuse `lib/midtrans.ts` (Phase 3) untuk membuat QRIS invoice subscription (PRD §9.5)

**Authorization helpers tambahan:**
- [ ] Middleware namespace `/api/v1/admin/*` yang menolak semua role selain `GROOMA_ADMIN`; sebaliknya endpoint HOST/AGENT biasa menolak `GROOMA_ADMIN` kecuali `/subscription*` (PRD §3.4, §6.4)
- [ ] `requireActiveSubscription` — blokir HOST dengan `Subscription.status` selain `ACTIVE` dari seluruh endpoint selain `/subscription*` dan `/profile`, response `402 Payment Required`. **Tidak pernah diterapkan ke AGENT** (PRD §23.4)

**Services:**
- [ ] `services/subscription.service.ts` — create/get subscription per HOST, transisi status, override manual oleh GROOMA_ADMIN
- [ ] `services/billing.service.ts` — generate invoice baru saat periode berakhir, buat QRIS order, proses notifikasi Midtrans secara idempoten (pola §9.2) khusus `SubscriptionInvoice`, auto-expire invoice/`Subscription` yang lewat grace period

**Validations:** `validations/subscription.schema.ts` (admin: create/update plan, override status)

**API** (PRD §7.11):
- [ ] `GET /api/v1/subscription`, `GET /api/v1/subscription/invoices`, `GET /api/v1/subscription/invoices/:id` — HOST, hanya milik sendiri
- [ ] `GET/POST /api/v1/admin/subscription-plans`, `PATCH /api/v1/admin/subscription-plans/:id` — GROOMA_ADMIN
- [ ] `GET /api/v1/admin/subscriptions`, `GET /:id`, `PATCH /:id/status`, `GET /:id/invoices` — GROOMA_ADMIN
- [ ] `POST /api/v1/internal/subscriptions/run-billing-cycle` — autentikasi `INTERNAL_CRON_SECRET`, dipanggil scheduled job (lihat §2 untuk pilihan scheduler)
- [ ] Perluas webhook `POST /api/v1/payments/midtrans/notification` (Phase 3) agar menentukan domain target (`Payment` vs `SubscriptionInvoice`) berdasarkan prefix `providerOrderId` sebelum memproses (PRD §9.5)

**Tests:**
- [ ] HOST dengan subscription `EXPIRED`/`PAST_DUE` ditolak di luar `/subscription*` dan `/profile`; AGENT di cabang manapun tetap bisa login & bertransaksi
- [ ] `GROOMA_ADMIN` tidak bisa diakses lewat endpoint HOST/AGENT biasa, dan sebaliknya
- [ ] Webhook Midtrans merutekan notifikasi ke `Payment` vs `SubscriptionInvoice` dengan benar berdasarkan prefix, idempoten terhadap notifikasi duplikat
- [ ] Perubahan `SubscriptionPlan.price` tidak mengubah `Subscription`/`SubscriptionInvoice` yang sudah berjalan/terbit

**Exit criteria:** DoD §21 #16, #17.

---

## 5. Definition of Done — Master Checklist

Salinan tracker dari PRD §21, centang di akhir setiap fase yang relevan:

- [ ] HOST dan AGENT dapat login menggunakan session yang aman
- [ ] Role-based dan branch-based authorization diterapkan
- [ ] HOST dapat mengelola cabang dan master data
- [ ] AGENT dapat membuat transaksi pada cabangnya
- [ ] HOST tidak dapat membuat transaksi baru
- [ ] Transaksi menyimpan snapshot harga dan pembagian hasil
- [ ] Pembayaran QRIS terintegrasi dengan Midtrans
- [ ] Status pembayaran hanya berubah melalui proses yang tervalidasi
- [ ] AGENT dapat mengajukan perubahan transaksi
- [ ] HOST dapat menyetujui atau menolak pengajuan
- [ ] Inventaris terisolasi berdasarkan cabang
- [ ] Dashboard menampilkan metrik dari data aktual
- [ ] Seluruh operasi sensitif punya validasi dan audit yang memadai
- [ ] Automated tests mencakup authorization, transaksi, pembayaran, approval, inventaris
- [ ] Dokumentasi API dan konfigurasi environment tersedia
- [ ] HOST membayar subscription bulanan sesuai plan aktif melalui QRIS, status subscription-nya tidak memengaruhi akses AGENT/operasional POS
- [ ] `GROOMA_ADMIN` dapat mengatur harga plan dan memantau/override status subscription seluruh HOST lewat namespace admin yang terisolasi

---

## 6. Urutan & Dependensi Antar Fase

```
Phase 0 (Alignment)
   └── Phase 1 (Foundation)
          │
          ├── Phase 2 (Master Data)
          │      ├── Phase 3 (POS & Payments) ── Phase 5 (Approval, butuh Transaction)
          │      └── Phase 4 (Inventory)
          │
          └── Phase 8 (Subscription & Billing, reuse lib/midtrans.ts dari Phase 3)

Phase 3 + Phase 4 + Phase 5  ──>  Phase 6 (Dashboard, butuh data semua modul)
Phase 6 + Phase 8            ──>  Phase 7 (Hardening)
```

Phase 3 dan Phase 4 bisa dikerjakan paralel (sama-sama hanya bergantung pada Phase 1+2). Phase 6 menunggu data nyata dari Phase 3–5 agar aggregation tidak dites dengan data kosong/palsu.

Phase 8 tidak bergantung pada Phase 2/4/5/6 dan tidak mengirim data ke Dashboard (PRD §12) — subscription adalah modul platform/billing vendor, terpisah dari analytics operasional barbershop. Phase 8 bisa berjalan paralel dengan Phase 2–6 begitu Phase 1 selesai; reuse `lib/midtrans.ts` baru mungkin setelah Phase 3 ada.
