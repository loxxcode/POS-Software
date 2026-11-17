const rolePermissions = {
  cashier: new Set([
    "view", "create", "editOwnDraft", "issueOwnDraft", "customerDecision",
    "cancel", "convert", "renewOwn", "reviseOwn",
  ]),
  accountant: new Set(["view", "viewFinancials", "reports"]),
  daf: new Set(["view", "viewFinancials", "approve", "review", "cancel", "reports"]),
  administration: new Set([
    "view", "viewFinancials", "reports", "create", "editOwnDraft", "editAnyDraft",
    "issueOwnDraft", "issueAnyDraft", "customerDecision", "approve", "review",
    "cancel", "convert", "renewOwn", "renewAny", "reviseOwn", "reviseAny",
  ]),
};

export default function requireProformaPermission(permission) {
  return (request, response, next) => {
    if (!rolePermissions[request.user?.role]?.has(permission)) {
      return response.status(403).json({
        success: false,
        message: "You do not have permission to perform this proforma action.",
      });
    }
    return next();
  };
}
