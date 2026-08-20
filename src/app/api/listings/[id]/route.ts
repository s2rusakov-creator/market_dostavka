import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handle, HttpError } from "@/lib/api";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["DONE", "CANCELLED"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const { status } = patchSchema.parse(await req.json());

    const listing = await prisma.listing.findUnique({
      where: { id },
      select: { authorId: true, status: true },
    });
    if (!listing) throw new HttpError("NOT_FOUND", 404);
    if (listing.authorId !== user.id) throw new HttpError("FORBIDDEN", 403);
    if (listing.status === "DONE" || listing.status === "CANCELLED") {
      throw new HttpError("ALREADY_CLOSED", 409);
    }

    await prisma.listing.update({ where: { id }, data: { status } });

    // Счётчик доставок растёт только у того, кого отправитель реально выбрал.
    if (status === "DONE") {
      const accepted = await prisma.response.findFirst({
        where: { listingId: id, status: "ACCEPTED" },
        select: { travelerId: true },
      });
      if (accepted) {
        await prisma.user.update({
          where: { id: accepted.travelerId },
          data: { deliveriesCount: { increment: 1 } },
        });
      }
    }

    return { ok: true };
  });
}
