import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "./(internal)/QueryProvider";
import { AuthProvider } from "@/features/auth";

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

export const metadata: Metadata = {
  title: "Virex — журнал криптофьючерсов",
  description: "Журнал сделок и статистика по разметке",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={jetbrainsMono.variable}>
      <body>
        <QueryProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
