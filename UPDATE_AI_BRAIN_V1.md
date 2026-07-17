# AI Brain v1 — шинэчлэл

## Нэмэгдсэн
- `lib/risk.ts` — Injury, availability, minutes, rotation, news risk тооцно.
- `lib/confidence.ts` — Player confidence оноог risk profile-той уялдуулна.
- `lib/explain.ts` — Эерэг дохио болон анхааруулгын reason key гаргана.
- `lib/decision.ts` — Дээрх engine-үүдийг нэгтгэн captain, transfer, top target шийдвэрт ашиглана.
- Нүүр хуудсанд captain-ийн AI reason болон risk breakdown харагдана.
- Монгол UI дээр англи FPL нэр томьёоны ард Монгол тайлбар нэмэгдсэн.

## Суулгах
1. Zip-ийг задлана.
2. Одоогийн төслийн source файлуудыг бүрэн replace хийнэ.
3. `.env.local`-оо хуучин төслөөсөө шаардлагатай бол буцааж хуулна.
4. `npm install`
5. `npm run dev`
6. GitHub руу push хийхээс өмнө `npm run build` ажиллуулна.

## Шалгалт
`npm run build` амжилттай болсон.
