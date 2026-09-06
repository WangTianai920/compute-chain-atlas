import test from "node:test";
import assert from "node:assert/strict";
import { coversRecentShanghaiWindow, isComputeInfrastructureNews, matchesNewsLanguage, parseNewsFeed, selectMarketNews } from "../lib/market-data.ts";

test("解析 RSS 与 Atom 新闻，并保留原始来源链接", () => {
  const rss = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[New liquid cooling system for AI servers]]></title><description>Rack cooling &amp; power</description><pubDate>Wed, 26 Aug 2026 08:00:00 GMT</pubDate><link>https://example.com/cooling</link><guid>cooling-1</guid></item></channel></rss>`;
  const atom = `<feed><entry><title>HBM capacity expands</title><summary>Memory for accelerators</summary><updated>2026-08-26T09:00:00Z</updated><link href="https://example.com/hbm"/><id>hbm-1</id></entry></feed>`;
  assert.deepEqual(parseNewsFeed(rss, "Test RSS", "rss")[0], {
    id: "rss-cooling-1", title: "New liquid cooling system for AI servers", summary: "Rack cooling & power", time: "Wed, 26 Aug 2026 08:00:00 GMT", source: "Test RSS", url: "https://example.com/cooling",
  });
  assert.equal(parseNewsFeed(atom, "Test Atom", "atom")[0]?.url, "https://example.com/hbm");
});

test("仅保留算力基础设施强相关内容或被跟踪公司新闻", () => {
  assert.equal(isComputeInfrastructureNews({ title: "AI data center adopts liquid cooling", summary: "GPU racks" }), true);
  assert.equal(isComputeInfrastructureNews({ title: "New AI photo editing app launched", summary: "consumer software" }), false);
  assert.equal(isComputeInfrastructureNews({ title: "Planning Your AI Design Journey", summary: "workflows that ship products" }), false);
  assert.equal(isComputeInfrastructureNews({ title: "Google TPUv8s for Training and Inference", summary: "accelerator architecture" }), true);
  assert.equal(isComputeInfrastructureNews({ title: "寒武纪发布新产品", summary: "" }, ["寒武纪"]), true);
});

test("中英文页面仅返回对应语言的新闻标题", () => {
  assert.equal(matchesNewsLanguage({ title: "OpenAI launches custom AI accelerator" }, "en"), true);
  assert.equal(matchesNewsLanguage({ title: "OpenAI launches custom AI accelerator" }, "zh"), false);
  assert.equal(matchesNewsLanguage({ title: "OpenAI推出自研算力芯片" }, "zh"), true);
  assert.equal(matchesNewsLanguage({ title: "OpenAI推出自研算力芯片" }, "en"), false);
  assert.equal(matchesNewsLanguage({ title: "300990" }, "en"), false);
});

test("先完成行业与语言筛选，再限制返回数量", () => {
  const noise = Array.from({ length: 805 }, (_, index) => ({
    id: `noise-${index}`,
    title: `Consumer application update ${index}`,
    summary: "Lifestyle software",
    time: "2026-08-28T08:00:00.000Z",
    source: "Test",
    url: `https://example.com/noise-${index}`,
  }));
  const relevant = {
    id: "old-relevant",
    title: "Google TPUv8s for Training and Inference",
    summary: "Accelerator architecture",
    time: "Wed, 26 Aug 2026 00:15:29 +0000",
    source: "Test",
    url: "https://example.com/relevant",
  };
  const selected = selectMarketNews([...noise, relevant], { language: "en", limit: 800 });
  assert.deepEqual(selected.map((item) => item.id), ["old-relevant"]);
});

test("首次抓取必须覆盖上海时区最近三日的最早一天", () => {
  const now = Date.parse("2026-08-28T10:00:00.000Z");
  const onlyRecent = [{ id: "recent", title: "GPU", summary: "", time: "2026-08-27T08:00:00.000Z", source: "Test", url: "https://example.com/recent" }];
  const reachesOldestDay = [{ id: "oldest", title: "TPU", summary: "", time: "Tue, 25 Aug 2026 23:45:32 +0000", source: "Test", url: "https://example.com/oldest" }];
  assert.equal(coversRecentShanghaiWindow(onlyRecent, now), false);
  assert.equal(coversRecentShanghaiWindow(reachesOldestDay, now), true);
});
