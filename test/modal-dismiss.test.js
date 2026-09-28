const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const PUBLIC = path.join(__dirname, '..', 'public');
const read = (file) => fs.readFileSync(path.join(PUBLIC, file), 'utf8');

// Regresi: tombol "X" pada modal wajib-ganti password tampak hidup tapi mati.
// `display: flex` pada .modal-close mengalahkan aturan [hidden] bawaan browser,
// sehingga Setelelemen.hidden = true tidak menyembunyikan tombolnya.
test('tombol tutup modal disembunyikan dengan benar saat modal tidak bisa ditutup', () => {
  const css = read('css/style.css');

  assert.match(css, /\.modal-close\s*\{[^}]*display:\s*flex/, '.modal-close memakai display: flex');
  assert.match(
    css,
    /\.modal-close\[hidden\]\s*\{\s*display:\s*none/,
    'perlu ada .modal-close[hidden] { display: none } agar atribut hidden tetap berlaku'
  );
});

test('Modal tidak merender tombol tutup yang tidak punya aksi saat dismissible: false', () => {
  const app = read('js/app.js');

  // Tombol tutup harus di-render hanya ketika modal bisa ditutup...
  assert.match(app, /\$\{dismissible\s*\?\s*`[^`]*class="modal-close"/);
  // ...dan tidak boleh disembunyikan lewat .hidden (kalau tidak, tombol mati tampil).
  assert.doesNotMatch(app, /\.modal-close`?\)?\.hidden\s*=/);
  // Guard null sebelum memfokuskan elemen (tidak ada tombol X pada modal wajib).
  assert.match(app, /if \(focusTarget\) focusTarget\.focus\(\)/);
});

test('Modal wajib-ganti password punya jalan keluar dan bisa dikirim dengan Enter', () => {
  const dashboard = read('js/dashboard.js');
  const forced = dashboard.slice(dashboard.indexOf('function showChangePasswordModal'));

  // Tidak ada tombol "Batal" (modal memang tidak bisa ditutup)...
  assert.match(forced, /\$\{!mustReset \? '[^']*Batal/);
  // ...tapi ada tombol Keluar supaya pengguna tidak terjebak di dalam modal.
  assert.match(forced, /id="cpLogout"/);
  assert.match(forced, /logoutBtn\.addEventListener\('click', \(\) => Auth\.logout\(\)\)/);
  // Tombol simpan mengikat form dari luar, sehingga Enter pun men-submit.
  assert.match(forced, /id="cpSubmit" form="changePasswordForm"/);
  assert.match(forced, /form\.addEventListener\('submit', async \(e\) => \{\s*e\.preventDefault\(\)/);
  // Cegah submit ganda.
  assert.match(forced, /submitBtn\.disabled = true/);
});
