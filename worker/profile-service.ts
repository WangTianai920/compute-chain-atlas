import { CompanyProfileWorkflow } from "./company-profile-workflow";

export { CompanyProfileWorkflow };

type ProfileServiceEnv = {
  DB: D1Database;
  AI: Ai;
  COMPANY_PROFILE_WORKFLOW: Workflow;
};

const service = {
  async fetch(request: Request, env: ProfileServiceEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/start") return new Response("Not found", { status: 404 });
    const payload = await request.json<{ code?: string; jobId?: string }>();
    if (!/^\d{6}$/.test(payload.code ?? "") || !payload.jobId?.startsWith(payload.code!)) {
      return Response.json({ error: "Invalid profile job" }, { status: 400 });
    }
    await env.COMPANY_PROFILE_WORKFLOW.create({
      id: payload.jobId,
      params: { code: payload.code!, jobId: payload.jobId },
    });
    return Response.json({ queued: true }, { status: 202 });
  },
} satisfies ExportedHandler<ProfileServiceEnv>;

export default service;
