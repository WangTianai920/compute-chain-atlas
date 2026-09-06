import assert from "node:assert/strict";
import test from "node:test";
import { hasEnglishCompany, localizeCompany } from "../lib/i18n.ts";
import { getEnglishBusiness } from "../lib/company-business-translations.ts";

test("主营业务更新或公司不匹配时不复用旧译文", () => {
  const original = "数据中心运营。";
  assert.equal(getEnglishBusiness("300442", original), "Data center operations.");
  assert.equal(getEnglishBusiness("300442", "数据中心运营及其他新增业务。"), null);
  assert.equal(getEnglishBusiness("603002", original), null);
  assert.equal(getEnglishBusiness("toString", original), null);
});

test("数据库中已核验英文资料优先于内置映射", () => {
  const company = { code: "603002", name: "宏昌电子", thesis: "中文逻辑", nameEn: "Verified Legal Name Ltd.", thesisEn: "Verified English rationale.", enStatus: "verified" };
  assert.equal(localizeCompany(company, "en").name, "Verified Legal Name Ltd.");
  assert.equal(hasEnglishCompany(company), true);
});

test("无数据库英文且无内置映射的公司不会进入英文页面", () => {
  const company = { code: "600000", name: "测试公司", thesis: "中文逻辑", enStatus: "pending" };
  assert.equal(hasEnglishCompany(company), false);
  assert.equal(localizeCompany(company, "en").name, "测试公司");
});

test("宏昌电子与烽火通信已有可靠英文兜底", () => {
  assert.equal(hasEnglishCompany({ code: "603002" }), true);
  assert.equal(hasEnglishCompany({ code: "600498" }), true);
  assert.match(localizeCompany({ code: "600498", name: "烽火通信", thesis: "中文" }, "en").name, /FIBERHOME/);
});
