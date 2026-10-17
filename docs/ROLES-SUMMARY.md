# Ringkasan Role — Grooma

> **Konteks penting:** Grooma di-deploy **satu instance per HOST** — satu deployment, satu database, satu bisnis barbershop (PRD §3.5). Jadi di dalam satu deployment cuma ada satu HOST, dan "HOST bisa akses semua cabang" itu memang benar, bukan celah. Bisnis baru = deployment + database baru (lihat `PROVISIONING-HOST.md`), bukan akun HOST baru.

## HOST
*Pengelola bisnis, akses lintas cabang.*
- Kelola cabang & akun pegawai (users) — AGENT tidak punya akses ini sama sekali
- Kontrol penuh layanan & customer: create/edit/nonaktifkan (AGENT cuma sebagian, lihat bawah)
- Lihat transaksi & inventaris di **semua cabang**
- Approve/reject pengajuan perubahan transaksi (tidak boleh approve pengajuannya sendiri)
- Lihat & bayar subscription + invoice miliknya sendiri (QRIS)
- **Tidak bisa** membuat transaksi baru
- Transaksi QRIS diproses lewat akun Midtrans milik HOST sendiri (mode `MANAGED`) atau cukup dicatat karena HOST pakai QRIS sendiri (mode `SELF_RECORDED`) — ditentukan env var `PAYMENT_INTEGRATION_MODE` saat provisioning, bukan lewat API (PRD §9.6)

## AGENT
*Pegawai operasional, akses satu cabang (sesuai penugasan).*
- Catat transaksi baru & proses pembayaran QRIS (lewat Midtrans kalau HOST-nya mode `MANAGED`; langsung tercatat `PAID` kalau HOST-nya mode `SELF_RECORDED` — lihat catatan HOST di atas)
- Lihat daftar & detail layanan (read-only — tidak bisa create/edit/nonaktifkan)
- Lihat, tambah, dan update data customer (tidak bisa ubah status aktif/nonaktif customer)
- CRUD inventaris di cabangnya sendiri
- Ajukan perubahan transaksi (tidak bisa approve/reject)
- Lihat dashboard & profil cabangnya
- Login tidak pernah terblokir oleh status subscription HOST. **[Direvisi 2026-10-17 — PRD §23.4.1]** Login sendiri tetap tidak pernah terblokir, tapi dulu AGENT juga bebas akses *segala* fitur tanpa batas waktu selama HOST menunggak (termasuk inventaris & dashboard). Sekarang dibatasi ke alur penyelesaian transaksi saja (customer, service, transaction, payment) — inventaris, dashboard, cabang, dan pengajuan perubahan transaksi ikut terkunci buat AGENT juga saat HOST `PAST_DUE`/`EXPIRED`/`CANCELLED`.

## GROOMA_ADMIN — tidak ada di backend ini
*Role admin platform **sudah dipindahkan ke backend admin terpisah** yang memakai database yang sama (PRD §3.6).*

Backend ini hanya mengenal `HOST` dan `AGENT`. Yang pindah: pengelolaan `SubscriptionPlan`, pandangan seluruh `Subscription`/`Invoice`, dan override manual status subscription — dulu ada di `/api/v1/admin/*`, namespace itu kini tidak ada di sini.

Karena databasenya dibagi, baris `GROOMA_ADMIN` **tetap ada** di koleksi `users`. Yang menjadi batasnya:
- Backend ini **tidak menerbitkan session** untuk role selain `HOST`/`AGENT` — ditolak di login maupun di setiap validasi session berikutnya (`isServiceRole`, `lib/auth.ts`)
- Akun admin **tidak muncul** di `GET /api/v1/users` dan tidak bisa diedit lewat namespace itu — filternya allowlist positif, jadi role platform baru apa pun otomatis ikut tersaring (`services/userService.ts`)
- Role admin **tidak bisa dibuat** dari sini: enum `models/User.ts` dan schema `/users` hanya menerima `HOST`/`AGENT`

---

## Daftar Endpoint

> Beberapa baris (profile, dashboard/*, `branches` GET, `subscription/*`, `transaction-change-requests/{id}`) tidak dijaga pakai `requireRole` eksplisit — pembatasannya ada di logic service (scoping by branch/ownId), bukan allowlist role. Kolom Roles di bawah merefleksikan behavior efektifnya, bukan cuma yang ketulis di kode gate.

### Auth
| Method | Endpoint | Roles |
|---|---|---|
| POST | `/api/v1/auth/login` | Public |
| POST | `/api/v1/auth/logout` | Any (sesi valid) |
| GET | `/api/v1/auth/me` | HOST, AGENT |
| POST | `/api/v1/auth/change-password` | HOST, AGENT |

### Profile
| Method | Endpoint | Roles |
|---|---|---|
| GET | `/api/v1/profile` | HOST, AGENT (milik sendiri) |
| PATCH | `/api/v1/profile` | HOST, AGENT (milik sendiri) |

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

> Pada deployment bermode `SELF_RECORDED`, `/payments/qris` menolak permintaan (PRD §9.6) — transaksi QRIS di situ sudah `PAID` sejak dibuat dan tidak punya order Midtrans. Webhook Midtrans juga tidak pernah menerima notifikasi.

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
Tidak ada di backend ini. Namespace `/api/v1/admin/*` sudah dihapus dan pindah ke backend admin terpisah (PRD §3.6).

### Internal
| Method | Endpoint | Roles |
|---|---|---|
| POST | `/api/v1/internal/subscriptions/run-billing-cycle` | Internal/cron saja (`Authorization: Bearer <INTERNAL_CRON_SECRET>`, bukan role user) |
