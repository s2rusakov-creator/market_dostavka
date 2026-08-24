/**
 * Мост в нативную оболочку.
 *
 * Сайт не зависит от Capacitor: в его сборке нет ни одной библиотеки оболочки.
 * Оболочка сама подставляет свой мост в страницу, и плагины оказываются
 * доступны глобально — этим и пользуемся. В обычном браузере ничего этого нет,
 * все функции ниже просто ничего не делают.
 *
 * Так сайт остаётся сайтом: его можно открыть в браузере, и он не потянет за
 * собой мобильные зависимости ради кода, который там всё равно не выполнится.
 */

type PluginListener = { remove: () => Promise<void> };

type PermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";

type PushPlugin = {
  checkPermissions: () => Promise<{ receive: PermissionState }>;
  requestPermissions: () => Promise<{ receive: PermissionState }>;
  register: () => Promise<void>;
  removeAllListeners: () => Promise<void>;
  addListener: {
    (event: "registration", fn: (token: { value: string }) => void): Promise<PluginListener>;
    (event: "registrationError", fn: (err: unknown) => void): Promise<PluginListener>;
    (
      event: "pushNotificationActionPerformed",
      fn: (action: { notification: { data?: Record<string, string> } }) => void
    ): Promise<PluginListener>;
  };
};

type BadgePlugin = {
  set: (options: { count: number }) => Promise<void>;
  clear: () => Promise<void>;
};

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    PushNotifications?: PushPlugin;
    Badge?: BadgePlugin;
  };
};

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
  }
}

function capacitor(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const cap = window.Capacitor;
  return cap?.isNativePlatform?.() ? cap : null;
}

/** Открыт ли сайт внутри приложения, а не в браузере. */
export function isInsideApp(): boolean {
  return capacitor() !== null;
}

/** "android" | "ios" — на чём именно работает оболочка. */
export function appPlatform(): "android" | "ios" | "web" {
  const platform = capacitor()?.getPlatform?.();
  return platform === "android" || platform === "ios" ? platform : "web";
}

export function pushPlugin(): PushPlugin | null {
  return capacitor()?.Plugins?.PushNotifications ?? null;
}

export function badgePlugin(): BadgePlugin | null {
  return capacitor()?.Plugins?.Badge ?? null;
}

/** Ставит на значок приложения число непрочитанных. */
export async function setBadge(count: number): Promise<void> {
  const badge = badgePlugin();
  if (!badge) return;
  try {
    if (count > 0) await badge.set({ count });
    else await badge.clear();
  } catch {
    // Значок — украшение. Оболочка может его не поддерживать, и это не повод
    // ронять страницу.
  }
}
