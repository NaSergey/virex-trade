import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "./(internal)/QueryProvider";
import { AuthProvider } from "@/features/auth";
import { LocaleProvider } from "@/shared/i18n";
import { getServerLocale } from "@/shared/i18n/server-locale";
import { ThemeProvider } from "@/shared/theme";
import { getServerTheme } from "@/shared/theme/server-theme";
import { loadMessages } from "@/shared/i18n/load-messages";

/**
 * Два голоса, и только два: серифы — речь (заголовки, пояснения, названия
 * тегов), моно — данные (цифры, подписи-капители, управление).
 *
 * Серифная гарнитура системная (Cambria → Georgia, см. --font-serif): это не
 * экономия на webfont, а часть направления — гроссбух набран тем, что уже
 * стоит в системе. Моно грузим: нужны честные tabular-фигуры И кириллица, а у
 * системных Consolas/Menlo одно из двух всегда отсутствует.
 */
/*
 * Запасная гарнитура на время загрузки моно — своя, моноширинная.
 *
 * Своя, потому что автоматическая (`adjustFontFallback`, включён по
 * умолчанию) для ЛЮБОГО шрифта Google берёт Arial и подгоняет его метрики
 * по вертикали: для JetBrains Mono это `local("Arial")` с
 * `size-adjust: 134.59%`. По высоте строки так действительно ровно, но моно
 * в продукте держит не высоту, а ШИРИНУ — кнопки, капители заголовков,
 * колонки чисел. Пропорциональный Arial этих ширин не даёт, и через
 * полсекунды, когда приезжал настоящий шрифт, весь моноширинный текст
 * страницы перенабирался: кнопки меняли размер, колонки пересчитывались,
 * числа сжимались. Системный моно (Consolas на Windows, SF Mono на macOS)
 * отличается от JetBrains Mono на проценты, и подмена больше не видна.
 *
 * `display: swap` при этом остаётся: цифры и капители должны быть читаемы
 * с первого кадра, а не ждать сети.
 */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Consolas", "SF Mono", "Menlo", "monospace"],
});

// Заголовок вкладки и meta-description — тоже по локали, а не статикой: без
// этого EN-пользователь получал бы русские title/description на каждой
// странице, даже переключив язык. generateMetadata читает ту же куку, что и
// RootLayout ниже — независимо, но оба берут её из одного source of truth
// (getServerLocale).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const messages = await loadMessages(locale);
  return { title: messages.meta.title, description: messages.meta.description };
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
  // Тема читается той же парой «кука + серверный компонент», что и локаль, и
  // по той же причине: атрибут должен стоять на <html> уже в присланной
  // разметке, иначе выбравший светлую тему получает кадр чёрного на каждой
  // загрузке. Дефолт (тёмная) не пишет ничего лишнего — палитра :root и есть
  // тёмная, атрибут нужен только светлой.
  const initialTheme = await getServerTheme();
  // Словарь только выбранной локали: второй язык клиенту не отправляется и
  // подгружается провайдером в момент переключения.
  const initialMessages = await loadMessages(initialLocale);

  return (
    <html
      lang={initialLocale}
      data-theme={initialTheme}
      className={jetbrainsMono.variable}
    >
      <body>
        <QueryProvider>
          <ThemeProvider initialTheme={initialTheme}>
            <LocaleProvider initialLocale={initialLocale} initialMessages={initialMessages}>
              <AuthProvider>
                {children}
              </AuthProvider>
            </LocaleProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
