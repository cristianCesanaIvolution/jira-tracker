const $ = (id) => document.getElementById(id);

let lastData = { entries: [], groups: [] };
let nextInfo = null;

function showBanner(kind, msg) {
  const b = $('banner');
  b.className = `banner ${kind}`;
  b.textContent = msg;
  b.style.display = 'block';
  setTimeout(() => { b.style.display = 'none'; }, 4000);
}

function getRange(period) {
  const now = new Date();
  const end = now.getTime();
  let start;
  if (period === 'today') {
    const d = new Date(now); d.setHours(0,0,0,0);
    start = d.getTime();
  } else if (period === 'week') {
    const d = new Date(now); d.setHours(0,0,0,0);
    const day = (d.getDay() + 6) % 7; // Monday=0
    d.setDate(d.getDate() - day);
    start = d.getTime();
  } else if (period === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    start = d.getTime();
  } else {
    start = 0;
  }
  return { from: start, to: end };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtMin(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

async function refreshNextInfo() {
  try {
    nextInfo = await window.api.dashboard.getNextPromptInfo();
  } catch (_) {
    nextInfo = null;
  }
  tickCountdown();
}

function tickCountdown() {
  const el = document.getElementById('nextPromptInfo');
  if (!el) return;
  if (!nextInfo) { el.textContent = 'Prossimo popup: —'; return; }
  if (!nextInfo.configured) { el.textContent = 'Configura le credenziali Jira'; return; }
  if (nextInfo.nextFireTs == null) { el.textContent = 'Popup in corso...'; return; }
  const remaining = nextInfo.nextFireTs - Date.now();
  if (remaining <= 0) { el.textContent = `Popup imminente... (intervallo ${nextInfo.intervalMinutes}m)`; return; }
  el.textContent = `Prossimo popup tra ${formatRemaining(remaining)} (intervallo ${nextInfo.intervalMinutes}m)`;
}

function fmtTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function load() {
  const { from, to } = getRange($('period').value);
  const res = await window.api.dashboard.getAggregated(from, to);
  lastData = res;
  renderSummary();
  renderByTask();
  renderGroups();
  await refreshNextInfo();
}

function renderSummary() {
  let total = 0, pending = 0, synced = 0;
  for (const g of lastData.groups) {
    total += g.duration_minutes;
    if (g.synced) synced += g.duration_minutes;
    else pending += g.duration_minutes;
  }
  $('sumTotal').textContent = fmtMin(total);
  $('sumPending').textContent = fmtMin(pending);
  $('sumSynced').textContent = fmtMin(synced);
}

function renderByTask() {
  const map = new Map();
  for (const g of lastData.groups) {
    const k = g.task_key || '(skip)';
    if (!map.has(k)) map.set(k, { total: 0, synced: 0, pending: 0, summary: g.summary || '' });
    const m = map.get(k);
    if (!m.summary && g.summary) m.summary = g.summary;
    m.total += g.duration_minutes;
    if (g.synced) m.synced += g.duration_minutes;
    else m.pending += g.duration_minutes;
  }
  const rows = Array.from(map.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([k, v]) => `
      <tr>
        <td>${escapeHtml(k)}</td>
        <td>${escapeHtml(v.summary)}</td>
        <td class="duration">${fmtMin(v.total)}</td>
        <td class="duration">${fmtMin(v.synced)}</td>
        <td class="duration">${fmtMin(v.pending)}</td>
      </tr>`).join('');
  $('tblByTask').querySelector('tbody').innerHTML = rows || '<tr><td colspan="5" class="empty">Nessun dato.</td></tr>';
}

function renderGroups() {
  const tbody = $('tblGroups').querySelector('tbody');
  if (!lastData.groups.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">Nessun worklog.</td></tr>';
    return;
  }
  tbody.innerHTML = lastData.groups.map((g, idx) => {
    const comment = g.comments.filter(Boolean).join(' / ');
    const statusBadge = g.synced
      ? '<span class="badge synced">Sincronizzato</span>'
      : '<span class="badge pending">Da sincronizzare</span>';
    return `
      <tr data-idx="${idx}">
        <td>${escapeHtml(fmtTime(g.start_time))}</td>
        <td><strong>${escapeHtml(g.task_key)}</strong></td>
        <td>${escapeHtml(g.summary || '')}</td>
        <td>
          <input type="number" min="0.01" step="0.25" class="duration-input" data-field="duration"
                 value="${(g.duration_minutes / 60).toFixed(2)}" ${g.synced ? 'disabled' : ''} />
        </td>
        <td>
          <input type="text" class="comment-input" data-field="comment"
                 value="${escapeHtml(comment)}" placeholder="Commento (opzionale)" ${g.synced ? 'disabled' : ''} />
        </td>
        <td>${statusBadge}</td>
        <td class="actions">
          <button class="primary btn-sync" ${g.synced ? 'disabled' : ''}>Registra</button>
          <button class="btn-delete" ${g.synced ? 'disabled' : ''} title="Elimina">Elimina</button>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('tr').forEach((tr) => {
    const idx = parseInt(tr.dataset.idx, 10);
    tr.querySelector('.btn-sync')?.addEventListener('click', () => syncRow(idx, tr));
    tr.querySelector('.btn-delete')?.addEventListener('click', () => deleteRow(idx));
  });
}

async function deleteRow(idx) {
  const g = lastData.groups[idx];
  if (!g || g.synced) return;
  const label = g.task_key || '(skip)';
  const dur = fmtMin(g.duration_minutes);
  if (!confirm(`Eliminare l'entry ${label} (${dur}) del ${fmtTime(g.start_time)}?`)) return;
  const res = await window.api.dashboard.deleteGroup(g.entry_ids);
  if (res.ok) {
    showBanner('success', `Entry ${label} eliminata.`);
    await load();
  } else {
    showBanner('error', `Errore eliminazione: ${res.error || 'sconosciuto'}`);
  }
}

async function syncRow(idx, tr) {
  const g = lastData.groups[idx];
  if (!g || g.synced) return;
  const hours = parseFloat(tr.querySelector('input[data-field="duration"]').value);
  const duration = Number.isFinite(hours) && hours > 0
    ? Math.max(1, Math.round(hours * 60))
    : g.duration_minutes;
  const comment = tr.querySelector('input[data-field="comment"]').value;
  const btn = tr.querySelector('.btn-sync');
  btn.disabled = true;
  btn.textContent = 'Invio...';
  const payload = {
    task_key: g.task_key,
    start_time: g.start_time,
    duration_minutes: duration,
    comment,
    entry_ids: g.entry_ids,
  };
  const res = await window.api.dashboard.syncGroup(payload);
  if (res.ok) {
    showBanner('success', `${g.task_key}: registrato (${fmtMin(duration)})`);
    await load();
  } else {
    showBanner('error', `Errore su ${g.task_key}: ${res.error}`);
    btn.disabled = false;
    btn.textContent = 'Registra';
  }
}

async function syncAll() {
  const pending = lastData.groups
    .map((g, idx) => ({ g, idx }))
    .filter(({ g }) => !g.synced && g.task_key);
  if (!pending.length) return showBanner('info', 'Nessun worklog da registrare.');
  for (const { idx } of pending) {
    const tr = $('tblGroups').querySelector(`tr[data-idx="${idx}"]`);
    if (!tr) continue;
    await syncRow(idx, tr);
  }
}

$('period').addEventListener('change', load);
$('btnRefresh').addEventListener('click', load);
$('btnSyncAll').addEventListener('click', syncAll);

setInterval(tickCountdown, 1000);
setInterval(refreshNextInfo, 30000);

load();
