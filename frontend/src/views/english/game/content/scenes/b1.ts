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
];
