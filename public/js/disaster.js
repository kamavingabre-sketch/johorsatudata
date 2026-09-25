/* ========================================
   Disaster Module — Titik Rawan Bencana
   ======================================== */

const Disaster = (() => {
  let map = null;
  let marker = null;

  async function renderList(container) {
    const meta = await App.fetchMeta();
    container.innerHTML = `
      <div class="data-toolbar">
        <input type="text" class="search-input" id="disasterSearch" placeholder="Cari lokasi, alamat, jenis bencana, penyebab...">
        <a href="#tambah-bencana" class="btn btn-primary btn-sm">+ Tambah Bencana</a>
      </div>
      <div id="disasterTableContainer"><div class="loading">Memuat...</div></div>
    `;

    let page = 1;
    async function loadData() {
      const search = document.getElementById('disasterSearch').value;
      const params = new URLSearchParams({ page, per: 15 });
      if (search) params.set('search', search);
      try {
        const data = await App.api(`/api/disasters?${params}`);
        document.getElementById('disasterTableContainer').innerHTML = renderTable(data);
      } catch (e) {
        document.getElementById('disasterTableContainer').innerHTML = `<p class="text-danger">${App.escapeHtml(e.message)}</p>`;
      }
    }

    document.getElementById('disasterSearch').addEventListener('input', App.debounce(() => { page = 1; loadData(); }));
    window._loadDisasters = loadData;
    window._setDisasterPage = (p) => { page = p; loadData(); };
    await loadData();
  }

  function renderTable(data) {
    if (!data.rows.length) return `<div class="empty-state"><div class="empty-state-icon">🌊</div><h3>Belum ada data bencana</h3><p>Tambahkan titik rawan bencana baru.</p></div>`;
    let html = `<div class="data-table-wrap"><table class="data-table">
      <thead><tr>
        <th>Kode</th><th>Lokasi</th><th>Jenis</th><th>Penyebab</th>
        <th>Rumah Terdampak</th><th>KK Terdampak</th><th>Tanggal</th><th>Pendata</th><th>Aksi</th>
      </tr></thead><tbody>`;
    const user = Auth.getUser();
    for (const r of data.rows) {
      const canEdit = Auth.isSuperadmin() || r.owner_id === user.id;
      html += `<tr>
        <td><code>${App.escapeHtml(r.ref)}</code></td>
        <td><a href="#detail-bencana/${r.id}"><strong>${App.escapeHtml(r.nama_lokasi)}</strong></a><br><small class="text-muted">${App.escapeHtml(r.alamat.substring(0, 50))}${r.alamat.length > 50 ? '...' : ''}</small></td>
        <td><span class="tag tag-orange">${App.escapeHtml(r.jenis_bencana)}</span></td>
        <td>${App.escapeHtml(r.penyebab)}</td>
        <td>${App.escapeHtml(r.jumlah_rumah || '-')}</td>
        <td>${App.escapeHtml(r.jumlah_kk || '-')}</td>
        <td>${App.formatDate(r.created_at)}</td>
        <td><small>${App.escapeHtml(r.owner_nama || '-')}</small></td>
        <td class="actions">
          <button class="btn btn-sm btn-ghost" onclick="window.location.hash='detail-bencana/${r.id}'" title="Detail">👁️</button>
          ${canEdit ? `<button class="btn btn-sm btn-ghost" onclick="window.location.hash='edit-bencana/${r.id}'" title="Edit">✏️</button>` : ''}
          ${canEdit ? `<button class="btn btn-sm btn-ghost" onclick="Disaster.deleteItem(${r.id},'${App.escapeHtml(r.nama_lokasi)}')" title="Hapus">🗑️</button>` : ''}
        </td>
      </tr>`;
    }
    html += '</tbody></table></div>';
    const totalPages = Math.ceil(data.total / data.per);
    if (totalPages > 1) {
      html += '<div class="pagination">';
      html += `<button ${data.page <= 1 ? 'disabled' : ''} onclick="window._setDisasterPage(${data.page - 1})">‹ Prev</button>`;
      for (let i = 1; i <= Math.min(totalPages, 7); i++) {
        html += `<button class="${i === data.page ? 'active' : ''}" onclick="window._setDisasterPage(${i})">${i}</button>`;
      }
      html += `<button ${data.page >= totalPages ? 'disabled' : ''} onclick="window._setDisasterPage(${data.page + 1})">Next ›</button>`;
      html += '</div>';
    }
    return html;
  }

  async function renderForm(container, id) {
    const meta = await App.fetchMeta();
    const isEdit = !!id;
    let disaster = null;
    if (isEdit) {
      try {
        const data = await App.api(`/api/disasters/${id}`);
        disaster = data.disaster;
      } catch (e) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error</h3><p>${App.escapeHtml(e.message)}</p></div>`;
        return;
      }
    }

    container.innerHTML = `
      <div class="form-card">
        <div class="form-card-header">
          <h2>${isEdit ? 'Edit Titik Rawan Bencana' : 'Tambah Titik Rawan Bencana Baru'}</h2>
          <p>${isEdit ? `Mengubah data: ${App.escapeHtml(disaster.nama_lokasi)}` : 'Lengkapi formulir di bawah untuk mendata titik rawan bencana.'}</p>
        </div>
        <form id="disasterForm" class="form-card-body" enctype="multipart/form-data">
          <div class="form-section">
            <div class="form-section-title">Informasi Lokasi</div>
            <div class="form-group">
              <label>Lokasi / Nama Titik <span class="required">*</span></label>
              <input type="text" name="nama_lokasi" required value="${isEdit ? App.escapeHtml(disaster.nama_lokasi) : ''}" placeholder="Contoh: Bantaran Sungai Deli, Jl. Karya Wisata">
            </div>
            <div class="form-group">
              <label>Alamat Lengkap <span class="required">*</span></label>
              <textarea name="alamat" required placeholder="Alamat lengkap titik rawan bencana...">${isEdit ? App.escapeHtml(disaster.alamat) : ''}</textarea>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-title">Informasi Bencana</div>
            <div class="form-row">
              <div class="form-group">
                <label>Jenis Bencana <span class="required">*</span></label>
                <input type="text" name="jenis_bencana" required value="${isEdit ? App.escapeHtml(disaster.jenis_bencana) : ''}" placeholder="Contoh: Banjir, Angin Puting Beliung, Tanah Longsor">
                <div class="hint">Isi singkat: Banjir, Angin Puting Beliung, Tanah Longsor, dll.</div>
              </div>
              <div class="form-group">
                <label>Penyebab Bencana <span class="required">*</span></label>
                <input type="text" name="penyebab" required value="${isEdit ? App.escapeHtml(disaster.penyebab) : ''}" placeholder="Contoh: Luapan sungai, drainase buruk">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Jumlah Rumah Terdampak Biasanya</label>
                <input type="text" name="jumlah_rumah" value="${isEdit ? App.escapeHtml(disaster.jumlah_rumah || '') : ''}" placeholder="Contoh: ± 25 rumah">
              </div>
              <div class="form-group">
                <label>Jumlah KK Terdampak Biasanya</label>
                <input type="text" name="jumlah_kk" value="${isEdit ? App.escapeHtml(disaster.jumlah_kk || '') : ''}" placeholder="Contoh: ± 30 KK">
              </div>
            </div>
            <div class="form-group">
              <label>Deskripsi Bencana Secara Lengkap</label>
              <textarea name="deskripsi" placeholder="Ketinggian rata-rata banjir, durasi, frekuensi, dampak lainnya...">${isEdit ? App.escapeHtml(disaster.deskripsi || '') : ''}</textarea>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-title">Foto & Titik Kumpul</div>
            <div class="form-group">
              <label>Foto Bencana Sebelumnya (jika ada)</label>
              ${isEdit && disaster.foto ? `<div class="photo-preview"><img src="${disaster.foto}"></div>` : ''}
              <div class="file-upload">
                <input type="file" name="foto" accept="image/jpeg,image/png,image/webp">
                <div class="file-upload-text">Klik untuk unggah foto<br><small>JPG, PNG, WEBP (maks 8 MB)${isEdit ? ' — kosongkan jika tidak ingin mengubah' : ''}</small></div>
              </div>
            </div>
            <div class="form-group">
              <label>Lokasi Titik Kumpul / Posko</label>
              <textarea name="titik_kumpul" placeholder="Alamat atau deskripsi lokasi titik kumpul / posko terdekat...">${isEdit ? App.escapeHtml(disaster.titik_kumpul || '') : ''}</textarea>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-title">Lokasi di Peta</div>
            <div class="form-group">
              <div class="hint mb-1">Pilih lokasi: (1) klik peta, (2) input koordinat manual, atau (3) gunakan GPS.</div>
              <div class="location-picker">
                <div class="location-picker-map" id="disasterMap"></div>
                <div class="location-picker-info">
                  <span>📍</span>
                  <span id="coordDisplay">${isEdit && disaster.lat ? `${disaster.lat.toFixed(6)}, ${disaster.lng.toFixed(6)}` : 'Belum ada lokasi dipilih'}</span>
                </div>
              </div>
              <div class="form-row mt-2">
                <div class="form-group">
                  <label>Latitude</label>
                  <input type="number" step="any" name="lat" id="latInput" value="${isEdit ? disaster.lat || '' : ''}" placeholder="Contoh: 3.5786">
                </div>
                <div class="form-group">
                  <label>Longitude</label>
                  <input type="number" step="any" name="lng" id="lngInput" value="${isEdit ? disaster.lng || '' : ''}" placeholder="Contoh: 98.6373">
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
            <button type="button" class="btn btn-secondary" onclick="window.location.hash='bencana'">Batal</button>
            <button type="submit" class="btn btn-primary" id="submitBtn">
              <span class="btn-text">${isEdit ? 'Simpan Perubahan' : 'Simpan Data'}</span>
              <span class="btn-loader" style="display:none">Menyimpan...</span>
            </button>
          </div>
        </form>
      </div>
    `;

    setupFormHandlers(isEdit, id);
    initMap(isEdit ? disaster : null);
  }

  function setupFormHandlers(isEdit, id) {
    const form = document.getElementById('disasterForm');
    const errBox = document.getElementById('formError');
    const submitBtn = document.getElementById('submitBtn');
    const latInput = document.getElementById('latInput');
    const lngInput = document.getElementById('lngInput');
    const gpsStatus = document.getElementById('gpsStatus');

    function syncManual() {
      const lat = parseFloat(latInput.value);
      const lng = parseFloat(lngInput.value);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        document.getElementById('coordDisplay').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
    }
    latInput.addEventListener('input', syncManual);
    lngInput.addEventListener('input', syncManual);

    document.getElementById('applyCoordBtn').addEventListener('click', () => {
      const lat = parseFloat(latInput.value);
      const lng = parseFloat(lngInput.value);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) { Toast.warning('Isi latitude dan longitude terlebih dahulu.'); return; }
      if (window._disasterSetLocation) { window._disasterSetLocation(lat, lng); Toast.success('Koordinat diterapkan.'); }
    });

    document.getElementById('gpsBtn').addEventListener('click', () => {
      if (!navigator.geolocation) { gpsStatus.textContent = '⚠️ Browser tidak mendukung GPS.'; return; }
      gpsStatus.textContent = '⏳ Mengambil lokasi GPS...';
      document.getElementById('gpsBtn').disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          latInput.value = pos.coords.latitude;
          lngInput.value = pos.coords.longitude;
          syncManual();
          if (window._disasterSetLocation) window._disasterSetLocation(pos.coords.latitude, pos.coords.longitude);
          gpsStatus.textContent = `✅ Lokasi GPS ditemukan (akurasi ±${Math.round(pos.coords.accuracy)} meter).`;
          document.getElementById('gpsBtn').disabled = false;
        },
        (err) => {
          gpsStatus.textContent = err.code === 1 ? '⚠️ Akses GPS ditolak.' : '⚠️ Gagal mengambil GPS.';
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
        for (const [k, v] of fd.entries()) {
          if (!k.startsWith('foto') || typeof v === 'string') formData.append(k, v);
        }
        for (const input of form.querySelectorAll('input[type="file"]')) {
          if (input.files[0]) formData.append(input.name, input.files[0]);
        }
        const url = isEdit ? `/api/disasters/${id}` : '/api/disasters';
        const method = isEdit ? 'PUT' : 'POST';
        const res = await fetch(url, { method, body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal menyimpan');
        Toast.success(isEdit ? 'Data bencana diperbarui.' : 'Data bencana ditambahkan.');
        window.location.hash = `detail-bencana/${data.disaster.id}`;
      } catch (err) {
        errBox.textContent = err.message;
      } finally {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-text').style.display = 'inline';
        submitBtn.querySelector('.btn-loader').style.display = 'none';
      }
    });
  }

  function initMap(disaster) {
    const center = disaster && disaster.lat ? [disaster.lat, disaster.lng] : [3.5786, 98.6373];
    const zoom = disaster && disaster.lat ? 16 : 14;
    map = L.map('disasterMap').setView(center, zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
    }).addTo(map);

    const latInput = document.getElementById('latInput');
    const lngInput = document.getElementById('lngInput');
    const coordDisplay = document.getElementById('coordDisplay');

    function setMarker(lat, lng, panTo = true) {
      const ll = L.latLng(lat, lng);
      if (marker) { marker.setLatLng(ll); } else {
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

    window._disasterSetLocation = (lat, lng) => setMarker(lat, lng, true);
    if (disaster && disaster.lat && disaster.lng) setMarker(disaster.lat, disaster.lng, false);
    map.on('click', (e) => setMarker(e.latlng.lat, e.latlng.lng, false));
    setTimeout(() => map.invalidateSize(), 100);
  }

  async function renderDetail(container, id) {
    container.innerHTML = '<div class="loading">Memuat...</div>';
    try {
      const data = await App.api(`/api/disasters/${id}`);
      const d = data.disaster;
      const user = Auth.getUser();
      const canEdit = Auth.isSuperadmin() || d.owner_id === user.id;

      container.innerHTML = `
        <div class="dashboard-card">
          <div class="card-header">
            <h3>${App.escapeHtml(d.ref)} — ${App.escapeHtml(d.nama_lokasi)}</h3>
            <div class="flex gap-1">
              ${canEdit ? `<button class="btn btn-sm btn-primary" onclick="window.location.hash='edit-bencana/${d.id}'">✏️ Edit</button>` : ''}
              <button class="btn btn-sm btn-secondary" onclick="window.location.hash='bencana'">← Kembali</button>
            </div>
          </div>
          <div class="card-body">
            <div class="detail-grid">
              <div class="detail-images">
                ${d.foto ? `<img src="${d.foto}" alt="Foto bencana">` : '<div class="empty-state" style="padding:20px"><p>Tidak ada foto</p></div>'}
              </div>
              <div class="detail-info">
                <dl>
                  <dt>Jenis Bencana</dt><dd><span class="tag tag-orange">${App.escapeHtml(d.jenis_bencana)}</span></dd>
                  <dt>Penyebab</dt><dd>${App.escapeHtml(d.penyebab)}</dd>
                  <dt>Jumlah Rumah Terdampak</dt><dd>${App.escapeHtml(d.jumlah_rumah || '-')}</dd>
                  <dt>Jumlah KK Terdampak</dt><dd>${App.escapeHtml(d.jumlah_kk || '-')}</dd>
                  <dt>Deskripsi</dt><dd>${App.escapeHtml(d.deskripsi || '-')}</dd>
                  <dt>Alamat</dt><dd>${App.escapeHtml(d.alamat)}</dd>
                  <dt>Titik Kumpul / Posko</dt><dd>${App.escapeHtml(d.titik_kumpul || '-')}</dd>
                  ${d.lat && d.lng ? `<dt>Koordinat</dt><dd>${d.lat.toFixed(6)}, ${d.lng.toFixed(6)}</dd>` : ''}
                  <dt>Pendata</dt><dd>${App.escapeHtml(d.owner_nama || '-')} (${App.escapeHtml(d.owner_username || '')})</dd>
                  <dt>Dibuat</dt><dd>${App.formatDateTime(d.created_at)}</dd>
                  ${d.updated_at ? `<dt>Terakhir Diubah</dt><dd>${App.formatDateTime(d.updated_at)}</dd>` : ''}
                </dl>
              </div>
            </div>
            ${d.lat && d.lng ? `
              <div class="mt-3">
                <h4 class="mb-2">Lokasi di Peta</h4>
                <div id="detailDisasterMap" style="height:300px;border-radius:var(--radius-md);overflow:hidden;"></div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
      if (d.lat && d.lng) {
        const map = L.map('detailDisasterMap').setView([d.lat, d.lng], 16);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
        const icon = L.divIcon({
          className: 'custom-marker-wrapper',
          html: `<div class="custom-marker" style="background:#ef4444"><span>🌊</span></div>`,
          iconSize: [36, 36], iconAnchor: [18, 36]
        });
        L.marker([d.lat, d.lng], { icon }).addTo(map).bindPopup(`<strong>${App.escapeHtml(d.nama_lokasi)}</strong>`).openPopup();
      }
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error</h3><p>${App.escapeHtml(e.message)}</p></div>`;
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
