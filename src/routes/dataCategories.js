const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, ENUMS, logAction, normKelurahan } = require('../db');
const { UPLOADS_DIR } = require('../config');
const { requireAuth, requireSuper, clientIp } = require('../util');

const router = express.Router();

/* ---------------- helpers ---------------- */

function monthDir() {
  const d = new Date();
  const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const dir = path.join(UPLOADS_DIR, ym);
  fs.mkdirSync(dir, { recursive: true });
  return { dir, ym };
}

const ALLOWED_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function storage() {
  const { dir } = monthDir();
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) =>
      cb(null, `${crypto.randomBytes(8).toString('hex')}${ALLOWED_MIME[file.mimetype] || '.jpg'}`),
  });
}

function uploadPhotos(req, res, next) {
  const mw = multer({
    storage: storage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 10 },
    fileFilter: (req2, file, cb) => {
      if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
      cb(new Error('Format foto harus JPG, PNG, atau WEBP (maks 8 MB).'));
    },
  }).fields([{ name: 'foto', maxCount: 10 }]);
  mw(req, res, (err) => {
    if (err) { cleanupFiles(req); return res.status(400).json({ error: err.message || 'Gagal mengunggah file.' }); }
    next();
  });
}

function uploadedPath(req, fieldname) {
  const f = req.files && req.files[fieldname] && req.files[fieldname][0];
  if (!f) return null;
  return '/uploads/' + path.relative(UPLOADS_DIR, f.path).split(path.sep).join('/');
}

function cleanupFiles(req) {
  if (!req.files) return;
  for (const arr of Object.values(req.files)) for (const f of arr) fs.promises.unlink(f.path).catch(() => {});
}

function removeStoredPhoto(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const abs = path.join(UPLOADS_DIR, url.slice('/uploads/'.length));
  if (!abs.startsWith(UPLOADS_DIR)) return;
  fs.promises.unlink(abs).catch(() => {});
}

function genRefCode(table, prefix) {
  const seq = db.prepare(`SELECT COALESCE(MAX(id),0)+1 n FROM ${table}`).get().n;
  const y = new Date().getUTCFullYear();
  return `${prefix}-${y}-${String(seq).padStart(4, '0')}`;
}

/* ---------------- Category CRUD (Superadmin only) ---------------- */

// List all categories (semua user terautentikasi — dipakai untuk menu & peta)
router.get('/', requireAuth, (req, res) => {
  const cats = db.prepare('SELECT * FROM data_categories ORDER BY sort, id').all();
  const fields = db.prepare('SELECT * FROM data_category_fields ORDER BY category_id, sort, id').all();
  const catsWithFields = cats.map(c => ({
    ...c,
    fields: fields.filter(f => f.category_id === c.id)
  }));
  res.json({ categories: catsWithFields });
});

