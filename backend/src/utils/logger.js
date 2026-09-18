import { AsyncLocalStorage } from 'node:async_hooks';

export const logContext = new AsyncLocalStorage();
const sensitive = /cookie|authorization|password|secret|token|credential|signature|presign|url|body|headers|sql|payload/i;
export function redact(value, seen = new WeakSet()) {
  if (value instanceof Error) return { error: 'REDACTED_ERROR' };
  if (typeof value === 'string') return /https?:\/\/|X-Amz-|Bearer\s|(?:password|secret|token|cookie)\s*[:=]/i.test(value) ? '[REDACTED]' : value.slice(0, 512);
  if (typeof value === 'bigint') return value.toString();
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  return Array.isArray(value) ? value.map((v) => redact(v, seen)) : Object.fromEntries(
    Object.entries(value).map(([key, v]) => [key, sensitive.test(key) ? '[REDACTED]' : redact(v, seen)]));
}
export function createLogger(write = (line) => process.stdout.write(line)) {
  return (event, fields = {}, level = 'info') => write(`${JSON.stringify({ ...redact(logContext.getStore() || {}), ...redact(fields), timestamp: new Date().toISOString(), level, event: redact(event) })}\n`);
}
export const log = createLogger();
