# Replace хийх файл

Project root дээрээс дараах файлуудыг яг энэ zip доторхтой соль:

- app/layout.tsx
- app/page.tsx
- app/globals.css
- components/Card.tsx
- next.config.mjs
- tsconfig.json

Дараа нь:

```bash
rm -rf .next
npm run dev
```

Анхаарах:
- Tailwind хэрэглэхгүй тул PostCSS/Tailwind алдаа гарахгүй.
- app/layout.tsx, app/globals.css дутуу байсан асуудлыг бүрэн нөхнө.
- @/components/Card alias-д tsconfig.json дотор paths нэмсэн.
