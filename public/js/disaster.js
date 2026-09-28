/* ========================================
   Disaster Module — Titik Rawan Bencana + Titik Kumpul
   ======================================== */

const Disaster = (() => {
  const esc = (s) => App.escapeHtml(s);
  let pickers = [];

  function destroyPickers() {
    pickers.forEach((p) => { try { p.destroy(); } catch {} });
    pickers = [];
  }

  function kelOptions(meta, selected) {
    return (meta.enums.kelurahan || [])
      .map((k) => `<option value="${esc(k)}" ${selected === k ? 'selected' : ''}>${esc(k)}</option>`)
      .join('');
  }

  /* ---------------- LIST ---------------- */

  async function renderList(container) {
    destroyPickers();
    const meta = await App.fetchMeta();
    container.innerHTML = `
      <div class="data-toolbar">
        <input type="text" class="search-input" id="disasterSearch" placeholder="Cari lokasi, alamat, penyebab, titik kumpul…">
        <select class="filter-select" id="disasterKel">
          <option value="">Semua Kelurahan</option>
          ${kelOptions(meta, '')}
          <option value="__kosong">— Belum diisi —</option>
        </select>
        <a href="#tambah-bencana" class="btn btn-primary btn-sm">${Icon.i('plus')} Tambah Bencana</a>
      </div>
      <div id="disasterTableContainer"><div class="loading">Memuat...</div></div>
    `;

    let page = 1;
    async function loadData() {
      const params = new URLSearchParams({ page, per: 15 });
      const search = document.getElementById('disasterSearch').value;
      const kel = document.getElementById('disasterKel').value;
      if (search) params.set('search', search);
      if (kel) params.set('kelurahan', kel);
      try {
        const data = await App.api(`/api/disasters?${params}`);
        document.getElementById('disasterTableContainer').innerHTML = renderTable(data);
      } catch (e) {
        document.getElementById('disasterTableContainer').innerHTML = `<p class="text-danger">${esc(e.message)}</p>`;
      }
    }
    document.getElementById('disasterSearch').addEventListener('input', App.debounce(() => { page = 1; loadData(); }));
    document.getElementById('disasterKel').addEventListener('change', () => { page = 1; loadData(); });
    window._loadDisasters = loadData;
    window._setDisasterPage = (p) => { page = p; loadData(); };
    await loadData();
  }

  function renderTable(data) {
    if (!data.rows.length) {
      return `<div class="empty-state"><div class="empty-state-icon">${Icon.i('waves')}</div><h3>Belum ada data bencana</h3><p>Tidak ada data yang cocok. Tambahkan titik rawan bencana baru.</p></div>`;
    }
    let html = `<div class="data-table-wrap"><table class="data-table">
      <thead><tr>
        <th>Kode</th><th>Lokasi</th><th>Kelurahan</th><th>Jenis</th><th>Penyebab</th>
        <th>Titik Kumpul</th><th>Terdampak</th><th>Pendata</th><th>Aksi</th>
      </tr></thead><tbody>`;
    const user = Auth.getUser();
    for (const r of data.rows) {
      const canEdit = Auth.isSuperadmin() || r.owner_id === user.id;
      const hasTk = r.titik_kumpul_lat != null && r.titik_kumpul_lng != null;
      html += `<tr>
        <td><code>${esc(r.ref)}</code></td>
        <td><a href="#detail-bencana/${r.id}"><strong>${esc(r.nama_lokasi)}</strong></a><br><small class="text-muted">${esc((r.alamat || '').substring(0, 50))}${(r.alamat || '').length > 50 ? '…' : ''}</small></td>
        <td>${r.kelurahan ? `<span class="tag tag-blue">${esc(r.kelurahan)}</span>` : '<span class="text-muted">-</span>'}</td>
        <td><span class="tag tag-orange">${esc(r.jenis_bencana)}</span></td>
        <td>${esc(r.penyebab)}</td>
        <td>${hasTk ? `<span class="tag tag-green">${Icon.i('check')} Ada koordinat</span>` : `<span class="tag tag-red">Belum lengkap</span>`}</td>
        <td><small>${esc(r.jumlah_rumah || '-')} rumah<br>${esc(r.jumlah_kk || '-')} KK</small></td>
        <td><small>${esc(r.owner_nama || '-')}</small></td>
        <td class="actions">
          <button class="btn btn-sm btn-ghost" onclick="window.location.hash='detail-bencana/${r.id}'" title="Detail">👁️</button>
          ${canEdit ? `<button class="btn btn-sm btn-ghost" onclick="window.location.hash='edit-bencana/${r.id}'" title="Edit">✏️</button>
          <button class="btn btn-sm btn-ghost" data-del="${r.id}" data-nama="${esc(r.nama_lokasi)}" title="Hapus">🗑️</button>` : ''}
        </td>
      </tr>`;
    }
    html += '</tbody></table></div>';
    const totalPages = Math.ceil(data.total / data.per);
    if (totalPages > 1) {
      html += '<div class="pagination">';
      html += `<button ${data.page <= 1 ? 'disabled' : ''} onclick="window._setDisasterPage(${data.page - 1})">‹ Sebelumnya</button>`;
      for (let i = 1; i <= Math.min(totalPages, 7); i++) {
        html += `<button class="${i === data.page ? 'active' : ''}" onclick="window._setDisasterPage(${i})">${i}</button>`;
      }
      html += `<button ${data.page >= totalPages ? 'disabled' : ''} onclick="window._setDisasterPage(${data.page + 1})">Berikutnya ›</button></div>`;
    }
    return html;
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-del]');
    if (b && b.closest('#disasterTableContainer')) deleteItem(b.dataset.del, b.dataset.nama);
  });

  /* ---------------- FORM ---------------- */

  async function renderForm(container, id) {
    destroyPickers();
    const meta = await App.fetchMeta();
    const isEdit = !!id;
    let d = null;
    if (isEdit) {
      try {
        d = (await App.api(`/api/disasters/${id}`)).disaster;
      } catch (e) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${Icon.i('alert-circle')}</div><h3>Terjadi Kesalahan</h3><p>${esc(e.message)}</p></div>`;
        return;
      }
    }
    const v = (k) => (d && d[k] != null ? esc(d[k]) : '');

    container.innerHTML = `
      <div class="form-card">
        <div class="form-card-header">
          <h2>${isEdit ? 'Edit Titik Rawan Bencana' : 'Tambah Titik Rawan Bencana Baru'}</h2>
          <p>${isEdit ? `Mengubah data: ${esc(d.nama_lokasi)}` : 'Lengkapi formulir di bawah. Titik kumpul wajib memiliki koordinat dan foto.'}</p>
        </div>
        <form id="disasterForm" class="form-card-body" enctype="multipart/form-data" novalidate>

          <div class="form-section">
            <div class="form-section-title">1 · Informasi Lokasi</div>
            <div class="form-row">
              <div class="form-group">
                <label>Lokasi / Nama Titik <span class="required">*</span></label>
                <input type="text" name="nama_lokasi" required value="${v('nama_lokasi')}" placeholder="Contoh: Bantaran Sungai Deli, Jl. Karya Wisata">
              </div>
              <div class="form-group">
                <label>Kelurahan <span class="required">*</span></label>
                <select name="kelurahan" required>
                  <option value="">-- Pilih Kelurahan --</option>
                  ${kelOptions(meta, d && d.kelurahan)}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Alamat Lengkap <span class="required">*</span></label>
              <textarea name="alamat" required placeholder="Alamat lengkap titik rawan bencana…">${v('alamat')}</textarea>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-title">2 · Informasi Bencana</div>
            <div class="form-row">
              <div class="form-group">
                <label>Jenis Bencana <span class="required">*</span></label>
                <input type="text" name="jenis_bencana" required value="${v('jenis_bencana')}" placeholder="Contoh: Banjir, Angin Puting Beliung">
              </div>
              <div class="form-group">
                <label>Penyebab Bencana <span class="required">*</span></label>
                <input type="text" name="penyebab" required value="${v('penyebab')}" placeholder="Contoh: Luapan sungai, drainase buruk">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Jumlah Rumah Terdampak Biasanya</label>
                <input type="text" name="jumlah_rumah" value="${v('jumlah_rumah')}" placeholder="Contoh: ± 25 rumah">
              </div>
              <div class="form-group">
                <label>Jumlah KK Terdampak Biasanya</label>
                <input type="text" name="jumlah_kk" value="${v('jumlah_kk')}" placeholder="Contoh: ± 30 KK">
              </div>
            </div>
            <div class="form-group">
              <label>Deskripsi Bencana Secara Lengkap</label>
              <textarea name="deskripsi" placeholder="Ketinggian rata-rata banjir, durasi, frekuensi, dampak lainnya…">${v('deskripsi')}</textarea>
            </div>
            <div class="form-group">
              <label>Foto Bencana Sebelumnya (jika ada)</label>
              ${d && d.foto ? `<div class="photo-preview"><img src="${esc(d.foto)}" alt="Foto bencana"></div>` : ''}
              <div class="file-upload">
                <input type="file" name="foto" accept="image/jpeg,image/png,image/webp">
                <div class="file-upload-text">Klik atau seret foto ke sini<br><small>JPG, PNG, WEBP — otomatis dikompres${isEdit ? ' · kosongkan jika tidak diubah' : ''}</small></div>
              </div>
            </div>
          </div>

          <div class="form-section section-gather">
            <div class="form-section-title">3 · Titik Kumpul / Posko <span class="badge-req">Wajib</span></div>
            <div class="form-group">
              <label>Alamat Titik Kumpul <span class="required">*</span></label>
              <textarea name="titik_kumpul" required placeholder="Alamat / nama lokasi titik kumpul, mis. Lapangan Kelurahan, Masjid Al-Ikhlas…">${v('titik_kumpul')}</textarea>
            </div>
            <div class="form-group">
              <label>Foto Titik Kumpul <span class="required">*</span></label>
              ${d && d.titik_kumpul_foto ? `<div class="photo-preview"><img src="${esc(d.titik_kumpul_foto)}" alt="Foto titik kumpul"></div>` : ''}
              <div class="file-upload">
                <input type="file" name="foto_titik_kumpul" accept="image/jpeg,image/png,image/webp" ${d && d.titik_kumpul_foto ? '' : 'required'}>
                <div class="file-upload-text">Klik untuk ambil / pilih foto titik kumpul<br><small>Wajib${isEdit && d.titik_kumpul_foto ? ' · kosongkan jika tidak diubah' : ''}</small></div>
              </div>
            </div>
            <div class="form-group">
              <label>Koordinat Titik Kumpul <span class="required">*</span></label>
              ${LocationPicker.html({
                idPrefix: 'pickGather', latName: 'tk_lat', lngName: 'tk_lng', required: true,
                lat: d ? d.titik_kumpul_lat : null, lng: d ? d.titik_kumpul_lng : null,
                hint: 'Berdiri di titik kumpul lalu tekan <b>Gunakan GPS Saya</b>, atau klik/geser marker di peta, atau isi koordinat manual.',
              })}
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-title">4 · Lokasi Bencana di Peta <span class="badge-opt">Opsional</span></div>
            <div class="form-group">
              ${LocationPicker.html({
                idPrefix: 'pickDisaster', latName: 'lat', lngName: 'lng', required: false,
                lat: d ? d.lat : null, lng: d ? d.lng : null,
                hint: 'Tandai lokasi rawan bencananya (berbeda dari titik kumpul).',
              })}
            </div>
          </div>

          <div class="form-error" id="formError"></div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="window.location.hash='bencana'">Batal</button>
            <button type="submit" class="btn btn-primary" id="submitBtn">
              <span class="btn-text">${isEdit ? 'Simpan Perubahan' : 'Simpan Data'}</span>
              <span class="btn-loader" style="display:none">Menyimpan…</span>
            </button>
          </div>
        </form>
      </div>`;

    const p1 = LocationPicker.mount(container.querySelector('#pickGather'), {
      lat: d ? d.titik_kumpul_lat : undefined, lng: d ? d.titik_kumpul_lng : undefined, color: '#1e7d46', glyph: 'tent',
    });
    const p2 = LocationPicker.mount(container.querySelector('#pickDisaster'), {
      lat: d ? d.lat : undefined, lng: d ? d.lng : undefined, color: '#b23730', glyph: 'map-pin',
    });
    pickers = [p1, p2];
    setupSubmit(isEdit, id);
  }

  function setupSubmit(isEdit, id) {
    const form = document.getElementById('disasterForm');
    const errBox = document.getElementById('formError');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.textContent = '';

      // Validasi klien (pesan lebih jelas daripada popup browser)
      const missing = [];
      const val = (n) => ((form.elements[n] && form.elements[n].value) || '').trim();
      if (!val('nama_lokasi')) missing.push('Nama lokasi');
      if (!val('kelurahan')) missing.push('Kelurahan');
      if (!val('alamat')) missing.push('Alamat');
      if (!val('jenis_bencana')) missing.push('Jenis bencana');
      if (!val('penyebab')) missing.push('Penyebab');
      if (!val('titik_kumpul')) missing.push('Alamat titik kumpul');
      if (!val('tk_lat') || !val('tk_lng')) missing.push('Koordinat titik kumpul');
      const tkFile = form.elements['foto_titik_kumpul'];
      const tkExisting = !!form.querySelector('.section-gather .photo-preview');
      if (!(tkFile.files && tkFile.files[0]) && !tkExisting) missing.push('Foto titik kumpul');
      if (missing.length) {
        errBox.textContent = 'Lengkapi dulu: ' + missing.join(', ') + '.';
        errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      submitBtn.disabled = true;
      submitBtn.querySelector('.btn-text').style.display = 'none';
      submitBtn.querySelector('.btn-loader').style.display = 'inline';
      try {
        const fd = new FormData();
        for (const [k, v] of new FormData(form).entries()) {
          if (v instanceof File) { if (v.size > 0) fd.append(k, v, v.name); }
          else fd.append(k, v);
        }
        const res = await fetch(isEdit ? `/api/disasters/${id}` : '/api/disasters', {
          method: isEdit ? 'PUT' : 'POST', body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Gagal menyimpan (HTTP ${res.status})`);
        Toast.success(isEdit ? 'Data bencana diperbarui.' : 'Data bencana ditambahkan.');
        window.location.hash = `detail-bencana/${data.disaster.id}`;
      } catch (err) {
        errBox.textContent = err.message;
        errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } finally {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-text').style.display = 'inline';
        submitBtn.querySelector('.btn-loader').style.display = 'none';
      }
    });
  }

  /* ---------------- DETAIL ---------------- */

  async function renderDetail(container, id) {
    destroyPickers();
    container.innerHTML = '<div class="loading">Memuat...</div>';
    try {
      const d = (await App.api(`/api/disasters/${id}`)).disaster;
      const user = Auth.getUser();
      const canEdit = Auth.isSuperadmin() || d.owner_id === user.id;
      const hasTk = d.titik_kumpul_lat != null && d.titik_kumpul_lng != null;
      const hasLoc = d.lat != null && d.lng != null;
      const gmaps = (la, ln) => `https://www.google.com/maps?q=${la},${ln}`;

      container.innerHTML = `
        <div class="dashboard-card">
          <div class="card-header">
            <h3>${esc(d.ref)} — ${esc(d.nama_lokasi)}</h3>
            <div class="flex gap-1">
              ${canEdit ? `<button class="btn btn-sm btn-primary" onclick="window.location.hash='edit-bencana/${d.id}'">${Icon.i('pencil')} Edit</button>` : ''}
              <button class="btn btn-sm btn-secondary" onclick="window.location.hash='bencana'">${Icon.i('arrow-left')} Kembali</button>
            </div>
          </div>
          <div class="card-body">
            <div class="detail-grid">
              <div class="detail-images">
                <figure><figcaption>Foto Bencana</figcaption>
                  ${d.foto ? `<img src="${esc(d.foto)}" alt="Foto bencana">` : '<div class="no-photo">Tidak ada foto</div>'}
                </figure>
                <figure><figcaption>Foto Titik Kumpul</figcaption>
                  ${d.titik_kumpul_foto ? `<img src="${esc(d.titik_kumpul_foto)}" alt="Foto titik kumpul">` : '<div class="no-photo">Belum ada foto — edit data untuk melengkapi</div>'}
                </figure>
              </div>
              <div class="detail-info">
                <dl>
                  <dt>Kelurahan</dt><dd>${d.kelurahan ? `<span class="tag tag-blue">${esc(d.kelurahan)}</span>` : '<span class="text-muted">Belum diisi</span>'}</dd>
                  <dt>Jenis Bencana</dt><dd><span class="tag tag-orange">${esc(d.jenis_bencana)}</span></dd>
                  <dt>Penyebab</dt><dd>${esc(d.penyebab)}</dd>
                  <dt>Rumah Terdampak</dt><dd>${esc(d.jumlah_rumah || '-')}</dd>
                  <dt>KK Terdampak</dt><dd>${esc(d.jumlah_kk || '-')}</dd>
                  <dt>Deskripsi</dt><dd>${esc(d.deskripsi || '-')}</dd>
                  <dt>Alamat</dt><dd>${esc(d.alamat)}</dd>
                  <dt>Alamat Titik Kumpul</dt><dd>${esc(d.titik_kumpul || '-')}</dd>
                  <dt>Koordinat Titik Kumpul</dt><dd>${hasTk ? `${d.titik_kumpul_lat.toFixed(6)}, ${d.titik_kumpul_lng.toFixed(6)} · <a href="${gmaps(d.titik_kumpul_lat, d.titik_kumpul_lng)}" target="_blank" rel="noopener">Buka di Google Maps ↗</a>` : '<span class="text-danger">Belum diisi</span>'}</dd>
                  ${hasLoc ? `<dt>Koordinat Bencana</dt><dd>${d.lat.toFixed(6)}, ${d.lng.toFixed(6)}</dd>` : ''}
                  <dt>Pendata</dt><dd>${esc(d.owner_nama || '-')} (${esc(d.owner_username || '')})</dd>
                  <dt>Dibuat</dt><dd>${App.formatDateTime(d.created_at)}</dd>
                  ${d.updated_at ? `<dt>Terakhir Diubah</dt><dd>${App.formatDateTime(d.updated_at)}</dd>` : ''}
                </dl>
              </div>
            </div>
            ${hasTk || hasLoc ? `
              <div class="mt-3">
                <h4 class="mb-2">Lokasi di Peta</h4>
                <div class="map-legend"><span><i style="background:#10b981"></i> Titik kumpul</span><span><i style="background:#ef4444"></i> Lokasi bencana</span></div>
                <div id="detailDisasterMap" class="detail-map"></div>
              </div>` : ''}
          </div>
        </div>`;

      if (hasTk || hasLoc) {
        const map = L.map('detailDisasterMap');
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
        const icon = (c, g) => L.divIcon({
          className: 'custom-marker-wrapper',
          html: `<div class="custom-marker" style="background:${c}"><span class="pin-icon">${Icon.i(g)}</span></div>`,
          iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32],
        });
        const pts = [];
        if (hasLoc) { L.marker([d.lat, d.lng], { icon: icon('#b23730', 'map-pin') }).addTo(map).bindPopup(`<strong>${esc(d.nama_lokasi)}</strong><br>Lokasi bencana`); pts.push([d.lat, d.lng]); }
        if (hasTk) { L.marker([d.titik_kumpul_lat, d.titik_kumpul_lng], { icon: icon('#1e7d46', 'tent') }).addTo(map).bindPopup(`<strong>Titik Kumpul</strong><br>${esc(d.titik_kumpul || '')}`); pts.push([d.titik_kumpul_lat, d.titik_kumpul_lng]); }
        if (pts.length === 1) map.setView(pts[0], 17); else map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 17 });
      }
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${Icon.i('alert-circle')}</div><h3>Terjadi Kesalahan</h3><p>${esc(e.message)}</p></div>`;
    }
  }

  function deleteItem(id, nama) {
    Modal.confirm('Hapus Data', `Hapus data titik rawan bencana "${nama}"?`, async () => {
      try {
        await App.api(`/api/disasters/${id}`, { method: 'DELETE' });
        Toast.success('Data berhasil dihapus.');
        if (window._loadDisasters) window._loadDisasters();
        else window.location.hash = 'bencana';
      } catch (e) { Toast.error(e.message); }
    });
  }

  return { renderList, renderForm, renderDetail, deleteItem };
})();

window.Disaster = Disaster;
