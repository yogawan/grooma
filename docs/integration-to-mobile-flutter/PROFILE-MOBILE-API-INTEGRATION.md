# Integrasi Mobile (Flutter) — Grooma API — Modul Profile

> Dokumen ini khusus modul **Profile** (2 endpoint sederhana: ambil & update profil user sendiri). Base URL, model sesi cookie, dan cara setup `dio` + cookie jar **tidak diulang di sini** — lihat `docs/AUTH-MOBILE-API-INTEGRATION.md` bagian 1–2, wajib dibaca dulu karena setiap endpoint di bawah butuh cookie sesi yang valid.

---

## 0. Ringkasan

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/v1/profile` | Ambil profil akun USER sendiri (HOST atau AGENT) |
| PATCH | `/api/v1/profile` | Update profil akun USER sendiri (**name & phone saja**) |

**Hal penting:** dua endpoint ini **tidak dipengaruhi subscription status HOST** — pakai policy `EXEMPT_ALL`. Artinya: kalau HOST subscription-nya nunggak (`PAST_DUE`/`EXPIRED`/`CANCELLED`), endpoint ini **tetap dapat diakses** oleh HOST maupun AGENT. Ini sengaja, agar user tetap bisa lihat dan update profil sendiri terlepas dari status tagihan (sama seperti `/subscription` yang perlu diakses untuk bayar invoice).

---

## 1. GET /api/v1/profile

Ambil data profil akun user yang sedang login — baik HOST maupun AGENT.

### Request

```
GET /api/v1/profile
```

| Header | Wajib | Value |
|---|---|---|
| Cookie `grooma_session` | Ya (otomatis via cookie jar) | — |
| `Accept` | Disarankan | `application/json` |

Tidak ada query param, tidak ada request body.

### Response `200 OK`

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
      },
      "phone": "08123456789",
      "status": "ACTIVE",
      "createdAt": "2026-09-01T10:30:00.000Z",
      "updatedAt": "2026-10-15T14:20:00.000Z"
    }
  }
}
```

⚠️ **Bentuk response ini BUKAN sama persis seperti `/auth/login`/`/auth/me`** — jangan pakai class/model yang sama tanpa penyesuaian. `/auth/login` dan `/auth/me` memakai serializer lain (`serializeSessionUser`) yang cuma mengembalikan `id, username, name, role, branch` (lihat `AUTH-MOBILE-API-INTEGRATION.md` §3). Endpoint `/profile` ini memakai serializer berbeda (`serializeUser`, dipakai juga oleh manajemen `/users`) yang menambahkan **4 field ekstra**: `phone`, `status`, `createdAt`, `updatedAt`. Kalau model Dart dibuat berdasarkan response login lalu dipakai juga untuk parse `/profile`, keempat field ekstra ini akan hilang/tidak terbaca — buat model `User` dengan field tambahan itu sebagai *optional/nullable*, bukan model yang identik dengan hasil login.

Catatan per field:

| Field | Isi |
|---|---|
| `id` | Mongo ObjectId |
| `username` | Username login (lowercase, immutable) |
| `name` | Nama tampilan (bisa di-edit via PATCH) |
| `role` | `"HOST" \| "AGENT"` — immutable, tidak bisa diubah via profile endpoint |
| `branch` | `{ id, name } \| null` — selalu terisi untuk AGENT, selalu `null` untuk HOST; immutable |
| `phone` | Nomor telepon (bisa di-edit via PATCH), bisa kosong/`null` |
| `status` | `"ACTIVE" \| "INACTIVE"` — immutable (hanya admin/HOST untuk user lain yang bisa nonaktifkan) |
| `createdAt`, `updatedAt` | Timestamp |

---

## 2. PATCH /api/v1/profile

Update data profil akun user sendiri. **Hanya field `name` dan `phone` yang boleh diubah** — sisanya immutable lewat endpoint ini.

### Request

```
PATCH /api/v1/profile
Content-Type: application/json

{
  "name": "Budi Santoso Wijaya",
  "phone": "08987654321"
}
```

| Header | Wajib | Value |
|---|---|---|
| `Content-Type` | Ya | `application/json` |
| Cookie `grooma_session` | Ya (otomatis via cookie jar) | — |

Request body (keduanya optional, strict):

| Field | Tipe | Aturan | Catatan |
|---|---|---|---|
| `name` | `string` | 1–100 karakter setelah trim | Optional — kalau tidak dikirim, tidak ada yang berubah |
| `phone` | `string` | 0–32 karakter setelah trim | Optional, bisa kosong atau dikirim sebagai `""` |

Field lain seperti `role`, `branch`, `username`, `status` **akan ditolak dengan 400** kalau dicoba dikirim — schema pakai `.strict()` yang memang menegaskan hanya `name`/`phone` saja yang diterima.

### Response `200 OK`

