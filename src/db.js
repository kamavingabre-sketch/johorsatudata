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
  KELURAHAN: ['Suka Maju', 'Titi Kuning', 'Kedai Durian', 'Pangkalan Masyhur', 'Gedung Johor', 'Kwala Bekala'],
  JABATAN: ['ASN', 'LURAH', 'KEPLING'],
  SKALA_USAHA: ['USAHA MIKRO', 'USAHA KECIL', 'USAHA SEDANG', 'USAHA BESAR'],
  JUMLAH_PEKERJA: ['DIBAWAH 10', 'DIBAWAH 30', 'DIBAWAH 50', 'DIBAWAH 100', 'DIBAWAH 300', 'DIBAWAH 500', 'DIATAS 500'],
};

// Label tampilan (Title Case) untuk nilai enum tersimpan (UPPERCASE)
const LABELS = {
  SKALA_USAHA: { 'USAHA MIKRO': 'Usaha Mikro', 'USAHA KECIL': 'Usaha Kecil', 'USAHA SEDANG': 'Usaha Sedang', 'USAHA BESAR': 'Usaha Besar' },
  JUMLAH_PEKERJA: {
    'DIBAWAH 10': 'Dibawah 10', 'DIBAWAH 30': 'Dibawah 30', 'DIBAWAH 50': 'Dibawah 50', 'DIBAWAH 100': 'Dibawah 100',
    'DIBAWAH 300': 'Dibawah 300', 'DIBAWAH 500': 'Dibawah 500', 'DIATAS 500': 'Diatas 500',
  },
};

// Normalisasi generik: cocokkan tanpa peduli huruf besar/kecil & spasi ganda ke daftar enum; null jika tidak valid
function normEnum(list, v) {
  const t = String(v || '').trim().replace(/\s+/g, ' ').toUpperCase();
  return list.find((x) => x.toUpperCase() === t) || null;
}

// Cocokkan input (tanpa peduli huruf besar/kecil) ke nama kelurahan resmi; null jika tidak valid
function normKelurahan(v) {
  const t = String(v || '').trim().toLowerCase();
  return ENUMS.KELURAHAN.find((k) => k.toLowerCase() === t) || null;
}

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

  CREATE TABLE IF NOT EXISTS data_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    icon TEXT,
    description TEXT,
    table_name TEXT NOT NULL UNIQUE,
    is_system INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS data_category_fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES data_categories(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('text', 'textarea', 'number', 'date', 'select', 'yesno', 'phone', 'photo', 'location')),
    options TEXT NOT NULL DEFAULT '[]',
    required INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT
  );
  `);

  // Migrations for existing databases
  try { db.exec("ALTER TABLE worship_places ADD COLUMN agama TEXT NOT NULL DEFAULT ''"); } catch {}

  // Migrasi: kelurahan + titik kumpul (koordinat & foto)
  for (const sql of [
    'ALTER TABLE businesses ADD COLUMN kelurahan TEXT',
    'ALTER TABLE disasters ADD COLUMN kelurahan TEXT',
    'ALTER TABLE worship_places ADD COLUMN kelurahan TEXT',
    'ALTER TABLE disasters ADD COLUMN titik_kumpul_lat REAL',
    'ALTER TABLE disasters ADD COLUMN titik_kumpul_lng REAL',
    'ALTER TABLE disasters ADD COLUMN titik_kumpul_foto TEXT',
    // Pendaftaran akun: kelurahan tugas & jabatan pengguna
    'ALTER TABLE users ADD COLUMN kelurahan TEXT',
    'ALTER TABLE users ADD COLUMN jabatan TEXT',
    "ALTER TABLE users ADD COLUMN approval TEXT NOT NULL DEFAULT 'approved'",
    'ALTER TABLE users ADD COLUMN hp TEXT',
    // Skala usaha & jumlah pekerja pada data usaha
    'ALTER TABLE businesses ADD COLUMN skala_usaha TEXT',
    'ALTER TABLE businesses ADD COLUMN jumlah_pekerja TEXT',
  ]) {
    try { db.exec(sql); } catch {}
  }
  // Pendaftaran mandiri dihentikan: semua akun otomatis disetujui (dibuat oleh Superadmin)
  try { db.prepare("UPDATE users SET approval='approved' WHERE approval IS NOT 'approved'").run(); } catch {}

  // Indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_biz_owner ON businesses(owner_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_biz_kategori ON businesses(kategori_usaha)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_disasters_owner ON disasters(owner_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_worship_owner ON worship_places(owner_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_biz_kel ON businesses(kelurahan)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_dis_kel ON disasters(kelurahan)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_wor_kel ON worship_places(kelurahan)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_biz_skala ON businesses(skala_usaha)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_biz_pekerja ON businesses(jumlah_pekerja)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_kel ON users(kelurahan)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_dcat_active ON data_categories(active)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_dcat_field_cat ON data_category_fields(category_id)`);

  // Seed default data categories
  seedDataCategories();

  seed();
  db.saveNow();
}

