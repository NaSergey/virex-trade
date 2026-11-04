import type { Scene } from './types';

/** Блок 2 (раздел 4): вопросы с to be и краткие ответы, притяжательное 's, множественное число. */
export const S2: Scene[] = [
  {
    id: 'cafe-takeaway',
    unit: 'u04',
    title: 'Кофе с собой',
    place: { en: 'CAFÉ · SHOREDITCH', ru: 'Кафе в Шордиче' },
    npc: { name: 'Mia', role: 'бариста' },
    goal: 'Закажи кофе с собой, узнай цену и назови имя для стаканчика.',
    vars: { price: ['£2', '£3', '£3.50', '£4', '£4.50'] },
    steps: [
      { npc: 'Hi there! What can I get you?', ru: 'Привет! Что вам предложить?' },
      {
        reply: [
          { en: 'Can I have a coffee, please?', ru: 'Можно мне кофе, пожалуйста?', ok: true },
          {
            en: 'Can I have an coffee, please?',
            ru: 'Можно мне кофе, пожалуйста?',
            why: 'Перед согласным звуком — a, а не an: a coffee.',
            react: 'A coffee? Sure!',
          },
          {
            en: 'Can I have a ticket, please?',
            ru: 'Можно мне билет, пожалуйста?',
            why: 'Это кафе, билеты тут не продают.',
            react: 'A ticket? This is a café!',
          },
        ],
      },
      { npc: 'Sure. Is it for here or takeaway?', ru: 'Конечно. Здесь или с собой?' },
      {
        reply: [
          { en: 'Takeaway, please.', ru: 'С собой, пожалуйста.', ok: true },
          {
            en: 'Is for takeaway, please.',
            ru: 'Это с собой, пожалуйста.',
            why: 'Нужно подлежащее: It’s for takeaway. Без it фраза не складывается.',
            react: 'Sorry, what is?',
          },
          {
            en: 'Yes, it is.',
            ru: 'Да, это так.',
            why: 'Вопрос «или-или» — «да» не отвечает. Нужно выбрать: here или takeaway.',
            react: 'Yes… for here? Or takeaway?',
          },
        ],
        accept: ["It's takeaway, please.", "It's for takeaway, please."],
      },
      { npc: 'Great. Look, we have cakes today.', ru: 'Отлично. Смотрите, у нас сегодня пирожные.' },
      {
        reply: [
          { en: 'Are the cakes nice?', ru: 'Пирожные вкусные?', ok: true },
          {
            en: 'Is the cakes nice?',
            ru: 'Пирожные вкусные?',
            why: 'Cakes — множественное число, поэтому are: Are the cakes nice?',
            react: 'Sorry? The cakes?',
          },
          {
            en: 'No, I am not a cake.',
            ru: 'Нет, я не пирожное.',
            why: 'Ответ не к месту: тебя спросили про пирожные, а не про тебя.',
            react: 'Ha! I hope not.',
          },
        ],
      },
      { npc: 'Yes, they are! Anything else?', ru: 'Да, вкусные! Что-нибудь ещё?' },
      {
        reply: [
          { en: 'No, thanks. How much is it?', ru: 'Нет, спасибо. Сколько с меня?', ok: true },
          {
            en: 'No, thanks. How much it is?',
            ru: 'Нет, спасибо. Сколько с меня?',
            why: 'В вопросе is идёт перед it: How much is it?',
            react: 'Sorry, how much is… what?',
          },
          {
            en: 'No, thanks. How old is it?',
            ru: 'Нет, спасибо. Сколько ему лет?',
            why: 'How old — про возраст. Цену спрашивают How much.',
            react: 'Old? It is a fresh coffee!',
          },
        ],
      },
      { npc: "That's {price}, please.", ru: 'С вас {price}.' },
      {
        reply: [
          {
            en: '{price}? Here you are.',
            ru: '{price}? Вот, возьмите.',
            ok: true,
            distract: 'price',
            why: 'Она сказала {price}.',
            react: 'No, {price}!',
          },
        ],
      },
      { npc: "Thanks! What's your name for the cup?", ru: 'Спасибо! Как записать имя на стаканчике?' },
      {
        reply: [
          { en: "It's Sasha.", ru: 'Саша.', ok: true },
          {
            en: 'My name Sasha.',
            ru: 'Моё имя Саша.',
            why: 'Пропущено is: My name is Sasha.',
            react: 'Sorry? Sasha?',
          },
          {
            en: "It's a coffee.",
            ru: 'Это кофе.',
            why: 'Спросили имя, а не что в стаканчике.',
            react: 'Yes, I know! But what is your name?',
          },
        ],
        accept: ['Sasha.', 'My name is Sasha.', "My name's Sasha."],
      },
    ],
    phrases: [
      ['Can I have a coffee, please?', 'Можно мне кофе, пожалуйста?'],
      ['How much is it?', 'Сколько это стоит?'],
      ['Here you are.', 'Вот, возьмите.'],
    ],
  },
  {
    id: 'family-photo',
    unit: 'u04',
    title: 'Семейное фото',
    place: { en: 'FLAT · BRIXTON', ru: 'Квартира соседки в Брикстоне' },
    npc: { name: 'Rosa', role: 'соседка' },
    goal: 'Посмотри семейное фото соседки и спроси, кто на нём.',
    vars: { age: ['5', '6', '8', '9', '11'] },
    steps: [
      { npc: 'Come in, Sasha! Look, this is my family photo.', ru: 'Заходи, Саша! Смотри, это моё семейное фото.' },
      {
        reply: [
          { en: 'Nice photo! Who is this?', ru: 'Классное фото! Кто это?', ok: true },
          {
            en: 'Nice photo! Who this is?',
            ru: 'Классное фото! Кто это?',
            why: 'В вопросе порядок другой: is перед this — Who is this?',
            react: 'Sorry? Who this… what?',
          },
          {
            en: "Nice photo! I'm hungry.",
            ru: 'Классное фото! Я голодный.',
            why: 'Ответ не к месту: речь о фото.',
            react: 'Hungry? Ha, have a biscuit!',
          },
        ],
      },
      { npc: "That's my sister, Kate, with her two children.", ru: 'Это моя сестра Кейт со своими двумя детьми.' },
      {
        reply: [
          { en: 'What are their names?', ru: 'Как их зовут?', ok: true },
          {
            en: 'What is their names?',
            ru: 'Как их зовут?',
            why: 'Names — множественное число, поэтому are: What are their names?',
            react: 'Sorry? Their names?',
          },
          {
            en: 'How old are you?',
            ru: 'Сколько тебе лет?',
            why: 'Спросили про детей на фото, а ты вдруг спрашиваешь возраст хозяйки — это ещё и невежливо.',
            react: "Me? That's a very rude question, Sasha!",
          },
        ],
      },
      { npc: 'Ben and Lily. Ben is {age} years old.', ru: 'Бен и Лили. Бену {age} лет.' },
      {
        reply: [
          {
            en: '{age} years old? Nice!',
            ru: '{age} лет? Здорово!',
            ok: true,
            distract: 'age',
            why: 'Она сказала {age}.',
            react: 'No, {age}!',
          },
        ],
      },
      { npc: 'And Lily is his sister.', ru: 'А Лили — его сестра.' },
      {
        reply: [
          { en: "So Lily is Kate's daughter.", ru: 'Значит, Лили — дочь Кейт.', ok: true },
          {
            en: 'So Lily is Kate daughter.',
            ru: 'Значит, Лили — Кейт дочь.',
            why: 'Принадлежность передаёт ’s: Kate’s daughter.',
            react: 'Kate… what? Kate’s daughter, yes.',
          },
          {
            en: 'So Lily is a boy.',
            ru: 'Значит, Лили — мальчик.',
            why: 'Бен — мальчик, а Лили — его сестра, то есть девочка.',
            react: 'A boy? Lily is a girl!',
          },
        ],
      },
      { npc: 'Yes! Is this your first time in London?', ru: 'Да! Ты в Лондоне впервые?' },
      {
        reply: [
          { en: "Yes, it is. I'm from Russia.", ru: 'Да, впервые. Я из России.', ok: true },
          {
            en: "Yes, I am. I'm from Russia.",
            ru: 'Да, я. Я из России.',
            why: 'Вопрос начинается с Is this…, значит и краткий ответ — Yes, it is.',
            react: 'You are what? Ha ha. Yes, it is!',
          },
          {
            en: "No, thanks. I'm not hungry.",
            ru: 'Нет, спасибо. Я не голоден.',
            why: 'Спросили про Лондон, а не про еду.',
            react: 'Hungry? I asked about London!',
          },
        ],
        accept: ["Yes, it is. I'm Russian."],
      },
      { npc: 'Welcome to London! Would you like some tea?', ru: 'Добро пожаловать в Лондон! Хочешь чаю?' },
      {
        reply: [
          { en: 'Yes, please. Thank you!', ru: 'Да, пожалуйста. Спасибо!', ok: true },
          {
            en: 'Yes, I am. Thank you.',
            ru: 'Да, это так. Спасибо.',
            why: 'На предложение отвечают Yes, please. Yes, I am — ответ на вопрос с are/am.',
            react: 'You are what? Ha!',
          },
          {
            en: 'Yes, please. Who are you?',
            ru: 'Да, пожалуйста. Кто вы?',
            why: 'Вы только что познакомились, и она — хозяйка. Вопрос звучит странно и грубо.',
            react: "I'm Rosa, your neighbour! Are you OK?",
          },
        ],
      },
    ],
    phrases: [
      ['Who is this?', 'Кто это?'],
      ["Lily is Kate's daughter.", 'Лили — дочь Кейт.'],
    ],
  },
  {
    id: 'souvenir-shop',
    unit: 'u04',
    title: 'Сувенирная лавка',
    place: { en: 'GIFT SHOP · COVENT GARDEN', ru: 'Сувенирная лавка в Ковент-Гардене' },
    npc: { name: 'Ed', role: 'продавец сувениров' },
    goal: 'Выбери открытки и кружку, узнай цену и расплатись.',
    vars: { price: ['£2', '£3', '£5', '£6.50', '£8'] },
    steps: [
      { npc: 'Hello! Are you looking for something?', ru: 'Здравствуйте! Вы что-то ищете?' },
      {
        reply: [
          { en: 'Yes, please. Where are the postcards?', ru: 'Да. Где открытки?', ok: true },
          {
            en: 'Yes, please. Where is the postcards?',
            ru: 'Да. Где открытки?',
            why: 'Postcards — множественное число, поэтому are: Where are the postcards?',
            react: 'Sorry, the what?',
          },
          {
            en: 'Yes, please. Where are you from?',
            ru: 'Да. Откуда вы?',
            why: 'Спросили, что нужно в магазине, а ты спрашиваешь продавца, откуда он.',
            react: "Me? I'm from Leeds. But what about the postcards?",
          },
        ],
      },
      { npc: "Over there, next to the mugs. They're all nice.", ru: 'Вон там, рядом с кружками. Все красивые.' },
      {
        reply: [
          { en: 'How much are these mugs?', ru: 'Сколько стоят эти кружки?', ok: true },
          {
            en: 'How much is these mugs?',
            ru: 'Сколько стоят эти кружки?',
            why: 'Mugs — множественное число, нужно are: How much are these mugs?',
            react: 'Sorry? How much is… the mugs?',
          },
          {
            en: 'Who are these mugs?',
            ru: 'Кто эти кружки?',
            why: 'Who — про людей. О вещах спрашивают What, а о цене — How much.',
            react: 'Who? They are mugs, not people!',
          },
        ],
      },
      { npc: 'The mugs are {price} each.', ru: 'Кружки по {price} за штуку.' },
      {
        reply: [
          {
            en: '{price} each? OK.',
            ru: 'По {price}? Хорошо.',
            ok: true,
            distract: 'price',
            why: 'Он сказал {price}.',
            react: 'No, {price} each!',
          },
        ],
      },
      { npc: 'Anything else?', ru: 'Что-нибудь ещё?' },
      {
        reply: [
          { en: 'Yes. Two postcards and a mug, please.', ru: 'Да. Две открытки и кружку, пожалуйста.', ok: true },
          {
            en: 'Yes. Two postcard and a mug, please.',
            ru: 'Да. Две открытка и кружку, пожалуйста.',
            why: 'После two — множественное число: two postcards.',
            react: 'Two… postcards? OK!',
          },
          {
            en: "Yes. What's your name?",
            ru: 'Да. Как вас зовут?',
            why: 'Продавец спросил, что ещё нужно, а ты выбираешь покупки, а не знакомишься.',
            react: 'Er… Ed. Why?',
          },
        ],
        accept: ['Yes. Two postcards and one mug, please.'],
      },
      { npc: 'Would you like a bag? It is 10p.', ru: 'Хотите пакет? Он стоит 10 пенсов.' },
      {
        reply: [
          { en: 'No, thank you. This is my bag.', ru: 'Нет, спасибо. Вот моя сумка.', ok: true },
          {
            en: 'No, thank you. This are my bag.',
            ru: 'Нет, спасибо. Вот моя сумка.',
            why: 'This — один предмет, поэтому is: This is my bag.',
            react: 'Sorry? This… what?',
          },
          {
            en: 'No, thanks. Are you a student?',
            ru: 'Нет, спасибо. Вы студент?',
            why: 'Вопрос не к месту: речь о пакете.',
            react: "Me? No, I'm the owner's son.",
          },
        ],
      },
      { npc: "OK, here are your things. Have a nice day in London!", ru: 'Хорошо, вот ваши покупки. Приятного дня в Лондоне!' },
      {
        reply: [
          { en: 'Thank you very much! Bye!', ru: 'Большое спасибо! Пока!', ok: true },
          {
            en: 'Thank you very much! Hello!',
            ru: 'Большое спасибо! Здравствуйте!',
            why: 'Hello — приветствие, а ты уходишь. Прощаются словом Bye.',
            react: "Hello? You're leaving!",
          },
          {
            en: 'Thank you very much! I are happy.',
            ru: 'Большое спасибо! Я счастлив.',
            why: 'С I нужно am: I’m happy.',
            react: 'Sorry? Ha ha, have a nice day!',
          },
        ],
      },
    ],
    phrases: [
      ['How much are these mugs?', 'Сколько стоят эти кружки?'],
      ['Where are the postcards?', 'Где открытки?'],
    ],
  },
];
