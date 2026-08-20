import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/api";
import { localeSchema } from "@/lib/validation";

export async function POST(req: Request) {
  return handle(async () => {
    const user = await getCurrentUser();
    const { locale } = localeSchema.parse(await req.json());
    // Гостю просто нечего сохранять — молча выходим, ошибку не показываем.
    if (!user) return { ok: true };

    await prisma.user.update({ where: { id: user.id }, data: { locale } });
    return { ok: true };
  });
}
