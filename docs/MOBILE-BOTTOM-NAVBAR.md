# Bottom Navbar Mobile (Flutter) — HOST & AGENT

> Daftar nama Nav Item untuk bottom navbar di app Flutter, dipisah per role. **Tanpa API contract** — itu ada di `docs/AUTH-MOBILE-API-INTEGRATION.md` dan dokumen modul lainnya.

Struktur ini diturunkan dari **Authorization Matrix (PRD §3.2)** dan dari role gating yang benar-benar ada di kode. Karena PRD tidak pernah mendikte bentuk UI, **pengelompokan ke 5 item** di bawah adalah keputusan desain (bottom nav praktis maksimal 5 slot) — yang bukan keputusan desain adalah *siapa boleh akses apa*, itu sudah ditentukan backend.

---

## HOST

| # | Nav Item | Isi |
|---|---|---|
| 1 | **Dashboard** | Ringkasan KPI & revenue **semua cabang** |
| 2 | **Transaksi** | Daftar transaksi semua cabang + **Persetujuan** (antrian pengajuan perubahan) |
| 3 | **Inventaris** | Stok semua cabang |
| 4 | **Kelola** | Hub ke 4 halaman manajemen — lihat di bawah |
| 5 | **Profil** | Profil akun HOST, ganti password, logout |

## AGENT

| # | Nav Item | Isi |
|---|---|---|
| 1 | **Transaksi** | Home/POS — buat transaksi baru, lihat & selesaikan transaksi cabangnya, ajukan perubahan |
| 2 | **Customer** | Lihat, tambah, update customer (tidak bisa nonaktifkan) |
| 3 | **Inventaris** | CRUD stok, **hanya cabangnya sendiri** |
| 4 | **Dashboard** | Ringkasan KPI **cabangnya sendiri saja** |
| 5 | **Profil** | Profil akun AGENT, ganti password, logout |

---

## Apa Itu Tab "Kelola"?

**Kelola** adalah satu slot nav yang isinya **menu/hub ke beberapa halaman manajemen**, bukan satu halaman tunggal. Alasannya sederhana: HOST punya 4 area administratif yang masing-masing jarang dibuka (tidak harian seperti Transaksi), sementara bottom nav cuma muat 5 slot. Kalau masing-masing dikasih slot sendiri, nav-nya jadi 8 item dan yang harian malah tenggelam.

Isi tab Kelola (**semuanya HOST-only** — tidak satu pun bisa diakses AGENT):

| Sub-halaman | Isi |
|---|---|
| **Cabang** | CRUD cabang, aktif/nonaktifkan cabang |
| **Karyawan** | CRUD akun AGENT/HOST, assign cabang, aktif/nonaktifkan akun |
| **Layanan** | CRUD service: nama, harga, durasi, revenue sharing (bagi hasil owner/pegawai) |
| **Subscription & Billing** | Status langganan Grooma, riwayat invoice, bayar via QRIS |

> Catatan: **Customer sengaja TIDAK ditaruh di Kelola** meskipun HOST punya kewenangan ekstra di situ (aktif/nonaktifkan). Alasannya, customer dipakai operasional harian oleh kedua role, bukan data master yang jarang disentuh — jadi untuk HOST, customer paling pas diakses dari dalam tab **Transaksi** (saat menelusuri siapa yang bertransaksi), bukan dikubur di menu administratif. Untuk AGENT, customer memang sudah jadi tab sendiri.

---

## Soal Layanan/Service — Sudah Ada, Tapi Perhatikan Ini

**Untuk HOST:** Layanan ada di dalam **Kelola** (CRUD penuh: tambah layanan, ubah harga, atur bagi hasil).

**Untuk AGENT: Layanan sebaiknya BUKAN nav item, dan itu disengaja.** AGENT memang bisa membaca daftar layanan (`GET /services` memperbolehkan AGENT), tapi aksesnya **read-only** — tidak bisa tambah/ubah/hapus/nonaktifkan sama sekali. Dan pembacaan itu hanya dibutuhkan **di dalam alur buat transaksi** (layar "pilih layanan" saat input transaksi baru), bukan sebagai halaman katalog yang berdiri sendiri. Memberi AGENT tab "Layanan" yang isinya daftar read-only tanpa satu pun aksi hanya akan memakan slot nav untuk layar yang tidak punya tujuan.

Kalau tetap ingin AGENT bisa melihat daftar harga di luar alur transaksi (mis. untuk menjawab pertanyaan customer), taruh sebagai halaman read-only di dalam tab **Transaksi** atau **Profil**, bukan slot nav tersendiri.

---

## Persetujuan (Change Request) — HOST

Antrian pengajuan perubahan transaksi adalah **queue kerja milik HOST** (`GET /transaction-change-requests` HOST-only) — AGENT mengajukan, HOST memutuskan.

