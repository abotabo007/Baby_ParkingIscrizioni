/**
 * Arcobaleno dei Bimbi — Backend Iscrizioni
 * Node.js + Express + PostgreSQL (Railway)
 */
'use strict';

const express = require('express');
const { Pool } = require('pg');
const path    = require('path');
const crypto  = require('crypto');

/* ── CONFIG ── */
const PORT      = process.env.PORT      || 3000;
const ADMIN_PWD = process.env.ADMIN_PWD || 'arcobaleno2026';

/* ── POSTGRES ── */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

/* ── INIT TABELLE ── */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS iscrizioni (
      id            TEXT PRIMARY KEY,
      timestamp     TEXT NOT NULL,
      bambino_nome  TEXT,
      bambino_dnasc TEXT,
      bambino_cf    TEXT,
      padre_nome    TEXT,
      padre_cf      TEXT,
      madre_nome    TEXT,
      madre_cf      TEXT,
      situazione    TEXT,
      allergie      TEXT,
      tetano        TEXT,
      fv_real       TEXT,
      consenso      TEXT,
      delegati      TEXT,
      json_completo TEXT NOT NULL,
      creato_il     BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
      eliminato     INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_bambino ON iscrizioni(bambino_nome);
    CREATE INDEX IF NOT EXISTS idx_creato  ON iscrizioni(creato_il DESC);

    CREATE TABLE IF NOT EXISTS sessioni_admin (
      token     TEXT PRIMARY KEY,
      scade_il  BIGINT NOT NULL
    );
  `);
  console.log('  ✅  Database pronto');
}

/* ── RATE LIMITER puro JS ── */
const _rl = new Map();
function rateLimit(windowMs, max) {
  return (req, res, next) => {
    const key = (req.ip || '') + '|' + req.path;
    const now = Date.now();
    const e   = _rl.get(key) || { n: 0, t: now };
    if (now - e.t > windowMs) { e.n = 0; e.t = now; }
    e.n++;
    _rl.set(key, e);
    if (e.n > max) return res.status(429).json({ ok: false, errore: 'Troppe richieste, riprova tra un minuto.' });
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k,v] of _rl) if (now-v.t > 600_000) _rl.delete(k); }, 600_000);

/* ── EXPRESS ── */
const app = express();
app.set('trust proxy', 1); // Railway sta dietro un proxy
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ── AUTH ── */
async function auth(req, res, next) {
  const tok = req.headers['x-admin-token'];
  if (!tok) return res.status(401).json({ ok: false, errore: 'Non autorizzato' });
  const now = Math.floor(Date.now() / 1000);
  const { rows } = await pool.query(
    'SELECT token FROM sessioni_admin WHERE token=$1 AND scade_il>$2',
    [tok, now]
  );
  if (!rows.length) return res.status(401).json({ ok: false, errore: 'Sessione scaduta — effettua di nuovo il login' });
  next();
}

/* ══ API PUBBLICA ══ */

// POST /api/iscrizioni
app.post('/api/iscrizioni', rateLimit(60_000, 30), async (req, res) => {
  const m = req.body;
  if (!m?.bambino?.nome) return res.status(400).json({ ok: false, errore: 'Nome bambino obbligatorio' });

  const id = m.id || ('isc_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex'));
  const ts = m.timestamp || new Date().toLocaleString('it-IT');

  try {
    await pool.query(`
      INSERT INTO iscrizioni
        (id,timestamp,bambino_nome,bambino_dnasc,bambino_cf,
         padre_nome,padre_cf,madre_nome,madre_cf,
         situazione,allergie,tetano,fv_real,consenso,delegati,json_completo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    `, [
      id, ts,
      m.bambino?.nome  || null, m.bambino?.dnasc || null, m.bambino?.cf   || null,
      m.padre?.nome    || null, m.padre?.cf      || null,
      m.madre?.nome    || null, m.madre?.cf      || null,
      m.situazione     || null, m.medico?.allergie || null,
      m.medico?.tetano || null, m.fv?.realizzazione || null,
      m.consenso_att   || null,
      JSON.stringify(m.delega?.persone || []),
      JSON.stringify(m),
    ]);
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err.message);
    if (err.code === '23505') return res.status(409).json({ ok: false, errore: 'ID duplicato' });
    res.status(500).json({ ok: false, errore: 'Errore server' });
  }
});

/* ══ API ADMIN ══ */

// POST /api/admin/login
app.post('/api/admin/login', rateLimit(300_000, 10), async (req, res) => {
  if (req.body?.password !== ADMIN_PWD)
    return res.status(401).json({ ok: false, errore: 'Password errata' });

  const token   = crypto.randomBytes(32).toString('hex');
  const scadeIl = Math.floor(Date.now() / 1000) + 28800; // 8 ore
  await pool.query('INSERT INTO sessioni_admin (token,scade_il) VALUES ($1,$2)', [token, scadeIl]);
  res.json({ ok: true, token });
});

// POST /api/admin/logout
app.post('/api/admin/logout', auth, async (req, res) => {
  await pool.query('DELETE FROM sessioni_admin WHERE token=$1', [req.headers['x-admin-token']]);
  res.json({ ok: true });
});

// GET /api/admin/iscrizioni?q=ricerca
app.get('/api/admin/iscrizioni', auth, async (req, res) => {
  try {
    const q = req.query.q?.trim();
    let rows;
    if (q) {
      const like = `%${q}%`;
      ({ rows } = await pool.query(`
        SELECT id,timestamp,bambino_nome,bambino_dnasc,padre_nome,madre_nome,
               situazione,allergie,tetano,fv_real,delegati,json_completo,creato_il
        FROM iscrizioni
        WHERE eliminato=0
          AND (bambino_nome ILIKE $1 OR padre_nome ILIKE $1 OR madre_nome ILIKE $1 OR bambino_cf ILIKE $1)
        ORDER BY creato_il DESC LIMIT 50
      `, [like]));
    } else {
      ({ rows } = await pool.query(`
        SELECT id,timestamp,bambino_nome,bambino_dnasc,padre_nome,madre_nome,
               situazione,allergie,tetano,fv_real,delegati,json_completo,creato_il
        FROM iscrizioni WHERE eliminato=0 ORDER BY creato_il DESC
      `));
    }

    const data = rows.map(r => {
      try {
        const m = JSON.parse(r.json_completo);
        // Rimuovi firme base64 dalla lista (pesanti, servono solo in stampa)
        Object.keys(m).forEach(k => {
          if (k.startsWith('firma_') && typeof m[k] === 'string' && m[k].length > 200)
            m[k] = '__firma_presente__';
        });
        m._id = r.id; m._timestamp = r.timestamp; m._creato_il = r.creato_il;
        return m;
      } catch { return null; }
    }).filter(Boolean);

    res.json({ ok: true, data, totale: data.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, errore: 'Errore server' });
  }
});

// GET /api/admin/iscrizioni/:id  — con firme complete per la stampa
app.get('/api/admin/iscrizioni/:id', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT json_completo FROM iscrizioni WHERE id=$1 AND eliminato=0',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, errore: 'Non trovata' });
    res.json({ ok: true, data: JSON.parse(rows[0].json_completo) });
  } catch {
    res.status(500).json({ ok: false, errore: 'Errore server' });
  }
});

// DELETE /api/admin/iscrizioni/:id
app.delete('/api/admin/iscrizioni/:id', auth, async (req, res) => {
  const { rowCount } = await pool.query(
    'UPDATE iscrizioni SET eliminato=1 WHERE id=$1 AND eliminato=0',
    [req.params.id]
  );
  if (rowCount === 0) return res.status(404).json({ ok: false, errore: 'Non trovata' });
  res.json({ ok: true });
});

// GET /api/admin/stats
app.get('/api/admin/stats', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*) AS n FROM iscrizioni WHERE eliminato=0');
  res.json({ ok: true, totale: parseInt(rows[0].n) });
});

// GET /api/admin/export/csv
app.get('/api/admin/export/csv', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id,timestamp,bambino_nome,bambino_dnasc,padre_nome,madre_nome,situazione,allergie,tetano,fv_real,delegati FROM iscrizioni WHERE eliminato=0 ORDER BY creato_il DESC'
  );
  const esc = v => `"${String(v||'').replace(/"/g,'""')}"`;
  const csv = [
    'ID,Data,Bambino,Nato_il,Padre,Madre,Situazione,Allergie,Tetano,Foto_Video,Delegati',
    ...rows.map(r => [r.id,r.timestamp,r.bambino_nome,r.bambino_dnasc,
                      r.padre_nome,r.madre_nome,r.situazione,
                      r.allergie,r.tetano,r.fv_real,r.delegati].map(esc).join(','))
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="iscrizioni_${new Date().toISOString().slice(0,10)}.csv"`);
  res.send('\uFEFF' + csv);
});

// Fallback SPA
app.get('*', (_req, res) => res.sendFile(path.join(__dirname,'..','public','index.html')));

/* ── AVVIO ── */
initDB().then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('  🌈  Arcobaleno dei Bimbi — Server Iscrizioni');
    console.log(`  ✅  http://localhost:${PORT}`);
    console.log(`  🔐  Password admin: ${ADMIN_PWD}`);
    console.log('');
  });
}).catch(err => {
  console.error('Errore connessione database:', err.message);
  process.exit(1);
});

// Pulizia sessioni scadute ogni ora
setInterval(async () => {
  await pool.query('DELETE FROM sessioni_admin WHERE scade_il < $1', [Math.floor(Date.now()/1000)]);
}, 3_600_000);
