import { describe, expect, it } from "vitest";
import {
  createListingSchema,
  localeSchema,
  messageSchema,
  reportSchema,
} from "@/lib/validation";
import { deepLink, generateCode, webLink } from "@/lib/loginCode";

const valid = {
  category: "DOCUMENTS" as const,
  title: "Документы, папка А4",
  deadlineTo: "2099-01-01",
  priceRub: 3000,
  acceptTerms: true as const,
};

describe("createListingSchema", () => {
  it("принимает минимально заполненную заявку", () => {
    expect(createListingSchema.safeParse(valid).success).toBe(true);
  });

  it("без согласия с правилами заявку не принимает", () => {
    expect(
      createListingSchema.safeParse({ ...valid, acceptTerms: false }).success
    ).toBe(false);
    const { acceptTerms: _drop, ...withoutTerms } = valid;
    expect(createListingSchema.safeParse(withoutTerms).success).toBe(false);
  });

  it("слишком короткое название отклоняется", () => {
    expect(createListingSchema.safeParse({ ...valid, title: "ок" }).success).toBe(
      false
    );
  });

  it("название из пробелов не проходит", () => {
    expect(
      createListingSchema.safeParse({ ...valid, title: "      " }).success
    ).toBe(false);
  });

  it("цена должна быть положительным целым", () => {
    for (const priceRub of [0, -100, 1_000_001, 10.5]) {
      expect(createListingSchema.safeParse({ ...valid, priceRub }).success).toBe(
        false
      );
    }
  });

  it("начало срока не может быть позже конца", () => {
    const res = createListingSchema.safeParse({
      ...valid,
      deadlineFrom: "2099-02-01",
      deadlineTo: "2099-01-01",
    });
    expect(res.success).toBe(false);
  });

  it("совпадающие даты допустимы — доставка в конкретный день", () => {
    expect(
      createListingSchema.safeParse({
        ...valid,
        deadlineFrom: "2099-01-01",
        deadlineTo: "2099-01-01",
      }).success
    ).toBe(true);
  });

  it("вес вне разумных границ отклоняется", () => {
    expect(
      createListingSchema.safeParse({ ...valid, weightKg: -1 }).success
    ).toBe(false);
    expect(
      createListingSchema.safeParse({ ...valid, weightKg: 51 }).success
    ).toBe(false);
    expect(createListingSchema.safeParse({ ...valid, weightKg: 2.5 }).success).toBe(
      true
    );
  });

  it("вес с запятой не превращается в мусор", () => {
    // Форма шлёт число, но через API может прийти строка.
    const res = createListingSchema.safeParse({ ...valid, weightKg: "1,5" });
    expect(res.success).toBe(false);
  });

  it("неизвестная категория не проходит", () => {
    expect(
      createListingSchema.safeParse({ ...valid, category: "WEAPONS" }).success
    ).toBe(false);
  });

  it("пустые необязательные поля допустимы", () => {
    expect(
      createListingSchema.safeParse({
        ...valid,
        description: "",
        dimensions: "",
        pickupArea: "",
        photoUrl: "",
      }).success
    ).toBe(true);
  });
});

describe("messageSchema", () => {
  it("пустое сообщение и пробелы не проходят", () => {
    expect(messageSchema.safeParse({ text: "" }).success).toBe(false);
    expect(messageSchema.safeParse({ text: "   " }).success).toBe(false);
    expect(messageSchema.safeParse({ text: "\n\t " }).success).toBe(false);
  });

  it("длина ограничена", () => {
    expect(messageSchema.safeParse({ text: "x".repeat(2001) }).success).toBe(
      false
    );
    expect(messageSchema.safeParse({ text: "x".repeat(2000) }).success).toBe(
      true
    );
  });

  it("обрезает края", () => {
    const res = messageSchema.parse({ text: "  привет  " });
    expect(res.text).toBe("привет");
  });
});

describe("reportSchema / localeSchema", () => {
  it("жалоба требует причины", () => {
    expect(reportSchema.safeParse({ reason: "аб" }).success).toBe(false);
    expect(reportSchema.safeParse({ reason: "запрещённое вложение" }).success).toBe(
      true
    );
  });

  it("язык только из списка", () => {
    expect(localeSchema.safeParse({ locale: "ru" }).success).toBe(true);
    expect(localeSchema.safeParse({ locale: "en" }).success).toBe(false);
  });
});

describe("коды входа", () => {
  it("код нужной длины и без похожих символов", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCode();
      expect(code).toHaveLength(20);
      expect(code).toMatch(/^[a-z2-9]+$/);
      expect(code).not.toMatch(/[01lo]/);
    }
  });

  it("коды не повторяются", () => {
    const set = new Set(Array.from({ length: 500 }, () => generateCode()));
    expect(set.size).toBe(500);
  });

  it("диплинк открывает приложение, минуя сайты Telegram", () => {
    const link = deepLink("Dostavka_marketbot", "abc123");
    expect(link).toBe("tg://resolve?domain=Dostavka_marketbot&start=abc123");
    expect(link).not.toContain("telegram.org");
    expect(link).not.toContain("t.me");
  });

  it("запасная ссылка ведёт на t.me", () => {
    expect(webLink("Dostavka_marketbot", "abc123")).toBe(
      "https://t.me/Dostavka_marketbot?start=abc123"
    );
  });

  it("имя бота экранируется — в ссылку не подставить постороннее", () => {
    const link = deepLink("bot&evil=1", "code");
    expect(link).toContain("bot%26evil%3D1");
  });
});
