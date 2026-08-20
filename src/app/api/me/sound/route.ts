import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/api";
import { soundSchema } from "@/lib/validation";

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { soundEnabled } = soundSchema.parse(await req.json());
    await prisma.user.update({
      where: { id: user.id },
      data: { soundEnabled },
    });
    return { ok: true, soundEnabled };
  });
}
