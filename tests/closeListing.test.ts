import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { closeListing } from "@/lib/closeListing";

const DAY = 86400e3;

async function scene(responders = 0) {
  const author = await prisma.user.create({
    data: { firstName: "Марина", telegramId: 1n },
  });
  const listing = await prisma.listing.create({
    data: {
      authorId: author.id,
      category: "DOCUMENTS",
      title: "Документы, папка А4",
      priceRub: 3000,
      deadlineTo: new Date(Date.now() + DAY),
    },
  });

  const travelers = [];
  for (let i = 0; i < responders; i++) {
    const traveler = await prisma.user.create({
      data: { firstName: `Пассажир ${i}`, telegramId: BigInt(100 + i) },
    });
    await prisma.response.create({
      data: { listingId: listing.id, travelerId: traveler.id },
    });
    travelers.push(traveler);
  }

  return { author, listing, travelers };
}

const deliveries = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id } })).deliveriesCount;

beforeEach(async () => {
  await prisma.user.deleteMany({});
});

describe("закрытие заявки", () => {
  it("единственному откликнувшемуся доставка засчитывается", async () => {
    const { author, listing, travelers } = await scene(1);

    const res = await closeListing({
      listingId: listing.id,
      actorId: author.id,
      status: "DONE",
    });

    expect(res.creditedTo).toBe(travelers[0].id);
    expect(await deliveries(travelers[0].id)).toBe(1);

    const response = await prisma.response.findFirstOrThrow({
      where: { listingId: listing.id },
    });
    expect(response.status).toBe("ACCEPTED");
  });

  it("при нескольких откликах требует выбрать пассажира", async () => {
    const { author, listing } = await scene(3);

    await expect(
      closeListing({
        listingId: listing.id,
        actorId: author.id,
        status: "DONE",
      })
    ).rejects.toMatchObject({ code: "CHOOSE_TRAVELER" });

    // Заявка при этом остаётся открытой.
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(after.status).toBe("ACTIVE");
  });

  it("выбранному из нескольких засчитывается только ему", async () => {
    const { author, listing, travelers } = await scene(3);

    await closeListing({
      listingId: listing.id,
      actorId: author.id,
      status: "DONE",
      travelerId: travelers[1].id,
    });

    expect(await deliveries(travelers[0].id)).toBe(0);
    expect(await deliveries(travelers[1].id)).toBe(1);
    expect(await deliveries(travelers[2].id)).toBe(0);
  });

  it("нельзя засчитать доставку тому, кто не откликался", async () => {
    const { author, listing } = await scene(1);
    const stranger = await prisma.user.create({
      data: { firstName: "Посторонний", telegramId: 999n },
    });

    await expect(
      closeListing({
        listingId: listing.id,
        actorId: author.id,
        status: "DONE",
        travelerId: stranger.id,
      })
    ).rejects.toMatchObject({ code: "NOT_A_RESPONDER" });

    expect(await deliveries(stranger.id)).toBe(0);
  });

  it("заявку без откликов можно закрыть, никому не засчитывая", async () => {
    const { author, listing } = await scene(0);

    const res = await closeListing({
      listingId: listing.id,
      actorId: author.id,
      status: "DONE",
    });

    expect(res.creditedTo).toBeNull();
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(after.status).toBe("DONE");
  });

  it("снятие с публикации доставку не засчитывает", async () => {
    const { author, listing, travelers } = await scene(1);

    await closeListing({
      listingId: listing.id,
      actorId: author.id,
      status: "CANCELLED",
    });

    expect(await deliveries(travelers[0].id)).toBe(0);
  });

  it("чужую заявку закрыть нельзя", async () => {
    const { listing } = await scene(1);
    const stranger = await prisma.user.create({
      data: { firstName: "Посторонний", telegramId: 999n },
    });

    await expect(
      closeListing({
        listingId: listing.id,
        actorId: stranger.id,
        status: "DONE",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("повторное закрытие не удваивает счётчик", async () => {
    const { author, listing, travelers } = await scene(1);

    await closeListing({
      listingId: listing.id,
      actorId: author.id,
      status: "DONE",
    });
    await expect(
      closeListing({
        listingId: listing.id,
        actorId: author.id,
        status: "DONE",
      })
    ).rejects.toMatchObject({ code: "ALREADY_CLOSED" });

    expect(await deliveries(travelers[0].id)).toBe(1);
  });

  it("несуществующая заявка", async () => {
    const author = await prisma.user.create({
      data: { firstName: "Марина", telegramId: 1n },
    });

    await expect(
      closeListing({
        listingId: "нет-такой",
        actorId: author.id,
        status: "DONE",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
