# Grooma — Catatan Sesi Security Hardening (Oktober 2026)

**Status:** Sesi hardening ditutup. Pekerjaan belum di-commit.
**Cakupan:** Perubahan arsitektur deployment, perbaikan otorisasi, modul subscription & pembayaran, idempotency transaksi, dan infrastruktur test.

> **Batas kepercayaan dokumen ini.** Seluruh verifikasi otomatis yang disebut di sini adalah `tsc`, `vitest`, `biome`, dan `next build`. **Semua unit test memakai mock** — tidak ada satu pun jalur yang pernah diuji terhadap MongoDB sungguhan maupun Midtrans sandbox dalam sesi ini. Lihat [Keterbatasan Verifikasi](#keterbatasan-verifikasi) sebelum memakai dokumen ini sebagai dasar klaim kesiapan produksi.

---

## 1. Arsitektur Deployment

### 1 HOST = 1 deployment

Ditetapkan sebagai keputusan arsitektur dan didokumentasikan di **PRD §3.5 "Model Tenancy & Arsitektur Deployment"** (section baru). Satu deployment melayani satu bisnis barbershop; isolasi terjadi di level infrastruktur, bukan level query.

Setiap bisnis baru mendapat: deployment terisolasi, `MONGODB_URI` sendiri, akun Midtrans sendiri (hanya bila mode `MANAGED`), dan build aplikasi mobile sendiri yang menunjuk ke base URL deployment tersebut.

**Konsekuensi yang disengaja:**

- **Tidak ada tenant boundary di dalam kode, dan tidak seharusnya ada.** `requireBranchAccess` yang meloloskan HOST ke semua cabang adalah perilaku benar — hanya ada satu HOST per deployment.
- `Customer`, `Service`, dan `Branch` sengaja **tidak** menyimpan referensi HOST.
- Bisnis kedua = deployment + database baru, bukan akun HOST baru.

Riwayat keputusan: model ini sempat ambigu karena PRD §23.1 menyebut billing *seat-based* pada satu bisnis, sementara pembahasan awal memperlakukan HOST sebagai pelanggan terpisah. Sebuah desain multi-tenant sempat dibangun lalu **sengaja di-revert** (lihat §3). PRD §3.5 kini menjadi sumber kebenaran; jangan menurunkannya lagi dari percakapan.

### Isolasi database

`lib/mongodb.ts` membaca satu `MONGODB_URI` per proses dengan cache koneksi per-process. Tidak ada nama database yang di-hardcode dan tidak ada jalur akses lintas-database. Terverifikasi lewat pembacaan kode, **belum** lewat uji runtime multi-deployment.

### Konfigurasi pembayaran — PRD §9.6

Mode pembayaran adalah **properti deployment** (environment variable), bukan baris di database.

| | `MANAGED` | `SELF_RECORDED` |
|---|---|---|
| Sumber QRIS | Akun Midtrans **milik HOST itu sendiri** | QRIS milik HOST di luar Grooma |
| `MIDTRANS_*` | Wajib | Dikosongkan |
| `paymentStatus` awal (QRIS) | `PENDING` → `PAID` via webhook | langsung `PAID` |
| `POST /payments/qris` | Membuat order | Menolak dengan error bisnis |
| Posisi Grooma atas dana | Tidak pernah memegang dana | Tidak pernah menyentuh dana |

**Implikasi penting:** karena kredensial Midtrans pada sebuah deployment adalah milik HOST tersebut, dana settle langsung ke rekening HOST. Ini menghapus kebutuhan ledger saldo per-HOST dan mekanisme disbursement, serta menghilangkan eksposur aktivitas penampungan dana pihak ketiga. Item *out of scope* soal ledger/disbursement di PRD §20 dan peringatan legal di §9.6 **dihapus, bukan ditunda** — masalahnya memang tidak ada lagi pada arsitektur ini.

`lib/paymentConfig.ts` memvalidasi saat boot: `MANAGED` tanpa kredensial Midtrans membuat aplikasi **gagal start**, dan nilai typo ditolak alih-alih diam-diam dianggap `MANAGED`.

### Provisioning HOST

Runbook: **`docs/PROVISIONING-HOST.md`** (5 langkah + checklist + matriks env per mode).

Dua blocker provisioning ditemukan dan diperbaiki:

1. **Deployment `SELF_RECORDED` tidak bisa boot.** `lib/midtrans.ts` throw di module scope bila kredensial kosong, dan modul itu ada di import path setiap route transaksi (`transactionService → paymentService → lib/midtrans`). Deployment untuk HOST yang memakai QRIS sendiri — yang sah tidak punya akun Midtrans — tidak dapat memuat route transaksi sama sekali. Kredensial sekarang dibaca **lazy** (`getCoreApi()` / `requireServerKey()`). Terkonfirmasi lewat probe test bahwa seluruh import path transaksi bersih tanpa `MIDTRANS_*`.
2. **Deployment baru tidak bisa membuat HOST pertama.** `POST /users` mewajibkan HOST yang sudah login, dan GROOMA_ADMIN diblokir dari endpoint itu, sehingga database kosong tidak punya jalan masuk. Ditambahkan `scripts/seedHost.ts` (+ `scripts/seedUser.ts` sebagai logika bersama, + `npm run seed:host` / `seed:admin`).

Selain itu `scripts/seedAdmin.ts` sebelumnya **meng-hardcode username dan password asli** di source. Pada model satu deployment per HOST, itu berarti seluruh instance berbagi kredensial admin yang sama. Sekarang wajib lewat env (`SEED_ADMIN_*` / `SEED_HOST_*`) tanpa fallback — **perubahan breaking pada cara script dipanggil.**

---

## 2. Autentikasi, Otorisasi, Dashboard, Subscription Enforcement

### Dashboard — kebocoran data operasional ke GROOMA_ADMIN

Keenam route dashboard sebelumnya hanya memakai `requireAuth` tanpa `requireRole`. Di `services/dashboardService.ts`, filter cabang berbentuk:

```
branchId = user.role === "HOST" ? query.branchId : user.branch || undefined
```

GROOMA_ADMIN memiliki `branch: null` dan role-nya bukan HOST maupun AGENT, sehingga ekspresi itu menghasilkan `undefined` → **tanpa filter** → agregasi seluruh revenue, statistik transaksi, performa agent, performa layanan, dan inventaris. Melanggar PRD §3.1 dan §3.2 (Dashboard → GROOMA_ADMIN: **No**).

Diperbaiki dengan `requireRole(user, ["HOST", "AGENT"])` pada keenam route. Endpoint detail transaksi/inventaris tidak terdampak karena `requireBranchAccess` sudah menolak `branch: null`.

### Subscription enforcement — HTTP 402 (PRD §23.4)

`requireActiveSubscription` sebelumnya **terdefinisi tetapi tidak pernah dipanggil dari mana pun**, sehingga §23.4 sama sekali tidak ditegakkan. Fungsi itu juga melempar `new Error("PAYMENT_REQUIRED")` — bukan `AppError` — sehingga seandainya diwire apa adanya hasilnya 500, bukan 402.

Implementasi sekarang:

- `Errors.paymentRequired()` → kode `PAYMENT_REQUIRED`, status **402**.
- Enforcement dipasang **di dalam `requireAuth`, aktif secara default**, sehingga endpoint baru tergate sejak ditulis. Route yang §23.4 biarkan terbuka opt-out eksplisit lewat `requireAuth(request, { subscriptionExempt: true })`: `/profile`, `/subscription*`, `/auth/me`, `/auth/change-password`. (`/auth/logout` tidak memakai `requireAuth`.)
- Logika keputusan dipisah ke `assertSubscriptionAllowsAccess(user, status)` yang murni, agar matriks role × status teruji tanpa database.
- Status yang mencabut akses: `PAST_DUE`, `EXPIRED`, `CANCELLED`. AGENT dan GROOMA_ADMIN tidak pernah diblokir.

### Pembatasan akses berdasarkan role

- `/subscription`, `/subscription/invoices`, `/subscription/invoices/:id` kini `requireRole(user, ["HOST"])` (sebelumnya hanya `requireAuth`, kontradiksi dengan §3.2).
- `GET /api/v1/subscription/invoices/:id` sebelumnya melempar `new Error("NOT_FOUND")` / `new Error("FORBIDDEN")`. `handleApiError` tidak punya pencocokan string untuk itu, sehingga **setiap** kasus — termasuk "invoice milik orang lain" yang normal — menghasilkan **500** dan tercatat sebagai "Unhandled API error". Diganti `Errors.notFound()` / `Errors.forbidden()`.

### Pencabutan sesi setelah ganti password

`revokeOtherSessions(userId, keepToken?)` ditambahkan di `lib/auth.ts` dan dipanggil setelah password tersimpan di `POST /auth/change-password`. Sesi perangkat yang sedang dipakai dipertahankan (keputusan yang ditetapkan); seluruh sesi lain dicabut. Response menyertakan `revokedSessions`.

---

## 3. Webhook Midtrans, Invoice, Aktivasi Subscription

### Verifikasi signature — jalur subscription sebelumnya terlewat

`routeMidtransNotification()` hanya memverifikasi signature di dalam `processMidtransNotification()`, yaitu **hanya pada cabang POS**. Setiap `order_id` berawalan `GRM-SUB` dikirim ke billing service langsung dari webhook publik **tanpa verifikasi apa pun** — bertentangan dengan PRD §23.5 yang menyatakan eksplisit *"tidak ada jalur pintas"*.

Dampaknya terbatas karena handler tetap me-refetch status otoritatif dari Midtrans, sehingga penyerang **tidak dapat** memalsukan status `PAID`. Yang dimungkinkan: memicu outbound call Midtrans tanpa autentikasi, enumerasi order ID valid lewat perbedaan response, dan write DB tanpa batas.

Verifikasi sekarang dilakukan di `routeMidtransNotification()` **sebelum** prefix diperiksa, sehingga kedua cabang terlindungi. Cek di dalam `processMidtransNotification()` dipertahankan sebagai defense-in-depth karena fungsi itu di-export dan harus tetap aman bila dipanggil langsung.

### Dua bug dengan akar yang sama: `doc.populated(path)`

Mongoose `doc.populated(path)` mengembalikan **_id yang dipopulasi, bukan dokumennya**. Pola ini dipakai di dua tempat dan keduanya rusak:

1. **Aktivasi subscription** (`processSubscriptionInvoiceNotification`): `invoice.populated("subscription")` menghasilkan ObjectId, lalu `subscription.save()` dipanggil pada ObjectId → `TypeError` tepat di jalur yang mengaktifkan subscription yang baru dibayar.
2. **Penerbitan invoice** (`generateSubscriptionInvoice`): `subscription.populated("plan")` menghasilkan ObjectId, sehingga `plan.price` dan `plan.billingCycle` keduanya `undefined`. Akibatnya `amount` gagal validasi `required`, **dan** `calculateNextBillingPeriod` jatuh ke cabang `else` → periode **tahunan** untuk plan bulanan.

Artinya **seluruh siklus billing belum pernah berfungsi**: invoice tidak pernah berhasil diterbitkan, dan seandainya berhasil, aktivasinya akan throw. Cron membungkusnya dalam `try/catch` yang mencatat lalu melanjutkan, sehingga kegagalan ini senyap.

Keduanya diperbaiki dengan pemuatan eksplisit (`SubscriptionModel.findById` / `SubscriptionPlanModel.findById`). `grep "\.populated("` kini bersih dari pemakaian di kode produksi.

### Transisi status & idempotency pembayaran

Jalur invoice subscription sebelumnya tidak punya guard transisi sama sekali, sedangkan jalur POS sudah punya `ALLOWED_TRANSITIONS`. Ditambahkan `ALLOWED_INVOICE_TRANSITIONS`:

```
PENDING  → PENDING, PAID, FAILED, EXPIRED
PAID     → PAID, REFUNDED
FAILED   → FAILED
EXPIRED  → EXPIRED
REFUNDED → REFUNDED
```

Sesuai PRD §9.4, invoice yang sudah `PAID` tidak dapat kembali ke `PENDING` karena notifikasi lama datang terlambat.

Status Midtrans yang tidak dikenal kini menghasilkan `unmapped_status` alih-alih diam-diam menjadi `PENDING` (perilaku lama `|| "PENDING"`).

**Notifikasi untuk invoice tak dikenal:** sebelumnya melempar `Errors.notFound("Invoice")`, dan pemanggilnya mencoba mendeteksinya dengan `error.message === "NOT_FOUND"` — yang **tidak pernah cocok**, karena `message`-nya adalah `"Invoice"`. Hasilnya webhook membalas **404** sehingga Midtrans **retry tanpa henti**. Sekarang mengembalikan `{ applied: false, reason: "unknown_order" }` agar route tetap ack 200, konsisten dengan desain jalur POS.

---

## 4. Idempotency-Key pada POST /transactions

### Mekanisme

- Header **`Idempotency-Key`** opsional pada `POST /api/v1/transactions`.
- `models/IdempotencyKey.ts` dengan **unique index `{ user, key }`** dan TTL index 24 jam.
- Key di-scope per user sehingga satu akun tidak dapat memakai atau memblokir key akun lain.

### Keamanan terhadap request bersamaan

Pemenang ditentukan oleh **unique index**, bukan pengecekan read-then-write: dua submit simultan sama-sama mencoba insert dan tepat satu lolos, sehingga tidak ada jendela di mana keduanya berjalan. Ada test dengan tiga claim paralel yang memastikan tepat satu `acquired`.

Urutan operasi yang disengaja:

1. Key di-claim **setelah** semua validasi lolos — request yang ditolak tidak membakar key klien.
2. Bila `TransactionModel.create` gagal, key **di-release** agar retry tidak terblokir sampai TTL habis.
3. Key di-complete **sebelum** percobaan Midtrans, sehingga kegagalan gateway tidak membuat retry melahirkan sale kedua.
4. Replay memuat transaksi asli **beserta Payment terakhirnya**, agar sale QRIS yang di-retry tetap menerima QR-nya.

### Migrasi menuju wajib

`REQUIRE_IDEMPOTENCY_KEY` per deployment, default off. Model satu deployment per HOST membuat ini **bukan flag day**: setiap deployment menyalakannya sendiri setelah build mobile yang menunjuk ke situ mengirim header. Selama off, setiap submit tanpa key dicatat lewat `logger.warn` beserta `headerPresent`, sehingga adopsi dapat diverifikasi sebelum enforcement dinyalakan. Klien yang sudah beredar tidak rusak.

### Keterbatasan yang diketahui

1. **Tidak otomatis melindungi.** Klien yang tidak mengirim header tetap bisa double-submit. Aplikasi mobile perlu diperbarui.
2. **TTL 24 jam bukan idempotensi abadi.** Setelah TTL habis, key yang sama akan membuat transaksi baru. Dapat diterima untuk guard double-tap; bukan jaminan permanen.
3. **Replay dapat mengembalikan QRIS kedaluwarsa.** QRIS expired dalam 15 menit. Klien dapat mendeteksinya dari `status`/`expiresAt` lalu memanggil `POST /payments/qris`. Replay sengaja **tidak** me-regenerate, karena itu akan membuat Payment baru dan melanggar idempotensi.
4. **Claim mangkrak.** Bila proses mati setelah claim tetapi sebelum `create`, atau bila `completeIdempotencyKey` gagal setelah transaksi dibuat, key itu ditolak 409 sampai TTL habis. Ada guard replay untuk kasus transaksi tidak ditemukan.

---

## 5. Rate Limiting, Validasi Seed, Scalar, Utilitas

### Rate limiting — `getClientIp`

Sebelumnya mengambil entri **paling kiri** dari `X-Forwarded-For`, yang sepenuhnya diisi pemanggil. Throttle login (10 percobaan / 15 menit) karena itu dapat dilewati tanpa batas dengan mengirim nilai header yang berubah-ubah.

`X-Forwarded-For` bertambah dari kiri ke kanan, setiap proxy meng-append peer yang menghubunginya. Dengan `n` proxy terpercaya, klien asli adalah entri ke-`n` **dari kanan**. Implementasi sekarang menghitung dari kanan sesuai `TRUSTED_PROXY_HOP_COUNT`, dan semua jalur gagal menutup ke bucket bersama (`"unknown"` / `"direct"`) — bukan ke header yang bisa dipalsukan.

Nilai hop **tidak ditebak**. Audit repo menemukan tidak ada manifest deployment sama sekali (tanpa `vercel.json`, Dockerfile, maupun config reverse proxy) dan PRD §2 sendiri menyebut *"Vercel atau Node.js-compatible hosting"* — topologi hanya diketahui oleh yang mengoperasikan deployment. Produksi karena itu **gagal start** bila variabel ini tidak di-set; development default `0`, yang memang benar untuk `next dev`.

### Validasi seed

- Password **tidak lagi di-trim**. Trimming berarti meng-hash secret yang berbeda dari yang di-set operator, sehingga password dengan spasi di ujung tidak mungkin dipakai login.
- Username dan name tetap di-trim (keduanya identifier, dan schema men-trim saat save).
- Validasi panjang disamakan dengan `validations/userSchema.ts`: username 3–64, password 8–128, name 1–100.
- `scripts/seedHost.ts` **menolak** bila deployment sudah memiliki akun HOST, dengan pesan yang mengarahkan ke deployment terpisah. Idempotensi untuk username yang sama tetap utuh — password akun yang sudah ada tidak pernah ditimpa.

### Scalar API docs

`app/scalar/docs/_config.ts` sebelumnya meng-hardcode satu URL produksi, yang pasti salah di setiap deployment selain yang menjadi acuan penulisannya. Sekarang membaca `APP_BASE_URL`, dengan fallback `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`, lalu localhost. Docs tetap disembunyikan ketika `APPLICATION_ENVIRONMENT=production`.

### `extractRefId` (`lib/utils.ts`)

Sebelumnya mengembalikan `String(ref)` untuk semua masukan, menghasilkan `"null"`, `"undefined"`, atau `"[object Object]"` untuk input tanpa id. Nilai itu masuk langsung ke `requireBranchAccess`, di mana string non-kosong adalah target perbandingan nyata. Sekarang mengembalikan `""` untuk input yang tidak punya id, sambil tetap mendukung ObjectId mentah (dideteksi lewat `toString !== Object.prototype.toString`).

Catatan kejujuran: perilaku lama **fail-closed** dalam praktik — `"[object Object]"` tidak akan cocok dengan branch id mana pun — jadi ini bukan bypass otorisasi yang dapat dieksploitasi, melainkan perbaikan kebenaran.

---

## 6. Test, Bug yang Ditemukan, File yang Berubah

### Infrastruktur test — satu suite tidak pernah berjalan

`lib/authorization.test.ts` gagal **dimuat** (bukan gagal assertion) karena `lib/auth.ts` throw `Missing SESSION_SECRET` di module scope sementara `vitest.config.ts` memiliki `setupFiles: []`. Akibatnya **11 test pada modul paling security-critical tidak pernah dieksekusi**, dan jumlah "110 passed" menyembunyikan fakta itu karena test yang tidak berjalan tidak ikut dihitung.

Ditambahkan `vitest.setup.ts` yang menyuntik env dengan `??=` (env nyata selalu menang). Setelah suite hidup, **4 dari 11 test ternyata gagal**: assertion mengharap pesan `"Access denied"` sementara implementasi selalu mengembalikan `"You do not have permission to access this resource."`. Perilakunya sudah benar (403 `FORBIDDEN` dilempar) — hanya string-nya basi. Assertion diganti ke kontrak stabil (`code` + `status`) lewat helper `expectForbidden()`; pesan produksi tidak diubah.

### Dua test yang salah vs implementasi yang salah

| Test | Putusan | Dasar |
|---|---|---|
| `errors.test.ts` businessRule | **Test salah** | PRD §14 menetapkan 422 = "Business validation failure" (400 untuk "Invalid input"), dan `git log -L` membuktikan `BUSINESS_RULE_VIOLATION`/422 tidak pernah berubah sejak commit pertama `ca5c3bb` |
| `utils.test.ts` extractRefId ×2 | **Implementasi salah** | Ada test `"should extract id from raw ObjectId"` yang lulus, jadi kontraknya jelas; implementasi diperbaiki dengan tetap mempertahankan ObjectId |

### Bug yang ditemukan selama sesi

| | Temuan | Status |
|---|---|---|
| 1 | Webhook subscription tanpa verifikasi signature (PRD §23.5) | Diperbaiki |
| 2 | GROOMA_ADMIN dapat membaca seluruh data dashboard operasional | Diperbaiki |
| 3 | `requireActiveSubscription` dead code → §23.4 tidak ditegakkan | Diperbaiki |
| 4 | Suite otorisasi tidak pernah dijalankan | Diperbaiki |
| 5 | `doc.populated()` → aktivasi subscription `TypeError` | Diperbaiki |
| 6 | `doc.populated()` → penerbitan invoice selalu gagal + periode tahunan | Diperbaiki |
| 7 | Deployment `SELF_RECORDED` tidak dapat memuat route transaksi | Diperbaiki |
| 8 | Deployment baru tidak dapat membuat HOST pertama | Diperbaiki |
| 9 | Kredensial admin di-hardcode di source | Diperbaiki |
| 10 | Invoice tak dikenal → 404 → Midtrans retry tanpa henti | Diperbaiki |
| 11 | Jalur invoice tanpa guard transisi status | Diperbaiki |
| 12 | Raw `Error` sentinel → 500 alih-alih 403/404 | Diperbaiki |
| 13 | Rate limit login dapat dilewati via `X-Forwarded-For` | Diperbaiki |
| 14 | Scalar meng-hardcode satu URL produksi | Diperbaiki |
| 15 | Password seed di-trim; username tanpa validasi panjang | Diperbaiki |
| 16 | `GET /transactions/:id/receipt` mengubah state (CSRF-able) | **Ditunda** — lihat §7 |

### Modul baru

`lib/paymentConfig.ts`, `lib/idempotency.ts`, `models/IdempotencyKey.ts`, `scripts/seedUser.ts`, `scripts/seedHost.ts`, `vitest.setup.ts`.

### Hasil verifikasi terakhir yang tersedia

Dijalankan pada akhir sesi, sebelum penulisan dokumen ini:

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` | exit 0 |
| `biome check` | clean, 144 file |
| `next build` | Compiled successfully |
| Suite gagal dimuat | **0** |
| `vitest run` | **16 suite / 207 test — semua lulus** |

Perkembangan jumlah test: `113 (3 gagal, 1 suite mati)` → `147 (3 gagal)` → `168 (0 gagal)` → **`207 (0 gagal)`**.

Rincian per suite pada pengukuran terakhir: approvalSchema 29, transactionSchema 25, errors 18, utils 18, authSchema 17, subscriptionEnforcement 15, authorization 14, idempotency 13, clientIp 11, seedUser 10, billingNotification 8, subscriptionLifecycle 7, routeGuards 7, paymentSchema 6, paymentNotificationRouting 5, sessionRevocation 4.

---

## Keterbatasan Verifikasi

**Ini bagian terpenting dokumen ini. `tsc`, `vitest`, `biome`, dan `next build` yang hijau tidak berarti siap produksi.**

Yang **sudah** diverifikasi: tipe, lint, kompilasi build, dan logika unit terhadap mock.

Yang **belum pernah** dijalankan sekali pun dalam sesi ini:

- Perilaku unique index `{ user, key }` pada MongoDB sungguhan — penanganan error E11000 diasumsikan dari dokumentasi, bukan diamati.
- TTL index pada `IdempotencyKey` dan `Session`.
- Penerbitan invoice, aktivasi subscription, dan webhook terhadap Midtrans sandbox.
- Enforcement 402 pada level route dengan database nyata (hanya fungsi keputusan murni yang diuji).
- Pemisahan data antar deployment pada runtime.
- Perilaku `TRUSTED_PROXY_HOP_COUNT` di belakang proxy sungguhan.

Smoke test end-to-end terhadap MongoDB dan Midtrans sandbox belum dilakukan dan tetap menjadi prasyarat sebelum produksi.

---

## 7. Keputusan Arsitektur & Pekerjaan yang Ditunda

### Keputusan yang sudah ditetapkan

1. **1 HOST = 1 deployment** dengan database dan konfigurasi pembayaran terisolasi (PRD §3.5). Tidak ada tenant boundary di dalam kode.
2. **Mode pembayaran sebagai environment variable**, bukan data. Desain berbasis database sempat dibangun lalu di-revert; commit `06946dc` dan `9ba6fe7` (`User.paymentIntegrationMode`, `Branch.host`, `PATCH /admin/hosts/:id/payment-integration-mode`) **sudah digantikan, bukan kondisi saat ini**.
3. **`MANAGED` memakai akun Midtrans milik HOST**, sehingga Grooma tidak pernah memegang dana. Ledger dan disbursement dihapus dari scope, bukan ditunda.
4. **Sesi saat ini dipertahankan** setelah ganti password; sesi lain dicabut.
5. **Subscription enforcement dilakukan di aplikasi** dengan HTTP 402 sesuai §23.4. Penghentian deployment di level infrastruktur boleh mendukung, tetapi tidak menggantikan enforcement aplikasi.
6. **Idempotency-Key akan menjadi wajib** setelah seluruh klien mobile kompatibel, lewat `REQUIRE_IDEMPOTENCY_KEY` per deployment. TTL tetap 24 jam.

### Pekerjaan yang sengaja ditunda

| | Keputusan | Alasan |
|---|---|---|
| **`TRUSTED_PROXY_HOP_COUNT`** | Nilainya **ditunda sampai platform hosting ditetapkan.** Implementasi tidak diubah dan tidak ada nilai yang ditebak. | Topologi proxy tidak dapat ditentukan dari repo; hanya operator deployment yang mengetahuinya. **Konfigurasi ini perlu ditentukan sebelum deployment pada lingkungan yang mensyaratkannya** — produksi gagal start tanpa nilai eksplisit (disengaja). Panduan nilai dan cara verifikasi ada di `docs/PROVISIONING-HOST.md`. |
| **Subscription awal** | **Perilaku saat ini dipertahankan:** HOST tanpa record `Subscription` tetap diizinkan mengakses aplikasi. Provisioning dan enforcement tidak diubah. | Memblokir pada ketiadaan record akan mematikan setiap deployment yang baru di-provision, karena `seedHost` berjalan sebelum siklus billing pertama menerbitkan invoice. Hanya status non-paying eksplisit yang mencabut akses. |
| **`GET /transactions/:id/receipt`** | **Perubahan mekanisme pencatatan cetak ditunda.** Implementasi saat ini dipertahankan. | Endpoint ini mengubah state (`receipt.printed`, `printedAt`, `printCount++`, lalu `.save()` di `services/transactionService.ts`). `sameSite: "lax"` memblokir POST/PATCH/DELETE lintas-site, tetapi **tetap mengirim cookie pada navigasi GET top-level**, sehingga HOST/AGENT yang diarahkan ke sebuah link dapat menaikkan counter cetak lintas-site. **Risiko kecil:** hanya menyentuh counter audit cetak, tanpa dampak finansial maupun otorisasi, dan membutuhkan pengetahuan ID transaksi. Ini satu-satunya celah yang `sameSite: lax` tidak tutup. |
| **Rate limit per-username** | **Tidak diimplementasikan.** Rate limit berbasis IP yang sudah ada dipertahankan; tidak ada account lockout atau mekanisme baru. | Brute-force terdistribusi lintas banyak IP tetap mungkin, tetapi menambah limit per-username membuka vektor account-lockout. Trade-off ini tidak diambil tanpa keputusan terpisah. |

### Masih terbuka (di luar empat keputusan di atas)

- **Platform Admin terpusat.** Modul `/admin/subscriptions` (§7.11) dirancang sebagai dashboard lintas seluruh HOST, padahal setiap database hanya memuat satu `Subscription`. Pandangan lintas-HOST hanya mungkin berada di aplikasi web admin terpusat yang mengagregasi banyak deployment. Dicatat di PRD §23.1; **sengaja tidak dibangun** dalam sesi ini.
- Tidak ada CSRF middleware (termitigasi `sameSite: "lax"` kecuali kasus receipt di atas).
- `lib/authorization.ts` masih memiliki `requireActiveSubscription` versi DB-aware yang melakukan dynamic import — berfungsi, tetapi belum diuji pada level route dengan database nyata.

---

## Referensi

- `docs/PRD-GROOMA.md` — §2 (stack & deployment), §3.5 (tenancy), §9.6 (mode pembayaran), §14 (error handling), §23.1/§23.4/§23.5 (subscription)
- `docs/PROVISIONING-HOST.md` — runbook provisioning deployment HOST baru
- `docs/ROLES-SUMMARY.md` — ringkasan kapabilitas per role + daftar endpoint
- `docs/SECURITY-AUDIT.md` — audit Phase 7; beberapa bagiannya dikoreksi oleh dokumen ini
