# GROOMA
## Landing Page — Struktur & Copywriting

**Produk:** Grooma — Aplikasi Manajemen Operasional & Kasir (POS) Barbershop
**Dokumen:** Landing Page Marketing (Struktur + Copywriting)
**Versi:** 1.0
**Status:** Draft — siap direview tim marketing/desain sebelum dibangun

---

## 0. Cara Pakai Dokumen Ini

- Setiap section di bawah punya **Tujuan**, **Headline/Body/CTA siap pakai**, dan **Catatan desain**. Copy bisa langsung ditempel ke Figma/CMS, tidak perlu ditulis ulang dari nol.
- Teks bertanda `[ISI: ...]` adalah **placeholder** — data yang belum ada (harga final, testimoni nyata, logo klien, jumlah pengguna). **Jangan publish halaman selama placeholder ini masih ada.**
- Semua klaim angka/sosial proof di dokumen ini sengaja ditulis generik (bukan angka fiktif), karena belum ada data pengguna nyata untuk diklaim. Ganti ke angka asli begitu tersedia.
- Urutan section adalah urutan default untuk v1. Section bertanda **(opsional v1)** boleh ditunda ke v1.1 kalau butuh rilis cepat.

### Elevator Pitch (acuan untuk semua copy)

> Grooma adalah aplikasi kasir dan manajemen operasional untuk pemilik barbershop — termasuk yang punya banyak cabang. Transaksi, pembayaran QRIS, stok, komisi karyawan, dan laporan bisnis tercatat otomatis dalam satu sistem, semua bisa diakses langsung dari HP — baik oleh pemilik maupun staf.

### Tone of Voice

- **Bicara ke pemilik usaha, bukan ke developer.** Tidak ada istilah teknis (role, API, backend, database) — semua diterjemahkan ke bahasa manfaat.
- **Pakai "Anda".** Hangat tapi tetap profesional — sama seperti bicara ke sesama pemilik usaha, bukan brosur korporat kaku.
- **Urutan bicara: masalah → solusi → fitur.** Jangan buka dengan daftar fitur sebelum pembaca merasa "ini ngomongin masalah saya".
- **Jangan melebih-lebihkan.** Hindari klaim seperti "gratis"/"trial" kalau program itu belum benar-benar ada, atau angka pelanggan kalau belum ada datanya. Lebih baik jujur generik daripada klaim yang bisa dipatahkan calon pelanggan sendiri.

### Tipografi

**Font utama: Plus Jakarta Sans** (Google Fonts — open source, gratis untuk pemakaian komersial).

- **Headline** (Hero, headline tiap section, CTA Penutup): weight **Bold/ExtraBold (700/800)**.
- **Subheadline & body text**: weight **Regular/Medium (400/500)**.
- **CTA/tombol & label**: weight **SemiBold/Bold (600/700)** — supaya tombol terasa tegas, bukan terbaca sebagai teks biasa.
- **Fallback stack (CSS):** `"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif` — hanya dipakai saat font gagal load, bukan pengganti yang disengaja.
- **Alasan pemilihan:** bentuk geometris dan modern, tetap terbaca jelas baik di ukuran kecil (body) maupun besar (headline) — selaras dengan tone "profesional tapi tidak kaku" yang dipakai di seluruh copy halaman ini.
- **Implementasi di codebase ini:** project sudah pakai `next/font` untuk font default (Geist, lihat `app/layout.tsx`/`README.md`). Ganti dengan `Plus_Jakarta_Sans` dari `next/font/google` supaya font ini juga di-self-host otomatis oleh Next.js, bukan di-fetch dari Google Fonts saat runtime:
  ```ts
  import { Plus_Jakarta_Sans } from "next/font/google";

  const plusJakartaSans = Plus_Jakarta_Sans({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700", "800"],
  });
  ```
- **Sumber:** [fonts.google.com/specimen/Plus+Jakarta+Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans)

---

## 1. Peta Struktur Landing Page

