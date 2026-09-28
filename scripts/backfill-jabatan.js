/**
 * Isi otomatis kolom `jabatan` & `kelurahan` untuk akun LAMA berdasarkan pola username.
 *
 *   kepling<no><kode>   -> jabatan KEPLING
 *   lurah<nama kelurahan> -> jabatan LURAH
 *
 * Kode kelurahan: sm=Suka Maju, tk=Titi Kuning, kd=Kedai Durian,
 *                 pm=Pangkalan Masyhur, gj=Gedung Johor, kb=Kwala Bekala
 *
 * Aman dijalankan berulang: hanya mengisi akun yang jabatan/kelurahannya MASIH KOSONG.
 * Mode default = DRY RUN (tidak mengubah apa pun). Tambahkan --apply untuk menyimpan.
 *
 *   node scripts/backfill-jabatan.js          # lihat rencana
 *   node scripts/backfill-jabatan.js --apply  # simpan perubahan
 */
const { init, db } = require('../src/db');

const KODE = { sm: 'Suka Maju', tk: 'Titi Kuning', kd: 'Kedai Durian', pm: 'Pangkalan Masyhur', gj: 'Gedung Johor', kb: 'Kwala Bekala' };
const LURAH = {
  lurahsukamaju: 'Suka Maju',
  lurahtitikuning: 'Titi Kuning',
  lurahkedaidurian: 'Kedai Durian',
  lurahpangkalanmasyhur: 'Pangkalan Masyhur',
  lurahpangkalanmahsyur: 'Pangkalan Masyhur', // ejaan lama pada data
  lurahgedungjohor: 'Gedung Johor',
  lurahkwalabekala: 'Kwala Bekala',
};

function guess(username) {
  const u = String(username).toLowerCase();
  if (LURAH[u]) return { jabatan: 'LURAH', kelurahan: LURAH[u] };
  const m = u.match(/^kepling\d+(sm|tk|kd|pm|gj|kb)$/);
  if (m) return { jabatan: 'KEPLING', kelurahan: KODE[m[1]] };
  return null;
}

(async () => {
  const apply = process.argv.includes('--apply');
  await init();
  const users = db.prepare("SELECT id, username, jabatan, kelurahan FROM users WHERE role != 'superadmin'").all();
  let changed = 0, skipped = 0, unknown = [];
  for (const u of users) {
    if (u.jabatan && u.kelurahan) { skipped++; continue; }
    const g = guess(u.username);
    if (!g) { unknown.push(u.username); continue; }
    console.log(`${apply ? 'UPDATE' : 'akan diisi'}  ${u.username.padEnd(24)} -> ${g.jabatan.padEnd(8)} ${g.kelurahan}`);
    if (apply) db.prepare('UPDATE users SET jabatan = COALESCE(jabatan, ?), kelurahan = COALESCE(kelurahan, ?) WHERE id = ?').run(g.jabatan, g.kelurahan, u.id);
    changed++;
  }
  console.log(`\n${apply ? 'Diperbarui' : 'Akan diperbarui'}: ${changed} akun | sudah lengkap: ${skipped} | pola tidak dikenal: ${unknown.length}`);
  if (unknown.length) console.log('Isi manual lewat Kelola Admin:', unknown.join(', '));
  if (apply) { db.saveNow(); console.log('Tersimpan.'); } else console.log('\n(DRY RUN) Jalankan dengan --apply untuk menyimpan.');
})();
