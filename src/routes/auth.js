const express = require('express');
const bcrypt = require('bcryptjs');
const { db, logAction } = require('../db');
const {
  signToken,
  setSessionCookie,
  clearSessionCookie,
  clientIp,
  rateLimit,
  requireAuth,
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

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const user = db
    .prepare('SELECT id, username, nama, role, is_active, must_reset FROM users WHERE id = ?')
    .get(req.user.sub);
  if (!user || !user.is_active) return res.status(401).json({ error: 'Akun tidak aktif / tidak ditemukan.' });
  res.json({
    user: {
      id: user.id,
      username: user.username,
      nama: user.nama,
      role: user.role,
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
