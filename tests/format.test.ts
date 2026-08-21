import { describe, expect, it } from "vitest";
import {
  displayName,
  formatDate,
  formatDateUntil,
  formatPrice,
  formatTime,
  formatWeight,
  initials,
  rating,
  relativeTime,
} from "@/lib/format";

const NBSP = " ";

describe("formatPrice", () => {
  it("разделяет разряды неразрывным пробелом", () => {
    expect(formatPrice(5400, "ru")).toBe(`5${NBSP}400`);
    expect(formatPrice(1234567, "ru")).toBe(`1${NBSP}234${NBSP}567`);
  });

  it("не трогает числа короче четырёх знаков", () => {
    expect(formatPrice(999, "ru")).toBe("999");
    expect(formatPrice(0, "ru")).toBe("0");
  });

  it("одинаков в обоих языках", () => {
    expect(formatPrice(5400, "az")).toBe(formatPrice(5400, "ru"));
  });
});

describe("formatWeight", () => {
  it("заменяет точку на запятую", () => {
    expect(formatWeight("2.5", "ru")).toBe("2,5");
    expect(formatWeight("0.3", "az")).toBe("0,3");
  });

  it("убирает хвостовые нули — Decimal отдаёт 4.00", () => {
    expect(formatWeight("4.00", "ru")).toBe("4");
    expect(formatWeight("1.20", "ru")).toBe("1,2");
  });

  it("возвращает исходное, если это не число", () => {
    expect(formatWeight("абв", "ru")).toBe("абв");
  });
});

describe("formatDate", () => {
  it("русский месяц в родительном падеже", () => {
    expect(formatDate(new Date(2026, 7, 24), "ru")).toBe("24 августа");
    expect(formatDate(new Date(2026, 0, 1), "ru")).toBe("1 января");
  });

  it("азербайджанский месяц в именительном", () => {
    expect(formatDate(new Date(2026, 8, 5), "az")).toBe("5 sentyabr");
  });
});

describe("formatDateUntil", () => {
  it("в азербайджанском ставит направительный падеж", () => {
    expect(formatDateUntil(new Date(2026, 7, 30), "az")).toBe("30 avqusta");
    expect(formatDateUntil(new Date(2026, 3, 2), "az")).toBe("2 aprelə");
  });

  it("в русском совпадает с обычной датой", () => {
    const d = new Date(2026, 7, 24);
    expect(formatDateUntil(d, "ru")).toBe(formatDate(d, "ru"));
  });
});

describe("formatTime", () => {
  it("дополняет нулями", () => {
    expect(formatTime(new Date(2026, 0, 1, 9, 5), "ru")).toBe("09:05");
    expect(formatTime(new Date(2026, 0, 1, 23, 59), "ru")).toBe("23:59");
  });
});

describe("relativeTime", () => {
  const ago = (ms: number) => new Date(Date.now() - ms);

  it("минуты по-русски склоняются", () => {
    expect(relativeTime(ago(60_000), "ru")).toBe(`1${NBSP}минуту назад`);
    expect(relativeTime(ago(3 * 60_000), "ru")).toBe(`3${NBSP}минуты назад`);
    expect(relativeTime(ago(7 * 60_000), "ru")).toBe(`7${NBSP}минут назад`);
  });

  it("одиннадцать–четырнадцать — особый случай русского счёта", () => {
    expect(relativeTime(ago(11 * 60_000), "ru")).toBe(`11${NBSP}минут назад`);
    expect(relativeTime(ago(12 * 60_000), "ru")).toBe(`12${NBSP}минут назад`);
    expect(relativeTime(ago(21 * 60_000), "ru")).toBe(`21${NBSP}минуту назад`);
  });

  it("часы и дни", () => {
    expect(relativeTime(ago(2 * 3600_000), "ru")).toBe(`2${NBSP}часа назад`);
    expect(relativeTime(ago(5 * 3600_000), "ru")).toBe(`5${NBSP}часов назад`);
    expect(relativeTime(ago(24 * 3600_000), "ru")).toBe("вчера");
    expect(relativeTime(ago(3 * 24 * 3600_000), "ru")).toBe(`3${NBSP}дня назад`);
  });

  it("свежее минуты — «только что»", () => {
    expect(relativeTime(ago(5_000), "ru")).toBe("только что");
  });

  it("часы сервера могут отставать: будущее не показываем отрицательным", () => {
    const future = new Date(Date.now() + 30_000);
    expect(relativeTime(future, "ru")).toBe("только что");
  });

  it("азербайджанский без склонений", () => {
    expect(relativeTime(ago(5 * 60_000), "az")).toBe(`5${NBSP}dəq əvvəl`);
    expect(relativeTime(ago(24 * 3600_000), "az")).toBe("dünən");
  });
});

describe("initials", () => {
  it("берёт первые буквы имени и фамилии", () => {
    expect(initials("Марина", "Кулиева")).toBe("МК");
    expect(initials("Артём")).toBe("А");
  });

  it("не падает на пустых значениях", () => {
    expect(initials("", null)).toBe("?");
    expect(initials("  ", "  ")).toBe("?");
  });
});

describe("displayName", () => {
  it("сокращает фамилию до буквы", () => {
    expect(displayName("Марина", "Кулиева")).toBe("Марина К.");
    expect(displayName("Артём", null)).toBe("Артём");
  });

  it("пустая фамилия не ломает вывод", () => {
    expect(displayName("Артём", "")).toBe("Артём");
    expect(displayName("Артём", "   ")).toBe("Артём");
  });
});

describe("rating", () => {
  it("считает среднее с одним знаком и запятой", () => {
    expect(rating(49, 10)).toBe("4,9");
    expect(rating(50, 10)).toBe("5,0");
  });

  it("без оценок возвращает null", () => {
    expect(rating(0, 0)).toBeNull();
  });
});
