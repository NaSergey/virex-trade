import type { Scene } from './types';

/** Блок 1 (Starting Point — Unit 3): to be, my / your, числа до 20, цвета. Открыты с начала. */
export const S1: Scene[] = [
  {
    id: 'hostel-hello',
    unit: 'sp',
    title: 'Знакомство в хостеле',
    place: { en: 'HOSTEL · CAMDEN', ru: 'Хостел в Камдене' },
    npc: { name: 'Leo', role: 'сосед по комнате' },
    goal: 'Познакомься с соседом по комнате и найди свою кровать.',
    vars: { bed: ['7', '9', '12', '15'] },
    steps: [
      { npc: "Hi! I'm Leo. What's your name?", ru: 'Привет! Я Лео. Как тебя зовут?' },
      {
        reply: [
          { en: "Hi, Leo! I'm Sasha.", ru: 'Привет, Лео! Я Саша.', ok: true },
          {
            en: 'Hi, Leo! I is Sasha.',
            ru: 'Привет, Лео! Я есть Саша.',
            why: 'С I всегда am: I am, коротко — I’m.',
            react: 'Sorry?',
          },
          {
            en: "Hi, Leo! I'm fine, thanks.",
            ru: 'Привет, Лео! У меня всё хорошо, спасибо.',
            why: 'Спросили, как тебя зовут, а не как дела.',
            react: "Good! But what's your name?",
          },
        ],
        accept: ["Hi, Leo! My name's Sasha.", 'Hi, Leo! My name is Sasha.'],
      },
      { npc: 'Nice to meet you, Sasha. Where are you from?', ru: 'Приятно познакомиться, Саша. Откуда ты?' },
      {
        reply: [
          { en: "Nice to meet you too. I'm from Russia.", ru: 'Мне тоже приятно. Я из России.', ok: true },
          {
            en: 'Nice to meet you too. I from Russia.',
            ru: 'Мне тоже приятно. Я из России.',
            why: 'Пропущено am: по-английски «быть» не выпадает — I’m from Russia.',
            react: 'Sorry? You… from Russia?',
          },
          {
            en: "Nice to meet you too. I'm twenty.",
            ru: 'Мне тоже приятно. Мне двадцать.',
            why: 'Спросили откуда ты, а не сколько тебе лет.',
            react: 'Oh, OK… And where are you from?',
          },
        ],
      },
      { npc: 'Cool! Your bed is number {bed}.', ru: 'Здорово! Твоя кровать — номер {bed}.' },
      {
        reply: [
          {
            en: 'Number {bed}? Thank you!',
            ru: 'Номер {bed}? Спасибо!',
            ok: true,
            distract: 'bed',
            why: 'Он сказал {bed}.',
            react: 'No, number {bed}!',
          },
        ],
      },
      { npc: "You're welcome. What colour is your bag?", ru: 'Не за что. Какого цвета твоя сумка?' },
      {
        reply: [
          { en: "It's black.", ru: 'Чёрная.', ok: true },
          {
            en: 'It black.',
            ru: 'Она чёрная.',
            why: 'Пропущено is: It is black, коротко — It’s black.',
            react: 'Sorry?',
          },
          {
            en: "It's a bag.",
            ru: 'Это сумка.',
            why: 'Спросили цвет, а ты сказал, что это сумка.',
            react: "Yes, I can see it's a bag!",
          },
        ],
      },
      { npc: 'OK! See you later, Sasha.', ru: 'Ладно! Увидимся, Саша.' },
      {
        reply: [
          { en: 'See you later, Leo!', ru: 'Увидимся, Лео!', ok: true },
          {
            en: 'See you later, Sasha!',
            ru: 'Увидимся, Саша!',
            why: 'Саша — это ты; собеседника зовут Лео.',
            react: "Ha! I'm Leo!",
          },
          {
            en: "Goodbye, I'm fine.",
            ru: 'До свидания, у меня всё хорошо.',
            why: 'I’m fine — ответ на How are you?, здесь он не к месту.',
            react: 'Er… good. Bye!',
          },
        ],
      },
    ],
    phrases: [
      ['Nice to meet you.', 'Приятно познакомиться.'],
      ['Where are you from?', 'Откуда ты?'],
      ['See you later!', 'Увидимся!'],
    ],
  },
  {
    id: 'hotel-checkin',
    unit: 'sp',
    title: 'Регистрация в отеле',
    place: { en: "HOTEL · KING'S CROSS", ru: 'Отель у вокзала Кингс-Кросс' },
    npc: { name: 'Anna', role: 'администратор отеля' },
    goal: 'Назови своё имя, продиктуй фамилию по буквам и узнай номер комнаты.',
    vars: { room: ['5', '8', '11', '14', '19'] },
    steps: [
      { npc: "Good evening! Welcome. What's your name, please?", ru: 'Добрый вечер! Добро пожаловать. Как вас зовут?' },
      {
        reply: [
          { en: "Good evening. I'm Sasha Petrov.", ru: 'Добрый вечер. Я Саша Петров.', ok: true },
          {
            en: 'Good evening. I is Sasha Petrov.',
            ru: 'Добрый вечер. Я есть Саша Петров.',
            why: 'С I всегда am: I am, коротко — I’m.',
            react: 'Sorry? Can you say that again?',
          },
          {
            en: "Good evening. I'm from Russia.",
            ru: 'Добрый вечер. Я из России.',
            why: 'Спросили имя, а не откуда ты.',
            react: 'Lovely! But what is your name?',
          },
        ],
        accept: ['Good evening. My name is Sasha Petrov.', "Good evening. My name's Sasha Petrov."],
      },
      { npc: 'Thank you. Can you spell your surname, please?', ru: 'Спасибо. Можете назвать фамилию по буквам?' },
      {
        reply: [
          { en: 'Yes. P, E, T, R, O, V.', ru: 'Да. П, Е, Т, Р, О, В.', ok: true },
          {
            en: 'Yes. Is P, E, T, R, O, V.',
            ru: 'Да. Есть П, Е, Т, Р, О, В.',
            why: 'Нужно подлежащее: It’s P, E, T, R, O, V. Без it фраза не складывается.',
            react: 'Sorry, what is?',
          },
          {
            en: 'Yes. A, B, C, D, E.',
            ru: 'Да. А, Б, К, Д, Е.',
            why: 'Это первые буквы алфавита, а не твоя фамилия.',
            react: "Er… that's not your name!",
          },
        ],
        accept: ["Yes. It's P, E, T, R, O, V.", 'Yes. It is P, E, T, R, O, V.'],
      },
      { npc: 'Perfect. And how are you today?', ru: 'Отлично. А как у вас дела сегодня?' },
      {
        reply: [
          { en: "I'm fine, thank you. And you?", ru: 'Хорошо, спасибо. А у вас?', ok: true },
          {
            en: 'I fine, thank you. And you?',
            ru: 'Хорошо, спасибо. А у вас?',
            why: 'Пропущено am: I’m fine.',
            react: 'Sorry?',
          },
          {
            en: "I'm Sasha, thank you.",
            ru: 'Я Саша, спасибо.',
            why: 'Спросили, как дела, а не как тебя зовут.',
            react: 'Yes, I know, Sasha. But how are you?',
          },
        ],
      },
      { npc: "I'm very well, thanks. Your room is number {room}.", ru: 'У меня всё хорошо, спасибо. Ваша комната — номер {room}.' },
      {
        reply: [
          {
            en: 'Room {room}. Thank you!',
            ru: 'Комната {room}. Спасибо!',
            ok: true,
            distract: 'room',
            why: 'Она сказала номер {room}.',
            react: 'No, room {room}!',
          },
        ],
      },
      { npc: "It's on the first floor. Is that OK?", ru: 'Она на первом этаже. Вас это устроит?' },
      {
        reply: [
          { en: "Yes, that's great. Thank you.", ru: 'Да, отлично. Спасибо.', ok: true },
          {
            en: 'Yes, that great. Thank you.',
            ru: 'Да, это отлично. Спасибо.',
            why: 'Пропущено is: that’s great.',
            react: 'Sorry, one more time?',
          },
          {
            en: 'Yes, my name is Sasha.',
            ru: 'Да, меня зовут Саша.',
            why: 'Спросили про этаж, а ты снова назвал имя.',
            react: 'Yes, Sasha. And the room is OK?',
          },
        ],
      },
      { npc: 'Enjoy your stay! Breakfast is at seven.', ru: 'Приятного отдыха! Завтрак в семь.' },
      {
        reply: [
          { en: "Thanks! You're very kind.", ru: 'Спасибо! Вы очень любезны.', ok: true },
          {
            en: 'Thanks! Your very kind.',
            ru: 'Спасибо! Ваш очень любезны.',
            why: 'Your — «твой/ваш». «Вы добры» — you’re (you are).',
            react: 'My very kind what? Ha ha!',
          },
          {
            en: 'Thanks! Good morning.',
            ru: 'Спасибо! Доброе утро.',
            why: 'Сейчас вечер: Good morning говорят утром.',
            react: "Morning? It's nine in the evening!",
          },
        ],
      },
    ],
    phrases: [
      ['Can you spell that, please?', 'Можете продиктовать по буквам?'],
      ['Your room is number five.', 'Ваша комната — номер пять.'],
    ],
  },
  {
    id: 'lost-property',
    unit: 'sp',
    title: 'Бюро находок',
    place: { en: 'LOST PROPERTY · BAKER STREET', ru: 'Бюро находок на Бейкер-стрит' },
    npc: { name: 'Joan', role: 'сотрудница бюро находок' },
    goal: 'Найди свою сумку: назови цвет и расскажи, что в ней лежит.',
    vars: { n: ['4', '9', '13', '16', '18'] },
    steps: [
      { npc: 'Hello! Can I help you?', ru: 'Здравствуйте! Чем могу помочь?' },
      {
        reply: [
          { en: 'Hi. Is my bag here, please?', ru: 'Здравствуйте. Моя сумка здесь, пожалуйста?', ok: true },
          {
            en: 'Hi. My bag here, please?',
            ru: 'Здравствуйте. Моя сумка здесь, пожалуйста?',
            why: 'В вопросе с to be is идёт перед подлежащим: Is my bag here?',
            react: 'Sorry? Your bag is…?',
          },
          {
            en: 'Hi. A coffee, please.',
            ru: 'Здравствуйте. Один кофе, пожалуйста.',
            why: 'Это бюро находок, а не кафе.',
            react: 'Coffee? This is Lost Property!',
          },
        ],
      },
      { npc: 'Maybe. What colour is it?', ru: 'Возможно. Какого она цвета?' },
      {
        reply: [
          { en: "It's blue.", ru: 'Она синяя.', ok: true },
          {
            en: 'It blue.',
            ru: 'Она синяя.',
            why: 'Пропущено is: It’s blue.',
            react: 'Sorry? It… blue?',
          },
          {
            en: "It's very nice.",
            ru: 'Она очень красивая.',
            why: 'Спросили цвет, а ты хвалишь сумку.',
            react: "I'm sure it is. But what colour?",
          },
        ],
      },
      { npc: 'Is it big or small?', ru: 'Она большая или маленькая?' },
      {
        reply: [
          { en: "It's small.", ru: 'Она маленькая.', ok: true },
          {
            en: 'It are small.',
            ru: 'Она маленькая.',
            why: 'С it нужно is, а не are: it is.',
            react: 'Sorry? Say it again, please.',
          },
          {
            en: "Yes, it's my bag.",
            ru: 'Да, это моя сумка.',
            why: 'Вопрос «или-или» — «да» не отвечает. Нужно: big или small.',
            react: 'Yes, but is it BIG or SMALL?',
          },
        ],
      },
      { npc: "What's in the bag?", ru: 'Что в сумке?' },
      {
        reply: [
          { en: 'My phone and my keys.', ru: 'Мой телефон и мои ключи.', ok: true },
          {
            en: "I'm phone and keys.",
            ru: 'Я есть телефон и ключи.',
            why: 'Это вещи, а не ты. Нужно my phone, my keys.',
            react: "You're a phone? Ha ha!",
          },
          {
            en: "It's in London.",
            ru: 'Она в Лондоне.',
            why: 'Спросили, что в сумке, а не где она.',
            react: 'I know! But what is IN the bag?',
          },
        ],
        accept: ['My phone and keys.'],
      },
      { npc: 'Oh, yes! Here it is. Your number is {n}.', ru: 'О, да! Вот она. Ваш номер — {n}.' },
      {
        reply: [
          {
            en: '{n}? OK, thank you!',
            ru: '{n}? Хорошо, спасибо!',
            ok: true,
            distract: 'n',
            why: 'Она сказала {n}.',
            react: 'No, number {n}!',
          },
        ],
      },
      { npc: 'Here you are. Have a nice day!', ru: 'Пожалуйста, держите. Хорошего дня!' },
      {
        reply: [
          { en: 'Thank you! Goodbye!', ru: 'Спасибо! До свидания!', ok: true },
          {
            en: 'Thank you! You is very kind.',
            ru: 'Спасибо! Вы очень добры.',
            why: 'С you нужно are: you are, коротко — you’re.',
            react: 'Sorry?',
          },
          {
            en: "Thanks! You're welcome!",
            ru: 'Спасибо! Не за что!',
            why: 'You’re welcome — это ответ на «спасибо», а не само «спасибо».',
            react: "Ha! That's my line.",
          },
        ],
      },
    ],
    phrases: [
      ['Is my bag here, please?', 'Моя сумка здесь, пожалуйста?'],
      ['What colour is it?', 'Какого она цвета?'],
    ],
  },
];
