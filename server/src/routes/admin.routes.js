import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Organization from "../models/Organization.js";
import AuditLog from "../models/AuditLog.js";
import requireRole from "../middleware/requireRole.js";
import { hashPassword } from "../utils/passwords.js";
import { isStaffRole, isValidEmail, normalizeEmail, roles, staffRoles } from "../auth.js";

const router = express.Router();

router.use(requireRole("administration"));

router.get("/organizations", async (_request, response, next) => {
  try {
    const data = await Organization.find()
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    return response.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

router.post("/organizations", async (request, response, next) => {
  const { name, branch, manager, location = "" } = request.body || {};
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 120 ||
    typeof branch !== "string" ||
    !branch.trim() ||
    branch.trim().length > 120 ||
    typeof manager !== "string" ||
    !manager.trim() ||
    manager.trim().length > 120 ||
    typeof location !== "string" ||
    location.trim().length > 160
  ) {
    return response.status(400).json({
      success: false,
      message: "Enter an organization name, branch, manager, and a valid location.",
    });
  }

  try {
    const data = await Organization.create({
      name: name.trim(),
      branch: branch.trim(),
      manager: manager.trim(),
      location: location.trim(),
      createdBy: request.user.email,
    });
    return response.status(201).json({ success: true, data });
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({
        success: false,
        message: "An organization with this name and branch already exists.",
      });
    }
    return next(error);
  }
});

router.get("/audit-logs", async (request, response, next) => {
  const parsedLimit = Number.parseInt(request.query.limit, 10);
  const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 100;
  try {
    const data = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return response.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

router.get("/users", async (request, response, next) => {
  try {
    const users = await User.find({ role: { $in: Object.keys(staffRoles) } })
      .select("email role createdAt")
      .sort({ role: 1, email: 1 })
      .lean();
    return response.json({ success: true, users });
  } catch (error) {
    return next(error);
  }
});

router.post("/users", async (request, response, next) => {
  const { email, role, password } = request.body || {};
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 1024 ||
    !isStaffRole(role)
  ) {
    return response.status(400).json({
      success: false,
      message: "Enter a valid email, choose a role, and use a password of at least 12 characters.",
    });
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return response.status(400).json({
      success: false,
      message: "Enter a valid email address.",
    });
  }

  try {
    const { salt, hash } = await hashPassword(password);
    const user = await User.create({
      email: normalizedEmail,
      role,
      passwordSalt: salt,
      passwordHash: hash,
    });
    return response.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }
    return next(error);
  }
});

router.patch("/users/:id", async (request, response, next) => {
  if (!mongoose.Types.ObjectId.isValid(request.params.id)) {
    return response.status(400).json({ success: false, message: "Invalid user ID." });
  }

  const { email, role, password } = request.body || {};
  if (
    typeof email !== "string" ||
    !isStaffRole(role) ||
    (password !== undefined && typeof password !== "string") ||
    (typeof password === "string" && password.length > 0 && (password.length < 12 || password.length > 1024))
  ) {
    return response.status(400).json({
      success: false,
      message: "Enter a valid email and role. A new password must be at least 12 characters.",
    });
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return response.status(400).json({ success: false, message: "Enter a valid email address." });
  }

  try {
    const user = await User.findOne({
      _id: request.params.id,
      role: { $in: Object.keys(staffRoles) },
    });
    if (!user) {
      return response.status(404).json({ success: false, message: "User not found." });
    }
    if (user.id === request.user.id) {
      return response.status(409).json({
        success: false,
        message: "You cannot edit your own account from User Management.",
      });
    }
    user.email = normalizedEmail;
    user.role = role;
    if (password) {
      const { salt, hash } = await hashPassword(password);
      user.passwordSalt = salt;
      user.passwordHash = hash;
      user.sessionVersion = (user.sessionVersion || 0) + 1;
    }
    await user.save();

    return response.json({
      success: true,
      user: {
        _id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }
    return next(error);
  }
});

router.delete("/users/:id", async (request, response, next) => {
  if (!mongoose.Types.ObjectId.isValid(request.params.id)) {
    return response.status(400).json({ success: false, message: "Invalid user ID." });
  }

  try {
    const user = await User.findOne({
      _id: request.params.id,
      role: { $in: Object.keys(staffRoles) },
    }).select("email role");
    if (!user) {
      return response.status(404).json({ success: false, message: "User not found." });
    }
    if (user.email === request.user.email) {
      return response.status(409).json({
        success: false,
        message: "You cannot remove your own account while signed in.",
      });
    }
    await User.deleteOne({ _id: user._id });
    return response.json({ success: true, message: `${roles[user.role]} account removed.` });
  } catch (error) {
    return next(error);
  }
});

export default router;
