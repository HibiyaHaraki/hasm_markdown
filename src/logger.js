// ###################################################
// File Name : logger.js
// Author : Hibiya Haraki
// Date : July 2026
// ###################################################
// Purpose : Define logger function
// Description : Define logger function
// ###################################################

// Log levels in ascending order so filtering can be applied consistently.
const LOG_LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

// Read the configured log level from Vite env, falling back to debug in development.
const configuredLevel = String(
  import.meta?.env?.VITE_LOG_LEVEL || process.env.NODE_ENV === 'development' ? 'debug' : 'info'
).toLowerCase();

// Decide whether a message should be emitted based on the configured threshold.
const shouldLog = (level) => {
  const selectedLevel = LOG_LEVELS[configuredLevel] ?? LOG_LEVELS.debug;
  return (LOG_LEVELS[level] ?? LOG_LEVELS.debug) >= selectedLevel;
};

// Build a unified log message with timestamp, level, and module name.
const formatMessage = (level, moduleName, args) => {
  const timestamp = new Date().toISOString();
  const prefix = `${timestamp} ${String(level).toUpperCase().padEnd(5)} [${moduleName}]`;
  return [prefix, ...args];
};

// Safe console methods with fallbacks when a method isn't available.
const SAFE_CONSOLE = {
  trace: typeof console.trace === 'function' ? (...a) => console.trace(...a) : (...a) => console.log(...a),
  debug: typeof console.debug === 'function' ? (...a) => console.debug(...a) : (...a) => console.log(...a),
  info: typeof console.info === 'function' ? (...a) => console.info(...a) : (...a) => console.log(...a),
  warn: typeof console.warn === 'function' ? (...a) => console.warn(...a) : (...a) => console.log(...a),
  error: typeof console.error === 'function' ? (...a) => console.error(...a) : (...a) => console.log(...a),
};

// Write the message to the proper console method.
const writeLog = (level, moduleName, ...args) => {
  if (!shouldLog(level)) {
    return;
  }

  const levelToMethod = {
    error: 'error',
    warn: 'warn',
    info: 'info',
    debug: 'debug',
    trace: 'trace',
  };

  const methodName = levelToMethod[level] ?? 'debug';
  const method = SAFE_CONSOLE[methodName];
  const payload = formatMessage(level, moduleName, args);
  method(...payload);
};

// Default logger exports for quick use across the application.
export const debugLog = (...args) => writeLog('debug', 'react', ...args);
export const infoLog = (...args) => writeLog('info', 'react', ...args);
export const warnLog = (...args) => writeLog('warn', 'react', ...args);
export const errorLog = (...args) => writeLog('error', 'react', ...args);
export const traceLog = (...args) => writeLog('trace', 'react', ...args);

// Create a module-specific logger instance when more context is needed.
export const createLogger = (moduleName = 'react') => ({
  trace: (...args) => writeLog('trace', moduleName, ...args),
  debug: (...args) => writeLog('debug', moduleName, ...args),
  info: (...args) => writeLog('info', moduleName, ...args),
  warn: (...args) => writeLog('warn', moduleName, ...args),
  error: (...args) => writeLog('error', moduleName, ...args),
});