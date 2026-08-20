import { requireUser } from "@/lib/auth";
import { handle, HttpError } from "@/lib/api";
import { saveImage } from "@/lib/storage";

export async function POST(req: Request) {
  return handle(async () => {
    await requireUser();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError("NO_FILE", 400);

    const url = await saveImage(file);
    return { url };
  });
}
