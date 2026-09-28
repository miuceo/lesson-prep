"""Vazifa API — FastAPI + SQLite (Turso online).

Run locally:   uvicorn main:app --reload
API docs:      http://localhost:8000/docs
"""

import os
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

import database as db
from database import fetch_all, fetch_one, get_conn

Status = Literal["todo", "in_progress", "done"]
Priority = Literal["low", "medium", "high"]
Color = Literal["orange", "blue", "green", "dark", "gray"]
SortBy = Literal["due", "priority", "created", "title"]


# ---------- Schemas ----------

class Schema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class TaskCreate(Schema):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=5000)
    status: Status = "todo"
    priority: Priority = "medium"
    due_date: Optional[date] = None
    project_id: Optional[int] = None


class TaskUpdate(Schema):
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=5000)
    status: Optional[Status] = None
    priority: Optional[Priority] = None
    due_date: Optional[date] = None
    project_id: Optional[int] = None


class ProjectCreate(Schema):
    name: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=500)
    color: Color = "orange"


class ProjectUpdate(Schema):
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    description: Optional[str] = Field(default=None, max_length=500)
    color: Optional[Color] = None


# ---------- App ----------

@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()  # creates tables (and demo data) if they don't exist yet
    yield


app = FastAPI(title="Vazifa API", version="1.1.0", lifespan=lifespan)

origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
    max_age=86400,  # browsers cache the CORS preflight for a day
)
app.add_middleware(GZipMiddleware, minimum_size=500)


TASK_SELECT = """
    SELECT t.*, p.name AS project_name, p.color AS project_color
    FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
"""
TASK_ORDER = {
    "due": "t.due_date IS NULL, t.due_date, t.id",
    "priority": "CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, t.due_date",
    "created": "t.created_at DESC, t.id DESC",
    "title": "t.title COLLATE NOCASE",
}


def _task_or_404(conn, task_id: int) -> dict:
    task = fetch_one(conn, TASK_SELECT + " WHERE t.id = ?", (task_id,))
    if task is None:
        raise HTTPException(404, "Vazifa topilmadi")
    return task


def _check_project(conn, project_id: Optional[int]) -> None:
    if project_id is not None and fetch_one(conn, "SELECT id FROM projects WHERE id = ?", (project_id,)) is None:
        raise HTTPException(400, "Bunday loyiha mavjud emas")


def _to_db(data: dict) -> dict:
    if isinstance(data.get("due_date"), date):
        data["due_date"] = data["due_date"].isoformat()
    return data


# ---------- Health & database info ----------

@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok"}


@app.get("/api/db", tags=["system"])
def db_info():
    """Which database is in use and how many rows it has — handy for the lesson demo."""
    with get_conn() as conn:
        rows = {
            "projects": fetch_one(conn, "SELECT COUNT(*) AS n FROM projects")["n"],
            "tasks": fetch_one(conn, "SELECT COUNT(*) AS n FROM tasks")["n"],
        }
        version = fetch_one(conn, "SELECT sqlite_version() AS v")["v"]
    info = {"engine": f"SQLite {version}", "mode": db.MODE, "rows": rows}
    if db.MODE == "turso":
        info["where"] = db.TURSO_URL.split("://")[-1]  # host only, never the token
        info["persistent"] = True
    else:
        info["where"] = str(db.DB_PATH)
        info["size_kb"] = round(db.DB_PATH.stat().st_size / 1024, 1) if db.DB_PATH.exists() else 0
        info["persistent"] = db.MODE == "file"
    if db.MODE == "tmp":
        info["warning"] = "Vercel'da TURSO_DATABASE_URL o'rnatilmagan: ma'lumotlar saqlanib qolmaydi!"
    return info


@app.get("/api/db/download", tags=["system"])
def db_download():
    """Download the local .db file (only when running with a SQLite file, not Turso)."""
    if db.MODE != "file":
        raise HTTPException(404, "Turso ishlatilmoqda: bazani Turso saytida ko'ring")
    with get_conn() as conn:
        conn.execute("PRAGMA wal_checkpoint(FULL)")  # flush recent writes into the file
    return FileResponse(db.DB_PATH, filename="vazifa.db", media_type="application/x-sqlite3")


# ---------- Tasks ----------

@app.get("/api/tasks", tags=["tasks"])
def list_tasks(
    status: Optional[Status] = None,
    priority: Optional[Priority] = None,
    project_id: Optional[int] = None,
    q: Optional[str] = Query(default=None, max_length=100),
    sort: SortBy = "due",
):
    where, params = [], []
    if status:
        where.append("t.status = ?"); params.append(status)
    if priority:
        where.append("t.priority = ?"); params.append(priority)
    if project_id is not None:
        where.append("t.project_id = ?"); params.append(project_id)
    if q:
        where.append("(t.title LIKE ? OR t.description LIKE ? OR p.name LIKE ?)")
        params += [f"%{q}%"] * 3
    sql = TASK_SELECT
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY " + TASK_ORDER[sort]
    with get_conn() as conn:
        return fetch_all(conn, sql, params)


