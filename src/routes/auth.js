const express = require('express');
const bcrypt = require('bcryptjs');
const { db, ENUMS, normEnum, normKelurahan, logAction } = require('../db');
const {
  signToken,
  setSessionCookie,
  clearSessionCookie,
  clientIp,
  rateLimit,
  requireAuth,
  cleanPhone,
} = require('../util');

const router = express.Router();

router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const ip = clientIp(req);
  if (rateLimit('login:' + ip, 15, 10 * 60 * 1000) || rateLimit('login-u:' + username, 8, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi 10 menit lagi.' });
  }
  if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi.' });

  const user = db.prepare('SELECT * FROM users WHERE lower(username) = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Username atau password salah.' });
  }
  if (user.approval === 'pending')
    return res.status(403).json({ error: 'Akun Anda menunggu persetujuan Superadmin. Silakan coba lagi setelah disetujui.' });
  if (user.approval === 'rejected')
    return res.status(403).json({ error: 'Pendaftaran akun Anda ditolak. Hubungi Superadmin.' });
  if (!user.is_active) return res.status(403).json({ error: 'Akun dinonaktifkan. Hubungi Superadmin.' });

  setSessionCookie(res, signToken(user), req);
  logAction({
    userId: user.id,
    username: user.username,
    nama: user.nama,
    action: 'auth.login',
    targetType: 'auth',
    detail: 'Login berhasil',
    ip,
  });
  res.json({
    ok: true,
    user: { id: user.id, username: user.username, nama: user.nama, role: user.role, mustReset: !!user.must_reset },
  });
});

router.post('/register', (req, res) => {
  const ip = clientIp(req);
  if (rateLimit('register:' + ip, 5, 60 * 60 * 1000))
    return res.status(429).json({ error: 'Terlalu banyak percobaan pendaftaran. Coba lagi 1 jam lagi.' });

  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase();
  const nama = String(b.nama || '').trim();
  const password = String(b.password || '');
  const hp = cleanPhone(b.hp);
  const kelurahan = normKelurahan(b.kelurahan);
  const jabatan = normEnum(ENUMS.JABATAN, b.jabatan);

  const errors = [];
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) errors.push('Username 3-32 karakter: huruf kecil, angka, titik, strip.');
  if (nama.length < 3 || nama.length > 80) errors.push('Nama lengkap 3-80 karakter.');
  if (password.length < 8) errors.push('Password minimal 8 karakter.');
  if (hp && !/^[+]?[0-9\- ]{8,17}$/.test(hp.replace(/\s/g, ''))) errors.push('Nomor HP tidak valid (8-16 digit).');
  if (!kelurahan) errors.push('Kelurahan wajib dipilih (' + ENUMS.KELURAHAN.join(', ') + ').');
  if (!jabatan) errors.push('Jabatan wajib dipilih (' + ENUMS.JABATAN.join(', ') + ').');
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  if (db.prepare('SELECT id FROM users WHERE lower(username)=?').get(username))
    return res.status(409).json({ error: 'Username sudah dipakai.' });

  // Pendaftaran mandiri selalu role 'admin' (bukan superadmin) & menunggu persetujuan
  const info = db
    .prepare(
      `INSERT INTO users (username, nama, role, password_hash, must_reset, kelurahan, jabatan, hp, approval)
       VALUES (?,?,?,?,0,?,?,?,'pending')`
    )
    .run(username, nama, 'admin', bcrypt.hashSync(password, 10), kelurahan, jabatan, hp || null);

  logAction({
    userId: info.lastInsertRowid,
    username,
    nama,
    action: 'auth.register',
    targetType: 'user',
    targetId: info.lastInsertRowid,
    targetName: `${nama} (@${username})`,
    detail: `Pendaftaran akun baru — ${jabatan}, Kel. ${kelurahan} (menunggu persetujuan)`,
    ip,
  });
  res.status(201).json({
    ok: true,
    message: 'Pendaftaran berhasil. Akun Anda akan aktif setelah disetujui Superadmin.',
  });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db
    .prepare('SELECT id, username, nama, role, is_active, must_reset, kelurahan, jabatan FROM users WHERE id = ?')
    .get(req.user.sub);
  if (!user || !user.is_active) return res.status(401).json({ error: 'Akun tidak aktif / tidak ditemukan.' });
  res.json({
    user: {
      id: user.id,
      username: user.username,
      nama: user.nama,
      role: user.role,
      kelurahan: user.kelurahan || null,
      jabatan: user.jabatan || null,
      mustReset: !!user.must_reset,
    },
  });
});

router.post('/change-password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!next || String(next).length < 8)
    return res.status(400).json({ error: 'Password baru minimal 8 karakter.' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
  if (!user) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  if (!bcrypt.compareSync(String(current || ''), user.password_hash))
    return res.status(400).json({ error: 'Password lama tidak sesuai.' });
  db.prepare('UPDATE users SET password_hash = ?, must_reset = 0 WHERE id = ?').run(
    bcrypt.hashSync(String(next), 10),
    user.id
  );
  logAction({
    userId: user.id,
    username: user.username,
    nama: user.nama,
    action: 'auth.password',
    targetType: 'user',
    targetId: user.id,
    detail: 'Mengubah password sendiri',
    ip: clientIp(req),
  });
  res.json({ ok: true });
});

module.exports = router;
