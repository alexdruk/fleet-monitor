/* ═══════════════════════════════════════════════════════════════════════════
   Fleet Monitor — Frontend SPA
   ═══════════════════════════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  user: null,
  token: null,
  view: 'login',
  params: {},
  cache: {},
};

function loadSession() {
  try {
    S.token = localStorage.getItem('fm_token');
    S.user  = JSON.parse(localStorage.getItem('fm_user') || 'null');
  } catch { S.token = null; S.user = null; }
}

function saveSession(token, user) {
  S.token = token; S.user = user;
  localStorage.setItem('fm_token', token);
  localStorage.setItem('fm_user', JSON.stringify(user));
}

function clearSession() {
  S.token = null; S.user = null;
  localStorage.removeItem('fm_token');
  localStorage.removeItem('fm_user');
}

// ── API ───────────────────────────────────────────────────────────────────────
const API = {
  async call(method, path, body, isForm = false) {
    const opts = { method, headers: {} };
    if (S.token) opts.headers['Authorization'] = `Bearer ${S.token}`;
    if (body && !isForm) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    else if (isForm)     { opts.body = body; }
    const res  = await fetch('/api' + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  get:      (p)    => API.call('GET', p),
  post:     (p, b) => API.call('POST', p, b),
  postForm: (p, f) => API.call('POST', p, f, true),
  put:      (p, b) => API.call('PUT', p, b),
};

// ── Router ────────────────────────────────────────────────────────────────────
function nav(view, params = {}) {
  S.view = view; S.params = params;
  renderApp();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.className   = `toast ${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3200);
}

// ── Format helpers ────────────────────────────────────────────────────────────
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '';
const fmtDT    = (d) => d ? new Date(d).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) : '';
const fmtWk    = (s, e) => `${fmtDate(s)} – ${fmtDate(e)}`;

function statusBadge(s) {
  if (!s || s === '—') return `<span class="badge badge-neutral">${s || '—'}</span>`;
  if (s.includes('✔')) return `<span class="badge badge-on">${s}</span>`;
  if (s.includes('✘')) return `<span class="badge badge-off">${s}</span>`;
  if (s.includes('⚠')) return `<span class="badge badge-warn">${s}</span>`;
  return `<span class="badge badge-neutral">${s}</span>`;
}

function fmtValue(v, label) {
  const n = parseFloat(v);
  if (isNaN(n) || v === '—' || v === '') return v;
  const lc = label.toLowerCase();
  if (lc.includes('revenue') || lc.includes('cost') || lc.includes('profit') || lc.includes('ebitda') || lc.includes('per delivery'))
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (lc.includes('rate') || lc.includes('margin') || lc.includes('%')) return n + '%';
  return v;
}

// ── Main render ───────────────────────────────────────────────────────────────
function renderApp() {
  const app = document.getElementById('app');
  if (!S.user) { app.innerHTML = loginHTML(); setupLogin(); return; }
  const isAdmin = S.user.role === 'admin';
  app.innerHTML = layoutHTML(isAdmin);
  highlightNav(S.view);
  renderView(S.view);
}

// ── Layout ────────────────────────────────────────────────────────────────────
function layoutHTML(isAdmin) {
  const adminNav = `
    <div class="sidebar-section">
      <div class="sidebar-section-label">Overview</div>
      <div class="sidebar-item" data-nav="overview"><span class="nav-icon">📊</span>Dashboard</div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-section-label">Reports</div>
      <div class="sidebar-item" data-nav="week-reports"><span class="nav-icon">📅</span>Browse by Week</div>
      <div class="sidebar-item" data-nav="all-reports"><span class="nav-icon">📋</span>All Reports</div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-section-label">Analytics</div>
      <div class="sidebar-item" data-nav="yearly"><span class="nav-icon">📈</span>Yearly Summary</div>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-section-label">Admin</div>
      <div class="sidebar-item" data-nav="users"><span class="nav-icon">👥</span>Users</div>
    </div>`;

  const managerNav = `
    <div class="sidebar-section">
      <div class="sidebar-section-label">My Fleet</div>
      <div class="sidebar-item" data-nav="my-reports"><span class="nav-icon">📋</span>My Reports</div>
      <div class="sidebar-item" data-nav="upload"><span class="nav-icon">⬆️</span>Upload Report</div>
    </div>`;

  const commonNav = `
    <div class="sidebar-section">
      <div class="sidebar-section-label">Account</div>
      <div class="sidebar-item" data-nav="profile"><span class="nav-icon">👤</span>Profile</div>
      <div class="sidebar-item" id="logout-btn"><span class="nav-icon">🚪</span>Sign Out</div>
    </div>`;

  return `
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div>
            <div class="brand-name"><span>amazon</span> fleet</div>
          </div>
          <span class="brand-badge">${isAdmin ? 'ADMIN' : 'MGR'}</span>
        </div>
        <div class="sidebar-user">
          <div class="user-info">
            <div class="user-avatar">${S.user.avatar || S.user.name.split(' ').map(n=>n[0]).join('')}</div>
            <div><div class="user-name">${S.user.name}</div><div class="user-role">${S.user.role}</div></div>
          </div>
        </div>
        ${isAdmin ? adminNav : managerNav}
        ${commonNav}
      </aside>
      <div class="main-wrap">
        <div class="top-bar">
          <div class="page-title" id="top-title">Dashboard</div>
          <div class="top-bar-right" id="top-actions"></div>
        </div>
        <div class="page-body" id="main-content">
          <div class="full-center"><div class="spinner"></div></div>
        </div>
      </div>
    </div>`;
}

function highlightNav(view) {
  document.querySelectorAll('.sidebar-item[data-nav]').forEach(el => {
    el.classList.toggle('active', el.dataset.nav === view);
  });
  document.querySelectorAll('.sidebar-item[data-nav]').forEach(el => {
    el.addEventListener('click', () => nav(el.dataset.nav));
  });
  document.getElementById('logout-btn')?.addEventListener('click', () => {
    clearSession(); S.view = 'login'; renderApp();
  });
}

function setTitle(t) { const el = document.getElementById('top-title'); if (el) el.textContent = t; }
function setActions(html) { const el = document.getElementById('top-actions'); if (el) el.innerHTML = html; }
function setContent(html) { const el = document.getElementById('main-content'); if (el) el.innerHTML = html; }

async function renderView(view) {
  try {
    if      (view === 'overview')     await renderOverview();
    else if (view === 'week-reports') await renderWeekReports();
    else if (view === 'all-reports')  await renderAllReports();
    else if (view === 'yearly')       await renderYearly();
    else if (view === 'users')        await renderUsers();
    else if (view === 'my-reports')   await renderMyReports();
    else if (view === 'upload')       renderUpload();
    else if (view === 'report')       await renderReport(S.params.id);
    else if (view === 'profile')      await renderProfile();
    else {
      if (S.user.role === 'admin') await renderOverview();
      else await renderMyReports();
    }
  } catch (e) {
    setContent(`<div class="card"><div class="error-msg">Error: ${e.message}</div></div>`);
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────
function loginHTML() {
  return `
    <div class="login-page">
      <div class="login-card">
        <div class="login-logo">
          <div class="logo-top"><span>amazon</span> Fleet Monitor</div>
          <div class="logo-sub">Operations Dashboard</div>
        </div>
        <h2>Sign In</h2>
        <p class="subtitle">Enter your credentials to access the portal</p>
        <div id="login-error" style="display:none"></div>
        <div class="form-group"><label class="form-label">Username</label><input class="form-control" id="un" placeholder="username" autocomplete="username"></div>
        <div class="form-group"><label class="form-label">Password</label><input class="form-control" id="pw" type="password" placeholder="password" autocomplete="current-password"></div>
        <button class="btn btn-primary w-full" id="login-btn" style="margin-top:8px">Sign In →</button>
        <div class="login-hint">
          <strong>Demo Credentials</strong>
          admin / admin123 &nbsp;|&nbsp; manager1 / manager123 &nbsp;|&nbsp; manager2 / manager123
        </div>
      </div>
    </div>`;
}

function setupLogin() {
  const doLogin = async () => {
    const un = document.getElementById('un').value.trim();
    const pw = document.getElementById('pw').value.trim();
    const errEl = document.getElementById('login-error');
    errEl.style.display = 'none';
    try {
      const { token, user } = await API.post('/auth/login', { username: un, password: pw });
      saveSession(token, user);
      S.view = user.role === 'admin' ? 'overview' : 'my-reports';
      renderApp();
    } catch (e) {
      errEl.className = 'error-msg';
      errEl.textContent = e.message;
      errEl.style.display = 'block';
    }
  };
  document.getElementById('login-btn')?.addEventListener('click', doLogin);
  document.getElementById('pw')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

// ── Admin Overview ────────────────────────────────────────────────────────────
async function renderOverview() {
  setTitle('Dashboard'); setActions('');
  setContent('<div class="full-center"><div class="spinner"></div></div>');
  const [reports, locations] = await Promise.all([API.get('/reports'), API.get('/locations')]);
  const totalChanges = reports.reduce((s, r) => s + r.changeCount, 0);
  const lastWeek = reports.reduce((max, r) => (!max || r.weekStart > max) ? r.weekStart : max, null);
  const thisWeekReports = reports.filter(r => r.weekStart === lastWeek);

  let cards = `<div class="card-grid" style="margin-bottom:24px">
    <div class="stat-card"><div class="stat-label">Total Fleets</div><div class="stat-value">${locations.length}</div><div class="stat-sub">Active DSP locations</div></div>
    <div class="stat-card"><div class="stat-label">Total Reports</div><div class="stat-value">${reports.length}</div><div class="stat-sub">Across all fleets</div></div>
    <div class="stat-card"><div class="stat-label">Latest Week</div><div class="stat-value">${thisWeekReports.length}/${locations.length}</div><div class="stat-sub">${fmtDate(lastWeek)}</div></div>
    <div class="stat-card"><div class="stat-label">Total Edits</div><div class="stat-value">${totalChanges}</div><div class="stat-sub">Audit trail entries</div></div>
  </div>`;

  let locCards = locations.map(loc => {
    const locReports = reports.filter(r => r.locationId === loc.id).sort((a,b) => b.weekStart.localeCompare(a.weekStart));
    const latest = locReports[0];
    return `<div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <div>
          <div class="card-title">${loc.name}</div>
          <div class="text-sm text-muted">${loc.fleetId} · ${loc.city}</div>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="nav('week-reports',{loc:${loc.id}})">View Reports →</button>
      </div>
      <div class="flex gap-2" style="flex-wrap:wrap">
        <div><span class="text-sm text-muted">Reports on file: </span><strong>${locReports.length}</strong></div>
        <div><span class="text-sm text-muted">Latest: </span><strong>${latest ? fmtDate(latest.weekStart) : 'None'}</strong></div>
        <div><span class="text-sm text-muted">Submitted by: </span><strong>${latest?.submittedByName || '—'}</strong></div>
        <div><span class="text-sm text-muted">Total edits: </span><strong>${locReports.reduce((s,r)=>s+r.changeCount,0)}</strong></div>
      </div>
    </div>`;
  }).join('');

  setContent(cards + locCards);
}

// ── Admin: Browse by Week ─────────────────────────────────────────────────────
async function renderWeekReports() {
  setTitle('Browse by Week'); setActions('');
  setContent('<div class="full-center"><div class="spinner"></div></div>');
  const [reports, locations] = await Promise.all([API.get('/reports'), API.get('/locations')]);

  // Group by weekStart
  const weeks = [...new Set(reports.map(r => r.weekStart))].sort((a,b) => b.localeCompare(a));
  const selWeek = S.params.week || weeks[0];
  const weekReports = reports.filter(r => r.weekStart === selWeek);

  const weekListHTML = weeks.map((w, i) => {
    const cnt = reports.filter(r => r.weekStart === w).length;
    return `<div class="week-item ${w === selWeek ? 'active' : ''}" data-week="${w}">
      <div><div style="font-weight:600">Week ${weeks.length - i}</div><div class="wk-label">${fmtDate(w)}</div></div>
      <span class="badge badge-neutral">${cnt} report${cnt!==1?'s':''}</span>
    </div>`;
  }).join('');

  const reportCards = locations.map(loc => {
    const r = weekReports.find(r => r.locationId === loc.id);
    if (!r) return `<div class="card"><div style="color:var(--gray-600);font-size:13px">📭 No report submitted for this week — <strong>${loc.name}</strong></div></div>`;
    return `<div class="card" style="margin-bottom:12px">
      <div class="card-header">
        <div><div class="card-title">${loc.name}</div><div class="text-sm text-muted">${loc.fleetId} · ${r.submittedByName} · ${fmtDT(r.submittedAt)}</div></div>
        <button class="btn btn-sm btn-primary" onclick="nav('report',{id:'${r.id}'})">Open Report →</button>
      </div>
      <div class="flex gap-2 text-sm text-muted">
        <span>Period: <strong style="color:var(--gray-800)">${fmtWk(r.weekStart, r.weekEnd)}</strong></span>
        <span>Edits: <strong style="color:var(--gray-800)">${r.changeCount}</strong></span>
      </div>
    </div>`;
  }).join('');

  setContent(`<div class="flex gap-2" style="align-items:flex-start">
    <div style="width:220px;flex-shrink:0">
      <div class="card">
        <div class="card-title mb-1">Select Week</div>
        <div class="week-list mt-1">${weekListHTML}</div>
      </div>
    </div>
    <div style="flex:1">
      <div class="card-title mb-1" style="margin-bottom:16px">Week of ${fmtDate(selWeek)}</div>
      ${reportCards}
    </div>
  </div>`);

  document.querySelectorAll('.week-item').forEach(el => {
    el.addEventListener('click', () => nav('week-reports', { week: el.dataset.week }));
  });
}

// ── Admin: All Reports ────────────────────────────────────────────────────────
async function renderAllReports() {
  setTitle('All Reports'); setActions('');
  setContent('<div class="full-center"><div class="spinner"></div></div>');
  const [reports, locations] = await Promise.all([API.get('/reports'), API.get('/locations')]);
  const sorted = [...reports].sort((a,b) => b.weekStart.localeCompare(a.weekStart));

  const rows = sorted.map((r, i) => `
    <tr class="${i%2?'alt':''}">
      <td><strong>${locations.find(l=>l.id===r.locationId)?.name || r.locationId}</strong></td>
      <td>${r.fleetId}</td>
      <td>${fmtDate(r.weekStart)}</td>
      <td>${fmtDate(r.weekEnd)}</td>
      <td>${r.submittedByName}</td>
      <td>${fmtDT(r.submittedAt)}</td>
      <td>${r.changeCount > 0 ? `<span class="badge badge-warn">${r.changeCount} edit${r.changeCount!==1?'s':''}</span>` : '<span class="badge badge-neutral">—</span>'}</td>
      <td><button class="btn btn-sm btn-ghost" onclick="nav('report',{id:'${r.id}'})">Open →</button></td>
    </tr>`).join('');

  setContent(`<div class="table-wrap">
    <table>
      <thead><tr><th>Fleet</th><th>Fleet ID</th><th>Week Start</th><th>Week End</th><th>Submitted By</th><th>Submitted At</th><th>Edits</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`);
}

// ── Manager: My Reports ───────────────────────────────────────────────────────
async function renderMyReports() {
  setTitle('My Reports');
  setActions(`<button class="btn btn-primary btn-sm" onclick="nav('upload')">⬆ Upload Report</button>`);
  setContent('<div class="full-center"><div class="spinner"></div></div>');
  const reports = await API.get('/reports');
  const sorted  = [...reports].sort((a,b) => b.weekStart.localeCompare(a.weekStart));

  if (!sorted.length) {
    setContent(`<div class="card empty-state"><div class="empty-icon">📭</div><div class="empty-title">No reports yet</div><div class="empty-sub">Upload your first weekly report to get started.</div><br><button class="btn btn-primary" onclick="nav('upload')">Upload Report</button></div>`);
    return;
  }

  const rows = sorted.map((r, i) => `
    <tr class="${i%2?'alt':''}">
      <td><strong>${fmtDate(r.weekStart)}</strong></td>
      <td>${fmtDate(r.weekEnd)}</td>
      <td>${fmtDT(r.submittedAt)}</td>
      <td>${r.changeCount > 0 ? `<span class="badge badge-warn">${r.changeCount} edit${r.changeCount!==1?'s':''}</span>` : '<span class="badge badge-neutral">Clean</span>'}</td>
      <td><button class="btn btn-sm btn-ghost" onclick="nav('report',{id:'${r.id}'})">View / Edit →</button></td>
    </tr>`).join('');

  setContent(`<div class="table-wrap">
    <table>
      <thead><tr><th>Week Start</th><th>Week End</th><th>Submitted</th><th>Edits</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`);
}

// ── Report Detail ─────────────────────────────────────────────────────────────
async function renderReport(id) {
  if (!id) { toast('No report ID', 'error'); return; }
  setTitle('Loading…'); setActions('');
  setContent('<div class="full-center"><div class="spinner"></div></div>');
  const r = await API.get(`/reports/${id}`);
  const isAdmin = S.user.role === 'admin';

  setTitle(`Report — ${fmtDate(r.weekStart)}`);
  const backNav = isAdmin ? `week-reports` : `my-reports`;
  const backLabel = isAdmin ? 'Back to Reports' : 'My Reports';

  let html = `
    <div class="breadcrumb">
      <a href="#" onclick="nav('${backNav}')">${backLabel}</a>
      <span class="sep">›</span>
      <span>${r.locationName}</span>
      <span class="sep">›</span>
      <span>${fmtDate(r.weekStart)}</span>
    </div>
    <div class="report-header">
      <div class="report-fleet"><span>${r.fleetId}</span> — ${r.locationName}</div>
      <div class="report-meta">
        <div class="report-meta-item"><div class="meta-label">REPORT PERIOD</div>${fmtWk(r.weekStart, r.weekEnd)}</div>
        <div class="report-meta-item"><div class="meta-label">SUBMITTED BY</div>${r.submittedByName}</div>
        <div class="report-meta-item"><div class="meta-label">SUBMITTED AT</div>${fmtDT(r.submittedAt)}</div>
        <div class="report-meta-item"><div class="meta-label">TOTAL EDITS</div>${r.sections.reduce((s,sec)=>s+sec.metrics.reduce((ms,m)=>ms+m.changes.length,0),0)}</div>
      </div>
    </div>
    <p style="font-size:12px;color:var(--gray-600);margin-bottom:16px">
      💡 Click any <strong>Value</strong>, <strong>Target</strong>, <strong>Status</strong>, or <strong>Notes</strong> cell to edit it. All changes are logged.
    </p>
    <div class="table-wrap">
      <table>
        <thead><tr><th style="min-width:240px">Metric</th><th>Value</th><th>Target</th><th>Status</th><th>Notes</th><th style="min-width:80px">History</th></tr></thead>
        <tbody>`;

  for (const sec of r.sections) {
    html += `<tr class="section-row"><td colspan="6">${sec.name}</td></tr>`;
    sec.metrics.forEach((m, mi) => {
      const changeCount = m.changes.length;
      const changesHTML = changeCount > 0
        ? `<span class="changes-badge" data-changes='${JSON.stringify(m.changes).replace(/'/g,"&#39;")}' onclick="showChanges(this)">${changeCount} ✎</span>`
        : '<span style="color:var(--gray-400);font-size:11px">—</span>';

      html += `<tr class="${mi%2?'alt':''}">
        <td class="label-cell">${m.label}</td>
        <td><span class="editable-cell" data-rid="${r.id}" data-mid="${m.id}" data-field="value" data-label="${m.label}">${fmtValue(m.value, m.label) || '—'}</span></td>
        <td><span class="editable-cell" data-rid="${r.id}" data-mid="${m.id}" data-field="target" data-label="${m.label}">${m.target || '—'}</span></td>
        <td>${statusBadge(m.status)}<span class="editable-cell" style="display:none" data-rid="${r.id}" data-mid="${m.id}" data-field="status" data-label="${m.label}"></span></td>
        <td><span class="editable-cell" data-rid="${r.id}" data-mid="${m.id}" data-field="notes" data-label="${m.label}" style="min-width:120px">${m.notes || '<span style="color:var(--gray-400)">—</span>'}</span></td>
        <td>${changesHTML}</td>
      </tr>`;
    });
  }

  html += `</tbody></table></div>`;
  setContent(html);
  setupReportEditing();
}

function setupReportEditing() {
  document.querySelectorAll('.editable-cell').forEach(cell => {
    if (cell.style.display === 'none') return;
    cell.addEventListener('click', () => startEdit(cell));
  });
}

function startEdit(cell) {
  if (cell.querySelector('input')) return; // already editing
  const current = cell.dataset.field === 'value' 
    ? (cell.closest('tr').querySelectorAll('.editable-cell')[0]._rawValue || cell.textContent.replace(/[$,]/g,'').trim())
    : cell.textContent.trim();

  const raw = current === '—' ? '' : current;
  cell._originalHTML = cell.innerHTML;
  cell.innerHTML = `<input class="editing-input" value="${raw}" placeholder="edit...">`;
  const inp = cell.querySelector('input');
  inp.focus(); inp.select();

  const commit = () => {
    const newVal = inp.value.trim();
    if (newVal === raw || newVal === cell._originalHTML) { cell.innerHTML = cell._originalHTML; return; }
    openRemarkModal({
      reportId: cell.dataset.rid,
      metricId: cell.dataset.mid,
      field:    cell.dataset.field,
      newValue: newVal,
      label:    cell.dataset.label,
      cell
    });
  };

  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { cell.innerHTML = cell._originalHTML; }
  });
  inp.addEventListener('blur', () => setTimeout(commit, 120));
}

// ── Remark Modal ──────────────────────────────────────────────────────────────
let _pendingEdit = null;

function openRemarkModal(edit) {
  _pendingEdit = edit;
  document.getElementById('remark-desc').textContent = `Editing "${edit.label}" → ${edit.field}: "${edit.newValue}"`;
  document.getElementById('remark-text').value = '';
  document.getElementById('remark-modal').style.display = 'flex';
  document.getElementById('remark-text').focus();
}

function closeRemarkModal() {
  document.getElementById('remark-modal').style.display = 'none';
  if (_pendingEdit?.cell) _pendingEdit.cell.innerHTML = _pendingEdit.cell._originalHTML;
  _pendingEdit = null;
}

async function confirmRemark() {
  const remark = document.getElementById('remark-text').value.trim();
  if (!remark) { document.getElementById('remark-text').style.borderColor = 'var(--red)'; return; }
  document.getElementById('remark-text').style.borderColor = '';
  const e = _pendingEdit;
  document.getElementById('remark-modal').style.display = 'none';
  _pendingEdit = null;
  try {
    const updated = await API.put(`/reports/${e.reportId}/metrics/${e.metricId}`, { field: e.field, value: e.newValue, remark });
    toast('Change saved ✓', 'success');
    // Refresh the report view
    await renderReport(e.reportId);
  } catch (err) {
    toast('Save failed: ' + err.message, 'error');
    if (e.cell) e.cell.innerHTML = e.cell._originalHTML;
  }
}

function showChanges(el) {
  const changes = JSON.parse(el.dataset.changes);
  const entries = changes.map(c => `
    <div class="change-entry">
      <div><span class="change-who">${c.changedByName}</span> <span class="change-when">— ${fmtDT(c.changedAt)}</span></div>
      <div class="change-delta">
        <span style="font-size:12px;color:var(--gray-600)">Field: <em>${c.field}</em> &nbsp;</span>
        <span class="change-old">${c.oldValue || '—'}</span>
        <span style="font-size:11px;color:var(--gray-400)"> → </span>
        <span class="change-new">${c.newValue}</span>
      </div>
      <div class="change-remark">"${c.remark}"</div>
    </div>`).join('');

  // Show as popover near the badge
  const existing = document.getElementById('change-popover');
  if (existing) existing.remove();

  const pop = document.createElement('div');
  pop.id = 'change-popover';
  pop.style.cssText = 'position:fixed;background:#fff;border:1px solid var(--gray-200);border-radius:8px;box-shadow:var(--shadow-lg);padding:14px;max-width:420px;z-index:500;min-width:300px';
  pop.innerHTML = `<div style="font-weight:700;font-size:13px;margin-bottom:10px">Change History (${changes.length})</div><div class="change-log" style="margin:0">${entries}</div><div style="margin-top:10px;text-align:right"><button class="btn btn-sm btn-ghost" onclick="document.getElementById('change-popover').remove()">Close</button></div>`;

  const rect = el.getBoundingClientRect();
  document.body.appendChild(pop);
  pop.style.top  = Math.min(rect.bottom + 6, window.innerHeight - pop.offsetHeight - 10) + 'px';
  pop.style.left = Math.max(10, rect.left - pop.offsetWidth / 2) + 'px';

  setTimeout(() => document.addEventListener('click', function h(e) {
    if (!pop.contains(e.target) && e.target !== el) { pop.remove(); document.removeEventListener('click', h); }
  }), 100);
}

// ── Upload ────────────────────────────────────────────────────────────────────
function renderUpload() {
  setTitle('Upload Weekly Report'); setActions('');
  const locations = S.user.role === 'admin' ? null : null; // loaded below

  const locSelectHTML = S.user.role === 'admin'
    ? `<div class="form-group" id="loc-group"><label class="form-label">Fleet Location</label><select class="form-control" id="loc-sel"><option value="">Loading...</option></select></div>`
    : '';

  setContent(`
    <div class="card" style="max-width:600px">
      <div class="card-title mb-1" style="margin-bottom:20px">Upload Excel Report</div>
      <div class="form-row" style="margin-bottom:16px">
        <div class="form-group"><label class="form-label">Week Start</label><input class="form-control" type="date" id="wk-start"></div>
        <div class="form-group"><label class="form-label">Week End</label><input class="form-control" type="date" id="wk-end"></div>
      </div>
      ${locSelectHTML}
      <div class="upload-zone" id="drop-zone">
        <div class="upload-icon">📊</div>
        <div class="upload-text">Drop Excel file here, or click to browse</div>
        <div class="upload-hint">.xlsx files only · Max 20MB</div>
        <input type="file" id="file-input" accept=".xlsx,.xls" style="display:none">
      </div>
      <div id="file-preview" style="display:none;margin-top:12px" class="flex gap-1 items-center">
        <span style="font-size:18px">📄</span>
        <span id="file-name" style="font-weight:600"></span>
        <button class="btn btn-sm btn-ghost" id="remove-file">Remove</button>
      </div>
      <div id="upload-error" style="display:none;margin-top:12px"></div>
      <div style="margin-top:20px;display:flex;justify-content:flex-end;gap:10px">
        <button class="btn btn-ghost" onclick="nav('my-reports')">Cancel</button>
        <button class="btn btn-primary" id="submit-upload" disabled>Upload & Parse →</button>
      </div>
    </div>`);

  // Load locations for admin
  if (S.user.role === 'admin') {
    API.get('/locations').then(locs => {
      const sel = document.getElementById('loc-sel');
      if (sel) sel.innerHTML = locs.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
    });
  }

  // Default dates to current week
  const now = new Date(); 
  const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = d => d.toISOString().split('T')[0];
  const startEl = document.getElementById('wk-start');
  const endEl   = document.getElementById('wk-end');
  if (startEl) startEl.value = fmt(mon);
  if (endEl)   endEl.value   = fmt(sun);

  let selectedFile = null;
  const zone   = document.getElementById('drop-zone');
  const inp    = document.getElementById('file-input');
  const btn    = document.getElementById('submit-upload');

  const setFile = (f) => {
    selectedFile = f;
    document.getElementById('file-name').textContent = f.name;
    document.getElementById('file-preview').style.display = 'flex';
    btn.disabled = false;
  };

  zone.addEventListener('click', () => inp.click());
  inp.addEventListener('change', () => { if (inp.files[0]) setFile(inp.files[0]); });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });
  document.getElementById('remove-file')?.addEventListener('click', () => {
    selectedFile = null;
    document.getElementById('file-preview').style.display = 'none';
    btn.disabled = true;
    inp.value = '';
  });

  btn.addEventListener('click', async () => {
    const errEl = document.getElementById('upload-error');
    errEl.style.display = 'none';
    if (!selectedFile) return;
    const ws = startEl.value; const we = endEl.value;
    if (!ws || !we) { errEl.className='error-msg'; errEl.textContent='Please set week start and end dates.'; errEl.style.display='block'; return; }
    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('weekStart', ws);
    fd.append('weekEnd', we);
    if (S.user.role === 'admin') fd.append('locationId', document.getElementById('loc-sel').value);
    btn.disabled = true; btn.textContent = 'Uploading…';
    try {
      const r = await API.postForm('/reports/upload', fd);
      toast('Report uploaded successfully ✓', 'success');
      nav('report', { id: r.id });
    } catch (e) {
      errEl.className='error-msg'; errEl.textContent = e.message; errEl.style.display='block';
      btn.disabled = false; btn.textContent = 'Upload & Parse →';
    }
  });
}

// ── Yearly Summary ────────────────────────────────────────────────────────────
let _yearlyData = null;
let _activeFleet = null;
let _chartInstance = null;

async function renderYearly() {
  setTitle('Yearly Summary'); setActions('');
  setContent('<div class="full-center"><div class="spinner"></div></div>');
  _yearlyData = await API.get('/summary/yearly?year=2026');
  const locIds = Object.keys(_yearlyData);
  if (!locIds.length) { setContent('<div class="card empty-state"><div class="empty-title">No data available</div></div>'); return; }
  _activeFleet = _activeFleet || locIds[0];
  renderYearlyContent();
}

function renderYearlyContent() {
  const locIds = Object.keys(_yearlyData);
  const data   = _yearlyData[_activeFleet];
  if (!data) return;

  const tabs = locIds.map(id => `
    <div class="fleet-tab ${id === _activeFleet ? 'active' : ''}" data-lid="${id}">
      ${_yearlyData[id].location.name}
      <span class="text-sm" style="opacity:.6"> · ${_yearlyData[id].location.fleetId}</span>
    </div>`).join('');

  // Also add "All Fleets" tab
  const allTab = `<div class="fleet-tab ${_activeFleet === 'all' ? 'active' : ''}" data-lid="all">All Fleets Combined</div>`;

  const { weeks, series } = data;
  const weekLabels = weeks.map(w => fmtDate(w.start));

  // Build table: rows = metrics, cols = weeks + section header rows
  const sections = {};
  for (const [label, s] of Object.entries(series)) {
    if (!sections[s.section]) sections[s.section] = [];
    sections[s.section].push({ label, ...s });
  }

  let tableRows = '';
  const weekTHs = weekLabels.map(l => `<th style="min-width:90px;text-align:right">${l}</th>`).join('');

  for (const [sec, metrics] of Object.entries(sections)) {
    tableRows += `<tr class="section-row"><td colspan="${weeks.length + 1}">${sec}</td></tr>`;
    metrics.forEach(m => {
      const cells = m.values.map(v => `<td class="num">${v !== null ? fmtValue(String(v), m.label) : '—'}</td>`).join('');
      tableRows += `<tr>
        <td class="label-cell metric-clickable" data-label="${m.label}" title="Click to view chart">${m.label} 📊</td>
        ${cells}
      </tr>`;
    });
  }

  setContent(`
    <div class="fleet-tabs" id="fleet-tabs">${tabs}${allTab}</div>
    <p class="text-sm text-muted" style="margin-bottom:16px">Click any metric name to view its weekly trend chart.</p>
    <div class="table-wrap summary-table">
      <table class="summary-table">
        <thead><tr><th>Metric</th>${weekTHs}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`);

  document.querySelectorAll('.fleet-tab').forEach(el => {
    el.addEventListener('click', () => {
      _activeFleet = el.dataset.lid;
      if (_activeFleet === 'all') renderYearlyCombined();
      else renderYearlyContent();
    });
  });

  document.querySelectorAll('.metric-clickable').forEach(el => {
    el.addEventListener('click', () => showMetricChart(el.dataset.label));
  });
}

function renderYearlyCombined() {
  const locIds = Object.keys(_yearlyData).filter(k => k !== 'all');
  const tabs = locIds.map(id => `
    <div class="fleet-tab" data-lid="${id}">${_yearlyData[id].location.name}</div>`).join('');
  const allTab = `<div class="fleet-tab active" data-lid="all">All Fleets Combined</div>`;

  // Build combined: for each fleet, show totals/averages
  let tableRows = '';
  const loc0 = _yearlyData[locIds[0]];
  const weekLabels = loc0.weeks.map(w => fmtDate(w.start));
  const weekTHs = weekLabels.map(l => `<th style="text-align:right">${l}</th>`).join('');

  const sections = {};
  for (const [label, s] of Object.entries(loc0.series)) {
    if (!sections[s.section]) sections[s.section] = [];
    sections[s.section].push(label);
  }

  for (const [sec, labels] of Object.entries(sections)) {
    tableRows += `<tr class="section-row"><td colspan="${loc0.weeks.length + 1}">${sec} (Combined)</td></tr>`;
    for (const label of labels) {
      const cells = loc0.weeks.map((_, wi) => {
        let total = 0; let count = 0;
        for (const id of locIds) {
          const v = parseFloat(_yearlyData[id]?.series?.[label]?.values?.[wi]);
          if (!isNaN(v)) { total += v; count++; }
        }
        const combined = count ? (label.toLowerCase().includes('rate') || label.toLowerCase().includes('margin') || label.toLowerCase().includes('%') || label.toLowerCase().includes('score') || label.toLowerCase().includes('avg') ? total / count : total) : null;
        return `<td class="num">${combined !== null ? fmtValue(combined.toFixed(1), label) : '—'}</td>`;
      }).join('');
      tableRows += `<tr><td class="label-cell metric-clickable" data-label="${label}" title="Click to view chart">${label} 📊</td>${cells}</tr>`;
    }
  }

  document.getElementById('main-content').innerHTML = `
    <div class="fleet-tabs" id="fleet-tabs">${tabs}${allTab}</div>
    <p class="text-sm text-muted" style="margin-bottom:16px">Summed totals for volume metrics; averages for rate/margin metrics across all fleets.</p>
    <div class="table-wrap summary-table">
      <table class="summary-table">
        <thead><tr><th>Metric</th>${weekTHs}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;

  document.querySelectorAll('.fleet-tab').forEach(el => {
    el.addEventListener('click', () => {
      _activeFleet = el.dataset.lid;
      if (_activeFleet === 'all') renderYearlyCombined();
      else renderYearlyContent();
    });
  });

  document.querySelectorAll('.metric-clickable').forEach(el => {
    el.addEventListener('click', () => showMetricChart(el.dataset.label));
  });
}

function showMetricChart(label) {
  const modal = document.getElementById('chart-modal');
  modal.style.display = 'flex';
  document.getElementById('chart-title').textContent =
    _activeFleet === 'all' ? `${label} — All Fleets` : label;

  if (_chartInstance) { _chartInstance.destroy(); _chartInstance = null; }
  document.getElementById('chart-wrap').innerHTML = '<canvas id="metric-chart"></canvas>';
  const ctx = document.getElementById('metric-chart').getContext('2d');

  const COLORS = ['#FF9900', '#1565C0'];

  if (_activeFleet === 'all') {
    // Two lines — one per fleet
    const locIds = Object.keys(_yearlyData);
    const firstSeries = _yearlyData[locIds[0]].series[label];
    if (!firstSeries) { modal.style.display = 'none'; toast('No data for this metric', 'error'); return; }
    const weekLabels = firstSeries.weeks.map(w => fmtDate(w));

    const datasets = locIds.map((id, i) => {
      const series = _yearlyData[id].series[label];
      const nums = (series?.values || []).map(v => { const n = parseFloat(v); return isNaN(n) ? null : n; });
      return {
        label: _yearlyData[id].location.name,
        data: nums,
        borderColor: COLORS[i] || '#888',
        backgroundColor: (COLORS[i] || '#888') + '18',
        borderWidth: 2.5,
        pointBackgroundColor: COLORS[i] || '#888',
        pointRadius: 5,
        tension: 0.3,
        fill: false
      };
    });

    _chartInstance = new Chart(ctx, {
      type: 'line',
      data: { labels: weekLabels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top' },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmtValue(String(c.parsed.y), label)}` }}
        },
        scales: {
          x: { grid: { color: '#f1f3f4' } },
          y: { grid: { color: '#f1f3f4' }, ticks: { callback: v => fmtValue(String(v), label) } }
        }
      }
    });
  } else {
    // Single fleet line
    const data = _yearlyData[_activeFleet];
    if (!data?.series?.[label]) { modal.style.display = 'none'; toast('No data for this metric', 'error'); return; }
    const { weeks, values } = data.series[label];
    const weekLabels = weeks.map(w => fmtDate(w));
    const nums = values.map(v => { const n = parseFloat(v); return isNaN(n) ? null : n; });

    _chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: weekLabels,
        datasets: [{
          label,
          data: nums,
          borderColor: '#FF9900',
          backgroundColor: 'rgba(255,153,0,0.08)',
          borderWidth: 2.5,
          pointBackgroundColor: '#FF9900',
          pointRadius: 5,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: {
          label: c => ' ' + fmtValue(String(c.parsed.y), label)
        }}},
        scales: {
          x: { grid: { color: '#f1f3f4' } },
          y: { grid: { color: '#f1f3f4' }, ticks: { callback: v => fmtValue(String(v), label) } }
        }
      }
    });
  }
}

function closeChartModal() {
  document.getElementById('chart-modal').style.display = 'none';
  if (_chartInstance) { _chartInstance.destroy(); _chartInstance = null; }
}

// ── Users ─────────────────────────────────────────────────────────────────────
async function renderUsers() {
  setTitle('Users'); setActions('');
  setContent('<div class="full-center"><div class="spinner"></div></div>');
  const [users, locations] = await Promise.all([API.get('/users'), API.get('/locations')]);

  const rows = users.map((u, i) => {
    const loc = locations.find(l => l.id === u.locationId);
    return `<tr class="${i%2?'alt':''}">
      <td><div class="flex items-center gap-1"><div class="user-avatar" style="width:30px;height:30px;font-size:11px">${u.avatar || u.name.split(' ').map(n=>n[0]).join('')}</div><strong>${u.name}</strong></div></td>
      <td><code>${u.username}</code></td>
      <td>${u.email}</td>
      <td><span class="${u.role === 'admin' ? 'tag-admin' : 'tag-manager'}">${u.role}</span></td>
      <td>${loc ? loc.name : '—'}</td>
    </tr>`;
  }).join('');

  setContent(`<div class="table-wrap">
    <table>
      <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Fleet</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`);
}

// ── Profile ───────────────────────────────────────────────────────────────────
async function renderProfile() {
  setTitle('Profile & Settings'); setActions('');
  setContent('<div class="full-center"><div class="spinner"></div></div>');
  const user = await API.get('/users/me');

  setContent(`
    <div style="max-width:560px">
      <div class="card profile-section">
        <div class="avatar-big">${user.avatar || user.name.split(' ').map(n=>n[0]).join('')}</div>
        <h3>Personal Information</h3>
        <div id="profile-msg" style="display:none"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Full Name</label><input class="form-control" id="p-name" value="${user.name}"></div>
          <div class="form-group"><label class="form-label">Email</label><input class="form-control" id="p-email" value="${user.email}"></div>
        </div>
        <div class="form-group"><label class="form-label">Phone</label><input class="form-control" id="p-phone" value="${user.phone || ''}"></div>
        <div class="form-group"><label class="form-label">Username</label><input class="form-control" value="${user.username}" disabled style="opacity:.6"></div>
        <div class="form-group"><label class="form-label">Role</label><input class="form-control" value="${user.role}" disabled style="opacity:.6"></div>
        <button class="btn btn-primary" id="save-profile">Save Changes</button>
      </div>

      <div class="card profile-section">
        <h3>Change Password</h3>
        <div id="pw-msg" style="display:none"></div>
        <div class="form-group"><label class="form-label">Current Password</label><input class="form-control" id="pw-old" type="password" placeholder="Current password"></div>
        <div class="form-group"><label class="form-label">New Password</label><input class="form-control" id="pw-new" type="password" placeholder="Min 6 characters"></div>
        <div class="form-group"><label class="form-label">Confirm New Password</label><input class="form-control" id="pw-confirm" type="password" placeholder="Repeat new password"></div>
        <button class="btn btn-primary" id="change-pw">Change Password</button>
      </div>
    </div>`);

  document.getElementById('save-profile')?.addEventListener('click', async () => {
    const msgEl = document.getElementById('profile-msg');
    try {
      const updated = await API.put('/users/me', {
        name:  document.getElementById('p-name').value.trim(),
        email: document.getElementById('p-email').value.trim(),
        phone: document.getElementById('p-phone').value.trim(),
      });
      S.user = { ...S.user, ...updated };
      localStorage.setItem('fm_user', JSON.stringify(S.user));
      msgEl.className = 'success-msg'; msgEl.textContent = '✓ Profile updated successfully.'; msgEl.style.display = 'block';
      toast('Profile saved ✓', 'success');
      // Update sidebar avatar/name
      renderApp(); nav('profile');
    } catch (e) {
      msgEl.className = 'error-msg'; msgEl.textContent = e.message; msgEl.style.display = 'block';
    }
  });

  document.getElementById('change-pw')?.addEventListener('click', async () => {
    const msgEl = document.getElementById('pw-msg');
    const oldP  = document.getElementById('pw-old').value;
    const newP  = document.getElementById('pw-new').value;
    const conf  = document.getElementById('pw-confirm').value;
    if (newP !== conf) { msgEl.className='error-msg'; msgEl.textContent='New passwords do not match.'; msgEl.style.display='block'; return; }
    try {
      await API.post('/auth/change-password', { oldPassword: oldP, newPassword: newP });
      msgEl.className = 'success-msg'; msgEl.textContent = '✓ Password changed. Please log in again.'; msgEl.style.display = 'block';
      toast('Password changed ✓', 'success');
      setTimeout(() => { clearSession(); S.view = 'login'; renderApp(); }, 2000);
    } catch (e) {
      msgEl.className = 'error-msg'; msgEl.textContent = e.message; msgEl.style.display = 'block';
    }
  });
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeRemarkModal();
    closeChartModal();
    document.getElementById('change-popover')?.remove();
  }
});

// ── Modal close wiring ────────────────────────────────────────────────────────
// Chart modal: ✕ button (wired by id, not inline onclick)
document.addEventListener('click', e => {
  if (e.target.id === 'chart-close-btn') { closeChartModal(); return; }
  // Click on the dark overlay backdrop (not the white box) → close
  if (e.target.id === 'chart-modal')  { closeChartModal(); return; }
  if (e.target.id === 'remark-modal') { closeRemarkModal(); return; }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
loadSession();
if (S.user) {
  S.view = S.user.role === 'admin' ? 'overview' : 'my-reports';
} else {
  S.view = 'login';
}
renderApp();
