import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { editListing } from "@/lib/editListing";
import { createListingSchema } from "@/lib/validation";

const DAY = 86400e3;
const через = (n: number) =>
  new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

/** Заполненная форма — то же, что приходит с клиента. */
function форма(over: Record<string, unknown> = {}) {
  return createListingSchema.parse({
    category: "DOCUMENTS",
    title: "Документы, папка А4",
    priceRub: 3000,
    deadlineTo: через(4),
    acceptTerms: true,
    ...over,
  });
}

async function scene(status: "ACTIVE" | "EXPIRED" | "DONE" = "ACTIVE") {
  const author = await prisma.user.create({
    data: { firstName: "Марина", telegramId: 1n },
  });
  const listing = await prisma.listing.create({
    data: {
      authorId: author.id,
      category: "DOCUMENTS",
      title: "Старое название",
      priceRub: 3000,
      deadlineTo: new Date(Date.now() + 4 * DAY),
      status,
    },
  });
  return { author, listing };
}

const перечитать = (id: string) =>
  prisma.listing.findUniqueOrThrow({ where: { id } });

beforeEach(async () => {
  await prisma.user.deleteMany({});
});

describe("правка заявки", () => {
  it("меняет содержание", async () => {
    const { author, listing } = await scene();

    await editListing({
      listingId: listing.id,
      actorId: author.id,
      data: форма({
        title: "Новое название",
        priceRub: 7000,
        category: "MEDICINE",
        description: "Две упаковки",
      }),
    });

    const после = await перечитать(listing.id);
    expect(после.title).toBe("Новое название");
    expect(после.priceRub).toBe(7000);
    expect(после.category).toBe("MEDICINE");
    expect(после.description).toBe("Две упаковки");
  });

  it("отклики и переписки остаются на месте", async () => {
    const { author, listing } = await scene();
    const traveler = await prisma.user.create({
      data: { firstName: "Рустам", telegramId: 2n },
    });
    await prisma.response.create({
      data: { listingId: listing.id, travelerId: traveler.id },
    });
    await prisma.thread.create({
      data: {
        listingId: listing.id,
        senderId: author.id,
        travelerId: traveler.id,
      },
    });

    await editListing({
      listingId: listing.id,
      actorId: author.id,
      data: форма({ priceRub: 9000 }),
    });

    // Ровно ради этого правка и делалась: раньше исправить цену можно было
    // только сняв заявку и заведя заново — вместе со всем, что к ней привязано.
    expect(await prisma.response.count()).toBe(1);
    expect(await prisma.thread.count()).toBe(1);
  });

  it("срок пересчитывается в конец суток", async () => {
    const { author, listing } = await scene();

    await editListing({
      listingId: listing.id,
      actorId: author.id,
      data: форма({ deadlineTo: "2030-08-27" }),
    });

    expect((await перечитать(listing.id)).deadlineTo.toISOString()).toBe(
      "2030-08-27T23:59:59.999Z"
    );
  });

  it("просроченная после правки срока снова живая", async () => {
    const { author, listing } = await scene("EXPIRED");

    await editListing({
      listingId: listing.id,
      actorId: author.id,
      data: форма({ deadlineTo: через(5) }),
    });

    // Иначе исправить дату было бы невозможно: заявка так и осталась бы
    // вне ленты со свежим сроком.
    expect((await перечитать(listing.id)).status).toBe("ACTIVE");
  });

  it("очищенные поля становятся пустыми, а не остаются старыми", async () => {
    const { author, listing } = await scene();
    await prisma.listing.update({
      where: { id: listing.id },
      data: { pickupArea: "Хамовники", urgent: true },
    });

    await editListing({
      listingId: listing.id,
      actorId: author.id,
      data: форма({ pickupArea: "", urgent: false }),
    });

    const после = await перечитать(listing.id);
    expect(после.pickupArea).toBeNull();
    expect(после.urgent).toBe(false);
  });
});

describe("кому править нельзя", () => {
  it("чужую заявку", async () => {
    const { listing } = await scene();
    const посторонний = await prisma.user.create({
      data: { firstName: "Посторонний", telegramId: 9n },
    });

    await expect(
      editListing({
        listingId: listing.id,
        actorId: посторонний.id,
        data: форма({ priceRub: 1 }),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect((await перечитать(listing.id)).priceRub).toBe(3000);
  });

  it("несуществующую", async () => {
    const { author } = await scene();

    await expect(
      editListing({
        listingId: "нет-такой",
        actorId: author.id,
        data: форма(),
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("закрытую сделку", async () => {
    const { author, listing } = await scene("DONE");

    // Переписывать условия задним числом нельзя: люди уже договорились,
    // и это видно в отзывах.
    await expect(
      editListing({
        listingId: listing.id,
        actorId: author.id,
        data: форма({ priceRub: 100 }),
      })
    ).rejects.toMatchObject({ code: "ALREADY_CLOSED" });
  });

  it("нельзя поставить срок в прошлом", async () => {
    const { author, listing } = await scene();

    await expect(
      editListing({
        listingId: listing.id,
        actorId: author.id,
        data: форма({ deadlineTo: через(-2) }),
      })
    ).rejects.toMatchObject({ code: "DEADLINE_PAST" });
  });
});
