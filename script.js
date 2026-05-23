const TOTAL = 284;
const ACTIVE_USER_KEY = 'striver_a2z_active_user';
const LEGACY_BOOL_KEY = 'striver_a2z_v3';
const LEGACY_ID_KEY = 'striver_a2z_v4';

let activeF = 'all';
let activeUsername = '';
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
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.status = response.status;
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

async function login(username) {
  if (isLoggingIn) return;

  const cleanUsername = username.trim();
  const loginError = document.getElementById('loginError');
  const submitButton = document.querySelector('#loginForm button[type="submit"]');

  isLoggingIn = true;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Opening...';
  }

  loginError.textContent = '';

  const validationError = validateUsername(cleanUsername);
  if (validationError) {
    loginError.textContent = validationError;
    isLoggingIn = false;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Continue';
    }
    return;
  }

  let accountUsername = cleanUsername.toLowerCase();

  try {
    const user = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: cleanUsername })
    });
    accountUsername = user.username || accountUsername;
  } catch (error) {
    if (error.status && error.status < 500) {
      loginError.textContent = error.message;
      isLoggingIn = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Continue';
      }
      return;
    }
    setSyncState('MongoDB unavailable, using local progress');
  }

  activeUsername = accountUsername;
  localStorage.setItem(ACTIVE_USER_KEY, activeUsername);
  document.getElementById('activeUser').textContent = activeUsername;
  document.getElementById('loginScreen').classList.add('hidden');
  await loadUserProgress(activeUsername);

  isLoggingIn = false;
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = 'Continue';
  }
}

function logout() {
  activeUsername = '';
  localStorage.removeItem(ACTIVE_USER_KEY);
  document.getElementById('activeUser').textContent = 'Guest';
  document.getElementById('loginScreen').classList.remove('hidden');
  setSyncState('Waiting for login');
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
  const cbs = getCbs();
  const done = cbs.filter(c => c.checked).length;
  const pct = Math.round(done / TOTAL * 100);

  document.getElementById('pFill').style.width = `${pct}%`;
  document.getElementById('pctLbl').textContent = `${pct}%`;
  document.getElementById('sDone').textContent = done;

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

window.addEventListener('DOMContentLoaded', () => {
  updateStats(false);

  getCbs().forEach(cb => cb.addEventListener('change', () => updateStats()));

  document.getElementById('loginForm').addEventListener('submit', event => {
    event.preventDefault();
    login(document.getElementById('usernameInput').value);
  });

  document.getElementById('logoutBtn').addEventListener('click', logout);

  const main = document.getElementById('main');
  main.addEventListener('scroll', () => {
    document.getElementById('scrollBtn').classList.toggle('vis', main.scrollTop > 300);
  });

  const usernameFromUrl = new URLSearchParams(window.location.search).get('username');
  const rememberedUser = localStorage.getItem(ACTIVE_USER_KEY);
  const usernameToUse = usernameFromUrl || rememberedUser;

  if (usernameToUse) {
    document.getElementById('usernameInput').value = usernameToUse;
    login(usernameToUse);
  } else {
    document.getElementById('usernameInput').focus();
  }
});
