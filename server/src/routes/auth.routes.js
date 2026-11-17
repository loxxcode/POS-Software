import express from "express";
import User from "../models/User.js";
import { hashPassword, verifyPassword } from "../utils/passwords.js";
import {
  clearSessionCookie,
  hasSessionSecret,
  roles,
  normalizeEmail,
  isValidEmail,
  setSessionCookie,
} from "../auth.js";
import authenticate from "../middleware/authenticate.js";

const router = express.Router();

router.post("/login", async (request, response, next) => {
  const { email, password } = request.body || {};
  if (typeof email !== "string" || typeof password !== "string" || password.length > 1024) {
    return response.status(400).json({
      success: false,
      message: "Enter a valid email address and password.",
    });
  }
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return response.status(400).json({
      success: false,
      message: "Enter a valid email address and password.",
    });
  }
  if (!hasSessionSecret()) {
    return response.status(503).json({
      success: false,
      message: "Authentication is not configured on the server.",
    });
  }

  try {
    const user = await User.findOne({ email: normalizedEmail }).select("+passwordSalt +passwordHash");
    if (!user) {
      await hashPassword(password);
      return response.status(401).json({ success: false, message: "Invalid email or password." });
    }

    if (!await verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return response.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const sessionUser = { role: user.role, email: user.email };
    setSessionCookie(response, { ...sessionUser, sessionVersion: user.sessionVersion || 0 });
    return response.json({
      success: true,
      user: { ...sessionUser, name: roles[user.role] },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/session", authenticate, (request, response) => {
  const { email, role, name } = request.user;
  return response.json({ success: true, user: { email, role, name } });
});

router.post("/change-password", authenticate, async (request, response, next) => {
  const { currentPassword, newPassword } = request.body || {};
  if (
    typeof currentPassword !== "string" ||
    !currentPassword ||
    currentPassword.length > 1024 ||
    typeof newPassword !== "string" ||
    newPassword.length < 12 ||
    newPassword.length > 1024
  ) {
    return response.status(400).json({
      success: false,
      message: "Enter your current password and a new password of at least 12 characters.",
    });
  }

  try {
    const user = await User.findById(request.user.id).select("+passwordSalt +passwordHash");
    if (!user) {
      return response.status(404).json({ success: false, message: "Account not found." });
    }
    if (!await verifyPassword(currentPassword, user.passwordSalt, user.passwordHash)) {
      return response.status(400).json({ success: false, message: "Current password is incorrect." });
    }
    if (await verifyPassword(newPassword, user.passwordSalt, user.passwordHash)) {
      return response.status(400).json({ success: false, message: "Choose a password you have not used before." });
    }

    const { salt, hash } = await hashPassword(newPassword);
    user.passwordSalt = salt;
    user.passwordHash = hash;
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    await user.save();

    setSessionCookie(response, {
      email: user.email,
      role: user.role,
      sessionVersion: user.sessionVersion,
    });
    return response.json({ success: true, message: "Password updated successfully." });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", (_request, response) => {
  clearSessionCookie(response);
  return response.json({ success: true });
});

export default router;
