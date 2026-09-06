import assert from "node:assert/strict";
import test from "node:test";
import { balanceSectorRows, mergeCompanyMappings, summarizeSectorMappings } from "../lib/company-display.ts";

const mapping = (code: string, sectorId: number, role: "core" | "candidate" = "candidate") => ({
  code, sectorId, sectorSlug: `sector-${sectorId}`, sectorName: `板块${sectorId}`, sectorShortName: `S${sectorId}`, role,
  name: `公司${code}`, quote: { price: 10 },
});

test("产业重点标的按公司代码合并，并保留全部产业板块", () => {
  const result = mergeCompanyMappings([mapping("000001", 1, "core"), mapping("000001", 2), mapping("000002", 1)]);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].sectors.map(item => item.sectorId), [1, 2]);
  assert.deepEqual(result[0].sectors.map(item => item.role), ["core", "candidate"]);
  assert.equal(result[1].code, "000002");
});

test("异常重复的同板块映射不会产生重复标签", () => {
  const result = mergeCompanyMappings([mapping("000001", 1), mapping("000001", 1)]);
  assert.equal(result.length, 1);
  assert.equal(result[0].sectors.length, 1);
});

test("奇数映射上少下多，偶数映射均分，每行最多三个", () => {
  assert.deepEqual(balanceSectorRows([1, 2, 3]), [[1], [2, 3]]);
  assert.deepEqual(balanceSectorRows([1, 2, 3, 4]), [[1, 2], [3, 4]]);
  assert.deepEqual(balanceSectorRows([1, 2, 3, 4, 5]), [[1, 2], [3, 4, 5]]);
  assert.deepEqual(balanceSectorRows([1, 2, 3, 4, 5, 6, 7]), [[1, 2], [3, 4], [5, 6, 7]]);
});

test("折叠状态仅展示一个映射，产业龙头优先于活跃候选", () => {
  const candidate1 = { id: 1, role: "candidate" as const };
  const core = { id: 2, role: "core" as const };
  const candidate2 = { id: 3, role: "candidate" as const };
  assert.deepEqual(summarizeSectorMappings([candidate1]), { visible: [candidate1], hiddenCount: 0 });
  assert.deepEqual(summarizeSectorMappings([candidate1, core, candidate2]), { visible: [core], hiddenCount: 2 });
  assert.deepEqual(summarizeSectorMappings([candidate1, candidate2]), { visible: [candidate1], hiddenCount: 1 });
});
