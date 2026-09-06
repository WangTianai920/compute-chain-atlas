import assert from "node:assert/strict";
import test from "node:test";
import { buildHistoricalVolatilityProfile, detectMarketAnomalies } from "../lib/anomaly.ts";

type Entry = {
  code: string;
  name: string;
  sectorId: number;
  sectorName: string;
  sectorShortName: string;
  quote: {
    changePct: number;
    volumeRatio: number;
    turnover: number;
    high: number;
    low: number;
    prevClose: number;
    updatedAt: string;
  };
};

function entry(code: string, changePct: number, volumeRatio = 1, sectorId = 1, options: { high?: number; low?: number; updatedAt?: string } = {}): Entry {
  return {
    code,
    name: `公司${code}`,
    sectorId,
    sectorName: `产业方向${sectorId}`,
    sectorShortName: `方向${sectorId}`,
    quote: {
      changePct,
      volumeRatio,
      turnover: 1,
      high: options.high ?? 101,
      low: options.low ?? 99,
      prevClose: 100,
      updatedAt: options.updatedAt ?? "2026-08-27T02:30:00.000Z",
    },
  };
}

test("量比不能单独触发个股异动", () => {
  const rows = [entry("1", 0), entry("2", 0.2), entry("3", -0.1), entry("4", 0.5, 5)];
  const result = detectMarketAnomalies(rows);
  assert.equal(result.individuals.length, 0);
  assert.equal(result.sectors.length, 0);
});

test("板块中位涨幅低于5%时不计入集体异动", () => {
  const rows = [entry("1", 4), entry("2", 5), entry("3", 6), entry("4", 4), entry("5", -1)];
  const result = detectMarketAnomalies(rows);
  assert.equal(result.sectors.length, 0);
});

test("板块中位涨幅达到5%时合并为一次集体异动", () => {
  const rows = [entry("1", 5), entry("2", 5), entry("3", 6), entry("4", 5), entry("5", -1)];
  const result = detectMarketAnomalies(rows);
  assert.equal(result.sectors.length, 1);
  assert.equal(result.sectors[0].directionCount, 4);
  assert.equal(result.individuals.length, 0);
});

test("显著偏离板块且放量时触发个股异动", () => {
  const rows = [entry("1", 0), entry("2", 0.2), entry("3", -0.1), entry("4", 5, 2.2)];
  const result = detectMarketAnomalies(rows);
  assert.equal(result.individuals.length, 1);
  assert.equal(result.individuals[0].company.code, "4");
  assert.equal(result.individuals[0].assessment.kind, "price-volume");
});

test("开盘观察期只识别极端价格异动", () => {
  const opening = "2026-08-27T01:35:00.000Z";
  const standardRows = [entry("1", 0, 1, 1, { updatedAt: opening }), entry("2", 0, 1, 1, { updatedAt: opening }), entry("3", 0, 1, 1, { updatedAt: opening }), entry("4", 5, 3, 1, { updatedAt: opening })];
  assert.equal(detectMarketAnomalies(standardRows).individuals.length, 0);
  standardRows[3] = entry("4", 8, 1, 1, { updatedAt: opening });
  assert.equal(detectMarketAnomalies(standardRows).individuals[0].assessment.kind, "extreme-price");
});

test("近20日异常波动可确认价格信号", () => {
  const rows = [entry("1", 0), entry("2", 0.2), entry("3", -0.1), entry("4", 5, 1)];
  const profile = buildHistoricalVolatilityProfile([0.2, -0.3, 0.4, -0.1, 0.1, -0.5, 0.3, 0.2, -0.2, 0.1, -0.4, 0.5]);
  assert.ok(profile);
  const result = detectMarketAnomalies(rows, { "4": profile });
  assert.equal(result.individuals.length, 1);
  assert.ok((result.individuals[0].assessment.historicalZ ?? 0) >= 2.5);
});

test("个股和板块信号合计最多展示15个", () => {
  const rows = Array.from({ length: 20 }, (_, sectorIndex) => Array.from({ length: 3 }, (_, companyIndex) => entry(`${sectorIndex}-${companyIndex}`, 4 + companyIndex, 1, sectorIndex + 1))).flat();
  const result = detectMarketAnomalies(rows);
  assert.equal(result.sectors.length + result.individuals.length, 15);
});
