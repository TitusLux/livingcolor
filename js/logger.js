// Conversation logger — captures all events to localStorage for debugging.

const LOG_KEY = 'lc_chat_log';
const MAX_ENTRIES = 500;

function getLog() {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function saveLog(log) {
  try {
    if (log.length > MAX_ENTRIES) log = log.slice(-MAX_ENTRIES);
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch (e) { /* localStorage full */ }
}

export function log(category, event, data) {
  const entry = {
    ts: new Date().toISOString(),
    category,
    event,
    data: data === undefined ? null : data,
  };
  const allLogs = getLog();
  allLogs.push(entry);
  saveLog(allLogs);
  console.log('[' + category + ']', event, data !== undefined ? data : '');
}

export function getLogText() {
  const entries = getLog();
  return entries.map(e => {
    const t = e.ts.slice(11, 23);
    const d = e.data !== null ? ' ' + JSON.stringify(e.data) : '';
    return '[' + t + '] [' + e.category + '] ' + e.event + d;
  }).join('\n');
}

export function clearLog() {
  localStorage.removeItem(LOG_KEY);
}

export function downloadLog() {
  const text = getLogText();
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'livingcolor-log-' + Date.now() + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Expose globally for debugging from console
window.lcLog = { get: getLog, getText: getLogText, clear: clearLog, download: downloadLog };
