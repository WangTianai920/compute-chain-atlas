import { adminAuthConfigured, createSessionCookie, verifyPassword } from "../../../../lib/admin-auth";
export async function POST(request: Request) {
  if (!adminAuthConfigured()) return Response.json({ error: "管理员密码尚未在部署环境中配置" }, { status: 503 });
  const { password } = await request.json() as { password?: string };
  if (!password || !(await verifyPassword(password))) return Response.json({ error: "密码不正确" }, { status: 401 });
  return Response.json({ ok: true }, { headers: { "set-cookie": await createSessionCookie(), "cache-control": "no-store" } });
}
