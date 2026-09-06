import assert from "node:assert/strict";
import test from "node:test";
import { classifySnapshot, marketSnapshotKey, marketSnapshotPolicies, mergeRecentNews, normalizeMarketMode, shouldRefreshSignalSnapshot } from "../lib/market-snapshot.ts";

test("市场接口模式保持兼容，未识别模式回退到完整数据", () => {
  assert.equal(normalizeMarketMode("overview"), "overview");
  assert.equal(normalizeMarketMode("signals"), "signals");
  assert.equal(normalizeMarketMode("news"), "news");
  assert.equal(normalizeMarketMode("quotes"), "quotes");
  assert.equal(normalizeMarketMode(null), "full");
  assert.equal(normalizeMarketMode("unexpected"), "full");
  assert.equal(marketSnapshotKey("overview", "zh"), "market:overview:zh");
});

test("快照按新鲜、可后台更新和过期三个阶段分类", () => {
  const now = Date.parse("2026-08-28T10:00:00.000Z");
  const policy = marketSnapshotPolicies.overview;
  assert.equal(classifySnapshot("2026-08-28T09:59:50.000Z", policy, now), "fresh");
  assert.equal(classifySnapshot("2026-08-28T09:59:30.000Z", policy, now), "stale");
  assert.equal(classifySnapshot("2026-08-28T09:50:00.000Z", policy, now), "expired");
  assert.equal(classifySnapshot("invalid", policy, now), "expired");
});

test("异动快照缺失或超过刷新周期时触发后台更新", () => {
  const now = Date.parse("2026-08-28T10:00:00.000Z");
  assert.equal(shouldRefreshSignalSnapshot(null, now), true);
  assert.equal(shouldRefreshSignalSnapshot("2026-08-28T09:59:30.000Z", now), false);
  assert.equal(shouldRefreshSignalSnapshot("2026-08-28T09:58:00.000Z", now), true);
});

test("增量新闻与旧快照合并、去重并仅保留上海时区最近三日", () => {
  const now = Date.parse("2026-08-28T10:00:00.000Z");
  const previous = [
    { id: "old", title: "旧标题", summary: "", time: "2026-08-26T03:00:00.000Z", source: "Test", url: "https://example.com/old" },
    { id: "expired", title: "已过期", summary: "", time: "2026-08-25T03:00:00.000Z", source: "Test", url: "https://example.com/expired" },
  ];
  const incoming = [
    { id: "new", title: "新标题", summary: "", time: "2026-08-28T09:00:00.000Z", source: "Test", url: "https://example.com/new" },
    { id: "duplicate", title: "旧标题", summary: "更新", time: "2026-08-28T08:00:00.000Z", source: "Test", url: "https://example.com/updated" },
  ];
  const merged = mergeRecentNews(previous, incoming, now);
  assert.deepEqual(merged.map((item) => item.id), ["new", "duplicate"]);
});
