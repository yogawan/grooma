# Scalar BFF Docs — Implementasi

Dokumentasi OpenAPI untuk seluruh API routes (BFF Next.js) project ini di-generate via **Scalar API Reference**, bisa diakses di `/scalar/docs`.

## Struktur File

```
app/scalar/docs/
├── route.ts          # Entry point: GET handler via ApiReference({ content: {...} })
├── _config.ts         # info, servers, security, tags (metadata OpenAPI)
├── _schemas.ts         # components.securitySchemes + components.schemas (model reusable)
└── paths/
    ├── pemohon.ts     # path definitions role pemohon
    ├── operator.ts    # path definitions role operator
    ├── pimpinan.ts    # path definitions role pimpinan
    ├── upload.ts      # path /api/upload
    └── guest.ts       # path publik (artikel, tanpa auth)
```

`route.ts` meng-assemble semuanya jadi satu OpenAPI 3.1 spec:

```ts
export const GET = ApiReference({
  content: {
    openapi: "3.1.0",
    info, servers, security, tags,
    components: { securitySchemes, schemas },
    paths: { ...pemohonPaths, ...operatorPaths, ...pimpinanPaths, ...uploadPaths, ...guestPaths },
  },
});
```

## Pembagian Tanggung Jawab

| File | Isi |
|---|---|
| `_config.ts` | `info` (title/desc/version), `servers` (staging/dev/prod URL), `security` (bearerAuth global), `tags` (dikelompokkan per role dengan prefix `(Pemohon)`, `(Operator)`, `(Pimpinan)`, `Upload`, `(Guest)`) |
| `_schemas.ts` | `securitySchemes.bearerAuth` (JWT Bearer) + schema reusable: `User`, `CloudinaryFile`, `Request`, `Stats`, `Report`, `Article`, `Error` — dipakai lewat `$ref: "#/components/schemas/..."` |
| `paths/*.ts` | Satu object per role, key = path URL, value = method (`get`/`post`/`patch`/`delete`) berisi `tags`, `summary`, `operationId`, `requestBody`, `responses` |

## Konvensi Penulisan Path

Setiap endpoint di `paths/*.ts` mengikuti pola yang sama:
- `tags` — merujuk ke tag yang didefinisikan di `_config.ts` (grouping di UI Scalar)
- `operationId` — camelCase unik, contoh `changeEmailPemohon`, `loginOperator`
- `security: [{ bearerAuth: [] }]` — di-set per-endpoint kecuali route publik (login, guest article)
- `requestBody` — schema inline untuk request sederhana, atau `$ref` ke `_schemas.ts` untuk entity besar (Request, Report, Article)
- `responses` — selalu mendokumentasikan kode realistis sesuai handler-nya: `200/201`, `400`, `401`, `403`, `404`, `409` (kalau ada conflict, mis. email dipakai), `500`

Field-field panjang (enum `kategoriEnum`, shape `anggotaTimItem`, dll) diekstrak jadi konstanta lokal di atas file path-nya supaya tidak duplikasi di banyak endpoint.

## Status Saat Ini (working tree)

Baru ditambahkan endpoint **change-email** dan **change-password** untuk ketiga role (masing-masing +105 baris di `pemohon.ts`, `operator.ts`, `pimpinan.ts`), menyusul API route baru:

```
/api/{pemohon,operator,pimpinan}/profile/change-email   (PATCH)
/api/{pemohon,operator,pimpinan}/profile/change-password (PATCH)
```

Pola dokumentasinya konsisten di ketiga file: `change-email` butuh `newEmail` (format UTY) + `currentPassword` → `409` jika email dipakai akun lain; `change-password` butuh `currentPassword` + `newPassword` (`minLength: 8`) → tidak ada `409`.

## Aturan Penting

> Dari `CLAUDE.md`: **`route.ts` harus selalu disinkronkan manual** setiap kali ada field model atau endpoint baru/berubah — tidak ada generator otomatis dari Mongoose schema atau dari route handler ke OpenAPI spec. Artinya setiap PR yang menambah/mengubah API route wajib menyertakan update di `app/scalar/docs/paths/<role>.ts` (dan `_schemas.ts` kalau ada field model baru).