| # | Section | Tujuan | CTA Goal |
|---|---|---|---|
| 1 | Navbar | Navigasi + CTA persisten | Mulai Sekarang |
| 2 | Hero | Tangkap perhatian, sampaikan value utama | Mulai Sekarang / Lihat Cara Kerja |
| 3 | Trust Bar *(opsional v1)* | Bangun kredibilitas awal | — |
| 4 | Masalah (Problem) | Bikin pembaca merasa "ini masalah saya" | Scroll lanjut |
| 5 | Solusi (3 Pilar) | Jembatan dari masalah ke produk | Scroll lanjut |
| 6 | Fitur Utama | Jelaskan kemampuan konkret | Lihat Semua Fitur |
| 7 | Cara Kerja | Turunkan rasa "ribet untuk pindah sistem" | Mulai Sekarang |
| 8 | Untuk Pemilik vs Untuk Staff | Tunjukkan produk dipakai seluruh tim | Mulai Sekarang |
| 9 | Satu Aplikasi di HP untuk Semua | Hilangkan keraguan teknis | — |
| 10 | Keamanan & Privasi Data | Bangun kepercayaan data bisnis | — |
| 11 | Testimoni *(opsional v1)* | Social proof | — |
| 12 | Harga | Transparansi, kurangi friksi sales | Mulai Berlangganan |
| 13 | FAQ | Tangani keberatan terakhir | — |
| 14 | CTA Penutup | Dorongan terakhir sebelum keluar halaman | Mulai Sekarang |
| 15 | Footer | Navigasi sekunder + legal | — |

---

## 2. Copywriting Detail per Section

### 2.1. Navbar

**Tujuan:** Navigasi cepat + CTA yang selalu terlihat saat scroll.

**Struktur:**
> Logo **Grooma** · Fitur · Cara Kerja · Harga · FAQ · [Masuk] · **[Mulai Sekarang]**

**Catatan desain:** Tombol "Mulai Sekarang" dibuat paling menonjol (solid/filled). "Masuk" untuk HOST/AGENT yang sudah punya akun — tujuannya ke halaman login, bukan ke marketing page lain.

---

### 2.2. Hero Section

**Tujuan:** Dalam 3 detik pertama, pengunjung harus tahu Grooma itu apa dan untuk siapa.

**Headline (pilihan A — fokus kontrol bisnis):**
> Kelola Semua Cabang Barbershop Anda dalam Satu Dashboard

**Headline (pilihan B — fokus lepas dari cara manual):**
> Stop Catat Transaksi di Buku. Semua Otomatis di Grooma.

**Subheadline:**
> Dari transaksi harian, stok produk, sampai komisi karyawan — semua tercatat rapi dan bisa Anda pantau real-time, dari cabang mana pun.

**CTA Primer:**
> Mulai Sekarang

**CTA Sekunder:**
> Lihat Cara Kerjanya

**Micro-trust line (di bawah CTA, kecil):**
> Dibangun khusus untuk kebutuhan operasional barbershop Indonesia

**Catatan desain:** Visual hero berupa dua mockup HP berdampingan — satu menampilkan tampilan dashboard (sisi pemilik), satu menampilkan tampilan input transaksi (sisi staf). Keduanya mobile, bukan web/laptop — menunjukkan dua peran dalam satu aplikasi yang sama. Pilih salah satu headline A/B untuk A/B test, jangan tampilkan dua-duanya sekaligus.

---

### 2.3. Trust Bar *(opsional v1 — pilih salah satu varian)*

**Tujuan:** Validasi sosial sebelum pembaca scroll lebih jauh.

**Varian pra-peluncuran (belum ada data pengguna):**
> Dibangun bersama pemilik barbershop di Indonesia, untuk masalah yang mereka alami tiap hari.

**Varian pasca-peluncuran (setelah ada data nyata):**
> `[ISI: jumlah]` Barbershop · `[ISI: jumlah]` Cabang Terdaftar · `[ISI: jumlah]` Transaksi Tercatat

**Catatan desain:** Jangan tampilkan logo klien tanpa izin tertulis. Kalau belum ada testimoni/klien yang bisa ditampilkan, section ini boleh dihapus dulu dari v1 — lebih baik tidak ada daripada placeholder kosong terlihat di production.

---

### 2.4. Masalah (Problem Section)

**Tujuan:** Membuat pembaca berkata "ini persis masalah saya" sebelum produk dijelaskan.

**Headline Section:**
> Kenali Masalah Ini di Barbershop Anda?

**4 Kartu Masalah:**

1. **Masih Catat Manual di Buku atau Excel?**
   > Satu transaksi kelewat catat, laporan akhir bulan jadi tidak akurat — dan Anda yang pusing mencari selisihnya.

2. **Tidak Bisa Pantau Cabang Lain dari Jauh?**
   > Kalau tidak datang langsung, Anda tidak tahu cabang mana yang ramai, mana yang sepi, atau mana yang omzetnya aneh.

