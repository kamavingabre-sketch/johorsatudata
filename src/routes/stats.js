const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../util');

const router = express.Router();

const SELECT_BASE = `SELECT b.*, u.nama AS owner_nama, u.username AS owner_username FROM businesses b LEFT JOIN users u ON u.id = b.owner_id`;

router.get('/stats', requireAuth, (req, res) => {
  const isSuper = req.user.role === 'superadmin';
  const g = (sql, ...p) => db.prepare(sql).get(...p);
  const totals = g(`SELECT COUNT(*) total,
      COALESCE(SUM(izin_usaha=1),0) izin,
      COALESCE(SUM(kelengkapan_keamanan='LENGKAP'),0) aman_lengkap,
      COALESCE(SUM(lat IS NOT NULL),0) ber_koordinat,
      COALESCE(SUM(strftime('%Y-%m', created_at) = strftime('%Y-%m','now')),0) bulan_ini
    FROM businesses`);
  const disasterTotals = g(`SELECT COUNT(*) total,
      COALESCE(SUM(lat IS NOT NULL),0) ber_koordinat
    FROM disasters`);
  const worshipTotals = g(`SELECT COUNT(*) total,
      COALESCE(SUM(lat IS NOT NULL),0) ber_koordinat
    FROM worship_places`);
  const mine = g('SELECT COUNT(*) c FROM businesses WHERE owner_id = ?', req.user.sub);
  const byKategori = db
    .prepare('SELECT kategori_usaha name, COUNT(*) count FROM businesses GROUP BY kategori_usaha ORDER BY count DESC')
    .all();
  const byJenis = db
    .prepare('SELECT jenis_kepemilikan name, COUNT(*) count FROM businesses GROUP BY jenis_kepemilikan ORDER BY count DESC')
    .all();
  const bySkala = db
    .prepare("SELECT COALESCE(skala_usaha,'BELUM DIISI') name, COUNT(*) count FROM businesses GROUP BY skala_usaha ORDER BY count DESC")
    .all();
  const byPekerja = db
    .prepare("SELECT COALESCE(jumlah_pekerja,'BELUM DIISI') name, COUNT(*) count FROM businesses GROUP BY jumlah_pekerja ORDER BY count DESC")
    .all();
  const byKeamanan = db
    .prepare('SELECT kelengkapan_keamanan name, COUNT(*) count FROM businesses GROUP BY kelengkapan_keamanan')
    .all();
  const byBencana = db
    .prepare('SELECT jenis_bencana name, COUNT(*) count FROM disasters GROUP BY jenis_bencana ORDER BY count DESC')
    .all();
  const byIbadah = db
    .prepare('SELECT agama name, COUNT(*) count FROM worship_places GROUP BY agama ORDER BY count DESC')
    .all();
  const pendata = db
    .prepare(`SELECT u.nama, u.username, COUNT(b.id) c FROM users u LEFT JOIN businesses b ON b.owner_id=u.id
      WHERE u.role='admin' OR u.role='superadmin' GROUP BY u.id ORDER BY c DESC`)
    .all();
  // Gabungkan data terbaru dari: usaha, rumah ibadah, dan kategori dinamis
  const recentBiz = db.prepare(`${SELECT_BASE} ORDER BY b.created_at DESC, b.id DESC LIMIT 8`).all().map(row => ({
    ...shape(row),
    _type: 'usaha',
    _display_name: row.nama_usaha,
    _subtitle: row.alamat,
    _badge: row.kategori_usaha,
  }));

  const recentWorship = db.prepare(`SELECT * FROM worship_places ORDER BY created_at DESC, id DESC LIMIT 8`).all().map(row => ({
    id: row.id,
    _type: 'ibadah',
    _display_name: row.nama,
    _subtitle: row.alamat,
    _badge: row.agama || row.jenis,
    _foto: row.foto || null,
    _hash: `detail-ibadah/${row.id}`,
    created_at: row.created_at,
  }));

  const recentDisaster = db.prepare(`SELECT * FROM disasters ORDER BY created_at DESC, id DESC LIMIT 8`).all().map(row => ({
    id: row.id,
    _type: 'bencana',
    _display_name: row.nama_lokasi,
    _subtitle: row.alamat,
    _badge: row.jenis_bencana,
    _foto: row.foto || null,
    _hash: `detail-bencana/${row.id}`,
    created_at: row.created_at,
  }));

  // Ambil data dari kategori dinamis (non-system)
  const dynCats = db.prepare("SELECT * FROM data_categories WHERE is_system=0 AND active=1").all();
  let recentDynamic = [];
  for (const cat of dynCats) {
    try {
      const fields = db.prepare('SELECT * FROM data_category_fields WHERE category_id = ? ORDER BY sort, id').all(cat.id);
      const nameField = fields.find(f => ['text'].includes(f.type) && (f.name === 'nama' || f.name.startsWith('nama')));
      const rows = db.prepare(`SELECT * FROM ${cat.table_name} ORDER BY created_at DESC, id DESC LIMIT 4`).all();
      for (const row of rows) {
        recentDynamic.push({
          id: row.id,
          _type: 'dynamic',
          _cat_id: cat.id,
          _cat_name: cat.name,
          _display_name: nameField ? (row[nameField.name] || row.ref_code) : row.ref_code,
          _subtitle: cat.display_name,
          _badge: cat.display_name,
          _foto: null,
          _hash: `cat-detail-${cat.id}-${row.id}`,
          created_at: row.created_at,
        });
      }
    } catch (_) {}
  }

  // Gabungkan semua, urutkan by created_at desc, ambil 8 teratas
  const allRecent = [...recentBiz, ...recentDisaster, ...recentWorship, ...recentDynamic]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 8);

  const recent = allRecent;
  const recentLogs = isSuper
    ? db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 8').all()
    : db
        .prepare("SELECT * FROM activity_logs WHERE user_id = ? AND (action LIKE 'pendataan.%' OR action LIKE 'bencana.%' OR action LIKE 'ibadah.%') ORDER BY id DESC LIMIT 8")
        .all(req.user.sub);
  res.json({ totals, disasterTotals, worshipTotals, mine: mine.c, byKategori, byJenis, bySkala, byPekerja, byKeamanan, byBencana, byIbadah, pendata, recent, recentLogs });
});

