const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, ENUMS, logAction } = require('../db');
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
    limits: { fileSize: 8 * 1024 * 1024, files: 2 },
    fileFilter: (req2, file, cb) => {
      if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
      cb(new Error('Format foto harus JPG, PNG, atau WEBP (maks 8 MB).'));
    },
  }).fields([{ name: 'foto', maxCount: 1 }]);
  mw(req, res, (err) => {
    if (err) {
      cleanupFiles(req);
      return res.status(400).json({ error: err.message || 'Gagal mengunggah file.' });
    }
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
  for (const arr of Object.values(req.files)) {
    for (const f of arr) fs.promises.unlink(f.path).catch(() => {});
  }
}

function removeStoredPhoto(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const abs = path.join(UPLOADS_DIR, url.slice('/uploads/'.length));
  if (!abs.startsWith(UPLOADS_DIR)) return;
  fs.promises.unlink(abs).catch(() => {});
}

function genRefCode(seq) {
  const y = new Date().getUTCFullYear();
  return `RI-${y}-${String(seq).padStart(4, '0')}`;
}

function shapeRow(row) {
  return {
    id: row.id,
    ref: row.ref_code,
    nama: row.nama,
    jenis: row.jenis,
    alamat: row.alamat,
    nama_pengelola: row.nama_pengelola,
    hp_pengelola: row.hp_pengelola,
    kapasitas: row.kapasitas,
    tahun_berdiri: row.tahun_berdiri,
    foto: row.foto || null,
    lat: row.lat,
    lng: row.lng,
    created_at: row.created_at,
    updated_at: row.updated_at,
    owner_id: row.owner_id,
    owner_nama: row.owner_nama || null,
    owner_username: row.owner_username || null,
  };
}

const SELECT_BASE = `SELECT w.*, u.nama AS owner_nama, u.username AS owner_username FROM worship_places w LEFT JOIN users u ON u.id = w.owner_id`;

/* ---------------- list & detail ---------------- */

router.get('/', requireAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const per = Math.min(100, Math.max(5, parseInt(req.query.per || '12', 10) || 12));
  const where = [];
  const params = {};
  if (req.query.search) {
    where.push('(w.nama LIKE @q OR w.alamat LIKE @q OR w.nama_pengelola LIKE @q OR w.ref_code LIKE @q)');
    params.q = `%${String(req.query.search).trim()}%`;
  }
  if (req.query.jenis) {
    where.push('w.jenis = @jenis');
    params.jenis = req.query.jenis;
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM worship_places w ${whereSql}`).get(params).c;
  const rows = db
    .prepare(`${SELECT_BASE} ${whereSql} ORDER BY w.created_at DESC, w.id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: per, offset: (page - 1) * per });
  res.json({ total, page, per, rows: rows.map(shapeRow) });
});

router.get('/all', requireAuth, (req, res) => {
  const rows = db.prepare(`${SELECT_BASE} ORDER BY w.id`).all();
  res.json({ rows: rows.map(shapeRow) });
});

router.get('/map/all', requireAuth, (req, res) => {
  const rows = db.prepare(`${SELECT_BASE} WHERE w.lat IS NOT NULL AND w.lng IS NOT NULL ORDER BY w.id DESC`).all();
  res.json({ count: rows.length, places: rows.map(shapeRow) });
});

