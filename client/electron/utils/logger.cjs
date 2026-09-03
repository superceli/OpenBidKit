function logInfo(...args) {
  console.log('[yibiao-client]', ...args);
}

function logError(...args) {
  console.error('[yibiao-client]', ...args);
}

module.exports = {
  logError,
  logInfo,
};
