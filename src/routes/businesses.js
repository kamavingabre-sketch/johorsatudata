const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, ENUMS, logAction, genRefCode } = require('../db');
const { UPLOADS_DIR } = require('../config');
const { requireAuth, requireSuper, clientIp, cleanPhone, toBool } = require('../util');

const router = express.Router();

/* ---------------- helpers ---------------- */

function activeCustomFields() {
  return db
    .prepare('SELECT * FROM fields WHERE is_system=0 AND active=1 ORDER BY sort, id')
    .all();
}
function parseOptions(f) {
  try {
    const v = JSON.parse(f.options);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
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
  const photoFields = activeCustomFields().filter((f) => f.type === 'photo');
  const list = [
    { name: 'foto_usaha', maxCount: 1 },
    { name: 'izin_foto', maxCount: 1 },
    ...photoFields.map((f) => ({ name: `f${f.id}`, maxCount: 1 })),
  ];
  const mw = multer({
    storage: storage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 12 },
    fileFilter: (req2, file, cb) => {
      if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
      cb(new Error('Format foto harus JPG, PNG, atau WEBP (maks 8 MB).'));
    },
  }).fields(list);
  mw(req, res, (err) => {
    if (err) {
      cleanupFiles(req);
      if (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT')
        return res.status(400).json({ error: 'Ukuran/jumlah file melebihi batas (8 MB, maks 12 file).' });
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
    for (const f of arr) {
      fs.promises.unlink(f.path).catch(() => {});
    }
  }
}

// Hapus file lama (hanya file upload lokal di /uploads/)
function removeStoredPhoto(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const abs = path.join(UPLOADS_DIR, url.slice('/uploads/'.length));
  if (!abs.startsWith(UPLOADS_DIR)) return;
  fs.promises.unlink(abs).catch(() => {});
}

function shapeRow(row, withOwner = true) {
  let extra = {};
  try {
    extra = JSON.parse(row.extra || '{}');
  } catch {}
  const out = {
    id: row.id,
    ref: row.ref_code,
    nama_usaha: row.nama_usaha,
    jenis_kepemilikan: row.jenis_kepemilikan,
    kategori_usaha: row.kategori_usaha,
    izin_usaha: !!row.izin_usaha,
    izin_foto: row.izin_foto || null,
    nama_pic: row.nama_pic,
    hp_pic: row.hp_pic,
    kelengkapan_keamanan: row.kelengkapan_keamanan,
    foto_usaha: row.foto_usaha || null,
    alamat: row.alamat,
    lat: row.lat,
    lng: row.lng,
    extra,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (withOwner) {
    out.owner_id = row.owner_id;
    out.owner_nama = row.owner_nama || null;
    out.owner_username = row.owner_username || null;
  }
  return out;
}

const SELECT_BASE = `SELECT b.*, u.nama AS owner_nama, u.username AS owner_username FROM businesses b LEFT JOIN users u ON u.id = b.owner_id`;

/* ---------------- list & detail ---------------- */

router.get('/', requireAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const per = Math.min(100, Math.max(5, parseInt(req.query.per || '12', 10) || 12));
  const where = [];
  const params = {};
  if (req.query.search) {
    where.push('(b.nama_usaha LIKE @q OR b.alamat LIKE @q OR b.nama_pic LIKE @q OR b.hp_pic LIKE @q OR b.ref_code LIKE @q)');
    params.q = `%${String(req.query.search).trim()}%`;
  }
  if (req.query.kategori) {
    where.push('b.kategori_usaha = @kategori');
    params.kategori = req.query.kategori;
  }
  if (req.query.jenis) {
    where.push('b.jenis_kepemilikan = @jenis');
    params.jenis = req.query.jenis;
  }
  if (req.query.keamanan) {
    where.push('b.kelengkapan_keamanan = @keamanan');
    params.keamanan = req.query.keamanan;
  }
  if (req.query.izin === '1' || req.query.izin === '0') {
    where.push('b.izin_usaha = @izin');
    params.izin = req.query.izin === '1' ? 1 : 0;
  }
  if (req.query.mine === '1') {
    where.push('b.owner_id = @me');
    params.me = req.user.sub;
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM businesses b ${whereSql}`).get(params).c;
  const rows = db
    .prepare(`${SELECT_BASE} ${whereSql} ORDER BY b.created_at DESC, b.id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: per, offset: (page - 1) * per });
  res.json({ total, page, per, rows: rows.map((r) => shapeRow(r)) });
});

router.get('/all', requireAuth, (req, res) => {
  const rows = db.prepare(`${SELECT_BASE} ORDER BY b.id`).all();
  res.json({ rows: rows.map((r) => shapeRow(r)) });
});

router.get('/:id', requireAuth, (req, res) => {
  const row = db.prepare(`${SELECT_BASE} WHERE b.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  res.json({ business: shapeRow(row) });
});

/* ---------------- create / update / delete ---------------- */

function validateAndNormalize(body, filesExist) {
  const errors = [];
  const data = {};
  const nama_usaha = String(body.nama_usaha || '').trim();
  if (nama_usaha.length < 2 || nama_usaha.length > 120) errors.push('Nama usaha 2-120 karakter.');
  data.nama_usaha = nama_usaha;

  data.jenis_kepemilikan = String(body.jenis_kepemilikan || '').toUpperCase().trim();
  if (!ENUMS.JENIS.includes(data.jenis_kepemilikan)) errors.push('Jenis kepemilikan tidak valid.');

  data.kategori_usaha = String(body.kategori_usaha || '').toUpperCase().trim();
  if (!ENUMS.KATEGORI.includes(data.kategori_usaha)) errors.push('Kategori usaha tidak valid.');

  data.izin_usaha = body.izin_usaha === undefined ? null : toBool(body.izin_usaha) ? 1 : 0;
  if (data.izin_usaha === null) errors.push('Status izin usaha wajib diisi.');

  data.nama_pic = String(body.nama_pic || '').trim();
  if (data.nama_pic.length < 2) errors.push('Nama penanggung jawab wajib diisi.');
  data.hp_pic = cleanPhone(body.hp_pic);
  if (!/^[+]?[0-9\- ]{8,17}$/.test(data.hp_pic.replace(/\s/g, '')))
    errors.push('Nomor HP tidak valid (8-16 digit).');

  data.kelengkapan_keamanan = String(body.kelengkapan_keamanan || '').toUpperCase().trim();
  if (!ENUMS.KEAMANAN.includes(data.kelengkapan_keamanan))
    errors.push('Kelengkapan keselamatan tidak valid.');

  data.alamat = String(body.alamat || '').trim();
  if (data.alamat.length < 5) errors.push('Alamat / lokasi usaha minimal 5 karakter.');
  const lat = parseFloat(body.lat);
  const lng = parseFloat(body.lng);
  data.lat = Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null;
  data.lng = Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null;

  return { data, errors };
}

function validateCustomFields(body, files, mode, existingExtra) {
  const errors = [];
  const out = mode === 'update' ? { ...(existingExtra || {}) } : {};
  const fields = activeCustomFields();
  let incoming = {};
  try {
    incoming = body.extra ? JSON.parse(body.extra) : {};
  } catch {
    errors.push('Format data kolom tambahan tidak valid.');
  }
  for (const f of fields) {
    const key = `f${f.id}`;
    const type = f.type;
    if (type === 'photo') {
      const fileUrl = files && files[key] && files[key][0] ? uploadedPath({ files }, key) : null;
      const removeFlag = body[`hapus_${key}`] === '1';
      const current = out[key] || null;
      if (fileUrl) {
        if (current) removeStoredPhoto(current);
        out[key] = fileUrl;
      } else if (removeFlag) {
        if (current) removeStoredPhoto(current);
        delete out[key];
      }
      if (!out[key] && f.required && mode === 'create')
        errors.push(`Kolom "${f.label}" wajib (unggah fotonya).`);
      continue;
    }
    let v = incoming[key];
    if (v === undefined || v === null) {
      if (mode === 'update' && !Object.prototype.hasOwnProperty.call(incoming, key)) {
        // biarkan nilai lama
        continue;
      }
      v = '';
    }
    v = String(v).trim();
    if (!v) {
      if (f.required) errors.push(`Kolom "${f.label}" wajib diisi.`);
      delete out[key];
      continue;
    }
    if (type === 'number') {
      if (!Number.isFinite(parseFloat(v))) errors.push(`Kolom "${f.label}" harus angka.`);
      else v = String(parseFloat(v));
    } else if (type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) errors.push(`Kolom "${f.label}" harus tanggal (YYYY-MM-DD).`);
    } else if (type === 'select') {
      const opts = parseOptions(f);
      if (opts.length && !opts.includes(v.toUpperCase()) && !opts.includes(v)) {
        const match = opts.find((o) => o.toUpperCase() === v.toUpperCase());
        if (!match) errors.push(`Pilihan "${f.label}" tidak valid.`);
        else v = match;
      }
    } else if (type === 'yesno') {
      v = toBool(v) ? 'ya' : v === 'tidak' ? 'tidak' : '';
      if (!v && f.required) errors.push(`Kolom "${f.label}" wajib diisi (Ya/Tidak).`);
      if (!v) {
        delete out[key];
        continue;
      }
    } else if (type === 'phone') {
      v = cleanPhone(v);
    } else {
      if (v.length > 2000) errors.push(`Kolom "${f.label}" maksimal 2000 karakter.`);
    }
    out[key] = v;
  }
  return { extra: out, errors };
}

router.post('/', requireAuth, uploadPhotos, (req, res) => {
  const { data, errors } = validateAndNormalize(req.body);
  const files = req.files || {};

  const foto = uploadedPath(req, 'foto_usaha');
  if (!foto) errors.push('Foto usaha wajib diunggah.');
  const izinFoto = uploadedPath(req, 'izin_foto');
  if (data.izin_usaha === 1 && !izinFoto) errors.push('Izin usaha ADA → unggah foto dokumennya.');
  if (data.izin_usaha === 0 && izinFoto) removeStoredPhoto(izinFoto);

  const cust = validateCustomFields(req.body, files, 'create');
  errors.push(...cust.errors);

  if (errors.length) {
    cleanupFiles(req);
    return res.status(400).json({ error: [...new Set(errors)].join(' ') });
  }

  const seq = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM businesses').get().n;
  const ref = genRefCode(seq);
  const info = db
    .prepare(
      `INSERT INTO businesses (ref_code, owner_id, nama_usaha, jenis_kepemilikan, kategori_usaha,
        izin_usaha, izin_foto, nama_pic, hp_pic, kelengkapan_keamanan, foto_usaha, alamat, lat, lng, extra)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      ref,
      req.user.sub,
      data.nama_usaha,
      data.jenis_kepemilikan,
      data.kategori_usaha,
      data.izin_usaha,
      data.izin_usaha === 1 ? izinFoto : null,
      data.nama_pic,
      data.hp_pic,
      data.kelengkapan_keamanan,
      foto,
      data.alamat,
      data.lat,
      data.lng,
      JSON.stringify(cust.extra)
    );
  logAction({
    userId: req.user.sub,
    username: req.user.username,
    nama: req.user.nama,
    action: 'pendataan.baru',
    targetType: 'business',
    targetId: info.lastInsertRowid,
    targetName: `${ref} — ${data.nama_usaha}`,
    detail: `Pendataan usaha baru [${data.kategori_usaha}] di ${data.alamat.slice(0, 80)}`,
    ip: clientIp(req),
  });
  const row = db.prepare(`${SELECT_BASE} WHERE b.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ ok: true, business: shapeRow(row) });
});

router.put('/:id', requireAuth, uploadPhotos, (req, res) => {
  const row = db.prepare('SELECT * FROM businesses WHERE id = ?').get(req.params.id);
  if (!row) {
    cleanupFiles(req);
    return res.status(404).json({ error: 'Data tidak ditemukan.' });
  }
  if (req.user.role !== 'superadmin' && row.owner_id !== req.user.sub) {
    cleanupFiles(req);
    return res.status(403).json({ error: 'Anda hanya dapat menyunting data yang Anda buat sendiri.' });
  }

  const { data, errors } = validateAndNormalize(req.body);
  const files = req.files || {};

  let foto = row.foto_usaha;
  const newFoto = uploadedPath(req, 'foto_usaha');
  if (newFoto) {
    removeStoredPhoto(foto);
    foto = newFoto;
  }
  if (!foto) errors.push('Foto usaha wajib ada.');

  let izinFoto = row.izin_foto;
  const newIzinFoto = uploadedPath(req, 'izin_foto');
  if (data.izin_usaha === 0 && izinFoto) {
    removeStoredPhoto(izinFoto);
    izinFoto = null;
  }
  if (newIzinFoto) {
    removeStoredPhoto(izinFoto);
    izinFoto = newIzinFoto;
  }
  if (req.body.hapus_izin_foto === '1' && izinFoto && !newIzinFoto) {
    removeStoredPhoto(izinFoto);
    izinFoto = null;
  }
  if (data.izin_usaha === 1 && !izinFoto) errors.push('Izin usaha ADA → foto dokumen wajib ada.');

  const cust = validateCustomFields(req.body, files, 'update', JSON.parse(row.extra || '{}'));
  errors.push(...cust.errors);

  if (errors.length) {
    cleanupFiles(req);
    return res.status(400).json({ error: [...new Set(errors)].join(' ') });
  }

  db.prepare(
    `UPDATE businesses SET nama_usaha=?, jenis_kepemilikan=?, kategori_usaha=?, izin_usaha=?, izin_foto=?,
      nama_pic=?, hp_pic=?, kelengkapan_keamanan=?, foto_usaha=?, alamat=?, lat=?, lng=?, extra=?,
      updated_at=datetime('now') WHERE id=?`
  ).run(
    data.nama_usaha,
    data.jenis_kepemilikan,
    data.kategori_usaha,
    data.izin_usaha,
    data.izin_usaha === 1 ? izinFoto : null,
    data.nama_pic,
    data.hp_pic,
    data.kelengkapan_keamanan,
    foto,
    data.alamat,
    data.lat,
    data.lng,
    JSON.stringify(cust.extra),
    row.id
  );

  const diffs = [];
  const old = row;
  if (old.nama_usaha !== data.nama_usaha) diffs.push('nama usaha');
  if (old.kategori_usaha !== data.kategori_usaha) diffs.push('kategori');
  if (old.jenis_kepemilikan !== data.jenis_kepemilikan) diffs.push('jenis kepemilikan');
  if (old.izin_usaha !== data.izin_usaha) diffs.push('izin usaha');
  if (old.kelengkapan_keamanan !== data.kelengkapan_keamanan) diffs.push('kelengkapan keselamatan');
  if (old.nama_pic !== data.nama_pic || old.hp_pic !== data.hp_pic) diffs.push('penanggung jawab');
  if (old.alamat !== data.alamat || old.lat !== data.lat || old.lng !== data.lng) diffs.push('lokasi');
  if (JSON.stringify(JSON.parse(old.extra || '{}')) !== JSON.stringify(cust.extra)) diffs.push('kolom tambahan');

  logAction({
    userId: req.user.sub,
    username: req.user.username,
    nama: req.user.nama,
    action: 'pendataan.ubah',
    targetType: 'business',
    targetId: row.id,
    targetName: `${row.ref_code} — ${data.nama_usaha}`,
    detail: diffs.length ? 'Mengubah: ' + diffs.join(', ') : 'Menyimpan tanpa perubahan field utama',
    ip: clientIp(req),
  });
  const updated = db.prepare(`${SELECT_BASE} WHERE b.id = ?`).get(row.id);
  res.json({ ok: true, business: shapeRow(updated) });
});

router.delete('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM businesses WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Data tidak ditemukan.' });
  if (req.user.role !== 'superadmin' && row.owner_id !== req.user.sub)
    return res.status(403).json({ error: 'Anda hanya dapat menghapus data yang Anda buat sendiri.' });

  removeStoredPhoto(row.foto_usaha);
  removeStoredPhoto(row.izin_foto);
  try {
    const extra = JSON.parse(row.extra || '{}');
    for (const v of Object.values(extra)) {
      if (typeof v === 'string' && v.startsWith('/uploads/')) removeStoredPhoto(v);
    }
  } catch {}
  db.prepare('DELETE FROM businesses WHERE id = ?').run(row.id);
  logAction({
    userId: req.user.sub,
    username: req.user.username,
    nama: req.user.nama,
    action: 'pendataan.hapus',
    targetType: 'business',
    targetId: row.id,
    targetName: `${row.ref_code} — ${row.nama_usaha}`,
    detail: `Menghapus data usaha "${row.nama_usaha}"${row.owner_id !== req.user.sub ? ' (milik admin lain)' : ''}`,
    ip: clientIp(req),
  });
  res.json({ ok: true });
});

/* ---------------- peta ---------------- */

router.get('/map/all', requireAuth, (req, res) => {
  const rows = db.prepare(`${SELECT_BASE} WHERE b.lat IS NOT NULL AND b.lng IS NOT NULL ORDER BY b.id DESC`).all();
  res.json({ count: rows.length, places: rows.map((r) => shapeRow(r)) });
});

module.exports = router;
