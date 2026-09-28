# WALKTHROUGH — "Vazifa" ilovasini Vercel + Turso'ga deploy qilish

Bu qo'llanma ilovani **kompyuteringizdan internetga** chiqarishni qadam-baqadam ko'rsatadi.
Videoni yozishda shu tartibda borsangiz bo'ladi. Umumiy vaqt: **20–30 daqiqa**.

---

## 0. Umumiy rasm

```
                 INTERNETDA (deploydan keyin)
┌──────────────┐     ┌─────────────────────┐     ┌─────────────────────┐     ┌───────────────────┐
│ 📱 Telefon / │ ──▶ │  Vercel: FRONTEND   │ ──▶ │  Vercel: BACKEND    │ ──▶ │  Turso: DATABASE  │
│   brauzer    │     │  (HTML, CSS, JS)    │     │  (Python FastAPI)   │     │  (SQLite bulutda) │
└──────────────┘     └─────────────────────┘     └─────────────────────┘     └───────────────────┘

                 KOMPYUTERDA (localhost)
┌──────────────┐     ┌──────────────────────────────────────┐     ┌──────────────────────────┐
│ 💻 Brauzer   │ ──▶ │  http://localhost:8000               │ ──▶ │  backend/data/vazifa.db  │
│              │     │  (frontend + backend bitta serverda) │     │  (oddiy SQLite fayl)     │
└──────────────┘     └──────────────────────────────────────┘     └──────────────────────────┘
```

Bitta kod ikki joyda ishlaydi. Backend o'zi aniqlaydi:

