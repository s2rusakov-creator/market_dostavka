import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { findOrCreateOAuthUser } from "@/lib/accounts";
import { hashPassword, verifyPassword } from "@/lib/password";
import type { Profile } from "@/lib/oauth";

const profile = (over: Partial<Profile> = {}): Profile => ({
  providerAccountId: "google-1",
  email: "marina@example.com",
  firstName: "Марина",
  lastName: "Кулиева",
  photoUrl: null,
  ...over,
});

beforeEach(async () => {
  // Каскад от User уносит привязки, заявки и чаты.
  await prisma.user.deleteMany({});
});

describe("findOrCreateOAuthUser", () => {
  it("заводит нового пользователя и привязку", async () => {
    const { id } = await findOrCreateOAuthUser("google", profile());

    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      include: { oauthAccounts: true },
    });

    expect(user.email).toBe("marina@example.com");
    expect(user.firstName).toBe("Марина");
    expect(user.oauthAccounts).toHaveLength(1);
    expect(user.oauthAccounts[0].provider).toBe("google");
  });

  it("почту от провайдера считаем подтверждённой", async () => {
    const { id } = await findOrCreateOAuthUser("google", profile());
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it("повторный вход не плодит аккаунты", async () => {
    const first = await findOrCreateOAuthUser("google", profile());
    const second = await findOrCreateOAuthUser("google", profile());

    expect(second.id).toBe(first.id);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.oAuthAccount.count()).toBe(1);
  });

  it("почта приводится к нижнему регистру", async () => {
    const { id } = await findOrCreateOAuthUser(
      "google",
      profile({ email: "Marina@Example.COM" })
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user.email).toBe("marina@example.com");
  });

  it("второй провайдер с той же почтой ведёт в тот же профиль", async () => {
    const viaGoogle = await findOrCreateOAuthUser("google", profile());
    const viaMailru = await findOrCreateOAuthUser(
      "mailru",
      profile({ providerAccountId: "mailru-1" })
    );

    expect(viaMailru.id).toBe(viaGoogle.id);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.oAuthAccount.count()).toBe(2);
  });

  it("без почты аккаунты не склеиваются", async () => {
    const a = await findOrCreateOAuthUser(
      "google",
      profile({ email: null, providerAccountId: "no-email-1" })
    );
    const b = await findOrCreateOAuthUser(
      "mailru",
      profile({ email: null, providerAccountId: "no-email-2" })
    );

    expect(b.id).not.toBe(a.id);
    expect(await prisma.user.count()).toBe(2);
  });
});

describe("захват аккаунта через неподтверждённую почту", () => {
  it("пароль на чужой адрес стирается, когда приходит настоящий владелец", async () => {
    // Злоумышленник регистрируется на чужой адрес: подтверждения почты нет.
    const squatter = await prisma.user.create({
      data: {
        email: "marina@example.com",
        passwordHash: await hashPassword("пароль-злоумышленника"),
        firstName: "Не Марина",
      },
    });
    expect(squatter.emailVerifiedAt).toBeNull();

    // Приходит настоящая владелица через Google.
    const { id } = await findOrCreateOAuthUser("google", profile());
    expect(id).toBe(squatter.id);

    const after = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(after.passwordHash).toBeNull();
    expect(after.emailVerifiedAt).not.toBeNull();
  });

  it("подтверждённой почте пароль сохраняют — это тот же человек", async () => {
    const owner = await prisma.user.create({
      data: {
        email: "marina@example.com",
        passwordHash: await hashPassword("мой-длинный-пароль"),
        emailVerifiedAt: new Date(),
        firstName: "Марина",
      },
    });

    const { id } = await findOrCreateOAuthUser("google", profile());
    expect(id).toBe(owner.id);

    const after = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(after.passwordHash).not.toBeNull();
    expect(
      await verifyPassword("мой-длинный-пароль", after.passwordHash!)
    ).toBe(true);
  });

  it("склейка не теряет заявки существующего профиля", async () => {
    const owner = await prisma.user.create({
      data: { email: "marina@example.com", firstName: "Марина" },
    });
    await prisma.listing.create({
      data: {
        authorId: owner.id,
        category: "DOCUMENTS",
        title: "Документы, папка А4",
        deadlineTo: new Date(Date.now() + 86400e3),
        priceRub: 3000,
      },
    });

    const { id } = await findOrCreateOAuthUser("google", profile());
    expect(id).toBe(owner.id);
    expect(await prisma.listing.count({ where: { authorId: id } })).toBe(1);
  });
});
