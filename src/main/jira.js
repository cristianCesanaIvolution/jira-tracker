const axios = require('axios');
const db = require('./db');

function getClient() {
  const baseURL = db.getConfig('jira_base_url');
  const email = db.getConfig('jira_email');
  const token = db.getConfig('jira_api_token');
  if (!baseURL || !email || !token) {
    throw new Error('Jira credentials not configured');
  }
  const normalizedBase = baseURL.startsWith('http') ? baseURL : `https://${baseURL}`;
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  return axios.create({
    baseURL: normalizedBase.replace(/\/$/, ''),
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
}

async function validateCredentials({ baseUrl, email, token }) {
  const normalizedBase = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const res = await axios.get(`${normalizedBase.replace(/\/$/, '')}/rest/api/3/myself`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    timeout: 15000,
  });
  return { accountId: res.data.accountId, displayName: res.data.displayName, emailAddress: res.data.emailAddress };
}

async function fetchAssignedOpenTasks() {
  const client = getClient();
  const jql = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC';
  const fields = ['summary', 'status'];
  const tasks = [];
  let nextPageToken;
  do {
    const res = await client.post('/rest/api/3/search/jql', {
      jql,
      fields,
      maxResults: 100,
      nextPageToken,
    });
    const issues = res.data.issues || [];
    for (const issue of issues) {
      tasks.push({
        key: issue.key,
        summary: issue.fields?.summary || '',
        status: issue.fields?.status?.name || '',
      });
    }
    nextPageToken = res.data.nextPageToken;
  } while (nextPageToken);
  return tasks;
}

function toJiraStarted(timestampMs) {
  const d = new Date(timestampMs);
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const tzMin = -d.getTimezoneOffset();
  const sign = tzMin >= 0 ? '+' : '-';
  const tzH = pad(Math.floor(Math.abs(tzMin) / 60));
  const tzM = pad(Math.abs(tzMin) % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${sign}${tzH}${tzM}`
  );
}

async function postWorklog({ taskKey, startedMs, durationMinutes, comment }) {
  const client = getClient();
  const body = {
    started: toJiraStarted(startedMs),
    timeSpentSeconds: Math.max(60, Math.round(durationMinutes * 60)),
  };
  if (comment && comment.trim()) {
    body.comment = {
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: comment }] }],
    };
  }
  const res = await client.post(`/rest/api/3/issue/${encodeURIComponent(taskKey)}/worklog`, body);
  return res.data; // contains id
}

module.exports = {
  validateCredentials,
  fetchAssignedOpenTasks,
  postWorklog,
};