3. **Stok Produk Suka Habis Tanpa Diduga?**
   > Pomade atau alat cukur kehabisan saat pelanggan sedang ramai-ramainya — dan Anda baru tahu setelah staf lapor.

4. **Hitung Komisi Karyawan Masih Manual?**
   > Setiap akhir bulan harus buka catatan satu per satu untuk hitung bagi hasil — rawan salah, rawan tidak transparan ke karyawan.

**Catatan desain:** Satu ikon representatif per kartu (buku, peta/pin cabang, botol kosong, kalkulator). Urutan boleh disesuaikan riset pengguna — tapi "catat manual" sebaiknya tetap kartu pertama karena paling universal.

---

### 2.5. Solusi (3 Pilar)

**Tujuan:** Jembatan naratif dari masalah ke fitur, tanpa langsung melempar daftar fitur.

**Headline Section:**
> Grooma Menyederhanakan Tiga Hal Ini

**Pilar 1 — Catat**
> Semua transaksi, stok, dan data pelanggan tercatat otomatis saat terjadi — bukan diinput ulang nanti.

**Pilar 2 — Pantau**
> Lihat kondisi bisnis Anda real-time dari satu dashboard, tanpa harus menelepon atau mendatangi tiap cabang.

**Pilar 3 — Berkembang**
> Dengan data yang akurat, Anda bisa ambil keputusan lebih cepat — layanan mana paling laku, cabang mana yang butuh perhatian.

**Catatan desain:** Tampilkan sebagai 3 kolom sejajar dengan ikon/angka 1-2-3, bukan daftar vertikal — supaya terasa seperti proses/alur, bukan tiga fitur lepas.

---

### 2.6. Fitur Utama

**Tujuan:** Membuktikan klaim di section Solusi dengan kemampuan konkret.

**Headline Section:**
> Semua yang Anda Butuhkan, Sudah Ada di Dalamnya

**1. Kasir Cepat & Simpel**
> **Transaksi Selesai dalam Hitungan Detik**
> Staf tinggal pilih layanan, pilih pelanggan (atau input baru), lalu pilih metode bayar. Semua otomatis terhitung dan langsung tersimpan sebagai laporan.

**2. Pembayaran QRIS yang Fleksibel**
> **QRIS Siap Pakai, atau Tetap Pakai QRIS Anda Sendiri**
> Mau praktis? Aktifkan QRIS langsung di Grooma. Sudah punya payment gateway sendiri? Tetap pakai itu — Grooma cukup mencatat transaksinya supaya laporan tetap rapi dan terpusat.

**3. Satu Dashboard untuk Semua Cabang**
> **Pantau Semua Cabang, Tanpa Harus Keliling**
> Sebagai pemilik, Anda bisa melihat transaksi, omzet, dan performa setiap cabang dari satu tempat — kapan saja, dari mana saja.

**4. Inventaris yang Selalu Terkontrol**
> **Stok Menipis? Anda Tahu Sebelum Kehabisan**
> Setiap cabang punya pencatatan stok sendiri, lengkap dengan batas minimum. Produk atau alat penting tidak lagi tiba-tiba habis saat pelanggan sedang ramai.

**5. Pelanggan Loyal dengan Poin Otomatis**
> **Pelanggan Balik Lagi, Berkat Poin yang Terkumpul Sendiri**
> Setiap transaksi yang dibayar otomatis menambah poin loyalitas pelanggan. Tidak perlu stempel kartu atau hitung manual — datanya tersimpan rapi di profil pelanggan.

**6. Komisi Karyawan, Hitung Otomatis**
> **Tidak Perlu Lagi Hitung Komisi Pakai Kalkulator**
> Atur persentase bagi hasil sekali di awal untuk tiap layanan. Setiap transaksi selesai, bagian karyawan dan bagian bisnis langsung terhitung otomatis.

**7. Koreksi Transaksi, Harus Disetujui**
> **Satu Kesalahan Input Tidak Akan Mengubah Laporan Begitu Saja**
> Kalau ada transaksi yang perlu dikoreksi, staf cukup mengajukan — dan hanya pemilik/pengelola yang berwenang yang bisa menyetujuinya. Semua tercatat jelas siapa mengajukan dan siapa menyetujui.

**8. Laporan Berbasis Data Asli**
> **Laporan yang Anda Lihat, Itu yang Sebenarnya Terjadi**
> Setiap angka di dashboard — omzet, performa layanan, performa karyawan — dihitung langsung dari transaksi yang tercatat. Tidak ada estimasi, tidak ada angka kira-kira.

