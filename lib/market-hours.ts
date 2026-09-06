export type MarketState = {
  open: boolean;
  label: "休市" | "盘前" | "开盘集合竞价" | "开盘准备" | "交易中" | "午间休市" | "收盘集合竞价" | "已收盘";
};

// 上海证券交易所公布的 2026 年 A 股非周末休市日。
// 周末由 weekday 单独判断，避免把调休工作日误当作交易日。
const MARKET_HOLIDAYS = new Set([
  "2026-01-01", "2026-01-02",
  "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-23",
  "2026-04-06",
  "2026-05-01", "2026-05-04", "2026-05-05",
  "2026-06-19",
  "2026-09-25",
  "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07",
]);

export function getAshareMarketState(date = new Date()): MarketState {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = value("weekday");
  const dayKey = `${value("year")}-${value("month")}-${value("day")}`;
  const seconds = Number(value("hour")) * 3600 + Number(value("minute")) * 60 + Number(value("second"));

  if (weekday === "Sat" || weekday === "Sun" || MARKET_HOLIDAYS.has(dayKey)) {
    return { open: false, label: "休市" };
  }
  if (seconds < 9 * 3600 + 15 * 60) return { open: false, label: "盘前" };
  if (seconds < 9 * 3600 + 25 * 60) return { open: true, label: "开盘集合竞价" };
  if (seconds < 9 * 3600 + 30 * 60) return { open: false, label: "开盘准备" };
  if (seconds < 11 * 3600 + 30 * 60) return { open: true, label: "交易中" };
  if (seconds < 13 * 3600) return { open: false, label: "午间休市" };
  if (seconds < 14 * 3600 + 57 * 60) return { open: true, label: "交易中" };
  if (seconds < 15 * 3600) return { open: true, label: "收盘集合竞价" };
  return { open: false, label: "已收盘" };
}