@app.post("/api/tasks", status_code=201, tags=["tasks"])
def create_task(body: TaskCreate):
    data = _to_db(body.model_dump())
    with get_conn() as conn:
        _check_project(conn, data["project_id"])
        cur = conn.execute(
            """INSERT INTO tasks (title, description, status, priority, due_date, project_id)
               VALUES (:title, :description, :status, :priority, :due_date, :project_id)""",
            data,
        )
        return _task_or_404(conn, cur.lastrowid)


@app.get("/api/tasks/{task_id}", tags=["tasks"])
def get_task(task_id: int):
    with get_conn() as conn:
        return _task_or_404(conn, task_id)


@app.patch("/api/tasks/{task_id}", tags=["tasks"])
def update_task(task_id: int, body: TaskUpdate):
    data = _to_db(body.model_dump(exclude_unset=True))
    for required in ("title", "status", "priority"):
        if required in data and data[required] is None:
            raise HTTPException(422, f"'{required}' bo'sh bo'lishi mumkin emas")
    with get_conn() as conn:
        _task_or_404(conn, task_id)
        if "project_id" in data:
            _check_project(conn, data["project_id"])
        if data:
            sets = ", ".join(f"{k} = :{k}" for k in data)
            conn.execute(
                f"UPDATE tasks SET {sets}, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') "
                "WHERE id = :id",
                {**data, "id": task_id},
            )
        return _task_or_404(conn, task_id)


@app.delete("/api/tasks/{task_id}", status_code=204, tags=["tasks"])
def delete_task(task_id: int):
    with get_conn() as conn:
        if conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,)).rowcount == 0:
            raise HTTPException(404, "Vazifa topilmadi")
    return Response(status_code=204)


# ---------- Projects ----------

PROJECT_SELECT = """
    SELECT p.*,
           COUNT(t.id) AS task_count,
           COALESCE(SUM(t.status = 'done'), 0) AS done_count
    FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
"""


def _project_or_404(conn, project_id: int) -> dict:
    project = fetch_one(conn, PROJECT_SELECT + " WHERE p.id = ? GROUP BY p.id", (project_id,))
    if project is None:
        raise HTTPException(404, "Loyiha topilmadi")
    return project


@app.get("/api/projects", tags=["projects"])
def list_projects():
    with get_conn() as conn:
        return fetch_all(conn, PROJECT_SELECT + " GROUP BY p.id ORDER BY p.id")


@app.post("/api/projects", status_code=201, tags=["projects"])
def create_project(body: ProjectCreate):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO projects (name, description, color) VALUES (:name, :description, :color)",
            body.model_dump(),
        )
        return _project_or_404(conn, cur.lastrowid)


@app.patch("/api/projects/{project_id}", tags=["projects"])
def update_project(project_id: int, body: ProjectUpdate):
    data = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    with get_conn() as conn:
        _project_or_404(conn, project_id)
        if data:
            sets = ", ".join(f"{k} = :{k}" for k in data)
            conn.execute(f"UPDATE projects SET {sets} WHERE id = :id", {**data, "id": project_id})
        return _project_or_404(conn, project_id)


@app.delete("/api/projects/{project_id}", status_code=204, tags=["projects"])
def delete_project(project_id: int):
    """Deletes the project. Its tasks stay, without a project."""
    with get_conn() as conn:
        # Done explicitly (not only via ON DELETE SET NULL) so it works the same on Turso.
        conn.execute("UPDATE tasks SET project_id = NULL WHERE project_id = ?", (project_id,))
        if conn.execute("DELETE FROM projects WHERE id = ?", (project_id,)).rowcount == 0:
            raise HTTPException(404, "Loyiha topilmadi")
    return Response(status_code=204)


# ---------- Dashboard ----------

@app.get("/api/stats", tags=["dashboard"])
def stats():
    today = date.today().isoformat()
    with get_conn() as conn:
        return fetch_one(
            conn,
            """SELECT COUNT(*) AS total,
                      COALESCE(SUM(status = 'todo'), 0)        AS todo,
                      COALESCE(SUM(status = 'in_progress'), 0) AS in_progress,
                      COALESCE(SUM(status = 'done'), 0)        AS done,
                      COALESCE(SUM(status != 'done' AND due_date < ?), 0) AS overdue
               FROM tasks""",
            (today,),
        )


# ---------- Local development: one server for frontend + backend ----------
# http://localhost:8000 shows the app. Skipped on Vercel, where the frontend is its own project.

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.is_dir() and not db.ON_VERCEL:
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
