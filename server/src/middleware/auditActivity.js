import AuditLog from "../models/AuditLog.js";

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const actionNames = {
  POST: "Created",
  PUT: "Replaced",
  PATCH: "Updated",
  DELETE: "Deleted",
};

export default function auditActivity(request, response, next) {
  if (!mutationMethods.has(request.method)) return next();

  response.once("finish", () => {
    if (!request.user) return;

    const path = request.originalUrl.split("?")[0];
    const segments = path.split("/").filter(Boolean);
    const resource = segments[1] === "admin" ? segments[2] || "admin" : segments[1] || "application";
    void AuditLog.create({
      actorEmail: request.user.email,
      actorRole: request.user.role,
      method: request.method,
      path,
      resource,
      action: `${actionNames[request.method]} ${resource}`,
      statusCode: response.statusCode,
      outcome: response.statusCode < 400 ? "Success" : "Failed",
    }).catch(error => {
      console.error("Unable to persist audit event:", error);
    });
  });

  return next();
}
