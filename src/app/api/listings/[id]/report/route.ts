import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handle, HttpError } from "@/lib/api";
import { reportSchema } from "@/lib/validation";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const { reason } = reportSchema.parse(await req.json());

    const listing = await prisma.listing.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!listing) throw new HttpError("NOT_FOUND", 404);

    await prisma.report.upsert({
      where: { listingId_authorId: { listingId: id, authorId: user.id } },
      create: { listingId: id, authorId: user.id, reason },
      update: { reason },
    });

    return { ok: true };
  });
}
