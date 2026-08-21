import { describe, expect, it } from "vitest";
import {
  hashPassword,
  normalizeEmail,
  passwordProblem,
  verifyPassword,
} from "@/lib/password";

describe("hashPassword / verifyPassword", () => {
  it("верный пароль проходит проверку", async () => {
    const stored = await hashPassword("verylongpassword1");
    expect(await verifyPassword("verylongpassword1", stored)).toBe(true);
  });

  it("неверный пароль не проходит", async () => {
    const stored = await hashPassword("verylongpassword1");
    expect(await verifyPassword("verylongpassword2", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("одинаковые пароли дают разные хеши — соль случайна", async () => {
    const a = await hashPassword("verylongpassword1");
    const b = await hashPassword("verylongpassword1");
    expect(a).not.toBe(b);
  });

  it("в хеше нет самого пароля", async () => {
    const stored = await hashPassword("совершенно-секретно");
    expect(stored).not.toContain("совершенно-секретно");
  });

  it("формат хранения описывает параметры", async () => {
    const stored = await hashPassword("verylongpassword1");
    expect(stored.split("$")[0]).toBe("scrypt");
    expect(stored.split("$")).toHaveLength(6);
  });

  it("испорченный хеш не роняет проверку", async () => {
    for (const broken of ["", "мусор", "scrypt$", "bcrypt$1$2$3$4$5"]) {
      expect(await verifyPassword("verylongpassword1", broken)).toBe(false);
    }
  });

  it("подменённый хеш при сохранённых параметрах отвергается", async () => {
    const stored = await hashPassword("verylongpassword1");
    const parts = stored.split("$");
    parts[5] = Buffer.alloc(32).toString("base64url");
    expect(await verifyPassword("verylongpassword1", parts.join("$"))).toBe(
      false
    );
  });

  it("пароль с юникодом сравнивается стабильно", async () => {
    // «é» можно записать одним символом или буквой с комбинирующим знаком.
    const composed = "Café-пароль-длинный";
    const precomposed = "Café-пароль-длинный";
    const stored = await hashPassword(composed);
    expect(await verifyPassword(precomposed, stored)).toBe(true);
  });
});

describe("passwordProblem", () => {
  it("короче восьми — отказ", () => {
    expect(passwordProblem("1234567")).toBe("short");
  });

  it("ровно восемь — допустимо", () => {
    expect(passwordProblem("12345678")).toBeNull();
  });

  it("слишком длинный отсекается: scrypt на мегабайтном вводе дорог", () => {
    expect(passwordProblem("x".repeat(201))).toBe("long");
    expect(passwordProblem("x".repeat(200))).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("приводит к нижнему регистру и убирает пробелы", () => {
    expect(normalizeEmail("  Ivan.Petrov@GMail.com ")).toBe(
      "ivan.petrov@gmail.com"
    );
  });
});