Bentuk response sama persis seperti GET `/profile` — seluruh data user setelah perubahan:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "671234abcd5678ef90123456",
      "username": "budi_agent",
      "name": "Budi Santoso Wijaya",
      "role": "AGENT",
      "branch": {
        "id": "66ffaa0011223344556677aa",
        "name": "Cabang Kemang"
      },
      "phone": "08987654321",
      "status": "ACTIVE",
      "createdAt": "2026-09-01T10:30:00.000Z",
      "updatedAt": "2026-10-15T15:45:00.000Z"
    }
  }
}
```

---

## 3. Status Code & Error Handling

| Status | `error.code` | Kapan terjadi |
|---|---|---|
| `200` | — | Request sukses (GET atau PATCH) |
| `400` | `VALIDATION_ERROR` | (PATCH saja) Field tidak sesuai schema — `name` kosong, panjang > batas, ada field selain `name`/`phone`, atau body bukan JSON |
| `401` | `UNAUTHENTICATED` | Cookie sesi tidak ada/kedaluwarsa/dicabut — sama seperti endpoint lain (lihat `AUTH-MOBILE-API-INTEGRATION.md`) |
| `500` | `INTERNAL_ERROR` | Error tak terduga di server |

Tidak ada `403` — kedua endpoint tidak punya authorization rule apapun selain "harus login" (tidak ada role-based gating, tidak ada subscription gating).

---

## 4. Contoh Skenario Flutter

### 4.1. Tampilkan Profil Saat App Dibuka

Saat splash screen atau setelah login sukses, panggil `GET /profile` dan simpan hasilnya ke state management (riverpod/provider/bloc), gunakan data untuk:
- Tampilkan nama user di header/profile page
- Verifikasi role dari `data.user.role` untuk navigasi (ini backup dari data sesi login — tidak perlu hit API lagi cuma untuk role check)
- Tampilkan branch name kalau AGENT (dari `data.user.branch.name`)

```dart
final profile = await dio.get('/profile');
final userData = profile.data['data']['user'];
// simpan ke state
```

### 4.2. Edit Profil

Di halaman profile, sediakan form untuk edit `name` dan `phone`:

```dart
final response = await dio.patch(
  '/profile',
  data: {
    'name': nameController.text.trim(),
    'phone': phoneController.text.trim(),
  },
);
final updatedUser = response.data['data']['user'];
// update state, refresh UI
```

Catatan:
- `phone` bisa dikosongkan (kirim `""` atau tidak dikirim sama-sama boleh).
- Jangan coba-coba edit `username`/`role`/`branch`/`status` lewat endpoint ini — akan ditolak 400.
- Ganti password ada di endpoint terpisah: `POST /auth/change-password` (di luar scope dokumen ini).

### 4.3. Tangani Koneksi Offline

Profile adalah data yang jarang berubah di saat normal (tidak seperti transaksi yang constant update). Pola yang masuk akal:
- Fetch saat app start (splash screen) dan cache di `SharedPreferences`/`Hive`/database lokal.
- Tampilkan versi cache kalau offline.
- Beri user tombol "Refresh Profil" untuk hit API manual.
- Cek session validity dengan `GET /auth/me` (endpoint terpisah) saat start, jangan andalkan GET `/profile` untuk session validation — `/auth/me` dibuat khusus untuk itu.

---

## 5. Integrasi dengan Modul Lain

- **Pasca-Login:** Data dari `POST /auth/login` adalah **subset** dari `GET /profile` (lihat peringatan di §1) — boleh dipakai sebagai state sementara sebelum `GET /profile` sempat dipanggil, tapi begitu `GET /profile` berhasil, timpa state dengan hasilnya supaya `phone`/`status`/timestamp ikut terisi.
- **Sebelum Ganti Password:** Ambil profile dulu (atau sudah tersimpan di state) untuk konfirmasi username sebelum user masukkan `currentPassword` di `POST /auth/change-password`.
- **Sebelum Logout:** Tidak perlu fetch profile lagi — tinggal panggil `POST /auth/logout`, state sudah ada dari login/splash screen sebelumnya.

---

## 6. Catatan Implementasi

- Kedua endpoint ini **tidak perlu cek subscription HOST sebelum tampil di UI** — sudah dijamin backend tidak pernah balik 402 untuk kedua endpoint ini.
- Validasi `name` dan `phone` sudah jadi tanggung jawab backend — Flutter bisa melakukan pre-validation untuk UX (lihat aturan di §2), tapi backend validasi tetap jalan dan menolak kalau ada yang janggal.
- `phone` bukan email, bukan username — bisa duplikat antar user di sistem (field ini bukan unique index).
- Field yang tidak boleh diubah (`username`, `role`, `branch`, `status`) tidak usah ditampilkan di form edit — lihat saja, jangan ajarkan user bisa ubah.
