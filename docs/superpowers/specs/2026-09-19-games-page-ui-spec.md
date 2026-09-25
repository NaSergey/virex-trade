# Virex Games --- UI Specification

## Главный принцип

Прикреплённый screenshot --- **visual source of truth**.

Не создавать новый дизайн на основе описания. Нужно максимально
воспроизвести композицию, визуальный язык и пропорции screenshot,
адаптировав его под существующий Virex.

Существующий Virex использует чёрный фон, тонкие границы, техническую
типографику и минималистичный интерфейс. Games Page должна выглядеть как
естественное продолжение продукта.

Дополнительные цвета допустимы преимущественно внутри игровых элементов.

## 1. Общий стиль

Background: - #050505 - допустимо #080808 / #0A0A0A / #0D0D0D

Borders: - rgba(255,255,255,0.10) - rgba(255,255,255,0.14)

Text: - основной: #F2F0EA - secondary: #9A9A96 - muted: #5E5E5A

## 2. Accent colors

Основной интерфейс остаётся монохромным.

-   Blackjack: green #65C996
-   Poker: red #D9554F
-   Jetpack: purple #9A5CFF
-   Trading: long #65C996, short #E0524D

Не превращать страницу в разноцветный gaming UI. Около 80--90%
интерфейса остаётся чёрно-белым.

## 3. Header

Использовать существующий Virex header.

Navigation: VIREX / ОБЗОР / ТЕГИ / АНАЛИТИКА / РЫНОК / БЕКТЕСТ / ИГРЫ

«ИГРЫ» --- active state существующей навигации: - background #F2F0EA -
color #050505

Справа сохранить существующие элементы: монеты и профиль.

## 4. Hero

Hero занимает примерно верхние 30% страницы.

Desktop layout: - \~42% text - \~58% visual

Eyebrow: PLAY • COMPETE • EARN - 11--12px - uppercase - letter-spacing
около 4px

Title: ИГРЫ - 72--84px - font-weight 500--600 - line-height около 0.95

Subtitle: БОЛЬШЕ, ЧЕМ ТОРГОВЛЯ - 25--30px - letter-spacing около 1px

Description: «Играй, соревнуйся, развивай навыки и зарабатывай. Virex
объединяет трейдинг и игры в едином пространстве.»

Buttons: - primary: НАЧАТЬ ИГРАТЬ → - secondary: КАК ЭТО РАБОТАЕТ

Primary: - background #F2F0EA - color #050505

Secondary: - transparent - border 1px solid rgba(255,255,255,.15)

## 5. Hero visual

Не использовать обычную плоскую иллюстрацию.

Композиция: 4 вертикальные игровые панели: 1. Blackjack 2. Poker 3.
Jetpack 4. Trading

Панели: - dark glass / black background - тонкая border - subtle glow -
небольшая перспектива - soft shadow

Внизу единая платформа: GAMES · SKILLS · PROFIT

## 6. Games grid

Под Hero --- 4 одинаковые карточки в одну строку на desktop.

Каждая: - border 1px solid rgba(255,255,255,.10) - background #080808 -
border-radius 10--12px - gap 16--20px

Структура: - number - status badge - illustration - title -
description - feature tags - CTA

## 7. Game cards

### Blackjack

Title: БЛЭКДЖЕК Description: «Классическая карточная игра. Проверь удачу
и стратегию.»

Tags: 1v1 / PvP / Турниры

Visual: A♠ / J♣ + poker chips. Subtle green glow.

### Poker

Title: ПОКЕР Description: «Игра навыков. Блеф, логика и холодная
голова.»

Tags: 1v1 / Турниры / Рейтинги

Visual: A♠ / A♥ + chips. Subtle red/orange glow.

### Jetpack

Title: ДЖЕТПАК Description: «Поднимайся выше, забирай профит до того,
как упадёшь.»

Tags: Быстрые раунды / Мультиплеер

Visual: Rocket flying upward + floating multipliers: 1.8x / 3.4x / 12.6x
Purple glow.

### Trading

Title: ТОРГОВЛЯ Description: «Реальный рынок. Реальные навыки. Торгуй и
соревнуйся с другими.»

Tags: PvP / Турниры / Рейтинги

Visual: Candlesticks + LONG / SHORT labels. Green/red accents.

## 8. Status

Недоступные: СКОРО --- muted gray badge/button.

Trading: ДОСТУПНО --- green badge.

Trading CTA: ИГРАТЬ →

## 9. Promotional banner

После карточек --- horizontal banner, примерно 190px высотой.

Левая часть: VIREX GAMES

ОДНА ПЛАТФОРМА. РАЗНЫЕ ВОЗМОЖНОСТИ.

«Игры, турниры, рейтинги и награды --- всё в одном месте.»

Правая часть: dark cinematic abstract scene: - dark mountains / abstract
terrain - vertical glowing structures - floating card - subtle
warm/white light

Не использовать яркий fantasy background.

## 10. Bottom stats

4 ИГРЫ ∞ ВОЗМОЖНОСТЕЙ 1 СООБЩЕСТВО

Справа: V I R E X PLAY THE ADVANTAGE

## 11. Responsive

Desktop \>= 1200px: - 4 columns - Hero 2 columns

Tablet 768--1199px: - games 2×2 - Hero text + visual

Mobile \< 768px: - 1 column - Hero text / visual / buttons - не убирать
hero visual

## 12. Архитектура

app/ games/ page.tsx

components/ games/ games-hero.tsx games-hero-visual.tsx games-grid.tsx
game-card.tsx games-banner.tsx games-stats.tsx

data/ games.ts

Game data не хардкодить непосредственно в JSX.

type Game = { id: string number: string title: string description:
string status: 'available' \| 'soon' accent: 'green' \| 'red' \|
'purple' \| 'neutral' tags: string\[\] image: string }

## 13. Assets / изображения

ВАЖНО: screenshot страницы нельзя использовать как одно изображение
вместо интерфейса.

UI должен быть реальным React/HTML/CSS/SVG.

Отдельно подготовить игровые assets:

/assets/games/ blackjack.webp poker.webp jetpack.webp trading.webp
games-hero.webp games-banner.webp

Игровые assets должны быть выполнены в едином стиле: - premium dark -
cinematic 3D - black background - controlled neon accents - high
contrast - transparent/isolated composition, где это возможно

Hero visual можно собрать из отдельных assets, если это даст более
точное совпадение.

## 14. Визуальная проверка

После реализации: IMPLEMENT → RUN → SCREENSHOT → COMPARE → FIX →
SCREENSHOT → FIX

Проверять: 1. Hero размеры 2. Hero visual position 3. Card dimensions 4.
Spacing 5. Typography 6. Illustration placement 7. Button sizes 8.
Border opacity 9. Whitespace 10. Overall visual density

Цель --- максимально близкое воспроизведение reference, а не
приблизительная интерпретация.

## 15. Итоговая дизайнерская цель

Не копировать screenshot как чужой лендинг.

Цель: 90% --- существующий visual language Virex 10% --- gaming layer из
концепции: - cards - chips - rocket - candlesticks - glow - accent
colors

Games должен выглядеть как новый раздел самого Virex.
