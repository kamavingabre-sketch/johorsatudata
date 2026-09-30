const express = require('express');
const ExcelJS = require('exceljs');
const { db, logAction } = require('../db');
const { requireAuth, clientIp } = require('../util');

const router = express.Router();

/* ---------------- helpers ---------------- */

function loadCategory(id) {
  return db.prepare('SELECT * FROM data_categories WHERE id = ?').get(id);
}

function loadFields(categoryId) {
  return db.prepare('SELECT * FROM data_category_fields WHERE category_id = ? ORDER BY sort, id').all(categoryId);
}

// Nama sheet Excel: maks 31 karakter, tanpa karakter terlarang
function safeSheetName(s) {
  const cleaned = String(s || 'Data').replace(/[\\/?*[\]:]/g, ' ').trim();
  return (cleaned || 'Data').slice(0, 31);
}

// Nama file aman untuk header Content-Disposition
function safeFileSlug(s) {
  return String(s || 'data')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'data';
}

function absoluteUrl(req, p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  return `${proto}://${host}${p}`;
}

// Kolom "meta" (di luar field kategori) yang boleh diikutsertakan/dikecualikan
// secara terpisah dari field kategori saat memilih kolom ekspor.
const META_COLUMNS = [
  { key: '__ref', header: 'Kode Referensi', width: 16 },
  { key: '__owner_nama', header: 'Pendata', width: 20 },
  { key: '__owner_username', header: 'Username Pendata', width: 18 },
  { key: '__created_at', header: 'Dibuat Pada', width: 20 },
  { key: '__updated_at', header: 'Terakhir Diubah', width: 20 },
];

// Data foto TIDAK PERNAH diikutsertakan dalam ekspor, apa pun pilihan kolom
// yang diminta — baik lewat query string maupun pilihan pengguna di UI.
function exportableFields(fields) {
  return fields.filter((f) => f.type !== 'photo');
}

// Susun kolom worksheet dari definisi field kategori (berlaku sama untuk kategori
// sistem — Data Usaha, Bencana, Rumah Ibadah — maupun kategori buatan Superadmin).
// `selected`, bila diisi (Set berisi key kolom meta dan/atau nama field), membatasi
// kolom yang disertakan sesuai pilihan pengguna. Bila kosong/null, semua kolom
// non-foto disertakan (perilaku bawaan, kompatibel ke belakang).
function buildColumns(fields, selected) {
  const cols = [];
  const wantMeta = (key) => !selected || selected.has(key);
  const wantField = (name) => !selected || selected.has(name);

  if (wantMeta('__ref')) cols.push({ header: 'Kode Referensi', key: '__ref', width: 16 });

  for (const f of exportableFields(fields)) {
    if (!wantField(f.name)) continue;
    if (f.type === 'location') {
      cols.push({ header: `${f.label} (Latitude)`, key: `${f.name}_lat`, width: 14 });
      cols.push({ header: `${f.label} (Longitude)`, key: `${f.name}_lng`, width: 14 });
    } else {
      cols.push({ header: f.label, key: f.name, width: f.type === 'textarea' ? 40 : 22 });
    }
  }

  for (const m of META_COLUMNS.slice(1)) {
    if (wantMeta(m.key)) cols.push({ header: m.header, key: m.key, width: m.width });
  }
  return cols;
}

function formatValue(req, f, row) {
  const v = row[f.name];
  switch (f.type) {
    case 'yesno':
      return v ? 'Ya' : 'Tidak';
    case 'number':
      return v === null || v === undefined ? '' : Number(v);
    default:
      return v === null || v === undefined ? '' : v;
  }
}

// Parse parameter `fields` (daftar key kolom dipisah koma) dari query string.
// Mengembalikan null bila tidak diisi (artinya: semua kolom non-foto).
function parseSelectedColumns(req) {
  const raw = req.query.fields;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const list = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? new Set(list) : null;
}

// Query + filter generik: cari (search) pada kolom teks/pilihan, plus kesamaan
// persis untuk field apa pun bila nama field cocok dengan query string
// (mis. ?kategori_usaha=KULINER, ?izin_usaha=1, ?kelurahan=...).
function queryRows(req, cat, fields) {
  const q = req.query || {};
  const where = [];
  const params = {};

  if (q.search) {
    const searchable = fields.filter((f) => ['text', 'textarea', 'select', 'phone'].includes(f.type));
    let clause = '(ref_code LIKE @q';
    for (const f of searchable) clause += ` OR ${f.name} LIKE @q`;
    clause += ')';
    where.push(clause);
    params.q = `%${String(q.search).trim()}%`;
  }

  for (const f of fields) {
    if (!['select', 'yesno', 'date'].includes(f.type)) continue;
    const raw = q[f.name];
    if (raw === undefined || raw === '') continue;
    if (f.type === 'yesno') {
      where.push(`${f.name} = @${f.name}`);
      params[f.name] = raw === '1' || raw === 'true' ? 1 : 0;
    } else {
      where.push(`${f.name} = @${f.name}`);
      params[f.name] = raw;
    }
  }

  if (q.mine === '1') {
    where.push('owner_id = @me');
    params.me = req.user.sub;
  }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return db.prepare(`SELECT * FROM ${cat.table_name} ${whereSql} ORDER BY id`).all(params);
}

