const db = require('./db');
const jira = require('./jira');

const DEFAULT_INTERVAL_MIN = 30;
const MIN_INTERVAL_MIN = 1;

let timerHandle = null;
let onPromptCb = null;
let lastPromptTs = null;

function getIntervalMinutes() {
  const v = parseInt(db.getConfig('prompt_interval_minutes', String(DEFAULT_INTERVAL_MIN)), 10);
  if (isNaN(v) || v < MIN_INTERVAL_MIN) return DEFAULT_INTERVAL_MIN;
  return v;
}

function setIntervalMinutes(min) {
  const v = Math.max(MIN_INTERVAL_MIN, parseInt(min, 10) || DEFAULT_INTERVAL_MIN);
  db.setConfig('prompt_interval_minutes', String(v));
  reschedule();
  return v;
}

function isConfigured() {
  return !!(db.getConfig('jira_base_url') && db.getConfig('jira_email') && db.getConfig('jira_api_token'));
}

function start(onPrompt) {
  onPromptCb = onPrompt;
  // initialize lastPromptTs to "now" so the first interval is full-length
  lastPromptTs = Date.now();
  reschedule();
}

function reschedule() {
  if (timerHandle) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
  if (!isConfigured()) return;
  const intervalMs = getIntervalMinutes() * 60 * 1000;
  timerHandle = setTimeout(fire, intervalMs);
}

async function fire() {
  try {
    // refresh task cache just before prompting
    try {
      const tasks = await jira.fetchAssignedOpenTasks();
      db.replaceTasksCache(tasks);
    } catch (err) {
      db.logSync('warn', 'Failed to refresh tasks cache before prompt', { message: err.message });
    }
    if (onPromptCb) await onPromptCb();
  } catch (err) {
    db.logSync('error', 'Scheduler fire error', { message: err.message });
  } finally {
    reschedule();
  }
}

// Records a time entry for the just-completed interval.
// kind: 'task' | 'ignore' | 'skip'
// taskKey: required when kind === 'task'
function recordIntervalEnd({ kind, taskKey }) {
  const now = Date.now();
  const start = lastPromptTs || now;
  const durationMs = Math.max(0, now - start);
  const durationMinutes = Math.round(durationMs / 60000);
  lastPromptTs = now;

  if (durationMinutes <= 0) return null;

  if (kind === 'skip') {
    db.insertTimeEntry({
      task_key: null,
      start_time: start,
      end_time: now,
      duration_minutes: durationMinutes,
      comment: null,
      is_skip: true,
    });
    return { skipped: true, durationMinutes };
  }

  let key = taskKey;
  if (kind === 'ignore') {
    const last = db.getLastNonSkipEntry();
    if (!last || !last.task_key) {
      // fall back to skip if no last task
      db.insertTimeEntry({
        task_key: null,
        start_time: start,
        end_time: now,
        duration_minutes: durationMinutes,
        comment: null,
        is_skip: true,
      });
      return { skipped: true, fallback: 'no-last-task', durationMinutes };
    }
    key = last.task_key;
  }

  if (!key) return null;

  db.insertTimeEntry({
    task_key: key,
    start_time: start,
    end_time: now,
    duration_minutes: durationMinutes,
    comment: null,
    is_skip: false,
  });
  return { taskKey: key, durationMinutes };
}

async function forcePrompt() {
  if (!isConfigured()) return;
  if (timerHandle) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }
  await fire();
}

function hasLastTask() {
  const last = db.getLastNonSkipEntry();
  return !!(last && last.task_key);
}

function getLastPromptTs() {
  return lastPromptTs;
}

module.exports = {
  start,
  reschedule,
  getIntervalMinutes,
  setIntervalMinutes,
  recordIntervalEnd,
  forcePrompt,
  hasLastTask,
  isConfigured,
  getLastPromptTs,
};
