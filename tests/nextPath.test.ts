import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/nextPath";

/**
 * Куда вернуть человека после входа.
 *
 * Значение приходит из адресной строки, то есть от кого угодно. Главное, что
 * здесь проверяется, — что наружу увести нельзя: ссылка вида
 * `/login?next=https://чужой-сайт` не должна работать, иначе перевод на
 * чужой сайт сразу после ввода пароля выглядел бы как действие самого YOL.
 */

describe("safeNextPath — куда можно вернуть", () => {
  it("обычный путь внутри сайта проходит", () => {
    expect(safeNextPath("/my")).toBe("/my");
    expect(safeNextPath("/chats/abc123")).toBe("/chats/abc123");
    expect(safeNextPath("/az/chats/abc123")).toBe("/az/chats/abc123");
  });

  it("путь с параметрами сохраняется целиком", () => {
    expect(safeNextPath("/?category=DOCUMENTS&sort=cheapest")).toBe(
      "/?category=DOCUMENTS&sort=cheapest"
    );
  });
});

describe("safeNextPath — куда нельзя", () => {
  it("чужой сайт не проходит", () => {
    expect(safeNextPath("https://чужой-сайт.example")).toBeNull();
    expect(safeNextPath("http://чужой-сайт.example/страница")).toBeNull();
  });

  it("протокол-относительный адрес не проходит", () => {
    // «//сайт» браузер понимает как внешний адрес по текущему протоколу —
    // самая частая дыра в таких проверках.
    expect(safeNextPath("//чужой-сайт.example")).toBeNull();
  });

  it("обратный слэш не помогает обойти проверку", () => {
    // Часть браузеров нормализует «/\» в «//».
    expect(safeNextPath("/\\чужой-сайт.example")).toBeNull();
  });

  it("javascript: не проходит", () => {
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
  });

  it("относительный путь без ведущего слэша не проходит", () => {
    expect(safeNextPath("my")).toBeNull();
    expect(safeNextPath("../admin")).toBeNull();
  });

  it("пустое значение — просто нет адреса", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath("")).toBeNull();
  });

  it("возврат на страницу входа отсекается — иначе кольцо", () => {
    expect(safeNextPath("/login")).toBeNull();
    expect(safeNextPath("/az/login")).toBeNull();
    expect(safeNextPath("/login?next=/my")).toBeNull();
  });
});
