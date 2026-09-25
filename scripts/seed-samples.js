const path = require('path');
const bcrypt = require('bcryptjs');
const { init, db, logAction, genRefCode } = require('../src/db');

const SAMPLES = [
  { nama_usaha: 'Warung Nasi Padang Sederhana', jenis: 'PERSEORANGAN', kategori: 'KULINER', izin: 1, pic: 'Hj. Siti', hp: '081234567890', keamanan: 'LENGKAP', alamat: 'Jl. Karya Wisata No. 12, Medan Johor', lat: 3.5645, lng: 98.6567 },
  { nama_usaha: 'Bengkel Motor Jaya Teknik', jenis: 'CV', kategori: 'JASA PERBAIKAN DAN TEKNIK', izin: 1, pic: 'Budi Santoso', hp: '082345678901', keamanan: 'LENGKAP', alamat: 'Jl. Bunga Ncole No. 45, Medan Johor', lat: 3.5712, lng: 98.6423 },
  { nama_usaha: 'Laundry Bersih Cemerlang', jenis: 'PERSEORANGAN', kategori: 'LAUNDRY DAN DOORSMEER', izin: 0, pic: 'Rina Wati', hp: '083456789012', keamanan: 'KURANG LENGKAP', alamat: 'Jl. Setia Budi No. 88, Medan Johor', lat: 3.5834, lng: 98.6312 },
  { nama_usaha: 'Salon Cantik Ayu', jenis: 'PERSEORANGAN', kategori: 'JASA PERAWATAN KECANTIKAN', izin: 1, pic: 'Ayu Lestari', hp: '084567890123', keamanan: 'LENGKAP', alamat: 'Jl. Dr. Mansyur No. 23, Medan Johor', lat: 3.5689, lng: 98.6489 },
  { nama_usaha: 'Toko Sembako Makmur', jenis: 'CV', kategori: 'PERDAGANGAN', izin: 1, pic: 'Hasan Basri', hp: '085678901234', keamanan: 'LENGKAP', alamat: 'Jl. Pasar V No. 5, Medan Johor', lat: 3.5756, lng: 98.6545 },
  { nama_usaha: 'Peternakan Ayam Sejahtera', jenis: 'PERSEORANGAN', kategori: 'PETERNAKAN', izin: 0, pic: 'Pak Darmawan', hp: '086789012345', keamanan: 'TIDAK LENGKAP', alamat: 'Jl. Tambak No. 100, Medan Johor', lat: 3.5923, lng: 98.6234 },
  { nama_usaha: 'Kebun Sayur Organik', jenis: 'YAYASAN', kategori: 'PERTANIAN', izin: 1, pic: 'Ibu Kartini', hp: '087890123456', keamanan: 'LENGKAP', alamat: 'Jl. Pertanian No. 7, Medan Johor', lat: 3.5567, lng: 98.6678 },
  { nama_usaha: 'Kolam Ikan Lele Barokah', jenis: 'PERSEORANGAN', kategori: 'PERIKANAN', izin: 0, pic: 'Pak Sulaiman', hp: '088901234567', keamanan: 'KURANG LENGKAP', alamat: 'Jl. Tambak Ikan No. 15, Medan Johor', lat: 3.5945, lng: 98.6198 },
  { nama_usaha: 'PT. Kerajinan Tangan Nusantara', jenis: 'PT', kategori: 'PRODUKSI DAN INDUSTRI RUMAH TANGGA', izin: 1, pic: 'Dewi Anggraini', hp: '089012345678', keamanan: 'LENGKAP', alamat: 'Jl. Industri No. 30, Medan Johor', lat: 3.5812, lng: 98.6389 },
  { nama_usaha: 'Kedai Kopi Johor', jenis: 'CV', kategori: 'KULINER', izin: 1, pic: 'Rizky Pratama', hp: '081123456789', keamanan: 'LENGKAP', alamat: 'Jl. Johor Raya No. 1, Medan Johor', lat: 3.5789, lng: 98.6456 },
];

(async () => {
  await init();

  // Create admin user
  const hash = bcrypt.hashSync('Admin2026!', 10);
  try {
    db.prepare("INSERT INTO users (username, nama, role, password_hash, must_reset) VALUES (?,?,?,?,0)").run('admin1', 'Admin Pertama', 'admin', hash);
    console.log('[seed] Admin1 dibuat -> username: admin1, password: Admin2026!');
  } catch {}

  const admin = db.prepare("SELECT id FROM users WHERE username='admin1'").get();
  const superadmin = db.prepare("SELECT id FROM users WHERE username='superadmin'").get();

  SAMPLES.forEach((s, i) => {
    const seq = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM businesses').get().n;
    const ref = genRefCode(seq);
    const ownerId = i % 2 === 0 ? admin.id : superadmin.id;
    db.prepare(
      `INSERT INTO businesses (ref_code, owner_id, nama_usaha, jenis_kepemilikan, kategori_usaha,
        izin_usaha, izin_foto, nama_pic, hp_pic, kelengkapan_keamanan, foto_usaha, alamat, lat, lng, extra)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(ref, ownerId, s.nama_usaha, s.jenis, s.kategori, s.izin, null, s.pic, s.hp, s.keamanan, null, s.alamat, s.lat, s.lng, '{}');
    logAction({ userId: ownerId, username: ownerId === admin.id ? 'admin1' : 'superadmin', nama: ownerId === admin.id ? 'Admin Pertama' : 'Super Administrator', action: 'pendataan.baru', targetType: 'business', targetId: seq, targetName: `${ref} — ${s.nama_usaha}`, detail: `Seed data: ${s.kategori}`, ip: '127.0.0.1' });
  });

  console.log(`[seed] ${SAMPLES.length} contoh data usaha ditambahkan.`);
  db.saveNow();
})();