router.get('/:id', requireAuth, (req, res) => {
  const row = db.prepare(`${SELECT_BASE} WHERE w.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  res.json({ worship: shapeRow(row) });
});

/* ---------------- create / update / delete ---------------- */

router.post('/', requireAuth, uploadPhotos, (req, res) => {
  const errors = [];
  const body = req.body || {};
  
  const nama = String(body.nama || '').trim();
  if (nama.length < 2) errors.push('Nama rumah ibadah wajib diisi.');
  
  const alamat = String(body.alamat || '').trim();
  if (alamat.length < 5) errors.push('Alamat lengkap minimal 5 karakter.');
  
  const jenis = String(body.jenis || '').toUpperCase().trim();
  if (!ENUMS.JENIS_IBADAH.includes(jenis)) errors.push('Jenis rumah ibadah tidak valid.');

  const lat = parseFloat(body.lat);
  const lng = parseFloat(body.lng);
  const finalLat = Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null;
  const finalLng = Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null;

  const foto = uploadedPath(req, 'foto');

  if (errors.length) {
    cleanupFiles(req);
    return res.status(400).json({ error: errors.join(' ') });
  }

  const seq = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM worship_places').get().n;
  const ref = genRefCode(seq);
  const kapasitas = parseInt(body.kapasitas) || null;
  const tahun_berdiri = parseInt(body.tahun_berdiri) || null;

  const info = db.prepare(
    `INSERT INTO worship_places (ref_code, owner_id, nama, jenis, alamat, nama_pengelola, hp_pengelola, kapasitas, tahun_berdiri, foto, lat, lng)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    ref, req.user.sub, nama, jenis, alamat,
    String(body.nama_pengelola || '').trim() || null,
    String(body.hp_pengelola || '').trim() || null,
    kapasitas, tahun_berdiri, foto, finalLat, finalLng
  );

  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'ibadah.baru', targetType: 'worship', targetId: info.lastInsertRowid,
    targetName: `${ref} — ${nama}`,
    detail: `Data rumah ibadah baru [${jenis}]`,
    ip: clientIp(req),
  });

  const row = db.prepare(`${SELECT_BASE} WHERE w.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ok: true, worship: shapeRow(row) });
});

router.put('/:id', requireAuth, uploadPhotos, (req, res) => {
  const row = db.prepare('SELECT * FROM worship_places WHERE id = ?').get(req.params.id);
  if (!row) { cleanupFiles(req); return res.status(404).json({ error: 'Data tidak ditemukan.' }); }
  if (req.user.role !== 'superadmin' && row.owner_id !== req.user.sub) {
    cleanupFiles(req);
    return res.status(403).json({ error: 'Anda hanya dapat menyunting data yang Anda buat sendiri.' });
  }

  const errors = [];
  const body = req.body || {};
  
  const nama = String(body.nama || '').trim();
  if (nama.length < 2) errors.push('Nama rumah ibadah wajib diisi.');
  
  const alamat = String(body.alamat || '').trim();
  if (alamat.length < 5) errors.push('Alamat lengkap minimal 5 karakter.');
  
  const jenis = String(body.jenis || '').toUpperCase().trim();
  if (!ENUMS.JENIS_IBADAH.includes(jenis)) errors.push('Jenis rumah ibadah tidak valid.');

  const lat = parseFloat(body.lat);
  const lng = parseFloat(body.lng);
  const finalLat = Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null;
  const finalLng = Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null;

  let foto = row.foto;
  const newFoto = uploadedPath(req, 'foto');
  if (newFoto) { removeStoredPhoto(foto); foto = newFoto; }

  if (errors.length) { cleanupFiles(req); return res.status(400).json({ error: errors.join(' ') }); }

  const kapasitas = parseInt(body.kapasitas) || null;
  const tahun_berdiri = parseInt(body.tahun_berdiri) || null;

  db.prepare(
    `UPDATE worship_places SET nama=?, jenis=?, alamat=?, nama_pengelola=?, hp_pengelola=?,
      kapasitas=?, tahun_berdiri=?, foto=?, lat=?, lng=?, updated_at=datetime('now') WHERE id=?`
  ).run(
    nama, jenis, alamat,
    String(body.nama_pengelola || '').trim() || null,
    String(body.hp_pengelola || '').trim() || null,
    kapasitas, tahun_berdiri, foto, finalLat, finalLng, row.id
  );

  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'ibadah.ubah', targetType: 'worship', targetId: row.id,
    targetName: `${row.ref_code} — ${nama}`,
    detail: 'Menyunting data rumah ibadah',
    ip: clientIp(req),
  });

  const updated = db.prepare(`${SELECT_BASE} WHERE w.id = ?`).get(row.id);
  res.json({ ok: true, worship: shapeRow(updated) });
});

router.delete('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM worship_places WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  if (req.user.role !== 'superadmin' && row.owner_id !== req.user.sub)
    return res.status(403).json({ error: 'Anda hanya dapat menghapus data yang Anda buat sendiri.' });

  removeStoredPhoto(row.foto);
  db.prepare('DELETE FROM worship_places WHERE id = ?').run(row.id);
  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'ibadah.hapus', targetType: 'worship', targetId: row.id,
    targetName: `${row.ref_code} — ${row.nama}`,
    detail: `Menghapus data rumah ibadah "${row.nama}"`,
    ip: clientIp(req),
  });
  res.json({ ok: true });
});

module.exports = router;
