import { isAdminRequest } from "../../../../../lib/admin-auth";
import { enrichCompanyEnglish } from "../../../../../lib/company-enrichment-runtime";
import { getCompanyRecord, markCompanyEnglishStatus, updateCompanyEnglish } from "../../../../../lib/data";

export async function POST(request: Request) {
  if (!(await isAdminRequest(request))) return Response.json({ error: "请先登录管理后台" }, { status: 401 });
  const { code } = await request.json() as { code?: string };
  if (!/^\d{6}$/.test(code ?? "")) return Response.json({ error: "股票代码必须是6位数字" }, { status: 400 });
  const company = await getCompanyRecord(code!);
  if (!company) return Response.json({ error: "未找到该标的" }, { status: 404 });

  await markCompanyEnglishStatus(company.code, "processing");
  try {
    const result = await enrichCompanyEnglish(company);
    const updated = await updateCompanyEnglish(company.code, { ...result, status: "verified" });
    console.log(JSON.stringify({ event: "company_english_enriched", code: company.code, source: result.sourceUrl }));
    return Response.json({ company: updated });
  } catch (error) {
    await markCompanyEnglishStatus(company.code, "needs_review");
    const message = error instanceof Error ? error.message : "英文资料自动补全失败";
    console.error(JSON.stringify({ event: "company_english_enrichment_failed", code: company.code, message }));
    return Response.json({ error: message, status: "needs_review" }, { status: 502 });
  }
}