**Catatan desain:** Grid 2 kolom x 4 baris atau carousel 8 kartu dengan ikon berbeda tiap fitur. Fitur #1–#3 adalah yang paling harus terlihat tanpa scroll (paling universal), #7–#8 bisa diposisikan lebih bawah karena butuh konteks "kenapa ini penting" yang sudah dibangun di section Masalah.

---

### 2.7. Cara Kerja

**Tujuan:** Menurunkan rasa "pindah sistem itu ribet" dengan menunjukkan prosesnya singkat.

**Headline Section:**
> Mulai Pakai Grooma dalam 4 Langkah

**Langkah 1 — Daftar & Atur Bisnis Anda**
> Buat akun, tambahkan cabang, layanan, dan harga sesuai bisnis Anda.

**Langkah 2 — Undang Tim Anda**
> Tambahkan staf tiap cabang, masing-masing otomatis hanya bisa mengakses cabangnya sendiri.

**Langkah 3 — Mulai Catat Transaksi**
> Staf mencatat transaksi langsung dari HP atau tablet di kasir — tunai atau QRIS.

**Langkah 4 — Pantau, Setujui, dan Berkembang**
> Anda memantau dashboard real-time, menyetujui pengajuan koreksi, dan membaca laporan performa bisnis.

**CTA di bawah section:**
> Mulai Sekarang

**Catatan desain:** Tampilkan sebagai stepper horizontal (1→2→3→4) dengan garis penghubung, bukan 4 kartu lepas — supaya terasa sebagai proses yang cepat dan jelas urutannya.

---

### 2.8. Untuk Pemilik vs Untuk Staff

**Tujuan:** Menunjukkan Grooma dipakai seluruh tim, bukan cuma tool admin yang menambah kerjaan staf.

**Headline Section:**
> Satu Aplikasi, Semua Peran Dapat Manfaatnya

**Kolom Kiri — Untuk Pemilik/Pengelola**
> - Pantau transaksi dan omzet semua cabang dari satu dashboard
> - Setujui atau tolak pengajuan koreksi transaksi
> - Atur layanan, harga, dan pembagian komisi karyawan
> - Kelola akun staf dan akses per cabang
> - Lihat laporan performa layanan, karyawan, dan stok — berbasis data asli

**Kolom Kanan — Untuk Staf/Barber**
> - Catat transaksi dalam hitungan detik, langsung dari HP
> - Terima pembayaran tunai atau QRIS tanpa alat tambahan
> - Kelola stok produk di cabangnya sendiri
> - Ajukan koreksi kalau ada salah input, tinggal tunggu persetujuan
> - Lihat ringkasan performa cabangnya sendiri

**Catatan desain:** Dua kolom bersebelahan dengan header jelas ("Untuk Pemilik" / "Untuk Staf") — hindari istilah teknis "HOST"/"AGENT" di halaman publik, itu istilah internal sistem.

---

### 2.9. Satu Aplikasi di HP untuk Semua

**Tujuan:** Menjawab pertanyaan tak terucap "ini ribet dipasang di toko saya nggak?"

**Headline:**
> Semua Bisa Dikerjakan Langsung dari HP Anda

**Body:**
> Grooma adalah aplikasi mobile — tidak perlu laptop atau perangkat khusus. Pemilik memantau dashboard dan menyetujui koreksi dari HP-nya sendiri, staf mencatat transaksi harian dari HP atau tablet di cabang. Satu aplikasi, dua peran, tanpa instalasi rumit.

**Catatan desain:** Visual dua HP berdampingan menampilkan dua tampilan berbeda dari aplikasi yang sama (tampilan pemilik vs tampilan staf) — **bukan** split-screen laptop+HP. Section ini pendek — satu layar, tidak butuh banyak teks.

---

### 2.10. Keamanan & Privasi Data

**Tujuan:** Barbershop menyimpan data pelanggan dan omzet — kepercayaan di titik ini krusial sebelum orang mau bayar bulanan.

**Headline:**
> Data Bisnis Anda, Bukan Milik Bersama

**Body:**
> Setiap barbershop yang bergabung dengan Grooma mendapatkan sistem dan ruang data sendiri yang terpisah total dari bisnis lain. Tidak ada data yang tercampur, karena memang dipisahkan sejak awal — bukan sekadar dibatasi lewat aturan aplikasi.

