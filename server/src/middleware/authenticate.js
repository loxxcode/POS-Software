import User from "../models/User.js";
import { clearSessionCookie, getSessionUser, hasSessionSecret, roles } from "../auth.js";

export default async function authenticate(request, response, next) {
  if (!hasSessionSecret()) {
    return response.status(503).json({
      success: false,
      message: "Authentication is not configured on the server.",
    });
  }

  const user = getSessionUser(request);
  if (!user) {
    return response.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  try {
    const account = await User.findOne({ email: user.email }).select("email role sessionVersion");
    if (!account) {
      clearSessionCookie(response);
      return response.status(401).json({
        success: false,
        message: "This account is no longer active.",
      });
    }
    if (user.sessionVersion !== (account.sessionVersion || 0)) {
      clearSessionCookie(response);
      return response.status(401).json({
        success: false,
        message: "Your session has expired. Please sign in again.",
      });
    }

    request.user = {
      id: account.id,
      email: account.email,
      role: account.role,
      name: roles[account.role],
    };
    return next();
  } catch (error) {
    return next(error);
  }
}
