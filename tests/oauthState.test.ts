import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EncryptJWT } from "jose";
import { createHash } from "node:crypto";
import { packState, unpackState } from "@/lib/oauthState";

/**
 * Состояние входа через провайдера, которое едет в самом параметре state.
 *
 * Проверяем не только «упаковали и распаковали», но и то, ради чего это
 * шифруется: подсмотреть проверочное слово PKCE снаружи нельзя, а подменить
 * пакет — тем более.
 */

const original = { ...process.env };

const SECRET = "секрет-подлиннее-тридцати-двух-символов-точно";

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});

afterEach(() => {
  process.env = { ...original };
});

const sample = {
  provider: "google",
  pair: "abc23def45ghi67jkl89",
  codeVerifier: "проверочное-слово",
  locale: "ru",
};

describe("oauthState", () => {
  it("возвращает то же самое, что упаковали", async () => {
    const packed = await packState(sample);
    expect(await unpackState(packed)).toEqual(sample);
  });

  it("не показывает содержимое в самой строке", async () => {
    const packed = await packState(sample);

    // Именно ради этого шифрование, а не подпись: state видят и человек,
    // и провайдер, а проверочное слово PKCE предназначено только нам.
    expect(packed).not.toContain(sample.codeVerifier);
    expect(packed).not.toContain(sample.pair);
  });

  it("даёт каждый раз новую строку при тех же данных", async () => {
    const a = await packState(sample);
    const b = await packState(sample);
    expect(a).not.toEqual(b);
  });

  it("отвергает пакет, собранный на другом секрете", async () => {
    const packed = await packState(sample);

    process.env.SESSION_SECRET = "совершенно-другой-секрет-тоже-длинный-очень";
    expect(await unpackState(packed)).toBeNull();
  });

  it("отвергает испорченный пакет", async () => {
    const packed = await packState(sample);

    // Меняем первый знак шифротекста. Именно первый: в последнем знаке
    // base64url часть битов не используется, и подмена там может пройти
    // незамеченной — проверка целостности тут ни при чём.
    const parts = packed.split(".");
    parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);

    expect(await unpackState(parts.join("."))).toBeNull();
  });

  it("отвергает случайную строку и пустоту", async () => {
    expect(await unpackState("")).toBeNull();
    expect(await unpackState("не-наш-state")).toBeNull();
    // Обычный state браузерного входа — тоже не наш пакет: именно по этому
    // признаку callback и различает два пути возврата.
    expect(await unpackState("Zm9vYmFyYmF6cXV1eA")).toBeNull();
  });

  it("отвергает свой же пакет, если в нём не хватает полей", async () => {
    // Собран нашим ключом, то есть расшифруется, — но без codeVerifier.
    // Без него обмен кода на токен всё равно не состоится, и полагаться на
    // такой пакет нельзя, даже если подпись сошлась.
    const key = new Uint8Array(
      createHash("sha256").update(new TextEncoder().encode(SECRET)).digest()
    );
    const packed = await new EncryptJWT({ provider: "google", pair: "x", locale: "ru" })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .setExpirationTime("10m")
      .encrypt(key);

    expect(await unpackState(packed)).toBeNull();
  });

  it("отвергает просроченный пакет", async () => {
    const key = new Uint8Array(
      createHash("sha256").update(new TextEncoder().encode(SECRET)).digest()
    );
    const packed = await new EncryptJWT({ ...sample })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .setExpirationTime("-1m")
      .encrypt(key);

    expect(await unpackState(packed)).toBeNull();
  });
});
