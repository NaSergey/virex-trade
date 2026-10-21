import type { ContentBlock } from '../types';

/**
 * Блок 3 книги: Units 7–9, Revision 3. Слова — из словаря SB (стр. 93), всё остальное — своё.
 * Примеры и упражнения юнита N — только на грамматике и лексике юнитов ≤ N.
 */
export const B3: ContentBlock = {
  words: [
    // Unit 7
    { en: 'brother', ru: 'брат', unit: 'u07', example: ["Adam is Sophie's brother.", 'Адам — брат Софи.'] },
    { en: 'family', ru: 'семья', unit: 'u07', example: ['This is my family.', 'Это моя семья.'] },
    { en: 'father', ru: 'отец', unit: 'u07', example: ['My father is a teacher.', 'Мой отец — учитель.'] },
    { en: 'France', ru: 'Франция', unit: 'u07', example: ['Sophie is from France.', 'Софи из Франции.'] },
    { en: 'grandma', ru: 'бабушка (разговорное)', unit: 'u07', example: ['My grandma is very nice.', 'Моя бабушка очень добрая.'] },
    { en: 'grandad', ru: 'дедушка (разговорное)', unit: 'u07', example: ['My grandad is in France.', 'Мой дедушка во Франции.'] },
    { en: 'grandfather', ru: 'дедушка', unit: 'u07', example: ['Her grandfather is old.', 'Её дедушка пожилой.'] },
    { en: 'grandmother', ru: 'бабушка', unit: 'u07', example: ['His grandmother is a teacher.', 'Его бабушка — учитель.'] },
    { en: 'here', ru: 'здесь; сюда', unit: 'u07', example: ["Tilly isn't here.", 'Тилли здесь нет.'] },
    { en: 'kitten', ru: 'котёнок', unit: 'u07', example: ['My kitten is little.', 'Мой котёнок маленький.'] },
    { en: 'little', ru: 'маленький', unit: 'u07', example: ['She is a little girl.', 'Она маленькая девочка.'] },
    { en: 'mother', ru: 'мать, мама', unit: 'u07', example: ['My mother is here.', 'Моя мама здесь.'] },
    { en: 'OK!', ru: 'Хорошо! Ладно!', unit: 'u07', example: ["OK! I'm here.", 'Хорошо! Я здесь.'] },
    { en: 'old', ru: 'старый; пожилой', unit: 'u07', example: ['My dog is very old.', 'Моя собака очень старая.'] },
    { en: 'on holiday', ru: 'в отпуске; на каникулах', unit: 'u07', example: ['My uncle is on holiday.', 'Мой дядя в отпуске.'] },
    { en: 'sister', ru: 'сестра', unit: 'u07', example: ['My sister is six.', 'Моей сестре шесть лет.'] },
    { en: 'this is...', ru: 'это ... (когда представляют кого-то или показывают)', unit: 'u07', example: ['This is my friend, Adam.', 'Это мой друг Адам.'] },
    { en: 'who', ru: 'кто', unit: 'u07', example: ['Who is your teacher?', 'Кто твой учитель?'] },
    { en: "Who's this?", ru: 'Кто это?', unit: 'u07', example: ["Who's this? — It's my uncle.", 'Кто это? — Это мой дядя.'] },

    // Unit 8
    { en: 'basket', ru: 'корзина', unit: 'u08', example: ['Is the bone in the basket?', 'Кость в корзине?'] },
    { en: 'behind', ru: 'за; позади', unit: 'u08', example: ['Is the cat behind the door?', 'Кошка за дверью?'] },
    { en: 'has got', ru: 'у него (у неё) есть', unit: 'u08', example: ['Has she got a brother?', 'У неё есть брат?'] },
    { en: 'have got', ru: 'у меня (у тебя, у нас) есть', unit: 'u08', example: ['Have you got a pencil case?', 'У тебя есть пенал?'] },
    { en: 'next to', ru: 'рядом с', unit: 'u08', example: ['Is the ruler next to the book?', 'Линейка рядом с книгой?'] },
    { en: 'Ouch!', ru: 'Ой! Ай! (от боли)', unit: 'u08', example: ['Ouch! Is it a stone?', 'Ой! Это камень?'] },
    { en: 'skateboard', ru: 'скейтборд', unit: 'u08', example: ['Have you got a skateboard?', 'У тебя есть скейтборд?'] },
    { en: 'under', ru: 'под', unit: 'u08', example: ['Is the ball under the chair?', 'Мяч под стулом?'] },
    { en: 'where', ru: 'где; куда', unit: 'u08', example: ['Where is my school bag?', 'Где моя школьная сумка?'] },

    // Unit 9
    { en: 'bus, buses', ru: 'автобус, автобусы', unit: 'u09', example: ['The buses are big.', 'Автобусы большие.'] },
    { en: 'car', ru: 'машина, автомобиль', unit: 'u09', example: ["That is my father's car.", 'Это машина моего отца.'] },
    { en: 'child, children', ru: 'ребёнок, дети', unit: 'u09', example: ['The children are in the classroom.', 'Дети в классе.'] },
    { en: 'Earth', ru: 'Земля (планета)', unit: 'u09', example: ['Earth is a planet.', 'Земля — планета.'] },
    { en: 'flower', ru: 'цветок', unit: 'u09', example: ['This flower is red.', 'Этот цветок красный.'] },
    { en: 'helmet', ru: 'шлем', unit: 'u09', example: ['These are helmets.', 'Это шлемы.'] },
    { en: 'house', ru: 'дом', unit: 'u09', example: ['That house is big.', 'Тот дом большой.'] },
    { en: 'king', ru: 'король', unit: 'u09', example: ['The king is old.', 'Король старый.'] },
    { en: 'mountain', ru: 'гора', unit: 'u09', example: ['That mountain is very big.', 'Та гора очень большая.'] },
    { en: 'meet', ru: 'встречать(ся); знакомиться', unit: 'u09', example: ['Nice to meet you, Sophie!', 'Приятно познакомиться, Софи!'] },
    { en: 'palace', ru: 'дворец', unit: 'u09', example: ["That is the king's palace.", 'Это дворец короля.'] },
    { en: 'person, people', ru: 'человек, люди', unit: 'u09', example: ['My teacher is a very nice person.', 'Мой учитель — очень хороший человек.'] },
    { en: 'road', ru: 'дорога', unit: 'u09', example: ['The roads are empty.', 'Дороги пустые.'] },
    { en: 'round', ru: 'круглый', unit: 'u09', example: ['The house is round.', 'Дом круглый.'] },
    { en: 'tree', ru: 'дерево', unit: 'u09', example: ['The cat is under the tree.', 'Кошка под деревом.'] },
    { en: 'these', ru: 'эти (рядом)', unit: 'u09', example: ['These are my pens.', 'Это мои ручки.'] },
    { en: 'those', ru: 'те (вдалеке)', unit: 'u09', example: ['Those are my friends.', 'Вон те — мои друзья.'] },
    { en: 'that', ru: 'тот, та, то; это там (вдалеке)', unit: 'u09', example: ["What's that?", 'Что это там?'] },
    { en: 'this', ru: 'этот, эта, это (рядом)', unit: 'u09', example: ["What's this?", 'Что это?'] },
  ],

  lessons: [
    {
      unit: 'u07',
      blocks: [
        {
          type: 'p',
          text: 'В этом юните ты учишь *отрицание* с глаголом *to be*. Чтобы сказать «не», ставь слово *not* сразу после *am / is / are*: *He is not my brother* — «Он не мой брат». В живой речи почти всегда говорят кратко: *isn\'t* вместо *is not* и *aren\'t* вместо *are not*. У *I am* краткая форма только одна: *I\'m not*.',
        },
        {
          type: 'p',
          text: 'Второе — слово *this* («этот, эта, это» — то, что рядом с тобой). *This is my mum* — «Это моя мама»: так представляют людей и показывают фотографии. Спросить «Кто это?» можно так: *Who\'s this?* (*who* значит «кто»).',
        },
        {
          type: 'rule',
          title: 'to be — отрицание',
          rows: [
            ["I am not (I'm not)", "I'm not a teacher.", 'Я не учитель.'],
            ["you are not (you aren't)", "You aren't my brother.", 'Ты мне не брат.'],
            ["he is not (he isn't)", "He isn't old.", 'Он не старый.'],
            ["she is not (she isn't)", "She isn't here.", 'Её здесь нет.'],
            ["it is not (it isn't)", "It isn't a cat.", 'Это не кошка.'],
            ["we are not (we aren't)", "We aren't in France.", 'Мы не во Франции.'],
            ["they are not (they aren't)", "They aren't on holiday.", 'Они не в отпуске.'],
          ],
        },
        {
          type: 'rule',
          title: 'this — представляем и показываем',
          rows: [
            ['This is …', 'This is my father.', 'Это мой отец.'],
            ["Who's this?", "Who's this? — It's my grandma.", 'Кто это? — Это моя бабушка.'],
            ["This isn't …", "This isn't my brother.", 'Это не мой брат.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ['This is my family.', 'Это моя семья.'],
            ["Who's this? — It's my grandfather.", 'Кто это? — Это мой дедушка.'],
            ["He isn't my brother. He's my friend.", 'Он не мой брат. Он мой друг.'],
            ["We aren't on holiday today.", 'Сегодня мы не в отпуске.'],
            ["My grandmother isn't old.", 'Моя бабушка не старая.'],
            ["I'm not little!", 'Я не маленький!'],
            ["This is my little sister. She's six.", 'Это моя маленькая сестра. Ей шесть.'],
            ["Mum and Dad aren't here.", 'Мамы и папы здесь нет.'],
          ],
        },
        {
          type: 'note',
          text: 'По-русски в таком предложении глагола нет: «Он не мой брат». По-английски *to be* обязателен, а *not* стоит после него: *He isn\'t my brother*, а не *He not my brother*.',
        },
        {
          type: 'note',
          text: 'С *I* краткая форма только *I\'m not*. Форм *I amn\'t* и *I aren\'t* в английском нет — не придумывай их по аналогии с *isn\'t* и *aren\'t*.',
        },
        {
          type: 'p',
          text: 'Слова юнита — семья: *mother, father, brother, sister, grandmother, grandfather*. Для бабушки и дедушки есть ещё разговорные *grandma* и *grandad* — их говорят чаще. Ещё запомни *little* («маленький»), *old*, *kitten*, *on holiday* («в отпуске, на каникулах») и *here* («здесь»).',
        },
        {
          type: 'book',
          items: [
            'SB стр. 26: упр. 1 — прочитай диалог Софи и Мики, затем перечитай вслух по ролям; упр. 2 — отметь, какие утверждения верны, а какие нет (письменно).',
            'SB стр. 27: упр. 3 — подпиши семейное дерево и повтори слова вслух; упр. 6 — исправь предложения (письменно); упр. 7 — прочитай описания и ответь на вопрос Who\'s this?; упр. 5 — задай такой же вопрос по фотографиям из упр. 4. Упр. 4 и 8 — на слух: диска нет, пропусти их или в упр. 8 допиши слова песенки по смыслу.',
            'WB стр. 18: упр. 1–5 письменно.',
          ],
        },
      ],
    },
    {
      unit: 'u08',
      blocks: [
        {
          type: 'p',
          text: 'Новая конструкция — *have got* («у меня есть …»). По-русски мы говорим «У тебя есть собака?», а по-английски владелец — подлежащее: *Have you got a dog?* — буквально «Ты имеешь собаку?». Вопрос строится перестановкой: *have / has* выходит на первое место, а *got* остаётся после подлежащего. С *he, she, it* вместо *have* ставят *has*.',
        },
        {
          type: 'p',
          text: 'Краткий ответ — без *got*: *Yes, I have.* / *No, I haven\'t.* Про третье лицо: *Yes, she has.* / *No, he hasn\'t.* Вторая часть юнита — предлоги места. Спрашиваем *Where is …?* (*Where\'s …?*), отвечаем: *in* — «в», *on* — «на», *under* — «под», *behind* — «за, позади», *next to* — «рядом с».',
        },
        {
          type: 'rule',
          title: 'have got — вопросы и краткие ответы',
          rows: [
            ["Have I got …? / Have you got …?", 'Have you got a dog? — Yes, I have.', 'У тебя есть собака? — Да, есть.'],
            ["Has he got …? — Yes, he has. / No, he hasn't.", "Has he got a skateboard? — No, he hasn't.", 'У него есть скейтборд? — Нет.'],
            ["Has she got …? — Yes, she has. / No, she hasn't.", 'Has she got a computer? — Yes, she has.', 'У неё есть компьютер? — Да.'],
            ["Has it got …? — Yes, it has. / No, it hasn't.", "Has the cat got a basket? — No, it hasn't.", 'У кошки есть корзина? — Нет.'],
          ],
        },
        {
          type: 'rule',
          title: 'Предлоги места',
          rows: [
            ['in', 'The pen is in the school bag.', 'Ручка в школьной сумке.'],
            ['on', 'The book is on the desk.', 'Книга на парте.'],
            ['under', 'The ball is under the chair.', 'Мяч под стулом.'],
            ['behind', 'The cat is behind the door.', 'Кошка за дверью.'],
            ['next to', 'The pencil is next to the ruler.', 'Карандаш рядом с линейкой.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ['Have you got a pencil? — Yes, I have.', 'У тебя есть карандаш? — Да, есть.'],
            ["Has Ted got a brother? — No, he hasn't.", 'У Теда есть брат? — Нет.'],
            ['Has she got a skateboard? — Yes, she has.', 'У неё есть скейтборд? — Да.'],
            ["Where's my school bag? — It's under the desk.", 'Где моя школьная сумка? — Под партой.'],
            ["Is the cat in the basket? — No, it isn't. It's behind the door.", 'Кошка в корзине? — Нет. Она за дверью.'],
            ['Has your teacher got a computer?', 'У твоего учителя есть компьютер?'],
            ["Where's the bone? Is it next to the basket?", 'Где кость? Она рядом с корзиной?'],
            ['Have you got a friend in France?', 'У тебя есть друг во Франции?'],
          ],
        },
        {
          type: 'note',
          text: 'Не копируй русское «У тебя есть …?» дословно и не ставь *have* после подлежащего: правильно *Have you got …?*, а не *You have got …?* в вопросе. И короткий ответ — *Yes, I have*, без *got* на конце.',
        },
        {
          type: 'note',
          text: 'Про *he / she / it* всегда *has / hasn\'t*: *Yes, he has*, а не *Yes, he have*. И не теряй *to* в *next to*: *next to the book* («рядом с книгой»), а не *next the book*.',
        },
        {
          type: 'p',
          text: 'Слова юнита: *basket, skateboard*, предлоги *behind, under, next to*, вопросительное *where* и восклицание *Ouch!* («Ай!» — когда больно).',
        },
        {
          type: 'book',
          items: [
            'SB стр. 28: упр. 1 — прочитай шесть кадров про поиски кости, перечитай вслух по ролям (Ted, Tilly, Suzie, Joe).',
            'SB стр. 29: упр. 2 — ответь на пять вопросов письменно; упр. 3 и 4 — вопросы и ответы вслух (с партнёром или вдвоём с собой: сначала спроси, потом ответь); упр. 5 — вставь have / haven\'t / has / hasn\'t письменно; упр. 6 — соедини предлог с мисками на картинке; упр. 8 — напиши, где что лежит в твоей комнате. Упр. 7 — на слух: диска нет, пропусти.',
            'WB стр. 19: упр. 1–4 письменно.',
          ],
        },
      ],
    },
    {
      unit: 'u09',
      blocks: [
        {
          type: 'p',
          text: 'Чтобы показать на предмет и спросить «Что это?», в английском четыре слова: *this* и *these* — для близких предметов (рядом, в руке), *that* и *those* — для далёких (вон там). Одно число — *this / that*, много — *these / those*. Вопрос и ответ: *What\'s this? — It\'s a flower.* / *What are these? — They\'re flowers.*',
        },
        {
          type: 'p',
          text: 'В ответе вместо *this* ставят *it* (один предмет) или *they* (несколько). Заодно повторяем множественное число. Большинство слов получает *-s* (*car → cars*), слова на *-s* получают *-es* (*bus → buses*), а два слова юнита особенные: *child → children* и *person → people* (*people* — уже множественное число, без *-s*).',
        },
        {
          type: 'rule',
          title: 'this / that / these / those',
          rows: [
            ['this — один предмет рядом', "What's this? — It's a tree.", 'Что это? — Это дерево.'],
            ['that — один предмет вдалеке', "What's that? — It's a mountain.", 'Что это там? — Это гора.'],
            ['these — несколько рядом', "What are these? — They're flowers.", 'Что это? — Это цветы.'],
            ['those — несколько вдалеке', "What are those? — They're buses.", 'Что это там? — Это автобусы.'],
          ],
        },
        {
          type: 'rule',
          title: 'Особые множественные формы',
          rows: [
            ['bus → buses', 'The bus is big. The buses are big.', 'Автобус большой. Автобусы большие.'],
            ['child → children', 'This is a child. These are children.', 'Это ребёнок. Это дети.'],
            ['person → people', 'He is a person. They are people.', 'Он человек. Они люди.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ["What's this? — It's a flower.", 'Что это? — Это цветок.'],
            ["What's that? — It's a mountain.", 'Что это там? — Это гора.'],
            ["What are these? — They're helmets.", 'Что это? — Это шлемы.'],
            ["What are those? — They're houses.", 'Что это там? — Это дома.'],
            ["The king isn't here. He's in the palace.", 'Короля здесь нет. Он во дворце.'],
            ['Those children are my friends.', 'Те дети — мои друзья.'],
            ['These roads are empty.', 'Эти дороги пустые.'],
            ["Those aren't cars. They're buses.", 'Те — не машины. Это автобусы.'],
          ],
        },
        {
          type: 'note',
          text: 'По-русски «это» одинаково для одного и многих: «Это стол», «Это столы». По-английски нужно выбирать: *This is a book*, но *These are books* — а не *This are books* или *These is a book*.',
        },
        {
          type: 'note',
          text: 'Не говори *childs* и *persons*: правильно *children* и *people*. И не путай ближнее с дальним: *this / these* — рядом с тобой, *that / those* — вдалеке.',
        },
        {
          type: 'p',
          text: 'Слова юнита — про путешествие на планету Селест: *bus, car, road, house, palace, mountain, tree, flower, helmet, king*, а также *Earth* (Земля), *round* («круглый»), *meet* («знакомиться») и *person, people*.',
        },
        {
          type: 'book',
          items: [
            'SB стр. 30: упр. 1 — вспомни историю из прошлого юнита и допиши слова письменно; упр. 2 — прочитай диалог Мота, Люка и Анны, затем перечитай вслух по ролям.',
            'SB стр. 31: упр. 3 — выбери верные слова письменно; упр. 4 — вставь this / that / these / those и ответь письменно; упр. 5 — задай вопросы по картинке вслух (What are these?), потом ответь; упр. 6 — те же вопросы про предметы в твоём классе.',
            'WB стр. 20: упр. 1–4 письменно.',
          ],
        },
      ],
    },
    {
      unit: 'r3',
      blocks: [
        {
          type: 'p',
          text: 'Повторяем три юнита подряд: Unit 7, Unit 8 и Unit 9. Прочитай напоминания и только потом открывай книгу.',
        },
        {
          type: 'p',
          text: '*Unit 7 — to be, отрицание, семья.* *Not* стоит после *am / is / are*: *isn\'t*, *aren\'t*, но только *I\'m not*. *This is …* — когда представляем и показываем. Слова: mother, father, brother, sister, grandmother, grandfather, kitten, on holiday.',
        },
        {
          type: 'p',
          text: '*Unit 8 — have got и предлоги места.* Вопросы: *Have you got …?*, *Has he / she got …?*; краткий ответ без *got*: *Yes, I have.* / *No, she hasn\'t.* Где что лежит: *in, on, under, behind, next to*.',
        },
        {
          type: 'p',
          text: '*Unit 9 — this / that / these / those.* *this / these* — близко, *that / those* — далеко; на *What\'s this?* отвечаем *It\'s …*, на *What are these?* — *They\'re …*. Множественное число: *bus → buses*, *child → children*, *person → people*.',
        },
        {
          type: 'note',
          text: 'Чаще всего в этом блоке ошибаются так: пропускают глагол (*He not my brother* вместо *He isn\'t my brother*), говорят *Yes, he have* вместо *Yes, he has* и путают *This are* / *These is*. Перед проверкой пробегись глазами по этим трём случаям.',
        },
        {
          type: 'book',
          items: [
            'SB стр. 32: упр. 1 — найди в сетке слова про семью; упр. 2 — найди лишнее слово в каждой строке; упр. 3 — спрашивай и отвечай по картинкам (Where\'s Tilly?); упр. 4 — произношение: прочитай вслух мини-диалоги Who\'s that? — My mother.; упр. 5 — исправь предложения о семье Дженни письменно.',
            'SB стр. 33: упр. 6 — вопросы и краткие ответы с have got (без диска составь их сам по таблице); упр. 7 и 8 — вопросы и ответы вслух о домашних животных; упр. 9 — this / that / these / those по картинке; Fun Time — нарисуй дом, горы, деревья, цветы и собаку по описанию и сравни рисунок с текстом.',
            'WB стр. 21: Language Diary — заполни таблицы to be negative, this / that / these / those, have got; Vocabulary — упр. 1–2.',
            'WB стр. 22: Grammar — упр. 3–6; Use your English — упр. 7.',
            'WB стр. 23: Check Yourself, Units 7–9 — выполни без подсказок, посчитай баллы (максимум 25), затем проверь себя по ответам в WB стр. 62–63.',
          ],
        },
      ],
    },
  ],

  exercises: [
    // Unit 7
    { id: 'u07-01', unit: 'u07', type: 'choice', q: 'She ___ my brother.', options: ["isn't", "aren't", 'am not'], answer: 0, ru: 'Она мне не брат.' },
    { id: 'u07-02', unit: 'u07', type: 'choice', q: 'I ___ old.', options: ['am not', "isn't", "aren't"], answer: 0, ru: 'Я не старый.' },
    { id: 'u07-03', unit: 'u07', type: 'choice', q: 'Mum and Dad ___ here today.', options: ["aren't", "isn't", 'not'], answer: 0, ru: 'Мамы и папы сегодня здесь нет.' },
    { id: 'u07-04', unit: 'u07', type: 'choice', q: "___ this? — It's my uncle.", options: ["Who's", "What's", 'Who'], answer: 0, ru: 'Кто это? — Это мой дядя.' },
    { id: 'u07-05', unit: 'u07', type: 'gap', q: 'My grandma ___ very old.', answers: ["isn't", "'s not"], ru: 'Моя бабушка не очень старая.' },
    { id: 'u07-06', unit: 'u07', type: 'gap', q: 'We ___ in France today.', answers: ["aren't"], ru: 'Сегодня мы не во Франции.' },
    { id: 'u07-07', unit: 'u07', type: 'gap', q: 'I ___ your brother.', answers: ['am not', "'m not"], ru: 'Я не твой брат.' },
    { id: 'u07-08', unit: 'u07', type: 'gap', q: 'Who ___ your best friend?', answers: ['is', "'s"], ru: 'Кто твой лучший друг?' },
    { id: 'u07-09', unit: 'u07', type: 'order', words: ['this', 'is', 'my', 'grandfather'], answers: ['This is my grandfather.'], ru: 'Это мой дедушка.' },
    { id: 'u07-10', unit: 'u07', type: 'order', words: ['my', 'sister', "isn't", 'on', 'holiday'], answers: ["My sister isn't on holiday."], ru: 'Моя сестра не в отпуске.' },
    { id: 'u07-11', unit: 'u07', type: 'order', words: ["who's", 'this', 'little', 'girl'], answers: ["Who's this little girl?"], ru: 'Кто эта маленькая девочка?' },
    { id: 'u07-12', unit: 'u07', type: 'translate', ru: 'Это моя бабушка.', answers: ['This is my grandmother.', 'This is my grandma.', 'It is my grandmother.', 'It is my grandma.'] },
    { id: 'u07-13', unit: 'u07', type: 'translate', ru: 'Мой дедушка не старый.', answers: ["My grandfather isn't old.", "My grandad isn't old."] },
    { id: 'u07-14', unit: 'u07', type: 'translate', ru: 'Кто это? Это мой брат.', answers: ['Who is this? It is my brother.', 'Who is this? This is my brother.'] },

    // Unit 8
    { id: 'u08-01', unit: 'u08', type: 'choice', q: '___ you got a skateboard?', options: ['Have', 'Has', 'Are'], answer: 0, ru: 'У тебя есть скейтборд?' },
    { id: 'u08-02', unit: 'u08', type: 'choice', q: '___ Sophie got a kitten?', options: ['Has', 'Have', 'Is'], answer: 0, ru: 'У Софи есть котёнок?' },
    { id: 'u08-03', unit: 'u08', type: 'choice', q: 'Is the bone in the basket? — No, it ___.', options: ["isn't", "hasn't", "haven't"], answer: 0, ru: 'Кость в корзине? — Нет.' },
    { id: 'u08-04', unit: 'u08', type: 'choice', q: 'The ball is ___ the chair.', options: ['under', 'behind', 'next'], answer: 0, ru: 'Мяч под стулом.' },
    { id: 'u08-05', unit: 'u08', type: 'gap', q: 'Have you got a ruler? — No, I ___.', answers: ["haven't"], ru: 'У тебя есть линейка? — Нет.' },
    { id: 'u08-06', unit: 'u08', type: 'gap', q: 'Has Mum got a computer? — Yes, she ___.', answers: ['has'], ru: 'У мамы есть компьютер? — Да.' },
    { id: 'u08-07', unit: 'u08', type: 'gap', q: "Where is my pencil case? — It's ___ the school bag.", answers: ['in'], ru: 'Где мой пенал? — Он в школьной сумке.' },
    { id: 'u08-08', unit: 'u08', type: 'gap', q: 'The pen is ___ to the ruler.', answers: ['next'], ru: 'Ручка рядом с линейкой.' },
    { id: 'u08-09', unit: 'u08', type: 'order', words: ['have', 'you', 'got', 'a', 'dog'], answers: ['Have you got a dog?'], ru: 'У тебя есть собака?' },
    { id: 'u08-10', unit: 'u08', type: 'order', words: ['has', 'your', 'mum', 'got', 'a', 'computer'], answers: ['Has your mum got a computer?'], ru: 'У твоей мамы есть компьютер?' },
    { id: 'u08-11', unit: 'u08', type: 'order', words: ['the', 'pen', 'is', 'next', 'to', 'the', 'book'], answers: ['The pen is next to the book.'], ru: 'Ручка рядом с книгой.' },
    { id: 'u08-12', unit: 'u08', type: 'translate', ru: 'У тебя есть собака?', answers: ['Have you got a dog?'] },
    { id: 'u08-13', unit: 'u08', type: 'translate', ru: 'У неё есть брат? — Да.', answers: ['Has she got a brother? Yes, she has.'] },
    { id: 'u08-14', unit: 'u08', type: 'translate', ru: 'Где моя школьная сумка? — Она под партой.', answers: ['Where is my school bag? It is under the desk.', 'Where is my bag? It is under the desk.'] },

    // Unit 9
    { id: 'u09-01', unit: 'u09', type: 'choice', q: "What are ___? — They're helmets.", options: ['these', 'this', 'that'], answer: 0, ru: 'Что это (вот здесь, рядом)? — Это шлемы.' },
    { id: 'u09-02', unit: 'u09', type: 'choice', q: "What are ___? — They're mountains.", options: ['those', 'that', 'this'], answer: 0, ru: 'Что это там, вдалеке? — Это горы.' },
    { id: 'u09-03', unit: 'u09', type: 'choice', q: 'Two ___ are on the road.', options: ['buses', 'bus', 'busses'], answer: 0, ru: 'Два автобуса на дороге.' },
    { id: 'u09-04', unit: 'u09', type: 'choice', q: 'The ___ are in the classroom.', options: ['children', 'childs', 'childrens'], answer: 0, ru: 'Дети в классе.' },
    { id: 'u09-05', unit: 'u09', type: 'gap', q: "What ___ these? — They're flowers.", answers: ['are'], ru: 'Что это? — Это цветы.' },
    { id: 'u09-06', unit: 'u09', type: 'gap', q: "What's ___? — It's a mountain.", answers: ['that'], ru: 'Что это там, вдалеке? — Это гора.' },
    { id: 'u09-07', unit: 'u09', type: 'gap', q: 'Ten ___ are in the room. (person)', answers: ['people'], ru: 'В комнате десять человек.' },
    { id: 'u09-08', unit: 'u09', type: 'gap', q: 'These ___ are happy. (child)', answers: ['children'], ru: 'Эти дети счастливы.' },
    { id: 'u09-09', unit: 'u09', type: 'order', words: ['what', 'are', 'those'], answers: ['What are those?'], ru: 'Что это там, вдалеке?' },
    { id: 'u09-10', unit: 'u09', type: 'order', words: ['those', 'houses', 'are', 'round'], answers: ['Those houses are round.'], ru: 'Те дома круглые.' },
    { id: 'u09-11', unit: 'u09', type: 'order', words: ['that', 'tree', "isn't", 'very', 'big'], answers: ["That tree isn't very big."], ru: 'То дерево не очень большое.' },
    { id: 'u09-12', unit: 'u09', type: 'translate', ru: 'Что это? — Это цветок.', answers: ['What is this? It is a flower.', 'What is it? It is a flower.', 'What is that? It is a flower.'] },
    { id: 'u09-13', unit: 'u09', type: 'translate', ru: 'Вон те люди — мои друзья.', answers: ['Those people are my friends.'] },
    { id: 'u09-14', unit: 'u09', type: 'translate', ru: 'Что это там? — Это автобусы.', answers: ['What are those? They are buses.'] },
  ],
};
