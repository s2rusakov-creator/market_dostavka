import "server-only";
import { cache } from "react";
import { prisma } from "./prisma";
import { getSessionUserId } from "./session";

export type CurrentUser = {
  id: string;
  telegramId: bigint | null;
  email: string | null;
  emailVerifiedAt: Date | null;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  locale: string;
  soundEnabled: boolean;
  notifyEnabled: boolean;
  deliveriesCount: number;
  ratingSum: number;
  ratingCount: number;
};

/** cache() — чтобы за один рендер не ходить в базу по нескольку раз. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const id = await getSessionUserId();
  if (!id) return null;

  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      telegramId: true,
      email: true,
      emailVerifiedAt: true,
      firstName: true,
      lastName: true,
      username: true,
      photoUrl: true,
      locale: true,
      soundEnabled: true,
      notifyEnabled: true,
      deliveriesCount: true,
      ratingSum: true,
      ratingCount: true,
    },
  });
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}
