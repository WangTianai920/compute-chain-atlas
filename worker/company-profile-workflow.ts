import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import {
  composeAnnualBusinessProfile,
  loadProfileCompany,
  retrieveAnnualBusinessEvidence,
  translateAnnualBusinessProfile,
  validateProfileResult,
  writeProfileResult,
} from "../lib/company-profile-pipeline";
import { updateCompanyProfileJob } from "../lib/company-profile-job";

type Params = { code: string; jobId: string };
type ProfileWorkflowEnv = Pick<Cloudflare.Env, "DB" | "AI">;

const retry = { retries: { limit: 3, delay: "5 seconds", backoff: "exponential" as const }, timeout: "2 minutes" };

export class CompanyProfileWorkflow extends WorkflowEntrypoint<ProfileWorkflowEnv, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { code, jobId } = event.payload;
    try {
      await this.mark(step, code, jobId, "queued", 5);
      const company = await step.do("load-company", retry, () => loadProfileCompany(this.env.DB, code));

      await this.mark(step, code, jobId, "annual_report", 15);
      const evidence = await step.do("retrieve-and-extract-annual-report", retry, () => retrieveAnnualBusinessEvidence(company, fetch, async () => {
        await updateCompanyProfileJob(this.env.DB, code, jobId, { status: "running", stage: "extract", progress: 35, error: null });
      }));

      await this.mark(step, code, jobId, "compose", 50);
      const draft = await step.do("compose-business-profile", () => composeAnnualBusinessProfile(company, evidence.report, evidence.coreBusiness));

      await this.mark(step, code, jobId, "translate", 65);
      const translated = await step.do("translate-business-profile", retry, () => translateAnnualBusinessProfile(company, evidence, draft, text => this.translate(text)));

      await this.mark(step, code, jobId, "validate", 85);
      const validated = await step.do("validate-business-profile", () => validateProfileResult(translated, company));

      await this.mark(step, code, jobId, "write", 95);
      await step.do("write-business-profile", retry, async () => {
        const current = await updateCompanyProfileJob(this.env.DB, code, jobId, {});
        if (!current) throw new Error("任务已被新的重试取代");
        await writeProfileResult(this.env.DB, validated);
      });

      await updateCompanyProfileJob(this.env.DB, code, jobId, {
        status: "completed", stage: "completed", progress: 100, completedAt: new Date().toISOString(), error: null,
        reportYear: validated.profile.reportYear, sourceUrl: validated.profile.sourceUrl,
      });
      console.log(JSON.stringify({ event: "company_profile_completed", code, jobId, reportYear: validated.profile.reportYear }));
      return { code, reportYear: validated.profile.reportYear, sourceUrl: validated.profile.sourceUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateCompanyProfileJob(this.env.DB, code, jobId, { status: "failed", error: message.slice(0, 500), completedAt: new Date().toISOString() });
      console.error(JSON.stringify({ event: "company_profile_failed", code, jobId, error: message }));
      throw error;
    }
  }

  private async mark(step: WorkflowStep, code: string, jobId: string, stage: "queued" | "annual_report" | "extract" | "compose" | "translate" | "validate" | "write", progress: number) {
    await step.do(`status-${stage}`, retry, async () => {
      const updated = await updateCompanyProfileJob(this.env.DB, code, jobId, { status: "running", stage, progress, error: null });
      if (!updated) throw new Error("任务已被新的重试取代");
    });
  }

  private async translate(text: string) {
    if (!text.trim()) throw new Error("待翻译文本为空");
    const result = await this.env.AI.run("@cf/meta/m2m100-1.2b", { text, source_lang: "zh", target_lang: "en" });
    return "translated_text" in result ? result.translated_text ?? "" : "";
  }
}
