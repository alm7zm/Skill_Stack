/**
 * Inactivity sign-out, shared by the client timer and the proxy.
 *
 * One cookie is the single source of truth for both halves, which buys two
 * things a per-tab timer could not: the proxy and the browser can never disagree
 * about when you were last seen, and two open tabs share one clock — an idle tab
 * cannot sign you out from under an active one, because "activity" is whatever
 * touched the cookie last, in any tab.
 *
 * Deliberately not httpOnly: the client timer has to read it. That is not a hole
 * — see the ceiling note on IDLE_MS.
 */
export const IDLE_COOKIE = 'ss-seen';

/**
 * 30 minutes. A study planner holds your email, goals and plans — worth logging
 * out on a shared machine, not worth the 15 minutes a bank would use and the
 * re-login it costs someone reading a plan between meetings.
 *
 * ponytail: the client half is a convenience (it clears the screen while you are
 * away); the proxy half is the one that actually enforces, on the next request.
 * Neither is a hard boundary — someone with the machine can delete the cookie to
 * reset the clock. The real bound is the session JWT's own expiry, which this
 * does not and cannot extend. Move last-seen server-side (a table keyed by
 * session id) if that ceiling ever matters.
 */
export const IDLE_MS = 30 * 60 * 1000;

/** Don't rewrite the cookie on every mousemove; once a minute is enough. */
export const IDLE_WRITE_THROTTLE_MS = 60 * 1000;

/** True when `seen` is older than the timeout. Absent/garbled reads as fresh:
 *  a missing cookie means "first request of this session", not "expired". */
export function isIdle(seen: string | undefined, now = Date.now()): boolean {
  if (!seen) return false;
  const at = Number(seen);
  if (!Number.isFinite(at)) return false;
  return now - at > IDLE_MS;
}
