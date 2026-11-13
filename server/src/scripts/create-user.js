import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";
import { isRole, normalizeEmail, roles, isValidEmail } from "../auth.js";
import { hashPassword } from "../utils/passwords.js";

dotenv.config();

function parseArguments() {
  const options = { email: "", role: "administration" };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--email" && args[index + 1]) {
      options.email = args[++index];
    } else if (args[index] === "--role" && args[index + 1]) {
      options.role = args[++index];
    } else if (args[index] === "--help") {
      console.log("Usage: npm run create-user -- --email <email> [--role cashier|accountant|daf|administration]");
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete argument: ${args[index]}`);
    }
  }
  return options;
}

function promptSecret(label) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    return Promise.reject(new Error("Run this command in an interactive terminal to enter the password securely."));
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
    };
    const onData = chunk => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("Account creation cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("");
        } else if (character >= " " && character !== "\u001b") {
          value += character;
        }
      }
    };

    process.stdout.write(label);
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function main() {
  const options = parseArguments();
  const email = normalizeEmail(options.email);
  if (!isValidEmail(email)) throw new Error("Provide a valid email using --email.");
  if (!isRole(options.role)) throw new Error(`Invalid role. Choose one of: ${Object.keys(roles).join(", ")}.`);
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing from server/.env.");

  const password = await promptSecret("New password (minimum 12 characters): ");
  if (password.length < 12) throw new Error("Password must contain at least 12 characters.");
  const confirmation = await promptSecret("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");

  await mongoose.connect(process.env.MONGODB_URI);
  await User.init();
  const { salt, hash } = await hashPassword(password);
  await User.create({ email, role: options.role, passwordSalt: salt, passwordHash: hash });
  console.log(`Created ${roles[options.role]} account: ${email}`);
}

main()
  .catch(error => {
    if (error.code === 11000) {
      console.error("An account with this email already exists.");
    } else {
      console.error(error.message);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
