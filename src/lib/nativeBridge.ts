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

type BrowserPlugin = {
  open: (options: { url: string }) => Promise<void>;
  close: () => Promise<void>;
};

type SplashPlugin = {
  hide: () => Promise<void>;
};

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    PushNotifications?: PushPlugin;
    Badge?: BadgePlugin;
    Browser?: BrowserPlugin;
    SplashScreen?: SplashPlugin;
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

/**
 * Открывает адрес во внешнем браузере телефона поверх приложения.
 *
 * Нужно для входа через Google: он намеренно отказывает встроенным веб-вью,
 * чтобы человек видел настоящую адресную строку и не вводил пароль в чужом
 * окне. Значит, окно провайдера обязано быть настоящим браузером.
 *
 * Возвращает true, если открыть удалось: по этому признаку снаружи решают,
 * пытаться ли закрыть окно потом.
 */
export async function openExternal(url: string): Promise<boolean> {
  const browser = capacitor()?.Plugins?.Browser;
  if (!browser) return false;
  try {
    await browser.open({ url });
    return true;
  } catch {
    return false;
  }
}

/**
 * Закрывает окно, открытое openExternal.
 *
 * Умеют это не все версии оболочки, поэтому неудача — не ошибка: человек
 * вернётся кнопкой «назад» и увидит, что уже вошёл.
 */
export async function closeExternal(): Promise<void> {
  const browser = capacitor()?.Plugins?.Browser;
  if (!browser) return;
  try {
    await browser.close();
  } catch {
    // Не поддерживается — не беда.
  }
}

/**
 * Убирает заставку приложения, когда страница уже отрисована.
 *
 * Оболочка прячет её и сама, по таймеру, — это страховка на случай медленной
 * сети или отсутствия моста. Но если страница готова раньше, держать заставку
 * незачем: человек смотрит на застывший значок вместо ленты.
 */
export async function hideSplash(): Promise<void> {
  const splash = capacitor()?.Plugins?.SplashScreen;
  if (!splash) return;
  try {
    await splash.hide();
  } catch {
    // Не вышло — заставка уйдёт по таймеру оболочки.
  }
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
