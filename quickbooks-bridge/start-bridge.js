import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bridgeDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = path.resolve(bridgeDirectory, "..");
const serverDirectory = path.join(repositoryDirectory, "server");
const requireFromServer = createRequire(path.join(serverDirectory, "package.json"));
const dotenv = requireFromServer("dotenv");
const serverEnvPath = path.join(serverDirectory, ".env");
const serverEnvironment = dotenv.parse(readFileSync(serverEnvPath));
const secret = serverEnvironment.QB_BRIDGE_SECRET;
const port = serverEnvironment.QB_BRIDGE_PORT || "8765";
const sdkCountry = process.env.QBFC_SDK_COUNTRY || serverEnvironment.QBFC_SDK_COUNTRY || "US";

if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
  throw new Error("server\\.env must contain a QB_BRIDGE_SECRET of at least 32 UTF-8 bytes.");
}

if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
  throw new Error("server\\.env QB_BRIDGE_PORT must be an integer from 1024 through 65535.");
}

if (!/^[A-Za-z]{2}$/.test(sdkCountry)) {
  throw new Error("QBFC_SDK_COUNTRY must be a two-letter locale.");
}

const executable = path.join(bridgeDirectory, "bin", "Release", "QuickBooksBridge.exe");
const bridge = spawn(executable, ["--serve"], {
  cwd: repositoryDirectory,
  env: {
    ...process.env,
    QB_BRIDGE_SECRET: secret,
    QB_BRIDGE_PORT: port,
    QBFC_SDK_COUNTRY: sdkCountry,
  },
  stdio: "inherit",
});

bridge.on("error", error => {
  console.error(`Could not start the QuickBooks bridge: ${error.message}`);
  process.exitCode = 1;
});

bridge.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
