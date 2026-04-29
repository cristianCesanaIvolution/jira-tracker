const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const Database = require('better-sqlite3');

let db;

function getDbPath() {
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'jira-tracker.db');
}

function init() {
  if (db) return db;
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks_cache (
      key TEXT PRIMARY KEY,
      summary TEXT,
      status TEXT,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_key TEXT,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      comment TEXT,
      is_skip INTEGER NOT NULL DEFAULT 0,
      synced_to_jira INTEGER NOT NULL DEFAULT 0,
      jira_worklog_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_time_entries_start ON time_entries(start_time);
    CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_key);

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      level TEXT,
      message TEXT,
      detail TEXT
    );
  `);

  return db;
}

function getConfig(key, fallback = null) {
  const row = init().prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setConfig(key, value) {
  init()
    .prepare('INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, value == null ? null : String(value));
}

function deleteConfig(key) {
  init().prepare('DELETE FROM config WHERE key=?').run(key);
}

function getAllConfig() {
  const rows = init().prepare('SELECT key,value FROM config').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function replaceTasksCache(tasks) {
  const d = init();
  const now = Date.now();
  const tx = d.transaction((items) => {
    d.prepare('DELETE FROM tasks_cache').run();
    const stmt = d.prepare('INSERT INTO tasks_cache(key,summary,status,updated_at) VALUES(?,?,?,?)');
    for (const t of items) stmt.run(t.key, t.summary, t.status, now);
  });
  tx(tasks);
}

function getTasksCache() {
  return init().prepare('SELECT key,summary,status,updated_at FROM tasks_cache ORDER BY key').all();
}

function insertTimeEntry(entry) {
  const stmt = init().prepare(`
    INSERT INTO time_entries(task_key,start_time,end_time,duration_minutes,comment,is_skip,synced_to_jira,jira_worklog_id)
    VALUES(@task_key,@start_time,@end_time,@duration_minutes,@comment,@is_skip,0,NULL)
  `);
  const info = stmt.run({
    task_key: entry.task_key,
    start_time: entry.start_time,
    end_time: entry.end_time,
    duration_minutes: entry.duration_minutes,
    comment: entry.comment || null,
    is_skip: entry.is_skip ? 1 : 0,
  });
  return info.lastInsertRowid;
}

function getTimeEntries({ from, to } = {}) {
  let sql = 'SELECT * FROM time_entries';
  const where = [];
  const params = {};
  if (from) { where.push('start_time >= @from'); params.from = from; }
  if (to)   { where.push('start_time <= @to');   params.to   = to;   }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY start_time ASC';
  return init().prepare(sql).all(params);
}

function getLastNonSkipEntry() {
  return init()
    .prepare('SELECT * FROM time_entries WHERE is_skip=0 ORDER BY start_time DESC LIMIT 1')
    .get();
}

function getLastEntry() {
  return init()
    .prepare('SELECT * FROM time_entries ORDER BY start_time DESC LIMIT 1')
    .get();
}

function markEntrySynced(id, worklogId) {
  init()
    .prepare('UPDATE time_entries SET synced_to_jira=1, jira_worklog_id=? WHERE id=?')
    .run(worklogId, id);
}

function updateEntry(id, fields) {
  const allowed = ['comment', 'duration_minutes'];
  const sets = [];
  const params = { id };
  for (const k of allowed) {
    if (k in fields) {
      sets.push(`${k}=@${k}`);
      params[k] = fields[k];
    }
  }
  if (!sets.length) return;
  init().prepare(`UPDATE time_entries SET ${sets.join(',')} WHERE id=@id`).run(params);
}

function deleteEntries(ids) {
  if (!ids || !ids.length) return 0;
  const d = init();
  const placeholders = ids.map(() => '?').join(',');
  const info = d
    .prepare(`DELETE FROM time_entries WHERE synced_to_jira=0 AND id IN (${placeholders})`)
    .run(...ids);
  return info.changes;
}

function logSync(level, message, detail) {
  init()
    .prepare('INSERT INTO sync_log(ts,level,message,detail) VALUES(?,?,?,?)')
    .run(Date.now(), level, message, detail ? JSON.stringify(detail) : null);
}

module.exports = {
  init,
  getConfig,
  setConfig,
  deleteConfig,
  getAllConfig,
  replaceTasksCache,
  getTasksCache,
  insertTimeEntry,
  getTimeEntries,
  getLastNonSkipEntry,
  getLastEntry,
  markEntrySynced,
  updateEntry,
  deleteEntries,
  logSync,
};
