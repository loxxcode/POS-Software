import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  createQuickBooksCustomer,
  getQuickBooksBridgeCapabilities,
  getQuickBooksBridgeHealth,
  getQuickBooksCompany,
  getQuickBooksPreferences,
  getQuickBooksCatalogs,
  QuickBooksBridgeError,
  updateQuickBooksCustomer,
  updateQuickBooksItem,
} from "../src/services/quickBooksBridge.js";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

function restoreEnvironment(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test("QuickBooks bridge client requires a configured shared secret", async () => {
  const previous = {
    QB_BRIDGE_SECRET: process.env.QB_BRIDGE_SECRET,
    QB_BRIDGE_PORT: process.env.QB_BRIDGE_PORT,
  };
  delete process.env.QB_BRIDGE_SECRET;

  try {
    await assert.rejects(
      getQuickBooksBridgeHealth(),
      error => error instanceof QuickBooksBridgeError &&
        error.code === "BRIDGE_NOT_CONFIGURED" &&
        error.message.includes("QB_BRIDGE_SECRET")
    );
  } finally {
    restoreEnvironment(previous);
  }
});

test("QuickBooks bridge client authenticates to loopback and parses only known operations", async () => {
  const secret = "test-bridge-secret-that-is-long-enough-123456";
  const paths = [];
  const server = http.createServer((request, response) => {
    paths.push(request.url);
    assert.equal(request.socket.remoteAddress, "127.0.0.1");
    assert.equal(request.headers["x-bridge-token"], secret);
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/health") {
      response.end(JSON.stringify({ success: true, service: "quickbooks-bridge", status: "ready" }));
    } else if (request.url === "/quickbooks/capabilities") {
      response.end(JSON.stringify({
        success: true,
        operations: ["companyQuery", "preferencesQuery", "catalogsQuery"],
        salesReceiptsEnabled: false,
      }));
    } else if (request.url === "/quickbooks/company") {
      response.end(JSON.stringify({
        success: true,
        data: {
          companyName: "Test Company",
          legalCompanyName: "Test Company LLC",
          country: "US",
          isSampleCompany: false,
          companyIdentityKey: "a".repeat(64),
          qbxmlVersion: "16.0",
        },
      }));
    } else if (request.url === "/quickbooks/preferences") {
      response.end(JSON.stringify({
        success: true,
        data: {
          multiCurrencyEnabled: true,
          homeCurrencyReferenceAvailable: true,
          homeCurrencyCode: "RWF",
          homeCurrencyName: "Rwandan Franc",
        },
      }));
    } else if (request.url === "/quickbooks/catalogs") {
      response.end(JSON.stringify({
        success: true,
        data: {
          items: [{ listId: "item-id", name: "Product", type: "inventory", isSalesItem: true }],
          customers: [],
          salesTaxCodes: [],
          salesTaxItems: [],
          paymentMethods: [],
          accounts: [],
          truncated: {},
        },
      }));
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ success: false, code: "NOT_FOUND" }));
    }
  });

  const port = await listen(server);
  const previous = {
    QB_BRIDGE_SECRET: process.env.QB_BRIDGE_SECRET,
    QB_BRIDGE_PORT: process.env.QB_BRIDGE_PORT,
  };
  process.env.QB_BRIDGE_SECRET = secret;
  process.env.QB_BRIDGE_PORT = String(port);

  try {
    const [health, capabilities, company, preferences, catalogs] = await Promise.all([
      getQuickBooksBridgeHealth(),
      getQuickBooksBridgeCapabilities(),
      getQuickBooksCompany(),
      getQuickBooksPreferences(),
      getQuickBooksCatalogs(),
    ]);

    assert.equal(health.status, "ready");
    assert.deepEqual(capabilities.operations, ["companyQuery", "preferencesQuery", "catalogsQuery"]);
    assert.equal(capabilities.salesReceiptsEnabled, false);
    assert.deepEqual(company, {
      companyName: "Test Company",
      legalCompanyName: "Test Company LLC",
      country: "US",
      isSampleCompany: false,
      companyIdentityKey: "a".repeat(64),
      qbxmlVersion: "16.0",
    });
    assert.deepEqual(preferences, {
      multiCurrencyEnabled: true,
      homeCurrencyReferenceAvailable: true,
      homeCurrencyCode: "RWF",
      homeCurrencyName: "Rwandan Franc",
    });
    assert.deepEqual(catalogs.items, [
      { listId: "item-id", name: "Product", type: "inventory", isSalesItem: true },
    ]);
    assert.deepEqual(paths.sort(), [
      "/health",
      "/quickbooks/capabilities",
      "/quickbooks/catalogs",
      "/quickbooks/company",
      "/quickbooks/preferences",
    ]);
  } finally {
    restoreEnvironment(previous);
    await close(server);
  }
});

test("QuickBooks bridge client sends authenticated JSON master-data writes", async () => {
  const secret = "test-master-data-bridge-secret-0123456789";
  const calls = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => {
      calls.push({
        method: request.method,
        path: request.url,
        token: request.headers["x-bridge-token"],
        contentType: request.headers["content-type"],
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
      });
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        success: true,
        data: { listId: "qb-list-id", name: "Reader" },
      }));
    });
  });
  const port = await listen(server);
  const previous = {
    QB_BRIDGE_SECRET: process.env.QB_BRIDGE_SECRET,
    QB_BRIDGE_PORT: process.env.QB_BRIDGE_PORT,
  };
  process.env.QB_BRIDGE_SECRET = secret;
  process.env.QB_BRIDGE_PORT = String(port);

  try {
    await createQuickBooksCustomer({ name: "Reader", email: "", phone: "", address: "" });
    await updateQuickBooksCustomer("customer-list-id", {
      name: "Reader",
      email: "reader@example.test",
      phone: "12345",
      address: "Main Street",
    });
    await updateQuickBooksItem("item-list-id", { name: "Reader", salesPrice: 125 });

    assert.deepEqual(calls, [
      {
        method: "POST",
        path: "/quickbooks/customers",
        token: secret,
        contentType: "application/json",
        body: { name: "Reader", email: "", phone: "", address: "" },
      },
      {
        method: "PATCH",
        path: "/quickbooks/customers/customer-list-id",
        token: secret,
        contentType: "application/json",
        body: { name: "Reader", email: "reader@example.test", phone: "12345", address: "Main Street" },
      },
      {
        method: "PATCH",
        path: "/quickbooks/items/item-list-id",
        token: secret,
        contentType: "application/json",
        body: { name: "Reader", salesPrice: 125 },
      },
    ]);
  } finally {
    restoreEnvironment(previous);
    await close(server);
  }
});
