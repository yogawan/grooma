# Ringkasan Role — Grooma

## HOST
*Pengelola bisnis, akses lintas cabang.*
- Kelola cabang & akun pegawai (users) — AGENT tidak punya akses ini sama sekali
- Kontrol penuh layanan & customer: create/edit/nonaktifkan (AGENT cuma sebagian, lihat bawah)
- Lihat transaksi & inventaris di **semua cabang**
- Approve/reject pengajuan perubahan transaksi (tidak boleh approve pengajuannya sendiri)
- Lihat & bayar subscription + invoice miliknya sendiri (QRIS)
- **Tidak bisa** membuat transaksi baru
- Transaksi QRIS cabangnya diproses lewat Midtrans Grooma (mode `MANAGED`, default) atau cukup dicatat karena HOST pakai QRIS sendiri (mode `SELF_RECORDED`) — mode ini ditentukan GROOMA_ADMIN, bukan HOST sendiri (PRD §9.6)
- Cabang yang dibuat HOST otomatis tercatat `host`-nya ke akun itu — tapi ini **cuma** buat nentuin mode pembayaran, bukan pembatasan akses: HOST tetap bisa lihat & kelola cabang milik HOST lain (PRD §3.3)

## AGENT
*Pegawai operasional, akses satu cabang (sesuai penugasan).*
- Catat transaksi baru & proses pembayaran QRIS (lewat Midtrans kalau HOST-nya mode `MANAGED`; langsung tercatat `PAID` kalau HOST-nya mode `SELF_RECORDED` — lihat catatan HOST di atas)
- Lihat daftar & detail layanan (read-only — tidak bisa create/edit/nonaktifkan)
- Lihat, tambah, dan update data customer (tidak bisa ubah status aktif/nonaktif customer)
- CRUD inventaris di cabangnya sendiri
- Ajukan perubahan transaksi (tidak bisa approve/reject)
- Lihat dashboard & profil cabangnya
- Login tidak pernah terblokir oleh status subscription HOST

## GROOMA_ADMIN
*Admin internal platform (vendor), tanpa cabang, di luar operasional POS.*
- Kelola konfigurasi `SubscriptionPlan` (harga, aktif/nonaktif)
- Lihat semua `Subscription` & `Invoice` milik seluruh akun HOST
- Override manual status subscription (mis. setelah verifikasi pembayaran manual)
- Menentukan `paymentIntegrationMode` tiap akun HOST — `MANAGED` (QRIS diproses Midtrans Grooma) atau `SELF_RECORDED` (HOST pakai QRIS sendiri, Grooma cuma mencatat), lewat `PATCH /admin/hosts/{id}/payment-integration-mode` (PRD §9.6)
- Akses lewat namespace API terpisah `/api/v1/admin/*`
- **Tidak bisa** akses data operasional (customer/transaksi/inventaris), kecuali untuk audit billing
- Akun tidak bisa dibuat lewat endpoint publik — provisioning internal saja

---

## Daftar Endpoint

