import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Всё, кроме api, статики и путей с расширением файла.
  // Точка экранируется двумя слэшами: строковый литерал съедает один,
  // до регулярного выражения должно дойти именно \. — иначе под правило
  // попадает любой непустой путь и локаль перестаёт подставляться.
  matcher: ["/((?!api|_next|_vercel|uploads|.*\\..*).*)"],
};
