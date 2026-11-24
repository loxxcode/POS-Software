import http from "node:http";

const requestTimeoutMs = 5000;
const maximumResponseBytes = 16 * 1024;
const catalogRequestTimeoutMs = 20000;
const maximumCatalogResponseBytes = 2 * 1024 * 1024;
const defaultPort = 8765;

export class QuickBooksBridgeError extends Error {
  constructor(code, message, statusCode = 503) {
    super(message);
    this.name = "QuickBooksBridgeError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function getBridgeConfig() {
  const secret = process.env.QB_BRIDGE_SECRET;
  const rawPort = process.env.QB_BRIDGE_PORT || String(defaultPort);
  const port = Number(rawPort);

  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new QuickBooksBridgeError(
      "BRIDGE_NOT_CONFIGURED",
      "Set QB_BRIDGE_SECRET to the same value (at least 32 UTF-8 bytes) in the backend and local bridge."
    );
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new QuickBooksBridgeError(
      "BRIDGE_NOT_CONFIGURED",
      "QuickBooks bridge port configuration is invalid."
    );
  }

  return { port, secret };
}

function requestBridge(path, options = {}) {
  const { port, secret } = getBridgeConfig();
  const timeoutMs = options.timeoutMs || requestTimeoutMs;
  const responseSizeLimit = options.maximumResponseBytes || maximumResponseBytes;
  const body = options.body === undefined ? null : Buffer.from(JSON.stringify(options.body), "utf8");

  return new Promise((resolve, reject) => {
    let settled = false;
    let responseBytes = 0;
    const chunks = [];

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
    };

    const request = http.request({
      host: "127.0.0.1",
      port,
      path,
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        "X-Bridge-Token": secret,
        ...(body ? {
          "Content-Type": "application/json",
          "Content-Length": body.length,
        } : {}),
      },
    }, response => {
      response.on("data", chunk => {
        responseBytes += chunk.length;
        if (responseBytes > responseSizeLimit) {
          response.destroy();
          finish(new QuickBooksBridgeError(
            "BRIDGE_RESPONSE_TOO_LARGE",
            "QuickBooks bridge returned an oversized response.",
            502
          ));
          return;
        }
        chunks.push(chunk);
      });

      response.on("aborted", () => {
        finish(new QuickBooksBridgeError(
          "BRIDGE_RESPONSE_INCOMPLETE",
          "QuickBooks bridge response ended unexpectedly.",
          502
        ));
      });

      response.on("error", () => {
        finish(new QuickBooksBridgeError(
          "BRIDGE_RESPONSE_INCOMPLETE",
          "QuickBooks bridge response could not be read.",
          502
        ));
      });

      response.on("end", () => {
        let body;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          finish(new QuickBooksBridgeError(
            "BRIDGE_INVALID_RESPONSE",
            "QuickBooks bridge returned invalid JSON.",
            502
          ));
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          const bridgeStatus = response.statusCode;
          const statusCode = bridgeStatus === 503 || bridgeStatus === 504
            ? bridgeStatus
            : bridgeStatus >= 400 && bridgeStatus < 500 && bridgeStatus !== 401
              ? bridgeStatus
              : 502;
          finish(new QuickBooksBridgeError(
            typeof body?.code === "string" ? body.code : "BRIDGE_HTTP_ERROR",
            typeof body?.message === "string" ? body.message.slice(0, 400) : "QuickBooks bridge request failed.",
            statusCode
          ));
          return;
        }

        if (!body || body.success !== true) {
          finish(new QuickBooksBridgeError(
            typeof body?.code === "string" ? body.code : "BRIDGE_OPERATION_FAILED",
            typeof body?.message === "string" ? body.message.slice(0, 400) : "QuickBooks bridge operation failed.",
            502
          ));
          return;
        }

        finish(null, body);
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("QuickBooks bridge request timed out."));
    });
    request.on("error", error => {
      const timedOut = error.message.includes("timed out");
      finish(new QuickBooksBridgeError(
        timedOut ? "BRIDGE_TIMEOUT" : "BRIDGE_UNAVAILABLE",
        timedOut
          ? "QuickBooks bridge did not respond before the request timed out."
          : "QuickBooks bridge is unavailable on this computer.",
        timedOut ? 504 : 503
      ));
    });
    request.end(body || undefined);
  });
}

export async function getQuickBooksBridgeHealth() {
  return requestBridge("/health");
}

export async function getQuickBooksBridgeCapabilities() {
  return requestBridge("/quickbooks/capabilities");
}

export async function getQuickBooksCompany() {
  const response = await requestBridge("/quickbooks/company");
  return response.data;
}

export async function getQuickBooksPreferences() {
  const response = await requestBridge("/quickbooks/preferences");
  return response.data;
}

export async function getQuickBooksCatalogs() {
  const response = await requestBridge("/quickbooks/catalogs", {
    timeoutMs: catalogRequestTimeoutMs,
    maximumResponseBytes: maximumCatalogResponseBytes,
  });
  return response.data;
}

export async function createQuickBooksCustomer(customer) {
  const response = await requestBridge("/quickbooks/customers", {
    method: "POST",
    body: customer,
    timeoutMs: 20000,
  });
  return response.data;
}

export async function updateQuickBooksCustomer(listId, customer) {
  const response = await requestBridge(`/quickbooks/customers/${encodeURIComponent(listId)}`, {
    method: "PATCH",
    body: customer,
    timeoutMs: 20000,
  });
  return response.data;
}

export async function updateQuickBooksItem(listId, item) {
  const response = await requestBridge(`/quickbooks/items/${encodeURIComponent(listId)}`, {
    method: "PATCH",
    body: item,
    timeoutMs: 20000,
  });
  return response.data;
}

export async function adjustQuickBooksInventory(adjustment) {
  const response = await requestBridge("/quickbooks/inventory/adjust", {
    method: "POST",
    body: adjustment,
    timeoutMs: 20000,
  });
  return response.data;
}

export async function createQuickBooksSalesTransaction(transaction) {
  const response = await requestBridge("/quickbooks/sales", {
    method: "POST",
    body: transaction,
    timeoutMs: 30000,
  });
  return response.data;
}
