import type { Scene } from './types';

/** Блок 3 (раздел 7): to be — отрицание, this / that / these / those, have got — вопросы, предлоги места. */
export const S3: Scene[] = [
  {
    id: 'tube-ticket',
    unit: 'u07',
    title: 'Касса метро',
    place: { en: 'TICKET OFFICE · VICTORIA', ru: 'Касса на станции Виктория' },
    npc: { name: 'Raj', role: 'кассир метро' },
    goal: 'Купи билет до Оксфорд-Серкус и узнай, с какой платформы поезд.',
    vars: { platform: ['1', '3', '6', '9', '12'] },
    steps: [
      { npc: 'Next, please! Hello. How can I help?', ru: 'Следующий! Здравствуйте. Чем могу помочь?' },
      {
        reply: [
          { en: 'Hello. A ticket to Oxford Circus, please.', ru: 'Здравствуйте. Билет до Оксфорд-Серкус, пожалуйста.', ok: true },
          {
            en: 'Hello. A tickets to Oxford Circus, please.',
            ru: 'Здравствуйте. Один билеты до Оксфорд-Серкус, пожалуйста.',
            why: 'A — «один», а tickets — «билеты». Один билет — a ticket.',
            react: 'One ticket? OK.',
          },
          {
            en: 'Hello. A pizza to Oxford Circus, please.',
            ru: 'Здравствуйте. Пиццу до Оксфорд-Серкус, пожалуйста.',
            why: 'В кассе метро заказывают билет, а не пиццу.',
            react: 'A pizza? This is the Tube!',
          },
        ],
      },
      { npc: 'Single or return?', ru: 'В один конец или туда-обратно?' },
      {
        reply: [
          { en: 'A single, please.', ru: 'В один конец, пожалуйста.', ok: true },
          {
            en: 'A singles, please.',
            ru: 'В один конец (мн.), пожалуйста.',
            why: 'Билет один, поэтому single без s.',
            react: 'Singles? One ticket, right?',
          },
          {
            en: 'I am not single, please.',
            ru: 'Я не одинок, пожалуйста.',
            why: 'Single в кассе — билет в один конец. «Одинокий» тут ни при чём.',
            react: 'Not single? Congratulations! But which ticket?',
          },
        ],
        accept: ['Single, please.', 'A single ticket, please.'],
      },
      { npc: 'OK. Your train is from platform {platform}.', ru: 'Хорошо. Ваш поезд — с платформы {platform}.' },
      {
        reply: [
          {
            en: 'Platform {platform}? Thank you!',
            ru: 'Платформа {platform}? Спасибо!',
            ok: true,
            distract: 'platform',
            why: 'Он сказал платформа {platform}.',
            react: 'No, platform {platform}!',
          },
        ],
      },
      { npc: "Anything else? It's a busy day today.", ru: 'Что-нибудь ещё? Сегодня много народа.' },
      {
        reply: [
          { en: 'Thanks. Have you got a Tube map?', ru: 'Спасибо. У вас есть карта метро?', ok: true },
          {
            en: 'Thanks. Has you got a Tube map?',
            ru: 'Спасибо. У вас есть карта метро?',
            why: 'С you в вопросе стоит have, а не has: Have you got…?',
            react: 'Sorry, has who?',
          },
          {
            en: 'Thanks. Have you got a dog?',
            ru: 'Спасибо. У вас есть собака?',
            why: 'Вопрос не к месту: нужна карта метро, а не собака.',
            react: 'A dog? In the ticket office?',
          },
        ],
      },
      { npc: "Yes, here you are. It's free. Oh, is this your bag on the floor?", ru: 'Да, держите. Она бесплатная. О, это ваша сумка на полу?' },
      {
        reply: [
          { en: "No, it isn't my bag.", ru: 'Нет, это не моя сумка.', ok: true },
          {
            en: 'No, it not my bag.',
            ru: 'Нет, это не моя сумка.',
            why: 'Для отрицания с to be нужно isn’t или is not: it isn’t.',
            react: 'Sorry? It… not?',
          },
          {
            en: "Yes, it isn't.",
            ru: 'Да, это не она.',
            why: 'Yes и isn’t противоречат друг другу. Либо Yes, it is, либо No, it isn’t.',
            react: 'So… is it your bag or not?',
          },
        ],
        accept: ["No, it's not my bag.", "No, that isn't my bag.", "No, that's not my bag."],
      },
      { npc: 'OK, then it is lost property. Have a good trip!', ru: 'Тогда это потеряшка. Счастливого пути!' },
      {
        reply: [
          { en: 'Thanks, you too!', ru: 'Спасибо, и вам!', ok: true },
          {
            en: "Thanks, you're welcome!",
            ru: 'Спасибо, пожалуйста!',
            why: 'You’re welcome — это ответ на «спасибо». На пожелание отвечают you too.',
            react: 'Welcome to what? Ha ha!',
          },
          {
            en: "Thanks! This isn't a trip, it's a ticket.",
            ru: 'Спасибо! Это не поездка, это билет.',
            why: 'На пожелание отвечают тёплым «и вам», а не спорят со словами.',
            react: "Ha! OK, it's a ticket. Bye!",
          },
        ],
      },
    ],
    phrases: [
      ['A single, please.', 'Билет в один конец, пожалуйста.'],
      ['Have you got a Tube map?', 'У вас есть карта метро?'],
    ],
  },
  {
    id: 'where-keys',
    unit: 'u07',
    title: 'Где ключи?',
    place: { en: 'FLAT · CLAPHAM', ru: 'Квартира в Клэпеме' },
    npc: { name: 'Dan', role: 'сосед по квартире' },
    goal: 'Помоги соседу найти ключи и телефон.',
    vars: { thing: ['sofa', 'chair', 'shelf', 'bed', 'piano'] },
    steps: [
      { npc: 'Sasha, help! My keys are not on the table.', ru: 'Саша, помоги! Моих ключей нет на столе.' },
      {
        reply: [
          { en: 'Are they in your bag?', ru: 'Они в твоей сумке?', ok: true },
          {
            en: 'Is they in your bag?',
            ru: 'Они в твоей сумке?',
            why: 'Они — they, а с they нужно are: Are they…?',
            react: 'Sorry? Is who?',
          },
          {
            en: 'Is your bag in your keys?',
            ru: 'Твоя сумка в твоих ключах?',
            why: 'Наоборот: ключи могут лежать в сумке, а не сумка в ключах.',
            react: 'In my keys? Ha ha, no!',
          },
        ],
      },
      { npc: "No, they aren't. And where's my phone? Have you got it?", ru: 'Нет. И где мой телефон? Он у тебя?' },
      {
        reply: [
          { en: "No, I haven't. Sorry.", ru: 'Нет. Извини.', ok: true },
          {
            en: "No, I'm not. Sorry.",
            ru: 'Нет, я не такой. Извини.',
            why: 'На вопрос Have you got…? краткий ответ — No, I haven’t.',
            react: 'Not what? Ha!',
          },
          {
            en: 'No, I not have. Sorry.',
            ru: 'Нет, я не иметь. Извини.',
            why: 'Краткий ответ строится с haven’t: No, I haven’t.',
            react: 'Sorry? Say it again.',
          },
        ],
      },
      { npc: 'Wait, look! My keys are on the {thing}!', ru: 'Постой, смотри! Ключи нашлись: «on the {thing}»!' },
      {
        reply: [
          {
            en: 'On the {thing}? Great!',
            ru: '«On the {thing}»? Здорово!',
            ok: true,
            distract: 'thing',
            why: 'Он сказал on the {thing}.',
            react: 'No, on the {thing}!',
          },
        ],
      },
      { npc: 'Thanks! Now my phone. Where is it?', ru: 'Спасибо! Теперь телефон. Где он?' },
      {
        reply: [
          { en: 'Is it in your jacket?', ru: 'Он в твоей куртке?', ok: true },
          {
            en: 'Is it at your jacket?',
            ru: 'Он у твоей куртки?',
            why: 'Предмет внутри куртки — in your jacket, а не at.',
            react: 'At my jacket? Ha, in my jacket!',
          },
          {
            en: 'Is it in London?',
            ru: 'Он в Лондоне?',
            why: 'Ответ слишком общий и смешной: вы оба в Лондоне.',
            react: "Of course it's in London! Look in my jacket!",
          },
        ],
      },
      { npc: "Oh! Yes, it's here. You're great, Sasha. Thank you!", ru: 'О! Да, он тут. Ты молодец, Саша. Спасибо!' },
      {
        reply: [
          { en: "You're welcome, Dan!", ru: 'Пожалуйста, Дэн!', ok: true },
          {
            en: "I'm welcome, Dan!",
            ru: 'Я желанный гость, Дэн!',
            why: 'На «спасибо» отвечают You’re welcome — «пожалуйста». I’m welcome значит «мне рады».',
            react: 'You are welcome here, yes. But I said thank you!',
          },
          {
            en: 'No, thank you. They are not my keys.',
            ru: 'Нет, спасибо. Это не мои ключи.',
            why: 'Ключи — его, и благодарят его за помощь. Отказываться не за что.',
            react: 'I know they are not your keys! They are mine!',
          },
        ],
        accept: ["You're welcome!", 'No problem, Dan!'],
      },
    ],
    phrases: [
      ['Are they in your bag?', 'Они в твоей сумке?'],
      ["No, I haven't.", 'Нет, у меня нет.'],
    ],
  },
  {
    id: 'market',
    unit: 'u07',
    title: 'На рынке',
    place: { en: 'MARKET · PORTOBELLO ROAD', ru: 'Рынок на Портобелло-роуд' },
    npc: { name: 'Gina', role: 'торговка фруктами' },
    goal: 'Выбери сладкие яблоки и спроси цену сыра.',
    vars: { price: ['£1', '£2', '£3.50', '£5', '£6'] },
    steps: [
      { npc: "Morning, love! Try my apples. They're lovely.", ru: 'Доброе утро, дорогой! Попробуй мои яблоки. Они замечательные.' },
      {
        reply: [
          { en: 'Good morning. Are these apples sweet?', ru: 'Доброе утро. Эти яблоки сладкие?', ok: true },
          {
            en: 'Good morning. Is these apples sweet?',
            ru: 'Доброе утро. Эти яблоки сладкие?',
            why: 'Apples — множественное число, поэтому are: Are these apples…?',
            react: 'Sorry? Is… these?',
          },
          {
            en: 'Good evening. Are these apples sweet?',
            ru: 'Добрый вечер. Эти яблоки сладкие?',
            why: 'Сейчас утро: Good evening говорят вечером.',
            react: "Evening? It's ten in the morning!",
          },
        ],
      },
      { npc: 'Yes! These are very sweet. Those over there are not sweet. Which apples?', ru: 'Да! Эти очень сладкие. Те, вон там, не сладкие. Какие яблоки?' },
      {
        reply: [
          { en: "These, please. They're sweet.", ru: 'Вот эти, пожалуйста. Они сладкие.', ok: true },
          {
            en: "Those, please. They're not sweet.",
            ru: 'Вон те, пожалуйста. Они не сладкие.',
            why: 'Сладкие яблоки — у неё эти (these), а те (those) — несладкие. Зачем брать их?',
            react: 'Not sweet? Why those, love?',
          },
          {
            en: 'This, please. They are sweet.',
            ru: 'Этот, пожалуйста. Они сладкие.',
            why: 'Яблок много, поэтому these, а не this.',
            react: 'This? They are many apples!',
          },
        ],
      },
      { npc: "Lovely. That's {price} a bag.", ru: 'Отлично. Это {price} за пакет.' },
      {
        reply: [
          {
            en: '{price}? OK, thanks.',
            ru: '{price}? Хорошо, спасибо.',
            ok: true,
            distract: 'price',
            why: 'Она сказала {price}.',
            react: 'No, {price}!',
          },
        ],
      },
      { npc: 'Anything else? Look at that cheese over there. It is very nice.', ru: 'Что-нибудь ещё? Посмотри на тот сыр там. Он очень вкусный.' },
      {
        reply: [
          { en: 'How much is that cheese?', ru: 'Сколько стоит тот сыр?', ok: true },
          {
            en: 'How much are that cheese?',
            ru: 'Сколько стоят тот сыр?',
            why: 'Cheese — один сыр, поэтому is: How much is that cheese?',
            react: 'Sorry? How much… are?',
          },
          {
            en: 'That cheese is not nice. Bye.',
            ru: 'Тот сыр невкусный. Пока.',
            why: 'Спросить цену — одно, а так отвечать на похвалу — грубо.',
            react: "Not nice?! It's the best cheese in London!",
          },
        ],
      },
      { npc: "It's £4 a piece. Is that OK?", ru: 'Он стоит £4 за кусок. Подойдёт?' },
      {
        reply: [
          { en: "No, thanks. It isn't cheap.", ru: 'Нет, спасибо. Он не дешёвый.', ok: true },
          {
            en: 'No, thanks. It no cheap.',
            ru: 'Нет, спасибо. Он не дешёвый.',
            why: 'Для отрицания с to be нужно isn’t: It isn’t cheap.',
            react: 'Sorry? It no…?',
          },
          {
            en: "Yes, thanks. It isn't cheap.",
            ru: 'Да, спасибо. Он не дешёвый.',
            why: 'Yes и isn’t cheap противоречат друг другу: либо «да, подойдёт», либо «нет, дорого».',
            react: 'So… yes or no, love?',
          },
        ],
        accept: ["No, thanks. It's not cheap.", "No, thank you. It isn't cheap."],
      },
      { npc: 'Fair enough! Here are your apples. See you next week!', ru: 'Ну ладно! Вот ваши яблоки. До встречи на следующей неделе!' },
      {
        reply: [
          { en: 'Thanks. Have a good day!', ru: 'Спасибо. Хорошего дня!', ok: true },
          {
            en: 'Thanks. Has a good day!',
            ru: 'Спасибо. Имеет хороший день!',
            why: 'Пожелание начинается с Have: Have a good day!',
            react: 'Sorry? Who has a good day?',
          },
          {
            en: 'Thanks. Have a good apple!',
            ru: 'Спасибо. Хорошего яблока!',
            why: 'Желают хорошего дня, а не хорошего яблока.',
            react: 'Ha ha! A good apple. You too, love!',
          },
        ],
      },
    ],
    phrases: [
      ['Are these apples sweet?', 'Эти яблоки сладкие?'],
      ['How much is that cheese?', 'Сколько стоит тот сыр?'],
    ],
  },
];
