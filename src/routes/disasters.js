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
  return `BN-${y}-${String(seq).padStart(4, '0')}`;
}

function shapeRow(row) {
  return {
    id: row.id,
    ref: row.ref_code,
    nama_lokasi: row.nama_lokasi,
    alamat: row.alamat,
    jenis_bencana: row.jenis_bencana,
    penyebab: row.penyebab,
    jumlah_rumah: row.jumlah_rumah,
    jumlah_kk: row.jumlah_kk,
    deskripsi: row.deskripsi,
    foto: row.foto || null,
    titik_kumpul: row.titik_kumpul,
    lat: row.lat,
    lng: row.lng,
    created_at: row.created_at,
    updated_at: row.updated_at,
    owner_id: row.owner_id,
    owner_nama: row.owner_nama || null,
    owner_username: row.owner_username || null,
  };
}

const SELECT_BASE = `SELECT d.*, u.nama AS owner_nama, u.username AS owner_username FROM disasters d LEFT JOIN users u ON u.id = d.owner_id`;

/* ---------------- list & detail ---------------- */

router.get('/', requireAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const per = Math.min(100, Math.max(5, parseInt(req.query.per || '12', 10) || 12));
  const where = [];
  const params = {};
  if (req.query.search) {
    where.push('(d.nama_lokasi LIKE @q OR d.alamat LIKE @q OR d.penyebab LIKE @q OR d.ref_code LIKE @q)');
    params.q = `%${String(req.query.search).trim()}%`;
  }
  if (req.query.jenis) {
    where.push('d.jenis_bencana = @jenis');
    params.jenis = req.query.jenis;
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM disasters d ${whereSql}`).get(params).c;
  const rows = db
    .prepare(`${SELECT_BASE} ${whereSql} ORDER BY d.created_at DESC, d.id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: per, offset: (page - 1) * per });
  res.json({ total, page, per, rows: rows.map(shapeRow) });
});

router.get('/all', requireAuth, (req, res) => {
  const rows = db.prepare(`${SELECT_BASE} ORDER BY d.id`).all();
  res.json({ rows: rows.map(shapeRow) });
});

router.get('/map/all', requireAuth, (req, res) => {
  const rows = db.prepare(`${SELECT_BASE} WHERE d.lat IS NOT NULL AND d.lng IS NOT NULL ORDER BY d.id DESC`).all();
  res.json({ count: rows.length, places: rows.map(shapeRow) });
});

