import type { ContentBlock, Exercise, Word } from '../types';

/**
 * Блок 7 книги: Unit 19 (Present Simple: I, you, we, they), Unit 20 (he, she, it, время),
 * Unit 21 (who, what, where), Revision 7. Слова — из словаря SB стр. 94.
 */

type Item = Exercise extends infer E ? (E extends unknown ? Omit<E, 'id' | 'unit'> : never) : never;

const w = (unit: string, en: string, ru: string, example?: [string, string]): Word =>
  example ? { en, ru, unit, example } : { en, ru, unit };

const ex = (unit: string, items: Item[]): Exercise[] =>
  items.map((e, i) => ({ ...e, id: `${unit}-${String(i + 1).padStart(2, '0')}`, unit }) as Exercise);

const words: Word[] = [
  // Unit 19
  w('u19', 'also', 'также, тоже', ['I like tennis. I also like basketball.', 'Я люблю теннис. Ещё я люблю баскетбол.']),
  w('u19', 'basketball', 'баскетбол', ['We play basketball on Wednesdays.', 'Мы играем в баскетбол по средам.']),
  w('u19', 'bike', 'велосипед', ['I ride my bike in the park.', 'Я катаюсь на велосипеде в парке.']),
  w('u19', 'cinema', 'кинотеатр; кино', ['We go to the cinema on Saturdays.', 'Мы ходим в кино по субботам.']),
  w('u19', 'do', 'делать', ['I do my homework on Sundays.', 'Я делаю домашнее задание по воскресеньям.']),
  w('u19', 'every', 'каждый', ['Every Friday we play football.', 'Каждую пятницу мы играем в футбол.']),
  w('u19', 'Friday', 'пятница', ['On Fridays I go to the swimming pool.', 'По пятницам я хожу в бассейн.']),
  w('u19', 'football', 'футбол', ['They play football in the park.', 'Они играют в футбол в парке.']),
  w('u19', 'goalie', 'вратарь', ['My friend is a good goalie.', 'Мой друг — хороший вратарь.']),
  w('u19', 'have', 'иметь, у кого-то есть', ['We have a swimming lesson on Thursdays.', 'У нас по четвергам урок плавания.']),
  w('u19', 'homework', 'домашнее задание', ['I do my homework on Mondays.', 'Я делаю домашнее задание по понедельникам.']),
  w('u19', 'lesson', 'урок', ['We have a lesson on Tuesdays.', 'У нас урок по вторникам.']),
  w('u19', 'like', 'любить, нравиться', ['I like tennis.', 'Я люблю теннис.']),
  w('u19', 'magazine', 'журнал', ['I read a magazine on Sundays.', 'По воскресеньям я читаю журнал.']),
  w('u19', 'Monday', 'понедельник', ['On Mondays we have a sports lesson.', 'По понедельникам у нас урок спорта.']),
  w('u19', 'on Mondays/Tuesdays', 'по понедельникам / по вторникам', ['On Tuesdays I play table tennis.', 'По вторникам я играю в настольный теннис.']),
  w('u19', 'or', 'или', ['Do you like tennis or volleyball?', 'Ты любишь теннис или волейбол?']),
  w('u19', 'question', 'вопрос', ['I have a question.', 'У меня есть вопрос.']),
  w('u19', 'ride a bike', 'ездить на велосипеде', ['We ride our bikes in the park every Sunday.', 'Каждое воскресенье мы катаемся на велосипедах в парке.']),
  w('u19', 'roller blade', 'кататься на роликах', ['I roller blade in the park on Saturdays.', 'По субботам я катаюсь на роликах в парке.']),
  w('u19', 'Saturday', 'суббота', ['On Saturdays I go to the cinema.', 'По субботам я хожу в кино.']),
  w('u19', 'some', 'несколько, какие-то', ['I have some friends in town.', 'У меня есть несколько друзей в городе.']),
  w('u19', 'sports lesson', 'урок физкультуры, занятие спортом', ['We have a sports lesson on Wednesdays.', 'По средам у нас урок физкультуры.']),
  w('u19', 'Sunday', 'воскресенье', ['Every Sunday we visit our grandma.', 'Каждое воскресенье мы навещаем нашу бабушку.']),
  w('u19', 'swim', 'плавать', ['I swim in the swimming pool.', 'Я плаваю в бассейне.']),
  w('u19', 'swimming lesson', 'урок плавания', ['I have a swimming lesson on Tuesdays.', 'У меня по вторникам урок плавания.']),
  w('u19', 'swimming pool', 'бассейн', ['We go to the swimming pool on Fridays.', 'По пятницам мы ходим в бассейн.']),
  w('u19', 'table tennis', 'настольный теннис', ['I play table tennis with my brother.', 'Я играю в настольный теннис с братом.']),
  w('u19', 'tennis', 'теннис', ['You play tennis very well.', 'Ты очень хорошо играешь в теннис.']),
  w('u19', 'Thursday', 'четверг', ['On Thursdays we play volleyball.', 'По четвергам мы играем в волейбол.']),
  w('u19', 'town', 'город', ['The cinema is in town.', 'Кинотеатр находится в городе.']),
  w('u19', 'Tuesday', 'вторник', ['On Tuesdays I do my homework.', 'По вторникам я делаю домашнее задание.']),
  w('u19', 'visit', 'навещать, посещать', ['We visit our grandad on Sundays.', 'По воскресеньям мы навещаем нашего дедушку.']),
  w('u19', 'volleyball', 'волейбол', ['They play volleyball in the park.', 'Они играют в волейбол в парке.']),
  w('u19', 'Wednesday', 'среда', ['On Wednesdays we have a swimming lesson.', 'По средам у нас урок плавания.']),

  // Unit 20
  w('u20', 'again', 'снова, опять', ['The dog is dirty again.', 'Собака снова грязная.']),
  w('u20', "at ten o'clock", 'в десять часов', ["The dog eats at ten o'clock.", 'Собака ест в десять часов.']),
  w('u20', 'bird', 'птица', ['The bird is in the garden.', 'Птица в саду.']),
  w('u20', 'bowl', 'миска; чаша', ['The cat has a bowl of water.', 'У кошки есть миска с водой.']),
  w('u20', 'breakfast', 'завтрак', ["She has breakfast at eight o'clock.", 'Она завтракает в восемь часов.']),
  w('u20', 'brush', 'чистить щёткой; расчёсывать', ['He brushes his hair every day.', 'Он каждый день расчёсывает волосы.']),
  w('u20', 'dirty', 'грязный', ['My dog is dirty.', 'Моя собака грязная.']),
  w('u20', 'drink', 'пить', ['The cat drinks milk.', 'Кошка пьёт молоко.']),
  w('u20', 'every day', 'каждый день', ['She washes her dog every day.', 'Она каждый день моет свою собаку.']),
  w('u20', 'garden', 'сад', ['The dog plays in the garden.', 'Собака играет в саду.']),
  w('u20', 'get up', 'вставать', ["He gets up at seven o'clock.", 'Он встаёт в семь часов.']),
  w('u20', 'greedy', 'жадный; прожорливый', ['Ted is a greedy dog.', 'Тед — прожорливый пёс.']),
  w('u20', 'half past ...', 'половина (такого-то часа): half past ten — 10:30', ["It's half past ten.", 'Сейчас половина одиннадцатого (10:30).']),
  w('u20', "It's one o'clock.", 'Сейчас час (1:00).', ["It's one o'clock. It's lunch time!", 'Сейчас час дня. Время обеда!']),
  w('u20', 'lazy', 'ленивый', ['My cat is lazy.', 'Моя кошка ленивая.']),
  w('u20', 'love', 'любить; обожать', ['She loves birds.', 'Она обожает птиц.']),
  w('u20', 'lunch', 'обед (в середине дня)', ["We have lunch at one o'clock.", 'Мы обедаем в час дня.']),
  w('u20', 'lunch time', 'время обеда', ['It is lunch time! The children eat.', 'Время обеда! Дети едят.']),
  w('u20', "o'clock", 'час (ровно): seven o\'clock — 7:00', ["It's seven o'clock.", 'Сейчас семь часов.']),
  w('u20', 'poor', 'бедный', ['The poor cat is cold.', 'Бедной кошке холодно.']),
  w('u20', 'wash', 'мыть; умываться', ['He washes his dog.', 'Он моет свою собаку.']),
  w('u20', 'watch', 'смотреть; наблюдать', ['She watches birds in the park.', 'Она наблюдает за птицами в парке.']),
  w('u20', 'water', 'вода', ['The dog drinks water.', 'Собака пьёт воду.']),
  w('u20', 'What time is it?', 'Который час?', ["— What time is it? — It's two o'clock.", '— Который час? — Два часа.']),
  w('u20', 'wonderful', 'замечательный, чудесный', ['My grandma is wonderful.', 'Моя бабушка замечательная.']),

  // Unit 21
  w('u21', 'brave', 'храбрый', ['Jed is a brave boy.', 'Джед — храбрый мальчик.']),
  w('u21', 'bright', 'яркий', ['The sun is very bright today.', 'Сегодня солнце очень яркое.']),
  w('u21', 'leave', 'покидать, уходить; оставлять', ['Leave the room, please!', 'Выйдите из комнаты, пожалуйста!']),
  w('u21', "Let's be friends!", 'Давайте дружить!', ["Let's be friends!", 'Давайте дружить!']),
  w('u21', 'light', 'свет', ['I see a light in the sky.', 'Я вижу свет в небе.']),
  w('u21', 'move', 'двигаться; двигать', ['The robot can move.', 'Робот умеет двигаться.']),
  w('u21', 'robot', 'робот', ['The robot is behind the door.', 'Робот стоит за дверью.']),
  w('u21', 'Turn your head!', 'Поверни голову!', ['Turn your head! Look at the robot!', 'Поверни голову! Посмотри на робота!']),
];

