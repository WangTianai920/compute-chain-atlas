import { getCompanyRecord } from "../../../../../lib/data";
import { getCompanyHistory } from "../../../../../lib/company-history-runtime";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  if (!/^\d{6}$/.test(code)) return Response.json({ error: "invalid_code" }, { status: 400 });
  if (!await getCompanyRecord(code)) return Response.json({ error: "company_not_found" }, { status: 404 });
  const result = await getCompanyHistory(code);
  return Response.json(result, { headers: { "cache-control": result.historyStatus === "current" ? "public, max-age=15" : "no-store" } });
}
