# GROOMA
## Backend Product Requirements Document (PRD)

**Product:** Grooma — Barbershop Management & POS System  
**Document Type:** Backend PRD  
**Version:** 1.1  
**Status:** Ready for Development Planning  
**Changelog:** v1.1 menambahkan modul Subscription & Billing (Platform) dan role `GROOMA_ADMIN` — lihat §23.

---

# 1. Product Overview

## 1.1. Deskripsi Produk

Grooma adalah aplikasi manajemen operasional barbershop berbasis web yang mendukung pengelolaan transaksi, pelanggan, layanan, inventaris, pegawai, cabang, dan laporan operasional melalui satu sistem terintegrasi.

Backend Grooma bertanggung jawab atas autentikasi pengguna, otorisasi berbasis role dan cabang, validasi transaksi, pemrosesan pembayaran QRIS melalui Midtrans, manajemen inventaris, approval perubahan transaksi, serta penyediaan data analytics untuk dashboard.

## 1.2. Product Objectives

1. Menyederhanakan pencatatan transaksi barbershop.
2. Mengintegrasikan pembayaran QRIS melalui Midtrans.
3. Memungkinkan HOST mengawasi transaksi dan operasional seluruh cabang.
4. Membatasi akses AGENT berdasarkan cabang yang ditugaskan.
5. Menyediakan dashboard analytics berdasarkan data operasional aktual.
6. Menyediakan mekanisme approval untuk koreksi transaksi.
7. Memusatkan manajemen pegawai, layanan, pelanggan, dan inventaris.
8. Memonetisasi platform melalui subscription bulanan berbayar untuk akun HOST, dikelola lewat role platform internal `GROOMA_ADMIN`.

## 1.3. Target Users

### HOST
Pengelola atau administrator Grooma yang memiliki akses lintas cabang untuk mengawasi operasional, menyetujui perubahan transaksi, mengelola cabang, serta mengelola master data.

### AGENT
Pegawai operasional barbershop yang bertanggung jawab mencatat transaksi, mengelola inventaris cabangnya, melihat dashboard, dan mengajukan koreksi transaksi.

### GROOMA ADMIN
Administrator internal platform Grooma (pemilik produk/vendor). Tidak terlibat dalam operasional harian barbershop manapun dan tidak memiliki penugasan cabang. Bertanggung jawab mengatur konfigurasi subscription (harga, plan), memantau status pembayaran subscription seluruh akun HOST, dan melakukan override manual pada status subscription bila diperlukan untuk dukungan pelanggan. Diakses melalui dashboard dan namespace API terpisah dari HOST/AGENT (lihat §23).

---

# 2. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js App Router |
| Language | TypeScript |
| API | Next.js Route Handlers |
| Database | MongoDB Atlas |
| ODM | Mongoose |
| Validation | Zod |
| Payment Gateway | Midtrans |
| Authentication | Session-based authentication |
| Password Hashing | Argon2id atau bcrypt |
| Analytics | MongoDB Aggregation Pipeline |
| API Response | JSON |
| Deployment | Vercel atau Node.js-compatible hosting |

### Architecture Principle

Grooma menggunakan pendekatan modular monolith.

Seluruh modul backend berada dalam satu aplikasi Next.js, tetapi dipisahkan berdasarkan domain bisnis agar mudah dikembangkan, diuji, dan dipelihara.

Tidak diperlukan microservices pada tahap MVP.

---

# 3. User Roles & Authorization

Grooma menggunakan tiga role:

- `HOST` — role operasional, mengelola bisnis barbershop lintas cabang.
- `AGENT` — role operasional, mencatat transaksi pada satu cabang yang ditugaskan.
- `GROOMA_ADMIN` — role platform internal (vendor Grooma), mengelola subscription/billing seluruh akun HOST. Tidak memiliki cabang dan tidak terlibat pada operasional POS (lihat §23).

Setiap pengguna HOST/AGENT memiliki identitas akun, role, dan penugasan cabang. `GROOMA_ADMIN` memiliki identitas akun dan role tanpa penugasan cabang.

## 3.1. User Model Requirements

Field utama:

- `_id`
- `username`
- `password`
- `name`
- `role`
- `branch`
- `phone`
- `address`
- `photoUrl`
- `status`
- `createdAt`
- `updatedAt`

### Role Definition

`HOST`
- Memiliki akses ke seluruh cabang.
- Dapat mengelola data cabang.
- Dapat mengelola akun pegawai dan master data.
- Dapat melihat transaksi seluruh cabang.
- Dapat menyetujui atau menolak pengajuan perubahan transaksi.
- Tidak dapat membuat transaksi baru.

`AGENT`
- Memiliki akses ke cabang yang ditugaskan.
- Dapat membuat transaksi.
- Dapat melihat riwayat transaksi sesuai aturan akses.
- Dapat mengajukan perubahan transaksi.
- Dapat melakukan CRUD inventaris cabangnya.
- Dapat melihat profil dan dashboard.

`GROOMA_ADMIN`
- Tidak terasosiasi dengan cabang manapun (`branch` selalu `null`).
- Tidak dapat mengakses data operasional POS milik HOST/AGENT (customer, transaksi, inventaris) kecuali untuk kebutuhan audit billing.
- Dapat mengelola konfigurasi `SubscriptionPlan` (harga, status aktif).
- Dapat melihat seluruh `Subscription` dan `SubscriptionInvoice` milik semua akun HOST.
- Dapat melakukan override manual status subscription (misal setelah verifikasi pembayaran di luar sistem).
- Akun `GROOMA_ADMIN` tidak dapat dibuat melalui endpoint publik atau endpoint User Management biasa; provisioning dilakukan secara internal/terbatas.

## 3.2. Authorization Matrix

| Feature | HOST | AGENT | GROOMA ADMIN |
|---|---|---|---|
| Login | Yes | Yes | Yes (separate admin namespace) |
| Dashboard | All branches | Assigned branch | No (has its own admin dashboard, not this one) |
| View transactions | All branches | Assigned branch | No |
| Create transaction | No | Yes | No |
| Request transaction changes | Yes, if needed | Yes | No |
| Approve transaction changes | Yes | No | No |
| Reject transaction changes | Yes | No | No |
| View inventory | All branches | Assigned branch | No |
| Create inventory | Any branch | Assigned branch | No |
| Update inventory | Any branch | Assigned branch | No |
| Delete inventory | Any branch | Assigned branch | No |
| View profile | Yes | Yes | Yes (own profile only) |
| Update own profile | Yes | Yes | Yes (own profile only) |
| Manage branches | Yes | No | No |
| Manage users/employees | Yes | No | No |
| Manage services | Yes | No | No |
| Manage customers | Yes | No | No |
| Attendance | Deferred | Deferred | Deferred |
| View own subscription & invoices | Yes | No | No |
| Pay subscription invoice | Yes (via QRIS) | No | No |
| Configure subscription plan/price | No | No | Yes |
| View/manage all HOST subscriptions | No | No | Yes |
| Manual override subscription status | No | No | Yes |