// Get single category with fields (superadmin — untuk halaman manajemen)
router.get('/:id', requireAuth, requireSuper, (req, res) => {
  const cat = db.prepare('SELECT * FROM data_categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
  const fields = db.prepare('SELECT * FROM data_category_fields WHERE category_id = ? ORDER BY sort, id').all(req.params.id);
  res.json({ category: { ...cat, fields } });
});

// Get single category fields for form use (semua user terautentikasi)
router.get('/:id/fields', requireAuth, (req, res) => {
  const cat = db.prepare('SELECT * FROM data_categories WHERE id = ? AND active = 1').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
  const fields = db.prepare('SELECT * FROM data_category_fields WHERE category_id = ? ORDER BY sort, id').all(req.params.id);
  res.json({ category: cat, fields });
});

// Create new category
router.post('/', requireAuth, requireSuper, (req, res) => {
  const { name, display_name, icon, description, table_name } = req.body;
  if (!name || !display_name || !table_name) {
    return res.status(400).json({ error: 'Nama, nama tampilan, dan nama tabel wajib diisi.' });
  }
  if (!/^[a-z_]+$/.test(name)) {
    return res.status(400).json({ error: 'Nama kategori hanya boleh huruf kecil dan underscore.' });
  }
  if (!/^[a-z_]+$/.test(table_name)) {
    return res.status(400).json({ error: 'Nama tabel hanya boleh huruf kecil dan underscore.' });
  }

  // Check if category name or table_name already exists
  const exists = db.prepare('SELECT id FROM data_categories WHERE name = ? OR table_name = ?').get(name, table_name);
  if (exists) return res.status(400).json({ error: 'Nama kategori atau nama tabel sudah digunakan.' });

  // Create the physical table
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS ${table_name} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_code TEXT UNIQUE,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT
    )
  `;
  try {
    db.exec(createTableSql);
  } catch (e) {
    return res.status(500).json({ error: 'Gagal membuat tabel: ' + e.message });
  }

  const info = db.prepare(
    `INSERT INTO data_categories (name, display_name, icon, description, table_name, is_system, sort)
     VALUES (?,?,?,?,?,0,(SELECT COALESCE(MAX(sort),0)+1 FROM data_categories))`
  ).run(name, display_name, icon || 'database', description || '', table_name);

  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'category.buat', targetType: 'data_category', targetId: info.lastInsertRowid,
    targetName: display_name, detail: `Membuat kategori data baru: ${display_name} (${table_name})`,
    ip: clientIp(req),
  });

  res.status(201).json({ ok: true, category: { id: info.lastInsertRowid, name, display_name, icon, description, table_name, is_system: 0 } });
});

// Update category
router.put('/:id', requireAuth, requireSuper, (req, res) => {
  const cat = db.prepare('SELECT * FROM data_categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
  if (cat.is_system) return res.status(403).json({ error: 'Kategori sistem tidak dapat diubah.' });

  const { display_name, icon, description, active, sort } = req.body;
  db.prepare(
    `UPDATE data_categories SET display_name=?, icon=?, description=?, active=?, sort=?, updated_at=datetime('now') WHERE id=?`
  ).run(display_name, icon, description, active ? 1 : 0, sort || 0, cat.id);

  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'category.ubah', targetType: 'data_category', targetId: cat.id,
    targetName: display_name, detail: `Mengubah kategori data: ${display_name}`,
    ip: clientIp(req),
  });

  res.json({ ok: true });
});

// Delete category (only non-system, and only if no data)
router.delete('/:id', requireAuth, requireSuper, (req, res) => {
  const cat = db.prepare('SELECT * FROM data_categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
  if (cat.is_system) return res.status(403).json({ error: 'Kategori sistem tidak dapat dihapus.' });

  // Check if table has data
  const count = db.prepare(`SELECT COUNT(*) c FROM ${cat.table_name}`).get().c;
  if (count > 0) return res.status(400).json({ error: 'Kategori memiliki data, tidak dapat dihapus.' });

  // Drop the physical table
  try {
    db.exec(`DROP TABLE IF EXISTS ${cat.table_name}`);
  } catch (e) {
    return res.status(500).json({ error: 'Gagal menghapus tabel: ' + e.message });
  }

  // Delete category and its fields (cascade)
  db.prepare('DELETE FROM data_categories WHERE id = ?').run(cat.id);

  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'category.hapus', targetType: 'data_category', targetId: cat.id,
    targetName: cat.display_name, detail: `Menghapus kategori data: ${cat.display_name}`,
    ip: clientIp(req),
  });

  res.json({ ok: true });
});

/* ---------------- Field CRUD ---------------- */

// Add field to category
router.post('/:id/fields', requireAuth, requireSuper, (req, res) => {
  const cat = db.prepare('SELECT * FROM data_categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });

  const { label, name, type, options, required, sort } = req.body;
  if (!label || !name || !type) {
    return res.status(400).json({ error: 'Label, nama field, dan tipe wajib diisi.' });
  }
  if (!/^[a-z_]+$/.test(name)) {
    return res.status(400).json({ error: 'Nama field hanya boleh huruf kecil dan underscore.' });
  }
  if (!['text', 'textarea', 'number', 'date', 'select', 'yesno', 'phone', 'photo', 'location'].includes(type)) {
    return res.status(400).json({ error: 'Tipe field tidak valid.' });
  }

  // Check if field name already exists in this category
  const exists = db.prepare('SELECT id FROM data_category_fields WHERE category_id = ? AND name = ?').get(cat.id, name);
  if (exists) return res.status(400).json({ error: 'Nama field sudah digunakan dalam kategori ini.' });

  // Add column(s) to physical table
  let colType = 'TEXT';
  if (type === 'number') colType = 'REAL';
  else if (type === 'date') colType = 'TEXT';
  else if (type === 'yesno') colType = 'INTEGER DEFAULT 0';

  try {
    if (type === 'location') {
      // Lokasi disimpan sebagai dua kolom koordinat (lat & lng), sama seperti field sistem.
      db.exec(`ALTER TABLE ${cat.table_name} ADD COLUMN ${name}_lat REAL`);
      db.exec(`ALTER TABLE ${cat.table_name} ADD COLUMN ${name}_lng REAL`);
    } else {
      db.exec(`ALTER TABLE ${cat.table_name} ADD COLUMN ${name} ${colType}`);
    }
  } catch (e) {
    return res.status(500).json({ error: 'Gagal menambah kolom ke tabel: ' + e.message });
  }

  const info = db.prepare(
    `INSERT INTO data_category_fields (category_id, label, name, type, options, required, sort)
     VALUES (?,?,?,?,?,?,?)`
  ).run(cat.id, label, name, type, options || '[]', required ? 1 : 0, sort || 0);

  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'category.field_tambah', targetType: 'data_category_field', targetId: info.lastInsertRowid,
    targetName: label, detail: `Menambah field "${label}" ke kategori ${cat.display_name}`,
    ip: clientIp(req),
  });

  res.status(201).json({ ok: true, field: { id: info.lastInsertRowid, category_id: cat.id, label, name, type, options: options || '[]', required: required ? 1 : 0, sort: sort || 0 } });
});

// Update field
router.put('/:catId/fields/:fieldId', requireAuth, requireSuper, (req, res) => {
  const field = db.prepare('SELECT * FROM data_category_fields WHERE id = ? AND category_id = ?').get(req.params.fieldId, req.params.catId);
  if (!field) return res.status(404).json({ error: 'Field tidak ditemukan.' });
  if (field.is_system) return res.status(403).json({ error: 'Field sistem tidak dapat diubah.' });

  const { label, type, options, required, sort } = req.body;
  db.prepare(
    `UPDATE data_category_fields SET label=?, type=?, options=?, required=?, sort=?, updated_at=datetime('now') WHERE id=?`
  ).run(label, type, options || '[]', required ? 1 : 0, sort || 0, field.id);

  res.json({ ok: true });
});

// Delete field
router.delete('/:catId/fields/:fieldId', requireAuth, requireSuper, (req, res) => {
  const field = db.prepare('SELECT * FROM data_category_fields WHERE id = ? AND category_id = ?').get(req.params.fieldId, req.params.catId);
  if (!field) return res.status(404).json({ error: 'Field tidak ditemukan.' });
  if (field.is_system) return res.status(403).json({ error: 'Field sistem tidak dapat dihapus.' });

  const cat = db.prepare('SELECT * FROM data_categories WHERE id = ?').get(req.params.catId);

  // Drop column from physical table (SQLite doesn't support DROP COLUMN directly, so we skip physical removal)
  // Note: In production, you might want to recreate table without the column

  db.prepare('DELETE FROM data_category_fields WHERE id = ?').run(field.id);

  res.json({ ok: true });
});

/* ---------------- Dynamic Data CRUD ---------------- */

// List data for a category
router.get('/:id/data', requireAuth, (req, res) => {
  const cat = db.prepare('SELECT * FROM data_categories WHERE id = ? AND active = 1').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Kategori tidak ditemukan atau tidak aktif.' });

  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const per = Math.min(100, Math.max(5, parseInt(req.query.per || '12', 10) || 12));
  const search = req.query.search ? `%${String(req.query.search).trim()}%` : null;

  let where = 'WHERE 1=1';
  const params = {};
  if (search) {
    where += ' AND (ref_code LIKE @q';
    // Add search on text fields
    const fields = db.prepare('SELECT name FROM data_category_fields WHERE category_id = ? AND type IN (?,?,?)').all(cat.id, 'text', 'textarea', 'select');
    for (const f of fields) {
      where += ` OR ${f.name} LIKE @q`;
    }
    where += ')';
    params.q = search;
  }
  if (req.query.kelurahan) {
    where += ' AND kelurahan = @kel';
    params.kel = req.query.kelurahan;
  }

  const total = db.prepare(`SELECT COUNT(*) c FROM ${cat.table_name} ${where}`).get(params).c;
  const rows = db.prepare(`SELECT * FROM ${cat.table_name} ${where} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: per, offset: (page - 1) * per });

  // Get owner names
  const ownerIds = [...new Set(rows.map(r => r.owner_id).filter(Boolean))];
  let owners = {};
  if (ownerIds.length) {
    const q = ownerIds.map(() => '?').join(',');
    owners = db.prepare(`SELECT id, nama, username FROM users WHERE id IN (${q})`).all(...ownerIds).reduce((acc, u) => { acc[u.id] = u; return acc; }, {});
  }

  const fields = db.prepare('SELECT * FROM data_category_fields WHERE category_id = ? ORDER BY sort, id').all(cat.id);

  const shaped = rows.map(r => {
    const obj = { id: r.id, ref: r.ref_code, created_at: r.created_at, updated_at: r.updated_at, owner_id: r.owner_id };
    if (owners[r.owner_id]) { obj.owner_nama = owners[r.owner_id].nama; obj.owner_username = owners[r.owner_id].username; }
    for (const f of fields) {
      if (f.type === 'location') {
        obj[`${f.name}_lat`] = r[`${f.name}_lat`];
        obj[`${f.name}_lng`] = r[`${f.name}_lng`];
      } else {
        obj[f.name] = r[f.name];
      }
    }
    return obj;
  });

  res.json({ total, page, per, rows: shaped, category: cat, fields });
});

