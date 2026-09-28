const express = require('express');
const { db } = require('../db');
const { requireAuth, requireSuper } = require('../util');

const router = express.Router();

router.get('/logs', requireAuth, (req, res) => {
  const isSuper = req.user.role === 'superadmin';
  const where = [];
  const params = {};
  if (!isSuper) {
    where.push('user_id = @me');
    params.me = req.user.sub;
  } else if (req.query.user) {
    where.push('user_id = @uid');
    params.uid = parseInt(req.query.user, 10);
  }
  if (req.query.action) {
    where.push('action LIKE @act');
    params.act = req.query.action + '%';
  }
  if (req.query.q) {
    where.push('(target_name LIKE @q OR detail LIKE @q OR username LIKE @q OR user_nama LIKE @q)');
    params.q = `%${req.query.q}%`;
  }
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const per = 25;
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) c FROM activity_logs ${whereSql}`).get(params).c;
  const rows = db
    .prepare(`SELECT * FROM activity_logs ${whereSql} ORDER BY id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: per, offset: (page - 1) * per });
  res.json({ total, page, per, rows });
});

router.get('/logs/export', requireAuth, requireSuper, (req, res) => {
  const rows = db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 5000').all();
  const head = ['waktu', 'pengguna', 'aksi', 'tipe', 'target', 'detail', 'ip'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    head.join(';'),
    ...rows.map((r) => [r.created_at, r.nama ? `${r.nama} (@${r.username})` : '', r.action, r.target_type, r.target_name, r.detail, r.ip].map(esc).join(';')),
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="log-aktivitas.csv"');
  res.send('\ufeff' + csv);
});

module.exports = router;