**Important:** HOST boleh mengajukan perubahan transaksi apabila diperlukan, tetapi persetujuan harus mengikuti kebijakan pemisahan tugas yang ditetapkan. Secara default, pengguna tidak boleh menyetujui pengajuan perubahan miliknya sendiri.

## 3.3. Branch-Based Authorization

Setiap AGENT wajib memiliki penugasan cabang yang valid.

Setiap transaksi harus menyimpan referensi cabang secara eksplisit. Inventaris juga harus memiliki referensi cabang.

Ketika AGENT melakukan request, backend wajib memverifikasi bahwa cabang pada data sesuai dengan cabang yang ditugaskan kepada pengguna.

Backend tidak boleh mempercayai `branchId` dari request body tanpa melakukan validasi terhadap identitas pengguna yang sedang login.

HOST dapat mengakses seluruh cabang, tetapi tetap harus menggunakan filter cabang ketika melakukan operasi pada cabang tertentu.

## 3.4. Platform Role Isolation

`GROOMA_ADMIN` beroperasi pada namespace API terpisah (`/api/v1/admin/*`) dengan middleware yang menolak role `HOST`/`AGENT`. Sebaliknya, endpoint HOST/AGENT biasa menolak role `GROOMA_ADMIN`, kecuali endpoint subscription milik HOST sendiri (`/subscription*`) yang memang untuk HOST, bukan untuk admin.

`GROOMA_ADMIN` tidak tunduk pada branch-based authorization karena tidak memiliki cabang. Status subscription salah satu akun HOST tidak pernah memengaruhi kemampuan login atau akses AGENT pada cabang manapun — pembatasan hanya berlaku pada akun HOST yang bersangkutan (lihat §23.4).

---

# 4. Core Business Modules

Grooma terdiri dari modul berikut:

1. Authentication & Authorization
2. User Management
3. Branch Management
4. Customer Management
5. Service Management
6. Transaction Management
7. Payment Integration
8. Transaction Change Approval
9. Inventory Management
10. Dashboard & Analytics
11. Profile Management
12. Audit Logging
13. Subscription & Billing (Platform)

Attendance dan fingerprint integration berada di luar scope MVP. Modul Subscription & Billing dikelola oleh role `GROOMA_ADMIN` dan terpisah dari modul operasional barbershop lainnya (lihat §23).

---

# 5. Database Design

Database menggunakan MongoDB dengan Mongoose sebagai ODM.

Seluruh model menggunakan `timestamps: true` kecuali terdapat kebutuhan khusus.

## 5.1. User

Menyimpan akun dan informasi pegawai.

Field:
- `_id`
- `username`: unique, lowercase
- `password`: password hash, tidak disertakan dalam query biasa
- `name`
- `role`: `HOST | AGENT`
- `branch`: reference ke Branch, wajib untuk AGENT
- `phone`
- `address`
- `photoUrl`
- `status`: `ACTIVE | INACTIVE`
- `compensation`
- `createdAt`
- `updatedAt`

Aturan:
- Username harus unik.
- Password wajib di-hash.
- HOST dapat memiliki `branch = null` karena aksesnya lintas cabang.
- AGENT wajib memiliki cabang aktif.
- Akun INACTIVE tidak dapat melakukan login.
- Role dan branch assignment hanya dapat diubah oleh HOST yang berwenang.

## 5.2. Branch

Menyimpan data setiap cabang barbershop.

Field:
- `_id`
- `branchCode`: unique
- `name`
- `address`
- `phone`
- `timezone`
- `status`: `ACTIVE | INACTIVE`
- `createdAt`
- `updatedAt`

Aturan:
- `branchCode` harus unik.
- HOST dapat membuat, melihat, memperbarui, dan menonaktifkan cabang.
- AGENT tidak dapat mengelola data cabang.
- Cabang yang sudah memiliki transaksi tidak boleh dihapus secara permanen melalui operasi normal.
- Cabang INACTIVE tidak dapat menerima transaksi baru.

Timezone digunakan untuk perhitungan laporan dan penentuan jam operasional.

## 5.3. Customer

Field:
- `_id`
- `customerCode`
- `name`
- `phone`
- `email`
- `gender`
- `birthDate`
- `address`
- `customerType`: `DECOY | REGULAR`
- `loyaltyPoints`
- `lastVisitAt`
- `isActive`
- `createdAt`
- `updatedAt`

Aturan:
- Nomor telepon dapat digunakan untuk pencarian pelanggan.
- Identitas pelanggan tidak boleh otomatis digandakan hanya karena format nomor telepon berbeda.
- Customer yang sudah memiliki transaksi tidak boleh dihapus secara permanen.
- `loyaltyPoints` tidak boleh dimanipulasi langsung melalui endpoint update profil pelanggan.
- Perubahan poin harus melalui mekanisme transaksi poin yang dapat diaudit.

Catatan: definisi operasional `DECOY` harus dikonfirmasi sebelum fitur klasifikasi pelanggan dirilis.

## 5.4. Service

Field:
- `_id`
- `serviceCode`
- `name`
- `description`
- `category`
- `price`
- `durationMinutes`
- `revenueSharing.ownerPercentage`
- `revenueSharing.employeePercentage`
- `isActive`
- `createdAt`
- `updatedAt`

Aturan:
- Harga tidak boleh negatif.
- Persentase pembagian hasil harus berjumlah 100%.
- Perubahan harga tidak boleh mengubah transaksi historis.
- Service yang sudah pernah digunakan tidak boleh dihapus secara permanen.
- Perubahan service hanya dapat dilakukan oleh HOST.

## 5.5. Transaction

Menyimpan seluruh catatan transaksi POS.

Field utama:
- `_id`
- `transactionCode`
- `branch`
- `agent`
- `customer`
- `service`
- `serviceSnapshot`
- `paymentMethod`
- `paymentStatus`
- `transactionStatus`
- `serviceHourType`
- `subtotal`
- `discountAmount`
- `total`
- `ownerRevenue`
- `employeeRevenue`
- `paymentReference`
- `paidAt`
- `completedAt`
- `changeHistory`
- `changeRequest`
- `receipt`
- `createdAt`
- `updatedAt`

Enum:

`paymentMethod`
- `CASH`
- `QRIS`

`paymentStatus`
- `PENDING`
- `PAID`
- `FAILED`
- `REFUNDED`
- `PARTIALLY_REFUNDED`

`transactionStatus`
- `PENDING`
- `IN_PROGRESS`
- `COMPLETED`
- `CANCELLED`

`serviceHourType`
- `REGULAR`
- `OVERTIME`

Snapshot layanan harus menyimpan harga, nama layanan, dan persentase pembagian hasil ketika transaksi dibuat.

Nilai pembayaran dan pembagian hasil harus dihitung backend, bukan diterima sebagai nilai final dari frontend.

### Transaction Invariants

