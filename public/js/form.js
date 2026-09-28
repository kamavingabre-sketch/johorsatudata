/* ========================================
   Form Module — Add/Edit Business
   ======================================== */

const Form = (() => {
  let map = null;
  let marker = null;
  let editingId = null;

  async function renderAdd(container) {
    editingId = null;
    await renderForm(container, null);
  }

  async function renderEdit(container, id) {
    editingId = id;
    try {
      const data = await App.api(`/api/businesses/${id}`);
      await renderForm(container, data.business);
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${Icon.i('alert-circle')}</div><h3>Error</h3><p>${App.escapeHtml(e.message)}</p></div>`;
    }
  }

  async function renderForm(container, business) {
    const meta = await App.fetchMeta();
    const isEdit = !!business;

    container.innerHTML = `
      <div class="form-card">
        <div class="form-card-header">
          <h2>${isEdit ? 'Edit Data Usaha' : 'Tambah Data Usaha Baru'}</h2>
          <p>${isEdit ? `Mengubah data: ${App.escapeHtml(business.nama_usaha)}` : 'Lengkapi formulir di bawah untuk mendata usaha baru.'}</p>
        </div>
        <form id="businessForm" class="form-card-body" enctype="multipart/form-data">
          ${isEdit ? `<input type="hidden" name="id" value="${business.id}">` : ''}

          <div class="form-section">
            <div class="form-section-title">${Icon.i('store')} Informasi Usaha</div>
            <div class="form-row">
              <div class="form-group">
                <label>Nama Usaha <span class="required">*</span></label>
                <input type="text" name="nama_usaha" required value="${isEdit ? App.escapeHtml(business.nama_usaha) : ''}" placeholder="Contoh: Warung Kopi Johor">
              </div>
              <div class="form-group">
                <label>Jenis Kepemilikan <span class="required">*</span></label>
                <select name="jenis_kepemilikan" required>
                  <option value="">-- Pilih --</option>
                  ${meta.enums.jenis.map(j => `<option value="${j}" ${isEdit && business.jenis_kepemilikan === j ? 'selected' : ''}>${j}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Kategori Usaha <span class="required">*</span></label>
              <select name="kategori_usaha" required>
                <option value="">-- Pilih --</option>
                ${meta.enums.kategori.map(k => `<option value="${k}" ${isEdit && business.kategori_usaha === k ? 'selected' : ''}>${k}</option>`).join('')}
              </select>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Skala Usaha <span class="required">*</span></label>
                <select name="skala_usaha" required>
                  <option value="">-- Pilih --</option>
                  ${(meta.enums.skala_usaha || []).map(k => `<option value="${k}" ${isEdit && business.skala_usaha === k ? 'selected' : ''}>${App.label('SKALA_USAHA', k)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Jumlah Pekerja <span class="required">*</span></label>
                <select name="jumlah_pekerja" required>
                  <option value="">-- Pilih --</option>
                  ${(meta.enums.jumlah_pekerja || []).map(k => `<option value="${k}" ${isEdit && business.jumlah_pekerja === k ? 'selected' : ''}>${App.label('JUMLAH_PEKERJA', k)}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-title">${Icon.i('shield')} Izin &amp; Keselamatan</div>
            <div class="form-row">
              <div class="form-group">
                <label>Izin Usaha <span class="required">*</span></label>
                <div class="yesno-group">
                  <input type="radio" name="izin_usaha" id="izin_ya" value="1" ${isEdit && business.izin_usaha ? 'checked' : ''}>
                  <label for="izin_ya">Ada</label>
                  <input type="radio" name="izin_usaha" id="izin_tidak" value="0" ${!isEdit || !business.izin_usaha ? 'checked' : ''}>
                  <label for="izin_tidak">Tidak</label>
                </div>
              </div>
              <div class="form-group">
                <label>Kelengkapan Keselamatan <span class="required">*</span></label>
                <select name="kelengkapan_keamanan" required>
                  <option value="">-- Pilih --</option>
                  ${meta.enums.keamanan.map(k => `<option value="${k}" ${isEdit && business.kelengkapan_keamanan === k ? 'selected' : ''}>${k}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="form-group" id="izinFotoGroup" style="${!isEdit || !business.izin_usaha ? 'display:none' : ''}">
              <label>Foto Dokumen Izin <span class="required">*</span></label>
              ${isEdit && business.izin_foto ? `<div class="photo-preview"><img src="${business.izin_foto}"><label style="display:flex;align-items:center;gap:6px;"><input type="checkbox" name="hapus_izin_foto" value="1"> Hapus foto ini</label></div>` : ''}
              <div class="file-upload">
                <input type="file" name="izin_foto" accept="image/jpeg,image/png,image/webp">
                <div class="file-upload-text">Klik atau seret file ke sini<br><small>JPG, PNG, WEBP (maks 8 MB)</small></div>
              </div>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-title">${Icon.i('user')} Penanggung Jawab</div>
            <div class="form-row">
              <div class="form-group">
                <label>Nama Penanggung Jawab <span class="required">*</span></label>
                <input type="text" name="nama_pic" required value="${isEdit ? App.escapeHtml(business.nama_pic) : ''}" placeholder="Nama lengkap">
              </div>
              <div class="form-group">
                <label>Nomor HP <span class="required">*</span></label>
                <input type="tel" name="hp_pic" required value="${isEdit ? App.escapeHtml(business.hp_pic) : ''}" placeholder="08xxxxxxxxxx">
              </div>
            </div>
          </div>

          <div class="form-section">
            <div class="form-section-title">${Icon.i('camera')} Foto &amp; Lokasi</div>
            <div class="form-group">
              <label>Foto Usaha <span class="required">*</span></label>
              ${isEdit && business.foto_usaha ? `<div class="photo-preview"><img src="${business.foto_usaha}"></div>` : ''}
              <div class="file-upload">
                <input type="file" name="foto_usaha" accept="image/jpeg,image/png,image/webp" ${!isEdit ? 'required' : ''}>
                <div class="file-upload-text">Klik atau seret foto usaha ke sini<br><small>JPG, PNG, WEBP (maks 8 MB)${isEdit ? ' — kosongkan jika tidak ingin mengubah' : ''}</small></div>
              </div>
            </div>
            <div class="form-group">
              <label>Kelurahan <span class="required">*</span></label>
              <select name="kelurahan" required>
                <option value="">-- Pilih Kelurahan --</option>
                ${(meta.enums.kelurahan || []).map(k => `<option value="${App.escapeHtml(k)}" ${isEdit && business.kelurahan === k ? 'selected' : ''}>${App.escapeHtml(k)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Alamat / Lokasi Usaha <span class="required">*</span></label>
              <textarea name="alamat" required placeholder="Alamat lengkap usaha…">${isEdit ? App.escapeHtml(business.alamat) : ''}</textarea>
            </div>
            <div class="form-group">
              <label>Lokasi di Peta <span class="required">*</span></label>
              <div class="hint mb-1">Pilih lokasi dengan: (1) klik pada peta, (2) geser marker, (3) input koordinat manual, atau (4) gunakan GPS perangkat Anda.</div>
              <div class="location-picker">
                <div class="location-picker-map" id="formMap"></div>
                <div class="location-picker-info">
                  ${Icon.i('map-pin')}
                  <span id="coordDisplay">${isEdit && business.lat ? `${business.lat.toFixed(6)}, ${business.lng.toFixed(6)}` : 'Belum ada lokasi dipilih'}</span>
                </div>
              </div>
              <div class="form-row mt-2">
                <div class="form-group">
                  <label>Latitude <span class="required">*</span></label>
                  <input type="number" step="any" name="lat" id="latInput" value="${isEdit ? business.lat || '' : ''}" placeholder="Contoh: 3.5786" required>
                </div>
                <div class="form-group">
                  <label>Longitude <span class="required">*</span></label>
                  <input type="number" step="any" name="lng" id="lngInput" value="${isEdit ? business.lng || '' : ''}" placeholder="Contoh: 98.6373" required>
                </div>
              </div>
              <div class="flex gap-1 mt-1 wrap">
                <button type="button" class="btn btn-sm btn-outline" id="gpsBtn">${Icon.i('crosshair')} Gunakan GPS Saya</button>
                <button type="button" class="btn btn-sm btn-secondary" id="applyCoordBtn">${Icon.i('map-pin')} Terapkan Koordinat ke Peta</button>
              </div>
              <div class="hint mt-1" id="gpsStatus"></div>
            </div>
          </div>

          <div class="form-error" id="formError"></div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="window.location.hash='${isEdit ? `detail/${business.id}` : 'data'}'">Batal</button>
            <button type="submit" class="btn btn-primary btn-lg" id="submitBtn">
              <span class="btn-text">${Icon.i('check')} Simpan Data</span>
              <span class="btn-loader" style="display:none"><span class="spinner-inline"></span> Menyimpan…</span>
            </button>
          </div>
        </form>
      </div>
    `;

    setupFormHandlers(isEdit);
    initFormMap(business);
  }

  function setupFormHandlers(isEdit) {
    const form = document.getElementById('businessForm');
    const errBox = document.getElementById('formError');
    const submitBtn = document.getElementById('submitBtn');
    const latInput = document.getElementById('latInput');
    const lngInput = document.getElementById('lngInput');
    const gpsStatus = document.getElementById('gpsStatus');

    // Toggle izin foto
    form.querySelectorAll('input[name="izin_usaha"]').forEach(radio => {
      radio.addEventListener('change', () => {
        document.getElementById('izinFotoGroup').style.display = radio.value === '1' && radio.checked ? 'block' : 'none';
      });
    });

    // Sinkronisasi manual input → display & map
    function syncManualToDisplay() {
      const lat = parseFloat(latInput.value);
      const lng = parseFloat(lngInput.value);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        document.getElementById('coordDisplay').textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
    }
    latInput.addEventListener('input', syncManualToDisplay);
    lngInput.addEventListener('input', syncManualToDisplay);

    // Tombol: Terapkan koordinat manual ke peta
    document.getElementById('applyCoordBtn').addEventListener('click', () => {
      const lat = parseFloat(latInput.value);
      const lng = parseFloat(lngInput.value);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        Toast.warning('Isi latitude dan longitude terlebih dahulu.');
        return;
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        Toast.warning('Koordinat tidak valid. Lat: -90 s/d 90, Lng: -180 s/d 180.');
        return;
      }
      if (window._formSetLocation) {
        window._formSetLocation(lat, lng);
        Toast.success('Koordinat diterapkan ke peta.');
      }
    });

    // Tombol: Gunakan GPS perangkat
    document.getElementById('gpsBtn').addEventListener('click', () => {
      if (!navigator.geolocation) {
        gpsStatus.textContent = 'Browser Anda tidak mendukung GPS.';
        gpsStatus.classList.add('text-danger');
        return;
      }
      gpsStatus.textContent = 'Mengambil lokasi GPS…';
      gpsStatus.classList.remove('text-danger', 'text-success');
      document.getElementById('gpsBtn').disabled = true;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracy = pos.coords.accuracy;
          latInput.value = lat;
          lngInput.value = lng;
          syncManualToDisplay();
          if (window._formSetLocation) window._formSetLocation(lat, lng);
          gpsStatus.textContent = `Lokasi GPS ditemukan (akurasi ±${Math.round(accuracy)} meter).`;
          gpsStatus.classList.remove('text-danger');
          gpsStatus.classList.add('text-success');
          document.getElementById('gpsBtn').disabled = false;
          Toast.success('Lokasi GPS berhasil diambil.');
        },
        (err) => {
          let msg = 'Gagal mengambil GPS.';
          if (err.code === 1) msg = 'Akses GPS ditolak. Izinkan akses lokasi di browser Anda.';
          else if (err.code === 2) msg = 'Lokasi tidak tersedia. Pastikan GPS aktif.';
          else if (err.code === 3) msg = 'Waktu habis. Coba lagi.';
          gpsStatus.textContent = msg;
          gpsStatus.classList.remove('text-success');
          gpsStatus.classList.add('text-danger');
          document.getElementById('gpsBtn').disabled = false;
          Toast.error(msg);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.textContent = '';
      const btnText = submitBtn.querySelector('.btn-text');
      const btnLoader = submitBtn.querySelector('.btn-loader');
      submitBtn.disabled = true;
      btnText.style.display = 'none';
      btnLoader.style.display = 'inline-flex';

      try {
        const fd = new FormData(form);

        const body = {
          nama_usaha: fd.get('nama_usaha'),
          jenis_kepemilikan: fd.get('jenis_kepemilikan'),
          kategori_usaha: fd.get('kategori_usaha'),
          skala_usaha: fd.get('skala_usaha'),
          jumlah_pekerja: fd.get('jumlah_pekerja'),
          izin_usaha: fd.get('izin_usaha'),
          kelengkapan_keamanan: fd.get('kelengkapan_keamanan'),
          nama_pic: fd.get('nama_pic'),
          hp_pic: fd.get('hp_pic'),
          alamat: fd.get('alamat'),
          kelurahan: fd.get('kelurahan'),
          lat: fd.get('lat'),
          lng: fd.get('lng'),
          extra: '{}',
        };

        if (fd.get('hapus_izin_foto')) body.hapus_izin_foto = '1';

        // Build multipart form data
        const formData = new FormData();
        for (const [k, v] of Object.entries(body)) {
          formData.append(k, v);
        }
        // Append files
        for (const input of form.querySelectorAll('input[type="file"]')) {
          if (input.files[0]) formData.append(input.name, input.files[0]);
        }

        const url = isEdit ? `/api/businesses/${editingId}` : '/api/businesses';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, { method, body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal menyimpan');

        Toast.success(isEdit ? 'Data berhasil diperbarui.' : 'Data berhasil ditambahkan.');
        window.location.hash = `detail/${data.business.id}`;
      } catch (err) {
        errBox.textContent = err.message;
      } finally {
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
      }
    });
  }

  function initFormMap(business) {
    const center = business && business.lat ? [business.lat, business.lng] : [3.5786, 98.6373];
    const zoom = business && business.lat ? 16 : 14;

    map = L.map('formMap').setView(center, zoom);

    // OpenStreetMap - 100% gratis, tanpa API key
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const latInput = document.getElementById('latInput');
    const lngInput = document.getElementById('lngInput');
    const coordDisplay = document.getElementById('coordDisplay');

    function setMarker(lat, lng, panTo = true) {
      const ll = L.latLng(lat, lng);
      if (marker) {
        marker.setLatLng(ll);
      } else {
        marker = L.marker(ll, { draggable: true }).addTo(map);
        marker.on('dragend', () => {
          const p = marker.getLatLng();
          latInput.value = p.lat;
          lngInput.value = p.lng;
          coordDisplay.textContent = `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
        });
      }
      latInput.value = lat;
      lngInput.value = lng;
      coordDisplay.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      coordDisplay.classList.add('is-set');
      if (panTo) map.setView(ll, Math.max(map.getZoom(), 15));
    }

    // Expose setter agar tombol GPS / Apply bisa memanggil
    window._formSetLocation = (lat, lng) => setMarker(lat, lng, true);

    // Jika edit dan sudah ada koordinat, langsung tampilkan marker
    if (business && business.lat && business.lng) {
      setMarker(business.lat, business.lng, false);
    }

    // Klik peta → set lokasi
    map.on('click', (e) => {
      setMarker(e.latlng.lat, e.latlng.lng, false);
    });

    // Invalidate size after render
    setTimeout(() => map.invalidateSize(), 100);
  }

  return { renderAdd, renderEdit };
})();

window.Form = Form;
