import type { ContentBlock, Word } from '../types';

/**
 * Блок 2 книги: Units 4–6, Revision 2 и Reading Corner «Tim's Friend» (SB 16–25, WB 10–17).
 * Слова — из словаря SB (стр. 92–93); объяснения, примеры и упражнения свои.
 */

const w =
  (unit: string) =>
  (en: string, ru: string, example?: [string, string]): Word => ({ en, ru, unit, example });

const u04 = w('u04');
const u05 = w('u05');
const u06 = w('u06');
const rc1 = w('rc1');

export const B2: ContentBlock = {
  words: [
    // ───────── Unit 4 · My World ─────────
    u04('best friend', 'лучший друг, лучшая подруга', ['Micky is my best friend.', 'Мики — мой лучший друг.']),
    u04("here's ...", 'вот ... (когда показываешь кого-то или что-то)', ["Here's my best friend, Ben.", 'Вот мой лучший друг Бен.']),
    u04('How old are you?', 'Сколько тебе лет?', ["How old are you? I'm eleven.", 'Сколько тебе лет? Мне одиннадцать.']),
    u04('minus', 'минус', ['Twelve minus two is ten.', 'Двенадцать минус два — десять.']),
    u04('plus', 'плюс', ['Five plus five is ten.', 'Пять плюс пять — десять.']),
    u04('silly', 'глупый; дурашливый', ['You are silly, Micky!', 'Ты дурашка, Мики!']),
    u04('very', 'очень', ['Suzie is very nice.', 'Сьюзи очень милая.']),

    // ───────── Unit 5 · Crazy Pets ─────────
    u05('bad', 'плохой', ['Bad dog, Ted!', 'Плохая собака, Тед!']),
    u05('ball', 'мяч', ["Ted's ball is red.", 'Мяч Теда красный.']),
    u05('black', 'чёрный', ['My pen is black.', 'Моя ручка чёрная.']),
    u05('blue', 'синий; голубой', ['My school bag is blue.', 'Мой школьный рюкзак синий.']),
    u05('brown', 'коричневый', ['My desk is brown.', 'Моя парта коричневая.']),
    u05('colour', 'цвет; раскрашивать', ['What colour is it?', 'Какого это цвета?']),
    u05('favourite', 'любимый', ['My favourite colour is red.', 'Мой любимый цвет — красный.']),
    u05('fun', 'веселье; забава', ['Football is fun.', 'Футбол — это весело.']),
    u05('green', 'зелёный', ['The pencil is green.', 'Карандаш зелёный.']),
    u05("I don't know.", 'Я не знаю.', ["What colour is it? I don't know.", 'Какого это цвета? Я не знаю.']),
    u05('jacket', 'куртка; пиджак', ["Dad's jacket is brown.", 'Куртка папы коричневая.']),
    u05('orange', 'оранжевый; апельсин', ["Suzie's T-shirt is orange.", 'Футболка Сьюзи оранжевая.']),
    u05('paint', 'краска; красить', ['My paint is red and yellow.', 'Моя краска красная и жёлтая.']),
    u05('pink', 'розовый', ['My rubber is pink.', 'Мой ластик розовый.']),
    u05('red', 'красный', ['My ball is red.', 'Мой мяч красный.']),
    u05('terrible', 'ужасный', ['It is a terrible T-shirt!', 'Это ужасная футболка!']),
    u05('white', 'белый', ['The football is black and white.', 'Футбольный мяч чёрно-белый.']),
    u05('yellow', 'жёлтый', ["Joe's paint is yellow.", 'Краска Джо жёлтая.']),

    // ───────── Unit 6 · Story Time: Selest 2 ─────────
    u06('beautiful', 'красивый; прекрасный', ['The planets are beautiful.', 'Планеты красивые.']),
    u06('big', 'большой', ['The computers are very big.', 'Компьютеры очень большие.']),
    u06('cloud', 'облако', ['The clouds are white.', 'Облака белые.']),
    u06('come', 'приходить; идти сюда', ['Come and look, Mum!', 'Иди сюда и посмотри, мама!']),
    u06('draw', 'рисовать', ['Draw two planets, please.', 'Нарисуй две планеты, пожалуйста.']),
    u06('empty', 'пустой', ['The classroom is empty.', 'Класс пустой.']),
    u06('for', 'для', ['The present is for you.', 'Подарок для тебя.']),
    u06('Help!', 'Помогите!', ['Help, Uncle Tom!', 'Помоги, дядя Том!']),
    u06('on', 'на (поверхности)', ['The ball is on the desk.', 'Мяч лежит на парте.']),
    u06('planet', 'планета', ['Two planets are red.', 'Две планеты красные.']),
    u06('room', 'комната', ['My room is green.', 'Моя комната зелёная.']),
    u06('sky', 'небо', ['The sky is blue.', 'Небо синее.']),
    u06('star', 'звезда', ['One star is yellow.', 'Одна звезда жёлтая.']),
    u06('start', 'начинать; запускать, включать', ['Start the computer, please.', 'Включи компьютер, пожалуйста.']),
    u06('stop', 'останавливать(ся)', ['Stop the ball, Ted!', 'Останови мяч, Тед!']),
    u06('television', 'телевизор; телевидение', ['My television is big.', 'Мой телевизор большой.']),
    u06('they', 'они', ['They are my friends.', 'Они мои друзья.']),
    u06('wall', 'стена', ['The wall is white.', 'Стена белая.']),
    u06('we', 'мы', ['We are friends.', 'Мы друзья.']),
    u06('Wow!', 'Вау!', ['Wow! The room is beautiful!', 'Вау! Комната прекрасная!']),

    // ───────── Reading Corner · Tim's Friend ─────────
    rc1('age', 'возраст', ['Name, age, lucky number.', 'Имя, возраст, счастливое число.']),
    rc1('box', 'коробка', ['The mouse is in the box.', 'Мышь в коробке.']),
    rc1('film', 'фильм', ['My favourite film is fantastic.', 'Мой любимый фильм потрясающий.']),
    rc1('funny', 'смешной; забавный', ['Ted is funny.', 'Тед забавный.']),
    rc1('mouse', 'мышь', ['Is it a mouse?', 'Это мышь?']),
    rc1('small', 'маленький', ['The mouse is very small.', 'Мышь очень маленькая.']),
    rc1('today', 'сегодня', ['Today is my birthday.', 'Сегодня мой день рождения.']),
  ],

  lessons: [
    // ───────── Unit 4 ─────────
    {
      unit: 'u04',
      blocks: [
        {
          type: 'p',
          text: 'Чтобы задать вопрос с *to be*, глагол *am / is / are* ставится перед подлежащим. *You are ten.* → *Are you ten?* *He is in 5B.* → *Is he in 5B?* В русском вопрос выделяется интонацией («Ты десять?»), в английском — порядком слов: нужно поменять их местами, даже если голос идёт вверх.',
        },
        {
          type: 'p',
          text: 'Ответ на такой вопрос — короткий: *Yes* или *No*, подлежащее и форма *to be*. Предмет или остальные слова не повторяют: *Are you ten? — Yes, I am.* / *No, I\'m not.* *Is he your friend? — Yes, he is.* / *No, he isn\'t.* Отрицание — *not*: *is not → isn\'t*, *I am not → I\'m not*.',
        },
        {
          type: 'p',
          text: 'Возраст по-английски говорят с *to be*: *I\'m ten.* — «я есть десять». Вопрос: *How old are you?* (буквально «как старый ты?»). О другом человеке: *How old is he?* — *He\'s eleven.* Слово «лет» (*years old*) необязательно.',
        },
        {
          type: 'rule',
          title: 'Вопрос с to be',
          rows: [
            ['Am I …?', 'Am I in your class?', 'Я в твоём классе?'],
            ['Are you …?', 'Are you in my class?', 'Ты в моём классе?'],
            ['Is he …?', 'Is he your friend?', 'Он твой друг?'],
            ['Is she …?', 'Is she in class 5B?', 'Она в 5Б классе?'],
            ['Is it …?', 'Is it a dog?', 'Это собака?'],
          ],
        },
        {
          type: 'rule',
          title: 'Короткие ответы',
          rows: [
            ["Yes, I am. / No, I'm not.", "Are you eleven? No, I'm not. I'm ten.", 'Тебе одиннадцать? Нет. Мне десять.'],
            ["Yes, he is. / No, he isn't.", 'Is Ben your friend? Yes, he is.', 'Бен твой друг? Да.'],
            ["Yes, she is. / No, she isn't.", "Is she in 6A? No, she isn't.", 'Она в 6А? Нет.'],
            ["Yes, it is. / No, it isn't.", "Is it a pen? No, it isn't.", 'Это ручка? Нет.'],
          ],
        },
        {
          type: 'rule',
          title: 'Возраст, плюс и минус',
          rows: [
            ['How old are you?', "How old are you? I'm ten.", 'Сколько тебе лет? Мне десять.'],
            ['How old is he / she?', "How old is she? She's eleven.", 'Сколько ей лет? Ей одиннадцать.'],
            ['plus', 'Five plus five is ten.', 'Пять плюс пять — десять.'],
            ['minus', 'Twelve minus two is ten.', 'Двенадцать минус два — десять.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ['Are you in my class? Yes, I am.', 'Ты в моём классе? Да.'],
            ["How old are you? I'm ten.", 'Сколько тебе лет? Мне десять.'],
            ['Is he your friend? Yes, he is.', 'Он твой друг? Да.'],
            ["Is she in 5B? No, she isn't.", 'Она в 5Б? Нет.'],
            ["Here's my best friend, Ben.", 'Вот мой лучший друг Бен.'],
            ['Micky is very nice.', 'Мики очень милый.'],
            ["Are you eleven? No, I'm not.", 'Тебе одиннадцать? Нет.'],
            ['Five plus five is ten.', 'Пять плюс пять — десять.'],
            ["You're very lucky!", 'Тебе очень повезло!'],
          ],
        },
        {
          type: 'note',
          text: 'В утвердительном коротком ответе *I am* не сокращают: *Yes, I am.* — правильно, *Yes, I\'m.* — ошибка. А отрицательный ответ чаще сокращённый: *No, I\'m not.* Формы «I amn\'t» не существует.',
        },
        {
          type: 'note',
          text: 'Русскоязычные переводят «мне десять лет» слово в слово: «Me ten years». По-английски подлежащее — *I*, и обязателен *to be*: *I am ten.* И в вопросе нельзя оставлять прямой порядок: *You are ten?* в письме — ошибка, нужно *Are you ten?*',
        },
        {
          type: 'p',
          text: 'Слова юнита: возраст и числа (how old, plus, minus), оценки и характер (silly, very), друзья (best friend, here\'s …).',
        },
        {
          type: 'book',
          items: [
            'SB стр. 16: упр. 1 — прочитай диалог Джейд, Софи и Бена вслух; упр. 2 — отметь верные и неверные предложения, неверные исправь письменно',
            'SB стр. 17: упр. 3 — задай вопрос How old are you? и ответь вслух; упр. 4 построено на аудио — пропусти; упр. 5 — вопросы и ответы по картинкам (How old is she? She\'s …)',
            'SB стр. 17: упр. 6 — впиши am / is / isn\'t / \'m not / are; упр. 7 — составь вопросы и ответь; упр. 8 — прочитай диалог с плюсом и минусом вслух; упр. 9 — разыграй диалог, выбрав свой возраст',
            'WB стр. 10: упр. 1–5 письменно',
          ],
        },
      ],
    },

    // ───────── Unit 5 ─────────
    {
      unit: 'u05',
      blocks: [
        {
          type: 'p',
          text: 'Чтобы сказать, чьё что-то, к имени или существительному добавляют *\'s*: *Joe\'s jacket* — «куртка Джо», *Suzie\'s school bag* — «рюкзак Сьюзи». Порядок обратный русскому: сначала владелец, потом вещь. Русский ставит имя после вещи («куртка Джо» — в родительном падеже), английский — до неё, и апостроф обязателен.',
        },
        {
          type: 'p',
          text: 'Внимание: *\'s* бывает двух видов. После слова с *\'s* стоит существительное — это «чей?»: *Ted\'s ball is blue.* («мяч Теда»). После слова с *\'s* стоит прилагательное или существительное с артиклем — это сокращённое *is*: *Ted\'s a good dog.* («Тед — хорошая собака»).',
        },
        {
          type: 'p',
          text: 'Цвета: вопрос *What colour is it?* — ответ *It\'s red.* Любимый цвет: *What\'s your favourite colour? — My favourite colour is blue.* Цвет стоит перед предметом: *It\'s a yellow jacket.* Слово *colour* пишется по-британски — с *u*.',
        },
        {
          type: 'rule',
          title: "Притяжательный 's: чей?",
          rows: [
            ["Joe's jacket", "Joe's jacket is orange.", 'Куртка Джо оранжевая.'],
            ["Suzie's school bag", "Suzie's school bag is red.", 'Рюкзак Сьюзи красный.'],
            ["Ted's ball", "Ted's ball is blue.", 'Мяч Теда синий.'],
            ["'s = is", "Ted's a good dog.", 'Тед — хорошая собака.'],
          ],
        },
        {
          type: 'rule',
          title: 'Цвета',
          rows: [
            ['What colour is it?', "What colour is your jacket? It's green.", 'Какого цвета твоя куртка? Зелёная.'],
            ["What's your favourite colour?", 'My favourite colour is yellow.', 'Мой любимый цвет — жёлтый.'],
            ['цвет перед предметом', 'It is a yellow jacket.', 'Это жёлтая куртка.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ["What's your favourite colour?", 'Какой твой любимый цвет?'],
            ['My favourite colour is red.', 'Мой любимый цвет — красный.'],
            ["Suzie's jacket is pink.", 'Куртка Сьюзи розовая.'],
            ['What colour is your school bag?', 'Какого цвета твой школьный рюкзак?'],
            ["Ted's ball is yellow.", 'Мяч Теда жёлтый.'],
            ['The football is black and white.', 'Футбольный мяч чёрно-белый.'],
            ["I don't know.", 'Я не знаю.'],
            ["Joe's paint is brown.", 'Краска Джо коричневая.'],
            ['Bad dog, Ted!', 'Плохая собака, Тед!'],
          ],
        },
        {
          type: 'note',
          text: 'Не ставь рядом имя с *\'s* и *his / her*: говорят *Ted\'s ball* или *his ball*, но не «Ted\'s his ball». И не переставляй слова на русский манер: *jacket Joe* и *Joe jacket* — ошибки, правильно только *Joe\'s jacket*.',
        },
        {
          type: 'note',
          text: 'Чтобы отличить *\'s* = «чей» от *\'s* = *is*, подставь *is*: «Ted is ball» — бессмыслица, значит, это «чей» (*Ted\'s ball*). «Ted is a good dog» имеет смысл — значит, это *is* (*Ted\'s a good dog*).',
        },
        {
          type: 'p',
          text: 'Слова юнита: цвета (red, yellow, green, blue, brown, black, white, pink, orange), вещи (ball, jacket, paint), оценки (bad, terrible, fun) и фраза «I don\'t know».',
        },
        {
          type: 'book',
          items: [
            'SB стр. 18: упр. 1 — прочитай комикс про краски Джо, Сьюзи и собак вслух; выпиши все цвета, которые назвал Джо',
            'SB стр. 19: упр. 2 — кто какой цвет любит (по комиксу); упр. 3 — подпиши цвета предметов; упр. 4 построено на аудио — раскрась рисунок по подписям сам',
            'SB стр. 19: упр. 5 — спроси и ответь вслух (What colour is it?); упр. 6 — составь предложения про Теда, Сьюзи, Тилли, Джо и твоего учителя английского; упр. 7 — выбери колонку his или Ted is',
            'SB стр. 19: упр. 8–9 — вместо одноклассников опиши друзей или родных: Martin\'s school bag is … His jacket is …',
            'WB стр. 11: упр. 1–5 письменно',
          ],
        },
      ],
    },

    // ───────── Unit 6 ─────────
    {
      unit: 'u06',
      blocks: [
        {
          type: 'p',
          text: 'Чтобы сказать о нескольких предметах, к существительному обычно добавляют *-s*: *a star → stars*, *a cloud → clouds*, *a planet → planets*. Артикль *a / an* при этом исчезает: *two stars*, *the stars*, *red planets*. После числа «два» и больше слово всегда стоит во множественном числе: *one planet, two planets, three planets*. У некоторых слов множественное число образуется иначе — они встретятся позже.',
        },
        {
          type: 'p',
          text: 'Для «мы», «вы» и «они» глагол *to be* имеет форму *are*: *we are* («мы»), *you are* («вы»), *they are* («они»). Сокращённо: *we\'re*, *you\'re*, *they\'re*. Слово *you* — и «ты», и «вы»: с ним всегда *are*. Теперь у тебя есть весь *to be*: *I am, you are, he / she / it is, we / you / they are*. Если подлежащее — несколько вещей (*the stars*), нужно *are*, а не *is*.',
        },
        {
          type: 'rule',
          title: 'Множественное число: + s',
          rows: [
            ['a star → stars', 'The stars are yellow.', 'Звёзды жёлтые.'],
            ['a planet → planets', 'Three planets are red.', 'Три планеты красные.'],
            ['a cloud → clouds', 'The clouds are white.', 'Облака белые.'],
            ['a wall → walls', 'The walls are empty.', 'Стены пустые.'],
            ['a television → televisions', 'Two televisions are big.', 'Два телевизора большие.'],
          ],
        },
        {
          type: 'rule',
          title: 'to be: we, you, they',
          rows: [
            ["we are / we're", "We're in the room.", 'Мы в комнате.'],
            ["you are / you're", "You're my friends.", 'Вы мои друзья.'],
            ["they are / they're", "They're beautiful!", 'Они красивые!'],
            ['is → are', 'One star is yellow. Two stars are yellow.', 'Одна звезда жёлтая. Две звезды жёлтые.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ['The stars are yellow.', 'Звёзды жёлтые.'],
            ['We are in the room.', 'Мы в комнате.'],
            ["Look at the planets! They're beautiful!", 'Посмотри на планеты! Они прекрасные!'],
            ['The walls are empty.', 'Стены пустые.'],
            ['Wow, the sky is blue!', 'Вау, небо синее!'],
            ['They are my friends.', 'Они мои друзья.'],
            ['Come and look at the clouds.', 'Иди сюда и посмотри на облака.'],
            ['Two planets are red and three planets are orange.', 'Две планеты красные, а три планеты оранжевые.'],
            ['Help! Stop the computers!', 'Помогите! Остановите компьютеры!'],
          ],
        },
        {
          type: 'note',
          text: 'Согласуй глагол с подлежащим: *The stars is yellow* и *They is nice* — ошибки, нужно *are*. И не ставь *a / an* перед множественным числом: *two stars*, а не *two a stars* и не *a stars*.',
        },
        {
          type: 'note',
          text: 'Русскому «вы» соответствует *you* (и с ним тоже *are*: *You are my friends*), а «они» — *they*. И не забывай *-s* после числа: *three planets*, а не *three planet* (в русском после «трёх» тоже форма меняется, но по-другому — по-английски она одна: *+s*).',
        },
        {
          type: 'p',
          text: 'Слова юнита: космос и комната (planet, star, sky, cloud, room, wall, television, computer), оценки (beautiful, big, empty) и команды (come, draw, start, stop).',
        },
        {
          type: 'book',
          items: [
            'SB стр. 20: упр. 1 — вспомни историю про подарок Люка и допиши слова; упр. 2 — прочитай историю про комнату дяди Тома (Selest 2) целиком, затем вслух',
            'SB стр. 21: упр. 3 — верно или неверно по истории; упр. 4 — посчитай предметы на картинке и назови их во множественном числе (two chairs)',
            'SB стр. 21: упр. 5 — впиши we\'re, you\'re, they\'re; упр. 6 — вопросы What colour are the chairs? — ответь вслух по картинке; упр. 7 — прочитай задания и нарисуй их в тетради',
            'WB стр. 12: упр. 1–4 письменно',
          ],
        },
      ],
    },

    // ───────── Revision 2 ─────────
    {
      unit: 'r2',
      blocks: [
        {
          type: 'p',
          text: 'Повторение блока: Unit 4, Unit 5, Unit 6.',
        },
        {
          type: 'p',
          text: '*Unit 4* — вопрос с *to be* меняет порядок слов: *Are you …? Is he / she / it …?*; короткие ответы *Yes, I am. / No, I\'m not. / Yes, he is. / No, she isn\'t.*; возраст *How old are you? — I\'m ten.*; *plus* и *minus*.',
        },
        {
          type: 'p',
          text: '*Unit 5* — *\'s* после имени = «чей» (*Joe\'s jacket*), а в *Ted\'s a good dog* = *is*; цвета и вопрос *What colour is …?*; *My favourite colour is …*',
        },
        {
          type: 'p',
          text: '*Unit 6* — множественное число = слово + *-s* (*two stars*, без *a/an*); *we / you / they are* (*we\'re, you\'re, they\'re*); с несколькими предметами — *are*, а не *is*.',
        },
        {
          type: 'p',
          text: 'Весь *to be* сразу: *I am*, *you are*, *he / she / it is*, *we / you / they are*. Вопрос — глагол впереди (*Are you …?*), отрицание — *not* (*isn\'t*, *I\'m not*).',
        },
        {
          type: 'note',
          text: 'Чаще всего в этом блоке ошибаются так: (1) отвечают *Yes, I\'m* вместо *Yes, I am*; (2) путают *Ted\'s* = «Теда» и *Ted\'s* = *Ted is* и ставят апостроф не там (*the boys jacket* вместо *the boy\'s jacket*); (3) говорят *The stars is …* вместо *The stars are …*; (4) забывают *very* перед прилагательным для «очень» (*Micky is very nice*).',
        },
        {
          type: 'book',
          items: [
            'SB стр. 22: упр. 1–2 — слова по группам и кроссворд с числами (письменно); упр. 3–4 построены на аудио — пропусти; упр. 5 — подставь подходящие местоимения (he, she, it, we, you, they)',
            'SB стр. 23: упр. 6 — впиши \'m, \'s, \'re; упр. 7 — предложения с притяжательным \'s (Dave\'s football is brown.); упр. 8 — песня: прочитай слова вслух и впиши пропуски по смыслу; Fun Time — диаграмма «Is the boy in A1?» (вопросы с to be)',
            'WB стр. 13: Language Diary (заполни таблицы по памяти) и Vocabulary упр. 1–2; WB стр. 14: Grammar упр. 3–5 и Use your English упр. 6',
            'WB стр. 15: «Check Yourself» (Units 4–6) — выполни без подсказок, затем проверь себя по ответам в WB стр. 62–63',
          ],
        },
      ],
    },

    // ───────── Reading Corner · Tim's Friend ─────────
    {
      unit: 'rc1',
      blocks: [
        {
          type: 'p',
          text: 'Reading Corner — первый отдельный рассказ-диалог в книге, он собран из того, что ты уже знаешь: вопросы с *to be*, *he / she / it*, возраст, притяжательный *\'s*. Тим принёс в класс коробку, а Пит и учитель пытаются угадать, что в ней: вопросы *Is it …?*, ответы *Yes, it is. / No, it isn\'t.* — ровно то, что ты учил в юнитах 3 и 4. Сюжет проще узнать самому, читая страницу.',
        },
        {
          type: 'p',
          text: 'Как читать: (1) сначала посмотри на картинки и прочитай заголовки на SB стр. 24 — попробуй угадать сюжет; (2) прочитай текст целиком, не останавливаясь на каждом слове — общий смысл важнее; (3) прочитай ещё раз вслух, по ролям (Pete, Tim, Teacher); (4) незнакомые слова (age, box, film, funny, mouse, small, today) добавь в карточки и выучи; (5) только потом выполняй задания.',
        },
        {
          type: 'examples',
          items: [
            ['The mouse is in the box.', 'Мышь в коробке.'],
            ['Is it a mouse? No, it isn\'t.', 'Это мышь? Нет.'],
            ['Ted is funny.', 'Тед забавный.'],
            ['Today is my birthday.', 'Сегодня мой день рождения.'],
            ['My favourite film is fantastic.', 'Мой любимый фильм потрясающий.'],
            ['Name, age, lucky number.', 'Имя, возраст, счастливое число.'],
          ],
        },
        {
          type: 'note',
          text: 'В английском с заглавной буквы пишут первое слово предложения, местоимение *I*, имена людей, животных и названия планет (*Tati is from Planet Bati.*) — в WB стр. 17 упр. 4 ты как раз исправляешь такие ошибки. Следи за заглавными: *i am* и *planet bati* с маленькой буквы — ошибка.',
        },
        {
          type: 'p',
          text: 'Слова чтения: возраст и фильмы (age, film, today), предметы (box, mouse), оценки (funny, small).',
        },
        {
          type: 'book',
          items: [
            'SB стр. 24: Reading — упр. 1 прочитай историю и расставь картинки по порядку; упр. 2 — выбери название; упр. 3 (Listening) построено на аудио — пропусти',
            'SB стр. 25: Speaking упр. 4–6 — расскажи вслух о лучшем друге и задай те же вопросы себе; Writing упр. 7 — напиши о своём лучшем друге по образцу (My best friend\'s name is …); Project — по желанию',
            'WB стр. 16: Skills Corner 1, Reading — упр. 1 прочитай диалог и вставь недостающие фразы (стикеры в конце книги — если их нет, впиши подходящую фразу сам), упр. 2 — выбери название; WB стр. 17: упр. 3 — перечитай и выбери верное',
            'WB стр. 17: Writing — упр. 4 исправь предложения (заглавные буквы), упр. 5 составь предложения из слов, упр. 6 напиши про Rati по образцу про Tati',
          ],
        },
      ],
    },
  ],

  exercises: [
    // ───────── Unit 4 ─────────
    { id: 'u04-01', unit: 'u04', type: 'choice', q: '___ you in my class?', options: ['Are', 'Is', 'Am'], answer: 0, ru: 'Ты в моём классе?' },
    { id: 'u04-02', unit: 'u04', type: 'choice', q: "Is she in 5B? No, she ___.", options: ["isn't", "aren't", 'not'], answer: 0, ru: 'Она в 5Б? Нет.' },
    { id: 'u04-03', unit: 'u04', type: 'choice', q: 'How old ___ you?', options: ['are', 'is', 'am'], answer: 0, ru: 'Сколько тебе лет?' },
    { id: 'u04-04', unit: 'u04', type: 'choice', q: "Are you eleven? No, I'm ___. I'm ten.", options: ['not', 'no', "isn't"], answer: 0, ru: 'Тебе одиннадцать? Нет. Мне десять.' },
    { id: 'u04-05', unit: 'u04', type: 'gap', q: "How ___ is she? She's eleven.", answers: ['old'], ru: 'Сколько ей лет? Ей одиннадцать.' },
    { id: 'u04-06', unit: 'u04', type: 'gap', q: '___ he your best friend?', answers: ['Is'], ru: 'Он твой лучший друг?' },
    { id: 'u04-07', unit: 'u04', type: 'gap', q: 'Five ___ five is ten.', answers: ['plus'], ru: 'Пять плюс пять — десять.' },
    { id: 'u04-08', unit: 'u04', type: 'gap', q: 'Micky is ___ nice.', answers: ['very'], ru: 'Мики очень милый.' },
    { id: 'u04-09', unit: 'u04', type: 'order', words: ['how', 'old', 'are', 'you'], answers: ['How old are you?'], ru: 'Сколько тебе лет?' },
    { id: 'u04-10', unit: 'u04', type: 'order', words: ['is', 'she', 'in', 'class', '5B'], answers: ['Is she in class 5B?'], ru: 'Она в 5Б классе?' },
    { id: 'u04-11', unit: 'u04', type: 'order', words: ['he', 'is', 'my', 'best', 'friend'], answers: ['He is my best friend.'], ru: 'Он мой лучший друг.' },
    { id: 'u04-12', unit: 'u04', type: 'translate', ru: 'Сколько ему лет?', answers: ['How old is he?'] },
    { id: 'u04-13', unit: 'u04', type: 'translate', ru: 'Мне десять.', answers: ['I am ten.', 'I am ten years old.'] },
    { id: 'u04-14', unit: 'u04', type: 'translate', ru: 'Она в моём классе?', answers: ['Is she in my class?'] },

    // ───────── Unit 5 ─────────
    { id: 'u05-01', unit: 'u05', type: 'choice', q: '___ jacket is orange.', options: ["Joe's", 'Joe is', 'Joe'], answer: 0, ru: 'Куртка Джо оранжевая.' },
    { id: 'u05-02', unit: 'u05', type: 'choice', q: 'What ___ is your school bag?', options: ['colour', 'favourite', 'red'], answer: 0, ru: 'Какого цвета твой школьный рюкзак?' },
    { id: 'u05-03', unit: 'u05', type: 'choice', q: 'Tilly is nice. ___ favourite colour is pink.', options: ['Her', 'She', 'His'], answer: 0, ru: 'Тилли милая. Её любимый цвет — розовый.' },
    { id: 'u05-04', unit: 'u05', type: 'choice', q: "What colour is Suzie's school bag? ___ red.", options: ["It's", "She's", 'Her'], answer: 0, ru: 'Какого цвета рюкзак Сьюзи? Он красный.' },
    { id: 'u05-05', unit: 'u05', type: 'gap', q: 'The football is black and ___.', answers: ['white'], ru: 'Футбольный мяч чёрно-белый.' },
    { id: 'u05-06', unit: 'u05', type: 'gap', q: '___ ball is blue.', answers: ["Ted's"], ru: 'Мяч Теда синий.' },
    { id: 'u05-07', unit: 'u05', type: 'gap', q: "What's your favourite ___?", answers: ['colour'], ru: 'Какой твой любимый цвет?' },
    { id: 'u05-08', unit: 'u05', type: 'gap', q: 'Ted is a ___ dog.', answers: ['bad', 'terrible'], ru: 'Тед — плохая собака.' },
    { id: 'u05-09', unit: 'u05', type: 'order', words: ['what', 'colour', 'is', 'the', 'ball'], answers: ['What colour is the ball?'], ru: 'Какого цвета мяч?' },
    { id: 'u05-10', unit: 'u05', type: 'order', words: ["Suzie's", 'school', 'bag', 'is', 'pink'], answers: ["Suzie's school bag is pink."], ru: 'Рюкзак Сьюзи розовый.' },
    { id: 'u05-11', unit: 'u05', type: 'order', words: ['my', 'favourite', 'colour', 'is', 'green'], answers: ['My favourite colour is green.'], ru: 'Мой любимый цвет — зелёный.' },
    { id: 'u05-12', unit: 'u05', type: 'translate', ru: 'Мой любимый цвет — жёлтый.', answers: ['My favourite colour is yellow.'] },
    { id: 'u05-13', unit: 'u05', type: 'translate', ru: 'Какого цвета твоя куртка?', answers: ['What colour is your jacket?'] },
    { id: 'u05-14', unit: 'u05', type: 'translate', ru: 'Я не знаю.', answers: ["I don't know."] },

    // ───────── Unit 6 ─────────
    { id: 'u06-01', unit: 'u06', type: 'choice', q: 'Two ___ are red.', options: ['planets', 'planet', 'a planet'], answer: 0, ru: 'Две планеты красные.' },
    { id: 'u06-02', unit: 'u06', type: 'choice', q: 'The stars ___ yellow.', options: ['are', 'is', 'am'], answer: 0, ru: 'Звёзды жёлтые.' },
    { id: 'u06-03', unit: 'u06', type: 'choice', q: 'We ___ in the room.', options: ['are', 'is', 'am'], answer: 0, ru: 'Мы в комнате.' },
    { id: 'u06-04', unit: 'u06', type: 'choice', q: 'Look at the clouds! ___ are white.', options: ['They', 'It', 'He'], answer: 0, ru: 'Посмотри на облака! Они белые.' },
    { id: 'u06-05', unit: 'u06', type: 'gap', q: 'Three ___ (star) are yellow.', answers: ['stars'], ru: 'Три звезды жёлтые.' },
    { id: 'u06-06', unit: 'u06', type: 'gap', q: 'The walls ___ white.', answers: ['are'], ru: 'Стены белые.' },
    { id: 'u06-07', unit: 'u06', type: 'gap', q: 'Two ___ (cloud) are white.', answers: ['clouds'], ru: 'Два облака белые.' },
    { id: 'u06-08', unit: 'u06', type: 'gap', q: 'Two ___ (television) are big.', answers: ['televisions'], ru: 'Два телевизора большие.' },
    { id: 'u06-09', unit: 'u06', type: 'order', words: ['the', 'stars', 'are', 'beautiful'], answers: ['The stars are beautiful.'], ru: 'Звёзды прекрасные.' },
    { id: 'u06-10', unit: 'u06', type: 'order', words: ['we', 'are', 'in', 'the', 'sky'], answers: ['We are in the sky.'], ru: 'Мы в небе.' },
    { id: 'u06-11', unit: 'u06', type: 'order', words: ['they', 'are', 'my', 'friends'], answers: ['They are my friends.'], ru: 'Они мои друзья.' },
    { id: 'u06-12', unit: 'u06', type: 'translate', ru: 'Облака белые.', answers: ['The clouds are white.', 'Clouds are white.'] },
    { id: 'u06-13', unit: 'u06', type: 'translate', ru: 'Вы мои друзья.', answers: ['You are my friends.'] },
    { id: 'u06-14', unit: 'u06', type: 'translate', ru: 'Три планеты красные.', answers: ['Three planets are red.'] },
  ],
};
