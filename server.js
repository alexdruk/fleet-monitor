const express  = require('express');
const fs        = require('fs');
const path      = require('path');
const jwt       = require('jsonwebtoken');
const multer    = require('multer');
const XLSX      = require('xlsx');

const app    = express();
const PORT = process.env.PORT || 3000;
const SECRET = 'fleet-monitor-jwt-secret-2026';
const DB     = path.join(__dirname, 'data/db.json');

// ── Ensure DB exists before anything else ────────────────────────────────────
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(DB)) {
  console.log('No database found — seeding now...');
  try {
    require('child_process').execSync('node seed.js', { cwd: __dirname, stdio: 'inherit' });
    console.log('Seed complete.');
  } catch(e) {
    console.error('Seed failed:', e.message);
    process.exit(1);
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── DB helpers ────────────────────────────────────────────────────────────────
const readDB = () => {
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); }
  catch(e) { console.error('readDB error:', e.message); return { users:[], locations:[], reports:[] }; }
};
const writeDB = (db) => fs.writeFileSync(DB, JSON.stringify(db, null, 2));

// ── Auth middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(h.split(' ')[1], SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ── Auth routes ───────────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const db   = readDB();
  const user = db.users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name, locationId: user.locationId },
    SECRET, { expiresIn: '24h' }
  );
  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

app.post('/api/auth/change-password', auth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  const db   = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user || user.password !== oldPassword) return res.status(400).json({ error: 'Current password is incorrect' });
  user.password = newPassword;
  writeDB(db);
  res.json({ success: true });
});

// ── User routes ───────────────────────────────────────────────────────────────
app.get('/api/users/me', auth, (req, res) => {
  const db   = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { password: _, ...safe } = user;
  res.json(safe);
});

app.put('/api/users/me', auth, (req, res) => {
  const { name, email, phone } = req.body;
  const db   = readDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  if (name)  user.name  = name;
  if (email) user.email = email;
  if (phone) user.phone = phone;
  writeDB(db);
  const { password: _, ...safe } = user;
  res.json(safe);
});

app.get('/api/users', auth, adminOnly, (req, res) => {
  const db = readDB();
  res.json(db.users.map(({ password: _, ...u }) => u));
});

// ── Location routes ───────────────────────────────────────────────────────────
app.get('/api/locations', auth, (req, res) => {
  const db = readDB();
  if (req.user.role === 'admin') return res.json(db.locations);
  res.json(db.locations.filter(l => l.id === req.user.locationId));
});

// ── Report routes ─────────────────────────────────────────────────────────────
app.get('/api/reports', auth, (req, res) => {
  const db  = readDB();
  let list  = db.reports;
  if (req.user.role !== 'admin') list = list.filter(r => r.locationId === req.user.locationId);

  const { locationId, weekStart } = req.query;
  if (locationId) list = list.filter(r => r.locationId === parseInt(locationId));
  if (weekStart)  list = list.filter(r => r.weekStart === weekStart);

  res.json(list.map(r => {
    const loc = db.locations.find(l => l.id === r.locationId);
    const changes = r.sections.reduce((s, sec) => s + sec.metrics.reduce((ms, m) => ms + m.changes.length, 0), 0);
    return { id:r.id, locationId:r.locationId, locationName:loc?.name, fleetId:loc?.fleetId,
             weekStart:r.weekStart, weekEnd:r.weekEnd, submittedBy:r.submittedBy,
             submittedByName:r.submittedByName, submittedAt:r.submittedAt, changeCount:changes };
  }));
});

