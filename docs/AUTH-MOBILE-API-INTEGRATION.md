# Integrasi Mobile (Flutter) — Grooma API — Modul Auth

> Panduan integrasi API Grooma untuk aplikasi mobile Flutter (Android) yang dipakai oleh dua role dalam **satu aplikasi**: **HOST** dan **AGENT**. Dokumen ini khusus modul **Auth** (login, session check, logout). Modul lain (profile, transaksi, dsb.) didokumentasikan di file terpisah dengan pola penamaan yang sama: `docs/[NAMA-MODULE]-MOBILE-API-INTEGRATION.md`.

---

## 0. Hal yang Wajib Dipahami Dulu

1. **Satu aplikasi, dua role, satu bottom-nav berbeda per role.**
   Setelah login, backend mengembalikan field `role` (`"HOST"` atau `"AGENT"`). App yang menentukan mau redirect ke mana berdasarkan field ini — backend tidak punya konsep "redirect URL" (lihat bagian 4).

2. **Satu deployment backend = satu HOST (satu bisnis barbershop).**
   Grooma di-deploy terpisah per bisnis. Artinya **tidak ada satu Base URL global** yang berlaku untuk semua user seperti SaaS multi-tenant biasa — tiap instalasi punya domain/URL sendiri. Jangan hardcode base URL di kode Flutter (lihat bagian 1).

3. **Auth-nya session cookie, BUKAN bearer token.**
   Ini bagian paling kritis buat integrasi mobile. Login **tidak** mengembalikan `access_token`/`jwt` apa pun di body JSON. Token sesi hanya dikirim lewat header `Set-Cookie` (httpOnly), dan setiap request berikutnya harus mengirim balik cookie itu lewat header `Cookie`. Flutter **wajib** pakai HTTP client dengan cookie jar persisten (bagian 2) — kalau tidak, request pertama setelah login akan selalu dianggap belum login oleh backend.

---

## 1. Base URL

Semua endpoint ada di bawah prefix `/api/v1`:

```
{BASE_URL}/api/v1/...
```

| Environment | Contoh |
|---|---|
| Development (local) | `http://localhost:3000` |
| Staging/Production | Domain milik deployment HOST tersebut (beda-beda tiap instalasi) |

**Rekomendasi:** simpan `BASE_URL` sebagai nilai configurable (`--dart-define=BASE_URL=...` per build flavor, remote config, dsb.), **jangan** hardcode sebagai konstanta — karena tiap instalasi Grooma punya base URL sendiri-sendiri.

---

## 2. Model Autentikasi: Session Cookie

| Aspek | Detail |
|---|---|
| Mekanisme | HttpOnly session cookie, nama `grooma_session` |
| Dikirim lewat | Response header `Set-Cookie` saat login sukses |
| Isi body JSON login | **Tidak ada token.** Hanya `{ user: {...} }` |
| Masa berlaku | 7 hari dari waktu login |
| Flag cookie | `HttpOnly`, `SameSite=Lax`, `Path=/`, plus `Secure` **hanya** kalau backend diset `APPLICATION_ENVIRONMENT=production` |
| Cara dipakai di request selanjutnya | Kirim balik cookie yang sama lewat header `Cookie` — **bukan** `Authorization: Bearer ...` |

Karena `HttpOnly`, app tidak bisa dan tidak perlu membaca isi token-nya secara manual — cukup pastikan HTTP client menyimpan cookie dari response dan mengirimkannya otomatis di request berikutnya.

> ⚠️ Kalau backend production diakses lewat HTTP biasa (bukan HTTPS), cookie dengan flag `Secure` tidak akan pernah dikirim ulang oleh client. Pastikan base URL production selalu `https://`.

**Package yang disarankan (Dio):**
- `dio` — HTTP client
- `cookie_jar` — penyimpanan cookie (pakai `PersistCookieJar` agar sesi tetap ada setelah app ditutup/dibuka lagi)
- `dio_cookie_manager` — interceptor yang menjembatani `dio` ↔ `cookie_jar`
- `path_provider` — buat tahu folder tempat `PersistCookieJar` menyimpan cookie di disk

Setup sekali di awal app (bukan per-request):

```dart
final appDir = await getApplicationDocumentsDirectory();
final cookieJar = PersistCookieJar(
  storage: FileStorage('${appDir.path}/.cookies/'),
);

final dio = Dio(BaseOptions(
  baseUrl: '$baseUrl/api/v1', // baseUrl dari konfigurasi (bagian 1) + prefix API
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
));
dio.interceptors.add(CookieManager(cookieJar));
```

Selama instance `dio` ini dipakai untuk SEMUA request (login, logout, endpoint lain setelahnya), cookie terlampir otomatis — tidak perlu kode tambahan untuk "attach token" di tiap call.

