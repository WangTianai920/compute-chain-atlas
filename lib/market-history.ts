export type HistoryPoint = { date: string; open: number; close: number; high: number; low: number; volume: number; amount: number; changePct: number };

const PRIMARY_TIMEOUT_MS = 4_000, BACKUP_TIMEOUT_MS = 8_000;
export function isHistoryPoint(value: unknown): value is HistoryPoint {
  if (!value || typeof value !== "object") return false;
  const p = value as HistoryPoint;
  return /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(Date.parse(p.date))
    && [p.open, p.close, p.high, p.low].every(n => Number.isFinite(n) && n > 0)
    && p.high >= Math.max(p.open, p.close, p.low) && p.low <= Math.min(p.open, p.close)
    && [p.volume, p.amount, p.changePct].every(Number.isFinite);
}

export function normalizeHistory(points: HistoryPoint[], limit: number): HistoryPoint[] {
  const byDate = new Map(points.filter(isHistoryPoint).map(point => [point.date, point]));
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-limit);
}

export function parseTencentHistory(payload: unknown, symbol: string, limit: number): HistoryPoint[] {
  const value = payload as { code?: number; data?: Record<string, { qfqday?: unknown[][]; day?: unknown[][] }> } | null;
  if (value?.code != null && value.code !== 0) return [];
  const data = value?.data?.[symbol];
  const rows = data?.qfqday?.length ? data.qfqday : data?.day;
  if (!Array.isArray(rows)) return [];
  const prices = normalizeHistory(rows.filter(Array.isArray).map(row => ({
    date: String(row[0]), open: Number(row[1]), close: Number(row[2]), high: Number(row[3]), low: Number(row[4]), volume: Number(row[5]), amount: 0, changePct: 0,
  })), limit + 1);
  // Keep the extra previous close until daily changes have been calculated.
  return prices.map((point, index) => ({ ...point, changePct: index ? (point.close / prices[index - 1].close - 1) * 100 : 0 })).slice(-limit);
}

export function parseEastmoneyHistory(payload: unknown, code: string, limit: number): HistoryPoint[] {
  const data = (payload as { data?: { code?: string; klines?: unknown[] } } | null)?.data;
  if (data?.code !== code || !Array.isArray(data.klines)) return [];
  return normalizeHistory(data.klines.filter((line): line is string => typeof line === "string").map(line => {
    const p = line.split(",");
    return { date: p[0], open: Number(p[1]), close: Number(p[2]), high: Number(p[3]), low: Number(p[4]), volume: Number(p[5]), amount: Number(p[6]), changePct: Number(p[8]) };
  }), limit);
}

export function parseSinaHistory(payload: string, limit: number): HistoryPoint[] {
  const match = payload.match(/=\((\[[\s\S]*\])\);?\s*$/);
  if (!match) return [];
  try {
    const rows = JSON.parse(match[1]) as Record<string, unknown>[];
    const prices = normalizeHistory(rows.map(row => ({
      date: String(row.day ?? ""), open: Number(row.open), close: Number(row.close), high: Number(row.high), low: Number(row.low),
      volume: Number(row.volume), amount: 0, changePct: 0,
    })), limit + 1);
    return prices.map((point, index) => ({ ...point, changePct: index ? (point.close / prices[index - 1].close - 1) * 100 : 0 })).slice(-limit);
  } catch { return []; }
}

export async function fetchHistoryData(code: string, limit: number, fetchImpl: typeof fetch = fetch): Promise<HistoryPoint[]> {
  if (!/^\d{6}$/.test(code) || !Number.isInteger(limit) || limit < 1 || limit > 320) return [];
  const market = /^(4|8|92)/.test(code) ? "bj" : /^[569]/.test(code) ? "sh" : "sz";
  const symbol = `${market}${code}`;
  const tencent = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${limit + 1},qfq`;
  const eastmoney = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
  const sina = `https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20_computeHistory=/CN_MarketDataService.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=${limit + 1}`;
  const historyWindowStart = new Date(Date.now() - Math.max(limit * 4 + 30, 120) * 86_400_000).toISOString().slice(0, 10).replaceAll("-", "");
  for (const [key, value] of Object.entries({ secid: `${market === "sh" ? 1 : 0}.${code}`, fields1: "f1,f2,f3,f4,f5,f6", fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61", klt: "101", fqt: "1", beg: historyWindowStart, end: "20500101", lmt: String(limit) })) eastmoney.searchParams.set(key, value);
  // Tencent is the working primary. A non-empty but incomplete response must still
  // fall through to the backup provider (for example, after a security-code switch).
  let best: HistoryPoint[] = [];
  for (const [url, referer, timeoutMs, parse] of [
    [tencent, "https://gu.qq.com/", PRIMARY_TIMEOUT_MS, (json: unknown) => parseTencentHistory(json, symbol, limit)],
    [eastmoney.toString(), "https://quote.eastmoney.com/", BACKUP_TIMEOUT_MS, (json: unknown) => parseEastmoneyHistory(json, code, limit)],
  ] as const) {
    try {
      const response = await fetchImpl(url, { headers: { "user-agent": "Mozilla/5.0 ComputeChain/1.0", referer }, signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) continue;
      const points = parse(await response.json());
      if (points.length > best.length || points.length === best.length && (points.at(-1)?.date ?? "") > (best.at(-1)?.date ?? "")) best = points;
      if (points.length >= limit) return points;
    } catch { /* Try the other public provider, then let the caller use its saved history. */ }
  }
  // During a Beijing Stock Exchange 92-prefix code switch, the primary can expose
  // only the switch-day candle while the first backup is intermittently unavailable.
  if (best.length < limit && code.startsWith("92")) {
    try {
      const response = await fetchImpl(sina, { headers: { "user-agent": "Mozilla/5.0 ComputeChain/1.0", referer: "https://finance.sina.com.cn/" }, signal: AbortSignal.timeout(BACKUP_TIMEOUT_MS) });
      if (response.ok) {
        const points = parseSinaHistory(await response.text(), limit);
        const combined = normalizeHistory([...points, ...best], limit).map((point, index, all) => ({
          ...point, changePct: index ? (point.close / all[index - 1].close - 1) * 100 : 0,
        }));
        if (combined.length > best.length || combined.length === best.length && (combined.at(-1)?.date ?? "") > (best.at(-1)?.date ?? "")) best = combined;
      }
    } catch { /* Retain the most complete validated result from the earlier providers. */ }
  }
  return best;
}

export function periodChange(history: Pick<HistoryPoint, "close">[], days: number): number | null {
  if (!Number.isInteger(days) || days < 1 || history.length <= days) return null;
  const start = history[history.length - 1 - days].close, end = history[history.length - 1].close;
  return start > 0 && end > 0 && Number.isFinite(start) && Number.isFinite(end) ? (end / start - 1) * 100 : null;
}
