/* ========================================
   Category Manager — Superadmin
   Kelola kategori data dinamis (tambah, edit, hapus, kelola field)
   ======================================== */

const CategoryManager = (() => {

  /* -------- Halaman daftar kategori -------- */

  async function renderPage(container) {
    container.innerHTML = `
      <div class="flex-between mb-3">
        <div>
          <h3>Kategori Data</h3>
          <p class="text-muted" style="font-size:13px;">Kelola kategori data dinamis. Kategori baru langsung muncul di menu navigasi.</p>
        </div>
        <div class="flex gap-1">
          <button class="btn btn-outline btn-sm" id="exportAllBtn">${Icon.i('download')} Ekspor Semua Data (Excel)</button>
          <button class="btn btn-primary btn-sm" onclick="CategoryManager.showAddCategory()">${Icon.i('plus')} Tambah Kategori</button>
        </div>
      </div>
      <div id="categoryList"><div class="loading">Memuat…</div></div>
    `;
    document.getElementById('exportAllBtn').addEventListener('click', () => {
      App.triggerDownload('/api/export/all/xlsx');
    });
    await loadCategories();
  }

  async function loadCategories() {
    const el = document.getElementById('categoryList');
    if (!el) return;
    try {
      const data = await App.api('/api/categories');
      if (!data.categories.length) {
        el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${Icon.i('database')}</div><h3>Belum ada kategori</h3><p>Tambahkan kategori data baru untuk mulai mengumpulkan data.</p></div>`;
        return;
      }
      el.innerHTML = data.categories.map(cat => `
        <div class="admin-card" id="cat-card-${cat.id}">
          <div class="admin-card-avatar" style="background:var(--color-purple-bg);color:var(--color-purple)">${Icon.i(cat.icon || 'database')}</div>
          <div class="admin-card-info">
            <h4>${App.escapeHtml(cat.display_name)} ${cat.is_system ? '<span class="tag" style="font-size:11px">Sistem</span>' : ''} ${!cat.active ? '<span class="tag tag-red" style="font-size:11px">Nonaktif</span>' : ''}</h4>
            <p>Tabel: <code>${App.escapeHtml(cat.table_name)}</code> &middot; ${cat.fields ? cat.fields.length : 0} field &middot; ${cat.description ? App.escapeHtml(cat.description) : '<em>Tanpa deskripsi</em>'}</p>
          </div>
          <div class="admin-card-actions">
            <button class="btn btn-sm btn-outline" onclick="CategoryManager.showFields(${cat.id})">${Icon.i('list')} Field</button>
            ${!cat.is_system ? `<button class="btn-icon" onclick="CategoryManager.showEditCategory(${cat.id})" title="Edit">${Icon.i('pencil')}</button>` : ''}
            ${!cat.is_system ? `<button class="btn-icon is-danger" onclick="CategoryManager.deleteCategory(${cat.id},'${App.escapeHtml(cat.display_name)}')" title="Hapus">${Icon.i('trash')}</button>` : ''}
          </div>
        </div>
      `).join('');
    } catch (e) {
      el.innerHTML = `<p class="text-danger">${App.escapeHtml(e.message)}</p>`;
    }
  }

  /* -------- Tambah kategori -------- */

  function showAddCategory() {
    const html = `
      <form id="catForm">
        <div class="form-group">
          <label>Nama Tampilan <span class="required">*</span></label>
          <input type="text" name="display_name" required placeholder="cth: Panti Asuhan">
          <div class="hint">Nama yang tampil di menu dan halaman.</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>ID Kategori <span class="required">*</span></label>
            <input type="text" name="name" required placeholder="cth: panti_asuhan" pattern="[a-z_]+" title="Hanya huruf kecil dan underscore">
            <div class="hint">Huruf kecil, underscore saja. Tidak dapat diubah.</div>
          </div>
          <div class="form-group">
            <label>Nama Tabel DB <span class="required">*</span></label>
            <input type="text" name="table_name" required placeholder="cth: panti_asuhan" pattern="[a-z_]+" title="Hanya huruf kecil dan underscore">
            <div class="hint">Nama tabel di database.</div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Ikon</label>
            <select name="icon">
              <option value="database">🗄 Database (default)</option>
              <option value="home">🏠 Rumah</option>
              <option value="heart">❤ Hati</option>
              <option value="users">👥 Orang</option>
              <option value="map-pin">📍 Lokasi</option>
              <option value="book">📖 Buku</option>
              <option value="briefcase">💼 Koper</option>
              <option value="activity">📊 Grafik</option>
              <option value="star">⭐ Bintang</option>
              <option value="shield">🛡 Perisai</option>
              <option value="truck">🚛 Kendaraan</option>
              <option value="tool">🔧 Alat</option>
            </select>
          </div>
          <div class="form-group">
            <label>Deskripsi</label>
            <input type="text" name="description" placeholder="Keterangan singkat (opsional)">
          </div>
        </div>
        <div class="form-error" id="catError"></div>
      </form>
    `;
    Modal.open(html, {
      title: 'Tambah Kategori Data Baru',
      large: true,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Batal</button>
        <button class="btn btn-primary" id="catSubmit">Tambah Kategori</button>
      `,
      onOpen: (el) => {
        // Auto-fill name dan table_name dari display_name
        const dispInput = el.querySelector('[name="display_name"]');
        const nameInput = el.querySelector('[name="name"]');
        const tableInput = el.querySelector('[name="table_name"]');
        dispInput.addEventListener('input', () => {
          const slug = dispInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
          nameInput.value = slug;
          tableInput.value = slug;
        });

        el.querySelector('#catSubmit').addEventListener('click', async () => {
          const form = el.querySelector('#catForm');
          const errBox = el.querySelector('#catError');
          errBox.textContent = '';
          if (!form.checkValidity()) { form.reportValidity(); return; }
          const fd = new FormData(form);
          const body = {
            name: fd.get('name'),
            display_name: fd.get('display_name'),
            table_name: fd.get('table_name'),
            icon: fd.get('icon'),
            description: fd.get('description'),
          };
          const btn = el.querySelector('#catSubmit');
          btn.disabled = true; btn.textContent = 'Menyimpan…';
          try {
            await App.api('/api/categories', { method: 'POST', body: JSON.stringify(body) });
            Toast.success(`Kategori "${body.display_name}" berhasil ditambahkan.`);
            Modal.close();
            await loadCategories();
            // Refresh sidebar nav agar kategori baru langsung muncul
            if (typeof Dashboard !== 'undefined' && Dashboard.refreshDynamicNav) {
              await Dashboard.refreshDynamicNav();
            }
          } catch (e) {
            errBox.textContent = e.message;
            btn.disabled = false; btn.textContent = 'Tambah Kategori';
          }
        });
      },
    });
  }

  /* -------- Edit kategori -------- */

  async function showEditCategory(id) {
    let cat;
    try {
      const data = await App.api(`/api/categories/${id}`);
      cat = data.category;
    } catch (e) { Toast.error(e.message); return; }

    const html = `
      <form id="catEditForm">
        <div class="form-group">
          <label>Nama Tampilan <span class="required">*</span></label>
          <input type="text" name="display_name" required value="${App.escapeHtml(cat.display_name)}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Ikon</label>
            <select name="icon">
              <option value="database" ${cat.icon==='database'?'selected':''}>🗄 Database</option>
              <option value="home" ${cat.icon==='home'?'selected':''}>🏠 Rumah</option>
              <option value="heart" ${cat.icon==='heart'?'selected':''}>❤ Hati</option>
              <option value="users" ${cat.icon==='users'?'selected':''}>👥 Orang</option>
              <option value="map-pin" ${cat.icon==='map-pin'?'selected':''}>📍 Lokasi</option>
              <option value="book" ${cat.icon==='book'?'selected':''}>📖 Buku</option>
              <option value="briefcase" ${cat.icon==='briefcase'?'selected':''}>💼 Koper</option>
              <option value="activity" ${cat.icon==='activity'?'selected':''}>📊 Grafik</option>
              <option value="star" ${cat.icon==='star'?'selected':''}>⭐ Bintang</option>
              <option value="shield" ${cat.icon==='shield'?'selected':''}>🛡 Perisai</option>
              <option value="truck" ${cat.icon==='truck'?'selected':''}>🚛 Kendaraan</option>
              <option value="tool" ${cat.icon==='tool'?'selected':''}>🔧 Alat</option>
            </select>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select name="active">
              <option value="1" ${cat.active?'selected':''}>Aktif</option>
              <option value="0" ${!cat.active?'selected':''}>Nonaktif</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Deskripsi</label>
          <input type="text" name="description" value="${App.escapeHtml(cat.description || '')}">
        </div>
        <div class="form-error" id="catEditError"></div>
      </form>
    `;
    Modal.open(html, {
      title: `Edit Kategori: ${cat.display_name}`,
      large: true,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Batal</button>
        <button class="btn btn-primary" id="catEditSubmit">Simpan</button>
      `,
      onOpen: (el) => {
        el.querySelector('#catEditSubmit').addEventListener('click', async () => {
          const form = el.querySelector('#catEditForm');
          const errBox = el.querySelector('#catEditError');
          errBox.textContent = '';
          const fd = new FormData(form);
          const body = {
            display_name: fd.get('display_name'),
            icon: fd.get('icon'),
            description: fd.get('description'),
            active: fd.get('active') === '1',
            sort: cat.sort || 0,
          };
          const btn = el.querySelector('#catEditSubmit');
          btn.disabled = true; btn.textContent = 'Menyimpan…';
          try {
            await App.api(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(body) });
            Toast.success('Kategori berhasil diperbarui.');
            Modal.close();
            await loadCategories();
            if (typeof Dashboard !== 'undefined' && Dashboard.refreshDynamicNav) {
              await Dashboard.refreshDynamicNav();
            }
          } catch (e) {
            errBox.textContent = e.message;
            btn.disabled = false; btn.textContent = 'Simpan';
          }
        });
      },
    });
  }

  /* -------- Hapus kategori -------- */

  async function deleteCategory(id, nama) {
    Modal.confirm('Hapus Kategori', `Hapus kategori "${nama}"? Hanya dapat dihapus jika belum ada data.`, async () => {
      try {
        await App.api(`/api/categories/${id}`, { method: 'DELETE' });
        Toast.success(`Kategori "${nama}" berhasil dihapus.`);
        await loadCategories();
        if (typeof Dashboard !== 'undefined' && Dashboard.refreshDynamicNav) {
          await Dashboard.refreshDynamicNav();
        }
      } catch (e) { Toast.error(e.message); }
    });
  }

  /* -------- Kelola field -------- */

  async function showFields(catId) {
    let cat;
    try {
      const data = await App.api(`/api/categories/${catId}`);
      cat = data.category;
    } catch (e) { Toast.error(e.message); return; }

    function fieldTypeLabel(t) {
      const m = { text: 'Teks', textarea: 'Teks Panjang', number: 'Angka', date: 'Tanggal', select: 'Pilihan', yesno: 'Ya/Tidak', phone: 'Nomor HP', photo: 'Foto', location: 'Koordinat' };
      return m[t] || t;
    }

    function renderFieldList(fields) {
      fields = fields || [];
      if (!fields.length) return '<p class="text-muted" style="padding:12px 0">Belum ada field. Tambahkan field untuk membuat formulir.</p>';
      return fields.map(f => `
        <div class="admin-card" style="padding:10px 14px;margin-bottom:8px" id="field-row-${f.id}">
          <div class="admin-card-info">
            <strong>${App.escapeHtml(f.label)}</strong>
            <p><code>${App.escapeHtml(f.name)}</code> &middot; ${fieldTypeLabel(f.type)} ${f.required ? '&middot; <span class="tag tag-red" style="font-size:11px">Wajib</span>' : ''} ${f.is_system ? '&middot; <span class="tag" style="font-size:11px">Sistem</span>' : ''}</p>
          </div>
          <div class="admin-card-actions">
            ${!f.is_system ? `<button class="btn-icon is-danger" onclick="CategoryManager._deleteField(${catId},${f.id},'${App.escapeHtml(f.label)}')" title="Hapus field">${Icon.i('trash')}</button>` : ''}
          </div>
        </div>
      `).join('');
    }

    const addFieldHtml = `
      <hr style="margin:16px 0">
      <h4 style="margin-bottom:12px">Tambah Field Baru</h4>
      <div class="form-row">
        <div class="form-group">
          <label>Label Field <span class="required">*</span></label>
          <input type="text" id="fLabel" placeholder="cth: Nama Panti">
        </div>
        <div class="form-group">
          <label>ID Field <span class="required">*</span></label>
          <input type="text" id="fName" placeholder="cth: nama_panti" pattern="[a-z_]+" title="Huruf kecil dan underscore">
          <div class="hint">Huruf kecil, underscore. Auto-isi dari label.</div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Tipe <span class="required">*</span></label>
          <select id="fType">
            <option value="text">Teks</option>
            <option value="textarea">Teks Panjang</option>
            <option value="number">Angka</option>
            <option value="date">Tanggal</option>
            <option value="select">Pilihan (dropdown)</option>
            <option value="yesno">Ya / Tidak</option>
            <option value="phone">Nomor HP</option>
            <option value="photo">Foto</option>
            <option value="location">Koordinat (Peta)</option>
          </select>
        </div>
        <div class="form-group" id="fOptionsGroup" style="display:none">
          <label>Pilihan (pisahkan dengan koma)</label>
          <input type="text" id="fOptions" placeholder="cth: Negeri, Swasta, Yayasan">
        </div>
      </div>
      <div class="form-group">
        <label style="display:flex;gap:8px;align-items:center;cursor:pointer">
          <input type="checkbox" id="fRequired"> Wajib diisi
        </label>
      </div>
      <div class="form-error" id="fError"></div>
      <button class="btn btn-primary btn-sm" id="fSubmit">${Icon.i('plus')} Tambah Field</button>
    `;

    const html = `
      <div id="fieldList">${renderFieldList(cat.fields || [])}</div>
      ${!cat.is_system ? addFieldHtml : '<p class="text-muted">Field kategori sistem tidak dapat dimodifikasi.</p>'}
    `;

    Modal.open(html, {
      title: `Field Kategori: ${cat.display_name}`,
      large: true,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Tutup</button>`,
      onOpen: (el) => {
        const labelInput = el.querySelector('#fLabel');
        const nameInput = el.querySelector('#fName');
        const typeSelect = el.querySelector('#fType');
        const optionsGroup = el.querySelector('#fOptionsGroup');
        const submitBtn = el.querySelector('#fSubmit');

        if (labelInput) {
          labelInput.addEventListener('input', () => {
            nameInput.value = labelInput.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
          });
        }

        if (typeSelect) {
          typeSelect.addEventListener('change', () => {
            optionsGroup.style.display = typeSelect.value === 'select' ? '' : 'none';
          });
        }

        if (submitBtn) {
          submitBtn.addEventListener('click', async () => {
            const errBox = el.querySelector('#fError');
            errBox.textContent = '';
            const label = labelInput.value.trim();
            const name = nameInput.value.trim();
            const type = typeSelect.value;
            const required = el.querySelector('#fRequired').checked;
            const optionsRaw = el.querySelector('#fOptions') ? el.querySelector('#fOptions').value : '';
            const options = type === 'select'
              ? JSON.stringify(optionsRaw.split(',').map(s => s.trim()).filter(Boolean))
              : '[]';

            if (!label || !name) { errBox.textContent = 'Label dan ID field wajib diisi.'; return; }
            if (!/^[a-z_]+$/.test(name)) { errBox.textContent = 'ID field hanya huruf kecil dan underscore.'; return; }

            submitBtn.disabled = true; submitBtn.textContent = 'Menyimpan…';
            try {
              await App.api(`/api/categories/${catId}/fields`, {
                method: 'POST',
                body: JSON.stringify({ label, name, type, required, options, sort: 0 }),
              });
              Toast.success(`Field "${label}" berhasil ditambahkan.`);
              // Refresh field list dalam modal (pakai endpoint /fields yang accessible semua user)
              const refreshed = await App.api(`/api/categories/${catId}/fields`);
              el.querySelector('#fieldList').innerHTML = renderFieldList(refreshed.fields || []);
              // Reset form
              labelInput.value = ''; nameInput.value = ''; el.querySelector('#fRequired').checked = false;
              if (el.querySelector('#fOptions')) el.querySelector('#fOptions').value = '';
            } catch (e) {
              errBox.textContent = e.message;
            }
            submitBtn.disabled = false; submitBtn.innerHTML = Icon.i('plus') + ' Tambah Field';
          });
        }
      },
    });
  }

  /* -------- Hapus field (dipanggil dari dalam modal) -------- */
  async function _deleteField(catId, fieldId, label) {
    if (!confirm(`Hapus field "${label}"?`)) return;
    try {
      await App.api(`/api/categories/${catId}/fields/${fieldId}`, { method: 'DELETE' });
      Toast.success(`Field "${label}" dihapus.`);
      // Refresh field list
      const refreshed = await App.api(`/api/categories/${catId}/fields`);
      function fieldTypeLabel(t) {
        const m = { text:'Teks', textarea:'Teks Panjang', number:'Angka', date:'Tanggal', select:'Pilihan', yesno:'Ya/Tidak', phone:'Nomor HP', photo:'Foto', location:'Koordinat' };
        return m[t] || t;
      }
      const el = document.querySelector('.modal-overlay');
      if (el) {
        const fl = el.querySelector('#fieldList');
        if (fl) {
          const fields = refreshed.fields || [];
          if (!fields.length) { fl.innerHTML = '<p class="text-muted" style="padding:12px 0">Belum ada field.</p>'; return; }
          fl.innerHTML = fields.map(f => `
            <div class="admin-card" style="padding:10px 14px;margin-bottom:8px" id="field-row-${f.id}">
              <div class="admin-card-info">
                <strong>${App.escapeHtml(f.label)}</strong>
                <p><code>${App.escapeHtml(f.name)}</code> &middot; ${fieldTypeLabel(f.type)} ${f.required ? '&middot; <span class="tag tag-red" style="font-size:11px">Wajib</span>' : ''} ${f.is_system ? '&middot; <span class="tag" style="font-size:11px">Sistem</span>' : ''}</p>
              </div>
              <div class="admin-card-actions">
                ${!f.is_system ? `<button class="btn-icon is-danger" onclick="CategoryManager._deleteField(${catId},${f.id},'${App.escapeHtml(f.label)}')" title="Hapus field">${Icon.i('trash')}</button>` : ''}
              </div>
            </div>
          `).join('');
        }
      }
    } catch (e) { Toast.error(e.message); }
  }

  /* -------- Halaman daftar data dinamis (tabel, sama seperti modul sistem) -------- */

  async function renderDataPage(container, catId) {
    container.innerHTML = '<div class="loading">Memuat…</div>';
    try {
      const data = await App.api(`/api/categories/${catId}/fields`);
      const { category } = data;
      const fields = data.fields || [];

      container.innerHTML = `
        <div class="data-toolbar">
          <input type="text" class="search-input" id="dynSearch" placeholder="Cari data...">
          ${App.exportButtonsHtml('dyn')}
          <a href="#cat-add-${catId}" class="btn btn-primary btn-sm">${Icon.i('plus')} Tambah Data</a>
        </div>
        <div id="dynDataList"><div class="loading">Memuat…</div></div>
      `;

      let page = 1;

      App.wireExportButtons('dyn', () => catId, () => {
        const params = {};
        const search = document.getElementById('dynSearch').value;
        if (search) params.search = search;
        return params;
      });

      async function loadData() {
        const search = document.getElementById('dynSearch').value;
        const params = new URLSearchParams({ page, per: 15 });
        if (search) params.set('search', search);
        try {
          const d = await App.api(`/api/categories/${catId}/data?${params}`);
          document.getElementById('dynDataList').innerHTML = renderDynTable(catId, category, fields, d);
        } catch (e) {
          document.getElementById('dynDataList').innerHTML = `<p class="text-danger">${App.escapeHtml(e.message)}</p>`;
        }
      }
      document.getElementById('dynSearch').addEventListener('input', App.debounce(() => { page = 1; loadData(); }));
      window._setDynPage = (p) => { page = p; loadData(); };
      window._loadDynData = loadData;
      await loadData();
    } catch (e) {
      container.innerHTML = `<p class="text-danger">${App.escapeHtml(e.message)}</p>`;
    }
  }

  function fieldTypeLabelPublic(t) {
    const m = { text: 'Teks', textarea: 'Teks Panjang', number: 'Angka', date: 'Tanggal', select: 'Pilihan', yesno: 'Ya/Tidak', phone: 'Nomor HP', photo: 'Foto', location: 'Koordinat' };
    return m[t] || t;
  }

  function formatCellValue(f, row) {
    const v = row[f.name];
    switch (f.type) {
      case 'select':
        return v ? `<span class="tag tag-blue">${App.escapeHtml(v)}</span>` : '<span class="text-muted">-</span>';
      case 'yesno':
        return v ? '<span class="tag">Ya</span>' : '<span class="text-muted">Tidak</span>';
      case 'photo':
        return v ? `<a href="${App.escapeHtml(v)}" target="_blank" rel="noopener">${Icon.i('camera')}</a>` : '<span class="text-muted">-</span>';
      case 'location': {
        const lat = row[`${f.name}_lat`], lng = row[`${f.name}_lng`];
        return (lat != null && lng != null) ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : '<span class="text-muted">-</span>';
      }
      case 'textarea':
        if (!v) return '<span class="text-muted">-</span>';
        return `${App.escapeHtml(String(v).substring(0, 40))}${String(v).length > 40 ? '…' : ''}`;
      default:
        return v || v === 0 ? App.escapeHtml(String(v)) : '<span class="text-muted">-</span>';
    }
  }

  function renderDynTable(catId, category, fields, data) {
    const rows = data.rows || [];
    if (!rows.length) return `<div class="empty-state"><div class="empty-state-icon">${Icon.i(category.icon || 'database')}</div><h3>Belum ada data</h3><p>Tambahkan data ${App.escapeHtml(category.display_name)} pertama.</p></div>`;
    const cols = fields.filter(f => f.type !== 'photo' || true); // semua field ditampilkan sebagai kolom
    const user = Auth.getUser();
    let html = `<div class="data-table-wrap"><table class="data-table">
      <thead><tr>
        <th>Kode</th>
        ${cols.map(f => `<th>${App.escapeHtml(f.label)}</th>`).join('')}
        <th>Pendata</th><th>Aksi</th>
      </tr></thead><tbody>`;
    for (const r of rows) {
      const canEdit = Auth.isSuperadmin() || r.owner_id === user.id;
      html += `<tr>
        <td data-label="Kode"><code>${App.escapeHtml(r.ref)}</code></td>
        ${cols.map(f => `<td data-label="${App.escapeHtml(f.label)}">${formatCellValue(f, r)}</td>`).join('')}
        <td data-label="Pendata"><small>${App.escapeHtml(r.owner_nama || '-')}</small></td>
        <td class="actions" data-label="Aksi">
          <button class="btn-icon" onclick="window.location.hash='cat-detail-${catId}-${r.id}'" title="Detail" aria-label="Detail">${Icon.i('eye')}</button>
          ${canEdit ? `<button class="btn-icon" onclick="window.location.hash='cat-edit-${catId}-${r.id}'" title="Edit" aria-label="Edit">${Icon.i('pencil')}</button>
          <button class="btn-icon is-danger" onclick="CategoryManager.deleteData(${catId},${r.id})" title="Hapus" aria-label="Hapus">${Icon.i('trash')}</button>` : ''}
        </td>
      </tr>`;
    }
    html += '</tbody></table></div>';
    const totalPages = Math.ceil(data.total / data.per);
    if (totalPages > 1) {
      html += '<div class="pagination">';
      html += `<button ${data.page <= 1 ? 'disabled' : ''} onclick="window._setDynPage(${data.page - 1})">‹ Sebelumnya</button>`;
      for (let i = 1; i <= Math.min(totalPages, 7); i++)
        html += `<button class="${i === data.page ? 'active' : ''}" onclick="window._setDynPage(${i})">${i}</button>`;
      html += `<button ${data.page >= totalPages ? 'disabled' : ''} onclick="window._setDynPage(${data.page + 1})">Berikutnya ›</button></div>`;
    }
    return html;
  }

  /* -------- Form tambah / edit data dinamis -------- */

  async function renderAddForm(container, catId) {
    return renderDataForm(container, catId, null);
  }

  async function renderEditForm(container, catId, dataId) {
    return renderDataForm(container, catId, dataId);
  }

  async function renderDataForm(container, catId, dataId) {
    container.innerHTML = '<div class="loading">Memuat…</div>';
    const isEdit = !!dataId;
    try {
      const data = await App.api(`/api/categories/${catId}/fields`);
      const { category } = data;
      const fields = data.fields || [];

      if (!fields.length) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${Icon.i('alert-circle')}</div><h3>Belum ada field</h3><p>Tambahkan field ke kategori "${App.escapeHtml(category.display_name)}" terlebih dahulu melalui menu Kategori Data.</p><button class="btn btn-outline btn-sm" onclick="window.location.hash='categories'">Ke Kategori Data</button></div>`;
        return;
      }

      let row = null;
      if (isEdit) {
        const rd = await App.api(`/api/categories/${catId}/data/${dataId}`);
        row = rd.data;
      }

      container.innerHTML = `
        <div class="form-card">
          <div class="form-card-header">
            <h2>${isEdit ? `Edit Data ${App.escapeHtml(category.display_name)}` : `Tambah Data ${App.escapeHtml(category.display_name)}`}</h2>
            <p>${isEdit ? `Mengubah data: ${App.escapeHtml(row.ref)}` : `Lengkapi formulir untuk menambah data ${App.escapeHtml(category.display_name)}.`}</p>
          </div>
          <form id="dynForm" class="form-card-body" enctype="multipart/form-data">
            <div class="form-section">
              <div class="form-section-title">${Icon.i(category.icon || 'database')} Informasi ${App.escapeHtml(category.display_name)}</div>
              ${fields.filter(f => f.type !== 'location').map(f => renderFieldInput(f, row)).join('')}
            </div>
            ${fields.filter(f => f.type === 'location').map(f => renderFieldInput(f, row)).join('')}
            <div class="form-error" id="dynError"></div>
            <div class="flex gap-1" style="justify-content:flex-end;margin-top:16px">
              <button type="button" class="btn btn-secondary" onclick="window.location.hash='cat-data-${catId}'">Batal</button>
              <button type="button" class="btn btn-primary" id="dynSubmit">${isEdit ? 'Simpan Perubahan' : 'Simpan Data'}</button>
            </div>
          </form>
        </div>
      `;

      // Inisialisasi widget peta untuk setiap field bertipe location
      fields.filter(f => f.type === 'location').forEach(f => {
        const lat = row ? row[`${f.name}_lat`] : null;
        const lng = row ? row[`${f.name}_lng`] : null;
        initLocationPicker(f.name, lat, lng);
      });

      document.getElementById('dynSubmit').addEventListener('click', async () => {
        const form = document.getElementById('dynForm');
        const errBox = document.getElementById('dynError');
        errBox.textContent = '';
        const fd = new FormData(form);
        const btn = document.getElementById('dynSubmit');
        btn.disabled = true; btn.textContent = 'Menyimpan…';
        try {
          const url = isEdit ? `/api/categories/${catId}/data/${dataId}` : `/api/categories/${catId}/data`;
          const method = isEdit ? 'PUT' : 'POST';
          const res = await fetch(url, { method, body: fd });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
          Toast.success(isEdit ? 'Data berhasil diperbarui.' : 'Data berhasil disimpan.');
          window.location.hash = `cat-detail-${catId}-${d.data.id}`;
        } catch (e) {
          errBox.textContent = e.message;
          btn.disabled = false; btn.textContent = isEdit ? 'Simpan Perubahan' : 'Simpan Data';
        }
      });

    } catch (e) {
      container.innerHTML = `<p class="text-danger">${App.escapeHtml(e.message)}</p>`;
    }
  }

  function renderFieldInput(f, row) {
    const req = f.required ? 'required' : '';
    const reqMark = f.required ? '<span class="required">*</span>' : '';
    const val = row ? row[f.name] : null;
    switch (f.type) {
      case 'text':
      case 'phone':
        return `<div class="form-group"><label>${App.escapeHtml(f.label)} ${reqMark}</label><input type="${f.type === 'phone' ? 'tel' : 'text'}" name="${f.name}" ${req} value="${val != null ? App.escapeHtml(String(val)) : ''}" placeholder="${f.type === 'phone' ? '08xxxxxxxxxx' : App.escapeHtml(f.label)}"></div>`;
      case 'textarea':
        return `<div class="form-group"><label>${App.escapeHtml(f.label)} ${reqMark}</label><textarea name="${f.name}" ${req} rows="3" placeholder="${App.escapeHtml(f.label)}">${val != null ? App.escapeHtml(String(val)) : ''}</textarea></div>`;
      case 'number':
        return `<div class="form-group"><label>${App.escapeHtml(f.label)} ${reqMark}</label><input type="number" name="${f.name}" ${req} step="any" value="${val != null ? App.escapeHtml(String(val)) : ''}"></div>`;
      case 'date':
        return `<div class="form-group"><label>${App.escapeHtml(f.label)} ${reqMark}</label><input type="date" name="${f.name}" ${req} value="${val != null ? App.escapeHtml(String(val)) : ''}"></div>`;
      case 'select': {
        let opts = [];
        try { opts = JSON.parse(f.options || '[]'); } catch {}
        return `<div class="form-group"><label>${App.escapeHtml(f.label)} ${reqMark}</label><select name="${f.name}" ${req}><option value="">-- Pilih --</option>${opts.map(o => `<option value="${App.escapeHtml(o)}" ${val === o ? 'selected' : ''}>${App.escapeHtml(o)}</option>`).join('')}</select></div>`;
      }
      case 'yesno':
        return `<div class="form-group"><label>${App.escapeHtml(f.label)} ${reqMark}</label><div class="yesno-group"><input type="radio" name="${f.name}" id="${f.name}_ya" value="1" ${req} ${val ? 'checked' : ''}><label for="${f.name}_ya">Ya</label><input type="radio" name="${f.name}" id="${f.name}_tidak" value="0" ${row && !val ? 'checked' : ''}><label for="${f.name}_tidak">Tidak</label></div></div>`;
      case 'photo':
        return `<div class="form-group"><label>${App.escapeHtml(f.label)} ${!row && f.required ? '<span class="required">*</span>' : ''}</label>
          ${row && val ? `<div class="photo-preview"><img src="${App.escapeHtml(val)}" alt="Foto saat ini"></div>` : ''}
          <div class="file-upload">
            <input type="file" name="${f.name}" accept="image/jpeg,image/png,image/webp" ${!row && f.required ? 'required' : ''}>
            <div class="file-upload-text">Klik atau seret foto ke sini<br><small>JPG, PNG, WEBP (maks 8 MB)${row ? ' — kosongkan jika tidak ingin mengubah' : ''}</small></div>
          </div>
        </div>`;
      case 'location': {
        const lat = row ? row[`${f.name}_lat`] : null;
        const lng = row ? row[`${f.name}_lng`] : null;
        const hasCoord = lat != null && lng != null;
        return `<div class="form-section">
          <div class="form-section-title">${Icon.i('map-pin')} ${App.escapeHtml(f.label)} ${reqMark}</div>
          <div class="form-group">
            <div class="hint mb-1">Pilih lokasi: (1) klik peta, (2) input koordinat manual, atau (3) gunakan GPS perangkat Anda.</div>
            <div class="location-picker">
              <div class="location-picker-map" id="locMap_${f.name}"></div>
              <div class="location-picker-info">
                ${Icon.i('map-pin')}
                <span id="locCoord_${f.name}">${hasCoord ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : 'Belum ada lokasi dipilih'}</span>
              </div>
            </div>
            <div class="form-row mt-2">
              <div class="form-group">
                <label>Latitude</label>
                <input type="number" step="any" name="${f.name}_lat" id="loc_${f.name}_lat" value="${hasCoord ? lat : ''}" placeholder="3.5786">
              </div>
              <div class="form-group">
                <label>Longitude</label>
                <input type="number" step="any" name="${f.name}_lng" id="loc_${f.name}_lng" value="${hasCoord ? lng : ''}" placeholder="98.6373">
              </div>
            </div>
            <div class="flex gap-1 mt-1">
              <button type="button" class="btn btn-sm btn-outline" id="locGpsBtn_${f.name}">${Icon.i('crosshair')} Gunakan GPS Saya</button>
              <button type="button" class="btn btn-sm btn-secondary" id="locApplyBtn_${f.name}">${Icon.i('map-pin')} Terapkan Koordinat</button>
            </div>
            <div class="hint mt-1" id="locStatus_${f.name}"></div>
          </div>
        </div>`;
      }
      default:
        return `<div class="form-group"><label>${App.escapeHtml(f.label)} ${reqMark}</label><input type="text" name="${f.name}" ${req} value="${val != null ? App.escapeHtml(String(val)) : ''}"></div>`;
    }
  }

  /* -------- Widget peta untuk field lokasi (sama seperti field sistem/Rumah Ibadah) -------- */

  function initLocationPicker(fieldName, initLat, initLng) {
    const mapEl = document.getElementById(`locMap_${fieldName}`);
    if (!mapEl || typeof L === 'undefined') return;
    const hasInit = initLat != null && initLng != null && initLat !== '' && initLng !== '';
    const center = hasInit ? [Number(initLat), Number(initLng)] : [3.5786, 98.6373];
    const map = L.map(mapEl).setView(center, hasInit ? 16 : 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);

    const latInput = document.getElementById(`loc_${fieldName}_lat`);
    const lngInput = document.getElementById(`loc_${fieldName}_lng`);
    const coordDisplay = document.getElementById(`locCoord_${fieldName}`);
    const statusEl = document.getElementById(`locStatus_${fieldName}`);
    let marker = null;

    function setMarker(lat, lng, panTo) {
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
      coordDisplay.textContent = `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
      if (panTo) map.setView(ll, Math.max(map.getZoom(), 15));
    }

    if (hasInit) setMarker(Number(initLat), Number(initLng), false);
    map.on('click', (e) => setMarker(e.latlng.lat, e.latlng.lng, false));
    setTimeout(() => map.invalidateSize(), 100);

    function syncManual() {
      const lat = parseFloat(latInput.value), lng = parseFloat(lngInput.value);
      if (Number.isFinite(lat) && Number.isFinite(lng)) coordDisplay.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
    latInput.addEventListener('input', syncManual);
    lngInput.addEventListener('input', syncManual);

    const applyBtn = document.getElementById(`locApplyBtn_${fieldName}`);
    if (applyBtn) applyBtn.addEventListener('click', () => {
      const lat = parseFloat(latInput.value), lng = parseFloat(lngInput.value);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) { Toast.warning('Isi koordinat terlebih dahulu.'); return; }
      setMarker(lat, lng, true);
      Toast.success('Koordinat diterapkan.');
    });

    const gpsBtn = document.getElementById(`locGpsBtn_${fieldName}`);
    if (gpsBtn) gpsBtn.addEventListener('click', () => {
      if (!navigator.geolocation) { statusEl.textContent = 'Browser tidak mendukung GPS.'; return; }
      statusEl.textContent = 'Mengambil lokasi GPS…';
      gpsBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setMarker(pos.coords.latitude, pos.coords.longitude, true);
          statusEl.textContent = `Lokasi GPS ditemukan (±${Math.round(pos.coords.accuracy)}m).`;
          gpsBtn.disabled = false;
        },
        () => {
          statusEl.textContent = 'Gagal mengambil GPS. Izinkan akses lokasi di browser.';
          gpsBtn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  }

  /* -------- Detail data dinamis -------- */

  async function renderDetail(container, catId, dataId) {
    container.innerHTML = '<div class="loading">Memuat…</div>';
    try {
      const data = await App.api(`/api/categories/${catId}/data/${dataId}`);
      const { category, fields } = data;
      const row = data.data;
      const user = Auth.getUser();
      const canEdit = Auth.isSuperadmin() || row.owner_id === user.id;
      const locField = fields.find(f => f.type === 'location');
      const photoField = fields.find(f => f.type === 'photo');
      const lat = locField ? row[`${locField.name}_lat`] : null;
      const lng = locField ? row[`${locField.name}_lng`] : null;
      const hasCoord = locField && lat != null && lng != null;

      container.innerHTML = `
        <div class="dashboard-card">
          <div class="card-header">
            <h3>${App.escapeHtml(row.ref)} — ${App.escapeHtml(category.display_name)}</h3>
            <div class="flex gap-1">
              ${canEdit ? `<button class="btn btn-sm btn-primary" onclick="window.location.hash='cat-edit-${catId}-${row.id}'">${Icon.i('pencil')} Edit</button>` : ''}
              <button class="btn btn-sm btn-secondary" onclick="window.location.hash='cat-data-${catId}'">${Icon.i('arrow-left')} Kembali</button>
            </div>
          </div>
          <div class="card-body">
            <div class="detail-grid">
              ${photoField ? `<div class="detail-images">${row[photoField.name] ? `<figure><figcaption>${App.escapeHtml(photoField.label)}</figcaption><img src="${App.escapeHtml(row[photoField.name])}" alt="Foto"></figure>` : '<div class="no-photo">Tidak ada foto</div>'}</div>` : ''}
              <div class="detail-info">
                <dl>
                  ${fields.filter(f => f.type !== 'photo' && f.type !== 'location').map(f => `<dt>${App.escapeHtml(f.label)}</dt><dd>${formatCellValue(f, row).replace(/^<span class="text-muted">-<\/span>$/, '-')}</dd>`).join('')}
                  ${hasCoord ? `<dt>Koordinat (${App.escapeHtml(locField.label)})</dt><dd>${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}</dd>` : ''}
                  <dt>Pendata</dt><dd>${App.escapeHtml(row.owner_nama || '-')} (${App.escapeHtml(row.owner_username || '')})</dd>
                  <dt>Dibuat</dt><dd>${App.formatDateTime(row.created_at)}</dd>
                  ${row.updated_at ? `<dt>Terakhir Diubah</dt><dd>${App.formatDateTime(row.updated_at)}</dd>` : ''}
                </dl>
              </div>
            </div>
            ${hasCoord ? `<div class="mt-3"><h4 class="mb-2">Lokasi di Peta</h4><div id="detailDynMap" style="height:300px;border-radius:var(--radius-md);overflow:hidden;"></div></div>` : ''}
          </div>
        </div>
      `;
      if (hasCoord) {
        const m = L.map('detailDynMap').setView([lat, lng], 16);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(m);
        const icon = L.divIcon({
          className: 'custom-marker-wrapper',
          html: `<div class="custom-marker" style="background:#5e4187"><span class="pin-icon">${Icon.i(category.icon || 'map-pin')}</span></div>`,
          iconSize: [34, 34], iconAnchor: [17, 34]
        });
        L.marker([lat, lng], { icon }).addTo(m).bindPopup(`<strong>${App.escapeHtml(row.ref)}</strong>`).openPopup();
      }
    } catch (e) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${Icon.i('alert-circle')}</div><h3>Terjadi Kesalahan</h3><p>${App.escapeHtml(e.message)}</p></div>`;
    }
  }

  /* -------- Hapus data -------- */

  async function deleteData(catId, dataId) {
    Modal.confirm('Hapus Data', 'Hapus data ini? Tindakan tidak dapat dibatalkan.', async () => {
      try {
        await App.api(`/api/categories/${catId}/data/${dataId}`, { method: 'DELETE' });
        Toast.success('Data berhasil dihapus.');
        if (window._loadDynData) window._loadDynData();
        else window.location.hash = `cat-data-${catId}`;
      } catch (e) { Toast.error(e.message); }
    });
  }

  return {
    renderPage,
    showAddCategory,
    showEditCategory,
    deleteCategory,
    showFields,
    _deleteField,
    renderDataPage,
    renderAddForm,
    renderEditForm,
    renderDetail,
    deleteData,
  };

})();

window.CategoryManager = CategoryManager;