> **Penting untuk semua doc modul lain (profile, dashboard, transaksi, dsb.):** karena `baseUrl` instance `dio` di atas sudah memuat `/api/v1`, setiap contoh kode Dart di dokumen lain memanggil path **relatif tanpa `/api/v1`** lagi — mis. `dio.get('/profile')`, bukan `dio.get('/api/v1/profile')`. Notasi `{BASE_URL}/api/v1/...` yang dipakai di contoh `curl`/deskripsi endpoint sepanjang dokumen-dokumen ini tetap menunjukkan URL absolut lengkap seperti apa adanya — itu cuma konvensi penulisan dokumentasi, beda dari `baseUrl` di kode yang sudah mencakup prefix-nya.

> Karena ini native app (bukan Flutter Web), **CORS tidak relevan** di sini — CORS hanya berlaku untuk request dari browser.

---

## 3. POST /api/v1/auth/login

### Ringkasan

| | |
|---|---|
| **Method** | `POST` |
| **URL** | `{BASE_URL}/api/v1/auth/login` |
| **Auth required** | Tidak (public) |
| **Rate limit** | 10 percobaan / 15 menit, dihitung per IP address |

### Headers

| Header | Wajib | Value |
|---|---|---|
| `Content-Type` | Ya | `application/json` |
| `Accept` | Disarankan | `application/json` |

Tidak ada header auth apa pun yang diperlukan untuk endpoint ini.

### Request Body

Schema-nya **strict** — field selain `username`/`password` bikin request ditolak (400).

| Field | Tipe | Wajib | Aturan |
|---|---|---|---|
| `username` | `string` | Ya | 1–64 karakter setelah di-trim |
| `password` | `string` | Ya | 1–128 karakter setelah di-trim |

```json
{
  "username": "budi_agent",
  "password": "rahasia123"
}
```

> **Catatan:** username disimpan lowercase di database dan query login mencocokkan exact-match. Paling aman kalau Flutter melakukan `.trim().toLowerCase()` ke input username sebelum dikirim, supaya user yang mengetik huruf besar/campuran tidak gagal login karena perbedaan case.

### Contoh cURL (buat sanity-check sebelum coding)

```bash
curl -i -X POST "{BASE_URL}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"budi_agent","password":"rahasia123"}'
```

### Response Sukses — `200 OK`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "671234abcd5678ef90123456",
      "username": "budi_agent",
      "name": "Budi Santoso",
      "role": "AGENT",
      "branch": {
        "id": "66ffaa0011223344556677aa",
        "name": "Cabang Kemang"
      }
    }
  }
}
```

Plus response header:

```
Set-Cookie: grooma_session=<64-hex-char-token>; Path=/; Expires=<+7 hari>; HttpOnly; SameSite=Lax
```

**Bentuk `data.user` ini FIXED — hanya field berikut, tidak lebih:**

| Field | Tipe | Catatan |
|---|---|---|
| `id` | `string` | Mongo ObjectId |
| `username` | `string` | |
| `name` | `string` | Nama tampilan |
| `role` | `"HOST" \| "AGENT"` | **Dipakai untuk redirect, lihat bagian 4** |
| `branch` | `{ id, name } \| null` | **Selalu `null` untuk HOST. Selalu terisi untuk AGENT** (AGENT selalu terikat satu cabang) |

Field seperti `phone`, `status`, `createdAt` **tidak ada** di response ini — itu ada di endpoint manajemen user lain yang di luar scope dokumen ini.

### Response Gagal

Semua error pakai bentuk yang sama:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid username or password."
  }
}
```

| Status | `error.code` | Kapan terjadi |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Body tidak sesuai schema — field kosong/hilang/kepanjangan/bukan string, atau ada field tambahan di luar `username`/`password` |
| `401` | `INVALID_CREDENTIALS` | Username tidak ditemukan, **atau** password salah |
| `403` | `ACCOUNT_INACTIVE` | Username & password benar, tapi akun berstatus `INACTIVE` |
| `429` | `RATE_LIMITED` | Lebih dari 10 percobaan login dalam 15 menit dari IP yang sama |
| `500` | `INTERNAL_ERROR` | Error tak terduga di server |

Perlakuan yang disarankan di app:
- **400 & 401** → tampilkan sebagai "Username atau password salah". Jangan coba membedakan lebih detail — backend sengaja menyamarkan "username tidak ada" sebagai 401 generik untuk alasan keamanan (anti user-enumeration).
- **403** → pesan terpisah, mis. "Akun Anda nonaktif, hubungi pemilik/admin". Ini **harus** dibedakan dari salah password secara UX.
- **429** → "Terlalu banyak percobaan, coba lagi nanti". Server **tidak** mengirim header `Retry-After`, jadi app sebaiknya punya cooldown sendiri di sisi client (misalnya disable tombol login sejenak setelah beberapa kali gagal).

