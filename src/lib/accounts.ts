import "server-only";
import { prisma } from "./prisma";
import type { ProviderId, Profile } from "./oauth";
import { normalizeEmail } from "./password";

/**
 * Находит или заводит пользователя по данным внешнего провайдера.
 *
 * Про склейку аккаунтов и захват чужого профиля.
 * Почту при регистрации паролем мы не подтверждаем (нет почтового сервиса),
 * поэтому кто угодно может зарегистрироваться на чужой адрес и ждать, пока
 * настоящий владелец войдёт через Google. Если просто «слить» аккаунты,
 * злоумышленник останется внутри — он ведь помнит свой пароль.
 *
 * Поэтому: провайдер владение почтой доказывает, а неподтверждённый пароль —
 * нет. При склейке пароль у такого аккаунта стираем, и прежний «владелец»
 * доступ теряет. Когда появится подтверждение почты письмом, это правило
 * можно будет смягчить.
 */
export async function findOrCreateOAuthUser(
  provider: ProviderId,
  profile: Profile
): Promise<{ id: string }> {
  const existingLink = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId: profile.providerAccountId,
      },
    },
    select: { userId: true },
  });

  if (existingLink) return { id: existingLink.userId };

  const email = profile.email ? normalizeEmail(profile.email) : null;

  if (email) {
    const byEmail = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true, passwordHash: true },
    });

    if (byEmail) {
      await prisma.$transaction([
        prisma.oAuthAccount.create({
          data: {
            provider,
            providerAccountId: profile.providerAccountId,
            userId: byEmail.id,
          },
        }),
        prisma.user.update({
          where: { id: byEmail.id },
          data: {
            emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
            // Пароль, поставленный на неподтверждённый адрес, обнуляем.
            ...(byEmail.emailVerifiedAt ? {} : { passwordHash: null }),
            photoUrl: profile.photoUrl ?? undefined,
          },
        }),
      ]);
      return { id: byEmail.id };
    }
  }

  const user = await prisma.user.create({
    data: {
      email,
      // Провайдер сам владеет почтовым ящиком — считаем адрес подтверждённым.
      emailVerifiedAt: email ? new Date() : null,
      firstName: profile.firstName,
      lastName: profile.lastName,
      photoUrl: profile.photoUrl,
      oauthAccounts: {
        create: {
          provider,
          providerAccountId: profile.providerAccountId,
        },
      },
    },
    select: { id: true },
  });

  return user;
}
