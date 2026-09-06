import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

// This check always targets a loopback server started by this process.
const port = 5179;
const origin = `http://127.0.0.1:${port}`;
const server = spawn("npm", ["run", "dev:local", "--", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, COMPUTE_CHAIN_LOCAL_ONLY: "1", BROWSER: "none" },
  stdio: ["ignore", "pipe", "pipe"],
  detached: process.platform !== "win32",
});
let output = "";
let exited = false;
let startError;
server.stdout.on("data", chunk => { output = (output + chunk).slice(-16000); });
server.stderr.on("data", chunk => { output = (output + chunk).slice(-16000); });
server.on("exit", () => { exited = true; });
server.on("error", error => { startError = error; });

try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (startError) throw startError;
    if (exited) throw new Error(`Development server exited before becoming ready.\n${output}`);
    try {
      const response = await fetch(`${origin}/api/admin/session`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        const session = await response.json();
        assert.equal(session.authenticated, false);
        ready = true;
        break;
      }
    } catch { /* Retry only while this development server is starting. */ }
    await delay(1000);
  }
  assert.ok(ready, `Development server did not become ready.\n${output}`);
  const response = await fetch(`${origin}/api/market?mode=overview`, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, "Overview should initialize the isolated D1 database");
  const overview = await response.json();
  assert.ok(overview.companies.some(company => company.code === "688256" && company.name));
  assert.ok(overview.sectors.length > 0);
  assert.ok(overview.counts.companies > 0);
  const page = await fetch(`${origin}/`, { signal: AbortSignal.timeout(30000) });
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await page.text(), /<html/);
  console.log("Cloud smoke check passed: homepage, unauthenticated admin session, and seeded development D1 overview.");
} finally {
  if (server.pid && !exited) {
    if (process.platform === "win32") server.kill("SIGTERM");
    else process.kill(-server.pid, "SIGTERM");
  }
}