export const B7: ContentBlock = {
  words,
  lessons: [
    {
      unit: 'u19',
      blocks: [
        {
          type: 'p',
          text: 'В английском есть время *Present Simple* (простое настоящее). Оно рассказывает о том, что человек делает регулярно: каждый день, каждую неделю, по определённым дням. По-русски мы говорим так же: «я играю», «мы ходим», — поэтому тема лёгкая.',
        },
        {
          type: 'p',
          text: 'В этом юните — формы для *I, you, we, they*. Глагол остаётся таким, как в словаре, и ничего к нему не добавляется: *I play, you play, we play, they play*. Для дней недели нужен предлог *on*: *on Mondays* — «по понедельникам» (на конце -s, потому что понедельник повторяется много раз), *every Sunday* — «каждое воскресенье». Названия дней пишутся с большой буквы.',
        },
        {
          type: 'p',
          text: 'Сочетания лучше учить целиком: *play football* («играть в футбол», без предлога), *go to the cinema* («ходить в кино»), *ride a bike* («ездить на велосипеде»), *do homework* («делать уроки»), *have a swimming lesson* («заниматься плаванием, у нас урок плавания»).',
        },
        {
          type: 'rule',
          title: 'Present Simple: I / you / we / they',
          rows: [
            ['I play', 'I play tennis on Fridays.', 'Я играю в теннис по пятницам.'],
            ['you play', 'You play volleyball on Tuesdays.', 'Ты играешь в волейбол по вторникам.'],
            ['we play', 'We play basketball on Wednesdays.', 'Мы играем в баскетбол по средам.'],
            ['they play', 'They play football every Sunday.', 'Они играют в футбол каждое воскресенье.'],
          ],
        },
        {
          type: 'rule',
          title: 'Когда это бывает и с какими глаголами',
          rows: [
            ['on + день (мн. ч.)', 'On Mondays we have a sports lesson.', 'По понедельникам у нас урок физкультуры.'],
            ['every + день', 'Every Saturday I ride my bike.', 'Каждую субботу я катаюсь на велосипеде.'],
            ['go to + место', 'We go to the cinema on Sundays.', 'По воскресеньям мы ходим в кино.'],
            ['do + homework', 'I do my homework on Mondays.', 'По понедельникам я делаю домашнее задание.'],
            ['have', 'They have a swimming lesson on Thursdays.', 'У них по четвергам урок плавания.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ['I play table tennis on Wednesdays.', 'Я играю в настольный теннис по средам.'],
            ['We go to the swimming pool on Fridays.', 'По пятницам мы ходим в бассейн.'],
            ['You ride your bike in the park.', 'Ты катаешься на велосипеде в парке.'],
            ['They visit their grandma and grandad every Sunday.', 'Каждое воскресенье они навещают бабушку и дедушку.'],
            ['I do my homework on Mondays and Thursdays.', 'Я делаю домашнее задание по понедельникам и четвергам.'],
            ['On Tuesdays I have a swimming lesson.', 'По вторникам у меня урок плавания.'],
            ['Do you like tennis or volleyball?', 'Ты любишь теннис или волейбол?'],
            ['They go to the cinema in town on Sundays.', 'По воскресеньям они ходят в кино в городе.'],
          ],
        },
        {
          type: 'note',
          text: 'Русский говорит «играть *в* футбол», а по-английски предлога нет: *I play football*, не *I play in football*. И день недели — всегда с *on*: *on Monday*, а не *in Monday*.',
        },
        {
          type: 'note',
          text: 'Дни недели в английском пишутся с большой буквы: *Monday, Friday*. По-русски мы пишем их с маленькой, поэтому рука сама тянется написать *monday*.',
        },
        {
          type: 'p',
          text: 'Слова юнита: дни недели (Monday … Sunday), виды спорта (football, basketball, volleyball, tennis, table tennis), занятия (swim, ride a bike, roller blade, visit, do homework). Карточки — в разделе слов.',
        },
        {
          type: 'book',
          items: [
            'SB стр. 62: упр. 1 — послушай и повтори дни недели; упр. 2 — прочитай рассказ «My week», затем перечитай вслух; упр. 3 — соедини дни с фотографиями',
            'SB стр. 63: упр. 4 — впиши глаголы из рамки; упр. 5 — соедини виды спорта с фотографиями; упр. 6 — отметь свои виды спорта, спроси партнёра и ответь; упр. 9 — напиши письменно о своей неделе; упр. 10 — послушай песенку и впиши пропущенные слова',
            'WB стр. 46: упр. 1–5 письменно',
          ],
        },
      ],
    },
    {
      unit: 'u20',
      blocks: [
        {
          type: 'p',
          text: 'Когда в Present Simple говорят о *he, she, it* (он, она, оно — один человек или предмет), к глаголу добавляется окончание *-s*: *he plays, she rides, it eats*. Для *I, you, we, they* глагол остаётся прежним. Если глагол кончается на *-s, -sh, -ch, -o*, добавляется *-es*: *wash → washes, brush → brushes, watch → watches, go → goes, do → does*. Глагол *have* меняется иначе: *he has*.',
        },
        {
          type: 'p',
          text: 'Время называем так: *It\'s seven o\'clock* — ровно семь; *It\'s half past seven* — 7:30, дословно «половина после семи». Вопрос — *What time is it?*. А если что-то случается в это время, перед ним ставим *at*: *at eight o\'clock*, *at half past nine*. (Если глагол кончается на согласную + y, то y меняется на ies: study → studies. В этом юните таких глаголов нет.)',
        },
        {
          type: 'rule',
          title: 'Present Simple: he / she / it',
          rows: [
            ['+ s', 'She plays in the garden.', 'Она играет в саду.'],
            ['+ es: wash → washes', 'He washes his dog.', 'Он моет свою собаку.'],
            ['brush → brushes', 'She brushes her hair.', 'Она расчёсывает волосы.'],
            ['watch → watches', 'Tilly watches birds.', 'Тилли наблюдает за птицами.'],
            ['go → goes', "He goes to bed at seven o'clock.", 'Он ложится спать в семь часов.'],
            ['do → does', 'She does her homework.', 'Она делает домашнее задание.'],
            ['have → has', "He has breakfast at eight o'clock.", 'Он завтракает в восемь часов.'],
          ],
        },
        {
          type: 'rule',
          title: 'Который час',
          rows: [
            ['What time is it?', 'What time is it?', 'Который час?'],
            ["It's ... o'clock.", "It's nine o'clock.", 'Сейчас девять часов.'],
            ["It's half past ...", "It's half past four.", 'Сейчас половина пятого (4:30).'],
            ['at + время', "She gets up at six o'clock.", 'Она встаёт в шесть часов.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ["Ted gets up at six o'clock every day.", 'Тед каждый день встаёт в шесть часов.'],
            ["She washes her dog at nine o'clock.", 'Она моет свою собаку в девять часов.'],
            ['Tilly loves birds. She watches them in the park.', 'Тилли обожает птиц. Она наблюдает за ними в парке.'],
            ['He has breakfast at half past ten.', 'Он завтракает в половине одиннадцатого.'],
            ["It's lunch time! It's one o'clock.", 'Время обеда! Сейчас час дня.'],
            ['The cat drinks water from a bowl.', 'Кошка пьёт воду из миски.'],
            ['My brother brushes his hair every day.', 'Мой брат каждый день расчёсывает волосы.'],
            ["What time is it? It's half past two.", 'Который час? Половина третьего (2:30).'],
            ["She goes home at four o'clock.", 'Она идёт домой в четыре часа.'],
          ],
        },
        {
          type: 'note',
          text: 'Самая частая ошибка — забыть *-s* у *he / she / it*: ✗ *She play tennis* → ✓ *She plays tennis*. И не говори *he have*, *she go*: правильно *he has*, *she goes*.',
        },
        {
          type: 'note',
          text: '*Half past ten* — это 10:30 («после десяти»), а русское «в половине десятого» — 9:30. Не переводи слово в слово: по-английски 9:30 — *half past nine*.',
        },
        {
          type: 'p',
          text: 'Слова юнита: распорядок дня (get up, wash, brush, breakfast, lunch, watch), время (o\'clock, half past, What time is it?) и описания (lazy, greedy, dirty, poor, wonderful).',
        },
        {
          type: 'book',
          items: [
            'SB стр. 64: упр. 1 — послушай и прочитай комикс про Теда и Тилли, затем перечитай вслух, найди все глаголы с -s',
            'SB стр. 65: упр. 2 — обведи верные слова; упр. 3 — послушай и нарисуй время на часах; упр. 4 — спроси и ответь по часам из упр. 3; упр. 5 — поставь глаголы в нужную форму; упр. 6 — расскажи о субботе Joe; упр. 7 — напиши о своих субботах',
            'WB стр. 47: упр. 1–4 письменно',
          ],
        },
      ],
    },
    {
      unit: 'u21',
      blocks: [
        {
          type: 'p',
          text: 'Вопросительные слова *Who?* (кто), *What?* (что), *Where?* (где) стоят в начале вопроса. Дальше идёт глагол *to be* — *is* или *are*, а потом остальное: *What is it?*, *Who are they?*, *Where are you?*. Глагол обязательно стоит на втором месте.',
        },
        {
          type: 'p',
          text: 'Отвечаем коротким предложением: *What is it? — It\'s a robot.* *Who is he? — He\'s my friend.* *Where are they? — They\'re in the garden.* В вопросе можно сокращать: *what\'s, who\'s, where\'s* (= what is, who is, where is). *Who* спрашивает о людях («кто»), *what* — о предметах («что»).',
        },
        {
          type: 'rule',
          title: 'Вопросы с what / who / where',
          rows: [
            ['What is ...?', 'What is that?', 'Что это?'],
            ['What are ...?', 'What are those?', 'Что это такое (много предметов)?'],
            ['Who is ...?', 'Who is she?', 'Кто она?'],
            ['Who are ...?', 'Who are they?', 'Кто они?'],
            ['Where is ...?', 'Where is Hobo?', 'Где Хобо?'],
            ['Where are ...?', 'Where are you?', 'Где ты (вы)?'],
          ],
        },
        {
          type: 'rule',
          title: 'Утверждение — вопрос с да/нет — вопрос с wh-',
          rows: [
            ['It is a robot.', "It's a robot.", 'Это робот.'],
            ['Is it a robot?', 'Is it a robot? — Yes, it is.', 'Это робот? — Да.'],
            ['What is it?', "What is it? — It's a robot.", 'Что это? — Это робот.'],
            ['They are brave.', 'Are they brave? — Yes, they are.', 'Они храбрые? — Да.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ['Where is my school bag?', 'Где моя школьная сумка?'],
            ["Who is that girl? She's my sister.", 'Кто эта девочка? Это моя сестра.'],
            ["What is this? It's a sky car.", 'Что это? Это небесная машина.'],
            ["Where are the children? They're in the garden.", 'Где дети? Они в саду.'],
            ["Who are you? I'm Anna.", 'Кто ты? Я Анна.'],
            ["Where is the bright light? It's in the sky.", 'Где яркий свет? Он в небе.'],
            ['Turn your head! Look at the robot!', 'Поверни голову! Посмотри на робота!'],
            ["Let's be friends!", 'Давайте дружить!'],
          ],
        },
        {
          type: 'note',
          text: 'По-русски связки нет: «Где мама?», «Кто это?». По-английски *is / are* обязателен: ✗ *Where you from?* → ✓ *Where are you from?*; ✗ *Who he?* → ✓ *Who is he?*.',
        },
        {
          type: 'note',
          text: 'Не путай *who* и *what*: о человеке спрашиваем *Who is he?* («Кто он?»), о предмете — *What is it?* («Что это?»). И после *where* глагол согласуется с тем, о ком спрашиваем: *Where is Mum?*, но *Where are the robots?*.',
        },
        {
          type: 'p',
          text: 'Слова юнита: описания (brave, bright), глаголы (leave, move), robot, light и две живые фразы: *Turn your head!* и *Let\'s be friends!*.',
        },
        {
          type: 'book',
          items: [
            'SB стр. 66: упр. 1 — вспомни прошлую историю и допиши пропуски; упр. 2 — послушай и прочитай историю Selest 7 (Story Time), затем перечитай вслух по ролям',
            'SB стр. 67: упр. 3 — отметь верно / неверно; упр. 4 — впиши who, what или where; упр. 5 — составь вопросы к ответам; упр. 6 — составь вопросы к диалогу, затем послушай и проверь',
            'WB стр. 48: упр. 1–4 письменно',
          ],
        },
      ],
    },
    {
      unit: 'r7',
      blocks: [
        {
          type: 'p',
          text: 'Повторение Units 19–21. Что нужно помнить: (1) *Unit 19* — Present Simple для *I, you, we, they*: глагол без изменений, *on Mondays* («по понедельникам»), *every Sunday* («каждое воскресенье»); (2) *Unit 20* — для *he, she, it* добавляется *-s / -es*: *plays, washes, goes, has*; время: *What time is it? — It\'s half past ten*; *at eight o\'clock*; (3) *Unit 21* — вопросы *what / who / where* + *is / are*: *Where is the robot? Who are they?*',
        },
        {
          type: 'note',
          text: 'Чаще всего в этом блоке ошибаются в трёх местах: забывают *-s* у *he / she / it* (*She play* → *She plays*), путают *on* (дни) и *at* (часы): *on Monday, at nine o\'clock*, и пропускают *is / are* в вопросе (*Where you?* → *Where are you?*).',
        },
        {
          type: 'book',
          items: [
            'SB стр. 68: Vocabulary — упр. 1–3 (соедини слова, допиши дни недели и расставь по порядку, найди лишнее слово); Pronunciation — упр. 4 (послушай, повтори и ответь на вопросы)',
            'SB стр. 68–69: Grammar — упр. 5 (дни недели по картинкам), упр. 6 (послушай и соедини время с часами), упр. 7 (расскажи о субботе Jamie), упр. 8 (поставь глаголы в нужную форму); упр. 9 — составь вопросы по картинкам; игра Fun Time',
            'WB стр. 49: Language Diary — заполни таблицу Present Simple; упр. 1–3 (слова и время) письменно',
            'WB стр. 50: упр. 4–7 письменно (в упр. 7 выбери on, at или every)',
            'WB стр. 51: Check Yourself, Units 19–21 — выполни без подсказок, затем проверь себя по ответам в WB стр. 62–63',
          ],
        },
      ],
    },
  ],
  exercises: [
    ...ex('u19', [
      { type: 'choice', q: 'We ___ tennis on Fridays.', options: ['play', 'plays', 'are play'], answer: 0, ru: 'Мы играем в теннис по пятницам.' },
      { type: 'choice', q: 'I go ___ the cinema on Saturdays.', options: ['to', 'in', 'on'], answer: 0, ru: 'По субботам я хожу в кино.' },
      { type: 'choice', q: '___ Mondays we have a sports lesson.', options: ['On', 'In', 'At'], answer: 0, ru: 'По понедельникам у нас урок физкультуры.' },
      { type: 'choice', q: 'They ___ their homework on Sundays.', options: ['do', 'does', 'are'], answer: 0, ru: 'По воскресеньям они делают домашнее задание.' },
      { type: 'gap', q: 'I ___ (ride) my bike in the park.', answers: ['ride'], ru: 'Я катаюсь на велосипеде в парке.' },
      { type: 'gap', q: 'We ___ (swim) in the swimming pool on Thursdays.', answers: ['swim'], ru: 'По четвергам мы плаваем в бассейне.' },
      { type: 'gap', q: 'You ___ (have) a swimming lesson on Tuesdays.', answers: ['have'], ru: 'По вторникам у тебя урок плавания.' },
      { type: 'order', words: ['on', 'Mondays', 'we', 'play', 'volleyball'], answers: ['On Mondays we play volleyball.'], ru: 'По понедельникам мы играем в волейбол.' },
      { type: 'order', words: ['I', 'do', 'my', 'homework', 'on', 'Sundays'], answers: ['I do my homework on Sundays.'], ru: 'По воскресеньям я делаю домашнее задание.' },
      {
        type: 'order',
        words: ['they', 'go', 'to', 'the', 'swimming', 'pool', 'every', 'Friday'],
        answers: ['They go to the swimming pool every Friday.'],
        ru: 'Каждую пятницу они ходят в бассейн.',
      },
      {
        type: 'translate',
        ru: 'Мы играем в баскетбол по средам.',
        answers: ['We play basketball on Wednesdays.', 'On Wednesdays we play basketball.'],
      },
      {
        type: 'translate',
        ru: 'Я катаюсь на велосипеде по субботам.',
        answers: ['I ride my bike on Saturdays.', 'On Saturdays I ride my bike.', 'I ride a bike on Saturdays.', 'On Saturdays I ride a bike.'],
      },
      {
        type: 'translate',
        ru: 'Они ходят в кино каждое воскресенье.',
        answers: ['They go to the cinema every Sunday.', 'Every Sunday they go to the cinema.'],
      },
      { type: 'translate', ru: 'Ты любишь футбол или теннис?', answers: ['Do you like football or tennis?'] },
    ]),
    ...ex('u20', [
      { type: 'choice', q: 'Tilly ___ birds in the park.', options: ['watches', 'watch', 'watchs'], answer: 0, ru: 'Тилли наблюдает за птицами в парке.' },
      { type: 'choice', q: 'My brother ___ lunch at one o\'clock.', options: ['have', 'has', 'haves'], answer: 1, ru: 'Мой брат обедает в час дня.' },
      { type: 'choice', q: 'She ___ to bed at nine o\'clock.', options: ['go', 'goes', 'gos'], answer: 1, ru: 'Она ложится спать в девять часов.' },
      { type: 'choice', q: 'It\'s ___ past two.', options: ['half', 'half of', 'a half'], answer: 0, ru: 'Сейчас половина третьего.' },
      { type: 'gap', q: 'Suzie ___ (wash) her dog every day.', answers: ['washes'], ru: 'Сюзи каждый день моет свою собаку.' },
      { type: 'gap', q: 'He ___ (do) his homework at five o\'clock.', answers: ['does'], ru: 'Он делает домашнее задание в пять часов.' },
      { type: 'gap', q: 'The cat ___ (drink) water from a bowl.', answers: ['drinks'], ru: 'Кошка пьёт воду из миски.' },
      {
        type: 'order',
        words: ['she', 'gets', 'up', 'at', 'eight', "o'clock"],
        answers: ["She gets up at eight o'clock."],
        ru: 'Она встаёт в восемь часов.',
      },
      {
        type: 'order',
        words: ['he', 'has', 'breakfast', 'at', 'half', 'past', 'seven'],
        answers: ['He has breakfast at half past seven.'],
        ru: 'Он завтракает в половине восьмого.',
      },
      {
        type: 'order',
        words: ['the', 'dog', 'plays', 'in', 'the', 'garden', 'every', 'day'],
        answers: ['The dog plays in the garden every day.'],
        ru: 'Собака каждый день играет в саду.',
      },
      {
        type: 'translate',
        ru: 'Тилли каждый день наблюдает за птицами.',
        answers: [
          'Tilly watches birds every day.',
          'Every day Tilly watches birds.',
          'Tilly watches the birds every day.',
          'Every day Tilly watches the birds.',
        ],
      },
      {
        type: 'translate',
        ru: 'Он завтракает в половине десятого.',
        answers: ['He has breakfast at half past nine.', 'At half past nine he has breakfast.'],
      },
      {
        type: 'translate',
        ru: 'Который час? — Три часа.',
        answers: ["What time is it? It's three o'clock."],
      },
      {
        type: 'translate',
        ru: 'Моя бабушка встаёт в семь часов.',
        answers: [
          "My grandma gets up at seven o'clock.",
          "My grandmother gets up at seven o'clock.",
          "At seven o'clock my grandma gets up.",
        ],
      },
    ]),
    ...ex('u21', [
      { type: 'choice', q: '___ is that? — It\'s a robot.', options: ['What', 'Who', 'Where'], answer: 0, ru: 'Что это? — Это робот.' },
      { type: 'choice', q: '___ is she? — She\'s my sister.', options: ['Who', 'What', 'Where'], answer: 0, ru: 'Кто она? — Это моя сестра.' },
      { type: 'choice', q: '___ are the children? — They\'re in the garden.', options: ['Where', 'Who', 'What'], answer: 0, ru: 'Где дети? — Они в саду.' },
      { type: 'choice', q: 'What ___ they? — They\'re robots.', options: ['is', 'are', 'am'], answer: 1, ru: 'Что это такое? — Это роботы.' },
      { type: 'gap', q: '___ is the robot? — It\'s behind the door.', answers: ['Where'], ru: 'Где робот? — Он за дверью.' },
      { type: 'gap', q: '___ are those girls? — They\'re my friends.', answers: ['Who'], ru: 'Кто эти девочки? — Это мои подруги.' },
      { type: 'gap', q: '___ is this? — It\'s a sky car.', answers: ['What'], ru: 'Что это? — Это небесная машина.' },
      { type: 'order', words: ['where', 'is', 'my', 'school', 'bag'], answers: ['Where is my school bag?'], ru: 'Где моя школьная сумка?' },
      { type: 'order', words: ['who', 'are', 'those', 'children'], answers: ['Who are those children?'], ru: 'Кто эти дети?' },
      {
        type: 'order',
        words: ['where', 'are', 'Luke', 'and', 'Anna'],
        answers: ['Where are Luke and Anna?'],
        ru: 'Где Люк и Анна?',
      },
      { type: 'translate', ru: 'Где моя собака?', answers: ['Where is my dog?'] },
      {
        type: 'translate',
        ru: 'Кто это? — Это мой дядя.',
        answers: [
          "Who is this? It's my uncle.",
          "Who is it? It's my uncle.",
          "Who is that? It's my uncle.",
          'Who is this? This is my uncle.',
          "Who is that? That's my uncle.",
          "Who is he? He's my uncle.",
        ],
      },
      {
        type: 'translate',
        ru: 'Что это? — Это робот.',
        answers: [
          "What is it? It's a robot.",
          "What is this? It's a robot.",
          "What is that? It's a robot.",
          'What is this? This is a robot.',
          "What is that? That's a robot.",
        ],
      },
      {
        type: 'translate',
        ru: 'Где вы? — Мы в саду.',
        answers: ["Where are you? We're in the garden.", "Where are you? We're in a garden."],
      },
    ]),
  ],
};
