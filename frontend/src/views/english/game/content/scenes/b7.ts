import type { Scene } from './types';

/** Блок 7 (раздел 19): Present Simple — I / you / we / they и he / she / it, время, who / what / where. */
export const S7: Scene[] = [
  {
    id: 'job-interview',
    unit: 'u19',
    title: 'Собеседование на подработку',
    place: { en: 'CAFÉ · PECKHAM', ru: 'Кафе в Пекэме' },
    npc: { name: 'Helen', role: 'управляющая кафе' },
    goal: 'Пройди собеседование на подработку в кафе.',
    vars: { time: ['8:00', '8:30', '9:00', '9:30', '10:00'] },
    steps: [
      { npc: 'Hello, Sasha. Please sit down. Where do you live?', ru: 'Здравствуйте, Саша. Садитесь. Где вы живёте?' },
      {
        reply: [
          { en: 'I live in Hackney, with my friend.', ru: 'Я живу в Хакни, с другом.', ok: true },
          {
            en: 'I lives in Hackney, with my friend.',
            ru: 'Я живёт в Хакни, с другом.',
            why: 'С I глагол без s: I live. Окончание -s только у he / she / it.',
            react: 'Sorry? Lives?',
          },
          {
            en: "I'm from Russia, with my friend.",
            ru: 'Я из России, с другом.',
            why: 'Спросили, где живёшь сейчас, а не откуда ты приехал.',
            react: 'Russia, yes. But where do you live now?',
          },
        ],
      },
      { npc: 'Good. What do you do now?', ru: 'Хорошо. Чем вы сейчас занимаетесь?' },
      {
        reply: [
          { en: 'I study English and I work online.', ru: 'Я учу английский и работаю онлайн.', ok: true },
          {
            en: 'I studies English and I work online.',
            ru: 'Я учит английский и работаю онлайн.',
            why: 'С I глагол без s: I study. Окончание -s только у he / she / it.',
            react: 'Sorry? Studies?',
          },
          {
            en: 'I sleep and eat.',
            ru: 'Я сплю и ем.',
            why: 'На собеседовании так о себе не говорят: это не занятие и не работа.',
            react: 'Sleep and eat? Hmm… sounds nice, but is that a job?',
          },
        ],
        accept: ['I study English and I work online.'],
      },
      { npc: 'Great. The job starts at {time}. Is that OK?', ru: 'Отлично. Смена начинается в {time}. Вас это устроит?' },
      {
        reply: [
          {
            en: "{time}? Yes, that's fine.",
            ru: '{time}? Да, подойдёт.',
            ok: true,
            distract: 'time',
            why: 'Она сказала {time}.',
            react: 'No, {time}!',
          },
        ],
      },
      { npc: 'And what time do you get up?', ru: 'А во сколько вы встаёте?' },
      {
        reply: [
          { en: 'I get up at seven every day.', ru: 'Я встаю в семь каждый день.', ok: true },
          {
            en: 'I gets up at seven every day.',
            ru: 'Я встаёт в семь каждый день.',
            why: 'С I глагол без s: I get up.',
            react: 'Sorry? Gets?',
          },
          {
            en: 'I get up at the kitchen.',
            ru: 'Я встаю на кухне.',
            why: 'Спросили, во сколько. Время называют с at: at seven.',
            react: 'At the kitchen? Ha! At what time?',
          },
        ],
      },
      { npc: 'Good. My brother works here too. He makes the coffee. Do you have family here?', ru: 'Хорошо. Мой брат тоже здесь работает. Он готовит кофе. А у вас здесь есть семья?' },
      {
        reply: [
          { en: 'My sister works in a café too.', ru: 'Моя сестра тоже работает в кафе.', ok: true },
          {
            en: 'My sister work in a café too.',
            ru: 'Моя сестра работать в кафе тоже.',
            why: 'С she глагол с -s: she works.',
            react: 'Sorry? Your sister work?',
          },
          {
            en: 'My sister sleeps in a café too.',
            ru: 'Моя сестра тоже спит в кафе.',
            why: 'Ты хочешь произвести хорошее впечатление, а получилась шутка про сон на работе.',
            react: 'Sleeps? In a café? Ha ha!',
          },
        ],
        accept: ['My sister works in a cafe too.'],
      },
      { npc: 'Lovely. You can start on Monday. Welcome to the team!', ru: 'Здорово. Можете выходить в понедельник. Добро пожаловать в команду!' },
      {
        reply: [
          { en: 'Thank you very much! See you on Monday.', ru: 'Большое спасибо! До встречи в понедельник.', ok: true },
          {
            en: 'Thank you very much! See you in Monday.',
            ru: 'Большое спасибо! До встречи в понедельник.',
            why: 'С днём недели ставится on: on Monday.',
            react: 'On Monday, yes!',
          },
          {
            en: "Thank you very much! I don't work here.",
            ru: 'Большое спасибо! Я здесь не работаю.',
            why: 'Тебя только что взяли на работу. Ответ противоречит ситуации.',
            react: "You don't work here? Ha, but you can on Monday!",
          },
        ],
      },
    ],
    phrases: [
      ['I live in Hackney.', 'Я живу в Хакни.'],
      ['I get up at seven every day.', 'Я встаю в семь каждый день.'],
    ],
  },
  {
    id: 'train-times',
    unit: 'u19',
    title: 'Расписание поездов',
    place: { en: 'STATION · EUSTON', ru: 'Вокзал Юстон' },
    npc: { name: 'Fred', role: 'сотрудник справочной' },
    goal: 'Узнай, когда отходит поезд в Манчестер и откуда.',
    vars: { time: ['10:45', '11:00', '11:15', '11:30', '11:45'] },
    steps: [
      { npc: 'Good morning. Where do you want to go?', ru: 'Доброе утро. Куда вы хотите поехать?' },
      {
        reply: [
          { en: 'I want to go to Manchester.', ru: 'Я хочу поехать в Манчестер.', ok: true },
          {
            en: 'I wants to go to Manchester.',
            ru: 'Я хочет поехать в Манчестер.',
            why: 'С I глагол без s: I want.',
            react: 'Sorry? Wants?',
          },
          {
            en: 'I want to go to the moon.',
            ru: 'Я хочу полететь на Луну.',
            why: 'Это шутка, а ты стоишь на вокзале и едешь в Манчестер.',
            react: 'The moon? Ha! Not from Euston!',
          },
        ],
      },
      { npc: 'The next train leaves at {time}.', ru: 'Ближайший поезд отправляется в {time}.' },
      {
        reply: [
          {
            en: '{time}? OK, thank you.',
            ru: '{time}? Хорошо, спасибо.',
            ok: true,
            distract: 'time',
            why: 'Он сказал {time}.',
            react: 'No, {time}!',
          },
        ],
      },
      { npc: 'It arrives in Manchester at half past one.', ru: 'В Манчестер он прибывает в половине второго.' },
      {
        reply: [
          { en: 'It arrives at half past one. Great!', ru: 'Он прибывает в половине второго. Здорово!', ok: true },
          {
            en: 'It arrive at half past one. Great!',
            ru: 'Он прибывать в половине второго. Здорово!',
            why: 'С it глагол с -s: it arrives.',
            react: 'Sorry? It… arrive?',
          },
          {
            en: 'It arrives at half past two. Great!',
            ru: 'Он прибывает в половине третьего. Здорово!',
            why: 'Он сказал half past one (в половине второго), а не two.',
            react: 'Two? No, half past one!',
          },
        ],
      },
      { npc: 'There is a café on the train. It opens at ten.', ru: 'В поезде есть кафе. Оно открывается в десять.' },
      {
        reply: [
          { en: 'Good. I like coffee in the morning.', ru: 'Хорошо. Я люблю кофе по утрам.', ok: true },
          {
            en: 'Good. I likes coffee in the morning.',
            ru: 'Хорошо. Я любит кофе по утрам.',
            why: 'С I глагол без s: I like.',
            react: 'Sorry? Likes?',
          },
          {
            en: 'Good. I like coffee at the morning.',
            ru: 'Хорошо. Я люблю кофе на утро.',
            why: 'По утрам — in the morning, а не at the morning.',
            react: 'At the morning? Hmm… in the morning!',
          },
        ],
      },
      { npc: 'Your train leaves from platform five. Do you know where it is?', ru: 'Ваш поезд отправляется с пятой платформы. Вы знаете, где она?' },
      {
        reply: [
          { en: 'Sorry, where is platform five?', ru: 'Простите, где пятая платформа?', ok: true },
          {
            en: 'Sorry, where platform five is?',
            ru: 'Простите, где платформа пятая есть?',
            why: 'В вопросе is идёт перед подлежащим: where is platform five.',
            react: 'Sorry? Where platform…?',
          },
          {
            en: 'Sorry, who is platform five?',
            ru: 'Простите, кто такая пятая платформа?',
            why: 'Who — про людей. О месте спрашивают where.',
            react: 'Who? Platform five is a place, not a person!',
          },
        ],
      },
      { npc: "It's over there, on the left. Hurry, you have ten minutes!", ru: 'Вон там, слева. Поторопитесь, у вас десять минут!' },
      {
        reply: [
          { en: 'Thank you very much for your help!', ru: 'Большое спасибо за помощь!', ok: true },
          {
            en: 'Thank you very much for you help!',
            ru: 'Большое спасибо за ты помощь!',
            why: 'Притяжательное — your: your help.',
            react: 'You help? Ha, my help, yes!',
          },
          {
            en: "Thank you very much, I don't know.",
            ru: 'Большое спасибо, я не знаю.',
            why: 'Он только что всё объяснил. Фраза не к месту.',
            react: "You don't know? I just told you!",
          },
        ],
      },
    ],
    phrases: [
      ['Where is platform five?', 'Где пятая платформа?'],
      ['The train leaves at ten.', 'Поезд отправляется в десять.'],
    ],
  },
  {
    id: 'city-tour',
    unit: 'u19',
    title: 'Экскурсия по городу',
    place: { en: 'TOUR · TOWER BRIDGE', ru: 'Экскурсия у Тауэрского моста' },
    npc: { name: 'Nick', role: 'гид' },
    goal: 'Послушай гида и расспроси его о достопримечательностях.',
    vars: { n: ['5', '6', '7', '9', '12'] },
    steps: [
      { npc: "Welcome to the city tour! I'm Nick. Where do you come from?", ru: 'Добро пожаловать на экскурсию! Я Ник. Откуда вы?' },
      {
        reply: [
          { en: 'I come from Russia.', ru: 'Я из России.', ok: true },
          {
            en: 'I comes from Russia.',
            ru: 'Я приходит из России.',
            why: 'С I глагол без s: I come.',
            react: 'Sorry? Comes?',
          },
          {
            en: 'I come to Russia.',
            ru: 'Я приезжаю в Россию.',
            why: 'Откуда — from, а не to. Получилось «я еду в Россию».',
            react: 'To Russia? But you are here!',
          },
        ],
        accept: ["I'm from Russia."],
      },
      { npc: 'Great! Look at that old castle. It is the Tower of London.', ru: 'Отлично! Посмотрите на тот старый замок. Это Тауэр.' },
      {
        reply: [
          { en: 'Who lives in that castle?', ru: 'Кто живёт в том замке?', ok: true },
          {
            en: 'Who live in that castle?',
            ru: 'Кто живут в том замке?',
            why: 'После who глагол как с he / she: who lives.',
            react: 'Sorry? Who… live?',
          },
          {
            en: 'Where lives in that castle?',
            ru: 'Где живёт в том замке?',
            why: 'Where спрашивает про место, а тебе нужно «кто»: who.',
            react: 'Where lives…? Sorry, who lives?',
          },
        ],
      },
      { npc: 'Ravens live there! There are {n} of them.', ru: 'Там живут вороны! Их {n}.' },
      {
        reply: [
          {
            en: '{n} ravens? Wow!',
            ru: '{n} воронов? Ого!',
            ok: true,
            distract: 'n',
            why: 'Он сказал {n}.',
            react: 'No, {n} ravens!',
          },
        ],
      },
      { npc: 'Do you like boats? Many people take the boat to Greenwich.', ru: 'Вы любите лодки? Многие плывут на катере до Гринвича.' },
      {
        reply: [
          { en: 'Yes, I like boats. My friends like them too.', ru: 'Да, я люблю лодки. Мои друзья тоже.', ok: true },
          {
            en: 'Yes, I like boats. My friends likes them too.',
            ru: 'Да, я люблю лодки. Мои друзья любит их тоже.',
            why: 'С they / friends глагол без s: friends like.',
            react: 'Likes? Hmm… OK!',
          },
          {
            en: 'Yes, I like boats. My friends like they too.',
            ru: 'Да, я люблю лодки. Мои друзья любят они тоже.',
            why: 'После глагола ставят them, а не they.',
            react: 'Like they? Sorry?',
          },
        ],
      },
      { npc: 'Good! Now, do you know that big wheel? It is the London Eye. It goes slowly.', ru: 'Отлично! А вы знаете то большое колесо? Это Лондонский глаз. Оно движется медленно.' },
      {
        reply: [
          { en: 'It goes slowly? I like that.', ru: 'Оно движется медленно? Мне нравится.', ok: true },
          {
            en: 'It go slowly? I like that.',
            ru: 'Оно ехать медленно? Мне нравится.',
            why: 'С it глагол с -s или es: it goes.',
            react: 'Sorry? It go?',
          },
          {
            en: 'It goes slowly? I eat that.',
            ru: 'Оно движется медленно? Я ем это.',
            why: 'Колесо не едят. Хотел сказать I like that.',
            react: 'You eat the London Eye? Ha ha!',
          },
        ],
      },
      { npc: 'Thank you for coming, Sasha! Tell your friends. Bye!', ru: 'Спасибо, что пришли, Саша! Расскажите друзьям. Пока!' },
      {
        reply: [
          { en: "Thank you, Nick. It's a great tour!", ru: 'Спасибо, Ник. Отличная экскурсия!', ok: true },
          {
            en: 'Thank you, Nick. It a great tour!',
            ru: 'Спасибо, Ник. Это отличная экскурсия!',
            why: 'Пропущено is: It’s a great tour.',
            react: 'Sorry? It… a great tour?',
          },
          {
            en: "Thank you, Sasha. It's a great tour!",
            ru: 'Спасибо, Саша. Отличная экскурсия!',
            why: 'Саша — это ты, а гида зовут Ник.',
            react: "Thank you, Sasha? I'm Nick!",
          },
        ],
      },
    ],
    phrases: [
      ['Where do you come from?', 'Откуда вы?'],
      ['Who lives in that castle?', 'Кто живёт в том замке?'],
    ],
  },
];
