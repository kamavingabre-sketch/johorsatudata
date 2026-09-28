const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const initSqlJs = require('sql.js');
const { DATA_DIR } = require('./config');

const DB_FILE = path.join(DATA_DIR, 'app.db');

const ENUMS = {
  JENIS: ['PT', 'CV', 'YAYASAN', 'PERSEORANGAN'],
  KATEGORI: [
    'PERDAGANGAN',
    'KULINER',
    'JASA PERAWATAN KECANTIKAN',
    'JASA PERBAIKAN DAN TEKNIK',
    'LAUNDRY DAN DOORSMEER',
    'PRODUKSI DAN INDUSTRI RUMAH TANGGA',
    'PERTANIAN',
    'PERIKANAN',
    'PETERNAKAN',
  ],
  KEAMANAN: ['LENGKAP', 'KURANG LENGKAP', 'TIDAK LENGKAP'],
  FIELD_TYPES: ['text', 'number', 'date', 'select', 'yesno', 'phone', 'photo'],
  JENIS_BENCANA: ['BANJIR', 'ANGIN PUTING BELIUNG'],
  AGAMA: ['ISLAM', 'KRISTEN PROTESTAN', 'KATOLIK', 'HINDU', 'BUDDHA', 'KONGHUCU'],
};

// Wrapper untuk sql.js yang kompatibel dengan API better-sqlite3
class Database {
  constructor(sqlDb) {
    this._db = sqlDb;
    this._saveTimer = null;
  }

  prepare(sql) {
    const db = this._db;
    const self = this;

    function normalizeParams(params) {
      // If single object argument → named params (for sql.js, use @ prefix to match SQL)
      if (params.length === 1 && params[0] && typeof params[0] === 'object' && !Array.isArray(params[0])) {
        const obj = params[0];
        const result = {};
        for (const [k, v] of Object.entries(obj)) {
          // sql.js named params: @name matches @name in SQL
          result['@' + k] = v;
        }
        return result;
      }
      // Otherwise → positional array
      return params;
    }

    function execStmt(sqlToRun, boundParams) {
      const stmt = db.prepare(sqlToRun);
      if (boundParams && (Array.isArray(boundParams) ? boundParams.length : Object.keys(boundParams).length)) {
        stmt.bind(boundParams);
      }
      return stmt;
    }

    return {
      run(...params) {
        const p = normalizeParams(params);
        db.run(sql, p);
        self._scheduleSave();
        const row = db.exec('SELECT last_insert_rowid() as id');
        return { lastInsertRowid: row.length ? row[0].values[0][0] : 0 };
      },
      get(...params) {
        const p = normalizeParams(params);
        const stmt = execStmt(sql, p);
        if (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          stmt.free();
          const row = {};
          cols.forEach((c, i) => (row[c] = vals[i]));
          return row;
        }
        stmt.free();
        return undefined;
      },
      all(...params) {
        const p = normalizeParams(params);
        const stmt = execStmt(sql, p);
        const rows = [];
        while (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          const row = {};
          cols.forEach((c, i) => (row[c] = vals[i]));
          rows.push(row);
        }
        stmt.free();
        return rows;
      },
    };
  }

  exec(sql) {
    this._db.exec(sql);
    this._scheduleSave();
  }

  pragma(s) {
    try {
      this._db.exec('PRAGMA ' + s);
    } catch {}
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), 1000);
  }

  _save() {
    try {
      const data = this._db.export();
      fs.writeFileSync(DB_FILE, Buffer.from(data));
    } catch (e) {
      console.error('[db] save error:', e.message);
    }
  }

  saveNow() {
    this._save();
  }
}

let db;

