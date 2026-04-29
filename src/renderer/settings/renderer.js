const $ = (id) => document.getElementById(id);

function showBanner(kind, msg) {
  const b = $('banner');
  b.className = `banner ${kind}`;
  b.textContent = msg;
  b.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideBanner() {
  $('banner').style.display = 'none';
}

function readForm() {
  return {
    jira_base_url: $('jira_base_url').value.trim(),
    jira_email: $('jira_email').value.trim(),
    jira_api_token: $('jira_api_token').value.trim(),
    tempo_token: $('tempo_token').value.trim(),
  };
}

async function load() {
  const cfg = await window.api.getConfig();
  $('jira_base_url').value = cfg.jira_base_url || '';
  $('jira_email').value = cfg.jira_email || '';
  $('jira_api_token').value = cfg.jira_api_token || '';
  $('tempo_token').value = cfg.tempo_token || '';

  const interval = await window.api.getInterval();
  $('interval').value = interval;

  const autostart = await window.api.getAutostart();
  $('autostart').checked = !!autostart;
}

$('btnValidate').addEventListener('click', async () => {
  hideBanner();
  const cfg = readForm();
  if (!cfg.jira_base_url || !cfg.jira_email || !cfg.jira_api_token) {
    return showBanner('error', 'Compila URL workspace, email e API token.');
  }
  const res = await window.api.validateCredentials(cfg);
  if (res.ok) showBanner('success', `Connesso come ${res.info.displayName} (${res.info.emailAddress}).`);
  else showBanner('error', `Errore: ${res.error}`);
});

$('btnSave').addEventListener('click', async () => {
  hideBanner();
  const cfg = readForm();
  await window.api.saveConfig(cfg);
  await window.api.setInterval(parseInt($('interval').value, 10) || 30);
  await window.api.setAutostart($('autostart').checked);
  showBanner('success', 'Impostazioni salvate.');
});

$('btnClose').addEventListener('click', () => window.close());

load();
