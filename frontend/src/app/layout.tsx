import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "./(internal)/QueryProvider";
import { AuthProvider } from "@/features/auth";
import { LocaleProvider } from "@/shared/i18n";
import { getServerLocale } from "@/shared/i18n/server-locale";
import ruMessages from "@/shared/i18n/messages/ru.json";
import enMessages from "@/shared/i18n/messages/en.json";

/**
 * Два голоса, и только два: серифы — речь (заголовки, пояснения, названия
 * тегов), моно — данные (цифры, подписи-капители, управление).
 *
 * Серифная гарнитура системная (Cambria → Georgia, см. --font-serif): это не
 * экономия на webfont, а часть направления — гроссбух набран тем, что уже
 * стоит в системе. Моно грузим: нужны честные tabular-фигуры И кириллица, а у
 * системных Consolas/Menlo одно из двух всегда отсутствует.
 */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

// Заголовок вкладки и meta-description — тоже по локали, а не статикой: без
// этого EN-пользователь получал бы русские title/description на каждой
// странице, даже переключив язык. generateMetadata читает ту же куку, что и
// RootLayout ниже — независимо, но оба берут её из одного source of truth
// (getServerLocale).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const meta = locale === "en" ? enMessages.meta : ruMessages.meta;
  return { title: meta.title, description: meta.description };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Локаль читается из куки на сервере (не из localStorage — тому недоступен
  // SSR), тем же источником, что и клиент после гидратации в LocaleProvider.
  // Это делает layout динамическим (opt-out из статики) — сознательный
  // компромисс, принятый вместо вспышки RU→EN и hydration mismatch на каждой
  // загрузке у EN-пользователей.
  const initialLocale = await getServerLocale();

  return (
    <html lang={initialLocale} className={jetbrainsMono.variable}>
      <body>
        <QueryProvider>
          <LocaleProvider initialLocale={initialLocale}>
            <AuthProvider>
              {children}
            </AuthProvider>
          </LocaleProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
