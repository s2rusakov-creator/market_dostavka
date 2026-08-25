import { describe, expect, it } from "vitest";
import {
  FALLBACK_MEAN,
  MIN_REVIEWS_TO_SHOW,
  PRIOR_WEIGHT,
  formatRating,
  platformMeanFrom,
  shrunkRating,
} from "@/lib/rating";

/**
 * Рейтинг при малом числе оценок.
 *
 * Голая средняя врала грубо: одна пятёрка давала ★5,0 и ставила новичка выше
 * человека с сорока сделками, одна несправедливая единица давала ★1,0 и
 * фактически выгоняла с площадки. Здесь проверяется, что оба перекоса ушли.
 */

const MEAN = 4.7;

describe("пока оценок мало — числа нет", () => {
  it("без оценок показывать нечего", () => {
    expect(shrunkRating(0, 0, MEAN)).toBeNull();
    expect(formatRating(0, 0, MEAN)).toBeNull();
  });

  it("одна пятёрка больше не даёт пять звёзд", () => {
    expect(shrunkRating(5, 1, MEAN)).toBeNull();
  });

  it("одна единица больше не приговор", () => {
    expect(shrunkRating(1, 1, MEAN)).toBeNull();
  });

  it("порог ровно на границе", () => {
    expect(shrunkRating(10, MIN_REVIEWS_TO_SHOW - 1, MEAN)).toBeNull();
    expect(shrunkRating(15, MIN_REVIEWS_TO_SHOW, MEAN)).not.toBeNull();
  });
});

describe("сжатие к средней по площадке", () => {
  it("три пятёрки не дотягивают до чистой пятёрки", () => {
    const value = shrunkRating(15, 3, MEAN)!;
    expect(value).toBeLessThan(5);
    expect(value).toBeGreaterThan(MEAN);
  });

  it("чем больше оценок, тем ближе к собственной средней", () => {
    const мало = shrunkRating(15, 3, MEAN)!;
    const много = shrunkRating(5 * 40, 40, MEAN)!;
    expect(много).toBeGreaterThan(мало);
    expect(много).toBeCloseTo(5, 1);
  });

  it("плохая средняя тоже подтягивается к общей, но остаётся плохой", () => {
    const value = shrunkRating(3 * 3, 3, MEAN)!;
    expect(value).toBeGreaterThan(3);
    expect(value).toBeLessThan(4);
  });

  it("вес прикидки — это ровно PRIOR_WEIGHT оценок по средней площадки", () => {
    // Человек со средней ровно как у площадки не должен смещаться вовсе.
    expect(shrunkRating(MEAN * 10, 10, MEAN)!).toBeCloseTo(MEAN, 6);
    expect(PRIOR_WEIGHT).toBeGreaterThan(0);
  });

  it("новичок не обгоняет опытного с почти той же средней", () => {
    const новичок = shrunkRating(5 * 3, 3, MEAN)!;
    const опытный = shrunkRating(4.9 * 40, 40, MEAN)!;
    // Раньше «★5,0 после трёх сделок» било «★4,9 после сорока».
    expect(опытный).toBeGreaterThan(новичок);
  });
});

describe("формат", () => {
  it("одна цифра после запятой, разделитель — запятая", () => {
    expect(formatRating(5 * 10, 10, MEAN)).toMatch(/^\d,\d$/);
  });

  it("мало оценок — строки нет", () => {
    expect(formatRating(5, 1, MEAN)).toBeNull();
  });
});

describe("средняя по площадке", () => {
  it("считается из суммарных счётчиков", () => {
    expect(platformMeanFrom(47, 10)).toBeCloseTo(4.7, 6);
  });

  it("на пустой площадке — нейтральная прикидка", () => {
    expect(platformMeanFrom(0, 0)).toBe(FALLBACK_MEAN);
    expect(platformMeanFrom(10, -1)).toBe(FALLBACK_MEAN);
  });

  it("битое значение не роняет расчёт", () => {
    expect(shrunkRating(15, 3, Number.NaN)).not.toBeNull();
  });
});