router.get('/:id', requireAuth, (req, res) => {
  const row = db.prepare(`${SELECT_BASE} WHERE d.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  res.json({ disaster: shapeRow(row) });
});

/* ---------------- create / update / delete ---------------- */

router.post('/', requireAuth, uploadPhotos, (req, res) => {
  const errors = [];
  const body = req.body || {};
  
  const nama_lokasi = String(body.nama_lokasi || '').trim();
  if (nama_lokasi.length < 2) errors.push('Nama/lokasi titik wajib diisi.');
  
  const alamat = String(body.alamat || '').trim();
  if (alamat.length < 5) errors.push('Alamat lengkap minimal 5 karakter.');
  
  const jenis_bencana = String(body.jenis_bencana || '').trim();
  if (jenis_bencana.length < 3) errors.push('Jenis bencana wajib diisi (isi singkat).');
  
  const penyebab = String(body.penyebab || '').trim();
  if (penyebab.length < 3) errors.push('Penyebab bencana wajib diisi.');

  const lat = parseFloat(body.lat);
  const lng = parseFloat(body.lng);
  const finalLat = Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null;
  const finalLng = Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null;

  const foto = uploadedPath(req, 'foto');

  if (errors.length) {
    cleanupFiles(req);
    return res.status(400).json({ error: errors.join(' ') });
  }

  const seq = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM disasters').get().n;
  const ref = genRefCode(seq);
  const info = db.prepare(
    `INSERT INTO disasters (ref_code, owner_id, nama_lokasi, alamat, jenis_bencana, penyebab,
      jumlah_rumah, jumlah_kk, deskripsi, foto, titik_kumpul, lat, lng)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    ref, req.user.sub, nama_lokasi, alamat, jenis_bencana, penyebab,
    String(body.jumlah_rumah || '').trim() || null,
    String(body.jumlah_kk || '').trim() || null,
    String(body.deskripsi || '').trim() || null,
    foto,
    String(body.titik_kumpul || '').trim() || null,
    finalLat, finalLng
  );

  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'bencana.baru', targetType: 'disaster', targetId: info.lastInsertRowid,
    targetName: `${ref} — ${nama_lokasi}`,
    detail: `Data titik rawan bencana baru [${jenis_bencana}]`,
    ip: clientIp(req),
  });

  const row = db.prepare(`${SELECT_BASE} WHERE d.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ok: true, disaster: shapeRow(row) });
});

router.put('/:id', requireAuth, uploadPhotos, (req, res) => {
  const row = db.prepare('SELECT * FROM disasters WHERE id = ?').get(req.params.id);
  if (!row) { cleanupFiles(req); return res.status(404).json({ error: 'Data tidak ditemukan.' }); }
  if (req.user.role !== 'superadmin' && row.owner_id !== req.user.sub) {
    cleanupFiles(req);
    return res.status(403).json({ error: 'Anda hanya dapat menyunting data yang Anda buat sendiri.' });
  }

  const errors = [];
  const body = req.body || {};
  
  const nama_lokasi = String(body.nama_lokasi || '').trim();
  if (nama_lokasi.length < 2) errors.push('Nama/lokasi titik wajib diisi.');
  
  const alamat = String(body.alamat || '').trim();
  if (alamat.length < 5) errors.push('Alamat lengkap minimal 5 karakter.');
  
  const jenis_bencana = String(body.jenis_bencana || '').trim();
  if (jenis_bencana.length < 3) errors.push('Jenis bencana wajib diisi (isi singkat).');
  
  const penyebab = String(body.penyebab || '').trim();
  if (penyebab.length < 3) errors.push('Penyebab bencana wajib diisi.');

  const lat = parseFloat(body.lat);
  const lng = parseFloat(body.lng);
  const finalLat = Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null;
  const finalLng = Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null;

  let foto = row.foto;
  const newFoto = uploadedPath(req, 'foto');
  if (newFoto) { removeStoredPhoto(foto); foto = newFoto; }

  if (errors.length) { cleanupFiles(req); return res.status(400).json({ error: errors.join(' ') }); }

  db.prepare(
    `UPDATE disasters SET nama_lokasi=?, alamat=?, jenis_bencana=?, penyebab=?,
      jumlah_rumah=?, jumlah_kk=?, deskripsi=?, foto=?, titik_kumpul=?, lat=?, lng=?,
      updated_at=datetime('now') WHERE id=?`
  ).run(
    nama_lokasi, alamat, jenis_bencana, penyebab,
    String(body.jumlah_rumah || '').trim() || null,
    String(body.jumlah_kk || '').trim() || null,
    String(body.deskripsi || '').trim() || null,
    foto,
    String(body.titik_kumpul || '').trim() || null,
    finalLat, finalLng, row.id
  );

  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'bencana.ubah', targetType: 'disaster', targetId: row.id,
    targetName: `${row.ref_code} — ${nama_lokasi}`,
    detail: 'Menyunting data titik rawan bencana',
    ip: clientIp(req),
  });

  const updated = db.prepare(`${SELECT_BASE} WHERE d.id = ?`).get(row.id);
  res.json({ ok: true, disaster: shapeRow(updated) });
});

router.delete('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM disasters WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  if (req.user.role !== 'superadmin' && row.owner_id !== req.user.sub)
    return res.status(403).json({ error: 'Anda hanya dapat menghapus data yang Anda buat sendiri.' });

  removeStoredPhoto(row.foto);
  db.prepare('DELETE FROM disasters WHERE id = ?').run(row.id);
  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'bencana.hapus', targetType: 'disaster', targetId: row.id,
    targetName: `${row.ref_code} — ${row.nama_lokasi}`,
    detail: `Menghapus data titik rawan bencana "${row.nama_lokasi}"`,
    ip: clientIp(req),
  });
  res.json({ ok: true });
});

module.exports = router;
