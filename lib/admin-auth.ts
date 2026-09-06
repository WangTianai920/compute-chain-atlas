import { env } from "cloudflare:workers";

const COOKIE_NAME = "compute_admin_session";
const encoder = new TextEncoder();

function secrets() {
  const runtime = env as unknown as Record<string, string | undefined>;
  return { password: runtime.ADMIN_PASSWORD, sessionSecret: runtime.ADMIN_SESSION_SECRET };
}

export function adminAuthConfigured() {
  const { password, sessionSecret } = secrets();
  return Boolean(password && sessionSecret);
}

export async function verifyPassword(input: string) {
  const { password } = secrets();
  if (!password) return false;
  const [a, b] = await Promise.all([digest(input), digest(password)]);
  if (a.length !== b.length) return false;
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
  return different === 0;
}

export async function createSessionCookie() {
  const { sessionSecret } = secrets();
  if (!sessionSecret) throw new Error("管理员验证尚未配置");
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `admin.${expires}`;
  const signature = await sign(payload, sessionSecret);
  const token = `${toBase64Url(encoder.encode(payload))}.${signature}`;
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function isAdminRequest(request: Request) {
  const { sessionSecret } = secrets();
  if (!sessionSecret) return false;
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!token) return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;
  let payload: string;
  try { payload = new TextDecoder().decode(fromBase64Url(encoded)); } catch { return false; }
  const [role, expiresText] = payload.split(".");
  if (role !== "admin" || Number(expiresText) < Date.now()) return false;
  const expected = await sign(payload, sessionSecret);
  return expected === signature;
}

async function sign(payload: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}
async function digest(value: string) { return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))); }
function toBase64Url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function fromBase64Url(value: string) { const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="); return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0)); }
