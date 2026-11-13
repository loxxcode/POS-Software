import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const keyLength = 64;
const options = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, keyLength, options);
  return { salt, hash: hash.toString("hex") };
}

export async function verifyPassword(password, salt, expectedHash) {
  const expected = Buffer.from(expectedHash, "hex");
  if (expected.length !== keyLength) return false;
  const actual = await scrypt(password, salt, keyLength, options);
  return crypto.timingSafeEqual(actual, expected);
}
