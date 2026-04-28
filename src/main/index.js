const { app, ipcMain, Notification } = require('electron');

const db = require('./db');
const jira = require('./jira');
const scheduler = require('./scheduler');
const windows = require('./windows');
const tray = require('./tray');
const autolaunch = require('./autolaunch');
const { aggregateEntries } = require('./aggregation');

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => windows.openDashboard());

  app.on('window-all-closed', (e) => {
    if (!app.isQuitting) e.preventDefault();
  });

  app.whenReady().then(async () => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.cristiancesana.jiratimetracker');
    }
    db.init();
    tray.build();
    registerIpc();

    if (!scheduler.isConfigured()) {
      windows.openSettings();
      notify('Configura le credenziali Jira per iniziare il tracking.');
    } else {
      scheduler.start(onScheduledPrompt);
    }
  });
}

function notify(body, title = 'Jira Time Tracker') {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  } catch (_) {
    /* ignore */
  }
}

async function onScheduledPrompt() {
  const allowIgnore = scheduler.hasLastTask();
  const result = await windows.openPopup({ allowIgnore });
  scheduler.recordIntervalEnd(result);
}

function registerIpc() {
  ipcMain.handle('config:get', () => db.getAllConfig());

  ipcMain.handle('config:save', async (_e, cfg) => {
    const fields = ['jira_base_url', 'jira_email', 'jira_api_token', 'tempo_token'];
    for (const k of fields) {
      if (k in cfg) {
        if (cfg[k] == null || cfg[k] === '') db.deleteConfig(k);
        else db.setConfig(k, cfg[k]);
      }
    }
    if (scheduler.isConfigured()) {
      scheduler.start(onScheduledPrompt);
    }
    return { ok: true };
  });

  ipcMain.handle('jira:validate', async (_e, cfg) => {
    try {
      const info = await jira.validateCredentials({
        baseUrl: cfg.jira_base_url,
        email: cfg.jira_email,
        token: cfg.jira_api_token,
      });
      return { ok: true, info };
    } catch (err) {
      return { ok: false, error: err.response?.data?.message || err.message };
    }
  });

  ipcMain.handle('scheduler:getInterval', () => scheduler.getIntervalMinutes());
  ipcMain.handle('scheduler:setInterval', (_e, min) => scheduler.setIntervalMinutes(min));

  ipcMain.handle('autostart:get', () => autolaunch.isEnabled());
  ipcMain.handle('autostart:set', (_e, enabled) => {
    autolaunch.setEnabled(enabled);
    return autolaunch.isEnabled();
  });

  ipcMain.handle('popup:getContext', () => ({
    tasks: db.getTasksCache(),
    allowIgnore: scheduler.hasLastTask(),
    lastTaskKey: db.getLastNonSkipEntry()?.task_key || null,
    intervalMinutes: scheduler.getIntervalMinutes(),
  }));

  ipcMain.handle('popup:refreshTasks', async () => {
    try {
      const tasks = await jira.fetchAssignedOpenTasks();
      db.replaceTasksCache(tasks);
      return { ok: true, tasks };
    } catch (err) {
      return { ok: false, error: err.response?.data?.message || err.message };
    }
  });

  ipcMain.handle('popup:chooseTask', (_e, key) => finishPopup({ kind: 'task', taskKey: key }));
  ipcMain.handle('popup:ignore', () => finishPopup({ kind: 'ignore' }));
  ipcMain.handle('popup:skip', () => finishPopup({ kind: 'skip' }));

  ipcMain.handle('entries:get', (_e, from, to) => db.getTimeEntries({ from, to }));
  ipcMain.handle('entries:getAggregated', (_e, from, to) => {
    const entries = db.getTimeEntries({ from, to });
    return { entries, groups: aggregateEntries(entries) };
  });
  ipcMain.handle('entries:update', (_e, id, fields) => {
    db.updateEntry(id, fields);
    return { ok: true };
  });
  ipcMain.handle('entries:syncGroup', async (_e, group) => {
    if (!group.task_key) return { ok: false, error: 'No task key' };
    try {
      const result = await jira.postWorklog({
        taskKey: group.task_key,
        startedMs: group.start_time,
        durationMinutes: group.duration_minutes,
        comment: group.comment,
      });
      const worklogId = result?.id || null;
      if (group.entry_ids && group.entry_ids.length) {
        for (const id of group.entry_ids) db.markEntrySynced(id, worklogId);
        if (group.comment != null) db.updateEntry(group.entry_ids[0], { comment: group.comment });
      }
      db.logSync('info', 'Worklog posted', {
        taskKey: group.task_key,
        worklogId,
        durationMinutes: group.duration_minutes,
      });
      return { ok: true, worklogId };
    } catch (err) {
      const errMsg = err.response?.data?.errorMessages?.join('; ') || err.message;
      db.logSync('error', 'Worklog post failed', { taskKey: group.task_key, error: errMsg });
      return { ok: false, error: errMsg };
    }
  });
}

function finishPopup(result) {
  const w = windows.getPopupWindow();
  if (w && w._finishPrompt) w._finishPrompt(result);
  return { ok: true };
}
