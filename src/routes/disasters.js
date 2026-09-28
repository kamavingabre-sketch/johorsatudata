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
    limits: { fileSize: 8 * 1024 * 1024, files: 2 },
    fileFilter: (req2, file, cb) => {
      if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
      cb(new Error('Format foto harus JPG, PNG, atau WEBP (maks 8 MB).'));
    },
  }).fields([{ name: 'foto', maxCount: 1 }, { name: 'foto_titik_kumpul', maxCount: 1 }]);
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
    kelurahan: row.kelurahan || null,
    titik_kumpul: row.titik_kumpul,
    titik_kumpul_lat: row.titik_kumpul_lat,
    titik_kumpul_lng: row.titik_kumpul_lng,
    titik_kumpul_foto: row.titik_kumpul_foto || null,
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
    where.push('(d.nama_lokasi LIKE @q OR d.alamat LIKE @q OR d.penyebab LIKE @q OR d.titik_kumpul LIKE @q OR d.ref_code LIKE @q)');
    params.q = `%${String(req.query.search).trim()}%`;
  }
  if (req.query.jenis) {
    where.push('d.jenis_bencana = @jenis');
    params.jenis = req.query.jenis;
  }
  if (req.query.kelurahan) {
    if (req.query.kelurahan === '__kosong') where.push("(d.kelurahan IS NULL OR d.kelurahan = '')");
    else { where.push('d.kelurahan = @kel'); params.kel = req.query.kelurahan; }
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
  const rows = db.prepare(`${SELECT_BASE} WHERE (d.lat IS NOT NULL AND d.lng IS NOT NULL) OR (d.titik_kumpul_lat IS NOT NULL AND d.titik_kumpul_lng IS NOT NULL) ORDER BY d.id DESC`).all();
  res.json({ count: rows.length, places: rows.map(shapeRow) });
});

router.get('/:id', requireAuth, (req, res) => {
  const row = db.prepare(`${SELECT_BASE} WHERE d.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  res.json({ disaster: shapeRow(row) });
});

/* ---------------- create / update / delete ---------------- */

function num(v, min, max) {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

// Validasi bersama untuk POST & PUT. `existing` = baris lama (untuk PUT) agar foto lama dihitung.
function validate(req, existing) {
  const body = req.body || {};
  const errors = [];
  const str = (k) => String(body[k] || '').trim();

  const d = {
    nama_lokasi: str('nama_lokasi'),
    alamat: str('alamat'),
    jenis_bencana: str('jenis_bencana'),
    penyebab: str('penyebab'),
    jumlah_rumah: str('jumlah_rumah') || null,
    jumlah_kk: str('jumlah_kk') || null,
    deskripsi: str('deskripsi') || null,
    titik_kumpul: str('titik_kumpul'),
    lat: num(body.lat, -90, 90),
    lng: num(body.lng, -180, 180),
    tk_lat: num(body.tk_lat, -90, 90),
    tk_lng: num(body.tk_lng, -180, 180),
  };
  d.kelurahan = normKelurahan(body.kelurahan);

  if (d.nama_lokasi.length < 2) errors.push('Nama/lokasi titik wajib diisi.');
  if (!d.kelurahan) errors.push('Kelurahan wajib dipilih (' + ENUMS.KELURAHAN.join(', ') + ').');
  if (d.alamat.length < 5) errors.push('Alamat lengkap minimal 5 karakter.');
  if (d.jenis_bencana.length < 3) errors.push('Jenis bencana wajib diisi (isi singkat).');
  if (d.penyebab.length < 3) errors.push('Penyebab bencana wajib diisi.');
  if (d.titik_kumpul.length < 5) errors.push('Alamat titik kumpul wajib diisi (minimal 5 karakter).');
  if (d.tk_lat === null || d.tk_lng === null)
    errors.push('Koordinat titik kumpul wajib diisi (gunakan GPS, klik peta, atau isi manual).');
  if ((d.lat === null) !== (d.lng === null)) errors.push('Koordinat lokasi bencana harus lengkap (latitude dan longitude).');

  d.foto = uploadedPath(req, 'foto') || (existing ? existing.foto : null);
  d.tk_foto = uploadedPath(req, 'foto_titik_kumpul') || (existing ? existing.titik_kumpul_foto : null);
  if (!d.tk_foto) errors.push('Foto titik kumpul wajib diunggah.');
  return { d, errors };
}

router.post('/', requireAuth, uploadPhotos, (req, res) => {
  const { d, errors } = validate(req, null);
  if (errors.length) {
    cleanupFiles(req);
    return res.status(400).json({ error: errors.join(' ') });
  }

  const seq = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM disasters').get().n;
  const ref = genRefCode(seq);
  const info = db.prepare(
    `INSERT INTO disasters (ref_code, owner_id, nama_lokasi, kelurahan, alamat, jenis_bencana, penyebab,
      jumlah_rumah, jumlah_kk, deskripsi, foto, titik_kumpul, titik_kumpul_lat, titik_kumpul_lng,
      titik_kumpul_foto, lat, lng)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    ref, req.user.sub, d.nama_lokasi, d.kelurahan, d.alamat, d.jenis_bencana, d.penyebab,
    d.jumlah_rumah, d.jumlah_kk, d.deskripsi, d.foto, d.titik_kumpul, d.tk_lat, d.tk_lng,
    d.tk_foto, d.lat, d.lng
  );

  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'bencana.baru', targetType: 'disaster', targetId: info.lastInsertRowid,
    targetName: `${ref} — ${d.nama_lokasi}`,
    detail: `Data titik rawan bencana baru [${d.jenis_bencana}] — Kel. ${d.kelurahan}`,
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

  const { d, errors } = validate(req, row);
  if (errors.length) { cleanupFiles(req); return res.status(400).json({ error: errors.join(' ') }); }

  // Hapus file lama hanya bila diganti
  if (d.foto !== row.foto) removeStoredPhoto(row.foto);
  if (d.tk_foto !== row.titik_kumpul_foto) removeStoredPhoto(row.titik_kumpul_foto);

  db.prepare(
    `UPDATE disasters SET nama_lokasi=?, kelurahan=?, alamat=?, jenis_bencana=?, penyebab=?,
      jumlah_rumah=?, jumlah_kk=?, deskripsi=?, foto=?, titik_kumpul=?, titik_kumpul_lat=?,
      titik_kumpul_lng=?, titik_kumpul_foto=?, lat=?, lng=?, updated_at=datetime('now') WHERE id=?`
  ).run(
    d.nama_lokasi, d.kelurahan, d.alamat, d.jenis_bencana, d.penyebab,
    d.jumlah_rumah, d.jumlah_kk, d.deskripsi, d.foto, d.titik_kumpul, d.tk_lat,
    d.tk_lng, d.tk_foto, d.lat, d.lng, row.id
  );

  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'bencana.ubah', targetType: 'disaster', targetId: row.id,
    targetName: `${row.ref_code} — ${d.nama_lokasi}`,
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
  removeStoredPhoto(row.titik_kumpul_foto);
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
