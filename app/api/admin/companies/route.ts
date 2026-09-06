import { createCompanyProfileJob, deleteCompanyEntry, listCompanyEntries, upsertCompanyEntry, updateCompanyEntry } from "../../../../lib/data";
import { isAdminRequest } from "../../../../lib/admin-auth";
import { PROFILE_JOB_HEADER } from "../../../../lib/company-profile-job";

async function guard(request: Request) { return (await isAdminRequest(request)) ? null : Response.json({ error: "请先登录管理后台" }, { status: 401 }); }
export async function GET(request: Request) { const denied = await guard(request); if (denied) return denied; return Response.json({ entries: await listCompanyEntries(true) }, { headers: { "cache-control": "no-store" } }); }
export async function POST(request: Request) {
  const denied = await guard(request); if (denied) return denied;
  const payload = await request.json(); const error = validate(payload); if (error) return Response.json({ error }, { status: 400 });
  const company = await upsertCompanyEntry(payload);
  const job = await createCompanyProfileJob(String(payload.code));
  return Response.json({ company, job }, { status: 201, headers: { [PROFILE_JOB_HEADER]: job.id } });
}
export async function PUT(request: Request) {
  const denied = await guard(request); if (denied) return denied;
  const payload = await request.json(); const error = validate(payload, true); if (error) return Response.json({ error }, { status: 400 });
  const company = await updateCompanyEntry(Number(payload.mappingId), payload);
  if (!company) return Response.json({ error: "找不到该标的" }, { status: 404 });
  const job = await createCompanyProfileJob(company.code);
  return Response.json({ company, job }, { headers: { [PROFILE_JOB_HEADER]: job.id } });
}
export async function DELETE(request: Request) {
  const denied = await guard(request); if (denied) return denied;
  const { mappingId } = await request.json() as { mappingId?: number }; if (!mappingId) return Response.json({ error: "缺少记录编号" }, { status: 400 });
  await deleteCompanyEntry(Number(mappingId)); return Response.json({ ok: true });
}
function validate(payload: Record<string, unknown>, requireId = false) {
  if (requireId && !Number(payload.mappingId)) return "缺少记录编号";
  if (!/^\d{6}$/.test(String(payload.code ?? "")) && !requireId) return "股票代码必须是6位数字";
  if (!String(payload.name ?? "").trim()) return "请填写公司名称";
  if (!String(payload.thesis ?? "").trim()) return "请填写入选逻辑";
  if (!String(payload.rationale ?? "").trim()) return "请填写本方向备注";
  if (!Number(payload.sectorId)) return "请选择产业方向";
  if (!(["core", "candidate"] as unknown[]).includes(payload.role)) return "请选择龙头类型";
  return null;
}
