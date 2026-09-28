const express = require('express');
const bcrypt = require('bcryptjs');
const { db, logAction } = require('../db');
const { requireAuth, requireSuper, clientIp } = require('../util');

const router = express.Router();
router.use(requireAuth, requireSuper);

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.nama, u.role, u.is_active, u.must_reset, u.created_at,
              (SELECT COUNT(*) FROM businesses b WHERE b.owner_id = u.id) AS jumlah_data
       FROM users u ORDER BY CASE u.role WHEN 'superadmin' THEN 0 ELSE 1 END, u.created_at`
    )
    .all();
  res.json({ users: rows });
});

router.post('/', (req, res) => {
  const { username, nama, password, role } = req.body || {};
  const uname = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(uname))
    return res.status(400).json({ error: 'Username 3-32 karakter: huruf kecil, angka, titik, strip.' });
  if (!nama || String(nama).trim().length < 3)
    return res.status(400).json({ error: 'Nama lengkap minimal 3 karakter.' });
  if (!password || String(password).length < 8)
    return res.status(400).json({ error: 'Password minimal 8 karakter.' });
  const finalRole = role === 'superadmin' ? 'superadmin' : 'admin';
  if (db.prepare('SELECT id FROM users WHERE lower(username)=?').get(uname))
    return res.status(409).json({ error: 'Username sudah dipakai.' });

  const info = db
    .prepare('INSERT INTO users (username, nama, role, password_hash, must_reset) VALUES (?,?,?,?,1)')
    .run(uname, String(nama).trim(), finalRole, bcrypt.hashSync(String(password), 10));
  logAction({
    userId: req.user.sub,
    username: req.user.username,
    nama: req.user.nama,
    action: 'user.tambah',
    targetType: 'user',
    targetId: info.lastInsertRowid,
    targetName: `${nama} (@${uname})`,
    detail: `Menambahkan akun ${finalRole} baru`,
    ip: clientIp(req),
  });
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!user) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  const { nama, role, is_active, password } = req.body || {};
  const changes = [];

  if (nama && String(nama).trim() !== user.nama) {
    db.prepare('UPDATE users SET nama=? WHERE id=?').run(String(nama).trim(), id);
    changes.push('nama');
  }
  if (role && ['admin', 'superadmin'].includes(role) && role !== user.role) {
    if (user.role === 'superadmin' && role !== 'superadmin' && countSupers() <= 1)
      return res.status(400).json({ error: 'Minimal satu superadmin harus tersisa.' });
    db.prepare('UPDATE users SET role=? WHERE id=?').run(role, id);
    changes.push('role');
  }
  if (is_active !== undefined) {
    const active = is_active ? 1 : 0;
    if (!active && id === req.user.sub) return res.status(400).json({ error: 'Tidak dapat menonaktifkan akun sendiri.' });
    if (!active && user.role === 'superadmin' && countSupers() <= 1)
      return res.status(400).json({ error: 'Minimal satu superadmin aktif.' });
    if (active !== user.is_active) {
      db.prepare('UPDATE users SET is_active=? WHERE id=?').run(active, id);
      changes.push(active ? 'diaktifkan' : 'dinonaktifkan');
    }
  }
  if (password) {
    if (String(password).length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter.' });
    db.prepare('UPDATE users SET password_hash=?, must_reset=1 WHERE id=?').run(
      bcrypt.hashSync(String(password), 10),
      id
    );
    changes.push('password');
  }
  logAction({
    userId: req.user.sub,
    username: req.user.username,
    nama: req.user.nama,
    action: 'user.ubah',
    targetType: 'user',
    targetId: id,
    targetName: `${user.nama} (@${user.username})`,
    detail: changes.length ? 'Mengubah: ' + changes.join(', ') : 'Tidak ada perubahan',
    ip: clientIp(req),
  });
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!user) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  const count = db.prepare('SELECT COUNT(*) c FROM businesses WHERE owner_id=?').get(id).c;
  if (count > 0)
    return res
      .status(400)
      .json({ error: `Akun memiliki ${count} data usaha. Nonaktifkan saja (data & log tetap tercatat).` });
  if (id === req.user.sub) return res.status(400).json({ error: 'Tidak dapat menghapus akun sendiri.' });
  if (user.role === 'superadmin' && countSupers() <= 1)
    return res.status(400).json({ error: 'Minimal satu superadmin harus tersisa.' });
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  logAction({
    userId: req.user.sub,
    username: req.user.username,
    nama: req.user.nama,
    action: 'user.hapus',
    targetType: 'user',
    targetId: id,
    targetName: `${user.nama} (@${user.username})`,
    detail: 'Menghapus akun',
    ip: clientIp(req),
  });
  res.json({ ok: true });
});

function countSupers() {
  return db.prepare("SELECT COUNT(*) c FROM users WHERE role='superadmin' AND is_active=1").get().c;
}

module.exports = router;
