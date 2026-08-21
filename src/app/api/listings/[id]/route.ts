import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { closeListing } from "@/lib/closeListing";

const patchSchema = z.object({
  status: z.enum(["DONE", "CANCELLED"]),
  /** Кого отправитель выбрал; нужен, когда откликнувшихся несколько. */
  travelerId: z.string().trim().min(1).max(40).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    return closeListing({
      listingId: id,
      actorId: user.id,
      status: body.status,
      travelerId: body.travelerId,
    });
  });
}
