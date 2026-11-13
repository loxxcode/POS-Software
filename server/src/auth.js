import crypto from "node:crypto";

export const roles = {
  cashier: "Cashier",
  accountant: "Accountant",
  daf: "DAF",
  administration: "Administration",
};

export const staffRoles = {
  cashier: "Cashier",
  accountant: "Accountant",
  daf: "DAF",
};

const sessionCookie = "pos_session";
const sessionDurationMs = 8 * 60 * 60 * 1000;

export function isRole(role) {
  return Object.hasOwn(roles, role);
}

export function isStaffRole(role) {
  return Object.hasOwn(staffRoles, role);
}

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function hasSessionSecret() {
  return Boolean(process.env.AUTH_SESSION_SECRET && process.env.AUTH_SESSION_SECRET.length >= 32);
}

function sign(payload) {
  return crypto.createHmac("sha256", process.env.AUTH_SESSION_SECRET).update(payload).digest("base64url");
}

export function createSessionToken(user) {
  const payload = Buffer.from(JSON.stringify({
    role: user.role,
    email: user.email,
    sessionVersion: user.sessionVersion || 0,
    expiresAt: Date.now() + sessionDurationMs,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function getSessionUser(request) {
  if (!hasSessionSecret()) return null;
  const cookie = request.headers.cookie
    ?.split(";")
    .map(value => value.trim())
    .find(value => value.startsWith(`${sessionCookie}=`));
  if (!cookie) return null;

  const token = cookie.slice(sessionCookie.length + 1);
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      !isRole(user.role) ||
      typeof user.email !== "string" ||
      !Number.isInteger(user.sessionVersion) ||
      !Number.isFinite(user.expiresAt) ||
      user.expiresAt <= Date.now()
    ) return null;
    return { role: user.role, name: roles[user.role], email: user.email, sessionVersion: user.sessionVersion };
  } catch {
    return null;
  }
}

export function setSessionCookie(response, user) {
  response.cookie(sessionCookie, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: sessionDurationMs,
    path: "/",
  });
}

export function clearSessionCookie(response) {
  response.clearCookie(sessionCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
