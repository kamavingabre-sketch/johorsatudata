const express = require('express');
const { db, ENUMS, logAction } = require('../db');
const { requireAuth, requireSuper, clientIp } = require('../util');

const router = express.Router();

function shape(f) {
  return {
    id: f.id,
    label: f.label,
    type: f.type,
    options: safeJson(f.options),
    required: !!f.required,
    isSystem: !!f.is_system,
    systemKey: f.system_key,
    active: !!f.active,
    sort: f.sort,
  };
}
function safeJson(s) {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM fields ORDER BY is_system DESC, sort, id').all();
  res.json({ fields: rows.map(shape) });
});

function validateInput(body) {
  const errors = [];
  const label = String(body.label || '').trim();
  if (label.length < 3 || label.length > 80) errors.push('Label kolom 3-80 karakter.');
  const type = String(body.type || 'text');
  if (!ENUMS.FIELD_TYPES.includes(type)) errors.push('Tipe kolom tidak dikenal.');
  let options = [];
  if (type === 'select') {
    const raw = Array.isArray(body.options)
      ? body.options
      : String(body.options || '').split('\n');
    options = raw.map((o) => String(o).trim()).filter(Boolean);
    options = [...new Set(options.map((o) => o.toUpperCase()))];
    if (options.length < 2) errors.push('Kolom pilihan butuh minimal 2 opsi (satu baris per opsi).');
    if (options.length > 40) errors.push('Maksimal 40 opsi.');
  }
  return { label, type, options, required: body.required ? 1 : 0, errors };
}

router.post('/', requireAuth, requireSuper, (req, res) => {
  const { label, type, options, required, errors } = validateInput(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  const dup = db
    .prepare('SELECT id FROM fields WHERE lower(label)=? AND active=1')
    .get(label.toLowerCase());
  if (dup) return res.status(409).json({ error: 'Sudah ada kolom dengan nama yang sama.' });
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort),0) m FROM fields').get().m;
  const info = db
    .prepare('INSERT INTO fields (label, type, options, required, is_system, active, sort) VALUES (?,?,?,0+?,0,1,?)')
    .run(label, type, JSON.stringify(options), required, maxSort + 1);
  logAction({
    userId: req.user.sub,
    username: req.user.username,
    nama: req.user.nama,
    action: 'kolom.tambah',
    targetType: 'field',
    targetId: info.lastInsertRowid,
    targetName: label,
    detail: `Menambahkan kolom form baru (tipe: ${type})`,
    ip: clientIp(req),
  });
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.put('/:id', requireAuth, requireSuper, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const f = db.prepare('SELECT * FROM fields WHERE id=?').get(id);
  if (!f) return res.status(404).json({ error: 'Kolom tidak ditemukan.' });
  if (f.is_system) return res.status(400).json({ error: 'Kolom bawaan tidak dapat diubah.' });

  if (req.body && req.body.active !== undefined && Object.keys(req.body).length === 1) {
    const active = req.body.active ? 1 : 0;
    db.prepare('UPDATE fields SET active=?, updated_at=datetime("now") WHERE id=?').run(active, id);
    logAction({
      userId: req.user.sub,
      username: req.user.username,
      nama: req.user.nama,
      action: 'kolom.ubah',
      targetType: 'field',
      targetId: id,
      targetName: f.label,
      detail: active ? 'Mengaktifkan kolom' : 'Menonaktifkan kolom (riwayat data tetap tersimpan)',
      ip: clientIp(req),
    });
    return res.json({ ok: true });
  }

  const { label, type, options, required, errors } = validateInput(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });
  db.prepare(
    'UPDATE fields SET label=?, type=?, options=?, required=?, updated_at=datetime("now") WHERE id=?'
  ).run(label, type, JSON.stringify(options), required, id);
  logAction({
    userId: req.user.sub,
    username: req.user.username,
    nama: req.user.nama,
    action: 'kolom.ubah',
    targetType: 'field',
    targetId: id,
    targetName: label,
    detail: 'Menyunting definisi kolom',
    ip: clientIp(req),
  });
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, requireSuper, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const f = db.prepare('SELECT * FROM fields WHERE id=?').get(id);
  if (!f) return res.status(404).json({ error: 'Kolom tidak ditemukan.' });
  if (f.is_system) return res.status(400).json({ error: 'Kolom bawaan tidak dapat dihapus.' });
  const used = db
    .prepare('SELECT COUNT(*) c FROM businesses WHERE extra LIKE ?')
    .get(`%"f${id}"%`).c;
  db.prepare('UPDATE fields SET active=0, updated_at=datetime("now") WHERE id=?').run(id);
  logAction({
    userId: req.user.sub,
    username: req.user.username,
    nama: req.user.nama,
    action: 'kolom.hapus',
    targetType: 'field',
    targetId: id,
    targetName: f.label,
    detail: used > 0 ? `Dihapus dari form (pakai pada ${used} data; nilai lama tetap tersimpan)` : 'Dihapus dari form',
    ip: clientIp(req),
  });
  res.json({ ok: true });
});

module.exports = router;
