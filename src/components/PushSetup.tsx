"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSession } from "./SessionProvider";
import { appPlatform, isInsideApp, pushPlugin } from "@/lib/nativeBridge";

/**
 * Подписка на пуши, когда сайт открыт внутри приложения.
 *
 * В браузере не делает ничего: моста нет — и выходим сразу. Поэтому компонент
 * можно держать в общей разметке, не разделяя сборки.
 *
 * Порядок такой: спросить разрешение, зарегистрироваться в службе доставки,
 * дождаться токена и отдать его серверу. Регистрация повторяется при каждом
 * запуске: токен меняется сам по себе, и на сервере всегда должна лежать
 * свежая запись.
 *
 * Разрешение спрашиваем только у вошедших. Человеку, который ещё смотрит
 * ленту и ничего не разместил, системный запрос «разрешить уведомления?»
 * непонятен: уведомлять его пока не о чем, а отказ потом не переспросишь.
 */
const DEVICE_TOKEN_KEY = "yol_device_token";

/**
 * Снимает устройство с учёта при выходе из аккаунта.
 *
 * Иначе на телефон продолжали бы приходить уведомления о переписках человека,
 * который с него уже вышел.
 */
export async function unregisterDevice(): Promise<void> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (token) localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    return;
  }
  if (!token) return;

  await fetch("/api/me/devices", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  }).catch(() => {
    // Не вышло — сервер всё равно перепривяжет токен, когда с этого телефона
    // войдёт следующий человек.
  });
}

export function PushSetup() {
  const user = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isInsideApp() || !user) return;

    const push = pushPlugin();
    if (!push) return;

    let cancelled = false;
    const listeners: { remove: () => Promise<void> }[] = [];

    async function setup() {
      // На Android 13 и новее разрешение на уведомления запрашивается
      // отдельно, как у камеры: без него пуши просто не показываются.
      let status = await push!.checkPermissions();
      if (status.receive === "prompt" || status.receive === "prompt-with-rationale") {
        status = await push!.requestPermissions();
      }
      if (status.receive !== "granted" || cancelled) return;

      listeners.push(
        await push!.addListener("registration", (token) => {
          // Запоминаем токен на устройстве: при выходе из аккаунта его нужно
          // будет снять с учёта, а заново спросить у службы доставки в этот
          // момент уже нельзя.
          try {
            localStorage.setItem(DEVICE_TOKEN_KEY, token.value);
          } catch {
            // Приватный режим или переполненное хранилище — не беда,
            // отписаться просто не выйдет.
          }

          void fetch("/api/me/devices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token.value, platform: appPlatform() }),
          }).catch(() => {
            // Сеть моргнула — попробуем при следующем запуске приложения.
          });
        })
      );

      listeners.push(
        await push!.addListener("registrationError", (err) => {
          // Чаще всего это телефон без сервисов Google. Такой человек получает
          // уведомления в Telegram — сервер сам выберет запасной канал.
          console.error("пуши: не удалось зарегистрироваться", err);
        })
      );

      listeners.push(
        await push!.addListener("pushNotificationActionPerformed", (action) => {
          // Нажали на уведомление — открываем нужный чат, а не главную.
          const path = action.notification.data?.path;
          if (path) router.push(path as never);
        })
      );

      await push!.register();
    }

    void setup();

    return () => {
      cancelled = true;
      for (const listener of listeners) void listener.remove();
    };
  }, [user, router]);

  return null;
}
