import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handle, HttpError } from "@/lib/api";
import { createSession } from "@/lib/session";
import { hashPassword, normalizeEmail, passwordProblem } from "@/lib/password";

const schema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().max(60).optional().or(z.literal("")),
});

export async function POST(req: Request) {
  return handle(async () => {
    const data = schema.parse(await req.json());

    const problem = passwordProblem(data.password);
    if (problem) throw new HttpError(`PASSWORD_${problem.toUpperCase()}`, 422);

    const email = normalizeEmail(data.email);

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    if (existing) {
      // Не подсказываем, есть ли пароль у этого адреса: иначе страница
      // регистрации превращается в проверку «зарегистрирован ли человек».
      throw new HttpError("EMAIL_TAKEN", 409);
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(data.password),
        firstName: data.firstName,
        lastName: data.lastName || null,
      },
      select: { id: true },
    });

    await createSession(user.id);
    return { ok: true };
  });
}
