/* ========================================
   Auth Module
   ======================================== */

const Auth = (() => {
  let currentUser = null;

  async function login(username, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login gagal');
    currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(data.user));
    return data.user;
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    currentUser = null;
    localStorage.removeItem('user');
    window.location.href = '/';
  }

  async function me() {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) throw new Error('Sesi berakhir');
      const data = await res.json();
      currentUser = data.user;
      localStorage.setItem('user', JSON.stringify(data.user));
      return data.user;
    } catch {
      currentUser = null;
      localStorage.removeItem('user');
      return null;
    }
  }

  async function changePassword(current, next) {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current, next }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengubah password');
    return data;
  }

  function getUser() {
    return currentUser || JSON.parse(localStorage.getItem('user') || 'null');
  }

  function isSuperadmin() {
    const u = getUser();
    return u && u.role === 'superadmin';
  }

  function requireAuth() {
    const u = getUser();
    if (!u) {
      window.location.href = '/';
      return false;
    }
    return true;
  }

  // Login form handler
  function initLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;
    const errorBox = document.getElementById('errorBox');
    const submitBtn = document.getElementById('submitBtn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.textContent = '';
      const btnText = submitBtn.querySelector('.btn-text');
      const btnLoader = submitBtn.querySelector('.btn-loader');
      submitBtn.disabled = true;
      btnText.style.display = 'none';
      btnLoader.style.display = 'inline';

      try {
        const user = await login(form.username.value.trim(), form.password.value);
        window.location.href = '/dashboard.html';
      } catch (err) {
        errorBox.textContent = err.message;
      } finally {
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
      }
    });
  }

  return { login, logout, me, changePassword, getUser, isSuperadmin, requireAuth, initLoginForm };
})();

// Auto-init login form
if (document.getElementById('loginForm')) {
  Auth.initLoginForm();
}