**Rekomendasi penempatan:** di dalam tab **Transaksi** sebagai sub-halaman "Persetujuan", **dengan badge berisi jumlah pengajuan `PENDING`** di ikon nav Transaksi. Alasannya: ini sifatnya menunggu tindakan HOST, jadi harus terlihat tanpa HOST perlu membukanya dulu — badge menyelesaikan itu tanpa memakan slot nav keenam.

Untuk **AGENT**, tidak ada antrian apa pun: AGENT hanya bisa melihat status pengajuan **yang dia ajukan sendiri**, dan itu paling pas ditempel di halaman detail transaksi yang bersangkutan, bukan jadi halaman daftar tersendiri. Detailnya di `docs/TRANSACTION-CHANGE-REQUESTS-MOBILE-API-INTEGRATION.md` §4.

---

## Cakupan — Semua Modul API Sudah Terwakili di Mana?

Tabel ini untuk memastikan tidak ada modul backend yang kelupaan dapat tempat di UI:

| Modul API | HOST | AGENT |
|---|---|---|
| `/auth` | Profil (ganti password, logout) | Profil |
| `/profile` | Profil | Profil |
| `/dashboard/*` | Tab Dashboard | Tab Dashboard |
| `/transactions/*` | Tab Transaksi | Tab Transaksi |
| `/payments/*` | — (tidak pernah dipanggil HOST) | Di dalam alur bayar QRIS, tab Transaksi |
| `/transaction-change-requests/*` | Transaksi › Persetujuan (+ badge) | Di detail transaksi (status pengajuan sendiri) |
| `/customers/*` | Di dalam tab Transaksi | Tab Customer |
| `/inventory/*` | Tab Inventaris | Tab Inventaris |
| `/services/*` | Kelola › Layanan | Read-only di alur pilih layanan |
| `/branches/*` | Kelola › Cabang | Read-only info cabang sendiri, taruh di Profil |
| `/users/*` | Kelola › Karyawan | **Tidak ada akses** |
| `/subscription/*` | Kelola › Subscription | **Tidak ada akses** |

---

## State "Terkunci" Saat Subscription HOST Menunggak

Ini bukan kasus langka — ini state yang **harus** dirancang dari awal, dan efeknya ke dua role sangat berbeda. Saat subscription berstatus `PAST_DUE`/`EXPIRED`/`CANCELLED`:

### HOST — hampir seluruh app terkunci

Satu-satunya yang masih bisa diakses HOST: **Profil** dan **Kelola › Subscription** (supaya bisa bayar). Dashboard, Transaksi, Inventaris, dan tiga sub-halaman Kelola lainnya **semuanya balas `402`**.

**Jangan** biarkan HOST menekan tab satu per satu lalu disambut error 402 di tiap layar. Pola yang benar: begitu app tahu subscription lapsed, tampilkan **layar blocker** dengan CTA "Bayar Tagihan" yang langsung ke halaman Subscription, dan disable tab lain di navbar.

### AGENT — hanya sebagian terkunci

| Masih jalan normal | Terkunci (`402`) |
|---|---|
| Tab **Transaksi** (buat/lihat/selesaikan/batalkan/struk/bayar QRIS) | Tab **Dashboard** |
| Tab **Customer** (kecuali aktif/nonaktifkan — itu HOST-only) | Tab **Inventaris** |
| Tab **Profil** | **Ajukan perubahan** transaksi |
| Pilih layanan di alur transaksi | |

Ini disengaja (PRD §23.4.1): customer yang sudah duduk di kursi tidak boleh jadi korban tagihan HOST yang telat, tapi AGENT juga tidak dibiarkan bebas sepenuhnya. Jadi untuk AGENT cukup **disable 2 tab** (Dashboard, Inventaris) + sembunyikan tombol "Ajukan Perubahan" — sisanya tetap berfungsi penuh.

---

## Catatan Lain

- **AGENT tidak punya tab "Kelola"** — keempat isinya HOST-only, jadi memang tidak ada link-nya sama sekali, bukan disembunyikan secara kondisional.
- **Urutan tab sengaja berbeda antar role:** AGENT ditaruh Transaksi di posisi 1 karena itu kerjaan hariannya (POS); HOST ditaruh Dashboard di posisi 1 karena lebih sering buka overview dulu.
- **"Dashboard" dan "Inventaris" sama namanya di kedua role, tapi scope datanya beda** (semua cabang vs. satu cabang) — ditentukan backend otomatis dari sesi login, bukan dari pilihan di UI (PRD §3.2, §3.3).
- **HOST tidak bisa membuat transaksi** (`POST /transactions` menolak HOST dengan 403) — jadi di tab Transaksi milik HOST, **jangan tampilkan tombol "Buat Transaksi"** sama sekali. Tab itu untuk HOST sifatnya monitoring + approval, bukan input.
