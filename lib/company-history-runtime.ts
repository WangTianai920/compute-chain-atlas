import { readRuntimeSnapshot, writeRuntimeSnapshot } from "./data";
import { fetchHistoryData } from "./market-history";
import { loadCompanyHistory } from "./company-history";

export function getCompanyHistory(code: string, limit = 40) {
  return loadCompanyHistory(code, limit, { read: readRuntimeSnapshot, write: writeRuntimeSnapshot, fetch: fetchHistoryData });
}
