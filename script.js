const TOTAL = 284;
const KEY = 'striver_a2z_v4';
const LEGACY_KEY = 'striver_a2z_v3';

let activeF = 'all';

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

function readSavedDoneIds() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(saved) ? new Set(saved) : new Set();
  } catch {
    return new Set();
  }
}

function readLegacyDoneIndexes() {
  try {
    const saved = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveDoneState() {
  const doneIds = getRows()
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.querySelector('.done-cb')?.checked)
    .map(({ row, index }) => getProblemId(row, index));

  localStorage.setItem(KEY, JSON.stringify(doneIds));
}

function loadDoneState() {
  const savedIds = readSavedDoneIds();
  const legacyDone = readLegacyDoneIndexes();

  getRows().forEach((row, index) => {
    const cb = row.querySelector('.done-cb');
    if (!cb) return;

    cb.checked = savedIds.has(getProblemId(row, index)) || Boolean(legacyDone[index]);
  });

  saveDoneState();
}

function upd() {
  const cbs = getCbs();
  const done = cbs.filter(c => c.checked).length;
  const pct = Math.round(done / TOTAL * 100);

  document.getElementById('pFill').style.width = pct + '%';
  document.getElementById('pctLbl').textContent = pct + '%';
  document.getElementById('sDone').textContent = done;

  saveDoneState();
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

window.upd = upd;
window.setF = setF;
window.filterAll = filterAll;
window.go = go;

window.addEventListener('DOMContentLoaded', () => {
  loadDoneState();
  upd();

  getCbs().forEach(cb => cb.addEventListener('change', upd));

  const main = document.getElementById('main');
  main.addEventListener('scroll', () => {
    document.getElementById('scrollBtn').classList.toggle('vis', main.scrollTop > 300);
  });
});
