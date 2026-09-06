import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, "data/research/2026-09-01-annual-business-profiles.json");
const outputPath = resolve(root, "data/research/2026-09-01-annual-business-translations.json");
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const probe = process.argv.includes("--probe");
let output = { generatedAt: null, provider: "Google Translate", profiles: [] };
try { output = JSON.parse(readFileSync(outputPath, "utf8")); }
catch { /* Start with an empty, resumable translation catalog. */ }

const cache = new Map();
for (const profile of output.profiles ?? []) {
  if (profile.sourceSummary && profile.summaryEn) cache.set(profile.sourceSummary, profile.summaryEn);
  for (const mapping of profile.mappings ?? []) if (mapping.sourceDetail && mapping.detailEn) cache.set(mapping.sourceDetail, mapping.detailEn);
}

const texts = [...new Set(source.companies.flatMap(profile => [profile.summary, ...profile.mappings.map(mapping => mapping.detail)]))];
let completed = 0;

async function translate(text) {
  if (cache.has(text)) return cache.get(text);
  const params = new URLSearchParams({ client: "gtx", sl: "zh-CN", tl: "en", dt: "t", q: text });
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      params.set("client", "dict-chrome-ex");
      const response = await fetch(`https://clients5.google.com/translate_a/t?${params}`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      const raw = typeof body?.[0] === "string" ? body[0] : body?.[0]?.map?.(part => part?.[0] ?? "").join("");
      const english = String(raw ?? "").replace(/\s+/g, " ").trim();
      if (!english || /[\p{Script=Han}]/u.test(english)) throw new Error("Translation is empty or still contains Chinese text");
      cache.set(text, english);
      completed += 1;
      if (completed % 10 === 0) process.stdout.write(`translated ${cache.size}/${texts.length}\n`);
      return english;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw new Error(`Translation failed after retries: ${lastError}`);
}

const pending = texts.filter(text => !cache.has(text)).slice(0, probe ? 1 : undefined);
for (let index = 0; index < pending.length; index += 4) {
  await Promise.all(pending.slice(index, index + 4).map(translate));
  const checkpoint = buildOutput();
  writeFileSync(outputPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
  await new Promise(resolve => setTimeout(resolve, 120));
}

const finalOutput = buildOutput();
writeFileSync(outputPath, `${JSON.stringify(finalOutput, null, 2)}\n`);
if (finalOutput.profiles.every(profile => profile.summaryEn && profile.mappings.every(mapping => mapping.detailEn))) {
  const byCode = new Map(finalOutput.profiles.map(profile => [profile.code, profile]));
  source.companies = source.companies.map(profile => {
    const translation = byCode.get(profile.code);
    if (!translation || translation.sourceSummary !== profile.summary) throw new Error(`Stale summary translation: ${profile.code}`);
    const mappings = new Map(translation.mappings.map(mapping => [mapping.sectorSlug, mapping]));
    return { ...profile, summaryEn: translation.summaryEn, mappings: profile.mappings.map(mapping => {
      const translated = mappings.get(mapping.sectorSlug);
      if (!translated || translated.sourceDetail !== mapping.detail) throw new Error(`Stale mapping translation: ${profile.code}:${mapping.sectorSlug}`);
      return { ...mapping, detailEn: translated.detailEn };
    }) };
  });
  writeFileSync(sourcePath, `${JSON.stringify(source, null, 2)}\n`);
}
console.log(JSON.stringify({ outputPath, profiles: finalOutput.profiles.length, texts: texts.length, translatedNow: completed }));

function buildOutput() {
  return {
    generatedAt: new Date().toISOString(),
    provider: "Google Translate",
    note: "Machine translation bound to the exact reviewed Chinese source text. The cited Chinese disclosure remains authoritative.",
    profiles: source.companies.map(profile => ({
      code: profile.code,
      sourceSummary: profile.summary,
      summaryEn: cache.get(profile.summary) ?? "",
      mappings: profile.mappings.map(mapping => ({
        sectorSlug: mapping.sectorSlug,
        sourceDetail: mapping.detail,
        detailEn: cache.get(mapping.detail) ?? "",
      })),
    })),
  };
}
