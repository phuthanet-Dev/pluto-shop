import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const productionDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(productionDir, "../..");
const defaultSourcePath = path.join(repositoryRoot, "infra", "keycloak", "realm-export.json");
const defaultOutputPath = path.join(productionDir, "runtime", "realm-production.json");
const baseRealm = JSON.parse(await readFile(defaultSourcePath, "utf8"));

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(name + " is required");
  }
  return value.trim();
}

function httpsOrigin(value, name) {
  const raw = requiredString(value, name);
  const candidate = raw.includes("://") ? raw : "https://" + raw;
  const url = new URL(candidate);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(name + " must be an HTTPS origin without a path");
  }
  return url.origin;
}

function smtpPort(value) {
  const port = Number(requiredString(String(value ?? ""), "SMTP_PORT"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  }
  return String(port);
}

export function buildProductionRealm({
  shopDomain,
  authDomain,
  smtpHost,
  smtpPort: configuredSmtpPort = 587,
  smtpFrom,
  smtpFromDisplayName = "Pluto Shop",
  smtpUsername,
  smtpPassword,
}) {
  const shopOrigin = httpsOrigin(shopDomain, "SHOP_DOMAIN");
  const authOrigin = httpsOrigin(authDomain, "AUTH_DOMAIN");
  const normalizedSmtpPort = smtpPort(configuredSmtpPort);
  const client = baseRealm.clients?.find(({ clientId }) => clientId === "pluto-web");
  if (!client) {
    throw new Error("The base realm does not contain the pluto-web client");
  }

  const realm = structuredClone(baseRealm);
  const productionClient = realm.clients.find(({ clientId }) => clientId === "pluto-web");

  realm.verifyEmail = true;
  realm.sslRequired = "external";
  realm.attributes = {
    ...(realm.attributes ?? {}),
    frontendUrl: authOrigin + "/",
  };
  realm.smtpServer = {
    host: requiredString(smtpHost, "SMTP_HOST"),
    port: normalizedSmtpPort,
    from: requiredString(smtpFrom, "SMTP_FROM"),
    fromDisplayName: requiredString(smtpFromDisplayName, "SMTP_FROM_DISPLAY_NAME"),
    auth: "true",
    starttls: normalizedSmtpPort === "465" ? "false" : "true",
    ssl: normalizedSmtpPort === "465" ? "true" : "false",
    user: requiredString(smtpUsername, "SMTP_USERNAME"),
    password: requiredString(smtpPassword, "SMTP_PASSWORD"),
  };
  productionClient.redirectUris = [shopOrigin + "/api/auth/callback"];
  productionClient.webOrigins = [shopOrigin];
  productionClient.attributes = {
    ...(productionClient.attributes ?? {}),
    "post.logout.redirect.uris": shopOrigin + "/api/auth/logout/callback*",
  };

  return realm;
}

export async function renderProductionRealm({
  env = process.env,
  outputPath = defaultOutputPath,
} = {}) {
  const realm = buildProductionRealm({
    shopDomain: env.SHOP_DOMAIN,
    authDomain: env.AUTH_DOMAIN,
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT ?? 587,
    smtpFrom: env.SMTP_FROM,
    smtpFromDisplayName: env.SMTP_FROM_DISPLAY_NAME ?? "Pluto Shop",
    smtpUsername: env.SMTP_USERNAME,
    smtpPassword: env.SMTP_PASSWORD,
  });

  await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(outputPath), 0o700);
  await writeFile(outputPath, JSON.stringify(realm, null, 2) + "\n", { mode: 0o644 });
  // The parent runtime directory remains 0700; 0644 lets the non-root Keycloak
  // container user read the bind-mounted file regardless of the host UID.
  await chmod(outputPath, 0o644);
  return outputPath;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const outputPath = await renderProductionRealm();
  console.log("Production realm written to " + outputPath);
}