// Get single data item
router.get('/:id/data/:dataId', requireAuth, (req, res) => {
  const cat = db.prepare('SELECT * FROM data_categories WHERE id = ? AND active = 1').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });

  const row = db.prepare(`SELECT * FROM ${cat.table_name} WHERE id = ?`).get(req.params.dataId);
  if (!row) return res.status(404).json({ error: 'Data tidak ditemukan.' });

  const fields = db.prepare('SELECT * FROM data_category_fields WHERE category_id = ? ORDER BY sort, id').all(cat.id);
  const obj = { id: row.id, ref: row.ref_code, created_at: row.created_at, updated_at: row.updated_at, owner_id: row.owner_id };
  if (row.owner_id) {
    const owner = db.prepare('SELECT nama, username FROM users WHERE id = ?').get(row.owner_id);
    if (owner) { obj.owner_nama = owner.nama; obj.owner_username = owner.username; }
  }
  for (const f of fields) {
    if (f.type === 'location') {
      obj[`${f.name}_lat`] = row[`${f.name}_lat`];
      obj[`${f.name}_lng`] = row[`${f.name}_lng`];
    } else {
      obj[f.name] = row[f.name];
    }
  }
  res.json({ data: obj, category: cat, fields });
});

// Create data
router.post('/:id/data', requireAuth, uploadPhotos, async (req, res) => {
  const cat = db.prepare('SELECT * FROM data_categories WHERE id = ? AND active = 1').get(req.params.id);
  if (!cat) { cleanupFiles(req); return res.status(404).json({ error: 'Kategori tidak ditemukan.' }); }

  const fields = db.prepare('SELECT * FROM data_category_fields WHERE category_id = ?').all(cat.id);
  const body = req.body || {};

  // Validate required fields
  const errors = [];
  for (const f of fields) {
    if (f.required) {
      const val = body[f.name];
      if (f.type === 'yesno') {
        if (val === undefined || val === '' || val === null) errors.push(`${f.label} wajib diisi.`);
      } else if (f.type === 'photo') {
        // For create, photo is required if field is required
        const file = req.files && req.files[f.name] && req.files[f.name][0];
        if (!file && !val) errors.push(`${f.label} wajib diisi.`);
      } else if (f.type === 'location') {
        const lat = parseFloat(body[`${f.name}_lat`]);
        const lng = parseFloat(body[`${f.name}_lng`]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) errors.push(`${f.label} wajib diisi (pilih titik lokasi).`);
      } else if (!val || String(val).trim() === '') {
        errors.push(`${f.label} wajib diisi.`);
      }
    }
  }
  if (errors.length) { cleanupFiles(req); return res.status(400).json({ error: errors.join(' ') }); }

  // Build insert
  const columns = ['ref_code', 'owner_id'];
  const values = [genRefCode(cat.table_name, cat.name.toUpperCase().slice(0, 3)), req.user.sub];
  const placeholders = ['?', '?'];

  for (const f of fields) {
    if (f.type === 'photo') {
      const photoUrl = uploadedPath(req, f.name);
      if (photoUrl) {
        columns.push(f.name);
        values.push(photoUrl);
        placeholders.push('?');
      }
    } else if (f.type === 'yesno') {
      columns.push(f.name);
      values.push(body[f.name] === '1' || body[f.name] === true ? 1 : 0);
      placeholders.push('?');
    } else if (f.type === 'number') {
      const num = parseFloat(body[f.name]);
      columns.push(f.name);
      values.push(Number.isFinite(num) ? num : null);
      placeholders.push('?');
    } else if (f.type === 'location') {
      const lat = parseFloat(body[`${f.name}_lat`]);
      const lng = parseFloat(body[`${f.name}_lng`]);
      columns.push(`${f.name}_lat`, `${f.name}_lng`);
      values.push(Number.isFinite(lat) ? lat : null, Number.isFinite(lng) ? lng : null);
      placeholders.push('?', '?');
    } else {
      columns.push(f.name);
      values.push(body[f.name] ? String(body[f.name]).trim() : null);
      placeholders.push('?');
    }
  }

  columns.push('created_at');
  placeholders.push('?');
  values.push(new Date().toISOString());

  const sql = `INSERT INTO ${cat.table_name} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  const info = db.prepare(sql).run(...values);

  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'data.baru', targetType: 'dynamic_data', targetId: info.lastInsertRowid,
    targetName: `${cat.display_name} — ${body[fields.find(f => f.name !== 'ref_code')?.name || 'nama']}`,
    detail: `Menambah data baru ke kategori ${cat.display_name}`,
    ip: clientIp(req),
  });

  const created = db.prepare(`SELECT * FROM ${cat.table_name} WHERE id = ?`).get(info.lastInsertRowid);
  const shaped = { id: created.id, ref: created.ref_code, created_at: created.created_at, updated_at: created.updated_at, owner_id: created.owner_id };
  for (const f of fields) shaped[f.name] = created[f.name];

  res.status(201).json({ ok: true, data: shaped });
});

// Update data
router.put('/:id/data/:dataId', requireAuth, uploadPhotos, (req, res) => {
  const cat = db.prepare('SELECT * FROM data_categories WHERE id = ? AND active = 1').get(req.params.id);
  if (!cat) { cleanupFiles(req); return res.status(404).json({ error: 'Kategori tidak ditemukan.' }); }

  const row = db.prepare(`SELECT * FROM ${cat.table_name} WHERE id = ?`).get(req.params.dataId);
  if (!row) { cleanupFiles(req); return res.status(404).json({ error: 'Data tidak ditemukan.' }); }
  if (req.user.role !== 'superadmin' && row.owner_id !== req.user.sub) {
    cleanupFiles(req); return res.status(403).json({ error: 'Anda hanya dapat menyunting data yang Anda buat sendiri.' });
  }

  const fields = db.prepare('SELECT * FROM data_category_fields WHERE category_id = ?').all(cat.id);
  const body = req.body || {};

  // Validate required fields
  const errors = [];
  for (const f of fields) {
    if (f.required && f.type !== 'photo') {
      if (f.type === 'location') {
        const lat = parseFloat(body[`${f.name}_lat`]);
        const lng = parseFloat(body[`${f.name}_lng`]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) errors.push(`${f.label} wajib diisi (pilih titik lokasi).`);
      } else {
        const val = body[f.name];
        if (!val || String(val).trim() === '') errors.push(`${f.label} wajib diisi.`);
      }
    }
  }
  if (errors.length) { cleanupFiles(req); return res.status(400).json({ error: errors.join(' ') }); }

  // Build update
  const updates = [];
  const values = [];

  for (const f of fields) {
    if (f.type === 'photo') {
      const photoUrl = uploadedPath(req, f.name);
      if (photoUrl) {
        removeStoredPhoto(row[f.name]);
        updates.push(`${f.name} = ?`);
        values.push(photoUrl);
      }
    } else if (f.type === 'yesno') {
      updates.push(`${f.name} = ?`);
      values.push(body[f.name] === '1' || body[f.name] === true ? 1 : 0);
    } else if (f.type === 'number') {
      const num = parseFloat(body[f.name]);
      updates.push(`${f.name} = ?`);
      values.push(Number.isFinite(num) ? num : null);
    } else if (f.type === 'location') {
      const lat = parseFloat(body[`${f.name}_lat`]);
      const lng = parseFloat(body[`${f.name}_lng`]);
      updates.push(`${f.name}_lat = ?`, `${f.name}_lng = ?`);
      values.push(Number.isFinite(lat) ? lat : null, Number.isFinite(lng) ? lng : null);
    } else {
      updates.push(`${f.name} = ?`);
      values.push(body[f.name] ? String(body[f.name]).trim() : null);
    }
  }

  updates.push('updated_at = datetime(\'now\')');
  values.push(row.id);

  db.prepare(`UPDATE ${cat.table_name} SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'data.ubah', targetType: 'dynamic_data', targetId: row.id,
    targetName: `${cat.display_name} — ${row.ref_code}`,
    detail: `Menyunting data di kategori ${cat.display_name}`,
    ip: clientIp(req),
  });

  const updated = db.prepare(`SELECT * FROM ${cat.table_name} WHERE id = ?`).get(row.id);
  const shaped = { id: updated.id, ref: updated.ref_code, created_at: updated.created_at, updated_at: updated.updated_at, owner_id: updated.owner_id };
  for (const f of fields) shaped[f.name] = updated[f.name];

  res.json({ ok: true, data: shaped });
});

