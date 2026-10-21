import type { ContentBlock, Word } from '../types';

/**
 * Блок 1 книги: Starting Point, Units 1–3 и Revision 1 (SB 4–15, WB 2–9).
 * Слова — из словаря SB (стр. 92); объяснения, примеры и упражнения свои.
 */

const w =
  (unit: string) =>
  (en: string, ru: string, example?: [string, string]): Word => ({ en, ru, unit, example });

const sp = w('sp');
const u01 = w('u01');
const u02 = w('u02');
const u03 = w('u03');

export const B1: ContentBlock = {
  words: [
    // ───────── Starting Point ─────────
    sp('all', 'все; всё', ['Write all the letters.', 'Напиши все буквы.']),
    sp('alphabet', 'алфавит', ['Sing the alphabet with me.', 'Спой алфавит со мной.']),
    sp('and', 'и', ['Listen and repeat.', 'Слушай и повторяй.']),
    sp('blackboard', 'классная доска', ['The blackboard and the door.', 'Классная доска и дверь.']),
    sp('book', 'книга', ['Read the book, please.', 'Прочитай книгу, пожалуйста.']),
    sp('chair', 'стул', ['Look, the chair!', 'Смотри, стул!']),
    sp('classroom', 'класс (комната), учебная комната', [
      'In the classroom: the desk, the chair and the door.',
      'В классе: парта, стул и дверь.',
    ]),
    sp('computer', 'компьютер', ['The computer and the desk.', 'Компьютер и парта.']),
    sp('desk', 'парта; письменный стол', ['The desk, the book and the notebook.', 'Парта, книга и тетрадь.']),
    sp('door', 'дверь', ['Look, the door!', 'Смотри, дверь!']),
    sp('eight', 'восемь', ['Write the number eight.', 'Напиши число восемь.']),
    sp('eighteen', 'восемнадцать', ['Number eighteen.', 'Номер восемнадцать.']),
    sp('eleven', 'одиннадцать', ['Read: ten, eleven, twelve.', 'Читай: десять, одиннадцать, двенадцать.']),
    sp('fifteen', 'пятнадцать', ['Number fifteen, please.', 'Номер пятнадцать, пожалуйста.']),
    sp('five', 'пять', ['Number five.', 'Номер пять.']),
    sp('four', 'четыре', ['Write the number four.', 'Напиши число четыре.']),
    sp('fourteen', 'четырнадцать', ['Read from ten to fourteen.', 'Прочитай от десяти до четырнадцати.']),
    sp('from...to...', 'от... до...', ['Read from one to ten.', 'Прочитай от одного до десяти.']),
    sp('in', 'в; на (внутри чего-то)', ['Write in the notebook.', 'Пиши в тетради.']),
    sp('letter', 'буква', ['Write the letter A.', 'Напиши букву A.']),
    sp('listen', 'слушать', ['Listen, please.', 'Слушай, пожалуйста.']),
    sp('look', 'смотреть', ['Look, the teacher!', 'Смотри, учитель!']),
    sp('me', 'мне; меня; мной', ['Repeat with me, please.', 'Повторяйте со мной, пожалуйста.']),
    sp('nine', 'девять', ['Number nine.', 'Номер девять.']),
    sp('nineteen', 'девятнадцать', ['Read: eighteen, nineteen, twenty.', 'Читай: восемнадцать, девятнадцать, двадцать.']),
    sp('notebook', 'тетрадь; блокнот', ['Look, the notebook!', 'Смотри, тетрадь!']),
    sp('now', 'сейчас', ['Read now, please.', 'Читай сейчас, пожалуйста.']),
    sp('number', 'число; номер', ['Read the number.', 'Прочитай число.']),
    sp('one', 'один', ['Number one.', 'Номер один.']),
    sp('pencil case', 'пенал', ['The pencil case and the school bag.', 'Пенал и школьный рюкзак.']),
    sp('please', 'пожалуйста', ['Repeat the number, please.', 'Повтори число, пожалуйста.']),
    sp('read', 'читать', ['Read all the numbers.', 'Прочитай все числа.']),
    sp('repeat', 'повторять', ['Repeat with me.', 'Повторяй за мной.']),
    sp('school bag', 'школьный рюкзак; портфель', ['Look, the school bag!', 'Смотри, школьный рюкзак!']),
    sp('seven', 'семь', ['Number seven, please.', 'Номер семь, пожалуйста.']),
    sp('seventeen', 'семнадцать', ['Write the number seventeen.', 'Напиши число семнадцать.']),
    sp('sing', 'петь', ['Sing with me.', 'Пой со мной.']),
    sp('six', 'шесть', ['Read from one to six.', 'Прочитай от одного до шести.']),
    sp('sixteen', 'шестнадцать', ['Read: fifteen, sixteen, seventeen.', 'Читай: пятнадцать, шестнадцать, семнадцать.']),
    sp('spell', 'называть слово по буквам', ['Spell desk, please.', 'Назови слово «desk» по буквам, пожалуйста.']),
    sp('teacher', 'учитель, учительница', ['Look, the teacher!', 'Смотри, учитель!']),
    sp('ten', 'десять', ['Number ten, please.', 'Номер десять, пожалуйста.']),
    sp('the', 'определённый артикль (этот, тот самый; на русский не переводится)', [
      'The teacher, the book and the door.',
      'Учитель, книга и дверь.',
    ]),
    sp('thirteen', 'тринадцать', ['Write the number thirteen.', 'Напиши число тринадцать.']),
    sp('three', 'три', ['Read: one, two, three.', 'Читай: один, два, три.']),
    sp('twelve', 'двенадцать', ['Number twelve.', 'Номер двенадцать.']),
    sp('twenty', 'двадцать', ['Number twenty, please.', 'Номер двадцать, пожалуйста.']),
    sp('two', 'два', ['Number two, please.', 'Номер два, пожалуйста.']),
    sp('window', 'окно', ['Look, the window!', 'Смотри, окно!']),
    sp('with', 'с; вместе с', ['Read with me.', 'Читай со мной.']),
    sp('write', 'писать', ['Write the number, please.', 'Напиши число, пожалуйста.']),

    // ───────── Unit 1 · My World ─────────
    u01('am', 'есть, являюсь (форма be для I)', ['I am Sophie.', 'Я Софи.']),
    u01('are', 'есть, являешься (форма be для you)', ['You are in class 5B.', 'Ты в 5Б классе.']),
    u01('class', 'класс (группа учеников)', ["I'm in class 5B.", 'Я в 5Б классе.']),
    u01('Good morning!', 'Доброе утро!', ['Good morning, Miss Brown!', 'Доброе утро, мисс Браун!']),
    u01('Hello!', 'Здравствуйте! Привет!', ["Hello! I'm Micky.", 'Привет! Я Мики.']),
    u01('Hi!', 'Привет!', ['Hi! My name is Ben.', 'Привет! Меня зовут Бен.']),
    u01('I', 'я', ['I am in class 5B.', 'Я в 5Б классе.']),
    u01('is', 'есть, является (в My name is…, What is…)', ['My name is Sophie.', 'Меня зовут Софи.']),
    u01('Miss', 'мисс (обращение к учительнице)', ['Good morning, Miss Brown.', 'Доброе утро, мисс Браун.']),
    u01('my', 'мой, моя, моё', ['My name is Micky.', 'Меня зовут Мики.']),
    u01('My World', 'Мой мир (название раздела)', ['My World, Unit 1.', 'Мой мир, юнит 1.']),
    u01('name', 'имя; название', ['What is your name?', 'Как тебя зовут?']),
    u01('new', 'новый', ['You are new.', 'Ты новенький.']),
    u01('Nice to meet you.', 'Приятно познакомиться.', ["I'm Micky. Nice to meet you.", 'Я Мики. Приятно познакомиться.']),
    u01('pupil', 'ученик, ученица', ['You are my pupil.', 'Ты мой ученик.']),
    u01('Welcome to class 5B.', 'Добро пожаловать в 5Б класс.', ['Welcome to class 6A, Micky.', 'Добро пожаловать в 6А класс, Мики.']),
    u01('what', 'что; какой', ['What is your name?', 'Как тебя зовут?']),
    u01("What's your name?", 'Как тебя зовут?', ["Hello! What's your name?", 'Привет! Как тебя зовут?']),
    u01('you', 'ты; вы', ['You are new.', 'Ты новенький.']),
    u01('your', 'твой; ваш', ['Your name is Sophie.', 'Тебя зовут Софи.']),

    // ───────── Unit 2 · Crazy Pets ─────────
    u02('bone', 'кость', ['Look, his bone!', 'Смотри, его кость!']),
    u02('boy', 'мальчик', ['Good boy, Ted!', 'Молодец, Тед!']),
    u02('cat', 'кот, кошка', ['She is my cat.', 'Она моя кошка.']),
    u02('Crazy Pets', 'Сумасшедшие питомцы (название раздела)', ['Crazy Pets, Unit 2.', 'Сумасшедшие питомцы, юнит 2.']),
    u02('dog', 'собака', ['Ted is my dog.', 'Тед — моя собака.']),
    u02('friend', 'друг, подруга', ['She is my friend.', 'Она моя подруга.']),
    u02('girl', 'девочка', ['Good girl, Tilly!', 'Умница, Тилли!']),
    u02('good', 'хороший', ['Ted is good.', 'Тед хороший.']),
    u02('great', 'отличный, классный', ['Joe is great.', 'Джо классный.']),
    u02('he', 'он', ['He is my friend.', 'Он мой друг.']),
    u02('her', 'её (чей?)', ["Her name's Suzie.", 'Её зовут Сьюзи.']),
    u02('his', 'его (чей?)', ["His name's Joe.", 'Его зовут Джо.']),
    u02('nice', 'милый; приятный', ['Suzie is nice.', 'Сьюзи милая.']),
    u02('no', 'нет', ["No, his name's Ted.", 'Нет, его зовут Тед.']),
    u02('oh', 'о!; ох! (междометие)', ['Oh, hello, Suzie!', 'О, привет, Сьюзи!']),
    u02('oops', 'ой!; упс! (когда что-то случилось)', ['Oops! Sorry, Ted.', 'Ой! Прости, Тед.']),
    u02('parrot', 'попугай', ['Ringo is my parrot.', 'Ринго — мой попугай.']),
    u02('she', 'она', ['She is my friend.', 'Она моя подруга.']),
    u02('sorry', 'извините; прости; жаль', ['Sorry, Suzie!', 'Прости, Сьюзи!']),
    u02('too', 'тоже', ['Joe is nice. Suzie is nice too.', 'Джо милый. Сьюзи тоже милая.']),
    u02('yes', 'да', ['Yes, he is my friend.', 'Да, он мой друг.']),

    // ───────── Unit 3 · Story Time: Selest 1 ─────────
    u03('a', 'артикль «один, какой-то» (перед согласным звуком)', ['It is a pen.', 'Это ручка.']),
    u03('Aha!', 'Ага!', ['Aha! It is a stone.', 'Ага! Это камень.']),
    u03('an', 'артикль «один, какой-то» (перед гласным звуком)', ['It is an elephant.', 'Это слон.']),
    u03('animal', 'животное', ['A dog is an animal.', 'Собака — это животное.']),
    u03('birthday', 'день рождения', ['It is my birthday.', 'У меня день рождения.']),
    u03('but', 'но', ["It is a pen, but it isn't a pencil.", 'Это ручка, но не карандаш.']),
    u03('dad', 'папа', ['My dad is nice.', 'Мой папа добрый.']),
    u03('dear', 'дорогой (в обращении)', ['Dear Mum, I am happy.', 'Дорогая мама, я счастлив.']),
    u03('elephant', 'слон', ['Look at the elephant!', 'Смотри на слона!']),
    u03('fantastic', 'фантастический; потрясающий', ['Your present is fantastic.', 'Твой подарок потрясающий.']),
    u03('football', 'футбол; футбольный мяч', ['It is a football from Dad.', 'Это футбольный мяч от папы.']),
    u03('from', 'от; из', ['It is a T-shirt from Mum.', 'Это футболка от мамы.']),
    u03('happy', 'счастливый; радостный', ['I am happy.', 'Я счастлив.']),
    u03('Happy birthday!', 'С днём рождения!', ['Happy birthday, Dad!', 'С днём рождения, папа!']),
    u03('it', 'оно; это (о предмете или животном)', ['It is a present.', 'Это подарок.']),
    u03('look at', 'смотреть на', ['Look at the picture!', 'Посмотри на картинку!']),
    u03('lucky', 'счастливый; везучий', ['You are lucky!', 'Тебе повезло!']),
    u03('mum', 'мама', ['Mum is happy.', 'Мама счастлива.']),
    u03('pen', 'ручка', ['It is my pen.', 'Это моя ручка.']),
    u03('pencil', 'карандаш', ['Is it a pencil?', 'Это карандаш?']),
    u03('picture', 'картинка; картина; фотография', ['Look at the picture, Anna.', 'Посмотри на картинку, Анна.']),
    u03('present', 'подарок', ['It is a present from Uncle Tom.', 'Это подарок от дяди Тома.']),
    u03('rubber', 'ластик (брит.)', ['My rubber is from Mum.', 'Мой ластик от мамы.']),
    u03('ruler', 'линейка', ['Is it a ruler?', 'Это линейка?']),
    u03('stone', 'камень', ['It is a strange stone.', 'Это странный камень.']),
    u03('Story Time', 'Время историй (название раздела)', ['It is Story Time.', 'Время истории.']),
    u03('strange', 'странный', ['It is a strange animal.', 'Это странное животное.']),
    u03('thank you', 'спасибо', ['Thank you, Mum!', 'Спасибо, мама!']),
    u03('to', 'к; для; кому (в Happy birthday to you)', ['Happy birthday to you!', 'С днём рождения тебя!']),
    u03('T-shirt', 'футболка', ['It is my T-shirt from Dad.', 'Это моя футболка от папы.']),
    u03('uncle', 'дядя', ['Tom is my uncle.', 'Том — мой дядя.']),
    u03('What is it?', 'Что это?', ['What is it? It is a pen.', 'Что это? Это ручка.']),
    u03("You're right.", 'Ты прав(а).', ["Yes, you're right.", 'Да, ты прав.']),
  ],

  lessons: [
    // ───────── Starting Point ─────────
    {
      unit: 'sp',
      blocks: [
        {
          type: 'p',
          text: 'Starting Point — «стартовая площадка» курса. Грамматики здесь почти нет, зато есть то, на чём держится всё остальное: слова класса, команды из заданий, числа от 1 до 20 и алфавит. Выучишь это сейчас — дальше в книге не придётся гадать, что от тебя просят.',
        },
        {
          type: 'p',
          text: 'Команда в английском — это просто глагол, без «я» и «ты»: *Look.* — «Смотри.», *Listen.* — «Слушай.», *Read.* — «Читай.», *Write.* — «Пиши.», *Repeat.* — «Повторяй.». Команды легко соединяются через *and*: *Listen and repeat.* — «Слушай и повторяй.». Слово *please* делает просьбу вежливой: *Read, please.*',
        },
        {
          type: 'rule',
          title: 'Команды урока',
          rows: [
            ['Look', 'Look, the door!', 'Смотри, дверь!'],
            ['Listen', 'Listen, please.', 'Слушай, пожалуйста.'],
            ['Read', 'Read the book.', 'Прочитай книгу.'],
            ['Write', 'Write the number.', 'Напиши число.'],
            ['Repeat', 'Repeat with me.', 'Повторяй за мной.'],
            ['Listen and repeat', 'Listen and repeat, please.', 'Слушай и повторяй, пожалуйста.'],
            ['Spell', 'Spell desk, please.', 'Назови слово «desk» по буквам, пожалуйста.'],
          ],
        },
        {
          type: 'p',
          text: 'Числа 1–12 — отдельные слова, их нужно просто выучить. Числа 13–19 строятся с окончанием *-teen* («десять»): four + teen → fourteen. Но три из них меняются: *thirteen* (не threeteen), *fifteen* (не fiveteen), *eighteen* (не eightteen). Ударение в них падает на *-teen*: fourTEEN. В числе 20 ударение, наоборот, в начале: TWENty. Произношение в скобках — приблизительное, русскими буквами; точный звук послушай в карточках и на вкладке «Слух и речь». Сочетание *th* (three, thirteen) — кончик языка между зубами.',
        },
        {
          type: 'rule',
          title: 'Числа 1–20',
          rows: [
            ['1–3: one [уан], two [ту], three [сри]', 'Read: one, two, three.', 'Читай: один, два, три.'],
            ['4–6: four [фо], five [файв], six [сикс]', 'Read: four, five, six.', 'Читай: четыре, пять, шесть.'],
            ['7–9: seven [сэвн], eight [эйт], nine [найн]', 'Read: seven, eight, nine.', 'Читай: семь, восемь, девять.'],
            ['10–12: ten [тэн], eleven [илэвн], twelve [твэлв]', 'Read: ten, eleven, twelve.', 'Читай: десять, одиннадцать, двенадцать.'],
            ['13–14: thirteen [сётин], fourteen [фотин]', 'Read: thirteen, fourteen.', 'Читай: тринадцать, четырнадцать.'],
            ['15–16: fifteen [фифтин], sixteen [сикстин]', 'Read: fifteen, sixteen.', 'Читай: пятнадцать, шестнадцать.'],
            ['17–18: seventeen [сэвнтин], eighteen [эйтин]', 'Read: seventeen, eighteen.', 'Читай: семнадцать, восемнадцать.'],
            ['19–20: nineteen [найнтин], twenty [твэнти]', 'Read: nineteen, twenty.', 'Читай: девятнадцать, двадцать.'],
          ],
        },
        {
          type: 'p',
          text: 'В английском алфавите 26 букв. Название буквы почти никогда не совпадает со звуком в слове: буква *h* называется «эйч», а в слове hello читается «х». Названия нужны, когда слово произносят по буквам: *Spell desk, please.* — D – E – S – K. Удобно учить буквы группами с одним звуком в названии — так их и дают в книге. Британская буква *R* — протяжное «а», *Z* — «зэд».',
        },
        {
          type: 'rule',
          title: 'Алфавит по звукам в названиях',
          rows: [
            ['A H J K', 'A, H, J, K.', 'эй · эйч · джей · кей'],
            ['B C D E G P T V', 'B, C, D, E, G, P, T, V.', 'би · си · ди · и · джи · пи · ти · ви'],
            ['F L M N S X Z', 'F, L, M, N, S, X, Z.', 'эф · эл · эм · эн · эс · экс · зэд'],
            ['I Y', 'I, Y.', 'ай · уай'],
            ['O', 'O.', 'оу'],
            ['Q U W', 'Q, U, W.', 'кью · ю · дабл-ю'],
            ['R', 'R.', 'а (протяжно)'],
          ],
        },
        {
          type: 'examples',
          items: [
            ['Listen and repeat.', 'Слушай и повторяй.'],
            ['Read the book, please.', 'Прочитай книгу, пожалуйста.'],
            ['Look, the door and the window!', 'Смотри, дверь и окно!'],
            ['Write the number eight.', 'Напиши число восемь.'],
            ['Read from one to twenty.', 'Прочитай от одного до двадцати.'],
            ['Sing the alphabet with me.', 'Спой алфавит со мной.'],
            ['Spell desk, please.', 'Назови слово «desk» по буквам, пожалуйста.'],
            ['The teacher, the desk and the chair.', 'Учитель, парта и стул.'],
          ],
        },
        {
          type: 'note',
          text: 'Русскоязычные чаще всего путают названия букв: *I* — «ай», а *E* — «и»; *G* — «джи», а *J* — «джей»; *W* — «дабл-ю» («двойное U»), а *Y* — «уай». Выучи эти три пары отдельно: именно на них строятся упражнения с буквами в SB (упр. 14–15) и WB (упр. 6).',
        },
        {
          type: 'note',
          text: 'В числах и словах часть букв не читается: в *two* не произносится *w* (читается «ту»), в *eight* — *gh* («эйт»). Не добавляй русских звуков: *three* — не «три», а «сри» с языком между зубами.',
        },
        {
          type: 'p',
          text: 'Слова юнита: предметы в классе (book, desk, chair, door, window, computer…), команды (look, listen, read, write, repeat, spell, sing), числа от 1 до 20 и слова для разговора об алфавите.',
        },
        {
          type: 'book',
          items: [
            'SB стр. 4: упр. 1–2 — прочитай слова класса и команды вслух; упр. 3 — переведи шесть команд письменно',
            'SB стр. 5: упр. 4–8 — числа 1–12 вслух, упр. 7–8 письменно; упр. 9–10 — числа 13–20 и счёт от 20 до 1. Упр. 11–12 построены на аудио — вместо них назови числа подряд и обратно по таблице из урока',
            'SB стр. 6: упр. 13–14 — алфавит по порядку и по группам звуков; упр. 15–16 строятся на аудио — вместо них называй буквы групп и проверяй себя по таблице; упр. 17 — прочитай слова песни про алфавит вслух',
            'SB стр. 7: упр. 18 — кроссворд письменно; упр. 21–23 — запиши слова с картинок и называй их по буквам вслух (Spell …, please); Fun Time — разгадай код: каждый номер — это буква',
            'WB стр. 2: упр. 1–2 письменно. WB стр. 3: упр. 3–7 письменно (упр. 6 — буквы по группам звуков, упр. 7 — слова по таблице)',
          ],
        },
      ],
    },

    // ───────── Unit 1 ─────────
    {
      unit: 'u01',
      blocks: [
        {
          type: 'p',
          text: 'В английском предложении почти всегда нужен глагол *to be* («быть, являться»). В русском мы говорим «Я Софи», «Ты новенький» — глагола нет. По-английски нужно *I am Sophie.*, *You are new.* — буквально «я есть Софи», «ты есть новенький». В этом юните — две формы: *am* (только с *I*) и *are* (только с *you*). Форма *is* пока встречается только в готовых фразах: *My name is…*, *What is…?*',
        },
        {
          type: 'p',
          text: 'В живой речи формы сливаются: *I am → I\'m*, *you are → you\'re*, *what is → what\'s*, *name is → name\'s*. Обычно говорят сокращённо: *I\'m Micky. My name\'s Sophie.* Апостроф — это выпавшая буква.',
        },
        {
          type: 'p',
          text: '*My* («мой, моя, моё») и *your* («твой, ваш») стоят перед существительным: *my name*, *your class*. Не путай *you* («ты, вы» — кто?) и *your* («твой, ваш» — чей?). Для «ты» и «вы» в английском одно слово *you*.',
        },
        {
          type: 'rule',
          title: 'to be: I и you',
          rows: [
            ["I am / I'm", "I'm Micky.", 'Я Мики.'],
            ["you are / you're", "You're new.", 'Ты новенький.'],
            ["what is / what's", "What's your name?", 'Как тебя зовут?'],
            ["name is / name's", "My name's Sophie.", 'Меня зовут Софи.'],
          ],
        },
        {
          type: 'rule',
          title: 'Местоимения и «чей?»',
          rows: [
            ['I — я', 'I am in class 5B.', 'Я в 5Б классе.'],
            ['you — ты, вы', 'You are in class 5B.', 'Ты в 5Б классе.'],
            ['my — мой', 'My name is Sophie.', 'Меня зовут Софи.'],
            ['your — твой, ваш', 'What is your name?', 'Как тебя зовут?'],
          ],
        },
        {
          type: 'examples',
          items: [
            ['Good morning, Miss Brown!', 'Доброе утро, мисс Браун!'],
            ["Hello! I'm Micky.", 'Привет! Я Мики.'],
            ['Hi, I am Sophie.', 'Привет, я Софи.'],
            ["What's your name?", 'Как тебя зовут?'],
            ["My name's Sophie.", 'Меня зовут Софи.'],
            ['Nice to meet you.', 'Приятно познакомиться.'],
            ["You're new.", 'Ты новенький.'],
            ['I am in class 5B.', 'Я в 5Б классе.'],
            ['Welcome to class 5B!', 'Добро пожаловать в 5Б класс!'],
          ],
        },
        {
          type: 'note',
          text: '«Меня зовут Софи» нельзя перевести слово в слово («Me name…»). Англичане говорят «моё имя есть Софи»: *My name is Sophie.* Глагол *is* обязателен: *My name Sophie* — ошибка, русскоязычные часто пропускают *to be*.',
        },
        {
          type: 'note',
          text: '*Good morning* говорят только до обеда. Для «привет» на любое время подходят *Hello* (чуть вежливее) и *Hi* (проще, для друзей).',
        },
        {
          type: 'p',
          text: 'Слова юнита: приветствия и знакомство (hello, hi, good morning, nice to meet you), школа (class, pupil, Miss), имя (name, what), новый (new).',
        },
        {
          type: 'book',
          items: [
            'SB стр. 8: упр. 1 — прочитай диалог мисс Браун, Софи и Мики вслух несколько раз; потом назови своё имя по буквам, как Софи',
            'SB стр. 9: упр. 2 — соедини имена с фотографиями; упр. 3 — представься вслух (Hi, I\'m … What\'s your name?); упр. 4 — впиши I / my / your',
            'SB стр. 9: упр. 5–6 письменно — впиши \'m, \'s, \'re и перепиши предложения с полными формами; упр. 7 построено на аудио — пропусти; упр. 8 — прочитай слова песни вслух',
            'WB стр. 4: упр. 1–4 письменно (в упр. 4 вместо фото напиши о себе: My name\'s … I\'m in class …)',
          ],
        },
      ],
    },

    // ───────── Unit 2 ─────────
    {
      unit: 'u02',
      blocks: [
        {
          type: 'p',
          text: 'Для третьего лица *to be* имеет форму *is*: *he is* («он»), *she is* («она»), *it is* («оно» — о предмете или животном). *He* — мальчик, мужчина; *she* — девочка, женщина. Сокращённо: *he\'s*, *she\'s*, *it\'s*. Если у животного есть имя (Ted, Tilly), англичане говорят о нём *he* или *she*, как о человеке.',
        },
        {
          type: 'p',
          text: '*His* («его») и *her* («её») показывают, чьё это. Выбор зависит от того, кому принадлежит вещь — мальчику или девочке: *his name* — имя мальчика, *her name* — имя девочки. Родом самой вещи это не определяется.',
        },
        {
          type: 'rule',
          title: 'to be: he, she, it',
          rows: [
            ["he is / he's", "He's my friend.", 'Он мой друг.'],
            ["she is / she's", "She's nice.", 'Она милая.'],
            ["it is / it's", "It's my bone.", 'Это моя кость.'],
          ],
        },
        {
          type: 'rule',
          title: 'Чей? my, your, his, her',
          rows: [
            ['my — мой', 'My dog is nice.', 'Моя собака милая.'],
            ['your — твой', 'Your dog is nice.', 'Твоя собака милая.'],
            ['his — его', "His name's Joe.", 'Его зовут Джо.'],
            ['her — её', "Her name's Suzie.", 'Её зовут Сьюзи.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ["Hello! What's her name?", 'Привет! Как её зовут?'],
            ["Her name's Suzie.", 'Её зовут Сьюзи.'],
            ["His name's Joe.", 'Его зовут Джо.'],
            ['She is my friend.', 'Она моя подруга.'],
            ['He is great!', 'Он классный!'],
            ['Tilly is nice. She is my dog.', 'Тилли милая. Она моя собака.'],
            ['Ted is good. He is my dog.', 'Тед хороший. Он моя собака.'],
            ['Oops! Sorry, Joe!', 'Ой! Прости, Джо!'],
            ['Yes, he is my friend.', 'Да, он мой друг.'],
          ],
        },
        {
          type: 'note',
          text: 'Не путай *he / she* («он / она» — кто?) и *his / her* («его / её» — чей?). Ошибка «He name is Joe» встречается постоянно: после «его имя» нужно *his name*, а не *he name*. Проверь себя вопросом: «чей?» — *his/her*, «кто?» — *he/she*.',
        },
        {
          type: 'note',
          text: 'Русскому «её собака» подходит только *her dog* — но *her dog* означает собаку девочки, а *his dog* — собаку мальчика. Следи за владельцем, а не за словом после.',
        },
        {
          type: 'p',
          text: 'Слова юнита: питомцы (dog, cat, parrot, bone), люди (boy, girl, friend), оценки (good, great, nice), междометия (oh, oops, sorry) и слова для ответа (yes, no, too).',
        },
        {
          type: 'book',
          items: [
            'SB стр. 10: упр. 1 — прочитай комикс про Джо, Сьюзи и их собак вслух; в репликах найди he, she, his, her',
            'SB стр. 11: упр. 2 — кто есть кто; упр. 3–5 — he/she, his/her (упр. 4 — задавай вопросы и отвечай вслух: What\'s her name? Her name\'s Tilly.)',
            'SB стр. 11: упр. 6 — допиши и напиши про Теда и Сьюзи; упр. 7–8 построены на аудио — пропусти или выполни упр. 7 по картинкам; упр. 9 — нарисуй питомца и напиши: His/Her name\'s … He/She is …',
            'WB стр. 5: упр. 1–4 письменно',
          ],
        },
      ],
    },

    // ───────── Unit 3 ─────────
    {
      unit: 'u03',
      blocks: [
        {
          type: 'p',
          text: 'В английском перед существительным в единственном числе почти всегда стоит артикль. Неопределённый артикль — *a* или *an* — значит «один, какой-то»: *a pen* («какая-то ручка»). В русском артиклей нет, и переводить их не нужно. Выбор между *a* и *an* зависит от первого звука слова: перед согласным — *a* (*a pen, a ruler, a T-shirt*), перед гласным (a, e, i, o, u) — *an* (*an elephant, an animal, an uncle*).',
        },
        {
          type: 'p',
          text: 'Чтобы спросить «что это?», говорят *What is it?* Отвечают: *It\'s a pen.* Чтобы спросить «это ручка?», *is* и *it* меняются местами: *Is it a pen?* Короткий ответ — *Yes, it is.* или *No, it isn\'t.* — слово *it* и *is* повторяются, а предмет не называется.',
        },
        {
          type: 'rule',
          title: 'a / an',
          rows: [
            ['a — перед согласным звуком', 'It is a pen.', 'Это ручка.'],
            ['a — перед согласным звуком', 'It is a T-shirt.', 'Это футболка.'],
            ['an — перед гласным звуком', 'It is an elephant.', 'Это слон.'],
            ['an — перед гласным звуком', 'It is an animal.', 'Это животное.'],
            ['an — перед гласным звуком', 'Tom is an uncle.', 'Том — дядя.'],
          ],
        },
        {
          type: 'rule',
          title: 'Вопросы с it',
          rows: [
            ['What is it?', 'What is it? It\'s a stone.', 'Что это? Это камень.'],
            ['Is it …?', 'Is it a pencil?', 'Это карандаш?'],
            ['Yes, it is.', 'Is it a ruler? Yes, it is.', 'Это линейка? Да.'],
            ["No, it isn't.", "Is it a pen? No, it isn't.", 'Это ручка? Нет.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ['Happy birthday, Luke!', 'С днём рождения, Люк!'],
            ['Thank you, Anna!', 'Спасибо, Анна!'],
            ["What is it? It's a present from Mum.", 'Что это? Это подарок от мамы.'],
            ["It's a football.", 'Это футбольный мяч.'],
            ["It's an elephant!", 'Это слон!'],
            ['Is it an animal? Yes, it is.', 'Это животное? Да.'],
            ["Is it a pen? No, it isn't. It's a pencil.", 'Это ручка? Нет. Это карандаш.'],
            ['Look at the picture.', 'Посмотри на картинку.'],
            ["You're right!", 'Ты прав!'],
          ],
        },
        {
          type: 'note',
          text: 'Русскоязычные пропускают артикль: «It\'s pen.» Для английского это ошибка — нужно *It\'s a pen.* Но если перед словом стоит *my*, *your*, *his* или *her*, артикль не ставят: *my pen*, а не *a my pen*.',
        },
        {
          type: 'note',
          text: 'Смотри на первый ЗВУК слова, а не на написание. Пока все слова подчиняются простому правилу: гласная буква в начале — *an*, согласная — *a*. В коротком ответе повторяй *it is*: *Yes, it is.* — не «Yes, it.»',
        },
        {
          type: 'p',
          text: 'Слова юнита: предметы из школьного рюкзака (pen, pencil, rubber, ruler, T-shirt, football), семья (mum, dad, uncle), подарок и день рождения (present, birthday, happy, dear, thank you).',
        },
        {
          type: 'book',
          items: [
            'SB стр. 12: упр. 1 — прочитай историю про Люка, Анну и странный подарок (Selest 1) целиком, потом перечитай вслух',
            'SB стр. 13: упр. 2 — кто подарил что (по истории); упр. 3 — впиши a или an (письменно)',
            'SB стр. 13: упр. 4–5 — вопросы What is it? / Is it …? по картинкам, письменно запиши ответы; упр. 6 — верно или нет (по картинкам и истории)',
            'WB стр. 6: упр. 1–4 письменно (упр. 2 — раскрась буквы A, E, I, O, U в разные цвета и прочитай слова)',
          ],
        },
      ],
    },

    // ───────── Revision 1 ─────────
    {
      unit: 'r1',
      blocks: [
        {
          type: 'p',
          text: 'Повторение блока: Starting Point, Unit 1, Unit 2, Unit 3.',
        },
        {
          type: 'p',
          text: '*Starting Point* — числа 1–20 (13–19 оканчиваются на *-teen*, ударение на конце), алфавит (26 букв, названия групп по звукам), команды *Look, Listen, Read, Write, Repeat*.',
        },
        {
          type: 'p',
          text: '*Unit 1* — *I am / I\'m*, *you are / you\'re*, *my* и *your* перед существительным; *What\'s your name? — My name\'s …*',
        },
        {
          type: 'p',
          text: '*Unit 2* — *he is*, *she is*, *it is*; *his* («его») и *her* («её»); *What\'s her name?*',
        },
        {
          type: 'p',
          text: '*Unit 3* — артикли *a* (перед согласным звуком) и *an* (перед гласным); *What is it? — It\'s a …*; *Is it …? — Yes, it is. / No, it isn\'t.*',
        },
        {
          type: 'note',
          text: 'Чаще всего в этом блоке ошибаются в трёх местах: (1) путают *he/she* и *his/her* («He name is Joe»); (2) забывают *a/an* («It\'s pen») или ставят *a* перед гласным («a elephant»); (3) пропускают *to be* («My name Sophie») или берут не ту форму («I is», «you am»).',
        },
        {
          type: 'book',
          items: [
            'SB стр. 14: упр. 1–4 — слова в алфавитном порядке, слова по буквам, слова в школьный рюкзак (упр. 2 построено на аудио — пропусти); упр. 5 — найди рифмующиеся слова (письменно, пары a, b); упр. 6 — впиши \'m, \'s, \'re',
            'SB стр. 15: упр. 7–9 — короткие формы, he/she и his/her, a/an по группам слов; упр. 10–11 — вопросы с to be вслух (Is it a dog? — No, it isn\'t.); Fun Time — «What is it?»: соедини точки по буквам алфавита',
            'WB стр. 7: Language Diary (заполни таблицы по памяти) и Vocabulary упр. 1–3; WB стр. 8: Grammar упр. 4–6 и Use your English упр. 7',
            'WB стр. 9: «Check Yourself» (Starting Point – Unit 3) — выполни без подсказок, затем проверь себя по ответам в WB стр. 62–63',
          ],
        },
      ],
    },
  ],

  exercises: [
    // ───────── Starting Point ─────────
    { id: 'sp-01', unit: 'sp', type: 'choice', q: 'Look, the ___!', options: ['door', 'number', 'letter'], answer: 0, ru: 'Смотри, дверь!' },
    { id: 'sp-02', unit: 'sp', type: 'choice', q: '15 is ___.', options: ['fifteen', 'fourteen', 'sixteen'], answer: 0, ru: 'Число 15 — это…' },
    { id: 'sp-03', unit: 'sp', type: 'choice', q: '___ and repeat.', options: ['Listen', 'Write', 'Read'], answer: 0, ru: 'Слушай и повторяй.' },
    { id: 'sp-04', unit: 'sp', type: 'choice', q: 'Sing the ___ with me.', options: ['alphabet', 'number', 'book'], answer: 0, ru: 'Спой алфавит со мной.' },
    { id: 'sp-05', unit: 'sp', type: 'gap', q: 'Ten, nine, eight, ___, six.', answers: ['seven'], ru: 'Десять, девять, восемь, семь, шесть.' },
    { id: 'sp-06', unit: 'sp', type: 'gap', q: 'Read the numbers ___ one to twenty.', answers: ['from'], ru: 'Прочитай числа от одного до двадцати.' },
    { id: 'sp-07', unit: 'sp', type: 'gap', q: 'Write in the ___.', answers: ['notebook'], ru: 'Пиши в тетради.' },
    { id: 'sp-08', unit: 'sp', type: 'gap', q: 'Eleven, twelve, ___, fourteen.', answers: ['thirteen'], ru: 'Одиннадцать, двенадцать, тринадцать, четырнадцать.' },
    { id: 'sp-09', unit: 'sp', type: 'order', words: ['read', 'the', 'book', 'please'], answers: ['Read the book, please.', 'Please read the book.'], ru: 'Прочитай книгу, пожалуйста.' },
    { id: 'sp-10', unit: 'sp', type: 'order', words: ['listen', 'and', 'repeat', 'please'], answers: ['Listen and repeat, please.', 'Please listen and repeat.'], ru: 'Слушай и повторяй, пожалуйста.' },
    { id: 'sp-11', unit: 'sp', type: 'order', words: ['write', 'all', 'the', 'numbers'], answers: ['Write all the numbers.'], ru: 'Напиши все числа.' },
    { id: 'sp-12', unit: 'sp', type: 'translate', ru: 'Смотри, окно!', answers: ['Look, the window!', 'Look at the window!'] },
    { id: 'sp-13', unit: 'sp', type: 'translate', ru: 'Спой алфавит со мной.', answers: ['Sing the alphabet with me.'] },
    { id: 'sp-14', unit: 'sp', type: 'translate', ru: 'Напиши число восемнадцать.', answers: ['Write the number eighteen.'] },

    // ───────── Unit 1 ─────────
    { id: 'u01-01', unit: 'u01', type: 'choice', q: 'I ___ Sophie.', options: ['am', 'is', 'are'], answer: 0, ru: 'Я Софи.' },
    { id: 'u01-02', unit: 'u01', type: 'choice', q: 'You ___ new.', options: ['am', 'is', 'are'], answer: 2, ru: 'Ты новенький.' },
    { id: 'u01-03', unit: 'u01', type: 'choice', q: "What's ___ name?", options: ['your', 'you', "you're"], answer: 0, ru: 'Как тебя зовут?' },
    { id: 'u01-04', unit: 'u01', type: 'choice', q: '___ name is Micky.', options: ['My', 'I', 'Me'], answer: 0, ru: 'Меня зовут Мики.' },
    { id: 'u01-05', unit: 'u01', type: 'gap', q: 'Hello! I ___ Miss Brown.', answers: ['am'], ru: 'Здравствуйте! Я мисс Браун.' },
    { id: 'u01-06', unit: 'u01', type: 'gap', q: 'What ___ your name?', answers: ['is'], ru: 'Как тебя зовут?' },
    { id: 'u01-07', unit: 'u01', type: 'gap', q: "___ name's Sophie.", answers: ['My'], ru: 'Меня зовут Софи.' },
    { id: 'u01-08', unit: 'u01', type: 'gap', q: 'You ___ in class 5B.', answers: ['are'], ru: 'Ты в 5Б классе.' },
    { id: 'u01-09', unit: 'u01', type: 'order', words: ['my', 'name', 'is', 'Sophie'], answers: ['My name is Sophie.'], ru: 'Меня зовут Софи.' },
    { id: 'u01-10', unit: 'u01', type: 'order', words: ['what', 'is', 'your', 'name'], answers: ['What is your name?'], ru: 'Как тебя зовут?' },
    { id: 'u01-11', unit: 'u01', type: 'order', words: ['nice', 'to', 'meet', 'you'], answers: ['Nice to meet you.'], ru: 'Приятно познакомиться.' },
    { id: 'u01-12', unit: 'u01', type: 'translate', ru: 'Меня зовут Мики.', answers: ['My name is Micky.', "My name's Micky."] },
    { id: 'u01-13', unit: 'u01', type: 'translate', ru: 'Как тебя зовут?', answers: ['What is your name?'] },
    { id: 'u01-14', unit: 'u01', type: 'translate', ru: 'Доброе утро, мисс Браун!', answers: ['Good morning, Miss Brown!'] },

    // ───────── Unit 2 ─────────
    { id: 'u02-01', unit: 'u02', type: 'choice', q: "___ name's Suzie.", options: ['His', 'Her', 'He'], answer: 1, ru: 'Её зовут Сьюзи.' },
    { id: 'u02-02', unit: 'u02', type: 'choice', q: 'Joe is nice. ___ is my friend.', options: ['He', 'She', 'His'], answer: 0, ru: 'Джо милый. Он мой друг.' },
    { id: 'u02-03', unit: 'u02', type: 'choice', q: 'Tilly is my dog. ___ is nice.', options: ['He', 'She', 'Her'], answer: 1, ru: 'Тилли — моя собака. Она милая.' },
    { id: 'u02-04', unit: 'u02', type: 'choice', q: "What's ___ name? He is Ted.", options: ['his', 'her', 'he'], answer: 0, ru: 'Как его зовут? Это Тед.' },
    { id: 'u02-05', unit: 'u02', type: 'gap', q: 'Ted is nice. ___ is my dog.', answers: ['He'], ru: 'Тед милый. Он моя собака.' },
    { id: 'u02-06', unit: 'u02', type: 'gap', q: '___ name is Joe.', answers: ['His'], ru: 'Его зовут Джо.' },
    { id: 'u02-07', unit: 'u02', type: 'gap', q: "What's ___ name? Her name's Tilly.", answers: ['her'], ru: 'Как её зовут? Её зовут Тилли.' },
    { id: 'u02-08', unit: 'u02', type: 'gap', q: 'Suzie ___ my friend.', answers: ['is', "'s"], ru: 'Сьюзи — моя подруга.' },
    { id: 'u02-09', unit: 'u02', type: 'order', words: ['her', 'name', 'is', 'Tilly'], answers: ['Her name is Tilly.'], ru: 'Её зовут Тилли.' },
    { id: 'u02-10', unit: 'u02', type: 'order', words: ['he', 'is', 'my', 'friend'], answers: ['He is my friend.'], ru: 'Он мой друг.' },
    { id: 'u02-11', unit: 'u02', type: 'order', words: ['what', 'is', 'his', 'name'], answers: ['What is his name?'], ru: 'Как его зовут?' },
    { id: 'u02-12', unit: 'u02', type: 'translate', ru: 'Её зовут Сьюзи.', answers: ['Her name is Suzie.', "Her name's Suzie."] },
    { id: 'u02-13', unit: 'u02', type: 'translate', ru: 'Как его зовут?', answers: ['What is his name?'] },
    { id: 'u02-14', unit: 'u02', type: 'translate', ru: 'Тед — его собака.', answers: ['Ted is his dog.', "Ted's his dog."] },

    // ───────── Unit 3 ─────────
    { id: 'u03-01', unit: 'u03', type: 'choice', q: "It's ___ pen.", options: ['a', 'an'], answer: 0, ru: 'Это ручка.' },
    { id: 'u03-02', unit: 'u03', type: 'choice', q: "It's ___ elephant.", options: ['a', 'an'], answer: 1, ru: 'Это слон.' },
    { id: 'u03-03', unit: 'u03', type: 'choice', q: 'Is it ___ animal?', options: ['a', 'an'], answer: 1, ru: 'Это животное?' },
    { id: 'u03-04', unit: 'u03', type: 'choice', q: "Is it a pen? No, it ___. It's a pencil.", options: ["isn't", 'is', "aren't"], answer: 0, ru: 'Это ручка? Нет. Это карандаш.' },
    { id: 'u03-05', unit: 'u03', type: 'gap', q: "___ is it? It's a stone.", answers: ['What'], ru: 'Что это? Это камень.' },
    { id: 'u03-06', unit: 'u03', type: 'gap', q: "It's a present ___ Mum.", answers: ['from'], ru: 'Это подарок от мамы.' },
    { id: 'u03-07', unit: 'u03', type: 'gap', q: 'Happy ___!', answers: ['birthday'], ru: 'С днём рождения!' },
    { id: 'u03-08', unit: 'u03', type: 'gap', q: "It's ___ T-shirt from Dad.", answers: ['a'], ru: 'Это футболка от папы.' },
    { id: 'u03-09', unit: 'u03', type: 'order', words: ['it', 'is', 'an', 'elephant'], answers: ['It is an elephant.'], ru: 'Это слон.' },
    { id: 'u03-10', unit: 'u03', type: 'order', words: ['is', 'it', 'a', 'pen'], answers: ['Is it a pen?'], ru: 'Это ручка?' },
    { id: 'u03-11', unit: 'u03', type: 'order', words: ["it's", 'a', 'present', 'from', 'Dad'], answers: ["It's a present from Dad."], ru: 'Это подарок от папы.' },
    { id: 'u03-12', unit: 'u03', type: 'translate', ru: 'Это слон.', answers: ['It is an elephant.'] },
    { id: 'u03-13', unit: 'u03', type: 'translate', ru: 'Это ручка?', answers: ['Is it a pen?'] },
    { id: 'u03-14', unit: 'u03', type: 'translate', ru: 'Это подарок от мамы.', answers: ['It is a present from Mum.', 'It is a present from Mom.'] },
  ],
};
