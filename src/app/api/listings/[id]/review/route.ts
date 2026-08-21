import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { leaveReview } from "@/lib/reviews";

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().max(1000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const body = schema.parse(await req.json());

    return leaveReview({
      listingId: id,
      authorId: user.id,
      rating: body.rating,
      text: body.text,
    });
  });
}