function seedDataCategories() {
  const catCount = db.prepare('SELECT COUNT(*) c FROM data_categories').get().c;
  if (catCount === 0) {
    // Data Usaha
    const bizCat = db.prepare('INSERT INTO data_categories (name, display_name, icon, description, table_name, is_system, sort) VALUES (?,?,?,?,?,?,?)').run(
      'business', 'Data Usaha', 'store', 'Data usaha dan UMKM di Kecamatan Medan Johor', 'businesses', 1, 1
    );
    const bizCatId = bizCat.lastInsertRowid;
    const bizFields = [
      { label: 'Nama Usaha', name: 'nama_usaha', type: 'text', required: 1, sort: 1, is_system: 1 },
      { label: 'Jenis Kepemilikan', name: 'jenis_kepemilikan', type: 'select', options: JSON.stringify(['PT', 'CV', 'YAYASAN', 'PERSEORANGAN']), required: 1, sort: 2, is_system: 1 },
      { label: 'Kategori Usaha', name: 'kategori_usaha', type: 'select', options: JSON.stringify(['PERDAGANGAN', 'KULINER', 'JASA PERAWATAN KECANTIKAN', 'JASA PERBAIKAN DAN TEKNIK', 'LAUNDRY DAN DOORSMEER', 'PRODUKSI DAN INDUSTRI RUMAH TANGGA', 'PERTANIAN', 'PERIKANAN', 'PETERNAKAN']), required: 1, sort: 3, is_system: 1 },
      { label: 'Skala Usaha', name: 'skala_usaha', type: 'select', options: JSON.stringify(['USAHA MIKRO', 'USAHA KECIL', 'USAHA SEDANG', 'USAHA BESAR']), required: 1, sort: 4, is_system: 1 },
      { label: 'Jumlah Pekerja', name: 'jumlah_pekerja', type: 'select', options: JSON.stringify(['DIBAWAH 10', 'DIBAWAH 30', 'DIBAWAH 50', 'DIBAWAH 100', 'DIBAWAH 300', 'DIBAWAH 500', 'DIATAS 500']), required: 1, sort: 5, is_system: 1 },
      { label: 'Izin Usaha', name: 'izin_usaha', type: 'yesno', required: 1, sort: 6, is_system: 1 },
      { label: 'Foto Dokumen Izin', name: 'izin_foto', type: 'photo', required: 0, sort: 7, is_system: 1 },
      { label: 'Kelengkapan Keselamatan', name: 'kelengkapan_keamanan', type: 'select', options: JSON.stringify(['LENGKAP', 'KURANG LENGKAP', 'TIDAK LENGKAP']), required: 1, sort: 8, is_system: 1 },
      { label: 'Nama Penanggung Jawab', name: 'nama_pic', type: 'text', required: 1, sort: 9, is_system: 1 },
      { label: 'Nomor HP', name: 'hp_pic', type: 'phone', required: 1, sort: 10, is_system: 1 },
      { label: 'Foto Usaha', name: 'foto_usaha', type: 'photo', required: 1, sort: 11, is_system: 1 },
      { label: 'Kelurahan', name: 'kelurahan', type: 'select', options: JSON.stringify(['Suka Maju', 'Titi Kuning', 'Kedai Durian', 'Pangkalan Masyhur', 'Gedung Johor', 'Kwala Bekala']), required: 1, sort: 12, is_system: 1 },
      { label: 'Alamat', name: 'alamat', type: 'textarea', required: 1, sort: 13, is_system: 1 },
      { label: 'Latitude', name: 'lat', type: 'number', required: 1, sort: 14, is_system: 1 },
      { label: 'Longitude', name: 'lng', type: 'number', required: 1, sort: 15, is_system: 1 },
    ];
    for (const f of bizFields) {
      db.prepare('INSERT INTO data_category_fields (category_id, label, name, type, options, required, sort, is_system) VALUES (?,?,?,?,?,?,?,?)')
        .run(bizCatId, f.label, f.name, f.type, f.options || '[]', f.required, f.sort, f.is_system);
    }

    // Titik Rawan Bencana
    const disCat = db.prepare('INSERT INTO data_categories (name, display_name, icon, description, table_name, is_system, sort) VALUES (?,?,?,?,?,?,?)').run(
      'disaster', 'Titik Rawan Bencana', 'warning', 'Titik rawan bencana dan titik kumpul evakuasi', 'disasters', 1, 2
    );
    const disCatId = disCat.lastInsertRowid;
    const disFields = [
      { label: 'Nama Lokasi', name: 'nama_lokasi', type: 'text', required: 1, sort: 1, is_system: 1 },
      { label: 'Alamat', name: 'alamat', type: 'textarea', required: 1, sort: 2, is_system: 1 },
      { label: 'Jenis Bencana', name: 'jenis_bencana', type: 'select', options: JSON.stringify(['BANJIR', 'ANGIN PUTING BELIUNG']), required: 1, sort: 3, is_system: 1 },
      { label: 'Penyebab', name: 'penyebab', type: 'text', required: 1, sort: 4, is_system: 1 },
      { label: 'Jumlah Rumah Terdampak', name: 'jumlah_rumah', type: 'text', required: 0, sort: 5, is_system: 1 },
      { label: 'Jumlah KK Terdampak', name: 'jumlah_kk', type: 'text', required: 0, sort: 6, is_system: 1 },
      { label: 'Deskripsi', name: 'deskripsi', type: 'textarea', required: 0, sort: 7, is_system: 1 },
      { label: 'Foto', name: 'foto', type: 'photo', required: 0, sort: 8, is_system: 1 },
      { label: 'Titik Kumpul', name: 'titik_kumpul', type: 'text', required: 0, sort: 9, is_system: 1 },
      { label: 'Foto Titik Kumpul', name: 'titik_kumpul_foto', type: 'photo', required: 0, sort: 10, is_system: 1 },
      { label: 'Latitude Titik Kumpul', name: 'titik_kumpul_lat', type: 'number', required: 0, sort: 11, is_system: 1 },
      { label: 'Longitude Titik Kumpul', name: 'titik_kumpul_lng', type: 'number', required: 0, sort: 12, is_system: 1 },
      { label: 'Kelurahan', name: 'kelurahan', type: 'select', options: JSON.stringify(['Suka Maju', 'Titi Kuning', 'Kedai Durian', 'Pangkalan Masyhur', 'Gedung Johor', 'Kwala Bekala']), required: 1, sort: 13, is_system: 1 },
      { label: 'Latitude', name: 'lat', type: 'number', required: 1, sort: 14, is_system: 1 },
      { label: 'Longitude', name: 'lng', type: 'number', required: 1, sort: 15, is_system: 1 },
    ];
    for (const f of disFields) {
      db.prepare('INSERT INTO data_category_fields (category_id, label, name, type, options, required, sort, is_system) VALUES (?,?,?,?,?,?,?,?)')
        .run(disCatId, f.label, f.name, f.type, f.options || '[]', f.required, f.sort, f.is_system);
    }

    // Rumah Ibadah
    const worCat = db.prepare('INSERT INTO data_categories (name, display_name, icon, description, table_name, is_system, sort) VALUES (?,?,?,?,?,?,?)').run(
      'worship', 'Rumah Ibadah', 'landmark', 'Data rumah ibadah di Kecamatan Medan Johor', 'worship_places', 1, 3
    );
    const worCatId = worCat.lastInsertRowid;
    const worFields = [
      { label: 'Nama Rumah Ibadah', name: 'nama', type: 'text', required: 1, sort: 1, is_system: 1 },
      { label: 'Jenis Rumah Ibadah', name: 'jenis', type: 'text', required: 1, sort: 2, is_system: 1 },
      { label: 'Agama', name: 'agama', type: 'select', options: JSON.stringify(['ISLAM', 'KRISTEN PROTESTAN', 'KATOLIK', 'HINDU', 'BUDDHA', 'KONGHUCU']), required: 1, sort: 3, is_system: 1 },
      { label: 'Kelurahan', name: 'kelurahan', type: 'select', options: JSON.stringify(['Suka Maju', 'Titi Kuning', 'Kedai Durian', 'Pangkalan Masyhur', 'Gedung Johor', 'Kwala Bekala']), required: 1, sort: 4, is_system: 1 },
      { label: 'Alamat', name: 'alamat', type: 'textarea', required: 1, sort: 5, is_system: 1 },
      { label: 'Nama Pengurus', name: 'nama_pengelola', type: 'text', required: 0, sort: 6, is_system: 1 },
      { label: 'Nomor HP Pengurus', name: 'hp_pengelola', type: 'phone', required: 0, sort: 7, is_system: 1 },
      { label: 'Foto Rumah Ibadah', name: 'foto', type: 'photo', required: 1, sort: 8, is_system: 1 },
      { label: 'Latitude', name: 'lat', type: 'number', required: 1, sort: 9, is_system: 1 },
      { label: 'Longitude', name: 'lng', type: 'number', required: 1, sort: 10, is_system: 1 },
    ];
    for (const f of worFields) {
      db.prepare('INSERT INTO data_category_fields (category_id, label, name, type, options, required, sort, is_system) VALUES (?,?,?,?,?,?,?,?)')
        .run(worCatId, f.label, f.name, f.type, f.options || '[]', f.required, f.sort, f.is_system);
    }

    console.log('[seed] Default data categories created');
  }
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

module.exports = { db: dbProxy, init, getDb, ENUMS, LABELS, normEnum, normKelurahan, logAction, genRefCode };
