// @/lib/logger.ts
type LogLevel = "debug" | "info" | "warn" | "error";
type LogMeta = Record<string, unknown>;

// Never let password/token/secret-shaped values reach a log sink, even if a
// caller passes a wider object than intended (§9.3, §15.11).
const SENSITIVE_KEY_PATTERN =
  /password|token|secret|hash|authorization|cookie/i;

function redact(meta: LogMeta): LogMeta {
  const safe: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    safe[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : value;
  }
  return safe;
}

function write(level: LogLevel, message: string, meta: LogMeta): void {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...redact(meta),
  };

  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, meta: LogMeta = {}) => write("debug", message, meta),
  info: (message: string, meta: LogMeta = {}) => write("info", message, meta),
  warn: (message: string, meta: LogMeta = {}) => write("warn", message, meta),
  error: (message: string, meta: LogMeta = {}) => write("error", message, meta),
};
