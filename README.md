# Vazifa — vazifalar menejeri (Full-stack demo)

Google Stitch'da chizilgan dizayn asosida qurilgan to'liq ilova:

| Qism | Texnologiya | Internetda |
|---|---|---|
| **Frontend** | HTML + CSS + JavaScript (freymvorksiz, build kerak emas) | **Vercel** |
| **Backend** | Python **FastAPI** | **Vercel** (Python funksiya) |
| **Database** | **SQLite** | Kompyuterda: `backend/data/vazifa.db` fayl · Internetda: **Turso** |

👉 **Internetga chiqarish (deploy): [WALKTHROUGH.md](WALKTHROUGH.md)**

```
vazifa-app/
├── WALKTHROUGH.md       ← Vercel + Turso deploy qo'llanmasi
├── frontend/            ← Vercel loyihasi #1 (Root Directory: frontend)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── config.js        ← BACKEND_URL shu yerda (1 qator)
│   └── vercel.json
└── backend/             ← Vercel loyihasi #2 (Root Directory: backend)
    ├── main.py          ← API (barcha endpointlar)
    ├── database.py      ← Turso yoki SQLite fayl — o'zi tanlaydi
    ├── schema.sql       ← jadvallar (projects, tasks)
    └── requirements.txt
```

---

## Kompyuterda ishga tushirish

Kerak: **Python 3.10+**. Terminal `vazifa-app/backend` papkasida:

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

| Manzil | Nima |
|---|---|
| http://localhost:8000 | Ilovaning o'zi |
| http://localhost:8000/docs | API hujjatlari — har bir endpointni shu yerda sinash mumkin |
| http://localhost:8000/api/db | Qaysi database ishlatilayotgani va nechta qator borligi |

Birinchi ishga tushganda `backend/data/vazifa.db` **o'zi yaratiladi** va 3 ta loyiha + 9 ta demo vazifa bilan to'ldiriladi.
Bazani boshidan boshlash: serverni to'xtating va `backend/data/` papkasini o'chiring.

> `frontend/index.html` ni ikki marta bosib yoki VS Code **Live Server** bilan ochsangiz ham ishlaydi (backend yoqiq bo'lsa). Sahifa o'zi `http://localhost:8000` ga ulanadi.

---

## Database'ni darsda ko'rsatish

**Kompyuterda (SQLite fayl):**
1. `/api/db` — vazifa qo'shing, sahifani yangilang → `tasks` soni oshadi.
2. `/api/db/download` — `vazifa.db` faylni yuklab oladi. Uni [DB Browser for SQLite](https://sqlitebrowser.org/) dasturida oching.
3. `/docs` — `POST /api/tasks` → **Try it out** → **Execute**.
4. F12 → **Network**: filtr yoki qidiruv har safar `GET /api/tasks?priority=high&sort=due` kabi so'rov yuboradi.

**Internetda (Turso):** `https://<backend>.vercel.app/api/db` → `"mode": "turso"`. Jadvallarni Turso dashboard'da ko'rasiz.

Jadvallar tuzilishi `backend/schema.sql` faylida.

---

## API qisqacha

| Metod | Yo'l | Vazifasi |
|---|---|---|
| GET | `/api/tasks?status=&priority=&project_id=&q=&sort=` | Vazifalar: filtr, qidiruv, saralash |
| POST | `/api/tasks` | Yangi vazifa |
| GET / PATCH / DELETE | `/api/tasks/{id}` | Bitta vazifa: o'qish / o'zgartirish / o'chirish |
| GET / POST | `/api/projects` | Loyihalar ro'yxati / yangi loyiha |
| PATCH / DELETE | `/api/projects/{id}` | Loyihani o'zgartirish / o'chirish |
| GET | `/api/stats` | Bosh sahifa raqamlari |
| GET | `/api/health` | Server ishlayaptimi |
| GET | `/api/db` | Qaysi database, nechta qator |
| GET | `/api/db/download` | `.db` faylni yuklab olish (faqat kompyuterda) |

## Environment variables (backend)

| O'zgaruvchi | Qayerda | Ma'nosi |
|---|---|---|
| `TURSO_DATABASE_URL` | Vercel | Turso baza manzili (`libsql://...turso.io`). Bo'lmasa — SQLite fayl |
| `TURSO_AUTH_TOKEN` | Vercel | Turso kaliti. **Hech qachon GitHub'ga yuklamang** |
| `ALLOWED_ORIGINS` | ixtiyoriy | CORS: qaysi saytlar backendga murojaat qila oladi (standart `*`) |
| `DB_PATH` | ixtiyoriy | Lokal SQLite fayl yo'li (standart `backend/data/vazifa.db`) |