function shapeRows(req, rows, fields) {
  const ownerIds = [...new Set(rows.map((r) => r.owner_id).filter(Boolean))];
  let owners = {};
  if (ownerIds.length) {
    const placeholders = ownerIds.map(() => '?').join(',');
    owners = db
      .prepare(`SELECT id, nama, username FROM users WHERE id IN (${placeholders})`)
      .all(...ownerIds)
      .reduce((acc, u) => { acc[u.id] = u; return acc; }, {});
  }
  return rows.map((r) => {
    const out = {
      __ref: r.ref_code || '',
      __owner_nama: owners[r.owner_id] ? owners[r.owner_id].nama : '',
      __owner_username: owners[r.owner_id] ? owners[r.owner_id].username : '',
      __created_at: r.created_at || '',
      __updated_at: r.updated_at || '',
    };
    for (const f of exportableFields(fields)) {
      if (f.type === 'location') {
        out[`${f.name}_lat`] = r[`${f.name}_lat`] ?? '';
        out[`${f.name}_lng`] = r[`${f.name}_lng`] ?? '';
      } else {
        out[f.name] = formatValue(req, f, r);
      }
    }
    return out;
  });
}

function buildSheet(workbook, req, cat, fields, selected, existingNames) {
  let name = safeSheetName(cat.display_name || cat.name);
  if (existingNames) {
    let base = name.slice(0, 28);
    let i = 2;
    while (existingNames.has(name)) { name = `${base} (${i++})`; }
    existingNames.add(name);
  }
  const sheet = workbook.addWorksheet(name);
  sheet.columns = buildColumns(fields, selected);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  let rows = [];
  try {
    rows = shapeRows(req, queryRows(req, cat, fields), fields);
  } catch (e) {
    rows = [];
  }
  for (const row of rows) sheet.addRow(row);
  if (rows.length) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  }
  return { sheet, count: rows.length };
}

/* ---------------- routes ---------------- */

// Daftar kategori yang dapat diekspor (termasuk kategori buatan Superadmin)
router.get('/categories', requireAuth, (req, res) => {
  const cats = db.prepare('SELECT * FROM data_categories ORDER BY sort, id').all();
  const out = cats.map((c) => {
    let count = 0;
    try { count = db.prepare(`SELECT COUNT(*) c FROM ${c.table_name}`).get().c; } catch { count = 0; }
    return {
      id: c.id,
      name: c.name,
      display_name: c.display_name,
      icon: c.icon,
      is_system: !!c.is_system,
      active: !!c.active,
      count,
    };
  });
  res.json({ categories: out });
});

// Ekspor gabungan seluruh kategori (satu file Excel, satu sheet per kategori)
router.get('/all/xlsx', requireAuth, async (req, res) => {
  const cats = db.prepare('SELECT * FROM data_categories ORDER BY sort, id').all();
  if (!cats.length) return res.status(404).json({ error: 'Belum ada kategori data.' });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'JohorSatuData';
  workbook.created = new Date();
  const usedNames = new Set();
  let totalRows = 0;

  for (const cat of cats) {
    const fields = loadFields(cat.id);
    // Ekspor gabungan selalu menyertakan semua kolom non-foto (tanpa pilihan
    // kolom per-kategori) — pemilihan kolom tersedia pada ekspor satu kategori.
    const { count } = buildSheet(workbook, req, cat, fields, null, usedNames);
    totalRows += count;
  }

  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'data.ekspor', targetType: 'export_all', targetId: null,
    targetName: 'Semua Kategori', detail: `Mengekspor seluruh kategori data (${cats.length} kategori, ${totalRows} baris) ke Excel`,
    ip: clientIp(req),
  });

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="johorsatudata-semua-data-${stamp}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// Daftar kolom yang boleh dipilih pengguna untuk ekspor kategori ini (foto
// selalu dikecualikan), dipakai oleh UI pemilih kolom sebelum mengunduh.
router.get('/:id/fields', requireAuth, (req, res) => {
  const cat = loadCategory(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });
  const fields = loadFields(cat.id);
  const photoCount = fields.filter((f) => f.type === 'photo').length;
  res.json({
    meta: META_COLUMNS.map((m) => ({ key: m.key, label: m.header })),
    fields: exportableFields(fields).map((f) => ({ key: f.name, label: f.label, type: f.type })),
    photo_excluded_count: photoCount,
  });
});

// Ekspor satu kategori (sistem maupun buatan Superadmin) sebagai CSV atau Excel.
// Query ?fields=key1,key2,... membatasi kolom yang disertakan (lihat GET /:id/fields
// untuk daftar kolom yang boleh dipilih). Kolom foto tidak pernah disertakan,
// terlepas dari isi parameter ini.
router.get('/:id', requireAuth, async (req, res) => {
  const cat = loadCategory(req.params.id);
  if (!cat) return res.status(404).json({ error: 'Kategori tidak ditemukan.' });

  const fields = loadFields(cat.id);
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const selected = parseSelectedColumns(req);
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = safeFileSlug(cat.display_name || cat.name);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'JohorSatuData';
  workbook.created = new Date();
  const { sheet, count } = buildSheet(workbook, req, cat, fields, selected);
  if (!sheet.columns.length) {
    return res.status(400).json({ error: 'Pilih minimal satu kolom untuk diekspor.' });
  }

  logAction({
    userId: req.user.sub, username: req.user.username, nama: req.user.nama,
    action: 'data.ekspor', targetType: 'data_category', targetId: cat.id,
    targetName: cat.display_name, detail: `Mengekspor kategori "${cat.display_name}" (${count} baris) ke ${format === 'csv' ? 'CSV' : 'Excel'}`,
    ip: clientIp(req),
  });

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}-${stamp}.csv"`);
    res.write('\uFEFF'); // BOM agar Excel mengenali UTF-8
    await workbook.csv.write(res, { formatterOptions: { delimiter: ',' } });
    res.end();
  } else {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}-${stamp}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  }
});

module.exports = router;
