import assert from "node:assert/strict";
import test from "node:test";
import { loadCompanyHistory } from "../lib/company-history.ts";
import { fetchHistoryData, parseSinaHistory, type HistoryPoint } from "../lib/market-history.ts";

const day = (index: number) => new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10);
const point = (index: number): HistoryPoint => ({
  date: day(index), open: 10 + index, close: 10.5 + index, high: 11 + index, low: 9.5 + index,
  volume: 1000 + index, amount: 10_000 + index, changePct: index ? 1 : 0,
});
const tencentPayload = (code: string, count: number, start = 0) => ({
  code: 0,
  data: { [`bj${code}`]: { qfqday: Array.from({ length: count }, (_, index) => {
    const p = point(index + start);
    return [p.date, String(p.open), String(p.close), String(p.high), String(p.low), String(p.volume)];
  }) } },
});
const eastmoneyPayload = (code: string, count: number) => ({
  data: { code, klines: Array.from({ length: count }, (_, index) => {
    const p = point(index);
    return [p.date, p.open, p.close, p.high, p.low, p.volume, p.amount, 0, p.changePct, 0, 0].join(",");
  }) },
});
const response = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 });
const sinaPayload = (count: number) => `/* public feed */\nvar _computeHistory=(${JSON.stringify(Array.from({ length: count }, (_, index) => {
  const p = point(index);
  return { day: p.date, open: String(p.open), close: String(p.close), high: String(p.high), low: String(p.low), volume: String(p.volume) };
}))});`;

test("incomplete primary history falls through to the more complete backup", async () => {
  const requests: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input); requests.push(url);
    return response(url.includes("gtimg") ? tencentPayload("920808", 1) : eastmoneyPayload("920808", 40));
  }) as typeof fetch;
  const history = await fetchHistoryData("920808", 40, fetchImpl);
  assert.equal(requests.length, 2);
  assert.equal(history.length, 40);
  assert.equal(history.at(-1)?.date, day(39));
});

test("a legitimately short listing history remains usable after both providers are checked", async () => {
  const fetchImpl = (async (input: string | URL | Request) => response(String(input).includes("gtimg")
    ? tencentPayload("920808", 28) : eastmoneyPayload("920808", 28))) as typeof fetch;
  const history = await fetchHistoryData("920808", 40, fetchImpl);
  assert.equal(history.length, 28);
  assert.equal(history.at(-1)?.date, day(27));
});

test("a complete primary response keeps the fast path and skips the backup", async () => {
  let requests = 0;
  const fetchImpl = (async () => { requests += 1; return response(tencentPayload("920808", 41)); }) as typeof fetch;
  const history = await fetchHistoryData("920808", 40, fetchImpl);
  assert.equal(requests, 1);
  assert.equal(history.length, 40);
});

test("the Beijing code-switch fallback parses a complete third-source series", async () => {
  const parsed = parseSinaHistory(sinaPayload(41), 40);
  assert.equal(parsed.length, 40);
  assert.equal(parsed.at(-1)?.date, day(40));
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("gtimg")) return response(tencentPayload("920808", 1, 41));
    if (url.includes("eastmoney")) return new Response("", { status: 503 });
    return new Response(sinaPayload(41), { status: 200 });
  }) as typeof fetch;
  const history = await fetchHistoryData("920808", 40, fetchImpl);
  assert.equal(history.length, 40);
  assert.equal(history.at(-1)?.date, day(41));
  assert.notEqual(history.at(-1)?.changePct, 0);
});

test("a one-point saved snapshot is ignored and replaced with chartable history", async () => {
  let written: unknown = null;
  const result = await loadCompanyHistory("920808", 40, {
    read: async () => ({ payload: { code: "920808", adjustment: "qfq", history: [point(0)], fetchedAt: "2026-09-02T03:00:00.000Z" } }),
    write: async (_key, value) => { written = value; },
    fetch: async () => Array.from({ length: 40 }, (_, index) => point(index)),
    now: Date.parse("2026-09-02T03:01:00.000Z"),
  });
  assert.equal(result.historyStatus, "current");
  assert.equal(result.history.length, 40);
  assert.ok(written);
});

test("a one-point live response is not persisted as current history", async () => {
  let writes = 0;
  const result = await loadCompanyHistory("920808", 40, {
    read: async () => null,
    write: async () => { writes += 1; },
    fetch: async () => [point(0)],
    now: Date.parse("2026-09-02T03:01:00.000Z"),
  });
  assert.equal(result.historyStatus, "unavailable");
  assert.deepEqual(result.history, []);
  assert.equal(writes, 0);
});