- `total` tidak boleh negatif.
- `total` harus sesuai dengan subtotal dikurangi diskon dan ditambah komponen biaya lain jika kelak diperkenalkan.
- `ownerRevenue` dan `employeeRevenue` harus dihitung menggunakan snapshot pembagian hasil.
- Transaksi harus memiliki cabang, agent, service, dan referensi customer yang valid sesuai aturan bisnis.
- Status pembayaran hanya dapat berubah melalui proses pembayaran yang tervalidasi.
- Perubahan transaksi yang sudah dibayar harus melalui mekanisme koreksi yang disetujui.
- Setiap perubahan yang disetujui harus dicatat dalam audit history.

## 5.6. Inventory

Field:
- `_id`
- `itemCode`
- `branch`
- `name`
- `category`
- `unit`
- `quantity`
- `unitCost`
- `minimumStock`
- `supplier`
- `isActive`
- `createdAt`
- `updatedAt`

Aturan:
- Setiap item inventaris dimiliki satu cabang.
- AGENT hanya dapat mengelola inventaris cabangnya sendiri.
- HOST dapat mengelola inventaris semua cabang.
- Jumlah stok tidak boleh negatif.
- Nilai inventaris dihitung dari jumlah stok dikalikan biaya per unit.
- Operasi stok harus memvalidasi kondisi terbaru di database untuk mencegah lost update.
- Item yang sudah memiliki riwayat stok tidak boleh dihapus permanen.

## 5.7. Inventory Movement

Direkomendasikan untuk audit stok.

Field:
- `_id`
- `inventory`
- `branch`
- `movementType`: `IN | OUT | ADJUSTMENT`
- `quantity`
- `previousQuantity`
- `newQuantity`
- `reason`
- `performedBy`
- `createdAt`

Setiap perubahan kuantitas stok harus membuat catatan movement yang sesuai.

Perubahan stok dan pencatatan movement harus dilakukan secara atomik, misalnya menggunakan MongoDB transaction jika deployment mendukung replica set.

## 5.8. Transaction Change Request

Pengajuan perubahan transaksi dapat disimpan sebagai subdokumen pada Transaction untuk MVP.

Field:
- `status`: `NONE | PENDING | APPROVED | REJECTED`
- `requestedBy`
- `reason`
- `requestedChanges`
- `reviewedBy`
- `reviewNote`
- `requestedAt`
- `reviewedAt`

Untuk histori yang lengkap, perubahan yang sudah disetujui atau ditolak harus disimpan sebagai catatan audit permanen.

Satu transaksi hanya boleh memiliki satu pengajuan perubahan aktif pada satu waktu.

## 5.9. Payment

Data pembayaran QRIS harus menyimpan referensi gateway dan status pembayaran.

Field yang direkomendasikan:
- `_id`
- `transaction`
- `provider`: `MIDTRANS`
- `providerOrderId`
- `providerTransactionId`
- `paymentType`
- `status`
- `grossAmount`
- `currency`
- `qrCodeUrl`
- `qrString`, jika tersedia
- `expiresAt`
- `paidAt`
- `lastNotificationAt`
- `createdAt`
- `updatedAt`

Gunakan collection terpisah jika dibutuhkan histori pembayaran dan rekonsiliasi yang lebih baik.

`providerOrderId` harus unik untuk mencegah duplikasi order gateway.

## 5.10. SubscriptionPlan

Menyimpan konfigurasi plan dan harga subscription yang dapat diatur oleh `GROOMA_ADMIN` melalui dashboard admin.

Field:
- `_id`
- `code`: unik, misal `STANDARD_MONTHLY`
- `name`
- `price`: misal `50000`
- `currency`: default `IDR`
- `billingCycle`: `MONTHLY`
- `graceDays`: jumlah hari toleransi setelah jatuh tempo sebelum status menjadi `EXPIRED`
- `isActive`
- `updatedBy`: reference ke User (role `GROOMA_ADMIN`)
- `createdAt`
- `updatedAt`

Aturan:
- Hanya `GROOMA_ADMIN` yang dapat membuat atau mengubah plan.
- Perubahan `price` tidak mengubah `Subscription` yang sedang berjalan maupun `SubscriptionInvoice` yang sudah diterbitkan; harga baru hanya berlaku untuk invoice berikutnya.
- MVP hanya membutuhkan satu plan aktif, namun dimodelkan sebagai collection agar `GROOMA_ADMIN` dapat mengubah atau menambah plan tanpa migrasi schema.

## 5.11. Subscription

Menyimpan status langganan bulanan per akun HOST.

Field:
- `_id`
- `host`: reference ke User (role `HOST`), unik per HOST
- `plan`: reference ke SubscriptionPlan
- `status`: `ACTIVE | PAST_DUE | EXPIRED | CANCELLED`
- `currentPeriodStart`
- `currentPeriodEnd`
- `graceEndsAt`
- `cancelledAt`
- `createdAt`
- `updatedAt`

Aturan:
- Setiap akun HOST memiliki maksimal satu dokumen `Subscription` aktif.
- `status` hanya berubah melalui proses pembayaran invoice yang tervalidasi atau override manual oleh `GROOMA_ADMIN`.
- Keterlambatan atau tidak aktifnya subscription milik satu akun HOST tidak memengaruhi akses AGENT maupun operasional POS pada cabang manapun.
- Status selain `ACTIVE` membatasi akun HOST tersebut hanya pada endpoint billing miliknya sendiri (lihat §23.4).

## 5.12. SubscriptionInvoice

Menyimpan setiap siklus penagihan bulanan dan referensi pembayaran QRIS-nya. Dipisahkan dari `Payment` milik transaksi POS karena berbeda domain (billing platform vs penjualan barbershop).

Field:
- `_id`
- `subscription`: reference ke Subscription
- `host`: reference ke User, didenormalisasi untuk kebutuhan query
- `invoiceCode`: unik
- `periodStart`
- `periodEnd`
- `amount`
- `status`: `PENDING | PAID | EXPIRED | FAILED`
- `dueAt`
- `paidAt`
- `provider`: `MIDTRANS`
- `providerOrderId`: unik
- `qrCodeUrl`
- `qrString`, jika tersedia
- `expiresAt`
- `createdAt`
- `updatedAt`

Aturan:
- `providerOrderId` harus unik dan menggunakan prefix pembeda dari order ID transaksi POS agar notifikasi webhook tidak salah rute (lihat §9.5).
- Invoice baru hanya diterbitkan ketika periode sebelumnya berakhir dan tidak ada invoice `PENDING` lain yang aktif untuk `Subscription` yang sama.
- Status pembayaran hanya berubah melalui notifikasi Midtrans yang terverifikasi, mengikuti aturan yang sama dengan §9.

---

# 6. Authentication & Session Management

## 6.1. Login Flow

1. User mengirimkan username dan password.
2. Backend mencari akun berdasarkan username.
3. Backend memverifikasi status akun.
4. Backend membandingkan password dengan password hash.
5. Backend membuat session yang aman.
6. Backend mengembalikan informasi pengguna yang telah disanitasi.
7. Frontend mengarahkan pengguna ke dashboard berdasarkan role.

