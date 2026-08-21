import { describe, expect, it } from "vitest";
import { MAX_EDGE, targetSize } from "@/lib/imageCompression";

describe("targetSize", () => {
  it("уменьшает горизонтальный снимок по длинной стороне", () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  });

  it("уменьшает вертикальный снимок", () => {
    expect(targetSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it("не растягивает то, что и так меньше", () => {
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetSize(96, 96)).toEqual({ width: 96, height: 96 });
  });

  it("ровно на границе ничего не меняет", () => {
    expect(targetSize(MAX_EDGE, 900)).toEqual({ width: MAX_EDGE, height: 900 });
  });

  it("сохраняет пропорции", () => {
    const src = { width: 5000, height: 2000 };
    const out = targetSize(src.width, src.height);
    expect(out.width / out.height).toBeCloseTo(src.width / src.height, 2);
  });

  it("квадрат остаётся квадратом", () => {
    expect(targetSize(3000, 3000)).toEqual({ width: 1600, height: 1600 });
  });

  it("вытянутая полоска не схлопывается в ноль", () => {
    const out = targetSize(8000, 3);
    expect(out.width).toBe(1600);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });

  it("предел можно задать вручную", () => {
    expect(targetSize(4000, 2000, 400)).toEqual({ width: 400, height: 200 });
  });
});