---

## 4. Redirect Setelah Login Sukses (berdasarkan Role)

Backend tidak mengarahkan — ini murni ditentukan dari `data.user.role` di response login (atau `/auth/me`, lihat bagian 5):

| `role` | Tujuan di app |
|---|---|
| `"HOST"` | Home/bottom-nav khusus HOST (akses penuh: semua cabang, manajemen staff, dsb.) |
| `"AGENT"` | Home/bottom-nav khusus AGENT, scoped ke `branch` dari response — AGENT hanya kerja di satu cabang yang sudah ditentukan backend |

```dart
final user = loginResponse.data['data']['user'];
await saveLoggedInUser(user); // simpan ke state management (provider/riverpod/bloc)

if (user['role'] == 'HOST') {
  Navigator.pushReplacementNamed(context, '/host/home');
} else {
  // role == 'AGENT'
  Navigator.pushReplacementNamed(context, '/agent/home');
}
```

> Role di sisi app ini hanya untuk kebutuhan navigasi/UX, bukan sumber otoritas. Backend tetap menolak (401/403) kalau AGENT coba hit endpoint khusus HOST — redirect yang benar bukan berarti setiap API call aman, tetap handle error di tiap call (lihat §6).

---

## 5. Endpoint Pendukung Siklus Login

Belum jadi fokus mendalam di dokumen ini, tapi **dibutuhkan dari hari pertama** karena satu paket dengan login (cek sesi saat app dibuka & logout).

### GET /api/v1/auth/me

Dipakai di **splash screen**: cek apakah cookie session yang tersimpan masih valid, tanpa minta user login ulang.

| | |
|---|---|
| **Auth required** | Ya (cookie) |
| **200** | Bentuk `data.user` sama persis seperti login |
| **401** | Sesi tidak ada/kedaluwarsa/dicabut → arahkan ke halaman login |

Pola yang disarankan saat app start: panggil `GET /auth/me` dulu → kalau `200` langsung redirect ke home sesuai role (skip login screen), kalau `401` baru tampilkan halaman login.

### POST /api/v1/auth/logout

| | |
|---|---|
| **Auth required** | Ya (cookie) |
| **200** | Sesi dicabut di server + cookie dihapus lewat response `Set-Cookie` |
| **401** | Tidak ada sesi aktif untuk dicabut |

Setelah logout, app tetap harus **clear local state** (user info yang disimpan di provider/riverpod/bloc) — cookie jar terupdate sendiri dari response, tapi state lokal app tidak otomatis ikut hilang.

---

## 6. Checklist Implementasi Flutter

- [ ] Satu instance `Dio` + `PersistCookieJar` dipakai global (bukan dibuat ulang tiap request) — bagian 2.
- [ ] `BASE_URL` configurable per build, bukan hardcoded — bagian 1.
- [ ] Normalisasi `username` (`trim` + `toLowerCase`) sebelum dikirim ke `/auth/login`.
- [ ] Jangan simpan password di local storage — kirim sekali saat login, lalu buang dari memory.
- [ ] Saat app start: panggil `GET /auth/me` untuk auto-login via cookie tersimpan, baru tampilkan halaman login kalau `401`.
- [ ] Setelah login sukses, baca `data.user.role` untuk menentukan halaman/bottom-nav tujuan (bagian 4).
- [ ] Tangani `401` secara global (interceptor Dio) — kalau endpoint manapun balas `401`, anggap sesi habis → clear state lokal → redirect ke login.
- [ ] Bedakan pesan error `403 ACCOUNT_INACTIVE` dari `401 INVALID_CREDENTIALS` di layar login.
- [ ] Tangani `429 RATE_LIMITED` dengan cooldown di sisi client (server tidak kirim `Retry-After`).
- [ ] Logout: panggil endpoint, lalu clear state lokal terlepas dari hasilnya.

---

## 7. Di Luar Scope Dokumen Ini (belum ada di backend)

- **Lupa password / reset password mandiri** — belum ada endpoint publik untuk ini. Satu-satunya jalur ganti password adalah `POST /auth/change-password`, yang mewajibkan user **sudah login** dan tahu password lama (`currentPassword`) — bukan untuk kasus "lupa password".
- **Registrasi mandiri** — tidak ada. Akun HOST & AGENT dibuat oleh HOST lewat manajemen user (`/users`), bukan self-signup dari app.

Kalau dua hal ini dibutuhkan di flow mobile, perlu didiskusikan requirement-nya dulu sebelum ada endpoint-nya.

---

*Modul berikutnya (profile, transaksi POS, dsb.) akan dibuat sebagai file terpisah, mis. `docs/PROFILE-MOBILE-API-INTEGRATION.md`, `docs/TRANSACTION-MOBILE-API-INTEGRATION.md`.*
