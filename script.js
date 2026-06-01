const TOTAL = 475;
const ACTIVE_USER_KEY = 'striver_a2z_active_user';
const AUTH_TOKEN_KEY = 'striver_a2z_auth_token';
const LEGACY_BOOL_KEY = 'striver_a2z_v3';
const LEGACY_ID_KEY = 'striver_a2z_v4';

let activeF = 'all';
let activeUsername = '';
let authToken = '';
let saveTimer = null;
let isApplyingRemoteState = false;
let isLoggingIn = false;

function getRows() {
  return [...document.querySelectorAll('.prob-row')];
}

function getCbs() {
  return [...document.querySelectorAll('.done-cb')];
}

function getProblemId(row, index) {
  const num = row.querySelector('.pnum')?.textContent?.trim() || String(index + 1);
  const link = row.querySelector('.pname a')?.href || '';
  return `${num}|${link}`;
}

function getDoneIds() {
  return getRows()
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.querySelector('.done-cb')?.checked)
    .map(({ row, index }) => getProblemId(row, index));
}

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function readLocalDoneIds(username) {
  const userIds = readJson(`striver_a2z_done_${username}`, []);
  if (Array.isArray(userIds) && userIds.length) return new Set(userIds);

  const legacyIds = readJson(LEGACY_ID_KEY, []);
  if (Array.isArray(legacyIds) && legacyIds.length) return new Set(legacyIds);

  const legacyBools = readJson(LEGACY_BOOL_KEY, []);
  const rows = getRows();
  return new Set(
    Array.isArray(legacyBools)
      ? legacyBools
          .map((checked, index) => checked ? getProblemId(rows[index], index) : null)
          .filter(Boolean)
      : []
  );
}

function writeLocalDoneIds(username, doneIds) {
  if (!username) return;
  localStorage.setItem(`striver_a2z_done_${username}`, JSON.stringify(doneIds));
}

function applyDoneIds(doneIds) {
  const saved = new Set(doneIds);

  isApplyingRemoteState = true;
  getRows().forEach((row, index) => {
    const cb = row.querySelector('.done-cb');
    if (cb) cb.checked = saved.has(getProblemId(row, index));
  });
  isApplyingRemoteState = false;

  updateStats(false);
}

