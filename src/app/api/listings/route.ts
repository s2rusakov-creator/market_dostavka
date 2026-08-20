import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handle, HttpError } from "@/lib/api";
import { createListingSchema } from "@/lib/validation";

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const data = createListingSchema.parse(await req.json());

    const endOfDay = new Date(data.deadlineTo);
    endOfDay.setHours(23, 59, 59, 999);
    if (endOfDay.getTime() < Date.now()) {
      throw new HttpError("DEADLINE_PAST", 422);
    }

    // Согласие с правилами фиксируем на пользователе — оно нужно один раз.
    if (data.acceptTerms) {
      await prisma.user.update({
        where: { id: user.id },
        data: { acceptedTermsAt: new Date() },
      });
    }

    const listing = await prisma.listing.create({
      data: {
        authorId: user.id,
        category: data.category,
        title: data.title,
        description: data.description || null,
        weightKg: data.weightKg ?? null,
        sizePreset: data.sizePreset ?? null,
        dimensions: data.dimensions || null,
        deadlineFrom: data.deadlineFrom ?? null,
        deadlineTo: endOfDay,
        pickupArea: data.pickupArea || null,
        priceRub: data.priceRub,
        photoUrl: data.photoUrl || null,
        urgent: data.urgent ?? false,
        fragile: data.fragile ?? false,
        needsLuggage: data.needsLuggage ?? false,
      },
      select: { id: true },
    });

    return { id: listing.id };
  });
}
