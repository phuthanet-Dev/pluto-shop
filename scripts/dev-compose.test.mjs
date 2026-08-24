import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildLocalEnv, ensureLocalEnv, validateLocalEnv } from "./dev-compose.mjs";

test("buildLocalEnv creates required values without the example placeholder", () => {
  const content = buildLocalEnv("safe-random-value", "safe-random-app-value");

  assert.match(content, /^POSTGRES_DB=plutoshop$/m);
  assert.match(content, /^POSTGRES_USER=pluto$/m);
  assert.match(content, /^POSTGRES_PASSWORD=safe-random-value$/m);
  assert.match(content, /^POSTGRES_APP_PASSWORD=safe-random-app-value$/m);
  assert.doesNotMatch(content, /replace-with/);
});

test("ensureLocalEnv creates once and preserves an existing local secret", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pluto-env-"));
  const envPath = join(directory, ".env");

  const secrets = ["owner-secret", "app-secret"];
  const first = await ensureLocalEnv(envPath, () => secrets.shift());
  const second = await ensureLocalEnv(envPath, () => "unexpected-secret");
  const content = await readFile(envPath, "utf8");
  const metadata = await stat(envPath);

  assert.equal(first, "created");
  assert.equal(second, "existing");
  assert.match(content, /POSTGRES_PASSWORD=owner-secret/);
  assert.match(content, /POSTGRES_APP_PASSWORD=app-secret/);
  assert.doesNotMatch(content, /unexpected-secret/);
  assert.equal(metadata.isFile(), true);
});

test("validateLocalEnv accepts distinct long generated database passwords", () => {
  const content = buildLocalEnv("o".repeat(32), "a".repeat(32));
  assert.doesNotThrow(() => validateLocalEnv(content));
});

test("validateLocalEnv rejects committed example placeholders", () => {
  assert.throws(
    () => validateLocalEnv(buildLocalEnv("replace-with-owner-secret", "replace-with-app-secret")),
    /Replace the placeholder database passwords/,
  );
});

test("validateLocalEnv rejects a missing application password", () => {
  assert.throws(
    () => validateLocalEnv("POSTGRES_DB=plutoshop\nPOSTGRES_USER=pluto\nPOSTGRES_PASSWORD=owner-only"),
    /POSTGRES_APP_PASSWORD/,
  );
});

test("validateLocalEnv rejects reused database credentials", () => {
  const reused = "same-password-value-that-is-long";
  assert.throws(() => validateLocalEnv(buildLocalEnv(reused, reused)), /must be different/);
});

test("validateLocalEnv rejects unsafe database identifiers", () => {
  const content = buildLocalEnv("o".repeat(32), "a".repeat(32)).replace(
    "POSTGRES_DB=plutoshop",
    "POSTGRES_DB=pluto?sslmode=disable",
  );
  assert.throws(() => validateLocalEnv(content), /valid PostgreSQL identifier/);
});