Contoh response:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "username": "agent01",
      "name": "Agent One",
      "role": "AGENT",
      "branch": {
        "id": "branch_id",
        "name": "Grooma Central"
      }
    }
  }
}
```

Password hash tidak boleh dikembalikan dalam response.

## 6.2. Session Requirements

- Gunakan session cookie dengan atribut `HttpOnly`, `Secure` pada production, dan `SameSite` yang sesuai.
- Jangan menyimpan password atau session secret dalam localStorage.
- Session harus memiliki masa berlaku dan mekanisme invalidasi.
- Logout harus menghapus atau mencabut session.
- Akun yang dinonaktifkan tidak boleh terus mendapatkan akses hanya karena session sebelumnya masih valid.
- Endpoint yang memodifikasi data harus memiliki perlindungan CSRF yang sesuai dengan mekanisme autentikasi.

## 6.3. Authorization Middleware

Setiap protected endpoint harus melewati:
1. Session validation.
2. User status validation.
3. Role authorization.
4. Branch authorization jika relevan.
5. Input validation.
6. Business rule validation.

Role dari frontend tidak pernah dianggap sebagai sumber otoritas.

## 6.4. Platform Admin Access

`GROOMA_ADMIN` login menggunakan mekanisme session yang sama dengan HOST/AGENT, namun diakses melalui namespace terpisah (frontend: `/admin`, backend: `/api/v1/admin/*`). Middleware pada namespace ini menolak seluruh role selain `GROOMA_ADMIN`. Tidak ada endpoint publik untuk mendaftarkan akun `GROOMA_ADMIN`; akun ini diprovisikan secara internal.

---

# 7. API Specification

Base path: `/api/v1`

Seluruh endpoint mengembalikan JSON.

Endpoint yang membutuhkan autentikasi harus memvalidasi session sebelum memproses operasi.

## 7.1. Authentication

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/login` | Public | Login |
| POST | `/auth/logout` | Authenticated | Logout |
| GET | `/auth/me` | Authenticated | Current user/session |
| POST | `/auth/change-password` | Authenticated | Change password |

## 7.2. Dashboard

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/dashboard/summary` | HOST, AGENT | KPI summary |
| GET | `/dashboard/revenue` | HOST, AGENT | Revenue chart |
| GET | `/dashboard/transactions` | HOST, AGENT | Transaction analytics |
| GET | `/dashboard/services` | HOST, AGENT | Service performance |
| GET | `/dashboard/agents` | HOST, AGENT | Employee performance |
| GET | `/dashboard/inventory` | HOST, AGENT | Inventory summary |

### Dashboard Filters

Parameter:
- `from`
- `to`
- `branchId`: HOST only, optional
- `groupBy`: `day | week | month`

AGENT selalu menggunakan cabang yang ditugaskan, meskipun frontend mengirim `branchId` yang berbeda.

Dashboard harus menggunakan data aktual dari database, bukan angka statis.

## 7.3. User Management

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/users` | HOST | List users |
| POST | `/users` | HOST | Create user |
| GET | `/users/:id` | HOST | User details |
| PATCH | `/users/:id` | HOST | Update user |
| PATCH | `/users/:id/status` | HOST | Activate/deactivate |
| GET | `/profile` | HOST, AGENT | Own profile |
| PATCH | `/profile` | HOST, AGENT | Update own profile |

HOST dapat membuat akun AGENT dan HOST sesuai kebijakan administrasi.

Pembuatan akun tidak boleh mengekspos password hash.

## 7.4. Branch Management

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/branches` | HOST, AGENT | List accessible branches |
| POST | `/branches` | HOST | Create branch |
| GET | `/branches/:id` | HOST, assigned AGENT | Branch detail |
| PATCH | `/branches/:id` | HOST | Update branch |
| PATCH | `/branches/:id/status` | HOST | Activate/deactivate |

AGENT hanya boleh melihat informasi cabangnya sendiri.

## 7.5. Customer Management

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/customers` | HOST, AGENT | Search/list customers |
| POST | `/customers` | HOST, AGENT | Create customer |
| GET | `/customers/:id` | HOST, AGENT | Customer detail |
| PATCH | `/customers/:id` | HOST, AGENT | Update customer |
| PATCH | `/customers/:id/status` | HOST | Activate/deactivate |

Untuk MVP, AGENT boleh membuat pelanggan ketika transaksi baru dibuat membutuhkan pelanggan yang belum terdaftar.

Akses AGENT ke customer harus dibatasi berdasarkan kebutuhan operasional dan kebijakan privasi. Backend tidak boleh mengembalikan data pribadi pelanggan yang tidak diperlukan.

## 7.6. Service Management

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/services` | HOST, AGENT | List active services |
| POST | `/services` | HOST | Create service |
| GET | `/services/:id` | HOST, AGENT | Service details |
| PATCH | `/services/:id` | HOST | Update service |
| PATCH | `/services/:id/status` | HOST | Activate/deactivate |

AGENT hanya dapat memilih service yang aktif saat membuat transaksi.

## 7.7. Transaction Management

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/transactions` | HOST, AGENT | List accessible transactions |
| POST | `/transactions` | AGENT | Create transaction |
| GET | `/transactions/:id` | HOST, assigned branch AGENT | Transaction detail |
| POST | `/transactions/:id/complete` | AGENT | Complete service |
| POST | `/transactions/:id/cancel` | HOST, AGENT under policy | Cancel transaction |
| GET | `/transactions/:id/receipt` | HOST, assigned branch AGENT | Receipt data |

List transactions harus mendukung:
- Pagination.
- Search berdasarkan kode transaksi.
- Filter status pembayaran.
- Filter status transaksi.
- Filter tanggal.
- Filter cabang untuk HOST.
- Filter agent untuk HOST.

Gunakan pagination berbasis cursor jika volume transaksi sudah besar.

## 7.8. Payment Management

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/payments/qris` | AGENT | Create QRIS payment |
| GET | `/payments/:id` | Authorized transaction access | Payment status |
| POST | `/payments/midtrans/notification` | Public gateway webhook | Receive payment notification |

Webhook adalah endpoint publik yang hanya menerima perubahan status setelah notifikasi gateway diverifikasi.

Jangan memperlakukan request frontend sebagai bukti pembayaran berhasil.

## 7.9. Transaction Change Approval

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/transactions/:id/change-requests` | HOST, AGENT | Submit change request |
| GET | `/transaction-change-requests` | HOST | List pending requests |
| GET | `/transaction-change-requests/:id` | HOST, request owner if authorized | Request detail |
| POST | `/transaction-change-requests/:id/approve` | HOST | Approve request |
| POST | `/transaction-change-requests/:id/reject` | HOST | Reject request |

Pengajuan perubahan harus memiliki alasan dan perubahan yang diminta.

Request tidak boleh langsung mengubah transaksi sebelum disetujui.

## 7.10. Inventory Management

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/inventory` | HOST, AGENT | List accessible inventory |
| POST | `/inventory` | HOST, AGENT | Create item |
| GET | `/inventory/:id` | HOST, assigned branch AGENT | Item detail |
| PATCH | `/inventory/:id` | HOST, assigned branch AGENT | Update item |
| DELETE | `/inventory/:id` | HOST, assigned branch AGENT | Soft-delete item |
| POST | `/inventory/:id/stock-movements` | HOST, assigned branch AGENT | Adjust stock |
| GET | `/inventory/:id/stock-movements` | HOST, assigned branch AGENT | Stock history |

Untuk HOST, `branchId` dapat digunakan sebagai filter.

Untuk AGENT, `branchId` tidak boleh digunakan untuk mengakses cabang lain.

## 7.11. Subscription & Billing (Platform)

Untuk HOST (akses hanya ke subscription miliknya sendiri):

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/subscription` | HOST (own) | Status subscription saat ini |
| GET | `/subscription/invoices` | HOST (own) | Riwayat invoice |
| GET | `/subscription/invoices/:id` | HOST (own) | Detail invoice + QRIS |

Untuk `GROOMA_ADMIN` (namespace `/admin`, lihat §6.4):

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/admin/subscription-plans` | GROOMA_ADMIN | List plan |
| POST | `/admin/subscription-plans` | GROOMA_ADMIN | Buat plan baru |
| PATCH | `/admin/subscription-plans/:id` | GROOMA_ADMIN | Ubah harga/status plan |
| GET | `/admin/subscriptions` | GROOMA_ADMIN | List subscription seluruh HOST, filter status |
| GET | `/admin/subscriptions/:id` | GROOMA_ADMIN | Detail subscription |
| PATCH | `/admin/subscriptions/:id/status` | GROOMA_ADMIN | Override manual status |
| GET | `/admin/subscriptions/:id/invoices` | GROOMA_ADMIN | Riwayat invoice milik satu HOST |

Sistem (dipicu scheduled job, bukan role user biasa — autentikasi pakai secret terpisah):

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/internal/subscriptions/run-billing-cycle` | Scheduled job secret | Terbitkan invoice + QRIS untuk subscription yang periodenya berakhir |

AGENT tidak memiliki akses ke endpoint manapun pada bagian ini. Detail siklus dan aturan akses selengkapnya ada di §23.

---

# 8. Transaction Creation Flow

## 8.1. Preconditions

Sebelum transaksi dibuat:
- User sudah login.
- User memiliki role AGENT.
- User memiliki cabang aktif.
- Cabang berstatus ACTIVE.
- Customer tersedia dan aktif.
- Service tersedia dan aktif.
- Harga service valid.
- Aturan pembagian hasil valid.

## 8.2. Process

1. AGENT memilih customer.
2. AGENT memilih service.
3. Frontend mengirimkan request pembuatan transaksi.
4. Backend mengambil data customer, service, user, dan branch dari database.
5. Backend memvalidasi seluruh referensi.
6. Backend menghitung subtotal, diskon, total, dan pembagian hasil.
7. Backend menyimpan snapshot service dan aturan pembagian hasil.
8. Backend menghasilkan kode transaksi unik.
9. Backend membuat transaksi dengan status yang sesuai.
10. Untuk metode QRIS, backend membuat payment order di Midtrans.
11. Backend menyimpan referensi payment gateway.
12. Backend mengembalikan informasi transaksi dan QRIS kepada frontend.

## 8.3. Request Example

```json
{
  "customerId": "customer_object_id",
  "serviceId": "service_object_id",
  "paymentMethod": "QRIS",
  "discountAmount": 0,
  "serviceHourType": "REGULAR"
}
```

Backend tidak menerima nilai final berikut sebagai sumber kebenaran:
- `agentId`
- `branchId`
- `total`
- `ownerRevenue`
- `employeeRevenue`
- `serviceSnapshot`

Identitas agent dan branch berasal dari session dan data user. Harga dan pembagian hasil berasal dari database.

## 8.4. QRIS Payment Response

```json
{
  "success": true,
  "data": {
    "transactionCode": "GRM-20261013-000001",
    "paymentMethod": "QRIS",
    "paymentStatus": "PENDING",
    "total": 50000,
    "payment": {
      "provider": "MIDTRANS",
      "status": "PENDING",
      "qrCodeUrl": "https://example.invalid/qris-placeholder",
      "expiresAt": null
    }
  }
}
```

Response di atas hanya contoh struktur. URL QRIS harus berasal dari respons Midtrans yang telah diproses dan divalidasi backend.

---

# 9. Midtrans Integration

## 9.1. Payment Creation

Backend menggunakan kredensial server-side Midtrans untuk membuat pembayaran QRIS.

Kredensial tidak boleh dikirim ke frontend.

Setiap transaksi memiliki `transactionCode` unik yang digunakan sebagai referensi order.

Backend harus:
1. Membuat payment order.
2. Menyimpan order reference.
3. Menyimpan nilai pembayaran.
4. Menyimpan data QRIS yang diperlukan frontend.
5. Mengembalikan status awal pembayaran.
6. Memproses callback pembayaran secara aman.

## 9.2. Payment Notification

Ketika Midtrans mengirimkan notifikasi:

1. Backend menerima notifikasi.
2. Backend memvalidasi notifikasi melalui mekanisme resmi Midtrans.
3. Backend mencocokkan order ID dan transaksi internal.
4. Backend memverifikasi nilai pembayaran dan status.
5. Backend memeriksa apakah notifikasi sudah diproses.
6. Backend melakukan transisi status secara idempoten.
7. Backend mencatat timestamp pembayaran.
8. Backend memperbarui status transaksi jika kondisi bisnis terpenuhi.

## 9.3. Payment Security

- Verifikasi signature atau status melalui mekanisme resmi Midtrans.
- Jangan mengandalkan redirect browser sebagai bukti pembayaran.
- Validasi nominal dan order ID.
- Tangani notifikasi duplikat.
- Tolak transisi status yang tidak valid.
- Simpan credential di environment variables.
- Jangan mencatat secret atau informasi sensitif dalam log.

## 9.4. Payment State Rules

Status awal:
- `PENDING`

Transisi yang diizinkan bergantung pada status yang diverifikasi dari Midtrans.

Contoh:
- `PENDING → PAID`
- `PENDING → FAILED`
- `PENDING → EXPIRED` jika status internal tersebut ditambahkan
- `PAID → REFUNDED` hanya melalui proses refund yang sah

Status `EXPIRED` sebaiknya ditambahkan pada model pembayaran agar QRIS yang kedaluwarsa dapat dibedakan dari pembayaran gagal.

Pembayaran yang sudah sukses tidak boleh dikembalikan ke PENDING hanya karena notifikasi lama datang terlambat.

## 9.5. Reuse untuk Subscription Invoice

`SubscriptionInvoice` (§5.12) menggunakan integrasi Midtrans QRIS yang sama dengan pembayaran transaksi POS (§9.1–§9.4). Agar notifikasi webhook tidak salah rute antara order transaksi POS dan order subscription, `providerOrderId` milik `SubscriptionInvoice` wajib memakai prefix pembeda, misalnya `GRM-SUB-YYYYMM-XXXXXX`, berbeda dari format `transactionCode` POS (`GRM-YYYYMMDD-XXXXXX`, §8.4).

`POST /payments/midtrans/notification` harus menentukan domain target (`Payment` transaksi atau `SubscriptionInvoice`) berdasarkan prefix tersebut sebelum menerapkan logika idempotensi dan transisi status yang sama seperti §9.2–§9.4.

---

# 10. Transaction Change Approval Workflow

## 10.1. Request Process

1. Pengguna membuka transaksi.
2. Pengguna memilih perubahan yang diinginkan.
3. Pengguna memasukkan alasan.
4. Backend memvalidasi perubahan yang diperbolehkan.
5. Backend menyimpan pengajuan dengan status PENDING.
6. Transaksi tidak langsung berubah.
7. HOST melihat daftar pengajuan.
8. HOST menyetujui atau menolak pengajuan.
9. Backend memvalidasi ulang transaksi dan request.
10. Jika disetujui, backend menerapkan perubahan dan mencatat audit history.
11. Jika ditolak, transaksi tetap tidak berubah dan alasan penolakan dicatat.

## 10.2. Rules

- Pengajuan harus memiliki alasan.
- Hanya satu pengajuan aktif per transaksi.
- Request tidak boleh disetujui dua kali.
- Request yang sudah ditolak tidak boleh diproses ulang.
- Requester tidak boleh menyetujui request miliknya sendiri.
- Perubahan terhadap transaksi yang sudah dibayar harus memiliki aturan koreksi finansial yang jelas.
- Koreksi nominal pembayaran tidak otomatis mengubah status pembayaran Midtrans.
- Setiap keputusan approval harus mencatat actor dan timestamp.

## 10.3. Audit History

Setiap perubahan yang berhasil diterapkan harus menyimpan:
- `changedBy`
- `reason`
- `before`
- `after`
- `changedAt`
- `approvedBy`
- `approvalReference`

Riwayat audit bersifat append-only melalui API normal. Pengguna tidak dapat menghapus atau mengubah catatan audit lama.

---

# 11. Inventory Management Flow

## 11.1. Agent Flow

1. AGENT login.
2. Backend membaca branch assignment dari session dan user.
3. AGENT melihat inventaris cabangnya.
4. AGENT membuat atau memperbarui data inventaris.
5. Backend memastikan item berada pada cabang yang sesuai.
6. Backend mencatat perubahan stok.
7. Dashboard inventaris diperbarui.

## 11.2. Host Flow

1. HOST login.
2. HOST melihat inventaris lintas cabang.
3. HOST memfilter inventaris berdasarkan cabang.
4. HOST membuat atau memperbarui item pada cabang yang dipilih.
5. Backend memvalidasi cabang tujuan.
6. Perubahan stok dicatat dalam inventory movement.

## 11.3. Inventory Rules

- Stok tidak boleh negatif.
- Penghapusan item menggunakan soft delete.
- Perubahan jumlah stok harus dapat ditelusuri.
- Update stok harus menghindari lost update.
- Item yang berada pada cabang lain tidak boleh diakses AGENT.
- Perubahan inventaris tidak otomatis mengubah histori transaksi.

---

# 12. Dashboard & Analytics

Dashboard menggunakan aggregation pipeline untuk menghasilkan statistik dari transaksi, service, user, branch, dan inventory.

## 12.1. KPI Summary

KPI yang ditampilkan:
- Total transaksi.
- Total transaksi berhasil dibayar.
- Total omzet dari transaksi yang dibayar.
- Rata-rata nilai transaksi.
- Jumlah pelanggan.
- Layanan terpopuler.
- Performa agent.
- Inventaris dengan stok rendah.
- Transaksi menunggu pembayaran.
- Pengajuan perubahan yang menunggu approval, untuk HOST.

## 12.2. Revenue Analytics

Grafik:
- Omzet per hari.
- Omzet per minggu.
- Omzet per bulan.
- Perbandingan antarperiode.
- Distribusi metode pembayaran.
- Distribusi pendapatan owner dan agent.

## 12.3. Agent Performance

Untuk HOST:
- Jumlah transaksi per agent.
- Total omzet transaksi yang ditangani.
- Total bagian pendapatan agent.
- Jumlah pelanggan yang dilayani.
- Tren performa.

Untuk AGENT:
- Performa milik sendiri pada cabangnya.

## 12.4. Analytics Rules

- Transaksi CANCELLED tidak dihitung sebagai omzet.
- Pembayaran PENDING tidak dihitung sebagai omzet yang sudah diterima.
- Refund harus diperlakukan secara konsisten dalam laporan.
- Pendapatan owner tidak sama dengan laba bersih.
- Dashboard harus mendukung filter tanggal.
- Filter cabang wajib mengikuti otorisasi.
- Semua metrik harus memiliki definisi yang konsisten.

---

# 13. Profile Management

Pengguna dapat:
- Melihat profil.
- Memperbarui nama.
- Memperbarui nomor telepon.
- Memperbarui alamat.
- Memperbarui foto profil.
- Mengganti password.

Pengguna tidak dapat mengubah role atau branch assignment melalui endpoint profil.

Perubahan role dan cabang hanya dapat dilakukan melalui User Management oleh HOST yang berwenang.

Password lama harus diverifikasi ketika pengguna mengganti password sendiri.

---

# 14. Error Handling

Backend menggunakan format response konsisten.

Contoh:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this resource."
  }
}
```

HTTP status yang digunakan:

| Status | Use Case |
|---|---|
| 200 | Successful request |
| 201 | Resource created |
| 400 | Invalid input |
| 401 | Unauthenticated |
| 403 | Unauthorized action |
| 404 | Resource not found |
| 409 | Conflict or invalid state transition |
| 422 | Business validation failure |
| 429 | Rate limit exceeded |
| 500 | Unexpected server error |
| 502 | Payment gateway communication failure |

Jangan mengembalikan stack trace, database error mentah, atau informasi sensitif kepada client.

---

# 15. Security Requirements

1. Password wajib disimpan dalam bentuk hash.
2. Gunakan autentikasi berbasis session yang aman.
3. Terapkan authorization pada seluruh endpoint.
4. Terapkan branch-level data isolation.
5. Validasi seluruh input dengan schema validation.
6. Jangan mempercayai nilai finansial dari frontend.
7. Verifikasi callback Midtrans.
8. Terapkan rate limiting pada login dan endpoint sensitif.
9. Lindungi endpoint mutasi dari CSRF sesuai mekanisme session.
10. Jangan mengembalikan password hash.
11. Simpan credential melalui environment variables.
12. Terapkan audit log pada operasi sensitif.
13. Gunakan soft delete untuk data yang mempunyai histori operasional.
14. Batasi akses data pribadi pelanggan.
15. Gunakan idempotency pada pembayaran dan operasi yang berpotensi diproses berulang.

---

# 16. Non-Functional Requirements

## Performance
- Gunakan pagination untuk daftar transaksi dan inventaris.
- Gunakan index pada field pencarian dan filter utama.
- Hindari query N+1 pada relasi.
- Optimalkan aggregation pipeline untuk dashboard.
- Gunakan cache hanya jika konsistensi data tetap terjaga.

## Reliability
- Payment webhook harus idempoten.
- Kode transaksi harus unik.
- Operasi finansial harus konsisten.
- Perubahan stok harus dapat diaudit.
- Kegagalan gateway tidak boleh menyebabkan status pembayaran palsu.

## Maintainability
- Pisahkan route handler, service, model, validation, dan authorization.
- Gunakan TypeScript.
- Gunakan reusable validation schemas.
- Gunakan central error handler.
- Gunakan automated tests untuk business rules.

## Scalability
- Arsitektur awal menggunakan modular monolith.
- Database mendukung banyak cabang.
- Semua query operasional harus mendukung branch scoping.
- Analytics dapat dioptimalkan tanpa harus mengubah domain transaksi.

---

# 17. Suggested Project Structure

```text
src/
├── app/
│   └── api/
│       └── v1/
│           ├── auth/
│           ├── dashboard/
│           ├── users/
│           ├── branches/
│           ├── customers/
│           ├── services/
│           ├── transactions/
│           ├── payments/
│           ├── transaction-change-requests/
│           ├── inventory/
│           └── profile/
│
├── lib/
│   ├── mongodb.ts
│   ├── auth.ts
│   ├── midtrans.ts
│   └── logger.ts
│
├── models/
│   ├── User.ts
│   ├── Branch.ts
│   ├── Customer.ts
│   ├── Service.ts
│   ├── Transaction.ts
│   ├── Payment.ts
│   ├── Inventory.ts
│   └── InventoryMovement.ts
│
├── services/
│   ├── auth.service.ts
│   ├── dashboard.service.ts
│   ├── transaction.service.ts
│   ├── payment.service.ts
│   ├── inventory.service.ts
│   ├── approval.service.ts
│   └── branch.service.ts
│
├── validations/
│   ├── auth.schema.ts
│   ├── transaction.schema.ts
│   ├── inventory.schema.ts
│   └── user.schema.ts
│
├── lib/
│   └── ...
│
└── types/
    └── ...
```

Struktur ini merupakan rekomendasi awal. Hindari membuat abstraksi berlebihan sebelum kompleksitas aplikasi membutuhkannya.

---

# 18. Testing Requirements

## Authentication
- Login dengan kredensial benar berhasil.
- Password salah ditolak.
- Akun nonaktif tidak dapat login.
- Logout menginvalidasi session.
- Password hash tidak pernah dikirim dalam response.

## Authorization
- AGENT tidak dapat mengelola cabang.
- AGENT tidak dapat mengakses inventaris cabang lain.
- AGENT tidak dapat menyetujui pengajuan perubahan.
- HOST tidak dapat membuat transaksi.
- HOST dapat melihat transaksi lintas cabang.
- Manipulasi `branchId` dari client tidak melewati otorisasi.

## Transactions
- Transaksi menggunakan harga service dari database.
- Snapshot pembagian hasil tersimpan.
- Kode transaksi unik.
- Transaksi tidak dapat dibuat menggunakan service nonaktif.
- Nilai finansial tidak dapat dimanipulasi dari frontend.
- Transaksi CANCELLED tidak masuk omzet.

## Midtrans
- QRIS berhasil dibuat ketika gateway merespons sukses.
- Kegagalan gateway ditangani dengan benar.
- Webhook valid memperbarui status pembayaran.
- Webhook tidak valid ditolak.
- Webhook duplikat tidak menggandakan efek transaksi.
- Notifikasi lama tidak menurunkan status pembayaran yang sudah final.

## Approval
- Pengajuan perubahan tersimpan.
- Pengajuan PENDING belum mengubah transaksi.
- HOST dapat menyetujui pengajuan yang valid.
- HOST dapat menolak pengajuan dengan alasan.
- Pengajuan tidak dapat diproses dua kali.
- Perubahan tercatat dalam audit history.

## Inventory
- AGENT hanya dapat mengelola cabangnya.
- HOST dapat mengelola seluruh cabang.
- Stok tidak dapat menjadi negatif.
- Stock movement tercatat.
- Update stok bersamaan tidak menyebabkan lost update.

## Dashboard
- KPI sesuai data transaksi.
- Filter tanggal bekerja.
- Filter cabang mengikuti role.
- Pembayaran pending tidak dihitung sebagai omzet yang sudah diterima.
- Refund diperhitungkan secara konsisten.

---

# 19. MVP Scope & Development Phases

## Phase 1 — Foundation
- MongoDB connection.
- Mongoose models.
- Authentication.
- Session management.
- Role authorization.
- Branch authorization.
- Error handling.

## Phase 2 — Master Data
- User management.
- Branch management.
- Customer management.
- Service management.

## Phase 3 — POS & Payments
- Transaction creation.
- Transaction history.
- QRIS integration.
- Midtrans notification handling.
- Transaction status management.
- Receipt data.

## Phase 4 — Inventory
- Inventory CRUD.
- Branch-level inventory isolation.
- Stock movements.
- Low-stock summary.

## Phase 5 — Approval
- Transaction change request.
- HOST approval and rejection.
- Audit history.
- Financial correction rules.

## Phase 6 — Dashboard
- KPI summary.
- Revenue analytics.
- Service analytics.
- Agent performance.
- Inventory analytics.

## Phase 7 — Hardening
- Automated tests.
- Security testing.
- Payment reconciliation.
- Performance optimization.
- Production deployment checks.

## Phase 8 — Subscription & Billing (Platform)
- `SubscriptionPlan`, `Subscription`, `SubscriptionInvoice` models.
- Role `GROOMA_ADMIN` dan namespace `/api/v1/admin` beserta middleware-nya.
- Reuse integrasi Midtrans QRIS untuk invoice subscription.
- Scheduled job siklus billing (generate invoice, grace period, auto-expire).
- Middleware pembatasan akses HOST ketika subscription tidak aktif.
- Endpoint admin untuk konfigurasi plan dan override status subscription.

---

# 20. Out of Scope for MVP

Fitur berikut tidak termasuk implementasi awal:

- Fingerprint attendance.
- Attendance management.
- Payroll automation.
- Customer booking and appointment scheduling.
- Loyalty point redemption.
- Automatic stock deduction based on service consumption.
- Multi-provider payment gateway.
- Advanced accounting.
- Offline POS synchronization.
- Fitur lanjutan subscription: proration, multi-tier plan, auto-recurring charge (tokenisasi kartu), refund otomatis, faktur pajak, reminder otomatis sebelum jatuh tempo — lihat §23.6.

Fitur tersebut dapat dimasukkan ke roadmap setelah proses transaksi, pembayaran, dan otorisasi stabil.

---

# 21. Definition of Done

Backend Grooma dianggap memenuhi kriteria MVP apabila:

1. HOST dan AGENT dapat login menggunakan session yang aman.
2. Sistem menerapkan role-based dan branch-based authorization.
3. HOST dapat mengelola cabang dan master data.
4. AGENT dapat membuat transaksi pada cabangnya.
5. HOST tidak dapat membuat transaksi baru.
6. Transaksi menyimpan snapshot harga dan pembagian hasil.
7. Pembayaran QRIS terintegrasi dengan Midtrans.
8. Status pembayaran hanya berubah melalui proses yang tervalidasi.
9. AGENT dapat mengajukan perubahan transaksi.
10. HOST dapat menyetujui atau menolak pengajuan.
11. Inventaris terisolasi berdasarkan cabang.
12. Dashboard menampilkan metrik yang dihitung dari data aktual.
13. Seluruh operasi sensitif memiliki validasi dan audit yang memadai.
14. Automated tests mencakup authorization, transaksi, pembayaran, approval, dan inventaris.
15. Dokumentasi API dan konfigurasi environment tersedia.
16. HOST membayar subscription bulanan sesuai plan aktif melalui QRIS, dan status subscription-nya tidak memengaruhi akses AGENT atau operasional POS pada cabang manapun.
17. `GROOMA_ADMIN` dapat mengatur harga plan dan memantau/override status subscription seluruh akun HOST melalui namespace admin yang terisolasi dari role lain.

---

# 22. Final Architecture Decision

Grooma menggunakan Next.js App Router, TypeScript, MongoDB, dan Mongoose dengan arsitektur modular monolith.

Pembagian akses menggunakan dua role operasional utama, yaitu HOST dan AGENT, ditambah branch-based authorization untuk menjaga isolasi data operasional. Role ketiga, `GROOMA_ADMIN`, berada di layer platform/vendor dan terisolasi penuh dari operasional barbershop — digunakan khusus untuk mengelola monetisasi subscription (§23).

Transaksi menjadi sumber utama laporan omzet, sementara pembayaran QRIS diproses melalui Midtrans dan diverifikasi melalui notifikasi gateway.

Perubahan transaksi menggunakan approval workflow, dan perubahan inventaris harus tercatat agar stok dapat diaudit.

Implementasi MVP harus memprioritaskan keamanan, konsistensi data, dan validitas transaksi sebelum mengembangkan fitur analytics yang lebih kompleks. Monetisasi melalui subscription HOST dibangun sebagai modul platform yang terpisah agar tidak menambah kompleksitas pada domain transaksi POS.

**Grooma Backend MVP: Secure Authentication + Branch-Aware POS + QRIS Payments + Transaction Approval + Inventory Management + Operational Analytics + Platform Subscription Billing.**

---

# 23. Subscription & Billing Workflow (Addendum)

Section ini ditambahkan di v1.1 untuk mendefinisikan monetisasi platform: HOST membayar subscription bulanan untuk menggunakan Grooma, dikelola oleh role internal `GROOMA_ADMIN`. Lihat juga §1.3, §3.1, §3.4, §5.10–§5.12, §6.4, §7.11, §9.5.

## 23.1. Model Bisnis

- Billing bersifat **per akun HOST** (seat-based), bukan per bisnis/tenant — satu deployment Grooma tetap melayani satu bisnis barbershop (sesuai §3.3), dan setiap akun HOST yang dibuat membayar subscription-nya sendiri-sendiri.
- Biaya saat ini **Rp50.000/bulan** per akun HOST, disimpan sebagai data (`SubscriptionPlan.price`), bukan nilai hardcoded, agar dapat diubah `GROOMA_ADMIN` dari dashboard admin tanpa deploy ulang.
- Subscription tidak memengaruhi operasional POS: AGENT dan transaksi cabang tetap berjalan normal terlepas dari status subscription HOST manapun.

## 23.2. Billing Cycle

- Siklus bulanan, anchor ke tanggal subscription pertama kali aktif per akun HOST (bukan tanggal kalender tetap untuk semua akun), sehingga tidak dibutuhkan logika proration di MVP.
- `currentPeriodEnd` = `currentPeriodStart` + 1 bulan.
- Invoice baru diterbitkan otomatis oleh scheduled job saat `currentPeriodEnd` tercapai, selama tidak ada invoice `PENDING` lain yang masih aktif untuk `Subscription` yang sama.

## 23.3. Invoice Lifecycle

1. Scheduled job (cron) mendeteksi `Subscription` yang periodenya berakhir.
2. Backend membuat `SubscriptionInvoice` baru menggunakan `amount` dari `SubscriptionPlan` yang aktif saat itu, menghitung `dueAt` (`periodEnd + graceDays`), lalu membuat payment order QRIS via Midtrans (§9.5).
3. HOST membuka halaman billing pada dashboard-nya, memindai QRIS, dan membayar.
4. Midtrans mengirim notifikasi ke `POST /payments/midtrans/notification`.
5. Backend mencocokkan `providerOrderId` berdasarkan prefix subscription, menemukan `SubscriptionInvoice` yang sesuai, memverifikasi notifikasi, lalu menetapkan `status: PAID` dan `paidAt`.
6. Backend memperbarui `Subscription.status = ACTIVE` dan menggeser `currentPeriodStart`/`currentPeriodEnd` ke periode berikutnya.
7. Jika `dueAt` terlewati tanpa pembayaran, `Subscription.status` menjadi `PAST_DUE`; jika `graceEndsAt` juga terlewati, scheduled job menandai invoice `EXPIRED` dan `Subscription.status = EXPIRED`.

## 23.4. Access Control saat Subscription Tidak Aktif

- Ketika `Subscription.status` bernilai `PAST_DUE` atau `EXPIRED`, akun HOST yang bersangkutan hanya dapat mengakses endpoint `/subscription*` dan `/profile`; seluruh endpoint lain pada §7.2–§7.10 mengembalikan error otorisasi.
- Pembatasan ini **hanya berlaku untuk akun HOST yang bersangkutan**. AGENT pada cabang manapun tetap dapat login dan membuat transaksi seperti biasa — subscription adalah biaya lisensi akun admin, bukan syarat operasional POS cabang (§23.1).
- `GROOMA_ADMIN` dapat melakukan override manual (`PATCH /admin/subscriptions/:id/status`) untuk kasus dukungan pelanggan, misalnya pembayaran manual di luar sistem atau dispute.
- Gunakan HTTP `402 Payment Required` ketika permintaan ditolak murni karena subscription tidak aktif, sebagai tambahan terhadap tabel status pada §14.

## 23.5. Security & Idempotency

Mengikuti aturan yang sama dengan §9.3, ditambah:
- Endpoint scheduled job yang menerbitkan invoice otomatis harus diautentikasi dengan secret terpisah (bukan session user) dan tidak boleh dapat dipicu publik.
- Perubahan `SubscriptionPlan.price` dicatat dengan `updatedBy` untuk kebutuhan audit (§15).
- Webhook Midtrans untuk subscription mengikuti idempotency dan verifikasi signature yang sama seperti pembayaran transaksi POS (§9.2–§9.3), tidak ada jalur pintas.

## 23.6. Out of Scope untuk MVP Subscription

- Proration saat HOST baru aktif di tengah bulan.
- Multiple plan tier, diskon, atau kode voucher.
- Auto-recurring charge (tokenisasi kartu).
- Refund otomatis subscription.
- Faktur pajak/invoice resmi.
- Notifikasi reminder otomatis (email/WhatsApp) sebelum jatuh tempo.
