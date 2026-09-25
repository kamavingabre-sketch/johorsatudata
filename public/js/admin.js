/* ========================================
   Admin Module — Users & Fields Management
   ======================================== */

const Admin = (() => {
  async function renderUsers(container) {
    container.innerHTML = `
      <div class="flex-between mb-3">
        <h3>Daftar Admin</h3>
        <button class="btn btn-primary btn-sm" onclick="Admin.showAddUser()">+ Tambah Admin</button>
      </div>
      <div id="usersList"><div class="loading">Memuat...</div></div>
    `;
    await loadUsers();
  }

  async function loadUsers() {
    try {
      const data = await App.api('/api/users');
      const el = document.getElementById('usersList');
      if (!data.users.length) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><h3>Belum ada admin</h3></div>';
        return;
      }
      el.innerHTML = data.users.map(u => `
        <div class="admin-card">
          <div class="admin-card-avatar">${App.initials(u.nama)}</div>
          <div class="admin-card-info">
            <h4>${App.escapeHtml(u.nama)}</h4>
            <p>@${App.escapeHtml(u.username)} · <span class="role-badge ${u.role}">${u.role}</span> · <span class="status-badge ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Aktif' : 'Nonaktif'}</span> · ${u.jumlah_data} data</p>
          </div>
          <div class="admin-card-actions">
            <button class="btn btn-sm btn-ghost" onclick="Admin.showEditUser(${u.id})" title="Edit">✏️</button>
            ${u.role !== 'superadmin' || data.users.filter(x => x.role === 'superadmin' && x.is_active).length > 1 ? `<button class="btn btn-sm btn-ghost" onclick="Admin.deleteUser(${u.id},'${App.escapeHtml(u.nama)}')" title="Hapus">🗑️</button>` : ''}
          </div>
        </div>
      `).join('');
    } catch (e) {
      document.getElementById('usersList').innerHTML = `<p class="text-danger">${e.message}</p>`;
    }
  }

  function showAddUser() {
    showUserModal(null);
  }

  async function showEditUser(id) {
    try {
      const data = await App.api('/api/users');
      const user = data.users.find(u => u.id === id);
      if (!user) throw new Error('User tidak ditemukan');
      showUserModal(user);
    } catch (e) {
      Toast.error(e.message);
    }
  }

  function showUserModal(user) {
    const isEdit = !!user;
    const html = `
      <form id="userForm">
        <div class="form-group">
          <label>Username ${!isEdit ? '<span class="required">*</span>' : ''}</label>
          <input type="text" name="username" value="${isEdit ? App.escapeHtml(user.username) : ''}" ${isEdit ? 'disabled' : 'required'} placeholder="huruf kecil, angka, titik, strip">
          <div class="hint">3-32 karakter. Tidak dapat diubah setelah dibuat.</div>
        </div>
        <div class="form-group">
          <label>Nama Lengkap <span class="required">*</span></label>
          <input type="text" name="nama" value="${isEdit ? App.escapeHtml(user.nama) : ''}" required>
        </div>
        <div class="form-group">
          <label>Role <span class="required">*</span></label>
          <select name="role" required>
            <option value="admin" ${isEdit && user.role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="superadmin" ${isEdit && user.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>
          </select>
        </div>
        <div class="form-group">
          <label>Password ${isEdit ? '(kosongkan jika tidak ingin mengubah)' : '<span class="required">*</span>'}</label>
          <input type="password" name="password" ${!isEdit ? 'required' : ''} minlength="8">
          ${isEdit ? '<div class="hint">Mengubah password akan memaksa user login ulang dan mereset password.</div>' : ''}
        </div>
        ${isEdit ? `
        <div class="form-group">
          <label>Status</label>
          <div class="yesno-group">
            <input type="radio" name="is_active" id="active_ya" value="1" ${user.is_active ? 'checked' : ''}>
            <label for="active_ya">Aktif</label>
            <input type="radio" name="is_active" id="active_tidak" value="0" ${!user.is_active ? 'checked' : ''}>
            <label for="active_tidak">Nonaktif</label>
          </div>
        </div>
        ` : ''}
        <div class="form-error" id="userError"></div>
      </form>
    `;
    const overlay = Modal.open(html, {
      title: isEdit ? 'Edit Admin' : 'Tambah Admin Baru',
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Batal</button>
        <button class="btn btn-primary" id="userSubmit">${isEdit ? 'Simpan' : 'Tambah'}</button>
      `,
      onOpen: (el) => {
        el.querySelector('#userSubmit').addEventListener('click', async () => {
          const form = el.querySelector('#userForm');
          const errBox = el.querySelector('#userError');
          errBox.textContent = '';
          const fd = new FormData(form);
          const body = {
            nama: fd.get('nama'),
            role: fd.get('role'),
          };
          if (!isEdit) {
            body.username = fd.get('username');
            body.password = fd.get('password');
          } else {
            body.password = fd.get('password');
            body.is_active = fd.get('is_active') === '1';
          }
          try {
            const url = isEdit ? `/api/users/${user.id}` : '/api/users';
            const method = isEdit ? 'PUT' : 'POST';
            await App.api(url, { method, body: JSON.stringify(body) });
            Toast.success(isEdit ? 'Admin berhasil diperbarui.' : 'Admin berhasil ditambahkan.');
            Modal.close();
            await loadUsers();
          } catch (e) {
            errBox.textContent = e.message;
          }
        });
      },
    });
  }

  function deleteUser(id, nama) {
    Modal.confirm('Hapus Admin', `Hapus admin "${nama}"? Admin ini tidak boleh memiliki data usaha.`, async () => {
      try {
        await App.api(`/api/users/${id}`, { method: 'DELETE' });
        Toast.success('Admin berhasil dihapus.');
        await loadUsers();
      } catch (e) {
        Toast.error(e.message);
      }
    });
  }

  async function renderFields(container) {
    container.innerHTML = `
      <div class="flex-between mb-3">
        <div>
          <h3>Kelola Kolom Form Pendataan</h3>
          <p class="text-muted" style="font-size:0.9rem;">Tambahkan atau nonaktifkan kolom tambahan pada form pendataan usaha.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="Admin.showAddField()">+ Tambah Kolom</button>
      </div>
      <div id="fieldsList"><div class="loading">Memuat...</div></div>
    `;
    await loadFields();
  }

  async function loadFields() {
    try {
      const data = await App.api('/api/fields');
      const el = document.getElementById('fieldsList');
      if (!data.fields.length) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚙️</div><h3>Belum ada kolom</h3></div>';
        return;
      }
      el.innerHTML = data.fields.map(f => `
        <div class="field-item ${f.isSystem ? 'system' : ''} ${!f.active ? 'hidden-field' : ''}" style="${!f.active ? 'opacity:0.5;' : ''}">
          <span class="field-label">${App.escapeHtml(f.label)}</span>
          <span class="field-type">${f.type}${f.required ? ' · wajib' : ''}</span>
          ${f.isSystem ? '<span class="tag">Bawaan</span>' : `
            <button class="btn btn-sm btn-ghost" onclick="Admin.showEditField(${f.id})" title="Edit">✏️</button>
            <button class="btn btn-sm btn-ghost" onclick="Admin.toggleField(${f.id}, ${!f.active})" title="${f.active ? 'Nonaktifkan' : 'Aktifkan'}">${f.active ? '🚫' : '✅'}</button>
            <button class="btn btn-sm btn-ghost" onclick="Admin.deleteField(${f.id},'${App.escapeHtml(f.label)}')" title="Hapus">🗑️</button>
          `}
        </div>
      `).join('');
    } catch (e) {
      document.getElementById('fieldsList').innerHTML = `<p class="text-danger">${e.message}</p>`;
    }
  }

  function showAddField() {
    showFieldModal(null);
  }

  async function showEditField(id) {
    try {
      const data = await App.api('/api/fields');
      const field = data.fields.find(f => f.id === id);
      if (!field) throw new Error('Kolom tidak ditemukan');
      showFieldModal(field);
    } catch (e) {
      Toast.error(e.message);
    }
  }

  function showFieldModal(field) {
    const isEdit = !!field;
    const html = `
      <form id="fieldForm">
        <div class="form-group">
          <label>Nama Kolom <span class="required">*</span></label>
          <input type="text" name="label" value="${isEdit ? App.escapeHtml(field.label) : ''}" required placeholder="Contoh: Nomor NPWP">
        </div>
        <div class="form-group">
          <label>Tipe Kolom <span class="required">*</span></label>
          <select name="type" required id="fieldType">
            <option value="text" ${isEdit && field.type === 'text' ? 'selected' : ''}>Teks</option>
            <option value="number" ${isEdit && field.type === 'number' ? 'selected' : ''}>Angka</option>
            <option value="date" ${isEdit && field.type === 'date' ? 'selected' : ''}>Tanggal</option>
            <option value="select" ${isEdit && field.type === 'select' ? 'selected' : ''}>Pilihan (Dropdown)</option>
            <option value="yesno" ${isEdit && field.type === 'yesno' ? 'selected' : ''}>Ya / Tidak</option>
            <option value="phone" ${isEdit && field.type === 'phone' ? 'selected' : ''}>Nomor Telepon</option>
            <option value="photo" ${isEdit && field.type === 'photo' ? 'selected' : ''}>Foto</option>
          </select>
        </div>
        <div class="form-group" id="optionsGroup" style="${!isEdit || field.type !== 'select' ? 'display:none' : ''}">
          <label>Pilihan (satu per baris)</label>
          <textarea name="options" rows="5" placeholder="OPSI 1&#10;OPSI 2&#10;OPSI 3">${isEdit && field.type === 'select' ? (field.options || []).join('\n') : ''}</textarea>
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" name="required" ${isEdit && field.required ? 'checked' : ''}>
            Wajib diisi
          </label>
        </div>
        <div class="form-error" id="fieldError"></div>
      </form>
    `;
    const overlay = Modal.open(html, {
      title: isEdit ? 'Edit Kolom' : 'Tambah Kolom Baru',
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Batal</button>
        <button class="btn btn-primary" id="fieldSubmit">${isEdit ? 'Simpan' : 'Tambah'}</button>
      `,
      onOpen: (el) => {
        const typeSelect = el.querySelector('#fieldType');
        const optionsGroup = el.querySelector('#optionsGroup');
        typeSelect.addEventListener('change', () => {
          optionsGroup.style.display = typeSelect.value === 'select' ? 'block' : 'none';
        });
        el.querySelector('#fieldSubmit').addEventListener('click', async () => {
          const form = el.querySelector('#fieldForm');
          const errBox = el.querySelector('#fieldError');
          errBox.textContent = '';
          const body = {
            label: form.label.value.trim(),
            type: form.type.value,
            required: form.required.checked,
          };
          if (form.type.value === 'select') {
            body.options = form.options.value.split('\n').map(o => o.trim()).filter(Boolean);
          }
          try {
            const url = isEdit ? `/api/fields/${field.id}` : '/api/fields';
            const method = isEdit ? 'PUT' : 'POST';
            await App.api(url, { method, body: JSON.stringify(body) });
            Toast.success(isEdit ? 'Kolom berhasil diperbarui.' : 'Kolom berhasil ditambahkan.');
            Modal.close();
            await loadFields();
          } catch (e) {
            errBox.textContent = e.message;
          }
        });
      },
    });
  }

  async function toggleField(id, active) {
    try {
      await App.api(`/api/fields/${id}`, { method: 'PUT', body: JSON.stringify({ active }) });
      Toast.success(active ? 'Kolom diaktifkan.' : 'Kolom dinonaktifkan.');
      await loadFields();
    } catch (e) {
      Toast.error(e.message);
    }
  }

  function deleteField(id, label) {
    Modal.confirm('Hapus Kolom', `Hapus kolom "${label}" dari form? Data yang sudah tersimpan tetap ada.`, async () => {
      try {
        await App.api(`/api/fields/${id}`, { method: 'DELETE' });
        Toast.success('Kolom berhasil dihapus.');
        await loadFields();
      } catch (e) {
        Toast.error(e.message);
      }
    });
  }

  return { renderUsers, renderFields, showAddUser, showEditUser, deleteUser, showAddField, showEditField, toggleField, deleteField };
})();

window.Admin = Admin;
