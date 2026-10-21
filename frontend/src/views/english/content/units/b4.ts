import type { ContentBlock } from '../types';

/**
 * Блок 4 книги: Units 10–12, Revision 4, Culture Corner. Слова — из словаря SB (стр. 93),
 * всё остальное — своё. Примеры и упражнения юнита N — только на грамматике и лексике юнитов ≤ N.
 */
export const B4: ContentBlock = {
  words: [
    // Unit 10
    { en: 'Australia', ru: 'Австралия', unit: 'u10', example: ['My uncle is from Australia.', 'Мой дядя из Австралии.'] },
    { en: 'China', ru: 'Китай', unit: 'u10', example: ['Is your friend from China?', 'Твой друг из Китая?'] },
    { en: 'country, countries', ru: 'страна, страны', unit: 'u10', example: ['Russia is a big country.', 'Россия — большая страна.'] },
    { en: 'Great Britain', ru: 'Великобритания', unit: 'u10', example: ['Are they from Great Britain?', 'Они из Великобритании?'] },
    { en: 'Greece', ru: 'Греция', unit: 'u10', example: ['Tassos is from Greece.', 'Тассос из Греции.'] },
    { en: 'photo', ru: 'фотография', unit: 'u10', example: ['Look at the photo! This is my family.', 'Посмотри на фото! Это моя семья.'] },
    { en: 'Russia', ru: 'Россия', unit: 'u10', example: ["We aren't from Russia.", 'Мы не из России.'] },
    { en: 'the USA', ru: 'США', unit: 'u10', example: ['My friends are from the USA.', 'Мои друзья из США.'] },
    { en: 'Where are you from?', ru: 'Откуда ты? Откуда вы?', unit: 'u10', example: ["Where are you from? — I'm from China.", 'Откуда ты? — Я из Китая.'] },

    // Unit 11
    { en: 'body', ru: 'тело; туловище', unit: 'u11', example: ["My dog's got a long body.", 'У моей собаки длинное тело.'] },
    { en: 'Bravo!', ru: 'Браво!', unit: 'u11', example: ["Bravo, Ted! You're the winner!", 'Браво, Тед! Ты победитель!'] },
    { en: 'ear', ru: 'ухо', unit: 'u11', example: ["She's got small ears.", 'У неё маленькие уши.'] },
    { en: 'eye', ru: 'глаз', unit: 'u11', example: ["I've got brown eyes.", 'У меня карие глаза.'] },
    { en: 'fat', ru: 'толстый', unit: 'u11', example: ["The cat isn't fat.", 'Кошка не толстая.'] },
    { en: 'group', ru: 'группа', unit: 'u11', example: ['My dog is in Group A.', 'Моя собака в группе A.'] },
    { en: 'head', ru: 'голова', unit: 'u11', example: ["He's got a big head.", 'У него большая голова.'] },
    { en: 'horrible', ru: 'ужасный', unit: 'u11', example: ['This picture is horrible!', 'Эта картинка ужасная!'] },
    { en: 'judge', ru: 'судья', unit: 'u11', example: ['The judge is here today.', 'Судья сегодня здесь.'] },
    { en: 'leg', ru: 'нога', unit: 'u11', example: ["She's got long legs.", 'У неё длинные ноги.'] },
    { en: 'long', ru: 'длинный', unit: 'u11', example: ["He's got a long tail.", 'У него длинный хвост.'] },
    { en: 'mouth', ru: 'рот; пасть', unit: 'u11', example: ["My cat's got a little mouth.", 'У моей кошки маленький рот.'] },
    { en: 'nose', ru: 'нос', unit: 'u11', example: ["Ted's got a black nose.", 'У Теда чёрный нос.'] },
    { en: 'short', ru: 'короткий', unit: 'u11', example: ["The dog's tail is short.", 'Хвост собаки короткий.'] },
    { en: 'show', ru: 'шоу; выставка', unit: 'u11', example: ["It's a dog show!", 'Это выставка собак!'] },
    { en: 'tail', ru: 'хвост', unit: 'u11', example: ["My cat's got a long tail.", 'У моей кошки длинный хвост.'] },
    { en: 'thin', ru: 'худой; тонкий', unit: 'u11', example: ["The dog isn't thin. It's fat.", 'Собака не худая. Она толстая.'] },
    { en: 'This is fun!', ru: 'Как весело! Это весело!', unit: 'u11', example: ['Look at the photos! This is fun!', 'Смотри на фото! Как весело!'] },
    { en: 'tooth, teeth', ru: 'зуб, зубы', unit: 'u11', example: ["The dog's got big teeth.", 'У собаки большие зубы.'] },
    { en: 'ugly', ru: 'уродливый; некрасивый', unit: 'u11', example: ["The dog isn't ugly. It's beautiful!", 'Собака не уродливая. Она красивая!'] },
    { en: 'Well done!', ru: 'Молодец! Отлично!', unit: 'u11', example: ["You're the winner! Well done!", 'Ты победитель! Молодец!'] },
    { en: 'winner', ru: 'победитель', unit: 'u11', example: ['Tilly is the winner.', 'Тилли — победитель.'] },
    { en: 'wrong', ru: 'неправильный; неверный', unit: 'u11', example: ["No, you're wrong. It's a cat.", 'Нет, ты неправ. Это кошка.'] },

    // Unit 12
    { en: 'face', ru: 'лицо', unit: 'u12', example: ["She's got a nice face.", 'У неё приятное лицо.'] },
    { en: 'hair', ru: 'волосы', unit: 'u12', example: ["He's got long hair.", 'У него длинные волосы.'] },
    { en: 'letter', ru: 'письмо', unit: 'u12', example: ["I've got a letter from my friend.", 'У меня письмо от друга.'] },
    { en: 'of', ru: 'из; (о принадлежности и составе: «фото моей семьи»)', unit: 'u12', example: ['This is a photo of my family.', 'Это фотография моей семьи.'] },
    { en: 'or', ru: 'или', unit: 'u12', example: ['Is it a cat or a dog?', 'Это кошка или собака?'] },
    { en: 'queen', ru: 'королева', unit: 'u12', example: ["The queen's got a beautiful palace.", 'У королевы красивый дворец.'] },
    { en: 'servant', ru: 'слуга', unit: 'u12', example: ["The king's servant has got a letter.", 'У слуги короля есть письмо.'] },
    { en: 'son', ru: 'сын', unit: 'u12', example: ["The king's son is Jed.", 'Сын короля — Джед.'] },
    { en: 'super', ru: 'классный; суперский', unit: 'u12', example: ["We've got a super car!", 'У нас суперская машина!'] },
    { en: 'quick', ru: 'быстрый; быстро', unit: 'u12', example: ['Quick! Come here!', 'Быстрее! Иди сюда!'] },

    // Culture Corner
    { en: 'around', ru: 'вокруг; по', unit: 'cc1', example: ["I've got friends around the world.", 'У меня есть друзья по всему миру.'] },
    { en: 'English', ru: 'английский язык; английский', unit: 'cc1', example: ['English is my new language.', 'Английский — мой новый язык.'] },
    { en: 'horse', ru: 'лошадь', unit: 'cc1', example: ["My horse isn't tall.", 'Моя лошадь невысокая.'] },
    { en: 'India', ru: 'Индия', unit: 'cc1', example: ['India is a big country.', 'Индия — большая страна.'] },
    { en: 'kangaroo', ru: 'кенгуру', unit: 'cc1', example: ['Kangaroos are from Australia.', 'Кенгуру родом из Австралии.'] },
    { en: 'language', ru: 'язык (речь)', unit: 'cc1', example: ['English is a language.', 'Английский — это язык.'] },
    { en: 'lion', ru: 'лев', unit: 'cc1', example: ['Lions are big animals.', 'Львы — крупные животные.'] },
    { en: 'South Africa', ru: 'Южная Африка', unit: 'cc1', example: ['Is South Africa a big country?', 'Южная Африка — большая страна?'] },
    { en: 'tall', ru: 'высокий (о росте)', unit: 'cc1', example: ["My brother isn't tall.", 'Мой брат невысокий.'] },
    { en: 'world', ru: 'мир; весь мир', unit: 'cc1', example: ['Russia is a big country in the world.', 'Россия — большая страна мира.'] },
  ],

  lessons: [
    {
      unit: 'u10',
      blocks: [
        {
          type: 'p',
          text: 'В Unit 4 ты спрашивал про одного человека: *Is he from France?* Теперь — вопросы про нескольких людей: *Are we …?*, *Are you …?*, *Are they …?* Правило то же: *are* выходит на первое место. Краткий ответ повторяет местоимение: *Yes, we are.* / *No, we aren\'t.*',
        },
        {
          type: 'p',
          text: 'Какое местоимение выбрать в ответе? На *Are you and your brother from Australia?* отвечает сам спрошенный, поэтому он говорит *we* («мы с братом»). На вопрос про других людей — *Are your mum and dad from France?* — отвечаем *they*. Главный вопрос юнита — *Where are you from?* («Откуда ты?»): *from* стоит в самом конце. Ответ: *I\'m from …* или *We\'re from …*.',
        },
        {
          type: 'rule',
          title: 'to be — вопросы во множественном числе',
          rows: [
            ["Are we …? — Yes, we are. / No, we aren't.", 'Are we from Greece? — Yes, we are.', 'Мы из Греции? — Да.'],
            ["Are you …? — Yes, we are. / No, we aren't.", 'Are you and your sister from Russia? — Yes, we are.', 'Вы с сестрой из России? — Да.'],
            ["Are they …? — Yes, they are. / No, they aren't.", "Are they from China? — No, they aren't.", 'Они из Китая? — Нет.'],
          ],
        },
        {
          type: 'rule',
          title: 'Повторение: to be целиком',
          rows: [
            ["I am (I'm) — I'm not — Am I …?", "I'm from Australia.", 'Я из Австралии.'],
            ["you are (you're) — aren't — Are you …?", 'Are you from Great Britain?', 'Ты из Великобритании?'],
            ["he / she / it is (he's) — isn't — Is he …?", "She isn't from the USA.", 'Она не из США.'],
            ["we / you / they are (they're) — aren't — Are they …?", "We aren't from China.", 'Мы не из Китая.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ["Where are you from? — I'm from Russia.", 'Откуда ты? — Я из России.'],
            ['Are you and your brother from Australia? — Yes, we are.', 'Вы с братом из Австралии? — Да.'],
            ["Are your mum and dad from France? — No, they aren't.", 'Твои мама и папа из Франции? — Нет.'],
            ["Where's Pierre from? — He's from France.", 'Откуда Пьер? — Он из Франции.'],
            ["Is your teacher from Great Britain? — No, he isn't.", 'Твой учитель из Великобритании? — Нет.'],
            ["We aren't from China. We're from Greece.", 'Мы не из Китая. Мы из Греции.'],
            ['Are those children from the USA?', 'Те дети из США?'],
            ['My grandma and grandad are from Great Britain.', 'Мои бабушка и дедушка из Великобритании.'],
          ],
        },
        {
          type: 'note',
          text: 'В кратком утвердительном ответе не сокращай: *Yes, we are* и *Yes, they are*, а не *Yes, we\'re* и *Yes, they\'re*. Отрицательный ответ — наоборот, обычно краткий: *No, we aren\'t.*',
        },
        {
          type: 'note',
          text: 'По-русски «Откуда ты?» начинается с вопросительного слова. В английском *from* уходит в конец: *Where are you from?*, а не *From where are you?* И страны *Great Britain* и *the USA* пишутся с большой буквы; перед *USA* стоит *the*.',
        },
        {
          type: 'p',
          text: 'Слова юнита — страны: *Australia, China, Great Britain, Greece, Russia, the USA*; общее слово *country* (мн. ч. *countries*) и *photo* («фотография»).',
        },
        {
          type: 'book',
          items: [
            'SB стр. 34: упр. 1 — прочитай диалог мисс Браун с детьми, затем перечитай вслух по ролям; упр. 2 — соедини людей и страны (письменно).',
            'SB стр. 35: упр. 4 — спроси и ответь вслух (Where are you from, Tassos? — I\'m from …); упр. 5 — выбери we / they письменно; упр. 6 — составь вопросы по фотографиям и ответь; упр. 7 — выбери свою страну и город, спроси и ответь вслух; упр. 8 — напиши о Sophie и Micky. Упр. 3 — на слух: диска нет, пропусти.',
            'WB стр. 24: упр. 1–4 письменно.',
          ],
        },
      ],
    },
    {
      unit: 'u11',
      blocks: [
        {
          type: 'p',
          text: 'В Unit 8 ты задавал вопросы с *have got*. Теперь — утверждения и отрицания: *I have got long legs* — «У меня длинные ноги». С *I* и *you* говорим *have got*, а с *he, she, it* — *has got*. В разговоре почти всегда сокращают: *I\'ve got*, *you\'ve got*, *he\'s got*, *she\'s got*. Здесь *\'s* — это *has*, а не *is*.',
        },
        {
          type: 'p',
          text: 'Отрицание строится так: *haven\'t got* (*have not got*) для *I* и *you*, *hasn\'t got* (*has not got*) для *he, she, it*. Сейчас учим слова про части тела и внешность — идеальный материал, чтобы описывать себя и других: *I\'ve got blue eyes. He hasn\'t got a long nose.*',
        },
        {
          type: 'rule',
          title: 'have got — утверждение',
          rows: [
            ["I have got (I've got)", "I've got brown eyes.", 'У меня карие глаза.'],
            ["you have got (you've got)", "You've got a nice nose.", 'У тебя красивый нос.'],
            ["he / she / it has got (he's got)", "She's got a long tail.", 'У неё длинный хвост.'],
          ],
        },
        {
          type: 'rule',
          title: 'have got — отрицание',
          rows: [
            ["I have not got (I haven't got)", "I haven't got big ears.", 'У меня нет больших ушей.'],
            ["you have not got (you haven't got)", "You haven't got a short tail.", 'У тебя нет короткого хвоста.'],
            ["he / she / it has not got (hasn't got)", "The dog hasn't got long legs.", 'У собаки нет длинных ног.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ["I've got brown eyes.", 'У меня карие глаза.'],
            ["You've got a nice nose.", 'У тебя красивый нос.'],
            ["He's got a long tail.", 'У него длинный хвост.'],
            ["She's got a little mouth.", 'У неё маленький рот.'],
            ["The dog hasn't got long legs.", 'У собаки нет длинных ног.'],
            ["I haven't got big ears.", 'У меня нет больших ушей.'],
            ["It's got a big head and a short tail.", 'У него большая голова и короткий хвост.'],
            ["My cat hasn't got a fat body.", 'У моей кошки не толстое тело.'],
            ["Tilly's got beautiful teeth!", 'У Тилли красивые зубы!'],
          ],
        },
        {
          type: 'note',
          text: 'Русское «у меня нет …» — это *I haven\'t got …*, а не *I\'m not got* и не *I no have*. И помни: *\'s got* — это *has got*: *He\'s got a tail* значит «У него есть хвост», а не «Он есть хвост».',
        },
        {
          type: 'note',
          text: 'Слово *tooth* («зуб») во множественном числе — *teeth*, а не *tooths*. Перед одним предметом ставим *a* (*a long tail*), перед несколькими — ничего (*big ears*). И прилагательное стоит перед существительным: *a long tail*, а не *a tail long*.',
        },
        {
          type: 'p',
          text: 'Слова юнита — тело и внешность: *head, eye, ear, nose, mouth, tooth, leg, tail, body*; описания *long, short, fat, thin, ugly, horrible*; и «выставочные» слова *show, group, judge, winner* с возгласами *Bravo!* и *Well done!*.',
        },
        {
          type: 'book',
          items: [
            'SB стр. 36: упр. 1 — прочитай комикс про выставку собак, затем перечитай вслух.',
            'SB стр. 37: упр. 2 — соедини вопросы и ответы письменно; упр. 3 — подпиши части тела собаки; упр. 4 — загадай одну из трёх картинок и опиши её (I\'ve got blue eyes. I haven\'t got big ears.), пусть другой отгадает; упр. 5 — исправь предложения письменно; упр. 7 — расскажи вслух о собаках из упр. 6 (He\'s got …, He hasn\'t got …). Упр. 6 — на слух: диска нет, пропусти.',
            'WB стр. 25: упр. 1–5 письменно.',
          ],
        },
      ],
    },
    {
      unit: 'u12',
      blocks: [
        {
          type: 'p',
          text: 'Теперь *have got* во множественном числе: *we, you, they*. Форма одна — *have got* (кратко *\'ve got*): *We have got a sky car* — «У нас есть летающая машина». Отрицание — *haven\'t got*: *They haven\'t got a king* — «У них нет короля». Если подлежащее — существительное во множественном числе, глагол тот же, как и после *they*: *The Kalans have got long hair*.',
        },
        {
          type: 'p',
          text: 'Итого одно правило на всё: *has / hasn\'t* — только для *he, she, it* (и для одного существа: *the queen has got*), а для *I, you, we, they* и для нескольких существ — *have / haven\'t*. Слова юнита описывают внешность и героев истории: *face, hair, queen, servant, son, letter*; служебные *of* и *or*; а ещё *super* («классный») и *quick* («быстро»).',
        },
        {
          type: 'rule',
          title: 'have got — we, you, they',
          rows: [
            ["we have got (we've got)", "We've got a beautiful planet.", 'У нас красивая планета.'],
            ["you have got (you've got)", "You've got a super car.", 'У вас суперская машина.'],
            ["they have got (they've got)", "They've got short hair.", 'У них короткие волосы.'],
          ],
        },
        {
          type: 'rule',
          title: 'have got — отрицание, we, you, they',
          rows: [
            ["we have not got (we haven't got)", "We haven't got a servant.", 'У нас нет слуги.'],
            ["you have not got (you haven't got)", "You haven't got a sky car.", 'У вас нет скай-кара.'],
            ["they have not got (they haven't got)", "They haven't got a queen.", 'У них нет королевы.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ["We've got a beautiful planet.", 'У нас красивая планета.'],
            ['The children have got round faces.', 'У детей круглые лица.'],
            ["They've got short hair.", 'У них короткие волосы.'],
            ["We haven't got a queen, but we've got a king.", 'У нас нет королевы, но у нас есть король.'],
            ['Quick! The servant has got a letter!', 'Быстрее! У слуги письмо!'],
            ['Is it a cat or a dog?', 'Это кошка или собака?'],
            ["The queen's son isn't here.", 'Сына королевы здесь нет.'],
            ["You haven't got a sky car.", 'У вас нет скай-кара.'],
          ],
        },
        {
          type: 'note',
          text: 'После существительного во множественном числе глагол — *have*, не *has*: *The Mavrans have got …*, а не *The Mavrans has got …*. Поставь вместо существительного *they* — и сразу видно, что нужно *have*.',
        },
        {
          type: 'note',
          text: '*Hair* («волосы») по-английски — слово в единственном числе, как «борода» или «шерсть»: *His hair is long*, а не *His hair are long*. И не говори *hairs*. Ещё: *or* — «или» (*cat or dog*), *and* — «и».',
        },
        {
          type: 'book',
          items: [
            'SB стр. 38: упр. 1 — вспомни историю прошлого юнита (верно или неверно); упр. 2 — прочитай разговор Короля Сета, Люка и Мота, затем перечитай вслух по ролям.',
            'SB стр. 39: упр. 3 — ответь на шесть вопросов письменно; упр. 4 — расставь слова по порядку письменно; упр. 5 — скажи эти же предложения в кратких формах (You\'ve got …); упр. 6 — выбери слова об Hobo, собаке Джеда; упр. 8 — назови, кто мавран на картинке, и объясни почему; упр. 9 — чем каланы отличаются от мавранов (вслух); упр. 10 — напиши о каланах и мавранах. Упр. 7 — на слух: диска нет, пропусти.',
            'WB стр. 26: упр. 1–5 письменно.',
          ],
        },
      ],
    },
    {
      unit: 'r4',
      blocks: [
        {
          type: 'p',
          text: 'Повторяем три юнита: Unit 10, Unit 11 и Unit 12. Сначала прочитай напоминания, потом открывай книгу.',
        },
        {
          type: 'p',
          text: '*Unit 10 — вопросы с to be во мн. числе и страны.* *Are you / they …?* — *Yes, we are. / No, they aren\'t.* Откуда ты: *Where are you from? — I\'m from …* Страны: Australia, China, Great Britain, Greece, Russia, the USA.',
        },
        {
          type: 'p',
          text: '*Unit 11 — have got, ед. число.* *I\'ve got / you\'ve got / he\'s got* и *haven\'t got / hasn\'t got*. Слова: head, eye, ear, nose, mouth, tooth — teeth, leg, tail, body и описания long, short, fat, thin, ugly.',
        },
        {
          type: 'p',
          text: '*Unit 12 — have got, мн. число.* *We / you / they have got …* и *haven\'t got …*; *has* — только для *he, she, it*. Слова: face, hair, queen, servant, son, letter, or, of.',
        },
        {
          type: 'note',
          text: 'Чаще всего в этом блоке ошибаются на кратких ответах (*Yes, they\'re* вместо *Yes, they are*), на *has / have* у существительных во множественном числе (*The Mavrans has …*) и на *teeth* (не *tooths*). Если нужно, перечитай урок нужного юнита.',
        },
        {
          type: 'book',
          items: [
            'SB стр. 40: упр. 1 — найди шесть стран, спрятанных в змее; упр. 2 — реши кроссворд (части тела); упр. 3 — подбери противоположные по значению слова (big — little, thin — fat…); упр. 4 — произношение: прочитай вслух слова в двух группах (pink, big, is, it и green, three, tree, eat); упр. 5 и 6 — вопросы и краткие ответы с to be (Are you from Great Britain?).',
            'SB стр. 41: упр. 7 и 8 — братья, сёстры и питомцы детей (7 — на слух, без диска пропусти; 8 — расскажи по таблице вслух, как в примере с Dave); Fun Time — найди различия между картинками a и b и скажи вслух, что есть у мальчика на одной и чего нет на другой; упр. 9 — допиши слова песенки по смыслу.',
            'WB стр. 27: Language Diary — заполни таблицы to be questions and short answers и have got; Vocabulary — упр. 1–2.',
            'WB стр. 28: Grammar — упр. 3–5; Use your English — упр. 6.',
            'WB стр. 29: Check Yourself, Units 10–12 — выполни без подсказок, посчитай баллы (максимум 25), затем проверь себя по ответам в WB стр. 62–63.',
          ],
        },
      ],
    },
    {
      unit: 'cc1',
      blocks: [
        {
          type: 'p',
          text: 'Этот раздел — Culture Corner, «Английский язык в мире». Четверо детей — Том, Грант, Джейн и Мириам — рассказывают о своих странах. Все говорят по-английски, но живут в разных местах: Великобритания, Австралия, США и Южная Африка. Читай так: сначала весь текст целиком, чтобы понять общий смысл; потом ещё раз вслух; незнакомые слова добавляй в карточки. Ещё одна цель — найти в тексте ошибки, поэтому читай внимательно и сверяйся с картинками.',
        },
        {
          type: 'examples',
          items: [
            ['English is my new language.', 'Английский — мой новый язык.'],
            ['Lions are big animals.', 'Львы — крупные животные.'],
            ['India is a big country.', 'Индия — большая страна.'],
            ['Kangaroos are from Australia.', 'Кенгуру родом из Австралии.'],
            ["My horse isn't tall.", 'Моя лошадь невысокая.'],
            ["I've got friends around the world.", 'У меня есть друзья по всему миру.'],
          ],
        },
        {
          type: 'book',
          items: [
            'SB стр. 42: упр. 1 и 2 — на слух (диска нет — пропусти); упр. 3 (Reading) — прочитай четыре рассказа детей, подчеркни восемь ошибок (сверяй текст с картинками), перечитай вслух.',
            'SB стр. 43: упр. 4 (Speaking) — составь шесть вопросов о Tom, Grant, Jane и Miriam и ответь на них (Is Tom from Australia? — No, he isn\'t); упр. 5 (Writing) — напиши о Ramesh по образцу из упр. 3; Project — по желанию: плакат о себе и своей стране.',
            'WB стр. 30 (Skills Corner 2, Reading): упр. 1 — прочитай про брата и сестру Сэма и дополни картинки (наклеек из конца книги может не быть — нарисуй сам); упр. 2 — прочитай про дядю Генри и отметь верную картинку.',
            'WB стр. 31 (Writing): упр. 3 — напиши о маме и папе Сэма по образцу; упр. 4 — перепиши абзац, исправив ошибки; упр. 5 — напиши о дедушке Сэма по картинке и словам из рамки.',
          ],
        },
      ],
    },
  ],

  exercises: [
    // Unit 10
    { id: 'u10-01', unit: 'u10', type: 'choice', q: "Are they from China? — No, they ___.", options: ["aren't", "isn't", "haven't"], answer: 0, ru: 'Они из Китая? — Нет.' },
    { id: 'u10-02', unit: 'u10', type: 'choice', q: 'Are you and your brother from Russia? — Yes, ___ are.', options: ['we', 'you', 'they'], answer: 0, ru: 'Вы с братом из России? — Да.' },
    { id: 'u10-03', unit: 'u10', type: 'choice', q: 'Where ___ your grandma from?', options: ['is', 'are', 'am'], answer: 0, ru: 'Откуда твоя бабушка?' },
    { id: 'u10-04', unit: 'u10', type: 'choice', q: 'Are your mum and dad from France? — Yes, ___ are.', options: ['they', 'we', 'you'], answer: 0, ru: 'Твои мама и папа из Франции? — Да.' },
    { id: 'u10-05', unit: 'u10', type: 'gap', q: '___ your friends from the USA?', answers: ['Are'], ru: 'Твои друзья из США?' },
    { id: 'u10-06', unit: 'u10', type: 'gap', q: 'Is Natasha from Russia? — Yes, she ___.', answers: ['is'], ru: 'Наташа из России? — Да.' },
    { id: 'u10-07', unit: 'u10', type: 'gap', q: "We ___ from Great Britain. We're from Australia.", answers: ["aren't"], ru: 'Мы не из Великобритании. Мы из Австралии.' },
    { id: 'u10-08', unit: 'u10', type: 'gap', q: 'Where are you ___?', answers: ['from'], ru: 'Откуда ты?' },
    { id: 'u10-09', unit: 'u10', type: 'order', words: ['where', 'are', 'you', 'from'], answers: ['Where are you from?'], ru: 'Откуда ты?' },
    { id: 'u10-10', unit: 'u10', type: 'order', words: ['are', 'they', 'from', 'the', 'USA'], answers: ['Are they from the USA?'], ru: 'Они из США?' },
    { id: 'u10-11', unit: 'u10', type: 'order', words: ['my', 'grandma', "isn't", 'from', 'China'], answers: ["My grandma isn't from China."], ru: 'Моя бабушка не из Китая.' },
    { id: 'u10-12', unit: 'u10', type: 'translate', ru: 'Вы из Греции?', answers: ['Are you from Greece?'] },
    { id: 'u10-13', unit: 'u10', type: 'translate', ru: 'Мы не из России. Мы из Китая.', answers: ["We aren't from Russia. We're from China."] },
    {
      id: 'u10-14',
      unit: 'u10',
      type: 'translate',
      ru: 'Твои мама и папа из Австралии? — Нет.',
      answers: ["Are your mum and dad from Australia? No, they aren't.", "Are your mother and father from Australia? No, they aren't."],
    },

    // Unit 11
    { id: 'u11-01', unit: 'u11', type: 'choice', q: 'I ___ got a long tail.', options: ['have', 'has', 'am'], answer: 0, ru: 'У меня длинный хвост.' },
    { id: 'u11-02', unit: 'u11', type: 'choice', q: 'She ___ got a short tail.', options: ['has', 'have', 'is'], answer: 0, ru: 'У неё короткий хвост.' },
    { id: 'u11-03', unit: 'u11', type: 'choice', q: 'He ___ got a nice nose.', options: ["hasn't", "haven't", "isn't"], answer: 0, ru: 'У него нет красивого носа.' },
    { id: 'u11-04', unit: 'u11', type: 'choice', q: "Tilly's got beautiful ___.", options: ['teeth', 'tooth', 'tooths'], answer: 0, ru: 'У Тилли красивые зубы.' },
    { id: 'u11-05', unit: 'u11', type: 'gap', q: 'I ___ got long legs.', answers: ["haven't"], ru: 'У меня нет длинных ног.' },
    { id: 'u11-06', unit: 'u11', type: 'gap', q: 'My dog ___ got a very long tail.', answers: ['has'], ru: 'У моей собаки очень длинный хвост.' },
    { id: 'u11-07', unit: 'u11', type: 'gap', q: 'You ___ got a nice nose.', answers: ['have'], ru: 'У тебя красивый нос.' },
    { id: 'u11-08', unit: 'u11', type: 'gap', q: "Tilly's got big ___. (ear)", answers: ['ears'], ru: 'У Тилли большие уши.' },
    { id: 'u11-09', unit: 'u11', type: 'order', words: ["she's", 'got', 'a', 'big', 'head'], answers: ["She's got a big head."], ru: 'У неё большая голова.' },
    { id: 'u11-10', unit: 'u11', type: 'order', words: ['I', "haven't", 'got', 'a', 'short', 'tail'], answers: ["I haven't got a short tail."], ru: 'У меня нет короткого хвоста.' },
    { id: 'u11-11', unit: 'u11', type: 'order', words: ['the', "dog's", 'got', 'very', 'big', 'ears'], answers: ["The dog's got very big ears."], ru: 'У собаки очень большие уши.' },
    { id: 'u11-12', unit: 'u11', type: 'translate', ru: 'У меня большая голова.', answers: ["I've got a big head."] },
    { id: 'u11-13', unit: 'u11', type: 'translate', ru: 'У неё нет длинных ног.', answers: ["She hasn't got long legs."] },
    {
      id: 'u11-14',
      unit: 'u11',
      type: 'translate',
      ru: 'У моей кошки длинный хвост и маленький нос.',
      answers: ["My cat's got a long tail and a little nose.", "My cat's got a long tail and a small nose."],
    },

    // Unit 12
    { id: 'u12-01', unit: 'u12', type: 'choice', q: 'We ___ got a beautiful palace.', options: ['have', 'has', 'are'], answer: 0, ru: 'У нас красивый дворец.' },
    { id: 'u12-02', unit: 'u12', type: 'choice', q: 'The Kalans ___ got long hair.', options: ['have', 'has', "haven't"], answer: 0, ru: 'У каланов длинные волосы.' },
    { id: 'u12-03', unit: 'u12', type: 'choice', q: 'They ___ got a queen.', options: ["haven't", "hasn't", "aren't"], answer: 0, ru: 'У них нет королевы.' },
    { id: 'u12-04', unit: 'u12', type: 'choice', q: 'Is it a cat ___ a dog?', options: ['or', 'of', 'and'], answer: 0, ru: 'Это кошка или собака?' },
    { id: 'u12-05', unit: 'u12', type: 'gap', q: 'Mum and Dad ___ got a super car.', answers: ['have'], ru: 'У мамы и папы суперская машина.' },
    { id: 'u12-06', unit: 'u12', type: 'gap', q: 'The queen ___ got a servant.', answers: ['has'], ru: 'У королевы есть слуга.' },
    { id: 'u12-07', unit: 'u12', type: 'gap', q: 'We ___ got big ears.', answers: ["haven't"], ru: 'У нас нет больших ушей.' },
    { id: 'u12-08', unit: 'u12', type: 'gap', q: 'Quick! The servant has got a ___.', answers: ['letter'], ru: 'Быстрее! У слуги письмо.' },
    { id: 'u12-09', unit: 'u12', type: 'order', words: ["we've", 'got', 'a', 'super', 'sky', 'car'], answers: ["We've got a super sky car."], ru: 'У нас есть суперский скай-кар.' },
    { id: 'u12-10', unit: 'u12', type: 'order', words: ['the', "queen's", 'son', "hasn't", 'got', 'brown', 'hair'], answers: ["The queen's son hasn't got brown hair."], ru: 'У сына королевы нет каштановых волос.' },
    { id: 'u12-11', unit: 'u12', type: 'order', words: ['they', "haven't", 'got', 'a', 'king', 'or', 'a', 'queen'], answers: ["They haven't got a king or a queen."], ru: 'У них нет ни короля, ни королевы.' },
    { id: 'u12-12', unit: 'u12', type: 'translate', ru: 'У нас есть письмо.', answers: ["We've got a letter."] },
    {
      id: 'u12-13',
      unit: 'u12',
      type: 'translate',
      ru: 'У каланов длинные волосы и красивые лица.',
      answers: ['The Kalans have got long hair and beautiful faces.', "The Kalans have got long hair and nice faces."],
    },
    { id: 'u12-14', unit: 'u12', type: 'translate', ru: 'У нас нет слуги.', answers: ["We haven't got a servant."] },
  ],
};
