/**
 * Lightweight structured logger for the AI subsystem (Electron main process).
 *
 * Zero dependencies. Emits leveled, namespaced records to the console. Each
 * record carries an ISO timestamp, a level, a namespace, a message, and an
 * optional structured metadata object so logs stay greppable and parseable.
 *
 * Level is controlled by the NOTELY_LOG_LEVEL environment variable
 * (error | warn | info | debug); defaults to "info".
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function resolveThreshold() {
  const raw = String(process.env.NOTELY_LOG_LEVEL || 'info').toLowerCase();
  return raw in LEVELS ? LEVELS[raw] : LEVELS.info;
}

let threshold = resolveThreshold();

const CONSOLE_METHOD = {
  error: 'error',
  warn: 'warn',
  info: 'log',
  debug: 'log'
};

function emit(level, namespace, message, meta) {
  if (LEVELS[level] > threshold) return;

  const record = {
    ts: new Date().toISOString(),
    level,
    ns: namespace,
    msg: message
  };

  if (meta !== undefined && meta !== null) {
    record.meta = meta instanceof Error
      ? { name: meta.name, message: meta.message, stack: meta.stack }
      : meta;
  }

  const method = CONSOLE_METHOD[level] || 'log';
  // Single-line JSON keeps records easy to grep and pipe into log tooling.
  console[method](JSON.stringify(record));
}

/**
 * Create a namespaced logger, e.g. createLogger('DatabaseManager').
 */
function createLogger(namespace) {
  const ns = namespace || 'app';
  return {
    error: (message, meta) => emit('error', ns, message, meta),
    warn: (message, meta) => emit('warn', ns, message, meta),
    info: (message, meta) => emit('info', ns, message, meta),
    debug: (message, meta) => emit('debug', ns, message, meta)
  };
}

/**
 * Override the active log level at runtime (mainly for tests).
 */
function setLogLevel(level) {
  if (level in LEVELS) {
    threshold = LEVELS[level];
  }
}

module.exports = { createLogger, setLogLevel, LEVELS };
