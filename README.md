# Test platformasi

Kompyuter (Windows/Mac/Linux) va Android'ga o'rnatiladigan test dasturi (PWA).
Faqat login va parol bilan kiriladi. Ikki toifa: **Admin** va **Foydalanuvchi**.

## Admin kirishi
- Login: `Asteria`
- Parol: `Asteria1234`

(Birinchi ishga tushishda avtomatik yaratiladi. Kirgach, Profil bo'limidan parolni almashtiring.)

## Imkoniyatlar
**Admin:** foydalanuvchi qo'shish / parolni yangilash / bloklash / o'chirish, har bir foydalanuvchi profilini tahlil qilish
(o'rtacha natija, dinamika grafigi, fanlar bo'yicha natija, eng ko'p xato qilingan savollar, testlar tarixi),
fan qo'shish, savollarni Word (.docx) yoki Excel (.xlsx) fayldan yuklash, qo'lda savol qo'shish, reyting.

**Foydalanuvchi:** fan tanlash, test yechish (har gal bazadan 25 ta aralash savol, 40 daqiqa, taymer),
variantlar har safar aralashtiriladi, test oxirida natija va "Xato javoblar" oynasi, reyting, shaxsiy statistika.

## Savol fayli shakli
**Word (.docx)** — sizning namunangizdagidek:
```
Savol matni
========
To'g'ri javob        <- BIRINCHI variant doim to'g'ri javob
========
Variant B
========
Variant C
========
Variant D
++++++++
Keyingi savol ...
```
**Excel (.xlsx)** — har qatorda: `Savol | To'g'ri javob | B | C | D`. Ixtiyoriy 6-ustunga to'g'ri javob harfi (A-D) yozish mumkin.
Namuna faylni Admin → Fanlar → fan ichidan yuklab olish mumkin.

## Kompyuterda ishga tushirish (eng oson yo'l)
1. Node.js o'rnating (nodejs.org, "LTS" versiyasi) — bir marta
2. Zip'ni oching va **start.bat** (Windows) yoki **start.command** (Mac) faylini ikki marta bosing
3. Brauzer o'zi ochiladi. Kirish oynasidagi **«Ilovani o'rnatish»** tugmasini bosing — tamom

(Qo'lda: `npm install`, `npm start`, so'ng `http://localhost:3000`.)

## Internetga chiqarish — Railway.app (tavsiya)
1. Zip'ni oching. **Ichidagi hamma fayl va papkalarni** (`server`, `public`, `package.json`, ...) GitHub'dagi yangi repo'ga yuklang
   (Add file -> Upload files). `package.json` repo'ning eng yuqori qatlamida bo'lishi shart.
2. Railway: **New Project -> Deploy from GitHub repo** -> repo'ni tanlang.
3. Servisni oching: **Settings -> Networking -> Generate Domain** (link shu yerda chiqadi).
4. **Ma'lumotlar saqlanishi uchun:** servisda o'ng tugma / **+ New -> Volume** -> **Mount path: `/data`**.
   (Volume ulansa, dastur ma'lumotlarni o'zi shu yerga yozadi, qo'shimcha sozlash kerak emas.)
5. Ixtiyoriy: **Variables** bo'limida `ADMIN_PASSWORD` qo'shib, admin parolini o'zgartiring.
6. Linkni Chrome/Edge'da oching, kirish oynasidagi **«Ilovani o'rnatish»** tugmasini bosing.

Android: xuddi shu link, Chrome'da. Boshqa foydalanuvchilarga ham shu linkni bering.

Muqobil: Render.com (`render.yaml` tayyor) yoki MongoDB (`MONGODB_URI` o'zgaruvchisi).

## Tekshirish
`npm test` — serverni avtomatik sinab ko'radi.