function setSyncState(text) {
  const el = document.getElementById('syncState');
  if (el) el.textContent = text;
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  
  // Attach auth token if available
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(path, {
    headers,
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function validateUsername(username) {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return 'Username is required.';
  if (normalized.length > 40) return 'Username must be 40 characters or fewer.';
  if (!/^[a-z0-9_-]+$/.test(normalized)) {
    return 'Use only letters, numbers, underscores, or hyphens.';
  }
  return '';
}

function validatePassword(password) {
  if (!password) return 'Password is required.';
  if (password.length < 6) return 'Password must be at least 6 characters.';
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
  return '';
}

// ── Tab Switching ──
let migrateUsername = '';

function switchAuthTab(tab) {
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const migrateForm = document.getElementById('migrateForm');
  const authTabs = document.getElementById('authTabs');

  // Clear errors
  document.getElementById('loginError').textContent = '';
  document.getElementById('registerError').textContent = '';
  document.getElementById('registerSuccess').textContent = '';
  document.getElementById('migrateError').textContent = '';

  // Hide all forms
  loginForm.classList.remove('active');
  registerForm.classList.remove('active');
  migrateForm.classList.remove('active');
  loginTab.classList.remove('active');
  registerTab.classList.remove('active');

  if (tab === 'migrate') {
    // Hide tabs, show migrate form
    authTabs.style.display = 'none';
    migrateForm.classList.add('active');
  } else {
    authTabs.style.display = 'flex';
    if (tab === 'register') {
      registerTab.classList.add('active');
      registerForm.classList.add('active');
    } else {
      loginTab.classList.add('active');
      loginForm.classList.add('active');
    }
  }
}

// ── Password Strength Meter ──
function updatePasswordStrength(password, fillId) {
  const fill = document.getElementById(fillId || 'pwStrengthFill');
  if (!fill) return;

  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  const pct = Math.min(score / 5 * 100, 100);
  const colors = ['#ff6b6b', '#ff9800', '#ffd740', '#00e676', '#00e676'];
  const colorIndex = Math.max(0, Math.min(score - 1, colors.length - 1));

  fill.style.width = password.length === 0 ? '0%' : `${pct}%`;
  fill.style.background = password.length === 0 ? 'transparent' : colors[colorIndex];
}

async function loadUserProgress(username) {
  const localIds = [...readLocalDoneIds(username)];

  try {
    setSyncState('Loading saved progress...');
    const data = await api(`/api/users/${encodeURIComponent(username)}/progress`);
    const remoteIds = Array.isArray(data.completedProblemIds) ? data.completedProblemIds : [];
    const idsToApply = remoteIds.length ? remoteIds : localIds;

    applyDoneIds(idsToApply);
    writeLocalDoneIds(username, idsToApply);

    if (!remoteIds.length && localIds.length) {
      await saveProgressNow();
    } else {
      setSyncState(`Synced ${idsToApply.length}/${TOTAL} solved`);
    }
  } catch {
    applyDoneIds(localIds);
    setSyncState('MongoDB unavailable, using local progress');
  }
}

// ── Register ──
async function register(username, password, confirmPassword) {
  const registerError = document.getElementById('registerError');
  const registerSuccess = document.getElementById('registerSuccess');
  const submitButton = document.getElementById('registerBtn');

  registerError.textContent = '';
  registerSuccess.textContent = '';

  const usernameError = validateUsername(username);
  if (usernameError) {
    registerError.textContent = usernameError;
    return;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    registerError.textContent = passwordError;
    return;
  }

  if (password !== confirmPassword) {
    registerError.textContent = 'Passwords do not match.';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Creating...';

  try {
    const data = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    // Save token and login
    authToken = data.token;
    localStorage.setItem(AUTH_TOKEN_KEY, authToken);

    activeUsername = data.username;
    localStorage.setItem(ACTIVE_USER_KEY, activeUsername);
    document.getElementById('activeUser').textContent = activeUsername;
    document.getElementById('loginScreen').classList.add('hidden');

    applyDoneIds(data.completedProblemIds || []);
    setSyncState(`Synced ${(data.completedProblemIds || []).length}/${TOTAL} solved`);
  } catch (error) {
    registerError.textContent = error.message || 'Registration failed.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Create Account';
  }
}

// ── Login ──
async function login(username, password) {
  if (isLoggingIn) return;

  const loginError = document.getElementById('loginError');
  const submitButton = document.getElementById('loginBtn');

  isLoggingIn = true;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Logging in...';
  }

  loginError.textContent = '';

  const usernameError = validateUsername(username);
  if (usernameError) {
    loginError.textContent = usernameError;
    isLoggingIn = false;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Login';
    }
    return;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    loginError.textContent = passwordError;
    isLoggingIn = false;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Login';
    }
    return;
  }

  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    // Save token
    authToken = data.token;
    localStorage.setItem(AUTH_TOKEN_KEY, authToken);

    activeUsername = data.username;
    localStorage.setItem(ACTIVE_USER_KEY, activeUsername);
    document.getElementById('activeUser').textContent = activeUsername;
    document.getElementById('loginScreen').classList.add('hidden');
    await loadUserProgress(activeUsername);
  } catch (error) {
    // Check if this is a legacy user who needs migration
    if (error.status === 409 && error.data && error.data.needsMigration) {
      migrateUsername = error.data.username || username.trim().toLowerCase();
      document.getElementById('migrateUser').textContent = migrateUsername;
      switchAuthTab('migrate');
      isLoggingIn = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Login';
      }
      return;
    } else if (error.status && error.status < 500) {
      loginError.textContent = error.message;
    } else {
      loginError.textContent = 'Server error. Please try again.';
    }
  }

  isLoggingIn = false;
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = 'Login';
  }
}