> Beberapa baris (profile, dashboard/*, `branches` GET, `subscription/*`, `transaction-change-requests/{id}`) tidak dijaga pakai `requireRole` eksplisit — pembatasannya ada di logic service (scoping by branch/ownId), bukan allowlist role. Kolom Roles di bawah merefleksikan behavior efektifnya, bukan cuma yang ketulis di kode gate.

### Auth
| Method | Endpoint | Roles |
|---|---|---|
| POST | `/api/v1/auth/login` | Public |
| POST | `/api/v1/auth/logout` | Any (sesi valid) |
| GET | `/api/v1/auth/me` | HOST, AGENT, GROOMA_ADMIN |
| POST | `/api/v1/auth/change-password` | HOST, AGENT, GROOMA_ADMIN |

### Profile
| Method | Endpoint | Roles |
|---|---|---|
| GET | `/api/v1/profile` | HOST, AGENT, GROOMA_ADMIN (milik sendiri) |
| PATCH | `/api/v1/profile` | HOST, AGENT, GROOMA_ADMIN (milik sendiri) |

### Users (pegawai)
| Method | Endpoint | Roles |
|---|---|---|
| GET | `/api/v1/users` | HOST |
| POST | `/api/v1/users` | HOST |
| GET | `/api/v1/users/{id}` | HOST |
| PATCH | `/api/v1/users/{id}` | HOST |
| PATCH | `/api/v1/users/{id}/status` | HOST |

### Branches
| Method | Endpoint | Roles |
|---|---|---|
| GET | `/api/v1/branches` | HOST, AGENT |
| POST | `/api/v1/branches` | HOST |
| GET | `/api/v1/branches/{id}` | HOST, AGENT |
| PATCH | `/api/v1/branches/{id}` | HOST |
| PATCH | `/api/v1/branches/{id}/status` | HOST |

### Customers
| Method | Endpoint | Roles |
|---|---|---|
| GET | `/api/v1/customers` | HOST, AGENT |
| POST | `/api/v1/customers` | HOST, AGENT |
| GET | `/api/v1/customers/{id}` | HOST, AGENT |
| PATCH | `/api/v1/customers/{id}` | HOST, AGENT |
| PATCH | `/api/v1/customers/{id}/status` | HOST |

### Services
| Method | Endpoint | Roles |
|---|---|---|
| GET | `/api/v1/services` | HOST, AGENT |
| POST | `/api/v1/services` | HOST |
| GET | `/api/v1/services/{id}` | HOST, AGENT |
| PATCH | `/api/v1/services/{id}` | HOST |
| PATCH | `/api/v1/services/{id}/status` | HOST |

### Transactions & Change Requests
| Method | Endpoint | Roles |
|---|---|---|
| GET | `/api/v1/transactions` | HOST, AGENT |
| POST | `/api/v1/transactions` | AGENT |
| GET | `/api/v1/transactions/{id}` | HOST, AGENT |
| POST | `/api/v1/transactions/{id}/complete` | AGENT |
| POST | `/api/v1/transactions/{id}/cancel` | HOST, AGENT |
| GET | `/api/v1/transactions/{id}/receipt` | HOST, AGENT |
| POST | `/api/v1/transactions/{id}/change-requests` | HOST, AGENT |
| GET | `/api/v1/transaction-change-requests` | HOST |
| GET | `/api/v1/transaction-change-requests/{id}` | HOST, AGENT (pengaju sendiri) |
| POST | `/api/v1/transaction-change-requests/{id}/approve` | HOST |
| POST | `/api/v1/transaction-change-requests/{id}/reject` | HOST |

### Inventory
| Method | Endpoint | Roles |
|---|---|---|
| GET | `/api/v1/inventory` | HOST, AGENT |
| POST | `/api/v1/inventory` | HOST, AGENT |
| GET | `/api/v1/inventory/{id}` | HOST, AGENT |
| PATCH | `/api/v1/inventory/{id}` | HOST, AGENT |
| DELETE | `/api/v1/inventory/{id}` | HOST, AGENT |
| GET | `/api/v1/inventory/{id}/stock-movements` | HOST, AGENT |
| POST | `/api/v1/inventory/{id}/stock-movements` | HOST, AGENT |

### Payments
| Method | Endpoint | Roles |
|---|---|---|
| POST | `/api/v1/payments/qris` | AGENT |
| GET | `/api/v1/payments/{id}` | HOST, AGENT |
| POST | `/api/v1/payments/midtrans/notification` | Public (webhook, verifikasi signature Midtrans) |

> `/payments/qris` menolak transaksi milik HOST bermode `SELF_RECORDED` (PRD §9.6) — transaksi tersebut sudah `PAID` sejak dibuat dan tidak punya order Midtrans. Mode diresolve dari `Transaction.branch` → `Branch.host` → `User.paymentIntegrationMode`; cabang tanpa `host` diperlakukan `MANAGED`.

### Dashboard
| Method | Endpoint | Roles |
|---|---|---|
| GET | `/api/v1/dashboard/summary` | HOST, AGENT |
| GET | `/api/v1/dashboard/revenue` | HOST, AGENT |
| GET | `/api/v1/dashboard/transactions` | HOST, AGENT |
| GET | `/api/v1/dashboard/services` | HOST, AGENT |
| GET | `/api/v1/dashboard/agents` | HOST, AGENT |
| GET | `/api/v1/dashboard/inventory` | HOST, AGENT |

### Subscription (milik HOST)
| Method | Endpoint | Roles |
|---|---|---|
| GET | `/api/v1/subscription` | HOST (milik sendiri) |
| GET | `/api/v1/subscription/invoices` | HOST (milik sendiri) |
| GET | `/api/v1/subscription/invoices/{id}` | HOST (milik sendiri) |

### Admin Platform
| Method | Endpoint | Roles |
|---|---|---|
| GET | `/api/v1/admin/subscription-plans` | GROOMA_ADMIN |
| POST | `/api/v1/admin/subscription-plans` | GROOMA_ADMIN |
| GET | `/api/v1/admin/subscription-plans/{id}` | GROOMA_ADMIN |
| PATCH | `/api/v1/admin/subscription-plans/{id}` | GROOMA_ADMIN |
| GET | `/api/v1/admin/subscriptions` | GROOMA_ADMIN |
| GET | `/api/v1/admin/subscriptions/{id}` | GROOMA_ADMIN |
| PATCH | `/api/v1/admin/subscriptions/{id}` | GROOMA_ADMIN |
| PATCH | `/api/v1/admin/hosts/{id}/payment-integration-mode` | GROOMA_ADMIN |

### Internal
| Method | Endpoint | Roles |
|---|---|---|
| POST | `/api/v1/internal/subscriptions/run-billing-cycle` | Internal/cron saja (`Authorization: Bearer <INTERNAL_CRON_SECRET>`, bukan role user) |
