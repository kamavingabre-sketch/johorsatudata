const express = require('express');
const { db } = require('../db');

const router = express.Router();

/* ------------------------------------------------------------------ */
/*  Public read-only endpoints — no authentication required            */
/* ------------------------------------------------------------------ */

const BIZ_BASE = `SELECT b.*, u.nama AS owner_nama FROM businesses b LEFT JOIN users u ON u.id = b.owner_id`;
const DIS_BASE = `SELECT d.*, u.nama AS owner_nama FROM disasters d LEFT JOIN users u ON u.id = d.owner_id`;
const WOR_BASE = `SELECT w.*, u.nama AS owner_nama FROM worship_places w LEFT JOIN users u ON u.id = w.owner_id`;

function shapeBiz(row) {
  let extra = {};
  try { extra = JSON.parse(row.extra || '{}'); } catch {}
  return {
    id: row.id, ref: row.ref_code,
    nama_usaha: row.nama_usaha,
    jenis_kepemilikan: row.jenis_kepemilikan,
    kategori_usaha: row.kategori_usaha,
    skala_usaha: row.skala_usaha || null,
    jumlah_pekerja: row.jumlah_pekerja || null,
    izin_usaha: !!row.izin_usaha,
    nama_pic: row.nama_pic,
    hp_pic: row.hp_pic,
    kelengkapan_keamanan: row.kelengkapan_keamanan,
    foto_usaha: row.foto_usaha || null,
    alamat: row.alamat,
    kelurahan: row.kelurahan || null,
    lat: row.lat, lng: row.lng,
    created_at: row.created_at,
  };
}

function shapeDis(row) {
  return {
    id: row.id, ref: row.ref_code,
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
    lat: row.lat, lng: row.lng,
    created_at: row.created_at,
  };
}

function shapeWor(row) {
  return {
    id: row.id, ref: row.ref_code,
    nama: row.nama, jenis: row.jenis, agama: row.agama || '',
    alamat: row.alamat,
    kelurahan: row.kelurahan || null,
    nama_pengelola: row.nama_pengelola,
    hp_pengelola: row.hp_pengelola,
    foto: row.foto || null,
    lat: row.lat, lng: row.lng,
    created_at: row.created_at,
  };
}

/* ---------- Businesses ---------- */

router.get('/businesses', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const per = Math.min(100, Math.max(5, parseInt(req.query.per || '12', 10) || 12));
  const where = [];
  const params = {};
  if (req.query.search) {
    where.push('(b.nama_usaha LIKE @q OR b.alamat LIKE @q OR b.nama_pic LIKE @q)');
    params.q = `%${String(req.query.search).trim()}%`;
  }
  if (req.query.kategori) { where.push('b.kategori_usaha = @kat'); params.kat = req.query.kategori; }
  if (req.query.jenis) { where.push('b.jenis_kepemilikan = @jenis'); params.jenis = req.query.jenis; }
  if (req.query.kelurahan) {
    if (req.query.kelurahan === '__kosong') where.push("(b.kelurahan IS NULL OR b.kelurahan = '')");
    else { where.push('b.kelurahan = @kel'); params.kel = req.query.kelurahan; }
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM businesses b ${whereSql}`).get(params).c;
  const rows = db
    .prepare(`${BIZ_BASE} ${whereSql} ORDER BY b.created_at DESC, b.id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: per, offset: (page - 1) * per });
  res.json({ total, page, per, rows: rows.map(shapeBiz) });
});

router.get('/businesses/map', (req, res) => {
  const rows = db.prepare(`${BIZ_BASE} WHERE b.lat IS NOT NULL AND b.lng IS NOT NULL ORDER BY b.id DESC`).all();
  res.json({ count: rows.length, places: rows.map(shapeBiz) });
});

/* ---------- Disasters ---------- */

router.get('/disasters', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const per = Math.min(100, Math.max(5, parseInt(req.query.per || '12', 10) || 12));
  const where = [];
  const params = {};
  if (req.query.search) {
    where.push('(d.nama_lokasi LIKE @q OR d.alamat LIKE @q OR d.penyebab LIKE @q OR d.titik_kumpul LIKE @q)');
    params.q = `%${String(req.query.search).trim()}%`;
  }
  if (req.query.jenis) { where.push('d.jenis_bencana = @jenis'); params.jenis = req.query.jenis; }
  if (req.query.kelurahan) {
    if (req.query.kelurahan === '__kosong') where.push("(d.kelurahan IS NULL OR d.kelurahan = '')");
    else { where.push('d.kelurahan = @kel'); params.kel = req.query.kelurahan; }
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM disasters d ${whereSql}`).get(params).c;
  const rows = db
    .prepare(`${DIS_BASE} ${whereSql} ORDER BY d.created_at DESC, d.id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: per, offset: (page - 1) * per });
  res.json({ total, page, per, rows: rows.map(shapeDis) });
});

router.get('/disasters/map', (req, res) => {
  const rows = db.prepare(`${DIS_BASE} WHERE (d.lat IS NOT NULL AND d.lng IS NOT NULL) OR (d.titik_kumpul_lat IS NOT NULL AND d.titik_kumpul_lng IS NOT NULL) ORDER BY d.id DESC`).all();
  res.json({ count: rows.length, places: rows.map(shapeDis) });
});

/* ---------- Worship Places ---------- */

router.get('/worship', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const per = Math.min(100, Math.max(5, parseInt(req.query.per || '12', 10) || 12));
  const where = [];
  const params = {};
  if (req.query.search) {
    where.push('(w.nama LIKE @q OR w.alamat LIKE @q OR w.nama_pengelola LIKE @q OR w.jenis LIKE @q)');
    params.q = `%${String(req.query.search).trim()}%`;
  }
  if (req.query.agama) { where.push('w.agama = @agama'); params.agama = req.query.agama; }
  if (req.query.kelurahan) {
    if (req.query.kelurahan === '__kosong') where.push("(w.kelurahan IS NULL OR w.kelurahan = '')");
    else { where.push('w.kelurahan = @kel'); params.kel = req.query.kelurahan; }
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM worship_places w ${whereSql}`).get(params).c;
  const rows = db
    .prepare(`${WOR_BASE} ${whereSql} ORDER BY w.created_at DESC, w.id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: per, offset: (page - 1) * per });
  res.json({ total, page, per, rows: rows.map(shapeWor) });
});

router.get('/worship/map', (req, res) => {
  const rows = db.prepare(`${WOR_BASE} WHERE w.lat IS NOT NULL AND w.lng IS NOT NULL ORDER BY w.id DESC`).all();
  res.json({ count: rows.length, places: rows.map(shapeWor) });
});

/* ---------- Summary (stats for public) ---------- */

router.get('/summary', (req, res) => {
  const bizTotal = db.prepare('SELECT COUNT(*) c FROM businesses').get().c;
  const disTotal = db.prepare('SELECT COUNT(*) c FROM disasters').get().c;
  const worTotal = db.prepare('SELECT COUNT(*) c FROM worship_places').get().c;
  const byKategori = db
    .prepare('SELECT kategori_usaha name, COUNT(*) count FROM businesses GROUP BY kategori_usaha ORDER BY count DESC')
    .all();
  const byBencana = db
    .prepare('SELECT jenis_bencana name, COUNT(*) count FROM disasters GROUP BY jenis_bencana ORDER BY count DESC')
    .all();
  const byIbadah = db
    .prepare('SELECT agama name, COUNT(*) count FROM worship_places GROUP BY agama ORDER BY count DESC')
    .all();
  res.json({ bizTotal, disTotal, worTotal, byKategori, byBencana, byIbadah });
});

module.exports = router;