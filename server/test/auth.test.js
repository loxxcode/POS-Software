import assert from "node:assert/strict";
import test from "node:test";
import { clearSessionCookie, setSessionCookie } from "../src/auth.js";

test("production session cookies allow credentialed cross-site requests", () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousSecret = process.env.AUTH_SESSION_SECRET;
  process.env.NODE_ENV = "production";
  process.env.AUTH_SESSION_SECRET = "test-session-secret-that-is-long-enough";

  try {
    let sessionCookieOptions;
    let clearedCookieOptions;
    const response = {
      cookie(_name, _value, options) {
        sessionCookieOptions = options;
      },
      clearCookie(_name, options) {
        clearedCookieOptions = options;
      },
    };

    setSessionCookie(response, {
      role: "cashier",
      email: "cashier@example.com",
      sessionVersion: 0,
    });
    clearSessionCookie(response);

    assert.equal(sessionCookieOptions.sameSite, "none");
    assert.equal(sessionCookieOptions.secure, true);
    assert.equal(clearedCookieOptions.sameSite, "none");
    assert.equal(clearedCookieOptions.secure, true);
  } finally {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    if (previousSecret === undefined) delete process.env.AUTH_SESSION_SECRET;
    else process.env.AUTH_SESSION_SECRET = previousSecret;
  }
});
