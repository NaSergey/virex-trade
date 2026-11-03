import type { Scene } from './types';

/** Блок 6 (раздел 16): can — умение и просьба, like / don't like, him / her / it. */
export const S6: Scene[] = [
  {
    id: 'restaurant-allergy',
    unit: 'u16',
    title: 'Ресторан и аллергия',
    place: { en: 'RESTAURANT · SOUTH BANK', ru: 'Ресторан на Саут-Банке' },
    npc: { name: 'Marco', role: 'официант' },
    goal: 'Займи столик, предупреди об орехах и закажи ужин.',
    vars: { t: ['4', '6', '9', '12', '15'] },
    steps: [
      { npc: 'Good evening! Table for one?', ru: 'Добрый вечер! Столик на одного?' },
      {
        reply: [
          { en: 'Yes, please. Can I sit by the window?', ru: 'Да, пожалуйста. Можно сесть у окна?', ok: true },
          {
            en: 'Yes, please. Can I to sit by the window?',
            ru: 'Да, пожалуйста. Можно мне сесть у окна?',
            why: 'После can частица to не нужна: Can I sit.',
            react: 'Sorry? Can you… to?',
          },
          {
            en: 'Yes, please. Can you sit by the window?',
            ru: 'Да, пожалуйста. Можете ли вы сесть у окна?',
            why: 'Can you — это вопрос к официанту. Просишь за себя — Can I.',
            react: "Me? I'm working, sir!",
          },
        ],
      },
      { npc: 'Of course. Table {t}, over there.', ru: 'Конечно. Столик {t}, вон там.' },
      {
        reply: [
          {
            en: 'Table {t}? Thank you.',
            ru: 'Столик {t}? Спасибо.',
            ok: true,
            distract: 't',
            why: 'Он сказал столик {t}.',
            react: 'No, table {t}!',
          },
        ],
      },
      { npc: 'Here is the menu. Are you OK with everything?', ru: 'Вот меню. Вам всё подходит?' },
      {
        reply: [
          { en: "No. I can't eat nuts.", ru: 'Нет. Мне нельзя орехи.', ok: true },
          {
            en: "No. I can't eating nuts.",
            ru: 'Нет. Мне нельзя есть орехи.',
            why: 'После can глагол без окончания: can’t eat.',
            react: 'Eating…? Sorry?',
          },
          {
            en: "Yes. I can't eat nuts.",
            ru: 'Да. Мне нельзя орехи.',
            why: 'Сказано «да, всё подходит», а потом — что орехи нельзя. Противоречие.',
            react: 'So… OK or not OK?',
          },
        ],
        accept: ['No. I cannot eat nuts.'],
      },
      { npc: 'Thanks for telling me! Do you like chicken?', ru: 'Спасибо, что сказали! Вы любите курицу?' },
      {
        reply: [
          { en: "Yes, I like chicken. I don't like fish.", ru: 'Да, я люблю курицу. Рыбу не люблю.', ok: true },
          {
            en: 'Yes, I like chicken. I no like fish.',
            ru: 'Да, я люблю курицу. Я не люблю рыбу.',
            why: 'Отрицание — don’t: I don’t like fish.',
            react: 'Sorry? You no…?',
          },
          {
            en: "Yes, I like chicken. I don't likes fish.",
            ru: 'Да, я люблю курицу. Я не любит рыбу.',
            why: 'После don’t глагол без s: I don’t like.',
            react: 'Likes? Hmm… no fish, OK.',
          },
        ],
      },
      { npc: 'Perfect! What would you like to drink? We have water, tea and juice.', ru: 'Отлично! Что будете пить? Есть вода, чай и сок.' },
      {
        reply: [
          { en: 'Water, please. Can I have ice too?', ru: 'Воду, пожалуйста. И можно лёд?', ok: true },
          {
            en: 'Water, please. Can I has ice too?',
            ru: 'Воду, пожалуйста. И можно лёд?',
            why: 'После can глагол без окончания: Can I have.',
            react: 'Sorry? Can you… has?',
          },
          {
            en: 'Water, please. Can you drink it?',
            ru: 'Воду, пожалуйста. Вы можете её выпить?',
            why: 'Просишь лёд, а спрашиваешь, может ли официант выпить воду. Нелепо.',
            react: "Me? Ha, I'm working!",
          },
        ],
      },
      { npc: 'Of course. Your chicken is coming. Can you wait five minutes?', ru: 'Конечно. Ваша курица скоро будет. Можете подождать пять минут?' },
      {
        reply: [
          { en: 'Yes, I can. No problem.', ru: 'Да, могу. Без проблем.', ok: true },
          {
            en: "Yes, I can't. No problem.",
            ru: 'Да, не могу. Без проблем.',
            why: 'Yes и can’t противоречат друг другу.',
            react: 'You can… or you can’t?',
          },
          {
            en: 'Yes, I am. No problem.',
            ru: 'Да, я есть. Без проблем.',
            why: 'На вопрос Can you…? краткий ответ — Yes, I can.',
            react: 'You are what? Ha ha. OK, thanks!',
          },
        ],
      },
    ],
    phrases: [
      ['Can I sit by the window?', 'Можно сесть у окна?'],
      ["I can't eat nuts.", 'Мне нельзя орехи.'],
      ["I don't like fish.", 'Я не люблю рыбу.'],
    ],
  },
  {
    id: 'gym-signup',
    unit: 'u16',
    title: 'Запись в спортзал',
    place: { en: 'GYM · STRATFORD', ru: 'Спортзал в Стратфорде' },
    npc: { name: 'Chloe', role: 'администратор спортзала' },
    goal: 'Запишись в спортзал и расскажи, что умеешь.',
    vars: { price: ['£20', '£25', '£30', '£35', '£40'] },
    steps: [
      { npc: 'Hi! Welcome to FitLife. Are you here to join?', ru: 'Привет! Добро пожаловать в FitLife. Вы пришли записаться?' },
      {
        reply: [
          { en: 'Yes, I am. I like sport.', ru: 'Да. Я люблю спорт.', ok: true },
          {
            en: 'Yes, I do. I like sport.',
            ru: 'Да, делаю. Я люблю спорт.',
            why: 'На вопрос с Are you… краткий ответ — Yes, I am.',
            react: 'Do what? Ha ha. Welcome!',
          },
          {
            en: "Yes, I am. I don't like sport.",
            ru: 'Да. Я не люблю спорт.',
            why: 'Пришёл в спортзал и говоришь, что спорт не любишь. Звучит странно.',
            react: 'Er… OK. So why are you here?',
          },
        ],
      },
      { npc: 'Great! Can you swim?', ru: 'Отлично! Вы умеете плавать?' },
      {
        reply: [
          { en: 'Yes, I can, but not well.', ru: 'Да, но не очень хорошо.', ok: true },
          {
            en: 'Yes, I can, but not good.',
            ru: 'Да, но не хороший.',
            why: 'Глагол описывает наречие well, а не good: swim well.',
            react: 'Not good? Ha, well, we can help.',
          },
          {
            en: "Yes, I can't, but not well.",
            ru: 'Да, не могу, но не очень хорошо.',
            why: 'Yes и can’t противоречат друг другу.',
            react: 'You can… or you can’t?',
          },
        ],
      },
      { npc: 'OK! The pool is open from seven to ten. The membership is {price} a month.', ru: 'Хорошо! Бассейн открыт с семи до десяти. Абонемент стоит {price} в месяц.' },
      {
        reply: [
          {
            en: '{price} a month? OK.',
            ru: '{price} в месяц? Хорошо.',
            ok: true,
            distract: 'price',
            why: 'Она сказала {price}.',
            react: 'No, {price} a month!',
          },
        ],
      },
      { npc: 'Can you run? Are you good at running?', ru: 'А бегать умеете? Вы хорошо бегаете?' },
      {
        reply: [
          { en: "No, I can't run fast.", ru: 'Нет, быстро бегать не умею.', ok: true },
          {
            en: "No, I can't to run fast.",
            ru: 'Нет, не могу быстро бегать.',
            why: 'После can частица to не нужна.',
            react: 'To…? Sorry?',
          },
          {
            en: "No, I don't can run fast.",
            ru: 'Нет, я не мочь бегать быстро.',
            why: 'Отрицание can — can’t, don’t с ним не используют.',
            react: 'Sorry? You don’t…?',
          },
        ],
        accept: ["No, I can't run."],
      },
      { npc: 'No problem. Our yoga coach is Anna. Everybody likes her. Would you like to meet her?', ru: 'Не проблема. Наш тренер по йоге — Анна. Её все любят. Хотите с ней познакомиться?' },
      {
        reply: [
          { en: 'Yes, please. Can you call her?', ru: 'Да, пожалуйста. Вы можете её позвать?', ok: true },
          {
            en: 'Yes, please. Can you call she?',
            ru: 'Да, пожалуйста. Вы можете позвать она?',
            why: 'После глагола ставят её / him, а не she: call her.',
            react: 'Call… she? Sorry?',
          },
          {
            en: 'Yes, please. Can you call him?',
            ru: 'Да, пожалуйста. Вы можете позвать его?',
            why: 'Анна — женщина, значит her.',
            react: 'Him? Anna is a woman!',
          },
        ],
      },
      { npc: "Sure. Please sign here. Here's your card.", ru: 'Конечно. Подпишите здесь. Вот ваша карта.' },
      {
        reply: [
          { en: 'Thank you. Can I come tomorrow?', ru: 'Спасибо. Можно прийти завтра?', ok: true },
          {
            en: 'Thank you. I can comes tomorrow.',
            ru: 'Спасибо. Я могу приходит завтра.',
            why: 'После can глагол без окончания: can come.',
            react: 'Sorry? Comes?',
          },
          {
            en: 'Thank you. Can I come yesterday?',
            ru: 'Спасибо. Можно прийти вчера?',
            why: 'Yesterday — вчера, туда уже не попасть. Нужно tomorrow.',
            react: 'Yesterday? Ha ha, no time machines here!',
          },
        ],
      },
    ],
    phrases: [
      ['Can you swim?', 'Вы умеете плавать?'],
      ["I can't run fast.", 'Я не умею быстро бегать.'],
    ],
  },
  {
    id: 'phone-call',
    unit: 'u16',
    title: 'Звонок в школу',
    place: { en: 'PHONE · BRIGHT ENGLISH SCHOOL', ru: 'Телефонный звонок в языковую школу' },
    npc: { name: 'Lucy', role: 'администратор школы по телефону' },
    goal: 'Позвони в школу и попроси передать сообщение мистеру Грину.',
    vars: { time: ['9:15', '10:30', '11:45', '2:30', '4:15'] },
    steps: [
      { npc: 'Hello, Bright English School. Lucy speaking.', ru: 'Алло, языковая школа Bright English. Люси у телефона.' },
      {
        reply: [
          { en: 'Hello, Lucy. Can I speak to Mr Green, please?', ru: 'Здравствуйте, Люси. Можно мистера Грина, пожалуйста?', ok: true },
          {
            en: 'Hello, Lucy. I can speak Mr Green, please?',
            ru: 'Здравствуйте, Люси. Я могу говорить мистер Грин, пожалуйста?',
            why: 'В вопросе can идёт перед I: Can I speak to…?',
            react: 'Sorry? Can you say that again?',
          },
          {
            en: 'Hello, Lucy. Can I speak to your cat, please?',
            ru: 'Здравствуйте, Люси. Можно вашу кошку, пожалуйста?',
            why: 'Ты звонишь в школу, чтобы поговорить с мистером Грином, а не с кошкой.',
            react: 'My cat? Ha ha! No, no cat here.',
          },
        ],
      },
      { npc: "Sorry, he's in a class. Can I take a message?", ru: 'Простите, у него занятие. Передать что-нибудь?' },
      {
        reply: [
          { en: 'Yes, please. Can you tell him I called?', ru: 'Да, пожалуйста. Передайте ему, что я звонил.', ok: true },
          {
            en: 'Yes, please. Can you tell he I called?',
            ru: 'Да, пожалуйста. Передайте он, что я звонил.',
            why: 'После глагола ставят him, а не he.',
            react: 'Tell… he? Sorry?',
          },
          {
            en: 'Yes, please. Can you tell her I called?',
            ru: 'Да, пожалуйста. Передайте ей, что я звонил.',
            why: 'Мистер Грин — мужчина, значит him.',
            react: 'Her? Mr Green is a man!',
          },
        ],
      },
      { npc: 'OK. He can call you at {time}. Is that OK?', ru: 'Хорошо. Он может перезвонить вам в {time}. Подойдёт?' },
      {
        reply: [
          {
            en: '{time} is fine, thanks.',
            ru: '{time} подходит, спасибо.',
            ok: true,
            distract: 'time',
            why: 'Она сказала {time}.',
            react: 'No, {time}!',
          },
        ],
      },
      { npc: 'Do you know Mr Green? He is our best teacher. Everybody likes him.', ru: 'Вы знаете мистера Грина? Он наш лучший учитель. Его все любят.' },
      {
        reply: [
          { en: 'Yes, I like him very much.', ru: 'Да, он мне очень нравится.', ok: true },
          {
            en: 'Yes, I like he very much.',
            ru: 'Да, он мне очень нравится (он).',
            why: 'После глагола ставят him, а не he.',
            react: 'Like he? Sorry?',
          },
          {
            en: 'Yes, I like it very much.',
            ru: 'Да, это мне очень нравится.',
            why: 'It — про вещи. О человеке говорят him или her.',
            react: 'It? Mr Green is not an “it”!',
          },
        ],
      },
      { npc: 'Great. Is there anything else?', ru: 'Отлично. Что-нибудь ещё?' },
      {
        reply: [
          { en: "No, that's all. I like your school!", ru: 'Нет, это всё. Мне нравится ваша школа!', ok: true },
          {
            en: "No, that's all. I like you school.",
            ru: 'Нет, это всё. Мне нравится ты школа.',
            why: 'Притяжательное — your, а не you: your school.',
            react: 'My… sorry, your school? Thank you!',
          },
          {
            en: "No, that's all. I don't like your school.",
            ru: 'Нет, это всё. Мне не нравится ваша школа.',
            why: 'Резко и грубо: ты звонишь в школу и ругаешь её.',
            react: 'Oh! OK… bye then.',
          },
        ],
      },
      { npc: 'Aw, thank you! Have a lovely day. Bye!', ru: 'Ой, спасибо! Хорошего дня. Пока!' },
      {
        reply: [
          { en: 'You too. Bye!', ru: 'И вам. Пока!', ok: true },
          {
            en: 'You too. Hello!',
            ru: 'И вам. Здравствуйте!',
            why: 'Разговор заканчивается: прощаются, а не здороваются.',
            react: 'Hello? We are saying goodbye!',
          },
          {
            en: 'Thank you. Can I speak to him?',
            ru: 'Спасибо. Можно мне с ним поговорить?',
            why: 'Она уже сказала, что он на занятии. Просить его снова бессмысленно.',
            react: 'To Mr Green? He is in a class! Remember?',
          },
        ],
      },
    ],
    phrases: [
      ['Can I speak to Mr Green, please?', 'Можно мистера Грина, пожалуйста?'],
      ['Can you tell him I called?', 'Передайте ему, что я звонил.'],
    ],
  },
];
