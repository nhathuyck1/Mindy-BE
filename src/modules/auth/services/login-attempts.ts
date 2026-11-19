import { LoginTooManyAttemptsException } from '../exceptions/auth.exceptions.js';

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60_000;
const MAX_TRACKED_EMAILS = 10_000;

/**
 * Failed password logins per normalized email inside a sliding window.
 * shortcut: kept in memory per API instance and lost on restart; move to Redis or a table
 * when the API runs on more than one instance.
 */
export class LoginAttempts {
  private readonly failures = new Map<string, number[]>();

  assertAllowed(email: string, now = Date.now()): void {
    const recent = this.recent(email, now);
    if (recent.length < LOGIN_MAX_FAILURES) return;
    const oldest = recent[0] ?? now;
    throw new LoginTooManyAttemptsException(
      Math.max(1, Math.ceil((oldest + LOGIN_WINDOW_MS - now) / 1000)),
    );
  }

  recordFailure(email: string, now = Date.now()): void {
    if (this.failures.size >= MAX_TRACKED_EMAILS) this.prune(now);
    const recent = this.recent(email, now);
    recent.push(now);
    this.failures.set(email, recent);
  }

  reset(email: string): void {
    this.failures.delete(email);
  }

  private recent(email: string, now: number): number[] {
    const recent = (this.failures.get(email) ?? []).filter((at) => now - at < LOGIN_WINDOW_MS);
    if (recent.length > 0) this.failures.set(email, recent);
    else this.failures.delete(email);
    return recent;
  }

  private prune(now: number): void {
    for (const email of [...this.failures.keys()]) this.recent(email, now);
  }
}
