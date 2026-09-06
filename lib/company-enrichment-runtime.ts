import { env } from "cloudflare:workers";
import { enrichCompanyEnglishData, type CompanyEnglishInput } from "./company-enrichment";

type TranslationResult = { translated_text?: string } | string;
type AiBinding = {
  run(model: "@cf/meta/m2m100-1.2b", input: { text: string; source_lang: "zh"; target_lang: "en" }): Promise<TranslationResult>;
};

export async function enrichCompanyEnglish(company: CompanyEnglishInput) {
  const ai = (env as unknown as { AI?: AiBinding }).AI;
  if (!ai) throw new Error("英文翻译服务尚未绑定");
  return enrichCompanyEnglishData(company, {
    translate: async (text) => {
      if (!text.trim()) throw new Error("请先填写中文入选逻辑");
      const result = await ai.run("@cf/meta/m2m100-1.2b", { text, source_lang: "zh", target_lang: "en" });
      return typeof result === "string" ? result : result.translated_text ?? "";
    },
  });
}
