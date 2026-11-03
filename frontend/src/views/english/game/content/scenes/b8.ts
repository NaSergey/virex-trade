import type { Scene } from './types';

/** Блок 8 (раздел 22): Present Simple — отрицание и вопросы, do / does. */
export const S8: Scene[] = [
  {
    id: 'doctor',
    unit: 'u22',
    title: 'У врача',
    place: { en: 'CLINIC · WHITECHAPEL', ru: 'Клиника в Уайтчепеле' },
    npc: { name: 'Dr Evans', role: 'врач' },
    goal: 'Расскажи врачу, что тебя беспокоит.',
    vars: { n: ['2', '3', '5', '7', '10'] },
    steps: [
      { npc: "Come in, Sasha. What's the problem?", ru: 'Проходите, Саша. Что вас беспокоит?' },
      {
        reply: [
          { en: "I don't sleep well at night.", ru: 'Я плохо сплю по ночам.', ok: true },
          {
            en: 'I no sleep well at night.',
            ru: 'Я не спать хорошо по ночам.',
            why: 'Отрицание в Present Simple строится с don’t: I don’t sleep.',
            react: 'Sorry? You no…?',
          },
          {
            en: "I doesn't sleep well at night.",
            ru: 'Я не спит хорошо по ночам.',
            why: 'С I нужно don’t. Doesn’t — только для he / she / it.',
            react: 'Sorry? Doesn’t?',
          },
        ],
      },
      { npc: 'I see. Do you drink a lot of coffee?', ru: 'Понятно. Вы много пьёте кофе?' },
      {
        reply: [
          { en: 'Yes, I do. I drink four cups.', ru: 'Да. Четыре чашки.', ok: true },
          {
            en: 'Yes, I does. I drink four cups.',
            ru: 'Да. Четыре чашки.',
            why: 'С I в кратком ответе — do, а не does.',
            react: 'Sorry? You does?',
          },
          {
            en: 'Yes, I am. I drink four cups.',
            ru: 'Да, я есть. Четыре чашки.',
            why: 'На вопрос с Do you… краткий ответ — Yes, I do.',
            react: 'You are what? Ha ha. Four cups, OK.',
          },
        ],
      },
      { npc: 'Four cups is a lot! Take one pill for {n} days.', ru: 'Четыре чашки — это много! Принимайте по таблетке в течение {n} дней.' },
      {
        reply: [
          {
            en: '{n} days? OK.',
            ru: '{n} дней? Хорошо.',
            ok: true,
            distract: 'n',
            why: 'Он сказал {n}.',
            react: 'No, {n} days!',
          },
        ],
      },
      { npc: 'Does your job start early?', ru: 'Ваша работа начинается рано?' },
      {
        reply: [
          { en: 'Yes, it does. I start at six.', ru: 'Да. Я начинаю в шесть.', ok: true },
          {
            en: 'Yes, it do. I start at six.',
            ru: 'Да. Я начинаю в шесть.',
            why: 'Подлежащее — it, поэтому does.',
            react: 'Sorry? It do?',
          },
          {
            en: 'No, it does. I start at six.',
            ru: 'Нет, начинается. Я начинаю в шесть.',
            why: 'No и does противоречат друг другу. Либо Yes, it does, либо No, it doesn’t.',
            react: 'No… but yes? Which one?',
          },
        ],
      },
      { npc: 'Hmm. Do you eat late in the evening?', ru: 'Хм. Вы поздно ужинаете?' },
      {
        reply: [
          { en: "No, I don't. I eat at seven.", ru: 'Нет. Я ем в семь.', ok: true },
          {
            en: "No, I doesn't. I eat at seven.",
            ru: 'Нет. Я ем в семь.',
            why: 'С I нужно don’t, а doesn’t — для he / she / it.',
            react: 'Sorry? Doesn’t?',
          },
          {
            en: "No, I am not. I eat at seven.",
            ru: 'Нет, я не есть. Я ем в семь.',
            why: 'На вопрос с Do you… краткий ответ — No, I don’t.',
            react: 'Not what? Ha ha. OK, seven is fine.',
          },
        ],
        accept: ['No, I do not. I eat at seven.'],
      },
      { npc: 'Good. Drink less coffee and go to bed early. Do you have any questions?', ru: 'Хорошо. Пейте меньше кофе и ложитесь пораньше. Есть вопросы?' },
      {
        reply: [
          { en: 'Yes. Does tea help?', ru: 'Да. Чай помогает?', ok: true },
          {
            en: 'Yes. Do tea help?',
            ru: 'Да. Чай помогают?',
            why: 'Tea — это it, поэтому does: Does tea help?',
            react: 'Sorry? Do tea…?',
          },
          {
            en: 'Yes. Does the doctor sleep well?',
            ru: 'Да. А доктор хорошо спит?',
            why: 'Вопрос не по делу и бестактный: врач спрашивает про твой сон, а не наоборот.',
            react: 'Me? Ha! No, I work nights too.',
          },
        ],
      },
    ],
    phrases: [
      ["I don't sleep well.", 'Я плохо сплю.'],
      ['Does tea help?', 'Чай помогает?'],
    ],
  },
  {
    id: 'bank-account',
    unit: 'u22',
    title: 'Открыть счёт в банке',
    place: { en: 'BANK · CITY OF LONDON', ru: 'Отделение банка в Сити' },
    npc: { name: 'Peter', role: 'консультант банка' },
    goal: 'Открой банковский счёт.',
    vars: { n: ['2', '3', '5', '7', '10'] },
    steps: [
      { npc: 'Good morning. How can I help?', ru: 'Доброе утро. Чем могу помочь?' },
      {
        reply: [
          { en: 'I want to open an account, please.', ru: 'Я хочу открыть счёт, пожалуйста.', ok: true },
          {
            en: 'I wants to open an account, please.',
            ru: 'Я хочет открыть счёт, пожалуйста.',
            why: 'С I глагол без s: I want.',
            react: 'Sorry? Wants?',
          },
          {
            en: 'I want to open a door, please.',
            ru: 'Я хочу открыть дверь, пожалуйста.',
            why: 'Ты пришёл в банк за счётом, а не за дверью.',
            react: 'A door? Our doors are open!',
          },
        ],
      },
      { npc: 'Of course. Do you live in the UK?', ru: 'Конечно. Вы живёте в Великобритании?' },
      {
        reply: [
          { en: 'Yes, I do. I live in Hackney.', ru: 'Да. Я живу в Хакни.', ok: true },
          {
            en: 'Yes, I am. I live in Hackney.',
            ru: 'Да, я есть. Я живу в Хакни.',
            why: 'На вопрос с Do you… краткий ответ — Yes, I do.',
            react: 'You are what? Ha ha. Hackney, nice.',
          },
          {
            en: 'No, I do. I live in Hackney.',
            ru: 'Нет, живу. Я живу в Хакни.',
            why: 'No и do противоречат друг другу.',
            react: 'No… but yes? Which one?',
          },
        ],
      },
      { npc: 'Do you have a passport and proof of address?', ru: 'У вас есть паспорт и подтверждение адреса?' },
      {
        reply: [
          { en: 'Yes, I do. I have both here.', ru: 'Да. Оба документа здесь.', ok: true },
          {
            en: 'Yes, I does. I have both here.',
            ru: 'Да. Оба документа здесь.',
            why: 'С I в кратком ответе — do, а не does.',
            react: 'Sorry? You does?',
          },
          {
            en: 'Yes, I have not. I have both here.',
            ru: 'Да, у меня нет. Оба документа здесь.',
            why: 'Yes и have not противоречат друг другу. Достаточно Yes, I do.',
            react: 'Yes… but not? Which one?',
          },
        ],
      },
      { npc: 'Great. Your first card arrives in {n} days.', ru: 'Отлично. Ваша первая карта придёт через {n} дней.' },
      {
        reply: [
          {
            en: '{n} days? OK.',
            ru: '{n} дней? Хорошо.',
            ok: true,
            distract: 'n',
            why: 'Он сказал {n}.',
            react: 'No, {n} days!',
          },
        ],
      },
      { npc: 'Do you need a credit card too?', ru: 'Вам нужна ещё и кредитная карта?' },
      {
        reply: [
          { en: "No, thanks. I don't need one.", ru: 'Нет, спасибо. Мне не нужна.', ok: true },
          {
            en: 'No, thanks. I no need one.',
            ru: 'Нет, спасибо. Я не нужен одна.',
            why: 'Отрицание строится с don’t: I don’t need.',
            react: 'Sorry? You no…?',
          },
          {
            en: "No, thanks. I don't needs one.",
            ru: 'Нет, спасибо. Я не нужна одна.',
            why: 'После don’t глагол без s: I don’t need.',
            react: 'Needs? Hmm… OK, no card.',
          },
        ],
        accept: ['No, thanks. I do not need one.'],
      },
      { npc: 'Perfect. Please sign here. And where do you work?', ru: 'Отлично. Подпишите здесь. А где вы работаете?' },
      {
        reply: [
          { en: 'I work online, from home.', ru: 'Я работаю онлайн, из дома.', ok: true },
          {
            en: 'I works online, from home.',
            ru: 'Я работает онлайн, из дома.',
            why: 'С I глагол без s: I work.',
            react: 'Sorry? Works?',
          },
          {
            en: 'I work in the bath.',
            ru: 'Я работаю в ванне.',
            why: 'Спросили, где работаешь по делу. Ответ шутливый и неуместный.',
            react: 'In the bath? I hope it is a waterproof laptop!',
          },
        ],
      },
    ],
    phrases: [
      ['I want to open an account.', 'Я хочу открыть счёт.'],
      ["I don't need one.", 'Мне не нужно.'],
    ],
  },
  {
    id: 'party-smalltalk',
    unit: 'u22',
    title: 'На вечеринке',
    place: { en: 'PARTY · SHOREDITCH', ru: 'Вечеринка в Шордиче' },
    npc: { name: 'Amy', role: 'гостья вечеринки' },
    goal: 'Поддержи разговор с новой знакомой.',
    vars: { time: ['5:00', '5:30', '6:00', '6:30', '7:00'] },
    steps: [
      { npc: "Hi! I'm Amy. Do you know the host, Lucy?", ru: 'Привет! Я Эми. Ты знаешь хозяйку, Люси?' },
      {
        reply: [
          { en: "Hi, Amy. No, I don't. I'm Sasha.", ru: 'Привет, Эми. Нет, не знаю. Я Саша.', ok: true },
          {
            en: "Hi, Amy. No, I doesn't. I'm Sasha.",
            ru: 'Привет, Эми. Нет. Я Саша.',
            why: 'С I нужно don’t, а doesn’t — для he / she / it.',
            react: 'Sorry? Doesn’t?',
          },
          {
            en: "Hi, Amy. Yes, I don't. I'm Sasha.",
            ru: 'Привет, Эми. Да, не знаю. Я Саша.',
            why: 'Yes и don’t противоречат друг другу.',
            react: 'Yes… but no? Ha ha!',
          },
        ],
      },
      { npc: 'Nice to meet you! What do you do, Sasha?', ru: 'Приятно познакомиться! Чем ты занимаешься, Саша?' },
      {
        reply: [
          { en: 'I work in a café. And you?', ru: 'Я работаю в кафе. А ты?', ok: true },
          {
            en: 'I works in a café. And you?',
            ru: 'Я работает в кафе. А ты?',
            why: 'С I глагол без s: I work.',
            react: 'Sorry? Works?',
          },
          {
            en: 'I work in a café. And does you?',
            ru: 'Я работаю в кафе. А делает ты?',
            why: 'Встречный вопрос короткий: And you? Does с you не используют.',
            react: 'And does… me? Ha, I work in a bank.',
          },
        ],
      },
      { npc: 'I work in a bank. I finish work at {time} every day.', ru: 'Я работаю в банке. Каждый день я заканчиваю в {time}.' },
      {
        reply: [
          {
            en: 'You finish at {time}? Nice!',
            ru: 'Ты заканчиваешь в {time}? Здорово!',
            ok: true,
            distract: 'time',
            why: 'Она сказала {time}.',
            react: 'No, {time}!',
          },
        ],
      },
      { npc: 'Thanks! Do you like London?', ru: 'Спасибо! Тебе нравится Лондон?' },
      {
        reply: [
          { en: 'Yes, I do. I like the parks.', ru: 'Да. Мне нравятся парки.', ok: true },
          {
            en: 'Yes, I does. I like the parks.',
            ru: 'Да. Мне нравятся парки.',
            why: 'С I в кратком ответе — do, а не does.',
            react: 'Sorry? You does?',
          },
          {
            en: 'No, I do. I like the parks.',
            ru: 'Нет, нравится. Мне нравятся парки.',
            why: 'No и do противоречат друг другу.',
            react: 'No… but yes? Which one?',
          },
        ],
      },
      { npc: 'Me too. Does your family live here?', ru: 'Мне тоже. Твоя семья живёт здесь?' },
      {
        reply: [
          { en: "No, they don't. They live in Russia.", ru: 'Нет. Они живут в России.', ok: true },
          {
            en: "No, they doesn't. They live in Russia.",
            ru: 'Нет. Они живут в России.',
            why: 'С they нужно don’t. Doesn’t — для he / she / it.',
            react: 'Sorry? They doesn’t?',
          },
          {
            en: "No, they don't. They lives in Russia.",
            ru: 'Нет. Они живёт в России.',
            why: 'С they глагол без s: they live.',
            react: 'Sorry? They lives?',
          },
        ],
        accept: ["No, they don't. They are in Russia."],
      },
      { npc: 'Interesting! I need a drink. Do you want one?', ru: 'Интересно! Мне нужно выпить. Тебе тоже?' },
      {
        reply: [
          { en: 'Yes, please. Water for me.', ru: 'Да, пожалуйста. Мне воды.', ok: true },
          {
            en: 'Yes, please. Water for I.',
            ru: 'Да, пожалуйста. Воды для я.',
            why: 'После предлога ставят me, а не I: for me.',
            react: 'For… I? Ha ha. For you, OK.',
          },
          {
            en: "Yes, please. I don't want a drink.",
            ru: 'Да, пожалуйста. Я не хочу пить.',
            why: 'Yes, please и «не хочу» противоречат друг другу.',
            react: 'Yes please… but no drink? Ha ha!',
          },
        ],
      },
    ],
    phrases: [
      ['What do you do?', 'Чем ты занимаешься?'],
      ["No, they don't.", 'Нет, не живут.'],
    ],
  },
];
