const fs = require('node:fs');
const path = require('node:path');
const { createPiEnvironmentLayout } = require('./piEnvironment.cjs');

const PRIMARY_SESSION_FILE = 'primary-session.json';

function getPrimarySessionFile(app) {
  return path.join(createPiEnvironmentLayout(app).runtimeRoot, PRIMARY_SESSION_FILE);
}

function normalizePrimarySession(value = {}) {
  const taskId = String(value.task_id || '').trim();
  const taskKey = String(value.task_key || '').trim();
  const sessionId = String(value.session_id || '').trim();
  if (!taskId && !taskKey) return null;
  return {
    task_id: taskId,
    task_key: taskKey,
    session_id: sessionId,
    updated_at: String(value.updated_at || new Date().toISOString()),
  };
}

function loadPrimaryAgentSession(app) {
  const filePath = getPrimarySessionFile(app);
  if (!fs.existsSync(filePath)) return null;
  try {
    return normalizePrimarySession(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
  } catch {
    return null;
  }
}

function savePrimaryAgentSession(app, value) {
  const normalized = normalizePrimarySession({
    ...value,
    updated_at: new Date().toISOString(),
  });
  if (!normalized) {
    clearPrimaryAgentSession(app);
    return null;
  }
  const filePath = getPrimarySessionFile(app);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf-8');
  return normalized;
}

function clearPrimaryAgentSession(app) {
  fs.rmSync(getPrimarySessionFile(app), { force: true });
}

module.exports = {
  clearPrimaryAgentSession,
  loadPrimaryAgentSession,
  savePrimaryAgentSession,
};