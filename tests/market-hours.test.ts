import assert from "node:assert/strict";
import test from "node:test";
import { getAshareMarketState } from "../lib/market-hours.ts";

function shanghaiTime(value: string) {
  return new Date(`${value}+08:00`);
}

test("周四正常交易，不会被误判为周末", () => {
  assert.deepEqual(getAshareMarketState(shanghaiTime("2026-08-27T09:45:00")), { open: true, label: "交易中" });
});

test("周二正常交易，不会被 weekday 中的字母误判", () => {
  assert.deepEqual(getAshareMarketState(shanghaiTime("2026-08-25T10:00:00")), { open: true, label: "交易中" });
});

test("周末与交易所节假日显示休市", () => {
  assert.deepEqual(getAshareMarketState(shanghaiTime("2026-08-29T10:00:00")), { open: false, label: "休市" });
  assert.deepEqual(getAshareMarketState(shanghaiTime("2026-10-01T10:00:00")), { open: false, label: "休市" });
});

test("交易日各时段状态边界正确", () => {
  assert.deepEqual(getAshareMarketState(shanghaiTime("2026-08-27T09:20:00")), { open: true, label: "开盘集合竞价" });
  assert.deepEqual(getAshareMarketState(shanghaiTime("2026-08-27T09:27:00")), { open: false, label: "开盘准备" });
  assert.deepEqual(getAshareMarketState(shanghaiTime("2026-08-27T11:30:00")), { open: false, label: "午间休市" });
  assert.deepEqual(getAshareMarketState(shanghaiTime("2026-08-27T14:58:00")), { open: true, label: "收盘集合竞价" });
  assert.deepEqual(getAshareMarketState(shanghaiTime("2026-08-27T15:00:00")), { open: false, label: "已收盘" });
});
