const $ = (id) => document.getElementById(id);

let allTasks = [];
let lastTaskKey = null;
let allowIgnore = false;

function showBanner(msg) {
  const b = $('banner');
  b.textContent = msg;
  b.style.display = 'block';
}
function hideBanner() { $('banner').style.display = 'none'; }

function render() {
  const filter = $('filter').value.trim().toLowerCase();
  const list = $('taskList');
  const filtered = allTasks.filter((t) => {
    if (!filter) return true;
    return t.key.toLowerCase().includes(filter) || (t.summary || '').toLowerCase().includes(filter);
  });
  if (!filtered.length) {
    list.innerHTML = '<div class="empty">Nessun task. Premi "Aggiorna".</div>';
    return;
  }
  // put last-used task first
  filtered.sort((a, b) => {
    if (a.key === lastTaskKey) return -1;
    if (b.key === lastTaskKey) return 1;
    return 0;
  });
  list.innerHTML = filtered
    .map((t) => `
      <div class="task-item ${t.key === lastTaskKey ? 'last-used' : ''}" data-key="${t.key}">
        <div class="key">${escapeHtml(t.key)}${t.key === lastTaskKey ? ' · ultimo usato' : ''}</div>
        <div class="summary">${escapeHtml(t.summary || '')}</div>
        <div class="status">${escapeHtml(t.status || '')}</div>
      </div>`)
    .join('');
  list.querySelectorAll('.task-item').forEach((el) => {
    el.addEventListener('click', () => choose(el.dataset.key));
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function load() {
  const ctx = await window.api.popup.getContext();
  allTasks = ctx.tasks || [];
  lastTaskKey = ctx.lastTaskKey || null;
  allowIgnore = ctx.allowIgnore;
  $('btnIgnore').disabled = !allowIgnore;
  $('ctx').textContent = `Intervallo: ${ctx.intervalMinutes} min · Task in cache: ${allTasks.length}`;
  if (!allTasks.length) {
    await refresh();
  } else {
    render();
  }
}

async function refresh() {
  hideBanner();
  $('btnRefresh').disabled = true;
  $('btnRefresh').textContent = 'Aggiorno...';
  const res = await window.api.popup.refreshTasks();
  $('btnRefresh').disabled = false;
  $('btnRefresh').textContent = 'Aggiorna';
  if (!res.ok) {
    showBanner(`Errore aggiornamento task: ${res.error}`);
    return;
  }
  allTasks = res.tasks || [];
  render();
}

async function choose(key) { await window.api.popup.chooseTask(key); }
async function ignore() { if (allowIgnore) await window.api.popup.ignore(); }
async function skip() { await window.api.popup.skip(); }

$('filter').addEventListener('input', render);
$('btnRefresh').addEventListener('click', refresh);
$('btnIgnore').addEventListener('click', ignore);
$('btnSkip').addEventListener('click', skip);

load();