app.get('/api/reports/:id', auth, (req, res) => {
  const db = readDB();
  const r  = db.reports.find(r => r.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  if (req.user.role !== 'admin' && r.locationId !== req.user.locationId)
    return res.status(403).json({ error: 'Access denied' });
  const loc = db.locations.find(l => l.id === r.locationId);
  res.json({ ...r, locationName: loc?.name, fleetId: loc?.fleetId });
});

app.post('/api/reports/upload', auth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const { weekStart, weekEnd, locationId: locParam } = req.body;
    if (!weekStart || !weekEnd) return res.status(400).json({ error: 'weekStart and weekEnd required' });

    const locationId = req.user.role === 'admin' ? parseInt(locParam) : req.user.locationId;
    const db = readDB();

    if (db.reports.find(r => r.locationId === locationId && r.weekStart === weekStart))
      return res.status(409).json({ error: `A report for week ${weekStart} already exists for this fleet.` });

    const wb      = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet   = wb.Sheets[wb.SheetNames[0]];
    const rows    = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    const sections = parseExcelRows(rows);

    const report = {
      id: `r-${locationId}-${weekStart}`,
      locationId,
      weekStart,
      weekEnd,
      submittedBy: req.user.id,
      submittedByName: req.user.name,
      submittedAt: new Date().toISOString(),
      sections
    };

    db.reports.push(report);
    writeDB(db);

    const loc = db.locations.find(l => l.id === locationId);
    res.json({ ...report, locationName: loc?.name, fleetId: loc?.fleetId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Parse failed: ' + err.message });
  }
});

app.put('/api/reports/:reportId/metrics/:metricId', auth, (req, res) => {
  const { field, value, remark } = req.body;
  if (!field || value === undefined) return res.status(400).json({ error: 'field and value required' });

  const db = readDB();
  const r  = db.reports.find(r => r.id === req.params.reportId);
  if (!r) return res.status(404).json({ error: 'Report not found' });
  if (req.user.role !== 'admin' && r.locationId !== req.user.locationId)
    return res.status(403).json({ error: 'Access denied' });

  let metric = null;
  for (const sec of r.sections) {
    metric = sec.metrics.find(m => m.id === req.params.metricId);
    if (metric) break;
  }
  if (!metric) return res.status(404).json({ error: 'Metric not found' });

  const oldValue = metric[field];
  metric[field]  = value;
  metric.changes.push({
    changedAt:      new Date().toISOString(),
    changedBy:      req.user.id,
    changedByName:  req.user.name,
    field,
    oldValue,
    newValue:       value,
    remark:         remark || '(no remark)'
  });

  writeDB(db);
  res.json(metric);
});

// ── Summary route ─────────────────────────────────────────────────────────────
app.get('/api/summary/yearly', auth, adminOnly, (req, res) => {
  const db   = readDB();
  const year = req.query.year || '2026';
  const locs = db.locations;
  const summary = {};

  for (const loc of locs) {
    const reports = db.reports
      .filter(r => r.locationId === loc.id && r.weekStart.startsWith(year))
      .sort((a,b) => a.weekStart.localeCompare(b.weekStart));

    // Collect all unique metric labels
    const metricMeta = {};
    for (const r of reports) {
      for (const sec of r.sections) {
        for (const m of sec.metrics) {
          if (!metricMeta[m.label]) metricMeta[m.label] = { label: m.label, section: sec.name };
        }
      }
    }

    // Build weekly series per metric label
    const series = {};
    for (const label of Object.keys(metricMeta)) {
      series[label] = { ...metricMeta[label], weeks: [], values: [] };
    }
    for (const r of reports) {
      const metByLabel = {};
      for (const sec of r.sections)
        for (const m of sec.metrics)
          metByLabel[m.label] = m.value;
      for (const label of Object.keys(metricMeta)) {
        series[label].weeks.push(r.weekStart);
        series[label].values.push(metByLabel[label] ?? null);
      }
    }

    summary[loc.id] = {
      location: loc,
      reportCount: reports.length,
      weeks: reports.map(r => ({ start: r.weekStart, end: r.weekEnd })),
      series
    };
  }

  res.json(summary);
});

// ── Excel parser ──────────────────────────────────────────────────────────────
function parseExcelRows(rows) {
  const sections = [];
  let cur = null;
  let dataStarted = false;
  let mIdx = 0;

  for (let i = 0; i < rows.length; i++) {
    const row  = rows[i];
    const colA = String(row[0] ?? '').trim();
    const colB = String(row[1] ?? '').trim();
    const colC = String(row[2] ?? '').trim();
    const colD = String(row[3] ?? '').trim();
    const colE = String(row[4] ?? '').trim();

    // Detect header row
    if (!dataStarted && colA.toUpperCase().includes('METRIC')) { dataStarted = true; continue; }
    if (!dataStarted && i < 3) continue; // skip top title rows
    if (!colA) continue;

    // Section header: has col A, empty B, and looks like a section name
    const likelySectionHeader = !colB && colA.length > 4 &&
      (colA === colA.toUpperCase() || /[&()]/.test(colA));

    if (likelySectionHeader) {
      cur = { id: colA.toLowerCase().replace(/\W+/g,'_').slice(0,30), name: colA, metrics: [] };
      sections.push(cur);
    } else {
      if (!cur) { cur = { id: 'data', name: 'Report Data', metrics: [] }; sections.push(cur); }
      cur.metrics.push({
        id:      `uploaded-${++mIdx}`,
        label:    colA,
        value:    colB,
        target:   colC,
        status:   colD,
        notes:    colE,
        changes:  []
      });
    }
  }

  if (sections.length === 0) {
    // Fallback: two-column generic parse
    const sec = { id: 'data', name: 'Report Data', metrics: [] };
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0]) continue;
      sec.metrics.push({ id:`uploaded-${i}`, label:String(row[0]), value:String(row[1]??''), target:String(row[2]??''), status:String(row[3]??''), notes:String(row[4]??''), changes:[] });
    }
    sections.push(sec);
  }
  return sections;
}

app.listen(PORT, () => {
  console.log(`\n🚚 Fleet Monitor running → http://localhost:${PORT}`);
  console.log('─────────────────────────────────────────');
  console.log('  admin     / admin123');
  console.log('  manager1  / manager123   (SoCal Express Fleet)');
  console.log('  manager2  / manager123   (Pacific Northwest Prime)');
  console.log('─────────────────────────────────────────\n');
});
