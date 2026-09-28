/* Regresi halaman data publik (public/data.html):
   - peta harus memenuhi layar di HP
   - panel cari & filter tidak boleh menutupi peta/kontrol peta secara permanen
   - tombol login petugas tidak ditampilkan di halaman publik
*/
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'data.html'), 'utf8');
const style = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

/* Kumpulkan blok @media beserta isinya (brace matching, bukan regex rakus) */
function mediaBlocks(css) {
  const blocks = [];
  const re = /@media([^{]+)\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    blocks.push({ params: m[1].trim(), body: css.slice(re.lastIndex, i - 1) });
  }
  return blocks;
}

/* Ambil deklarasi sebuah selector di dalam sepotong CSS.
   Kemunculan terakhir yang dipakai — specificity sama, jadi urutan sumber yang menang. */
function declarations(css, selector) {
  let idx = -1;
  let cursor = 0;
  while ((cursor = css.indexOf(selector + ' {', cursor)) !== -1) {
    idx = cursor;
    cursor += selector.length + 3;
  }
  if (idx === -1) return null;
  const end = css.indexOf('}', idx);
  return css.slice(idx + selector.length + 3, end);
}

test('login petugas dihapus dari halaman data publik', () => {
  assert.equal(/href="\/login\.html"/.test(html), false, 'masih ada tautan ke /login.html');
  assert.equal(/Masuk Petugas/i.test(html), false, 'masih ada teks "Masuk Petugas"');
  assert.equal(/class="header-right"/.test(html), false, 'wadah header-right masih ada');
});

test('kanvas peta tidak dibatasi tinggi tetap pada layar kecil', () => {
  for (const block of mediaBlocks(style)) {
    const decls = declarations(block.body, '.pub-map-canvas');
    if (decls) {
      assert.equal(/(^|;)\s*height\s*:/.test(decls), false,
        `@media (${block.params}) masih mengunci tinggi .pub-map-canvas: ${decls.trim()}`);
    }
  }
  const base = declarations(style, '.pub-map-canvas');
  assert.match(base, /position:\s*absolute/);
  assert.match(base, /inset:\s*0/);
  assert.match(base, /height:\s*100%/);
});

test('panel cari & filter jadi laci tertutup di layar <= 900px', () => {
  const mobile = mediaBlocks(style).find((b) => b.params === '(max-width: 900px)');
  assert.ok(mobile, 'blok @media (max-width: 900px) tidak ditemukan');

  assert.match(declarations(mobile.body, '.pub-map-side'), /visibility:\s*hidden/);
  assert.match(declarations(mobile.body, '.pub-map-side'), /opacity:\s*0/);
  assert.match(declarations(mobile.body, '.pub-map-side.open'), /visibility:\s*visible/);
  assert.match(declarations(mobile.body, '.map-panel-toggle'), /display:\s*inline-flex/);
});

test('kontrol layer Leaflet digeser supaya tidak tertutup panel di HP', () => {
  const mobile = mediaBlocks(style).find((b) => b.params === '(max-width: 900px)');
  const leafletTop = declarations(mobile.body, '.leaflet-top.leaflet-right');
  assert.match(leafletTop, /top:\s*auto/);
  assert.match(leafletTop, /bottom:\s*\d+px/);
  assert.match(declarations(mobile.body, '.leaflet-bottom.leaflet-right'), /bottom:\s*\d+px/);
});

test('markup + handler laci panel tersedia', () => {
  for (const needle of ['id="mapPanelToggle"', 'id="mapPanelClose"', 'id="mapPanel"', 'aria-controls="mapPanel"']) {
    assert.ok(html.includes(needle), `markup ${needle} hilang`);
  }
  assert.match(html, /function setMapPanel\(/);
  assert.match(html, /classList\.toggle\('open'/);
  assert.match(html, /setAttribute\('aria-expanded'/);
  assert.match(html, /e\.key === 'Escape'/);
});

test('script inline data.html valid secara sintaks', () => {
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  assert.ok(inline.length > 1000, 'script inline tidak ditemukan');
  assert.doesNotThrow(() => new vm.Script(inline));
});
