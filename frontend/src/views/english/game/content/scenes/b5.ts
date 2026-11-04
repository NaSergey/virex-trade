import type { Scene } from './types';

/** Блок 5 (раздел 13): there is / there are, повелительное наклонение, let's. */
export const S5: Scene[] = [
  {
    id: 'directions',
    unit: 'u13',
    title: 'Как пройти',
    place: { en: 'STREET · SOHO', ru: 'Улица в Сохо' },
    npc: { name: 'Oliver', role: 'прохожий' },
    goal: 'Узнай, как дойти до банка.',
    vars: { n: ['5', '6', '7', '8', '10'] },
    steps: [
      { npc: 'Hi! You look lost. Can I help?', ru: 'Привет! Ты, кажется, заблудился. Помочь?' },
      {
        reply: [
          { en: 'Excuse me, is there a bank near here?', ru: 'Извините, здесь рядом есть банк?', ok: true },
          {
            en: 'Excuse me, is a bank near here?',
            ru: 'Извините, банк здесь рядом?',
            why: 'Для «есть / имеется» нужно there: Is there a bank…?',
            react: 'Sorry? Is a bank… what?',
          },
          {
            en: 'Excuse me, I am a bank.',
            ru: 'Извините, я банк.',
            why: 'Ты ищешь банк, а не являешься им.',
            react: 'You are a bank? Ha ha!',
          },
        ],
      },
      { npc: 'Yes, there is one. Go straight on, then turn left at the cinema.', ru: 'Да, есть один. Идите прямо, потом поверните налево у кинотеатра.' },
      {
        reply: [
          { en: 'Straight on, then left. Is it far?', ru: 'Прямо, потом налево. Это далеко?', ok: true },
          {
            en: 'Straight on, then left. Are it far?',
            ru: 'Прямо, потом налево. Это далеко?',
            why: 'С it нужно is, а не are: Is it far?',
            react: 'Sorry? Are it…?',
          },
          {
            en: 'Straight on, then left. Is it fast?',
            ru: 'Прямо, потом налево. Это быстрое?',
            why: 'Fast — «быстрый». «Далеко» — far.',
            react: "Fast? It's a bank, not a car!",
          },
        ],
      },
      { npc: "No, it's {n} minutes from here.", ru: 'Нет, это {n} минут отсюда.' },
      {
        reply: [
          {
            en: '{n} minutes? OK.',
            ru: '{n} минут? Хорошо.',
            ok: true,
            distract: 'n',
            why: 'Он сказал {n}.',
            react: 'No, {n} minutes!',
          },
        ],
      },
      { npc: 'Walk past the post office. There is a nice café next to the bank.', ru: 'Пройдите мимо почты. Рядом с банком есть славное кафе.' },
      {
        reply: [
          { en: 'Great. Is there a toilet in the café?', ru: 'Отлично. В кафе есть туалет?', ok: true },
          {
            en: 'Great. Are there a toilet in the café?',
            ru: 'Отлично. В кафе есть туалет?',
            why: 'Toilet — один, поэтому is there: Is there a toilet…?',
            react: 'Sorry? Are there a…?',
          },
          {
            en: 'Great. Is there a bank near the bank?',
            ru: 'Отлично. Рядом с банком есть банк?',
            why: 'Ты же идёшь именно в банк. Вопрос бессмысленный.',
            react: 'A bank near the bank? Ha, why?',
          },
        ],
      },
      { npc: "Yes, there is. It's on the corner. Look, I've got a map here. Do you want to see?", ru: 'Да, есть. Он на углу. Смотрите, у меня тут карта. Хотите посмотреть?' },
      {
        reply: [
          { en: 'Yes, show me on the map, please.', ru: 'Да, покажите на карте, пожалуйста.', ok: true },
          {
            en: 'Yes, shows me on the map, please.',
            ru: 'Да, показывает мне на карте, пожалуйста.',
            why: 'Просьба-команда — глагол без s: Show me.',
            react: 'Sorry? Who shows?',
          },
          {
            en: "Yes, don't show me on the map, please.",
            ru: 'Да, не показывайте мне на карте, пожалуйста.',
            why: 'Don’t — «не делайте», получилось и «да», и «не». Смысл ломается.',
            react: 'Yes… but don\'t show you? Which one?',
          },
        ],
      },
      { npc: "Look, here we are! Turn left at the cinema. Don't forget!", ru: 'Смотрите, вот мы где! Налево у кинотеатра. Не забудьте!' },
      {
        reply: [
          { en: 'OK, left at the cinema. Thanks!', ru: 'Хорошо, налево у кинотеатра. Спасибо!', ok: true },
          {
            en: 'OK, right at the cinema. Thanks!',
            ru: 'Хорошо, направо у кинотеатра. Спасибо!',
            why: 'Он сказал left (налево), а не right.',
            react: 'Right? No, left!',
          },
          {
            en: 'OK, left at the cinema. Thanks you!',
            ru: 'Хорошо, налево у кинотеатра. Спасибо тебе!',
            why: 'Говорят Thank you или Thanks, но не Thanks you.',
            react: 'Ha ha, thanks you! OK, bye.',
          },
        ],
      },
    ],
    phrases: [
      ['Is there a bank near here?', 'Здесь рядом есть банк?'],
      ['Turn left at the cinema.', 'Поверните налево у кинотеатра.'],
      ['Is it far?', 'Это далеко?'],
    ],
  },
  {
    id: 'hotel-problem',
    unit: 'u13',
    title: 'Поломка в номере',
    place: { en: 'HOTEL · PADDINGTON', ru: 'Отель у вокзала Паддингтон' },
    npc: { name: 'Mark', role: 'администратор отеля' },
    goal: 'Расскажи администратору, что не так в номере.',
    vars: { room: ['3', '7', '10', '14', '18'] },
    steps: [
      { npc: 'Reception. How can I help?', ru: 'Ресепшен. Чем могу помочь?' },
      {
        reply: [
          { en: "Hello, there's no towel in my room.", ru: 'Здравствуйте, в моём номере нет полотенца.', ok: true },
          {
            en: 'Hello, is no towel in my room.',
            ru: 'Здравствуйте, нет полотенца в моём номере.',
            why: 'Нужно there: There’s no towel…',
            react: 'Sorry? Is… what?',
          },
          {
            en: 'Hello, there are no towel in my room.',
            ru: 'Здравствуйте, нет полотенец в моём номере.',
            why: 'Towel — одно, поэтому is, а не are: there’s no towel.',
            react: 'Sorry, no towel or no towels?',
          },
        ],
        accept: ['Hello, there is no towel in my room.'],
      },
      { npc: "I'm sorry! Your room is {room}, right?", ru: 'Простите! Ваш номер {room}, верно?' },
      {
        reply: [
          {
            en: 'Yes, room {room}.',
            ru: 'Да, номер {room}.',
            ok: true,
            distract: 'room',
            why: 'Он сказал {room}.',
            react: 'No, room {room}!',
          },
        ],
      },
      { npc: 'Thank you. Is there anything else?', ru: 'Спасибо. Что-нибудь ещё не так?' },
      {
        reply: [
          { en: "Yes. There's no hot water.", ru: 'Да. И горячей воды нет.', ok: true },
          {
            en: 'Yes. There are no hot water.',
            ru: 'Да. И нет горячей воды.',
            why: 'Water неисчисляемое, поэтому is: there’s no hot water.',
            react: 'Sorry, there are…?',
          },
          {
            en: 'Yes. The weather is nice today.',
            ru: 'Да. Сегодня хорошая погода.',
            why: 'Спросили о проблемах, а не о погоде.',
            react: 'Er… yes, but is there another problem?',
          },
        ],
        accept: ['Yes. There is no hot water.'],
      },
      { npc: "Oh no! I'm sorry. Wait in the lobby, please. Don't worry!", ru: 'Ох, простите! Подождите в холле, пожалуйста. Не волнуйтесь!' },
      {
        reply: [
          { en: 'OK. Is there a café in the hotel?', ru: 'Хорошо. В отеле есть кафе?', ok: true },
          {
            en: 'OK. Are there a café in the hotel?',
            ru: 'Хорошо. В отеле есть кафе?',
            why: 'Café — одно, значит is there: Is there a café…?',
            react: 'Sorry, are there a…?',
          },
          {
            en: 'OK. Wait you in the lobby, please.',
            ru: 'Хорошо. Ждите вы в холле, пожалуйста.',
            why: 'Wait — команда тому, кто ждёт. Здесь ждать должен ты, а не он.',
            react: 'No, no, YOU wait in the lobby!',
          },
        ],
      },
      { npc: 'Yes, there is — on the ground floor. Here are two towels. Is there a problem with the bed?', ru: 'Да, на первом этаже. Вот два полотенца. С кроватью есть проблема?' },
      {
        reply: [
          { en: 'No, the bed is fine.', ru: 'Нет, кровать в порядке.', ok: true },
          {
            en: 'No, the bed are fine.',
            ru: 'Нет, кровать в порядке.',
            why: 'Bed — одна, поэтому is: the bed is fine.',
            react: 'Sorry? The bed… are?',
          },
          {
            en: 'Yes, the bed is fine.',
            ru: 'Да, кровать в порядке.',
            why: 'Спросили «есть проблема?», и «да» значит «есть». Противоречие.',
            react: 'So there is a problem? Which one?',
          },
        ],
      },
      { npc: 'Good. Sorry again. How about a free breakfast tomorrow?', ru: 'Хорошо. Ещё раз простите. Как насчёт бесплатного завтрака завтра?' },
      {
        reply: [
          { en: "That's very nice. Thank you!", ru: 'Это очень мило. Спасибо!', ok: true },
          {
            en: 'That very nice. Thank you!',
            ru: 'Это очень мило. Спасибо!',
            why: 'Пропущено is: That’s very nice.',
            react: 'Sorry? That… very nice?',
          },
          {
            en: "That's very bad. Thank you!",
            ru: 'Это очень плохо. Спасибо!',
            why: 'Бесплатный завтрак — это хорошо, bad не подходит.',
            react: 'Bad? A free breakfast?!',
          },
        ],
      },
    ],
    phrases: [
      ["There's no towel in my room.", 'В моём номере нет полотенца.'],
      ['Is there a café in the hotel?', 'В отеле есть кафе?'],
    ],
  },
  {
    id: 'weekend-plans',
    unit: 'u13',
    title: 'Планы на выходные',
    place: { en: 'OFFICE · CANARY WHARF', ru: 'Офис в Кэнэри-Уорф' },
    npc: { name: 'Zoe', role: 'коллега' },
    goal: 'Договорись с коллегой о прогулке в парке.',
    vars: { time: ['9:00', '9:30', '10:00', '10:30', '11:00'] },
    steps: [
      { npc: "Hi Sasha! It's Friday. What about a walk at the weekend?", ru: 'Привет, Саша! Сегодня пятница. Как насчёт прогулки на выходных?' },
      {
        reply: [
          { en: "Good idea! Let's go to the park.", ru: 'Хорошая мысль! Пойдём в парк.', ok: true },
          {
            en: "Good idea! Let's goes to the park.",
            ru: 'Хорошая мысль! Давай идёт в парк.',
            why: 'После let’s глагол без s: Let’s go.',
            react: 'Sorry? Let’s… goes?',
          },
          {
            en: "Good idea! Don't go to the park.",
            ru: 'Хорошая мысль! Не ходи в парк.',
            why: 'Don’t go — «не иди». Ты согласился, а получилось «не ходи».',
            react: 'No park? OK… where then?',
          },
        ],
      },
      { npc: 'OK! It is sunny. Is there a café in the park?', ru: 'Хорошо! Сейчас солнечно. В парке есть кафе?' },
      {
        reply: [
          { en: "Yes, there is. Let's have coffee.", ru: 'Да, есть. Давай выпьем кофе.', ok: true },
          {
            en: "Yes, there are. Let's have coffee.",
            ru: 'Да, есть. Давай выпьем кофе.',
            why: 'Кафе одно, поэтому there is, а не there are.',
            react: 'Sorry, there are how many cafés?',
          },
          {
            en: "No, there isn't. Let's have coffee there.",
            ru: 'Нет, нету. Давай выпьем кофе там.',
            why: 'Сначала «кафе нет», потом «пьём кофе там» — противоречие.',
            react: 'No café, but coffee there? Where?',
          },
        ],
      },
      { npc: "Great. Meet me at the gate at {time}. Don't be late!", ru: 'Здорово. Встретимся у ворот в {time}. Не опаздывай!' },
      {
        reply: [
          {
            en: 'OK, {time} at the gate!',
            ru: 'Хорошо, в {time} у ворот!',
            ok: true,
            distract: 'time',
            why: 'Она сказала {time}.',
            react: 'No, {time}!',
          },
        ],
      },
      { npc: "Brilliant. And food? Let's have a picnic.", ru: 'Отлично. А еда? Давай устроим пикник.' },
      {
        reply: [
          { en: "Yes! Let's buy sandwiches.", ru: 'Да! Давай купим бутерброды.', ok: true },
          {
            en: "Yes! Let's buying sandwiches.",
            ru: 'Да! Давай покупая бутерброды.',
            why: 'После let’s идёт простая форма глагола: Let’s buy.',
            react: 'Buying…? Sorry?',
          },
          {
            en: 'Yes! Buy me sandwiches, Zoe.',
            ru: 'Да! Купи мне бутерброды, Зои.',
            why: 'Это приказ. Предложить сделать вместе — Let’s.',
            react: 'Buy YOU sandwiches? Ha, buy your own!',
          },
        ],
      },
      { npc: 'After the park, what about the cinema? Is there a good film?', ru: 'После парка — как насчёт кино? Там есть хороший фильм?' },
      {
        reply: [
          { en: 'Yes, there are three good films.', ru: 'Да, там три хороших фильма.', ok: true },
          {
            en: 'Yes, there is three good films.',
            ru: 'Да, там есть три хороших фильма.',
            why: 'Фильмов три — множественное число, поэтому there are.',
            react: 'Sorry, there is… three?',
          },
          {
            en: 'No, there are three good films.',
            ru: 'Нет, там три хороших фильма.',
            why: 'Сказано «нет», но тут же названы три хороших фильма — противоречие.',
            react: 'No… but three? Which one is it?',
          },
        ],
      },
      { npc: 'Super. Have a good evening, Sasha. See you at the weekend!', ru: 'Супер. Хорошего вечера, Саша. До встречи на выходных!' },
      {
        reply: [
          { en: 'Bye, Zoe! Have a nice weekend!', ru: 'Пока, Зои! Хороших выходных!', ok: true },
          {
            en: 'Bye, Zoe! Has a nice weekend!',
            ru: 'Пока, Зои! Имеет хорошие выходные!',
            why: 'Пожелание начинается с Have: Have a nice weekend!',
            react: 'Sorry? Who has?',
          },
          {
            en: "Bye, Zoe! Don't have a nice weekend!",
            ru: 'Пока, Зои! Не проводи хорошие выходные!',
            why: 'Don’t — запрет. Получилось пожелание плохих выходных.',
            react: 'Thanks a lot, Sasha!',
          },
        ],
      },
    ],
    phrases: [
      ["Let's go to the park.", 'Пойдём в парк.'],
      ['Is there a café in the park?', 'В парке есть кафе?'],
    ],
  },
];
