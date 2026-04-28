// Group consecutive non-skip entries on the same task.
// Skips do NOT break consecutivity; they are simply excluded from the duration.
// A different task between two same-task entries DOES break consecutivity.
function aggregateEntries(entries) {
  const groups = [];
  let current = null;
  let lastNonSkipTask = null;

  for (const e of entries) {
    if (e.is_skip) {
      // skip does not break consecutivity, just ignore
      continue;
    }
    if (current && e.task_key === lastNonSkipTask) {
      current.entry_ids.push(e.id);
      current.end_time = e.end_time;
      current.duration_minutes += e.duration_minutes;
      if (e.comment) {
        current.comments.push(e.comment);
      }
      current.synced = current.synced && !!e.synced_to_jira;
      if (e.synced_to_jira) current.has_synced_member = true;
    } else {
      if (current) groups.push(current);
      current = {
        task_key: e.task_key,
        start_time: e.start_time,
        end_time: e.end_time,
        duration_minutes: e.duration_minutes,
        entry_ids: [e.id],
        comments: e.comment ? [e.comment] : [],
        synced: !!e.synced_to_jira,
        has_synced_member: !!e.synced_to_jira,
      };
    }
    lastNonSkipTask = e.task_key;
  }
  if (current) groups.push(current);
  return groups;
}

module.exports = { aggregateEntries };
