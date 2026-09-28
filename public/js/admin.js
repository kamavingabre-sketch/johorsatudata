/* ========================================
   Admin Module — Manajemen akun petugas
   Akun hanya dibuat oleh Superadmin (tanpa pendaftaran mandiri).
   ======================================== */

const Admin = (() => {
  async function renderUsers(container) {
    container.innerHTML = `
      <div class="flex-between mb-3">
        <div>
          <h3>Daftar Petugas</h3>
          <p class="text-muted" style="font-size:13px;">Akun dibuat langsung oleh Superadmin — tidak ada pendaftaran mandiri.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="Admin.showAddUser()">${Icon.i('plus')} Tambah Petugas</button>
      </div>
      <div id="usersList"><div class="loading">Memuat…</div></div>
    `;
    await loadUsers();
  }

  async function loadUsers() {
    try {
      const data = await App.api('/api/users');
      const el = document.getElementById('usersList');
      if (!data.users.length) {
        el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${Icon.i('users')}</div><h3>Belum ada petugas</h3></div>`;
        return;
      }
      const supersActive = data.users.filter(x => x.role === 'superadmin' && x.is_active).length;
      el.innerHTML = data.users.map(u => `
        <div class="admin-card">
          <div class="admin-card-avatar">${App.initials(u.nama)}</div>
          <div class="admin-card-info">
            <h4>${App.escapeHtml(u.nama)}</h4>
            <p>@${App.escapeHtml(u.username)} &middot; <span class="role-badge ${u.role}">${u.role === 'superadmin' ? 'Superadmin' : 'Petugas'}</span> &middot; <span class="status-badge ${u.is_active ? 'active' : 'inactive'}">${u.is_active ? 'Aktif' : 'Nonaktif'}</span> &middot; ${u.jumlah_data} data</p>
            ${(u.jabatan || u.kelurahan || u.hp) ? `<p class="text-muted" style="font-size:12.5px;">${[u.jabatan ? App.escapeHtml(u.jabatan) : '', u.kelurahan ? 'Kel. ' + App.escapeHtml(u.kelurahan) : '', u.hp ? App.escapeHtml(u.hp) : ''].filter(Boolean).join(' &middot; ')}</p>` : ''}
          </div>
          <div class="admin-card-actions">
            <button class="btn-icon" onclick="Admin.showEditUser(${u.id})" title="Edit" aria-label="Edit">${Icon.i('pencil')}</button>
            ${(u.role !== 'superadmin' || supersActive > 1) && u.id !== Auth.getUser().id ? `<button class="btn-icon is-danger" onclick="Admin.deleteUser(${u.id},'${App.escapeHtml(u.nama)}')" title="Hapus" aria-label="Hapus">${Icon.i('trash')}</button>` : ''}
          </div>
        </div>
      `).join('');
    } catch (e) {
      document.getElementById('usersList').innerHTML = `<p class="text-danger">${App.escapeHtml(e.message)}</p>`;
    }
  }

  function showAddUser() {
    showUserModal(null);
  }

  async function showEditUser(id) {
    try {
      const data = await App.api('/api/users');
      const user = data.users.find(u => u.id === id);
      if (!user) throw new Error('Petugas tidak ditemukan');
      showUserModal(user);
    } catch (e) {
      Toast.error(e.message);
    }
  }

  async function showUserModal(user) {
    const isEdit = !!user;
    const meta = await App.fetchMeta();
    const kelOpts = (meta.enums.kelurahan || []).map(k => `<option value="${App.escapeHtml(k)}" ${isEdit && user.kelurahan === k ? 'selected' : ''}>${App.escapeHtml(k)}</option>`).join('');
    const jabOpts = (meta.enums.jabatan || []).map(k => `<option value="${App.escapeHtml(k)}" ${isEdit && user.jabatan === k ? 'selected' : ''}>${App.escapeHtml(k)}</option>`).join('');
    const html = `
      <form id="userForm">
        <div class="form-group">
          <label>Username ${!isEdit ? '<span class="required">*</span>' : ''}</label>
          <input type="text" name="username" value="${isEdit ? App.escapeHtml(user.username) : ''}" ${isEdit ? 'disabled' : 'required'} placeholder="huruf kecil, angka, titik, strip" autocomplete="off">
          <div class="hint">3-32 karakter. Tidak dapat diubah setelah dibuat.</div>
        </div>
        <div class="form-group">
          <label>Nama Lengkap <span class="required">*</span></label>
          <input type="text" name="nama" value="${isEdit ? App.escapeHtml(user.nama) : ''}" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Kelurahan Tugas</label>
            <select name="kelurahan"><option value="">-- Pilih --</option>${kelOpts}</select>
          </div>
          <div class="form-group">
            <label>Jabatan</label>
            <select name="jabatan"><option value="">-- Pilih --</option>${jabOpts}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Nomor HP</label>
            <input type="tel" name="hp" value="${isEdit && user.hp ? App.escapeHtml(user.hp) : ''}" placeholder="08xxxxxxxxxx (opsional)">
          </div>
          <div class="form-group">
            <label>Role <span class="required">*</span></label>
            <select name="role" required>
              <option value="admin" ${isEdit && user.role === 'admin' ? 'selected' : ''}>Petugas (Admin)</option>
              <option value="superadmin" ${isEdit && user.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Password ${isEdit ? '(kosongkan jika tidak ingin mengubah)' : '<span class="required">*</span>'}</label>
          <input type="password" name="password" ${!isEdit ? 'required' : ''} minlength="8" autocomplete="new-password">
          ${isEdit ? '<div class="hint">Mengubah password akan memaksa user login ulang dan mereset password.</div>' : ''}
        </div>
        ${isEdit ? `
        <div class="form-group">
          <label>Status Akun</label>
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
    Modal.open(html, {
      title: isEdit ? 'Edit Petugas' : 'Tambah Petugas Baru',
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
            kelurahan: fd.get('kelurahan'),
            jabatan: fd.get('jabatan'),
            hp: fd.get('hp'),
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
            Toast.success(isEdit ? 'Data petugas berhasil diperbarui.' : 'Petugas baru berhasil ditambahkan.');
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
    Modal.confirm('Hapus Petugas', `Hapus akun "${nama}"? Akun ini tidak boleh memiliki data usaha.`, async () => {
      try {
        await App.api(`/api/users/${id}`, { method: 'DELETE' });
        Toast.success('Akun berhasil dihapus.');
        await loadUsers();
      } catch (e) {
        Toast.error(e.message);
      }
    });
  }

  return { renderUsers, showAddUser, showEditUser, deleteUser };
})();

window.Admin = Admin;
