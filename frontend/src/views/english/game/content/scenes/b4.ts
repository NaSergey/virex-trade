import type { Scene } from './types';

/** Блок 4 (раздел 10): have got — утверждение и отрицание, единственное и множественное число. */
export const S4: Scene[] = [
  {
    id: 'pharmacy',
    unit: 'u10',
    title: 'В аптеке',
    place: { en: 'PHARMACY · ISLINGTON', ru: 'Аптека в Излингтоне' },
    npc: { name: 'Priya', role: 'фармацевт' },
    goal: 'Объясни, что болит, и купи таблетки.',
    vars: { price: ['£2', '£3.50', '£4', '£5', '£6.50'] },
    steps: [
      { npc: 'Good afternoon. Can I help you?', ru: 'Добрый день. Чем могу помочь?' },
      {
        reply: [
          { en: "Yes. I've got a headache.", ru: 'Да. У меня болит голова.', ok: true },
          {
            en: 'Yes. I has a headache.',
            ru: 'Да. У меня болит голова.',
            why: 'С I нужно have (’ve), а не has: I’ve got.',
            react: 'Sorry? You… has?',
          },
          {
            en: "Yes. I've got a dog.",
            ru: 'Да. У меня есть собака.',
            why: 'Это аптека: нужно сказать, что у тебя болит, а не про собаку.',
            react: 'A dog? This is a pharmacy!',
          },
        ],
        accept: ['Yes. I have a headache.', 'Yes. I have got a headache.'],
      },
      { npc: 'Oh dear. Have you got a temperature too?', ru: 'Ой. И температура есть?' },
      {
        reply: [
          { en: "No, I haven't got a temperature.", ru: 'Нет, температуры у меня нет.', ok: true },
          {
            en: 'No, I no got a temperature.',
            ru: 'Нет, я не иметь температуры.',
            why: 'Отрицание строится с haven’t: I haven’t got.',
            react: 'Sorry? Say that again, please.',
          },
          {
            en: "Yes, I haven't got a temperature.",
            ru: 'Да, у меня нет температуры.',
            why: 'Yes и haven’t противоречат друг другу. Либо Yes, I have, либо No, I haven’t.',
            react: 'So… yes or no?',
          },
        ],
        accept: ["No, I haven't.", "No, I haven't a temperature."],
      },
      { npc: "Good. Take two of these tablets. They're {price} a box.", ru: 'Хорошо. Принимайте по две таблетки. Они стоят {price} за коробку.' },
      {
        reply: [
          {
            en: '{price}? OK, thank you.',
            ru: '{price}? Хорошо, спасибо.',
            ok: true,
            distract: 'price',
            why: 'Она сказала {price}.',
            react: 'No, {price}!',
          },
        ],
      },
      { npc: 'Have you got any allergies?', ru: 'У вас есть аллергии?' },
      {
        reply: [
          { en: "No, I haven't got any allergies.", ru: 'Нет, никаких аллергий у меня нет.', ok: true },
          {
            en: "No, I haven't got some allergies.",
            ru: 'Нет, у меня нет каких-то аллергий.',
            why: 'В отрицании и вопросе вместо some ставят any.',
            react: 'Some? OK… so no allergies.',
          },
          {
            en: "No, I've got two sisters.",
            ru: 'Нет, у меня две сестры.',
            why: 'Спросили про аллергии, а не про сестёр.',
            react: 'Two sisters? I asked about allergies!',
          },
        ],
        accept: ["No, I haven't got any."],
      },
      { npc: 'Great. One tablet in the morning, one in the evening. Is that OK?', ru: 'Отлично. Одна таблетка утром, одна вечером. Понятно?' },
      {
        reply: [
          { en: "Yes, that's OK. Have you got a bag?", ru: 'Да, понятно. У вас есть пакет?', ok: true },
          {
            en: "Yes, that's OK. Have you a bag got?",
            ru: 'Да, понятно. У вас есть пакет?',
            why: 'Порядок слов: Have you got a bag? — got стоит перед предметом.',
            react: 'Sorry, got a what?',
          },
          {
            en: "Yes, that's OK. Have you got a banana?",
            ru: 'Да, понятно. У вас есть банан?',
            why: 'В аптеке банан не продают, а пакет для таблеток нужен.',
            react: 'A banana? This is a pharmacy, sir!',
          },
        ],
      },
      { npc: 'Yes, here is a bag. Get well soon!', ru: 'Да, вот пакет. Выздоравливайте!' },
      {
        reply: [
          { en: 'Thank you. Goodbye!', ru: 'Спасибо. До свидания!', ok: true },
          {
            en: 'Thank you. Have you got a headache?',
            ru: 'Спасибо. У вас болит голова?',
            why: 'Голова болит у тебя, а не у неё. И прощаться нужно.',
            react: 'Me? No, you have! Go home and rest.',
          },
          {
            en: "Thank you. I've got a headache.",
            ru: 'Спасибо. У меня болит голова.',
            why: 'Ты уже сказал это в начале. Сейчас пора прощаться.',
            react: 'Yes, I know! Take the tablets!',
          },
        ],
      },
    ],
    phrases: [
      ["I've got a headache.", 'У меня болит голова.'],
      ["I haven't got a temperature.", 'У меня нет температуры.'],
    ],
  },
  {
    id: 'new-neighbour',
    unit: 'u10',
    title: 'Новый сосед',
    place: { en: 'FLAT · HACKNEY', ru: 'Дом в Хакни' },
    npc: { name: 'Tom', role: 'сосед' },
    goal: 'Познакомься с соседом и расскажи про свою семью.',
    vars: { n: ['2', '3', '4', '5', '6'] },
    steps: [
      { npc: 'Hi! Are you the new neighbour?', ru: 'Привет! Ты наш новый сосед?' },
      {
        reply: [
          { en: "Yes, I am. I'm Sasha.", ru: 'Да. Я Саша.', ok: true },
          {
            en: "Yes, I'm. I'm Sasha.",
            ru: 'Да, я. Я Саша.',
            why: 'В кратком ответе am не сокращают: Yes, I am.',
            react: 'Sorry? Yes, you…?',
          },
          {
            en: "No, thanks. I'm Sasha.",
            ru: 'Нет, спасибо. Я Саша.',
            why: '«No, thanks» — отказ от предложения, а не ответ на вопрос.',
            react: 'Thanks for what? Ha ha!',
          },
        ],
      },
      { npc: "I'm Tom. Welcome, Sasha! I've got {n} cats, so you can hear them sometimes.", ru: 'Я Том. Добро пожаловать, Саша! У меня {n} кошек, так что иногда ты их слышишь.' },
      {
        reply: [
          {
            en: '{n} cats? Wow!',
            ru: '{n} кошек? Ого!',
            ok: true,
            distract: 'n',
            why: 'Он сказал {n}.',
            react: 'No, {n} cats!',
          },
        ],
      },
      { npc: 'Yes! Have you got any pets?', ru: 'Да! А у тебя есть домашние животные?' },
      {
        reply: [
          { en: "No, I haven't. But I've got a plant!", ru: 'Нет. Зато у меня есть растение!', ok: true },
          {
            en: "No, I haven't. But I've got a plants!",
            ru: 'Нет. Зато у меня есть растения!',
            why: 'После a — один предмет: a plant. Для нескольких — plants без a.',
            react: 'A plants? Ha ha, OK!',
          },
          {
            en: "Yes, I haven't. But I've got a plant!",
            ru: 'Да, нет. Зато у меня есть растение!',
            why: 'Yes и haven’t противоречат друг другу: «нет» — это No, I haven’t.',
            react: 'Yes… no? Which one?',
          },
        ],
      },
      { npc: 'A plant is nice! Have you got any brothers or sisters?', ru: 'Растение — это мило! А братья или сёстры у тебя есть?' },
      {
        reply: [
          { en: "Yes, I've got one sister.", ru: 'Да, у меня одна сестра.', ok: true },
          {
            en: 'Yes, I has got one sister.',
            ru: 'Да, у меня одна сестра.',
            why: 'С I нужно have (’ve), а не has.',
            react: 'Sorry? You has?',
          },
          {
            en: "Yes, I'm one sister.",
            ru: 'Да, я одна сестра.',
            why: 'I’m значит «я есть». Родственников «имеют»: I’ve got.',
            react: "You're a sister? Ha ha, I'm sorry!",
          },
        ],
        accept: ['Yes, I have one sister.', 'Yes, I have got one sister.'],
      },
      { npc: 'Nice! Has she got any children?', ru: 'Здорово! А у неё есть дети?' },
      {
        reply: [
          { en: "Yes, she's got two children.", ru: 'Да, у неё двое детей.', ok: true },
          {
            en: 'Yes, she have got two children.',
            ru: 'Да, у неё двое детей.',
            why: 'С she нужно has (’s): she’s got.',
            react: 'Sorry? She… have?',
          },
          {
            en: "Yes, he's got two children.",
            ru: 'Да, у него двое детей.',
            why: 'Речь о сестре, значит she, а не he.',
            react: 'He? Your sister is a he?',
          },
        ],
        accept: ['Yes, she has two children.', 'Yes, she has got two children.'],
      },
      { npc: 'Lovely! Tea in my flat, number 4, one day soon. Bye, Sasha!', ru: 'Здорово! Как-нибудь на днях чай у меня, квартира 4. Пока, Саша!' },
      {
        reply: [
          { en: 'Thanks, Tom. See you soon!', ru: 'Спасибо, Том. До скорого!', ok: true },
          {
            en: 'Thanks, Tom. See you yesterday!',
            ru: 'Спасибо, Том. До встречи вчера!',
            why: 'Yesterday — вчера, а увидеться можно только в будущем.',
            react: 'Yesterday? Ha! Tomorrow, you mean?',
          },
          {
            en: 'Thanks, Tom. You has a nice flat.',
            ru: 'Спасибо, Том. У тебя красивая квартира.',
            why: 'С you нужно have: You have a nice flat.',
            react: 'Sorry? Say it again.',
          },
        ],
      },
    ],
    phrases: [
      ['Have you got any pets?', 'У тебя есть домашние животные?'],
      ["I've got one sister.", 'У меня одна сестра.'],
    ],
  },
  {
    id: 'airport-bags',
    unit: 'u10',
    title: 'Багаж в аэропорту',
    place: { en: 'AIRPORT · HEATHROW', ru: 'Аэропорт Хитроу' },
    npc: { name: 'Karen', role: 'сотрудница регистрации' },
    goal: 'Пройди регистрацию и сдай багаж.',
    vars: { kg: ['12', '15', '18', '20', '23'] },
    steps: [
      { npc: 'Hello. Can I see your passport, please?', ru: 'Здравствуйте. Покажите паспорт, пожалуйста.' },
      {
        reply: [
          { en: "Here you are. I've got a Russian passport.", ru: 'Вот. У меня российский паспорт.', ok: true },
          {
            en: 'Here you are. I has a Russian passport.',
            ru: 'Вот. У меня российский паспорт.',
            why: 'С I нужно have (’ve), а не has.',
            react: 'Sorry? Say that again, please.',
          },
          {
            en: "Here you are. It's a nice day.",
            ru: 'Вот. Сегодня хороший день.',
            why: 'Это не про паспорт. Достаточно отдать его и сказать, какой он.',
            react: "Yes, it is! But what's this? A passport, thank you.",
          },
        ],
        accept: ['Here you are. I have a Russian passport.'],
      },
      { npc: 'Thanks. How many bags have you got?', ru: 'Спасибо. Сколько у вас сумок?' },
      {
        reply: [
          { en: "I've got two bags.", ru: 'У меня две сумки.', ok: true },
          {
            en: "I've got two bag.",
            ru: 'У меня две сумка.',
            why: 'После two — множественное число: two bags.',
            react: 'Two… bags? OK!',
          },
          {
            en: "I'm two bags.",
            ru: 'Я две сумки.',
            why: 'I’m значит «я есть». Предметы «имеют»: I’ve got.',
            react: "You're two bags? Ha ha!",
          },
        ],
        accept: ['I have two bags.', 'I have got two bags.'],
      },
      { npc: 'OK, put the big bag here. It is {kg} kilos.', ru: 'Хорошо, поставьте большую сумку сюда. Она весит {kg} кило.' },
      {
        reply: [
          {
            en: '{kg} kilos? OK.',
            ru: '{kg} кило? Хорошо.',
            ok: true,
            distract: 'kg',
            why: 'Она сказала {kg}.',
            react: 'No, {kg} kilos!',
          },
        ],
      },
      { npc: "That's fine. Have you got any knives or batteries in your bag?", ru: 'Хорошо. В сумке есть ножи или батарейки?' },
      {
        reply: [
          { en: "No, I haven't got any.", ru: 'Нет, никаких нет.', ok: true },
          {
            en: "No, I haven't got some.",
            ru: 'Нет, каких-то нет.',
            why: 'В отрицании и вопросе вместо some ставят any.',
            react: 'Some? OK… so none.',
          },
          {
            en: "Yes, I've got two knives.",
            ru: 'Да, у меня два ножа.',
            why: 'Это шутка, которой в аэропорту делать нельзя.',
            react: 'Two knives?! Security!',
          },
        ],
        accept: ["No, I haven't."],
      },
      { npc: 'Good. And your small bag? Have you got a laptop in it?', ru: 'Хорошо. А в маленькой сумке? Там ноутбук?' },
      {
        reply: [
          { en: "Yes, I've got a laptop and a book.", ru: 'Да, у меня ноутбук и книга.', ok: true },
          {
            en: "Yes, I've got a laptop and a books.",
            ru: 'Да, у меня ноутбук и книги.',
            why: 'После a — одна вещь: a book. Для нескольких — books без a.',
            react: 'A books? One book, right?',
          },
          {
            en: "Yes, I've got a laptop and an elephant.",
            ru: 'Да, у меня ноутбук и слон.',
            why: 'Слона в сумку не положить. Ответ нелепый.',
            react: 'An elephant? Ha ha, very funny!',
          },
        ],
      },
      { npc: 'Perfect! Here is your boarding pass. Have a nice flight!', ru: 'Отлично! Вот ваш посадочный. Приятного полёта!' },
      {
        reply: [
          { en: 'Thanks! Is my seat near the window?', ru: 'Спасибо! Моё место у окна?', ok: true },
          {
            en: 'Thanks! Are my seat near the window?',
            ru: 'Спасибо! Моё место у окна?',
            why: 'Seat — одно место, поэтому is: Is my seat…?',
            react: 'Sorry? Are… what?',
          },
          {
            en: 'Thanks! Is my seat on the roof?',
            ru: 'Спасибо! Моё место на крыше?',
            why: 'Пассажиры сидят внутри самолёта, а не на крыше.',
            react: 'On the roof? No, no, inside the plane!',
          },
        ],
      },
    ],
    phrases: [
      ["I've got two bags.", 'У меня две сумки.'],
      ["I haven't got any.", 'У меня ничего нет.'],
    ],
  },
];
