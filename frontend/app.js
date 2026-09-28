/* Vazifa — frontend (plain JavaScript, no framework) */
(() => {
  'use strict';

  // null = config.js has no backend address yet (e.g. first Vercel deploy)
  const API_URL = window.VAZIFA_API_URL === undefined ? '' : window.VAZIFA_API_URL;
  const API = String(API_URL || '').replace(/\/+$/, '');
  const API_LABEL = API || location.origin;

  // ---------- Constants ----------

  const STATUS = {
    todo: { label: 'Bajarilishi kerak', tone: 'gray' },
    in_progress: { label: 'Jarayonda', tone: 'blue' },
    done: { label: 'Bajarildi', tone: 'green' },
  };
  const STATUSES = ['todo', 'in_progress', 'done'];
  const PRIORITY = {
    low: { label: 'Past', tone: 'green', rank: 2 },
    medium: { label: "O'rta", tone: 'blue', rank: 1 },
    high: { label: 'Yuqori', tone: 'orange', rank: 0 },
  };
  const PRIORITIES = ['low', 'medium', 'high'];
  const COLORS = { orange: '#d97757', blue: '#6a9bcc', green: '#788c5d', dark: '#141413', gray: '#b0aea5' };
  const COLOR_NAMES = { orange: "To'q sariq", blue: "Ko'k", green: 'Yashil', dark: 'Qora', gray: 'Kulrang' };
  const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
  const WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
  const NETWORK_ERROR = "Server bilan bog'lanib bo'lmadi. Qayta urinib ko'ring.";

  // ---------- Small helpers ----------

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('vazifa:' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('vazifa:' + key, JSON.stringify(value)); } catch { /* private mode */ }
    },
  };

  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => isoOf(new Date());
  const parseDay = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };

  function fmtDate(s, long = false) {
    if (!s) return '';
    if (!long) {
      if (s === today()) return 'Bugun';
      if (s === isoOf(new Date(Date.now() + 864e5))) return 'Ertaga';
    }
    const d = parseDay(s);
    const base = `${d.getDate()}-${MONTHS[d.getMonth()]}`;
    return long || d.getFullYear() !== new Date().getFullYear() ? `${base}, ${d.getFullYear()}` : base;
  }
  function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getDate()}-${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const isOverdue = (t) => Boolean(t.due_date) && t.due_date < today() && t.status !== 'done';
  const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  // ---------- State ----------

  const state = {
    projects: [],
    tasks: [],
    status: 'loading', // loading | ready | error
    waking: false,
    error: '',
    view: store.get('view', 'board'), // board | list
    tab: 'todo', // visible column on mobile
    filters: { project: '', priority: '', status: '', sort: 'due' },
    q: '',
    results: null, // tasks returned by the server for the current filters
    resultsQuery: null,
  };

  const projectOf = (id) => state.projects.find((p) => p.id === id);

  // ---------- API ----------

  async function api(path, { method = 'GET', body, timeout = 70000 } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    let res;
    try {
      res = await fetch(`${API}/api${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch {
      throw new Error(NETWORK_ERROR);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      let msg = `Xatolik yuz berdi (${res.status})`;
      try {
        const data = await res.json();
        if (typeof data.detail === 'string') msg = data.detail;
      } catch { /* not JSON */ }
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  async function loadAll() {
    if (API_URL === null) {
      state.status = 'error';
      state.error = "Backend manzili sozlanmagan: frontend/config.js faylida BACKEND_URL ga backend manzilingizni yozing.";
      render();
      return;
    }
    state.status = 'loading';
    state.waking = false;
    render();
    // A slow first answer (cold start, far-away server) gets a friendly message after 5 seconds.
    const slow = setTimeout(() => { state.waking = true; render(); }, 5000);
    try {
      const [projects, tasks] = await Promise.all([api('/projects'), api('/tasks')]);
      state.projects = projects;
      state.tasks = tasks;
      state.status = 'ready';
    } catch (err) {
      state.status = 'error';
      state.error = err.message;
    } finally {
      clearTimeout(slow);
      state.waking = false;
      render();
    }
  }

  // ---------- Mutations ----------

  async function createTask(data) {
    const task = await api('/tasks', { method: 'POST', body: data });
    state.tasks.push(task);
    invalidateResults();
    render();
    return task;
  }

  async function updateTask(id, patch, optimistic = true) {
    const index = state.tasks.findIndex((t) => t.id === id);
    if (index < 0) return null;
    const before = state.tasks[index];
    if (optimistic) { state.tasks[index] = { ...before, ...patch }; invalidateResults(); render(); }
    try {
      const saved = await api(`/tasks/${id}`, { method: 'PATCH', body: patch });
      const i = state.tasks.findIndex((t) => t.id === id);
      if (i >= 0) state.tasks[i] = saved;
      invalidateResults();
      render();
      return saved;
    } catch (err) {
      if (optimistic) {
        const i = state.tasks.findIndex((t) => t.id === id);
        if (i >= 0) state.tasks[i] = before;
        invalidateResults();
        render();
        toast(err.message, true);
      }
      throw err;
    }
  }

  async function deleteTask(id) {
    await api(`/tasks/${id}`, { method: 'DELETE' });
    state.tasks = state.tasks.filter((t) => t.id !== id);
    invalidateResults();
    render();
  }

  async function saveProject(id, data) {
    if (id) {
      const saved = await api(`/projects/${id}`, { method: 'PATCH', body: data });
      state.projects = state.projects.map((p) => (p.id === id ? saved : p));
    } else {
      state.projects.push(await api('/projects', { method: 'POST', body: data }));
    }
    invalidateResults();
    render();
  }

  async function deleteProject(id) {
    await api(`/projects/${id}`, { method: 'DELETE' });
    state.projects = state.projects.filter((p) => p.id !== id);
    state.tasks = state.tasks.map((t) => (t.project_id === id ? { ...t, project_id: null } : t));
    if (state.filters.project === String(id)) state.filters.project = '';
    invalidateResults();
    render();
  }

  function toggleDone(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    const status = t.status === 'done' ? 'todo' : 'done';
    updateTask(id, { status })
      .then(() => { if (status === 'done') toast('Vazifa bajarildi'); })
      .catch(() => {});
  }

  // ---------- Filtering (done by the backend: GET /api/tasks?project_id=&priority=&status=&q=&sort=) ----------

  let resultsReq = 0;
  let pendingQuery = null;

  function tasksQuery() {
    const f = state.filters;
    const params = new URLSearchParams();
    if (f.project) params.set('project_id', f.project);
    if (f.priority) params.set('priority', f.priority);
    if (state.view === 'list' && f.status) params.set('status', f.status);
    if (state.q) params.set('q', state.q);
    params.set('sort', f.sort);
    return params.toString();
  }

  function invalidateResults() {
    state.results = null;
    state.resultsQuery = null;
    pendingQuery = null;
    resultsReq += 1;
  }

  // Ask the server for tasks matching the current filters (called from render()).
  function ensureResults() {
    if (route() !== 'tasks' || state.status !== 'ready') return;
    const query = tasksQuery();
    if (query === state.resultsQuery || query === pendingQuery) return;
    pendingQuery = query;
    const id = ++resultsReq;
    api(`/tasks?${query}`)
      .then((data) => {
        if (id !== resultsReq) return; // a newer request is on its way
        pendingQuery = null;
        state.results = data;
        state.resultsQuery = query;
        render();
      })
      .catch((err) => {
        if (id !== resultsReq) return;
        pendingQuery = null;
        state.results = null;
        state.resultsQuery = query; // don't retry in a loop; the local list stays visible
        toast(err.message, true);
      });
  }

  // Instant local preview, shown only until the server answers.

  function filteredTasks({ ignoreStatus = false } = {}) {
    const { project, priority, status, sort } = state.filters;
    const q = state.q;
    const list = state.tasks.filter((t) => {
      if (project && String(t.project_id) !== project) return false;
      if (priority && t.priority !== priority) return false;
      if (!ignoreStatus && status && t.status !== status) return false;
      if (q) {
        const hay = `${t.title} ${t.description} ${projectOf(t.project_id)?.name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const byDue = (a, b) => (a.due_date || '9999') .localeCompare(b.due_date || '9999') || a.id - b.id;
    const sorters = {
      due: byDue,
      priority: (a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank || byDue(a, b),
      title: (a, b) => a.title.localeCompare(b.title, 'uz'),
      created: (a, b) => b.id - a.id,
    };
    return list.sort(sorters[sort] || byDue);
  }

  // ---------- Small components ----------

  const toneHex = { green: COLORS.green, blue: COLORS.blue, orange: COLORS.orange, gray: COLORS.gray };

  const priorityBadge = (p) => `<span class="badge badge--${PRIORITY[p].tone}"><span class="dot"></span>${PRIORITY[p].label}</span>`;
  const statusBadge = (s) => `<span class="badge badge--${STATUS[s].tone}">${s === 'done' ? icon('check', 'i--sm') : '<span class="dot"></span>'}${STATUS[s].label}</span>`;
  const projectDot = (p, onDark = false) =>
    `<span class="dot${onDark && p.color === 'dark' ? ' dot--ring' : ''}" style="background:${COLORS[p.color] || COLORS.gray}"></span>`;

  function projectLabel(t) {
    const p = projectOf(t.project_id);
    return p
      ? `${projectDot(p)}<span>${esc(p.name)}</span>`
      : '<span class="dot" style="background:var(--line)"></span><span>Loyihasiz</span>';
  }

  function dueLabel(t) {
    if (!t.due_date) return '';
    const over = isOverdue(t);
    return `<span class="due${over ? ' due--overdue' : ''}" title="${over ? "Muddati o'tgan" : 'Muddat'}">${icon(over ? 'calendar-x' : 'calendar')}${fmtDate(t.due_date)}</span>`;
  }

  function checkBtn(t) {
    const done = t.status === 'done';
    return `<button class="check${done ? ' is-checked' : ''}" type="button" data-action="toggle-done" data-id="${t.id}"
      aria-pressed="${done}" aria-label="${done ? 'Bajarilmagan deb belgilash' : 'Bajarildi deb belgilash'}">${icon('check')}</button>`;
  }

  function moreMenu(kind, id) {
    return `<div class="menu-wrap">
      <button class="icon-btn icon-btn--sm" type="button" data-action="menu" aria-haspopup="true" aria-expanded="false" aria-label="Amallar">${icon('more')}</button>
      <div class="menu" hidden>
        <button type="button" data-action="edit-${kind}" data-id="${id}">${icon('pencil')}Tahrirlash</button>
        <button type="button" class="is-danger" data-action="delete-${kind}" data-id="${id}">${icon('trash')}O'chirish</button>
      </div>
    </div>`;
  }

  function selectBox(attrs, value, options, iconName = '') {
    const opts = options
      .map(([v, label]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(label)}</option>`)
      .join('');
    return `<div class="select${iconName ? ' select--icon' : ''}">${iconName ? icon(iconName) : ''}<select ${attrs}>${opts}</select>${icon('chevron')}</div>`;
  }

  const EMPTY_ART = `<svg class="empty__art" viewBox="0 0 132 132" aria-hidden="true">
    <circle cx="66" cy="66" r="62" fill="#f3efe9"/>
    <rect x="36" y="30" width="60" height="76" rx="8" fill="#fff" stroke="#d8d4c9" stroke-width="2.5"/>
    <rect x="52" y="24" width="28" height="12" rx="4" fill="#efe9e1" stroke="#d8d4c9" stroke-width="2.5"/>
    <path d="M48 54h36M48 66h28M48 78h20" stroke="#d8d4c9" stroke-width="3" stroke-linecap="round"/>
    <circle cx="88" cy="92" r="16" fill="#d97757"/>
    <path d="m81 92 5 5 9-10" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  // ---------- Views ----------

  function route() {
    const page = location.hash.replace(/^#\/?/, '').split(/[?/]/)[0];
    return page === 'vazifalar' ? 'tasks' : page === 'loyihalar' ? 'projects' : 'dashboard';
  }

  function loadingView() {
    const banner = state.waking
      ? `<div class="banner">${icon('clock')}<span><strong>Server javob bermoqda...</strong> Birinchi ochilish biroz ko'proq vaqt olishi mumkin.</span></div>`
      : '';
    const cards = '<div class="skeleton sk-card"></div>'.repeat(3);
    return `${banner}
      <div class="page-head"><div class="skeleton" style="width:220px;height:38px"></div></div>
      <div class="board" aria-busy="true" aria-label="Yuklanmoqda">
        <div class="col is-current">${cards}</div><div class="col">${cards}</div><div class="col">${cards}</div>
      </div>`;
  }

  function errorView() {
    return `<div class="banner banner--error" role="alert">${icon('alert')}<span>${esc(state.error || NETWORK_ERROR)}<br><small>Backend: ${esc(API_URL === null ? '—' : API_LABEL)}</small></span>
      <button class="btn btn--secondary btn--sm" type="button" data-action="retry">${icon('refresh')}Qayta urinish</button></div>`;
  }

  function dashboardView() {
    const tasks = state.tasks;
    const t0 = today();
    const count = (s) => tasks.filter((t) => t.status === s).length;
    const overdue = tasks.filter(isOverdue).length;

    const now = new Date();
    const h = now.getHours();
    const greeting = h < 11 ? 'Xayrli tong!' : h < 18 ? 'Xayrli kun!' : 'Xayrli kech!';
    const dateLine = `Bugun: ${now.getDate()}-${MONTHS[now.getMonth()]}, ${WEEKDAYS[now.getDay()]}`;

    const byDue = (a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999');
    let focus = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date <= t0).sort(byDue);
    let focusTitle = 'Bugungi vazifalar';
    if (!focus.length) {
      focus = tasks.filter((t) => t.status !== 'done').sort(byDue).slice(0, 5);
      focusTitle = 'Yaqin vazifalar';
    }

    const stat = (num, label, iconName, tone, extra = '') => `
      <div class="card stat${extra}">
        <div class="stat__num">${num}</div>
        <div class="stat__label">${label}</div>
        <span class="stat__icon" style="background:${tone}22;color:${tone}">${icon(iconName)}</span>
      </div>`;

    const mini = (t) => `
      <div class="mini${t.status === 'done' ? ' is-done' : ''}" data-open="${t.id}" tabindex="0">
        ${checkBtn(t)}
        <div class="mini__body">
          <div class="mini__title">${esc(t.title)}</div>
          <div class="mini__project">${projectLabel(t)}</div>
        </div>
        <div class="mini__meta">${priorityBadge(t.priority)}${dueLabel(t)}</div>
      </div>`;

    const progress = state.projects.map((p) => {
      const own = tasks.filter((t) => t.project_id === p.id);
      const done = own.filter((t) => t.status === 'done').length;
      const pct = own.length ? Math.round((done / own.length) * 100) : 0;
      return `<div class="progress-item">
        <div class="progress-item__top">${projectDot(p)}<span>${esc(p.name)}</span><span>${done} / ${own.length}</span></div>
        <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(p.name)}"><span style="width:${pct}%;background:${COLORS[p.color]}"></span></div>
        <div class="progress-item__foot"><span>${pct}% bajarildi</span><span>${own.length - done} ta qoldi</span></div>
      </div>`;
    }).join('');

    return `
      <div class="page-head">
        <div><h1 class="page-title">${greeting}</h1><p class="page-sub">${icon('calendar')}${dateLine}</p></div>
      </div>
      <div class="stats">
        ${stat(tasks.length, 'Jami vazifalar', 'list-checks', '#6f6d65')}
        ${stat(count('in_progress'), 'Jarayonda', 'clock', COLORS.blue)}
        ${stat(count('done'), 'Bajarildi', 'check-circle', COLORS.green)}
        ${stat(overdue, "Muddati o'tgan", 'calendar-x', '#c0513f', overdue ? ' stat--danger' : '')}
      </div>
      <div class="dash-grid">
        <section class="card panel">
          <div class="panel__head">
            <h2 class="panel__title">${focusTitle}</h2>
            <span class="pill pill--soft">${focus.length}</span>
            <a class="link" href="#/vazifalar">Barchasi${icon('arrow-right')}</a>
          </div>
          ${focus.length ? focus.map(mini).join('') : `<p class="hint" style="padding:12px 0">Barcha vazifalar bajarilgan. Ajoyib!</p>`}
        </section>
        <section class="card panel">
          <div class="panel__head"><h2 class="panel__title">Loyihalar bo'yicha</h2></div>
          ${progress || `<p class="hint" style="padding:12px 0">Hozircha loyiha yo'q.</p>`}
        </section>
      </div>`;
  }

  function tasksView() {
    const isBoard = state.view === 'board';
    const fromServer = state.results && state.resultsQuery === tasksQuery();
    const list = fromServer ? state.results : filteredTasks({ ignoreStatus: isBoard });
    const f = state.filters;
    const hasFilters = f.project || f.priority || (!isBoard && f.status) || state.q;

    const head = `
      <div class="page-head">
        <h1 class="page-title">Vazifalar</h1>
        <span class="pill pill--soft">${list.length} ta vazifa</span>
        <div class="page-head__end">
          <div class="segmented" role="group" aria-label="Ko'rinish">
            <button type="button" class="${isBoard ? 'is-active' : ''}" data-action="set-view" data-view="board" aria-pressed="${isBoard}">${icon('board')}<span class="seg-label">Doska</span></button>
            <button type="button" class="${!isBoard ? 'is-active' : ''}" data-action="set-view" data-view="list" aria-pressed="${!isBoard}">${icon('list')}<span class="seg-label">Ro'yxat</span></button>
          </div>
        </div>
      </div>`;

    if (!state.tasks.length) {
      return `${head}<section class="card empty">${EMPTY_ART}
        <h2 class="empty__title">Hozircha vazifa yo'q. Birinchisini qo'shing!</h2>
        <p class="empty__text">Yangi vazifa yaratib, loyihalaringizni tartibga solishni boshlang.</p>
        <button class="btn btn--primary" type="button" data-action="new-task">${icon('plus')}Yangi vazifa</button>
        <p class="hint hide-mobile"><span class="kbd">N</span> tugmasi orqali ham qo'shish mumkin</p>
      </section>`;
    }

    const toolbar = `
      <div class="toolbar">
        ${selectBox('data-filter="project" aria-label="Loyiha bo\'yicha filtr"', f.project, [['', 'Barcha loyihalar'], ...state.projects.map((p) => [p.id, p.name])], 'folder')}
        ${selectBox('data-filter="priority" aria-label="Muhimlik bo\'yicha filtr"', f.priority, [['', 'Muhimlik: barchasi'], ...PRIORITIES.slice().reverse().map((p) => [p, PRIORITY[p].label])], 'flag')}
        ${isBoard ? '' : selectBox('data-filter="status" aria-label="Holat bo\'yicha filtr"', f.status, [['', 'Holat: hammasi'], ...STATUSES.map((s) => [s, STATUS[s].label])])}
        ${hasFilters ? `<button class="btn btn--ghost btn--sm" type="button" data-action="clear-filters">${icon('x', 'i--sm')}Tozalash</button>` : ''}
        <div class="toolbar__end">
          ${selectBox('data-filter="sort" aria-label="Saralash"', f.sort, [['due', "Muddat bo'yicha"], ['priority', "Muhimlik bo'yicha"], ['title', "Nom bo'yicha"], ['created', 'Eng yangilari']], 'sort')}
        </div>
      </div>`;

    return head + toolbar + (isBoard ? boardView(list) : listView(list));
  }

  function taskCard(t) {
    return `<article class="task${t.status === 'done' ? ' is-done' : ''}" data-open="${t.id}" data-id="${t.id}" draggable="true" tabindex="0">
      <div class="task__project">${projectLabel(t)}</div>
      <h3 class="task__title">${esc(t.title)}</h3>
      ${t.description ? `<p class="task__desc">${esc(t.description)}</p>` : ''}
      <div class="task__foot">${priorityBadge(t.priority)}${dueLabel(t)}${checkBtn(t)}</div>
    </article>`;
  }

  function boardView(list) {
    const groups = STATUSES.map((s) => [s, list.filter((t) => t.status === s)]);
    const tabs = groups.map(([s, items]) => `
      <button type="button" role="tab" class="${state.tab === s ? 'is-active' : ''}" aria-selected="${state.tab === s}" data-action="set-tab" data-tab="${s}">
        ${STATUS[s].label}<span class="pill">${items.length}</span>
      </button>`).join('');
    const cols = groups.map(([s, items]) => `
      <section class="col${state.tab === s ? ' is-current' : ''}" data-status="${s}" aria-label="${STATUS[s].label}">
        <header class="col__head">
          <h2 class="col__title">${STATUS[s].label}</h2><span class="pill">${items.length}</span>
          <button class="icon-btn icon-btn--sm" type="button" data-action="new-task" data-status="${s}" aria-label="${STATUS[s].label}: vazifa qo'shish">${icon('plus')}</button>
        </header>
        <div class="col__list">${items.length ? items.map(taskCard).join('') : `<p class="col__empty">Bu yerda hozircha vazifa yo'q</p>`}</div>
        <button class="col__add" type="button" data-action="new-task" data-status="${s}">${icon('plus')}Vazifa qo'shish</button>
      </section>`).join('');
    return `<div class="col-tabs" role="tablist" aria-label="Ustunlar">${tabs}</div><div class="board">${cols}</div>`;
  }

  function listView(list) {
    if (!list.length) {
      return `<section class="card empty"><h2 class="empty__title">Hech narsa topilmadi</h2>
        <p class="empty__text">Filtrlarni o'zgartirib ko'ring yoki yangi vazifa qo'shing.</p>
        <button class="btn btn--secondary" type="button" data-action="clear-filters">Filtrlarni tozalash</button></section>`;
    }
    const rows = list.map((t) => `
      <div class="row${t.status === 'done' ? ' is-done' : ''}" data-open="${t.id}" tabindex="0">
        ${checkBtn(t)}
        <div>
          <div class="row__title">${esc(t.title)}</div>
          <div class="row__meta">${priorityBadge(t.priority)}${statusBadge(t.status)}${dueLabel(t)}</div>
        </div>
        <div class="row__project">${projectLabel(t)}</div>
        <div>${priorityBadge(t.priority)}</div>
        <div>${statusBadge(t.status)}</div>
        <div>${dueLabel(t) || '<span class="hint">—</span>'}</div>
        ${moreMenu('task', t.id)}
      </div>`).join('');
    return `<div class="card table">
      <div class="row row--head"><span></span><span>Sarlavha</span><span>Loyiha</span><span>Muhimlik</span><span>Holat</span><span>Muddat</span><span></span></div>
      ${rows}
      <div class="table__foot">${list.length} ta vazifa ko'rsatilmoqda</div>
    </div>`;
  }

  function projectsView() {
    const head = `
      <div class="page-head">
        <h1 class="page-title">Loyihalar</h1>
        <span class="pill pill--soft">${state.projects.length} ta</span>
        <div class="page-head__end"><button class="btn btn--primary btn--sm" type="button" data-action="new-project">${icon('plus')}Yangi loyiha</button></div>
      </div>`;
    if (!state.projects.length) {
      return `${head}<section class="card empty">${EMPTY_ART}<h2 class="empty__title">Hozircha loyiha yo'q</h2>
        <p class="empty__text">Vazifalarni guruhlash uchun birinchi loyihangizni yarating.</p>
        <button class="btn btn--primary" type="button" data-action="new-project">${icon('plus')}Yangi loyiha</button></section>`;
    }
    const cards = state.projects.map((p) => {
      const own = state.tasks.filter((t) => t.project_id === p.id);
      const done = own.filter((t) => t.status === 'done').length;
      const pct = own.length ? Math.round((done / own.length) * 100) : 0;
      return `<article class="card project" data-action="open-project" data-id="${p.id}" tabindex="0">
        <div class="project__head">${projectDot(p)}<h2 class="project__name">${esc(p.name)}</h2>${moreMenu('project', p.id)}</div>
        <p class="project__desc">${esc(p.description) || '<span style="color:var(--mid)">Tavsif yo\'q</span>'}</p>
        <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(p.name)}"><span style="width:${pct}%;background:${COLORS[p.color]}"></span></div>
        <p class="project__foot">${done} / ${own.length} vazifa bajarildi</p>
      </article>`;
    }).join('');
    return `${head}<div class="projects">${cards}</div>`;
  }

  // ---------- Render ----------

  const TITLES = { dashboard: 'Bosh sahifa', tasks: 'Vazifalar', projects: 'Loyihalar' };

  function render() {
    const r = route();
    $$('[data-route]').forEach((a) => {
      const on = a.dataset.route === r;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = `${TITLES[r]} · Vazifa`;
    $('#fab').setAttribute('aria-label', r === 'projects' ? 'Yangi loyiha' : 'Yangi vazifa');

    $('#sideProjects').innerHTML = state.projects.map((p) => {
      const open = state.tasks.filter((t) => t.project_id === p.id && t.status !== 'done').length;
      const active = r === 'tasks' && state.filters.project === String(p.id);
      return `<button class="side-project${active ? ' is-active' : ''}" type="button" data-action="filter-project" data-id="${p.id}">
        ${projectDot(p, true)}<span class="side-project__name">${esc(p.name)}</span><span class="side-project__count">${open || ''}</span></button>`;
    }).join('');

    // keep keyboard focus on a filter select when the view re-renders
    const active = document.activeElement;
    const keep = active && active.dataset && active.dataset.filter ? `[data-filter="${active.dataset.filter}"]` : null;

    const view = $('#view');
    if (state.status === 'loading') view.innerHTML = loadingView();
    else if (state.status === 'error') view.innerHTML = errorView();
    else view.innerHTML = r === 'tasks' ? tasksView() : r === 'projects' ? projectsView() : dashboardView();

    if (keep) $(keep)?.focus();
    ensureResults();
  }

  // ---------- Layer: modal, drawer, confirm ----------

  let lastFocus = null;

  function openLayer(html) {
    const layer = $('#layer');
    if (!layer.innerHTML) lastFocus = document.activeElement;
    layer.innerHTML = html;
    document.body.style.overflow = 'hidden';
    const first = layer.querySelector('[autofocus], input:not([type=radio]), textarea, .modal__foot .btn--secondary, .drawer__foot .btn--secondary');
    (first || layer.querySelector('button'))?.focus();
  }

  function closeLayer() {
    const layer = $('#layer');
    if (!layer.innerHTML) return;
    layer.innerHTML = '';
    document.body.style.overflow = '';
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  }

  function openTaskForm(task, defaults = {}) {
    const isEdit = Boolean(task);
    const fallbackProject = state.filters.project ? Number(state.filters.project) : state.projects[0]?.id ?? '';
    const t = task || {
      title: '', description: '', priority: 'medium', due_date: '',
      status: defaults.status || 'todo',
      project_id: defaults.project_id ?? fallbackProject,
    };

    openLayer(`
      <div class="overlay" data-action="overlay">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlgTitle">
          <header class="modal__head">
            <h2 class="modal__title" id="dlgTitle">${isEdit ? 'Vazifani tahrirlash' : 'Yangi vazifa'}</h2>
            <button class="icon-btn" type="button" data-action="close" aria-label="Yopish">${icon('x')}</button>
          </header>
          <form class="modal__body" id="taskForm" novalidate>
            <label class="field">
              <span class="field__label">Sarlavha <small>Majburiy</small></span>
              <input class="input" name="title" maxlength="120" required autocomplete="off" autofocus
                value="${esc(t.title)}" placeholder="Masalan: Bosh sahifani tayyorlash">
              <span class="field__error" id="titleError" hidden>Sarlavhani kiriting</span>
            </label>
            <label class="field">
              <span class="field__label">Tavsif</span>
              <textarea class="textarea" name="description" rows="3" maxlength="5000" placeholder="Qo'shimcha ma'lumot (ixtiyoriy)">${esc(t.description)}</textarea>
            </label>
            <div class="field-row">
              <label class="field"><span class="field__label">Loyiha</span>
                ${selectBox('name="project_id"', t.project_id ?? '', [['', 'Loyihasiz'], ...state.projects.map((p) => [p.id, p.name])])}</label>
              <label class="field"><span class="field__label">Holat</span>
                ${selectBox('name="status"', t.status, STATUSES.map((s) => [s, STATUS[s].label]))}</label>
            </div>
            <fieldset class="field">
              <legend>Muhimlik darajasi</legend>
              <div class="segmented segmented--full">
                ${PRIORITIES.map((p) => `<input type="radio" name="priority" id="pr-${p}" value="${p}"${t.priority === p ? ' checked' : ''}>
                  <label for="pr-${p}"><span class="dot" style="background:${toneHex[PRIORITY[p].tone]}"></span>${PRIORITY[p].label}</label>`).join('')}
              </div>
            </fieldset>
            <label class="field"><span class="field__label">Muddat</span>
              <input class="input" type="date" name="due_date" value="${esc(t.due_date || '')}"></label>
          </form>
          <footer class="modal__foot">
            ${isEdit ? `<button class="btn btn--danger" type="button" data-action="delete-task" data-id="${t.id}">${icon('trash')}O'chirish</button>` : ''}
            <span class="spacer"></span>
            <button class="btn btn--secondary" type="button" data-action="close">Bekor qilish</button>
            <button class="btn btn--primary" type="submit" form="taskForm" id="saveBtn">${icon('check')}Saqlash</button>
          </footer>
        </div>
      </div>`);

    const form = $('#taskForm');
    const fields = form.elements;
    fields.title.addEventListener('input', () => {
      fields.title.classList.remove('is-invalid');
      $('#titleError').hidden = true;
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = fields.title.value.trim();
      if (!title) {
        fields.title.classList.add('is-invalid');
        fields.title.setAttribute('aria-describedby', 'titleError');
        $('#titleError').hidden = false;
        fields.title.focus();
        return;
      }
      const data = {
        title,
        description: fields.description.value.trim(),
        status: fields.status.value,
        priority: form.querySelector('[name=priority]:checked').value,
        due_date: fields.due_date.value || null,
        project_id: fields.project_id.value ? Number(fields.project_id.value) : null,
      };
      const btn = $('#saveBtn');
      btn.disabled = true;
      try {
        if (isEdit) await updateTask(task.id, data, false);
        else await createTask(data);
        closeLayer();
        toast(isEdit ? 'Vazifa saqlandi' : "Vazifa qo'shildi");
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
      }
    });
  }

  function openDrawer(id) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    const p = projectOf(t.project_id);
    const over = isOverdue(t);
    openLayer(`
      <div class="overlay overlay--drawer" data-action="overlay">
        <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dlgTitle">
          <header class="drawer__head">${icon('check-circle')}<span>Vazifa tafsilotlari</span>
            <button class="icon-btn" type="button" data-action="close" aria-label="Yopish">${icon('x')}</button></header>
          <div class="drawer__body">
            <h2 class="drawer__title" id="dlgTitle">${esc(t.title)}</h2>
            <div class="drawer__badges">${statusBadge(t.status)}${priorityBadge(t.priority)}</div>
            <div class="facts">
              <div class="fact"><span class="fact__key">Loyiha</span><span class="fact__val">${p ? projectDot(p) + esc(p.name) : 'Loyihasiz'}</span></div>
              <div class="fact"><span class="fact__key">Muddat</span>
                <span class="fact__val"${over ? ' style="color:var(--danger)"' : ''}>${t.due_date ? icon(over ? 'calendar-x' : 'calendar', 'i--sm') + fmtDate(t.due_date, true) : 'Belgilanmagan'}</span></div>
              <div class="fact"><span class="fact__key">Holat</span><span class="fact__val">
                ${selectBox(`data-task-status="${t.id}" aria-label="Holatni o'zgartirish"`, t.status, STATUSES.map((s) => [s, STATUS[s].label]))}</span></div>
            </div>
            <div class="drawer__section">
              <p class="drawer__label">Tavsif</p>
              ${t.description ? `<p class="drawer__desc">${esc(t.description)}</p>` : `<p class="drawer__desc drawer__desc--empty">Tavsif qo'shilmagan</p>`}
            </div>
            <p class="drawer__time">Yaratilgan: ${fmtDateTime(t.created_at)} · Yangilangan: ${fmtDateTime(t.updated_at)}</p>
          </div>
          <footer class="drawer__foot">
            <button class="btn btn--danger" type="button" data-action="delete-task" data-id="${t.id}">${icon('trash')}O'chirish</button>
            <button class="btn btn--secondary" type="button" data-action="edit-task" data-id="${t.id}">${icon('pencil')}Tahrirlash</button>
          </footer>
        </aside>
      </div>`);
  }

  function confirmDialog({ title, text, confirmLabel = "O'chirish", onConfirm }) {
    openLayer(`
      <div class="overlay" data-action="overlay">
        <div class="modal modal--sm" role="alertdialog" aria-modal="true" aria-labelledby="dlgTitle" aria-describedby="dlgText">
          <header class="modal__head"><h2 class="modal__title" id="dlgTitle">${esc(title)}</h2></header>
          <div class="modal__body"><p class="modal__text" id="dlgText">${esc(text)}</p></div>
          <footer class="modal__foot"><span class="spacer"></span>
            <button class="btn btn--secondary" type="button" data-action="close">Bekor qilish</button>
            <button class="btn btn--danger-fill" type="button" id="confirmBtn">${icon('trash')}${esc(confirmLabel)}</button>
          </footer>
        </div>
      </div>`);
    const btn = $('#confirmBtn');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await onConfirm(); closeLayer(); } catch (err) { toast(err.message, true); btn.disabled = false; }
    });
  }

  function openProjectForm(project) {
    const isEdit = Boolean(project);
    const p = project || { name: '', description: '', color: 'orange' };
    openLayer(`
      <div class="overlay" data-action="overlay">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlgTitle">
          <header class="modal__head">
            <h2 class="modal__title" id="dlgTitle">${isEdit ? 'Loyihani tahrirlash' : 'Yangi loyiha'}</h2>
            <button class="icon-btn" type="button" data-action="close" aria-label="Yopish">${icon('x')}</button>
          </header>
          <form class="modal__body" id="projectForm" novalidate>
            <label class="field"><span class="field__label">Nomi <small>Majburiy</small></span>
              <input class="input" name="name" maxlength="60" required autocomplete="off" autofocus value="${esc(p.name)}" placeholder="Masalan: Veb-sayt">
              <span class="field__error" id="nameError" hidden>Loyiha nomini kiriting</span></label>
            <label class="field"><span class="field__label">Tavsif</span>
              <textarea class="textarea" name="description" rows="2" maxlength="500" placeholder="Loyiha haqida qisqacha">${esc(p.description)}</textarea></label>
            <fieldset class="field"><legend>Rang</legend>
              <div class="swatches">
                ${Object.keys(COLORS).map((c) => `<input type="radio" name="color" id="c-${c}" value="${c}"${p.color === c ? ' checked' : ''}>
                  <label for="c-${c}" style="background:${COLORS[c]}" title="${COLOR_NAMES[c]}"><span class="sr-only">${COLOR_NAMES[c]}</span></label>`).join('')}
              </div>
            </fieldset>
          </form>
          <footer class="modal__foot"><span class="spacer"></span>
            <button class="btn btn--secondary" type="button" data-action="close">Bekor qilish</button>
            <button class="btn btn--primary" type="submit" form="projectForm" id="saveBtn">${icon('check')}Saqlash</button>
          </footer>
        </div>
      </div>`);

    const form = $('#projectForm');
    const fields = form.elements;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = fields.name.value.trim();
      if (!name) {
        fields.name.classList.add('is-invalid');
        $('#nameError').hidden = false;
        fields.name.focus();
        return;
      }
      const btn = $('#saveBtn');
      btn.disabled = true;
      try {
        await saveProject(project?.id, {
          name,
          description: fields.description.value.trim(),
          color: form.querySelector('[name=color]:checked').value,
        });
        closeLayer();
        toast(isEdit ? 'Loyiha saqlandi' : "Loyiha qo'shildi");
      } catch (err) {
        toast(err.message, true);
        btn.disabled = false;
      }
    });
  }

  // ---------- Toast ----------

  let toastTimer;
  function toast(message, isError = false) {
    const el = $('#toast');
    el.innerHTML = `${icon(isError ? 'alert' : 'check-circle')}<span>${esc(message)}</span>`;
    el.classList.toggle('is-error', isError);
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), isError ? 5000 : 3000);
  }

  // ---------- Sidebar & search (mobile) ----------

  const setSidebar = (open) => document.body.classList.toggle('is-sidebar-open', open);
  const closeMenus = () => $$('.menu:not([hidden])').forEach((m) => {
    m.hidden = true;
    m.previousElementSibling?.setAttribute('aria-expanded', 'false');
  });

  function goToTasks() {
    setSidebar(false);
    if (route() === 'tasks') render(); else location.hash = '#/vazifalar';
  }

  // ---------- Events ----------

  const actions = {
    'new-task': (el) => openTaskForm(null, { status: el.dataset.status }),
    'edit-task': (el) => { const t = state.tasks.find((x) => x.id === Number(el.dataset.id)); if (t) openTaskForm(t); },
    'delete-task': (el) => {
      const t = state.tasks.find((x) => x.id === Number(el.dataset.id));
      if (!t) return;
      confirmDialog({
        title: "Vazifani o'chirasizmi?",
        text: `"${t.title}" o'chiriladi. Bu amalni ortga qaytarib bo'lmaydi.`,
        onConfirm: async () => { await deleteTask(t.id); toast("Vazifa o'chirildi"); },
      });
    },
    'toggle-done': (el) => toggleDone(Number(el.dataset.id)),
    fab: () => (route() === 'projects' ? openProjectForm(null) : openTaskForm(null)),
    'new-project': () => { setSidebar(false); openProjectForm(null); },
    'edit-project': (el) => { const p = projectOf(Number(el.dataset.id)); if (p) openProjectForm(p); },
    'delete-project': (el) => {
      const p = projectOf(Number(el.dataset.id));
      if (!p) return;
      confirmDialog({
        title: "Loyihani o'chirasizmi?",
        text: `"${p.name}" o'chiriladi. Uning vazifalari saqlanib qoladi, lekin loyihasiz bo'ladi.`,
        onConfirm: async () => { await deleteProject(p.id); toast("Loyiha o'chirildi"); },
      });
    },
    'open-project': (el) => { state.filters.project = el.dataset.id; goToTasks(); },
    'filter-project': (el) => {
      state.filters.project = state.filters.project === el.dataset.id && route() === 'tasks' ? '' : el.dataset.id;
      goToTasks();
    },
    'clear-filters': () => {
      Object.assign(state.filters, { project: '', priority: '', status: '' });
      state.q = '';
      $('#search').value = '';
      render();
    },
    'set-view': (el) => { state.view = el.dataset.view; store.set('view', state.view); render(); },
    'set-tab': (el) => { state.tab = el.dataset.tab; render(); },
    menu: (el) => {
      const menu = el.nextElementSibling;
      const wasOpen = !menu.hidden;
      closeMenus();
      if (!wasOpen) { menu.hidden = false; el.setAttribute('aria-expanded', 'true'); menu.querySelector('button')?.focus(); }
    },
    'open-sidebar': () => setSidebar(true),
    'close-sidebar': () => setSidebar(false),
    'toggle-search': () => {
      const open = !document.body.classList.contains('is-search-open');
      document.body.classList.toggle('is-search-open', open);
      if (open) $('#search').focus();
    },
    retry: () => loadAll(),
    close: () => closeLayer(),
    overlay: (el, e) => { if (e.target === el) closeLayer(); },
  };

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-wrap')) closeMenus();
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) {
      if (el.dataset.action !== 'overlay' || e.target === el) {
        actions[el.dataset.action](el, e);
        return;
      }
    }
    const open = e.target.closest('[data-open]');
    if (open && !e.target.closest('#layer')) openDrawer(Number(open.dataset.open));
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.filter) {
      state.filters[el.dataset.filter] = el.value;
      render();
    } else if (el.dataset.taskStatus) {
      const id = Number(el.dataset.taskStatus);
      updateTask(id, { status: el.value })
        .then(() => { openDrawer(id); toast('Holat yangilandi'); })
        .catch(() => openDrawer(id));
    }
  });

  document.addEventListener('keydown', (e) => {
    const layer = $('#layer');
    if (e.key === 'Escape') {
      if ($('.menu:not([hidden])')) { closeMenus(); return; }
      if (layer.innerHTML) { closeLayer(); return; }
      setSidebar(false);
      document.body.classList.remove('is-search-open');
      return;
    }
    // keep Tab focus inside an open dialog
    if (e.key === 'Tab' && layer.innerHTML) {
      const items = $$('button:not([disabled]), input:not([type=radio]), input[type=radio]:checked, select, textarea, [tabindex="0"]', layer)
        .filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || layer.innerHTML) return;
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open], .project[data-action]')) {
      e.preventDefault();
      e.target.click();
    } else if (e.key === 'n' || e.key === 'N') {
      if (state.status === 'ready') { e.preventDefault(); openTaskForm(null); }
    } else if (e.key === '/') {
      e.preventDefault();
      if (window.matchMedia('(max-width: 767px)').matches) document.body.classList.add('is-search-open');
      $('#search').focus();
    }
  });

  // Drag and drop between board columns (desktop)
  let dragId = null;
  document.addEventListener('dragstart', (e) => {
    const card = e.target.closest?.('.task[draggable]');
    if (!card) return;
    dragId = Number(card.dataset.id);
    card.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(dragId));
  });
  document.addEventListener('dragend', () => {
    $$('.is-dragging, .is-over').forEach((el) => el.classList.remove('is-dragging', 'is-over'));
    dragId = null;
  });
  document.addEventListener('dragover', (e) => {
    const col = e.target.closest?.('.col');
    if (!col || dragId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    $$('.col.is-over').forEach((c) => c !== col && c.classList.remove('is-over'));
    col.classList.add('is-over');
  });
  document.addEventListener('drop', (e) => {
    const col = e.target.closest?.('.col');
    if (!col || dragId === null) return;
    e.preventDefault();
    col.classList.remove('is-over');
    const t = state.tasks.find((x) => x.id === dragId);
    const status = col.dataset.status;
    if (t && t.status !== status) {
      updateTask(t.id, { status }).then(() => toast(`${STATUS[status].label}: ${t.title}`)).catch(() => {});
    }
  });

  // Search
  const search = $('#search');
  let searchTimer;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.q = search.value.trim().toLowerCase();
      if (route() !== 'tasks') location.hash = '#/vazifalar'; else render();
    }, 120);
  });
  search.addEventListener('blur', () => {
    if (!search.value) document.body.classList.remove('is-search-open');
  });

  window.addEventListener('hashchange', () => {
    setSidebar(false);
    closeLayer();
    render();
    if (document.activeElement !== search) {
      window.scrollTo(0, 0);
      $('#view').focus({ preventScroll: true });
    }
  });

  loadAll();
})();