**3 Sub-poin pendukung:**
> - Akses staf dibatasi sesuai cabang tempat ia bertugas.
> - Setiap perubahan transaksi tercatat jelas siapa yang mengajukan dan siapa yang menyetujui.
> - Kata sandi dan data sensitif disimpan terenkripsi, tidak pernah ditampilkan dalam bentuk asli.

**Catatan desain:** Ikon gembok/shield. Section ini boleh singkat (1 headline + 3 bullet), tujuannya menenangkan, bukan menjelaskan detail teknis.

---

### 2.11. Testimoni *(opsional v1)*

**Tujuan:** Social proof dari pengguna nyata.

**Format per kartu:**
> "`[ISI: kutipan testimoni asli]`"
> **`[ISI: Nama]`** — Pemilik, `[ISI: Nama Barbershop]`, `[ISI: Kota]`

**Catatan desain:** Minimal 3 kartu untuk terasa kredibel. **Jangan isi dengan testimoni karangan** — kosongkan section ini (hapus dari v1) sampai ada testimoni asli dari pengguna nyata, lengkap dengan izin pemakaian nama/foto mereka.

---

### 2.12. Harga

**Tujuan:** Transparansi harga mengurangi friksi sebelum orang menghubungi sales.

**Headline Section:**
> Satu Harga, Semua Fitur yang Anda Butuhkan

**Subheadline:**
> Berlangganan bulanan, berlaku untuk seluruh cabang di bawah bisnis Anda — bukan dihitung per cabang.

**Kartu Paket:**
> **Paket Grooma**
> Rp `[ISI: harga]` / bulan per bisnis
>
> Termasuk:
> - Transaksi & kasir tanpa batas
> - Dashboard & laporan semua cabang
> - Pembayaran QRIS (mode fleksibel — pakai milik Grooma atau milik Anda sendiri)
> - Manajemen inventaris per cabang
> - Program loyalitas pelanggan otomatis
> - Approval & jejak audit transaksi
> - `[ISI: tambahkan batas jumlah staf/cabang kalau paket ke depan dibedakan per tier]`

**Catatan toleransi pembayaran (bangun kepercayaan):**
> Lupa bayar tepat waktu? Ada masa toleransi beberapa hari sebelum akses dibatasi, jadi operasional harian Anda tidak langsung terhenti.

**CTA:**
> Mulai Berlangganan

**CTA Sekunder (kalau mau buka jalur sales untuk multi-cabang besar):**
> `[ISI: putuskan — "Hubungi Kami untuk Kebutuhan Khusus" hanya jika memang ada jalur sales terpisah]`

**Catatan desain:** Jangan tampilkan tabel multi-tier kalau MVP memang hanya punya satu plan aktif — satu kartu paket yang jelas lebih dipercaya daripada tabel kosong dengan tier "Coming Soon".

---

### 2.13. FAQ

**Tujuan:** Menjawab keberatan terakhir sebelum orang mengklik CTA atau meninggalkan halaman.

> **Apakah Grooma bisa dipakai untuk barbershop dengan banyak cabang?**
> Bisa. Satu akun pemilik bisa memantau dan mengelola seluruh cabang dari satu dashboard, sementara setiap staf hanya mengakses cabang tempat ia ditugaskan.

> **Saya sudah punya QRIS sendiri, apakah tetap harus pakai QRIS dari Grooma?**
> Tidak. Anda bisa langsung pakai QRIS yang sudah terintegrasi di Grooma, atau tetap memakai QRIS/metode pembayaran Anda sendiri — Grooma hanya mencatat transaksinya agar laporan tetap rapi dan terpusat.

> **Apakah data barbershop saya akan tercampur dengan bisnis lain pengguna Grooma?**
> Tidak. Setiap bisnis yang bergabung mendapat ruang data dan sistemnya sendiri yang terpisah total dari bisnis lain.

> **Bagaimana Grooma menangani kesalahan input transaksi?**
> Staf dapat mengajukan permintaan koreksi, dan pemilik/pengelola yang berwenang harus menyetujuinya terlebih dahulu sebelum perubahan berlaku. Setiap persetujuan tercatat sebagai jejak audit.

> **Apakah komisi karyawan dihitung otomatis?**
> Ya. Setiap layanan punya persentase bagi hasil yang Anda atur di awal, dan sistem menghitungnya otomatis setiap transaksi selesai — tidak perlu hitung manual di akhir bulan.

