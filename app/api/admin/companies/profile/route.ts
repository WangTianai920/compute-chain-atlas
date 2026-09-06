import { createCompanyProfileJob, getCompanyRecord } from "../../../../../lib/data";
import { isAdminRequest } from "../../../../../lib/admin-auth";
import { PROFILE_JOB_HEADER } from "../../../../../lib/company-profile-job";

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return Response.json({ error: "请先登录管理后台" }, { status: 401 });
  const { code } = await request.json() as { code?: string };
  if (!/^\d{6}$/.test(code ?? "")) return Response.json({ error: "股票代码必须是6位数字" }, { status: 400 });
  const company = await getCompanyRecord(code!);
  if (!company) return Response.json({ error: "未找到该标的" }, { status: 404 });
  const job = await createCompanyProfileJob(code!);
  return Response.json({ job }, { status: 202, headers: { [PROFILE_JOB_HEADER]: job.id } });
}