// Delete data
router.delete('/:id/data/:dataId', requireAuth, (req, res) => {
  const cat = db.prepare('SELECT * FROM data_categories WHERE id = ? AND active = 1').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });

  const row = db.prepare(`SELECT * FROM ${cat.table_name} WHERE id = ?`).get(req.params.dataId);
  if (!row) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  if (req.user.role !== 'superadmin' && row.owner_id !== req.user.sub)
    return res.status(403).json({ error: 'Anda hanya dapat menghapus data yang Anda buat sendiri.' });

  // Remove photos
  const fields = db.prepare('SELECT name FROM data_category_fields WHERE category_id = ? AND type = ?').all(cat.id, 'photo');
  for (const f of fields) {
    if (row[f.name]) removeStoredPhoto(row[f.name]);
  }

  db.prepare(`DELETE FROM ${cat.table_name} WHERE id = ?`).run(row.id);

  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'data.hapus', targetType: 'dynamic_data', targetId: row.id,
    targetName: `${cat.display_name} — ${row.ref_code}`,
    detail: `Menghapus data dari kategori ${cat.display_name}`,
    ip: clientIp(req),
  });

  res.json({ ok: true });
});

// Map data for a category
router.get('/:id/map', requireAuth, (req, res) => {
  const cat = db.prepare('SELECT * FROM data_categories WHERE id = ? AND active = 1').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });

  const allFields = db.prepare('SELECT name, label, type FROM data_category_fields WHERE category_id = ? ORDER BY sort, id').all(cat.id);
  const locField = allFields.find(f => f.type === 'location') ||
    (allFields.find(f => f.name === 'lat') && allFields.find(f => f.name === 'lng') ? { name: '' } : null);

  let latCol, lngCol;
  if (locField && locField.name !== '') { latCol = `${locField.name}_lat`; lngCol = `${locField.name}_lng`; }
  else if (allFields.find(f => f.name === 'lat') && allFields.find(f => f.name === 'lng')) { latCol = 'lat'; lngCol = 'lng'; }

  if (!latCol || !lngCol) {
    return res.json({ count: 0, places: [], category: cat, fields: allFields });
  }

  const rows = db.prepare(`SELECT * FROM ${cat.table_name} WHERE ${latCol} IS NOT NULL AND ${lngCol} IS NOT NULL ORDER BY id DESC`).all();
  const places = rows.map(r => {
    const obj = { id: r.id, ref: r.ref_code, lat: r[latCol], lng: r[lngCol] };
    for (const f of allFields) {
      if (f.type === 'location') { obj[`${f.name}_lat`] = r[`${f.name}_lat`]; obj[`${f.name}_lng`] = r[`${f.name}_lng`]; }
      else obj[f.name] = r[f.name];
    }
    return obj;
  });
  res.json({ count: places.length, places, category: cat, fields: allFields });
});

module.exports = router;