> **Apakah Grooma punya aplikasi mobile?**
> Ya — Grooma berbasis aplikasi mobile, dipakai oleh pemilik maupun staf, hanya tampilannya menyesuaikan peran masing-masing. Staf mencatat transaksi langsung dari HP atau tablet di cabang, pemilik memantau dashboard dan menyetujui koreksi dari HP-nya sendiri, di mana saja. Tidak ada dashboard web terpisah.

> **Apa yang terjadi kalau saya telat membayar langganan bulanan?**
> `[ISI: konfirmasi kebijakan final sebelum publish]` Grooma memberi masa toleransi sebelum status langganan berubah, jadi operasional harian Anda tidak langsung terganggu karena keterlambatan singkat.

> **Bagaimana pelanggan mendapat keuntungan dari program loyalitas?**
> Setiap transaksi yang berhasil dibayar otomatis menambahkan poin loyalitas ke akun pelanggan — tanpa perlu dihitung manual oleh staf.

**Catatan desain:** Accordion (expand/collapse), urutan dari pertanyaan paling umum ke paling teknis. Pertanyaan harga ("berapa biayanya") sudah terjawab di section Harga — tidak perlu diulang di sini kecuali ada follow-up spesifik.

---

### 2.14. CTA Penutup

**Tujuan:** Dorongan terakhir sebelum pengunjung keluar dari halaman.

**Headline:**
> Saatnya Barbershop Anda Dikelola Lebih Rapi

**Subheadline:**
> Fokus ke pelanggan dan pelayanan — biar Grooma yang urus pencatatannya.

**CTA Primer:**
> Mulai Sekarang

**CTA Sekunder:**
> `[ISI: "Hubungi Tim Kami" — isi link WhatsApp/kontak sales]`

**Catatan desain:** Section ini singkat dan visual kuat (background kontras warna brand) — fungsinya penutup emosional, bukan tempat menjelaskan fitur lagi.

---

### 2.15. Footer

**Struktur kolom:**

> **Produk** — Fitur · Cara Kerja · Harga · FAQ
>
> **Perusahaan** — `[ISI: Tentang Kami]` · `[ISI: Kontak]`
>
> **Legal** — `[ISI: Syarat & Ketentuan]` · `[ISI: Kebijakan Privasi]`
>
> **Sosial** — `[ISI: link Instagram/WhatsApp/dll]`

**Baris bawah:**
> © `[ISI: tahun]` Grooma. Seluruh hak cipta dilindungi.

**Catatan desain:** Kebijakan Privasi wajib ada sebelum publish — produk menyimpan data pribadi pelanggan (nomor telepon, tanggal lahir) dan data transaksi keuangan.

---

## 3. SEO & Meta Copy

| Elemen | Isi |
|---|---|
| Title tag | Grooma — Aplikasi Kasir & Manajemen Barbershop Multi-Cabang |
| Meta description | Kelola transaksi, stok, karyawan, dan pembayaran QRIS barbershop Anda dalam satu dashboard. Pantau semua cabang secara real-time dengan Grooma. |
| OG title | Grooma — Kelola Barbershop Anda Tanpa Ribet Catat Manual |
| OG description | Transaksi, stok, komisi karyawan, dan laporan bisnis — otomatis tercatat dalam satu sistem. Dibangun khusus untuk barbershop Indonesia. |
| Kandidat keyword | aplikasi kasir barbershop, software manajemen barbershop, POS barbershop Indonesia, aplikasi barbershop multi cabang, QRIS barbershop |

---

## 4. Daftar Hal yang Perlu Diisi/Dikonfirmasi Sebelum Publish

- [ ] Harga paket final (section 2.12) — placeholder `[ISI: harga]`
- [ ] Kebijakan final keterlambatan pembayaran (section 2.12 & 2.13) — pastikan copy toleransi pembayaran sesuai kebijakan yang benar-benar berlaku
- [ ] Testimoni asli + izin pemakaian nama/foto (section 2.11) — atau hapus section ini dari v1
- [ ] Logo klien/jumlah pengguna nyata (section 2.3) — atau pakai varian pra-peluncuran
- [ ] Link kontak sales/WhatsApp (section 2.12 & 2.14)
- [ ] Halaman Syarat & Ketentuan dan Kebijakan Privasi (section 2.15) — wajib sebelum publish karena produk menyimpan data pribadi pelanggan
- [ ] Screenshot/mockup produk asli untuk Hero dan section Satu Aplikasi di HP untuk Semua (section 2.2 & 2.9)
- [ ] Konfirmasi apakah ada jalur sales terpisah untuk kebutuhan multi-cabang besar (menentukan apakah CTA sekunder di section 2.12 dipakai)