async function init() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_FILE)) {
    const buf = fs.readFileSync(DB_FILE);
    db = new Database(new SQL.Database(buf));
  } else {
    db = new Database(new SQL.Database());
  }
  db.pragma('foreign_keys = ON');

  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    nama TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('superadmin','admin')),
    password_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    must_reset INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    options TEXT NOT NULL DEFAULT '[]',
    required INTEGER NOT NULL DEFAULT 0,
    is_system INTEGER NOT NULL DEFAULT 0,
    system_key TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_code TEXT UNIQUE,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    nama_usaha TEXT NOT NULL,
    jenis_kepemilikan TEXT NOT NULL,
    kategori_usaha TEXT NOT NULL,
    izin_usaha INTEGER NOT NULL DEFAULT 0,
    izin_foto TEXT,
    nama_pic TEXT NOT NULL,
    hp_pic TEXT NOT NULL,
    kelengkapan_keamanan TEXT NOT NULL,
    foto_usaha TEXT,
    alamat TEXT NOT NULL,
    lat REAL,
    lng REAL,
    extra TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    user_nama TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id INTEGER,
    target_name TEXT,
    detail TEXT,
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS disasters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_code TEXT UNIQUE,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    nama_lokasi TEXT NOT NULL,
    alamat TEXT NOT NULL,
    jenis_bencana TEXT NOT NULL,
    penyebab TEXT NOT NULL,
    jumlah_rumah TEXT,
    jumlah_kk TEXT,
    deskripsi TEXT,
    foto TEXT,
    titik_kumpul TEXT,
    lat REAL,
    lng REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS worship_places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_code TEXT UNIQUE,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    nama TEXT NOT NULL,
    jenis TEXT NOT NULL,
    agama TEXT NOT NULL DEFAULT '',
    alamat TEXT NOT NULL,
    nama_pengelola TEXT,
    hp_pengelola TEXT,
    foto TEXT,
    lat REAL,
    lng REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );
  `);

  // Migrations for existing databases
  try { db.exec("ALTER TABLE worship_places ADD COLUMN agama TEXT NOT NULL DEFAULT ''"); } catch {}

  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_biz_owner ON businesses(owner_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_biz_kategori ON businesses(kategori_usaha)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_disasters_owner ON disasters(owner_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_worship_owner ON worship_places(owner_id)`);

  seed();
  db.saveNow();
}

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('Johor2026!', 10);
    db.prepare(
      'INSERT INTO users (username, nama, role, password_hash, must_reset) VALUES (?,?,?,?,1)'
    ).run('superadmin', 'Super Administrator', 'superadmin', hash);
    console.log('[seed] Akun superadmin dibuat -> username: superadmin, password sementara: Johor2026!');
  }

  const fieldCount = db.prepare('SELECT COUNT(*) c FROM fields').get().c;
  if (fieldCount === 0) {
    const sys = [
      ['Nama Usaha', 'text', [], 1, 'nama_usaha'],
      ['Jenis Kepemilikan Usaha', 'select', ENUMS.JENIS, 1, 'jenis_kepemilikan'],
      ['Kategori Usaha', 'select', ENUMS.KATEGORI, 1, 'kategori_usaha'],
      ['Izin Usaha', 'yesno', [], 1, 'izin_usaha'],
      ['Nama Penanggung Jawab', 'text', [], 1, 'nama_pic'],
      ['Nomor HP Penanggung Jawab', 'phone', [], 1, 'hp_pic'],
      ['Kelengkapan Keselamatan', 'select', ENUMS.KEAMANAN, 1, 'kelengkapan_keamanan'],
      ['Foto Usaha', 'photo', [], 1, 'foto_usaha'],
      ['Lokasi Usaha', 'location', [], 1, 'lokasi_usaha'],
    ];
    const ins = db.prepare(
      'INSERT INTO fields (label, type, options, required, is_system, system_key, sort) VALUES (?,?,?,?,1,?,?)'
    );
    sys.forEach((f, i) => ins.run(f[0], f[1], JSON.stringify(f[2]), f[3], f[4], i + 1));

    db.prepare(
      'INSERT INTO fields (label, type, options, required, is_system, sort) VALUES (?,?,?,0,0,?)'
    ).run('Kelurahan / Perumahan', 'text', '[]', 10);
  }
}

function logAction({ userId, username, nama, action, targetType, targetId, targetName, detail, ip }) {
  db.prepare(
    `INSERT INTO activity_logs (user_id, username, user_nama, action, target_type, target_id, target_name, detail, ip)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    userId ?? null,
    username ?? null,
    nama ?? null,
    action,
    targetType ?? null,
    targetId ?? null,
    targetName ?? null,
    detail ?? null,
    ip ?? null
  );
}

function genRefCode(seq, date = new Date()) {
  const y = date.getUTCFullYear();
  return `MJS-${y}-${String(seq).padStart(4, '0')}`;
}

function getDb() {
  if (!db) throw new Error('Database belum diinisialisasi. Panggil await init() terlebih dahulu.');
  return db;
}

// Proxy agar `const { db } = require('./db')` tetap bekerja walau db baru tersedia setelah async init()
const dbProxy = new Proxy(
  {},
  {
    get(target, prop) {
      const d = getDb();
      const val = d[prop];
      return typeof val === 'function' ? val.bind(d) : val;
    },
  }
);

module.exports = { db: dbProxy, init, getDb, ENUMS, logAction, genRefCode };
