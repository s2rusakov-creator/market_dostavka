import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/api";
import { createListingSchema } from "@/lib/validation";
import { editListing } from "@/lib/editListing";

/**
 * Правка заявки.
 *
 * Отдельным адресом, а не расширением PATCH на той же заявке: там меняется
 * статус, то есть закрытие сделки. Смешивать «исправил опечатку в цене» и
 * «отметил доставленной» в одной ручке — верный способ однажды сделать второе,
 * имея в виду первое.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const data = createListingSchema.parse(await req.json());

    return editListing({ listingId: id, actorId: user.id, data });
  });
}