function shape(row) {
  let extra = {};
  try {
    extra = JSON.parse(row.extra || '{}');
  } catch {}
  return {
    id: row.id,
    ref: row.ref_code,
    nama_usaha: row.nama_usaha,
    jenis_kepemilikan: row.jenis_kepemilikan,
    kategori_usaha: row.kategori_usaha,
    skala_usaha: row.skala_usaha || null,
    jumlah_pekerja: row.jumlah_pekerja || null,
    izin_usaha: !!row.izin_usaha,
    izin_foto: row.izin_foto || null,
    nama_pic: row.nama_pic,
    hp_pic: row.hp_pic,
    kelengkapan_keamanan: row.kelengkapan_keamanan,
    foto_usaha: row.foto_usaha || null,
    alamat: row.alamat,
    kelurahan: row.kelurahan || null,
    lat: row.lat,
    lng: row.lng,
    extra,
    created_at: row.created_at,
    updated_at: row.updated_at,
    owner_id: row.owner_id ?? null,
    owner_nama: row.owner_nama ?? null,
    owner_username: row.owner_username ?? null,
  };
}

/* Endpoint publik untuk landing page */
router.get('/public/summary', (req, res) => {
  const totals = db
    .prepare(`SELECT COUNT(*) total, COALESCE(SUM(izin_usaha=1),0) izin,
        COALESCE(SUM(kelengkapan_keamanan='LENGKAP'),0) aman_lengkap FROM businesses`)
    .get();
  const byKategori = db
    .prepare('SELECT kategori_usaha name, COUNT(*) count FROM businesses GROUP BY kategori_usaha ORDER BY count DESC')
    .all();
  const recent = db
    .prepare(`${SELECT_BASE} ORDER BY b.created_at DESC, b.id DESC LIMIT 9`)
    .all()
    .map(shape);
  const places = db
    .prepare(`${SELECT_BASE} WHERE b.lat IS NOT NULL AND b.lng IS NOT NULL ORDER BY b.id DESC`)
    .all()
    .map(shape);
  res.json({ totals, byKategori, recent, places });
});

module.exports = router;
