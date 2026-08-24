import { describe, expect, it } from "vitest";
import {
  IDLE_AFTER_MS,
  POLL_ACTIVE_MS,
  POLL_IDLE_MS,
  POLL_QUIET_MS,
  QUIET_AFTER_MS,
  nextPollDelay,
} from "@/lib/chatPolling";

describe("nextPollDelay", () => {
  it("пока идёт разговор — частый шаг", () => {
    expect(nextPollDelay(0)).toBe(POLL_ACTIVE_MS);
    expect(nextPollDelay(1_000)).toBe(POLL_ACTIVE_MS);
    expect(nextPollDelay(IDLE_AFTER_MS - 1)).toBe(POLL_ACTIVE_MS);
  });

  it("после минуты тишины шаг растёт", () => {
    expect(nextPollDelay(IDLE_AFTER_MS)).toBe(POLL_IDLE_MS);
    expect(nextPollDelay(3 * 60_000)).toBe(POLL_IDLE_MS);
    expect(nextPollDelay(QUIET_AFTER_MS - 1)).toBe(POLL_IDLE_MS);
  });

  it("после пяти минут — самый редкий шаг", () => {
    expect(nextPollDelay(QUIET_AFTER_MS)).toBe(POLL_QUIET_MS);
    expect(nextPollDelay(60 * 60_000)).toBe(POLL_QUIET_MS);
  });

  it("шаг только растёт, никогда не убывает", () => {
    const points = [0, 30_000, 59_999, 60_000, 120_000, 299_999, 300_000, 900_000];
    const delays = points.map(nextPollDelay);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
  });

  it("часы могли скакнуть назад — отрицательная тишина не роняет шаг", () => {
    expect(nextPollDelay(-5_000)).toBe(POLL_ACTIVE_MS);
  });

  it("за час молчания чат делает вдвое меньше запросов, чем делал бы раньше", () => {
    // Раньше был фиксированный шаг в пять секунд, то есть 720 запросов в час.
    const hour = 60 * 60_000;
    let spent = 0;
    let requests = 0;
    while (spent < hour) {
      spent += nextPollDelay(spent);
      requests++;
    }
    expect(requests).toBeLessThan(720 / 2);
  });
});
