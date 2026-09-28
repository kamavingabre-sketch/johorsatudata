/* ========================================
   Worship Module — Rumah Ibadah
   ======================================== */

const Worship = (() => {
  let map = null;
  let marker = null;

  async function renderList(container) {
    const meta = await App.fetchMeta();
    container.innerHTML = `
      <div class="data-toolbar">
        <input type="text" class="search-input" id="worshipSearch" placeholder="Cari nama, alamat, pengurus, jenis...">
        <select class="filter-select" id="worshipFilterAgama">
          <option value="">Semua Agama</option>
          ${(meta.enums.agama || []).map(k => `<option value="${k}">${k}</option>`).join('')}
        </select>
        <a href="#tambah-ibadah" class="btn btn-primary btn-sm">+ Tambah Ibadah</a>
      </div>
      <div id="worshipTableContainer"><div class="loading">Memuat...</div></div>
    `;

    let page = 1;
    async function loadData() {
      const search = document.getElementById('worshipSearch').value;
      const agama = document.getElementById('worshipFilterAgama').value;
      const params = new URLSearchParams({ page, per: 15 });
      if (search) params.set('search', search);
      if (agama) params.set('agama', agama);
      try {
        const data = await App.api(`/api/worship?${params}`);
        document.getElementById('worshipTableContainer').innerHTML = renderTable(data);
      } catch (e) {
        document.getElementById('worshipTableContainer').innerHTML = `<p class="text-danger">${App.escapeHtml(e.message)}</p>`;
      }
    }

    document.getElementById('worshipSearch').addEventListener('input', App.debounce(() => { page = 1; loadData(); }));
    document.getElementById('worshipFilterAgama').addEventListener('change', () => { page = 1; loadData(); });
    window._loadWorships = loadData;
    window._setWorshipPage = (p) => { page = p; loadData(); };
    await loadData();
  }

  function renderTable(data) {
    if (!data.rows.length) return `<div class="empty-state"><div class="empty-state-icon">🕌</div><h3>Belum ada data rumah ibadah</h3><p>Tambahkan data rumah ibadah baru.</p></div>`;
    let html = `<div class="data-table-wrap"><table class="data-table">
      <thead><tr>
        <th>Kode</th><th>Nama</th><th>Jenis</th><th>Agama</th><th>Alamat</th>
        <th>Pengurus</th><th>HP</th><th>Pendata</th><th>Aksi</th>
      </tr></thead><tbody>`;
    const user = Auth.getUser();
    for (const r of data.rows) {
      const canEdit = Auth.isSuperadmin() || r.owner_id === user.id;
      html += `<tr>
        <td><code>${App.escapeHtml(r.ref)}</code></td>
        <td><a href="#detail-ibadah/${r.id}"><strong>${App.escapeHtml(r.nama)}</strong></a></td>
        <td><span class="tag">${App.escapeHtml(r.jenis)}</span></td>
        <td>${App.escapeHtml(r.agama || '-')}</td>
        <td title="${App.escapeHtml(r.alamat)}">${App.escapeHtml(r.alamat.substring(0, 40))}${r.alamat.length > 40 ? '...' : ''}</td>
        <td>${App.escapeHtml(r.nama_pengelola || '-')}</td>
        <td>${App.escapeHtml(r.hp_pengelola || '-')}</td>
        <td><small>${App.escapeHtml(r.owner_nama || '-')}</small></td>
        <td class="actions">
          <button class="btn btn-sm btn-ghost" onclick="window.location.hash='detail-ibadah/${r.id}'" title="Detail">👁️</button>
          ${canEdit ? `<button class="btn btn-sm btn-ghost" onclick="window.location.hash='edit-ibadah/${r.id}'" title="Edit">✏️</button>` : ''}
          ${canEdit ? `<button class="btn btn-sm btn-ghost" onclick="Worship.deleteItem(${r.id},'${App.escapeHtml(r.nama)}')" title="Hapus">🗑️</button>` : ''}
        </td>
      </tr>`;
    }
    html += '</tbody></table></div>';
    const totalPages = Math.ceil(data.total / data.per);
    if (totalPages > 1) {
      html += '<div class="pagination">';
      html += `<button ${data.page <= 1 ? 'disabled' : ''} onclick="window._setWorshipPage(${data.page - 1})">‹ Prev</button>`;
      for (let i = 1; i <= Math.min(totalPages, 7); i++)
        html += `<button class="${i === data.page ? 'active' : ''}" onclick="window._setWorshipPage(${i})">${i}</button>`;
      html += `<button ${data.page >= totalPages ? 'disabled' : ''} onclick="window._setWorshipPage(${data.page + 1})">Next ›</button></div>`;
    }
    return html;
  }

  async function renderForm(container, id) {
    const meta = await App.fetchMeta();
    const isEdit = !!id;
    let worship = null;
    if (isEdit) {
      try {
        const data = await App.api(`/api/worship/${id}`);
        worship = data.worship;
      } catch (e) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error</h3><p>${App.escapeHtml(e.message)}</p></div>`;
        return;
      }
    }

    container.innerHTML = `
      <div class="form-card">
        <div class="form-card-header">
          <h2>${isEdit ? 'Edit Rumah Ibadah' : 'Tambah Rumah Ibadah Baru'}</h2>
          <p>${isEdit ? `Mengubah data: ${App.escapeHtml(worship.nama)}` : 'Lengkapi formulir untuk mendata rumah ibadah.'}</p>
        </div>
        <form id="worshipForm" class="form-card-body" enctype="multipart/form-data">
          <div class="form-section">
            <div class="form-section-title">Informasi Rumah Ibadah</div>
            <div class="form-group">
              <label>Nama Rumah Ibadah <span class="required">*</span></label>
              <input type="text" name="nama" required value="${isEdit ? App.escapeHtml(worship.nama) : ''}" placeholder="Contoh: Masjid Al-Ikhlas, HKBP Johor">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Jenis Rumah Ibadah <span class="required">*</span></label>
                <input type="text" name="jenis" required value="${isEdit ? App.escapeHtml(worship.jenis) : ''}" placeholder="Contoh: Mesjid, Gereja, Kelenteng, Vihara">
                <div class="hint">Isi singkat: Mesjid, Musholla, Gereja, Kelenteng, Vihara, Pura, dll.</div>
              </div>
              <div class="form-group">
                <label>Agama <span class="required">*</span></label>
                <select name="agama" required>
                  <option value="">-- Pilih Agama --</option>
                  ${(meta.enums.agama || []).map(k => `<option value="${k}" ${isEdit && worship.agama === k ? 'selected' : ''}>${k}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Alamat Lengkap <span class="required">*</span></label>
              <textarea name="alamat" required placeholder="Alamat lengkap rumah ibadah...">${isEdit ? App.escapeHtml(worship.alamat) : ''}</textarea>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-title">Pengurus</div>
            <div class="form-row">
              <div class="form-group">
                <label>Nama Pengurus</label>
                <input type="text" name="nama_pengelola" value="${isEdit ? App.escapeHtml(worship.nama_pengelola || '') : ''}" placeholder="Nama pengurus / penanggung jawab">
              </div>
              <div class="form-group">
                <label>Nomor HP Pengurus</label>
                <input type="tel" name="hp_pengelola" value="${isEdit ? App.escapeHtml(worship.hp_pengelola || '') : ''}" placeholder="08xxxxxxxxxx">
              </div>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-title">Titik Lokasi Rumah Ibadah</div>
            <div class="form-group">
              <div class="hint mb-1">Pilih lokasi: (1) klik peta, (2) input koordinat manual, atau (3) gunakan GPS perangkat Anda.</div>
              <div class="location-picker">
                <div class="location-picker-map" id="worshipMap"></div>
                <div class="location-picker-info">
                  <span>📍</span>
                  <span id="coordDisplay">${isEdit && worship.lat ? `${worship.lat.toFixed(6)}, ${worship.lng.toFixed(6)}` : 'Belum ada lokasi dipilih'}</span>
                </div>
              </div>
              <div class="form-row mt-2">
                <div class="form-group">
                  <label>Latitude</label>
                  <input type="number" step="any" name="lat" id="latInput" value="${isEdit ? worship.lat || '' : ''}" placeholder="3.5786">
                </div>
                <div class="form-group">
                  <label>Longitude</label>
                  <input type="number" step="any" name="lng" id="lngInput" value="${isEdit ? worship.lng || '' : ''}" placeholder="98.6373">
                </div>
              </div>
              <div class="flex gap-1 mt-1">
                <button type="button" class="btn btn-sm btn-outline" id="gpsBtn">📡 Gunakan GPS Saya</button>
                <button type="button" class="btn btn-sm btn-secondary" id="applyCoordBtn">📍 Terapkan Koordinat</button>
              </div>
              <div class="hint mt-1" id="gpsStatus"></div>
            </div>
          </div>

          <div class="form-error" id="formError"></div>
          <div class="flex gap-1" style="justify-content:flex-end;">
            <button type="button" class="btn btn-secondary" onclick="window.location.hash='ibadah'">Batal</button>
            <button type="submit" class="btn btn-primary" id="submitBtn">
              <span class="btn-text">${isEdit ? 'Simpan Perubahan' : 'Simpan Data'}</span>
              <span class="btn-loader" style="display:none">Menyimpan...</span>
            </button>
          </div>
        </form>
      </div>
    `;

    setupFormHandlers(isEdit, id);
    initMap(isEdit ? worship : null);
  }

  function setupFormHandlers(isEdit, id) {
    const form = document.getElementById('worshipForm');
    const errBox = document.getElementById('formError');
    const submitBtn = document.getElementById('submitBtn');
    const latInput = document.getElementById('latInput');
    const lngInput = document.getElementById('lngInput');
    const gpsStatus = document.getElementById('gpsStatus');

    function syncManual() {
      const lat = parseFloat(latInput.value), lng = parseFloat(lngInput.value);
      if (Number.isFinite(lat) && Number.isFinite(lng))
        document.getElementById('coordDisplay').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
    latInput.addEventListener('input', syncManual);
    lngInput.addEventListener('input', syncManual);

    document.getElementById('applyCoordBtn').addEventListener('click', () => {
      const lat = parseFloat(latInput.value), lng = parseFloat(lngInput.value);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) { Toast.warning('Isi koordinat terlebih dahulu.'); return; }
      if (window._worshipSetLocation) { window._worshipSetLocation(lat, lng); Toast.success('Koordinat diterapkan.'); }
    });

    document.getElementById('gpsBtn').addEventListener('click', () => {
      if (!navigator.geolocation) { gpsStatus.textContent = '⚠️ Browser tidak mendukung GPS.'; return; }
      gpsStatus.textContent = '⏳ Mengambil lokasi GPS...';
      document.getElementById('gpsBtn').disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          latInput.value = pos.coords.latitude; lngInput.value = pos.coords.longitude;
          syncManual();
          if (window._worshipSetLocation) window._worshipSetLocation(pos.coords.latitude, pos.coords.longitude);
          gpsStatus.textContent = `✅ Lokasi GPS ditemukan (±${Math.round(pos.coords.accuracy)}m).`;
          document.getElementById('gpsBtn').disabled = false;
        },
        () => {
          gpsStatus.textContent = '⚠️ Gagal mengambil GPS. Izinkan akses lokasi di browser.';
          document.getElementById('gpsBtn').disabled = false;
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.textContent = '';
      submitBtn.disabled = true;
      submitBtn.querySelector('.btn-text').style.display = 'none';
      submitBtn.querySelector('.btn-loader').style.display = 'inline';
      try {
        const fd = new FormData(form);
        const formData = new FormData();
        for (const [k, v] of fd.entries()) formData.append(k, v);
        const url = isEdit ? `/api/worship/${id}` : '/api/worship';
        const method = isEdit ? 'PUT' : 'POST';
        const res = await fetch(url, { method, body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal menyimpan');
        Toast.success(isEdit ? 'Data diperbarui.' : 'Data ditambahkan.');
        window.location.hash = `detail-ibadah/${data.worship.id}`;
      } catch (err) {
        errBox.textContent = err.message;
      } finally {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-text').style.display = 'inline';
        submitBtn.querySelector('.btn-loader').style.display = 'none';
      }
    });
  }

  function initMap(worship) {
    const center = worship && worship.lat ? [worship.lat, worship.lng] : [3.5786, 98.6373];
    map = L.map('worshipMap').setView(center, worship && worship.lat ? 16 : 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);

    const latInput = document.getElementById('latInput'), lngInput = document.getElementById('lngInput'), coordDisplay = document.getElementById('coordDisplay');

    function setMarker(lat, lng, panTo = true) {
      const ll = L.latLng(lat, lng);
      if (marker) { marker.setLatLng(ll); }
      else {
        marker = L.marker(ll, { draggable: true }).addTo(map);
        marker.on('dragend', () => {
          const p = marker.getLatLng();
          latInput.value = p.lat; lngInput.value = p.lng;
          coordDisplay.textContent = `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
        });
      }
      latInput.value = lat; lngInput.value = lng;
      coordDisplay.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      if (panTo) map.setView(ll, Math.max(map.getZoom(), 15));
    }

    window._worshipSetLocation = (lat, lng) => setMarker(lat, lng, true);
    if (worship && worship.lat && worship.lng) setMarker(worship.lat, worship.lng, false);
    map.on('click', (e) => setMarker(e.latlng.lat, e.latlng.lng, false));
    setTimeout(() => map.invalidateSize(), 100);
  }

  async function renderDetail(container, id) {
    container.innerHTML = '<div class="loading">Memuat...</div>';
    try {
      const data = await App.api(`/api/worship/${id}`);
      const w = data.worship;
      const user = Auth.getUser();
      const canEdit = Auth.isSuperadmin() || w.owner_id === user.id;
      container.innerHTML = `
        <div class="dashboard-card">
          <div class="card-header">
            <h3>${App.escapeHtml(w.ref)} — ${App.escapeHtml(w.nama)}</h3>
            <div class="flex gap-1">
              ${canEdit ? `<button class="btn btn-sm btn-primary" onclick="window.location.hash='edit-ibadah/${w.id}'">✏️ Edit</button>` : ''}
              <button class="btn btn-sm btn-secondary" onclick="window.location.hash='ibadah'">← Kembali</button>
            </div>
          </div>
          <div class="card-body">
            <div class="detail-grid">
              <div class="detail-images">
                ${w.foto ? `<img src="${w.foto}" alt="Foto">` : '<div class="empty-state" style="padding:20px"><p>Tidak ada foto</p></div>'}
              </div>
              <div class="detail-info">
                <dl>
                  <dt>Jenis Rumah Ibadah</dt><dd>${App.escapeHtml(w.jenis)}</dd>
                  <dt>Agama</dt><dd>${App.escapeHtml(w.agama || '-')}</dd>
                  <dt>Alamat</dt><dd>${App.escapeHtml(w.alamat)}</dd>
                  <dt>Nama Pengurus</dt><dd>${App.escapeHtml(w.nama_pengelola || '-')}</dd>
                  <dt>HP Pengurus</dt><dd>${w.hp_pengelola ? `<a href="tel:${App.escapeHtml(w.hp_pengelola)}">${App.escapeHtml(w.hp_pengelola)}</a>` : '-'}</dd>
                  ${w.lat && w.lng ? `<dt>Koordinat</dt><dd>${w.lat.toFixed(6)}, ${w.lng.toFixed(6)}</dd>` : ''}
                  <dt>Pendata</dt><dd>${App.escapeHtml(w.owner_nama || '-')} (${App.escapeHtml(w.owner_username || '')})</dd>
                  <dt>Dibuat</dt><dd>${App.formatDateTime(w.created_at)}</dd>
                  ${w.updated_at ? `<dt>Terakhir Diubah</dt><dd>${App.formatDateTime(w.updated_at)}</dd>` : ''}
                </dl>
              </div>
            </div>
            ${w.lat && w.lng ? `
              <div class="mt-3"><h4 class="mb-2">Lokasi di Peta</h4>
                <div id="detailWorshipMap" style="height:300px;border-radius:var(--radius-md);overflow:hidden;"></div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
      if (w.lat && w.lng) {
        const m = L.map('detailWorshipMap').setView([w.lat, w.lng], 16);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(m);
        const icon = L.divIcon({
          className: 'custom-marker-wrapper',
          html: `<div class="custom-marker" style="background:#8b5cf6"><span>🏛️</span></div>`,
          iconSize: [36, 36], iconAnchor: [18, 36]
        });
        L.marker([w.lat, w.lng], { icon }).addTo(m).bindPopup(`<strong>${App.escapeHtml(w.nama)}</strong>`).openPopup();
      }
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error</h3><p>${App.escapeHtml(e.message)}</p></div>`;
    }
  }

  function deleteItem(id, nama) {
    Modal.confirm('Hapus Data', `Hapus data rumah ibadah "${nama}"?`, async () => {
      try {
        await App.api(`/api/worship/${id}`, { method: 'DELETE' });
        Toast.success('Data berhasil dihapus.');
        if (window._loadWorships) window._loadWorships();
        else window.location.hash = 'ibadah';
      } catch (e) { Toast.error(e.message); }
    });
  }

  return { renderList, renderForm, renderDetail, deleteItem };
})();

window.Worship = Worship;
