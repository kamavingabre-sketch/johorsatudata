// Seed sample disaster & worship data so the public map shows all four layers.
const { init, db, genRefCode } = require('../src/db');

const DISASTERS = [
  { nama_lokasi: 'Bantaran Sungai Deli — Titi Kuning', alamat: 'Jl. Sungai Deli, Kel. Titi Kuning', jenis_bencana: 'BANJIR', penyebab: 'Luapan sungai saat curah hujan tinggi dan pendangkalan aliran', jumlah_rumah: '45', jumlah_kk: '52', kelurahan: 'Titi Kuning', lat: 3.5700, lng: 98.6520, titik_kumpul: 'Lapangan Merdeka Kel. Titi Kuning', titik_kumpul_lat: 3.5720, titik_kumpul_lng: 98.6490 },
  { nama_lokasi: 'Perumahan Gedung Johor Indah', alamat: 'Jl. Karya Wisata, Kel. Gedung Johor', jenis_bencana: 'ANGIN PUTING BELIUNG', penyebab: 'Pohon tumbang dan atap rumah rusak akibat angin kencang', jumlah_rumah: '12', jumlah_kk: '15', kelurahan: 'Gedung Johor', lat: 3.5620, lng: 98.6595, titik_kumpul: 'Balai Desa Gedung Johor', titik_kumpul_lat: 3.5640, titik_kumpul_lng: 98.6580 },
];

const WORSHIP = [
  { nama: 'Masjid Al-Ikhlas', jenis: 'MASJID', agama: 'ISLAM', alamat: 'Jl. Johor Raya No. 10', kelurahan: 'Gedung Johor', nama_pengelola: 'Ust. Ahmad Fauzi', hp_pengelola: '081234560001', lat: 3.5792, lng: 98.6440 },
  { nama: 'Gereja HKBP Medan Johor', jenis: 'GEREJA', agama: 'KRISTEN PROTESTAN', alamat: 'Jl. Setia Budi No. 45', kelurahan: 'Suka Maju', nama_pengelola: 'Pdt. Sitorus', hp_pengelola: '081234560002', lat: 3.5830, lng: 98.6320 },
  { nama: 'Vihara Buddha Metta', jenis: 'VIHARA', agama: 'BUDDHA', alamat: 'Jl. Pasar V No. 22', kelurahan: 'Kedai Durian', nama_pengelola: 'Bpk. Lim', hp_pengelola: '081234560003', lat: 3.5760, lng: 98.6540 },
  { nama: 'Pura Agung Suka Maju', jenis: 'PURA', agama: 'HINDU', alamat: 'Jl. Pertanian No. 3', kelurahan: 'Pangkalan Masyhur', nama_pengelola: 'Bpk. Wayan', hp_pengelola: '081234560004', lat: 3.5870, lng: 98.6280 },
];

(async () => {
  await init();
  const superadmin = db.prepare("SELECT id FROM users WHERE username='superadmin'").get();
  const ownerId = superadmin.id;

  for (const d of DISASTERS) {
    const exists = db.prepare('SELECT id FROM disasters WHERE nama_lokasi=?').get(d.nama_lokasi);
    if (exists) continue;
    const seq = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM disasters').get().n;
    const ref = genRefCode(seq);
    db.prepare(`INSERT INTO disasters
      (ref_code, owner_id, nama_lokasi, alamat, jenis_bencana, penyebab, jumlah_rumah, jumlah_kk, kelurahan, lat, lng, titik_kumpul, titik_kumpul_lat, titik_kumpul_lng)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(ref, ownerId, d.nama_lokasi, d.alamat, d.jenis_bencana, d.penyebab, d.jumlah_rumah, d.jumlah_kk, d.kelurahan, d.lat, d.lng, d.titik_kumpul, d.titik_kumpul_lat, d.titik_kumpul_lng);
    console.log('[seed] disaster:', d.nama_lokasi);
  }

  for (const w of WORSHIP) {
    const exists = db.prepare('SELECT id FROM worship_places WHERE nama=?').get(w.nama);
    if (exists) continue;
    const seq = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM worship_places').get().n;
    const ref = genRefCode(seq);
    db.prepare(`INSERT INTO worship_places
      (ref_code, owner_id, nama, jenis, agama, alamat, nama_pengelola, hp_pengelola, kelurahan, lat, lng)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(ref, ownerId, w.nama, w.jenis, w.agama, w.alamat, w.nama_pengelola, w.hp_pengelola, w.kelurahan, w.lat, w.lng);
    console.log('[seed] worship:', w.nama);
  }

  db.saveNow();
  console.log('Selesai.');
})();
