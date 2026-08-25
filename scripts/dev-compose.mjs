import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function buildLocalEnv(
  ownerPassword,
  appPassword,
  writePassword = randomBytes(32).toString("base64url"),
  adminPassword = randomBytes(32).toString("base64url"),
  authSessionSecret = randomBytes(32).toString("hex"),
  keycloakAdminPassword = randomBytes(32).toString("base64url"),
) {
  return [
    "POSTGRES_DB=plutoshop",
    "POSTGRES_USER=pluto",
    `POSTGRES_PASSWORD=${ownerPassword}`,
    `POSTGRES_APP_PASSWORD=${appPassword}`,
    `POSTGRES_WRITE_PASSWORD=${writePassword}`,
    `POSTGRES_ADMIN_PASSWORD=${adminPassword}`,
    "KEYCLOAK_ADMIN=admin",
    `KEYCLOAK_ADMIN_PASSWORD=${keycloakAdminPassword}`,
    `AUTH_SESSION_SECRET=${authSessionSecret}`,
    "OIDC_ISSUER=http://127.0.0.1:8081/realms/pluto",
    "OIDC_INTERNAL_ISSUER=http://keycloak:8080/realms/pluto",
    "OIDC_CLIENT_ID=pluto-web",
    "OIDC_REDIRECT_URI=http://127.0.0.1:3000/api/auth/callback",
    "SITE_URL=http://127.0.0.1:3000",
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

  for (const key of [
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_APP_PASSWORD",
    "POSTGRES_WRITE_PASSWORD",
    "POSTGRES_ADMIN_PASSWORD",
    "KEYCLOAK_ADMIN",
    "KEYCLOAK_ADMIN_PASSWORD",
    "AUTH_SESSION_SECRET",
    "OIDC_ISSUER",
    "OIDC_INTERNAL_ISSUER",
    "OIDC_CLIENT_ID",
    "OIDC_REDIRECT_URI",
    "SITE_URL",
  ]) {
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
  const writePassword = values.get("POSTGRES_WRITE_PASSWORD");
  const adminPassword = values.get("POSTGRES_ADMIN_PASSWORD");

  if (
    ownerPassword.includes("replace-with") ||
    appPassword.includes("replace-with") ||
    writePassword.includes("replace-with") ||
    adminPassword.includes("replace-with")
  ) {
    throw new Error("Replace the placeholder database passwords before starting Pluto Shop.");
  }
  if (
    ownerPassword.length < 24 ||
    appPassword.length < 24 ||
    writePassword.length < 24 ||
    adminPassword.length < 24
  ) {
    throw new Error("Database passwords must each contain at least 24 characters.");
  }
  if (new Set([ownerPassword, appPassword, writePassword, adminPassword]).size !== 4) {
    throw new Error("Owner, application, write, and admin database passwords must be different.");
  }

  const authSessionSecret = values.get("AUTH_SESSION_SECRET");
  if (!/^[0-9a-f]{64}$/iu.test(authSessionSecret)) {
    throw new Error("AUTH_SESSION_SECRET must be a 32-byte hexadecimal secret.");
  }

  if (values.get("KEYCLOAK_ADMIN_PASSWORD").length < 24) {
    throw new Error("KEYCLOAK_ADMIN_PASSWORD must contain at least 24 characters.");
  }
}

export async function ensureLocalEnv(envPath, createPassword = () => randomBytes(32).toString("base64url")) {
  try {
    const existing = await readFile(envPath, "utf8");
    const additions = [];
    const hasKey = (key) => new RegExp(`^${key}=`, "mu").test(existing);

    if (!hasKey("POSTGRES_WRITE_PASSWORD")) {
      additions.push(`POSTGRES_WRITE_PASSWORD=${randomBytes(32).toString("base64url")}`);
    }
    if (!hasKey("POSTGRES_ADMIN_PASSWORD")) {
      additions.push(`POSTGRES_ADMIN_PASSWORD=${randomBytes(32).toString("base64url")}`);
    }
    if (!hasKey("KEYCLOAK_ADMIN")) additions.push("KEYCLOAK_ADMIN=admin");
    if (!hasKey("KEYCLOAK_ADMIN_PASSWORD")) {
      additions.push(`KEYCLOAK_ADMIN_PASSWORD=${randomBytes(32).toString("base64url")}`);
    }
    if (!hasKey("AUTH_SESSION_SECRET")) {
      additions.push(`AUTH_SESSION_SECRET=${randomBytes(32).toString("hex")}`);
    }
    if (!hasKey("OIDC_ISSUER")) {
      additions.push("OIDC_ISSUER=http://127.0.0.1:8081/realms/pluto");
    }
    if (!hasKey("OIDC_INTERNAL_ISSUER")) {
      additions.push("OIDC_INTERNAL_ISSUER=http://keycloak:8080/realms/pluto");
    }
    if (!hasKey("OIDC_CLIENT_ID")) additions.push("OIDC_CLIENT_ID=pluto-web");
    if (!hasKey("OIDC_REDIRECT_URI")) {
      additions.push("OIDC_REDIRECT_URI=http://127.0.0.1:3000/api/auth/callback");
    }
    if (!hasKey("SITE_URL")) additions.push("SITE_URL=http://127.0.0.1:3000");
    if (additions.length === 0) return "existing";
    await writeFile(envPath, `${existing.trimEnd()}\n${additions.join("\n")}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    return "updated";
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
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
