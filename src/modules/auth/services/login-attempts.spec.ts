import { describe, expect, it } from 'vitest';

import { LoginTooManyAttemptsException } from '../exceptions/auth.exceptions.js';
import { LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS, LoginAttempts } from './login-attempts.js';

describe('login attempt limit', () => {
  it('blocks an email after repeated failures until the window passes', () => {
    const attempts = new LoginAttempts();
    const start = 1_000_000;
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) {
      attempts.assertAllowed('a@example.com', start + i);
      attempts.recordFailure('a@example.com', start + i);
    }
    expect(() => attempts.assertAllowed('a@example.com', start + 10)).toThrow(
      LoginTooManyAttemptsException,
    );
    // Other emails are not affected.
    expect(() => attempts.assertAllowed('b@example.com', start + 10)).not.toThrow();
    // The oldest failure leaves the window, so one more try is allowed.
    expect(() => attempts.assertAllowed('a@example.com', start + LOGIN_WINDOW_MS)).not.toThrow();
  });

  it('clears the failures after a successful login', () => {
    const attempts = new LoginAttempts();
    for (let i = 0; i < LOGIN_MAX_FAILURES; i++) attempts.recordFailure('a@example.com', i);
    attempts.reset('a@example.com');
    expect(() => attempts.assertAllowed('a@example.com', 10)).not.toThrow();
  });
});