| Sharoit | Qaysi database ishlatiladi |
|---|---|
| `TURSO_DATABASE_URL` berilgan (Vercel'da) | **Turso** — ma'lumot doimiy saqlanadi |
| Berilmagan (kompyuterda) | **`backend/data/vazifa.db`** — oddiy SQLite fayl |

**Nega Turso?** Vercel backendni doim yoqiq server sifatida emas, qisqa muddatli **funksiya** sifatida ishga tushiradi. U yerda fayl saqlab bo'lmaydi: fayl tez-tez o'chib ketadi. Turso esa SQLite'ning **internetdagi, doimiy** versiyasi. SQL tili, jadvallar va `schema.sql` xuddi o'sha-o'sha.

---

## Kerakli narsalar

- [ ] **GitHub** akkaunti — [github.com](https://github.com)
- [ ] **Vercel** akkaunti — [vercel.com](https://vercel.com) (GitHub bilan kiriladi)
- [ ] **Turso** akkaunti — [turso.tech](https://turso.tech) (GitHub bilan kiriladi)
- [ ] Kompyuterda **Git** va **Python 3.10+** o'rnatilgan

Hammasi **bepul**, karta so'ralmaydi.

---

## 1-QADAM. Kompyuterda ishlashini tekshirish

Terminalni `vazifa-app/backend` papkasida oching:

```bash
python -m venv .venv
```

Windows:
```bash
.venv\Scripts\activate
```

macOS / Linux:
```bash
source .venv/bin/activate
```

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

Brauzerda **http://localhost:8000** ni oching. Vazifalar ko'rinsa, hammasi joyida.

Qo'shimcha tekshiruv: **http://localhost:8000/api/db** sahifasida `"mode": "file"` yozuvi chiqadi. Demak, hozir kompyuterdagi SQLite fayl ishlatilmoqda.

To'xtatish: terminalda **Ctrl + C**.

---

## 2-QADAM. Kodni GitHub'ga yuklash

1. GitHub → o'ng yuqorida **+** → **New repository**.
2. **Repository name:** `vazifa-app` → **Public** yoki **Private** → **Create repository**.
3. Terminalni `vazifa-app` papkasida (backend emas, bitta yuqorida) oching:

```bash
git init
git add .
git commit -m "Vazifa: frontend + FastAPI + SQLite/Turso"
git branch -M main
git remote add origin https://github.com/USERNAME/vazifa-app.git
git push -u origin main
```

`USERNAME` o'rniga GitHub foydalanuvchi nomingizni yozing.

✅ **Tekshirish:** GitHub sahifasini yangilang. `frontend/`, `backend/`, `WALKTHROUGH.md` ko'rinishi kerak.
`.venv/` va `vazifa.db` **ko'rinmasligi** kerak. `.gitignore` ularni ataylab yuklamaydi.

---

## 3-QADAM. Turso'da database yaratish

1. [turso.tech](https://turso.tech) → **Sign Up** → **Continue with GitHub**.
2. Dashboard → **Create Database** (yoki **+ New Database**).
3. **Name:** `vazifa`
4. **Location / Group:** backend ishlaydigan joyga yaqin hududni tanlang.
   Vercel funksiyalari odatda **Washington (iad1)** da ishlaydi. Shuning uchun Turso'da **AWS US East (Virginia)** eng tez variant.
5. **Create** tugmasini bosing.

Endi ikkita narsani nusxalab oling. Ular 4-qadamda kerak bo'ladi:

**URL:**
- `vazifa` bazasini oching → **URL** yonidagi nusxalash belgisi.
- Ko'rinishi: `libsql://vazifa-USERNAME.aws-us-east-1.turso.io`

**Token:**
- Baza sahifasida **Create Token** (yoki **Generate Token**) tugmasini bosing.
- **Expiration:** `Never`
- **Access:** `Read & Write` (yozish ham kerak, faqat o'qish emas)
- Chiqqan uzun matnni nusxalang. U **faqat bir marta** ko'rsatiladi.

> ⚠️ **Token — bu parol.** Uni kodga yozmang, GitHub'ga yuklamang, videoda ko'rsatmang.
> Faqat Vercel'ning **Environment Variables** bo'limiga qo'yiladi.
> Tasodifan ko'rinib qolsa: Turso'da tokenni **o'chiring** va yangisini yarating.

> Jadvallarni **yaratish shart emas**. Backend birinchi marta ishga tushganda `schema.sql` ni o'zi bajaradi va demo ma'lumotlarni qo'shadi.

---

## 4-QADAM. Backend → Vercel

1. [vercel.com](https://vercel.com) → **Add New…** → **Project**.
2. `vazifa-app` repozitoriysi yonida **Import**.
3. Sozlamalar:

   | Maydon | Qiymat |
   |---|---|
   | **Project Name** | `vazifa-api` |
   | **Root Directory** | **Edit** → `backend` ni tanlang → **Continue** |
   | **Framework Preset** | `FastAPI` (o'zi aniqlaydi, aniqlamasa qo'lda tanlang) |
   | **Build / Output settings** | tegmang |

4. **Environment Variables** bo'limini oching va ikkitasini qo'shing:

   | Key | Value |
   |---|---|
   | `TURSO_DATABASE_URL` | `libsql://vazifa-....turso.io` (3-qadamdagi URL) |
   | `TURSO_AUTH_TOKEN` | 3-qadamdagi token |

5. **Deploy** → 1–2 daqiqa kuting → **Continue to Dashboard**.
6. **Domains** ostidagi manzilni nusxalang, masalan: `https://vazifa-api.vercel.app`

✅ **Tekshirish** (brauzerda oching):

| Manzil | Kutilgan natija |
|---|---|
| `https://vazifa-api.vercel.app/api/health` | `{"status":"ok"}` |
| `https://vazifa-api.vercel.app/api/db` | `"mode": "turso"`, `"persistent": true`, `"tasks": 9` |
| `https://vazifa-api.vercel.app/docs` | API hujjatlari sahifasi |

> `"mode": "tmp"` va `"warning"` chiqsa, Environment Variables noto'g'ri kiritilgan.
> Tuzatish: Vercel → loyiha → **Settings → Environment Variables** → qiymatlarni tekshiring → **Deployments** → oxirgi deploy yonidagi **⋯** → **Redeploy**.
> O'zgaruvchilar faqat qayta deploydan keyin kuchga kiradi.

---

## 5-QADAM. Frontendni backendga ulash

`frontend/config.js` faylini oching va **bitta qatorni** to'ldiring:

```js
var BACKEND_URL = "https://vazifa-api.vercel.app"; // ← 4-qadamdagi manzilingiz
```

Oxirida `/` belgisi qo'ymang. Keyin:

```bash
git add frontend/config.js
git commit -m "Backend manzilini qo'shish"
git push
```

---

## 6-QADAM. Frontend → Vercel

1. Vercel → **Add New…** → **Project** → yana o'sha `vazifa-app` → **Import**.
2. Sozlamalar:

   | Maydon | Qiymat |
   |---|---|
   | **Project Name** | `vazifa` |
   | **Root Directory** | **Edit** → `frontend` → **Continue** |
   | **Framework Preset** | `Other` |
   | **Build / Output settings** | tegmang (bo'sh) |
   | **Environment Variables** | kerak emas |

3. **Deploy** → 20–40 soniya → **Continue to Dashboard** → **Visit**.
4. Manzil taxminan: `https://vazifa.vercel.app`

Endi Vercel'da **ikkita loyiha** bor: `vazifa` (frontend) va `vazifa-api` (backend). Ikkalasi bitta GitHub repodan olinadi.

---

## 7-QADAM. Hammasi ishlayotganini tekshirish (videodagi final)

1. `https://vazifa.vercel.app` ni **telefonda** oching → 9 ta demo vazifa ko'rinadi.
2. **+** → yangi vazifa yozing → **Saqlash**.
3. Kompyuterda `https://vazifa-api.vercel.app/api/db` ni yangilang → `"tasks": 10`.
4. **Turso dashboard** → `vazifa` → **Edit Data** (yoki **Shell**) → `tasks` jadvalida yangi qator turibdi.
   Shell'da quyidagini yozib ham ko'rish mumkin:
   ```sql
   SELECT id, title, status FROM tasks ORDER BY id DESC;
   ```
5. Filtrlarni o'zgartiring. F12 → **Network** tabida `vazifa-api.vercel.app/api/tasks?...` so'rovlari ko'rinadi.
6. **Ertasi kuni** qayta oching. Vazifa hali ham joyida ✅ Turso ma'lumotni doimiy saqlaydi.

Butun zanjir: **Telefon → Vercel (frontend) → Vercel (FastAPI) → Turso (SQLite)**.

---

## 8-QADAM (ixtiyoriy). Backendni faqat o'z saytingiz uchun ochish

Hozir backendga istalgan sayt murojaat qila oladi (`ALLOWED_ORIGINS = *`). Cheklash uchun:

Vercel → `vazifa-api` → **Settings → Environment Variables** → yangi o'zgaruvchi:

| Key | Value |
|---|---|
| `ALLOWED_ORIGINS` | `https://vazifa.vercel.app` |

Keyin **Redeploy** qiling.

---

## Keyinchalik o'zgarish kiritish

Kodni o'zgartiring va quyidagilarni bajaring:

```bash
git add .
git commit -m "O'zgarish tavsifi"
git push
```

Vercel **ikkala loyihani ham** o'zi qayta deploy qiladi (1–2 daqiqa). Turso'dagi ma'lumotlar **o'chmaydi**.

---

## Muammolar va yechimlar

| Belgi | Sabab | Yechim |
|---|---|---|
| Saytda *"Backend manzili sozlanmagan"* | `config.js` da `BACKEND_URL` bo'sh | 5-qadamni bajaring, `git push` |
| *"Server bilan bog'lanib bo'lmadi"* | Manzil noto'g'ri yoki backend ishlamayapti | `.../api/health` ni oching, `BACKEND_URL` ni tekshiring |
| `/api/db` da `"mode": "tmp"` | Turso o'zgaruvchilari yo'q | 4-qadam → Environment Variables → **Redeploy** |
| Backend loglarida `HTTP status 401` | Token noto'g'ri yoki muddati o'tgan | Turso'da yangi token → Vercel'ga qo'ying → **Redeploy** |
| Backend loglarida `SSL` yoki `failed` xatosi | URL xato nusxalangan | URL `libsql://` bilan boshlanib, `.turso.io` bilan tugashi kerak |
| Frontend loyihasida 404 | Root Directory `frontend` emas | **Settings → General → Root Directory** = `frontend` → Redeploy |
| Backend deployi "FastAPI topilmadi" degan xato bilan to'xtaydi | Root Directory `backend` emas | **Root Directory** = `backend` → Redeploy |
| Brauzer konsolida CORS xatosi | `ALLOWED_ORIGINS` noto'g'ri | Manzilni aniq yozing (oxirida `/` siz) yoki `*` qiling |

Backend loglarini ko'rish: Vercel → `vazifa-api` → **Logs**.

---

## Bepul tarif chegaralari

**Vercel Hobby** (oyiga):

| Nima | Chegara |
|---|---|
| Funksiya chaqiruvlari (har bir API so'rov) | 1 000 000 |
| Faol CPU vaqti | 4 soat (database'ni kutish hisoblanmaydi) |
| Trafik | 100 GB |

- Faqat **shaxsiy, notijorat** loyihalar uchun.
- Limitdan oshsangiz, xizmat 30 kungacha to'xtatiladi.

**Turso Free:**

| Nima | Chegara |
|---|---|
| Database'lar soni | 100 |
| Umumiy hajm | 5 GB |
| O'qilgan qatorlar | 500 mln / oy |
| Yozilgan qatorlar | 10 mln / oy |

Bu ilovada bitta sahifa ochilishi taxminan 2–5 ta API so'rov qiladi. Demak, oyiga yuz minglab tashrifga bemalol yetadi.

---

## Videoni yozishdan oldin — checklist

- [ ] Brauzer zoom **100%** (Ctrl + 0).
- [ ] Tablar tayyor: GitHub repo · Vercel dashboard · Turso dashboard · `vazifa.vercel.app` · `vazifa-api.vercel.app/docs`.
- [ ] **Token ekranga chiqmasligi** uchun: tokenni oldindan nusxalab qo'ying, Environment Variables maydoniga qo'yishda kadrni yoping yoki keyin videoda xiralashtiring.
- [ ] Telefon ekranini ko'rsatish usuli tayyor (yoki brauzerda F12 → mobil ko'rinish).
- [ ] Demo ma'lumotni yangilash kerak bo'lsa: Turso Shell'da quyidagini bajaring.
  ```sql
  DELETE FROM tasks;
  DELETE FROM projects;
  DELETE FROM app_meta;
  ```
  Keyin Vercel'da backendni **Redeploy** qiling. Birinchi so'rovda demo ma'lumotlar qaytadan qo'shiladi.
