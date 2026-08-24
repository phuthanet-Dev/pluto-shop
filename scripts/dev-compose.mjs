import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function buildLocalEnv(ownerPassword, appPassword) {
  return [
    "POSTGRES_DB=plutoshop",
    "POSTGRES_USER=pluto",
    `POSTGRES_PASSWORD=${ownerPassword}`,
    `POSTGRES_APP_PASSWORD=${appPassword}`,
    "WEB_PORT=3000",
    "",
  ].join("\n");
}

export function validateLocalEnv(content) {
  const values = new Map();

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator < 1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }

  for (const key of ["POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_APP_PASSWORD"]) {
    if (!values.get(key)) {
      throw new Error(`.env is missing ${key}; remove it and rerun npm run dev:docker, or set it explicitly.`);
    }
  }

  for (const key of ["POSTGRES_DB", "POSTGRES_USER"]) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/u.test(values.get(key))) {
      throw new Error(`${key} must be a valid PostgreSQL identifier.`);
    }
  }

  const ownerPassword = values.get("POSTGRES_PASSWORD");
  const appPassword = values.get("POSTGRES_APP_PASSWORD");

  if (ownerPassword.includes("replace-with") || appPassword.includes("replace-with")) {
    throw new Error("Replace the placeholder database passwords before starting Pluto Shop.");
  }
  if (ownerPassword.length < 24 || appPassword.length < 24) {
    throw new Error("Database passwords must each contain at least 24 characters.");
  }
  if (ownerPassword === appPassword) {
    throw new Error("Owner and application database passwords must be different.");
  }
}

export async function ensureLocalEnv(envPath, createPassword = () => randomBytes(32).toString("base64url")) {
  try {
    await access(envPath, constants.F_OK);
    return "existing";
  } catch {
    // The exclusive write below protects an existing secret if two commands start together.
  }

  try {
    await writeFile(envPath, buildLocalEnv(createPassword(), createPassword()), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return "created";
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      return "existing";
    }
    throw error;
  }
}

async function main() {
  const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptsDirectory, "..");
  const envPath = join(repositoryRoot, ".env");
  const result = await ensureLocalEnv(envPath);
  validateLocalEnv(await readFile(envPath, "utf8"));

  if (result === "created") {
    console.log("Created a private .env with separate random local database passwords.");
  }

  const child = spawn("docker", ["compose", "up", "--build", ...process.argv.slice(2)], {
    cwd: repositoryRoot,
    env: process.env,
    shell: false,
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error(`Unable to start Docker Compose: ${error.message}`);
    process.exitCode = 1;
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.error(`Docker Compose stopped by signal ${signal}.`);
      process.exitCode = 1;
      return;
    }
    process.exitCode = code ?? 1;
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  await main();
}