// ── Migrate Legacy Account ──
async function migrateAccount(password, confirmPassword) {
  const migrateError = document.getElementById('migrateError');
  const submitButton = document.getElementById('migrateBtn');

  migrateError.textContent = '';

  const passwordError = validatePassword(password);
  if (passwordError) {
    migrateError.textContent = passwordError;
    return;
  }

  if (password !== confirmPassword) {
    migrateError.textContent = 'Passwords do not match.';
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Setting password...';

  try {
    const data = await api('/api/migrate', {
      method: 'POST',
      body: JSON.stringify({ username: migrateUsername, password })
    });

    // Save token and login
    authToken = data.token;
    localStorage.setItem(AUTH_TOKEN_KEY, authToken);

    activeUsername = data.username;
    localStorage.setItem(ACTIVE_USER_KEY, activeUsername);
    document.getElementById('activeUser').textContent = activeUsername;
    document.getElementById('loginScreen').classList.add('hidden');

    await loadUserProgress(activeUsername);
  } catch (error) {
    migrateError.textContent = error.message || 'Migration failed.';
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Set Password & Login';
  }
}

// ── Auto-login with saved token ──
async function tryAutoLogin() {
  const savedToken = localStorage.getItem(AUTH_TOKEN_KEY);
  const savedUsername = localStorage.getItem(ACTIVE_USER_KEY);

  if (!savedToken || !savedUsername) {
    return false;
  }

  authToken = savedToken;

  try {
    const data = await api('/api/me');
    activeUsername = data.username;
    document.getElementById('activeUser').textContent = activeUsername;
    document.getElementById('loginScreen').classList.add('hidden');
    await loadUserProgress(activeUsername);
    return true;
  } catch {
    // Token expired or invalid
    authToken = '';
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(ACTIVE_USER_KEY);
    return false;
  }
}

function logout() {
  activeUsername = '';
  authToken = '';
  localStorage.removeItem(ACTIVE_USER_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  document.getElementById('activeUser').textContent = 'Guest';
  document.getElementById('loginScreen').classList.remove('hidden');
  setSyncState('Waiting for login');

  // Reset forms
  document.getElementById('loginForm').reset();
  document.getElementById('registerForm').reset();
  document.getElementById('migrateForm').reset();
  document.getElementById('loginError').textContent = '';
  document.getElementById('registerError').textContent = '';
  document.getElementById('registerSuccess').textContent = '';
  document.getElementById('migrateError').textContent = '';
  migrateUsername = '';
  switchAuthTab('login');
}

async function saveProgressNow() {
  if (!activeUsername) return;

  const completedProblemIds = getDoneIds();
  writeLocalDoneIds(activeUsername, completedProblemIds);

  try {
    setSyncState('Saving...');
    await api(`/api/users/${encodeURIComponent(activeUsername)}/progress`, {
      method: 'PUT',
      body: JSON.stringify({ completedProblemIds })
    });
    setSyncState(`Synced ${completedProblemIds.length}/${TOTAL} solved`);
  } catch {
    setSyncState('MongoDB unavailable, saved locally');
  }
}

function scheduleSave() {
  if (isApplyingRemoteState) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveProgressNow, 350);
}

function updateStats(shouldSave = true) {
  const rows = getRows();
  const cbs = getCbs();
  const done = cbs.filter(c => c.checked).length;
  const pct = Math.round(done / TOTAL * 100);

  // Count by difficulty
  let easy = 0, medium = 0, hard = 0;
  rows.forEach(row => {
    const diff = row.dataset.d;
    if (diff === 'easy') easy++;
    else if (diff === 'medium') medium++;
    else if (diff === 'hard') hard++;
  });

  document.getElementById('pFill').style.width = `${pct}%`;
  document.getElementById('pctLbl').textContent = `${pct}%`;
  document.getElementById('sDone').textContent = done;
  document.getElementById('sEasy').textContent = easy;
  document.getElementById('sMed').textContent = medium;
  document.getElementById('sHard').textContent = hard;

  if (shouldSave) scheduleSave();
  filterAll();
}

function setF(f) {
  activeF = f;
  ['all', 'easy', 'medium', 'hard', 'done'].forEach(x => {
    document.getElementById('f' + x.charAt(0)).classList.toggle('active', x === f);
  });
  filterAll();
}

function filterAll() {
  const q = document.getElementById('srch').value.toLowerCase();

  getRows().forEach(row => {
    const name = row.querySelector('.pname').textContent.toLowerCase();
    const diff = row.dataset.d;
    const done = row.querySelector('.done-cb').checked;
    const matchQ = !q || name.includes(q);
    const matchF = activeF === 'all' ||
      (activeF === 'done' ? done : diff === activeF);

    row.style.display = matchQ && matchF ? '' : 'none';
  });
}

function go(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (window.event?.currentTarget) {
    window.event.currentTarget.classList.add('active');
  }
}

window.upd = updateStats;
window.setF = setF;
window.filterAll = filterAll;
window.go = go;
window.switchAuthTab = switchAuthTab;

window.addEventListener('DOMContentLoaded', async () => {
  updateStats(false);

  getCbs().forEach(cb => cb.addEventListener('change', () => updateStats()));

  // Login form
  document.getElementById('loginForm').addEventListener('submit', event => {
    event.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    login(username, password);
  });

  // Register form
  document.getElementById('registerForm').addEventListener('submit', event => {
    event.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirm').value;
    register(username, password, confirmPassword);
  });

  // Migrate form
  document.getElementById('migrateForm').addEventListener('submit', event => {
    event.preventDefault();
    const password = document.getElementById('migratePassword').value;
    const confirmPassword = document.getElementById('migrateConfirm').value;
    migrateAccount(password, confirmPassword);
  });

  // Password strength meters
  document.getElementById('regPassword').addEventListener('input', event => {
    updatePasswordStrength(event.target.value, 'pwStrengthFill');
  });
  document.getElementById('migratePassword').addEventListener('input', event => {
    updatePasswordStrength(event.target.value, 'migratePwStrengthFill');
  });

  document.getElementById('logoutBtn').addEventListener('click', logout);

  const main = document.getElementById('main');
  main.addEventListener('scroll', () => {
    document.getElementById('scrollBtn').classList.toggle('vis', main.scrollTop > 300);
  });

  // Try auto-login with saved token
  const loggedIn = await tryAutoLogin();
  if (!loggedIn) {
    document.getElementById('loginUsername').focus();
  }
});
