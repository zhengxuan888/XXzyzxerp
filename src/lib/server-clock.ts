/**
 * Request-time clock boundary for Server Components.
 *
 * Time-sensitive queues (such as overdue logistics follow-ups) must be
 * evaluated once per server request rather than during a Client Component
 * render. Keeping the clock behind this boundary also makes it injectable in
 * future deterministic tests.
 */
export function getServerNowMs() {
  return Date.now();
}
