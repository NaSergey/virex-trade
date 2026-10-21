import type { ContentBlock, Exercise, Word } from '../types';

/**
 * Блок 8 книги: Units 22–24, Revision 8, Culture Corner «Weekends Around The World»,
 * четыре сезона и Mini Play. Слова — из словаря SB стр. 94–95.
 */

type Item = Exercise extends infer E ? (E extends unknown ? Omit<E, 'id' | 'unit'> : never) : never;

const w = (unit: string, en: string, ru: string, example?: [string, string]): Word =>
  example ? { en, ru, unit, example } : { en, ru, unit };

const ex = (unit: string, items: Item[]): Exercise[] =>
  items.map((e, i) => ({ ...e, id: `${unit}-${String(i + 1).padStart(2, '0')}`, unit }) as Exercise);

const words: Word[] = [
  // Unit 22
  w('u22', 'a lot', 'много', ["It doesn't rain a lot here.", 'Здесь не так много дождей.']),
  w('u22', 'about', 'около, приблизительно', ['There are about twenty children in my class.', 'В моём классе около двадцати детей.']),
  w('u22', 'cap', 'кепка, бейсболка', ["I don't wear a cap.", 'Я не ношу кепку.']),
  w('u22', 'clothes', 'одежда', ['My clothes are in the bedroom.', 'Моя одежда лежит в спальне.']),
  w('u22', 'dress', 'платье', ['She has a pink dress.', 'У неё розовое платье.']),
  w('u22', 'fly', 'летать; запускать (воздушного змея)', ['We fly kites in the park.', 'Мы запускаем воздушных змеев в парке.']),
  w('u22', 'jeans', 'джинсы', ["He doesn't wear jeans.", 'Он не носит джинсы.']),
  w('u22', 'kite', 'воздушный змей', ['The kite is red and yellow.', 'Воздушный змей красно-жёлтый.']),
  w('u22', 'live', 'жить', ["I don't live near the sea.", 'Я живу не у моря.']),
  w('u22', 'rain', 'идти (о дожде); дождь', ["It doesn't rain a lot in my town.", 'В моём городе дождей немного.']),
  w('u22', 'school uniform', 'школьная форма', ["We don't wear a school uniform in the summer.", 'Летом мы не носим школьную форму.']),
  w('u22', 'sea', 'море', ['The sea is blue.', 'Море синее.']),
  w('u22', 'seaside', 'морской берег, побережье', ['We go to the seaside every summer.', 'Каждое лето мы ездим на море.']),
  w('u22', 'shoes', 'туфли, обувь', ['My shoes are black.', 'Мои туфли чёрные.']),
  w('u22', 'skirt', 'юбка', ["She doesn't like this skirt.", 'Ей не нравится эта юбка.']),
  w('u22', 'summer', 'лето', ['In the summer we play in the garden.', 'Летом мы играем в саду.']),
  w('u22', 'trainers', 'кроссовки', ['I wear trainers at school.', 'В школе я хожу в кроссовках.']),
  w('u22', 'wear', 'носить (одежду), быть одетым в', ['My sister wears a blue dress.', 'Моя сестра носит синее платье.']),
  w('u22', 'work', 'работать', ["My dad doesn't work on Saturdays.", 'Мой папа не работает по субботам.']),
  w('u22', 'year', 'год', ['My sister is ten years old.', 'Моей сестре десять лет.']),

  // Unit 23
  w('u23', 'a lot of', 'много (чего-то)', ['My dad eats a lot of chips.', 'Мой папа ест много картошки фри.']),
  w('u23', 'brush', 'щётка, расчёска', ["Here's a brush for your hair.", 'Вот расчёска для твоих волос.']),
  w('u23', 'coat', 'пальто, куртка', ['Does your dog wear a coat in the winter?', 'Твоя собака носит пальто зимой?']),
  w('u23', 'French', 'французский (язык)', ['Do you speak French?', 'Ты говоришь по-французски?']),
  w('u23', 'hard', 'жёсткий, твёрдый; усердно', ['The bone is very hard.', 'Кость очень твёрдая.']),
  w('u23', 'Huh!', 'Хм! Ну-ну! (возглас недоверия)', ["Huh! I don't like onions.", 'Ну-ну! Я не люблю лук.']),
  w('u23', 'quiz', 'викторина', ['We do a quiz in class.', 'На уроке мы проводим викторину.']),
  w('u23', 'understand', 'понимать', ["I don't understand this question.", 'Я не понимаю этот вопрос.']),
  w('u23', 'winter', 'зима', ["It's very cold in the winter.", 'Зимой очень холодно.']),

  // Unit 24
  w('u24', 'future', 'будущее', ['Robots are in the future.', 'Роботы — в будущем.']),
  w('u24', 'inside', 'внутри; внутрь', ['We are inside the house.', 'Мы находимся внутри дома.']),
  w('u24', 'ground', 'земля, почва', ['There are old things in the ground.', 'В земле лежат старые вещи.']),
  w('u24', 'home', 'дом; домой', ["Let's go home!", 'Пойдёмте домой!']),
  w('u24', 'hurray', 'ура', ["Hurray! It's Saturday!", 'Ура! Сегодня суббота!']),
  w('u24', 'remember', 'помнить, вспоминать', ['Do you remember my name?', 'Ты помнишь моё имя?']),
  w('u24', 'thing', 'вещь, предмет', ['This is a strange thing.', 'Это странная вещь.']),
  w('u24', 'backwards', 'назад; задом наперёд', ['Read "dog" backwards: G-O-D.', 'Прочитай «dog» задом наперёд: G-O-D.']),
  w('u24', 'adventure', 'приключение', ['This is a great adventure for the children.', 'Для детей это большое приключение.']),

  // Culture Corner 2
  w('cc2', 'boat', 'лодка, корабль', ['There is a boat on the sea.', 'На море стоит лодка.']),
  w('cc2', 'cook', 'готовить (еду); повар', ['At the weekend I cook hamburgers with my dad.', 'По выходным я готовлю гамбургеры вместе с папой.']),
  w('cc2', 'cowboy', 'ковбой', ['The cowboy wears a big hat.', 'Ковбой носит большую шляпу.']),
  w('cc2', 'cricket', 'крикет', ['We play cricket in the park.', 'Мы играем в крикет в парке.']),
  w('cc2', 'famous', 'известный, знаменитый', ['My brother is a famous footballer.', 'Мой брат — знаменитый футболист.']),
  w('cc2', 'footballer', 'футболист', ['He is a good footballer.', 'Он хороший футболист.']),
  w('cc2', 'football team', 'футбольная команда', ['Our football team plays on Saturdays.', 'Наша футбольная команда играет по субботам.']),
  w('cc2', 'hat', 'шляпа', ['She has a red hat.', 'У неё красная шляпа.']),
  w('cc2', 'maths', 'математика', ['We have maths on Mondays.', 'По понедельникам у нас математика.']),
  w('cc2', 'rodeo', 'родео', ['A rodeo is a show with horses.', 'Родео — это шоу с лошадьми.']),
  w('cc2', 'team', 'команда', ['My team is very good.', 'Моя команда очень хорошая.']),
  w('cc2', 'together', 'вместе', ['We walk to the park together.', 'Мы вместе идём в парк пешком.']),
  w('cc2', 'walk', 'ходить пешком, гулять', ['I walk to school every day.', 'Я каждый день хожу в школу пешком.']),
  w('cc2', 'weekend', 'выходные', ['At the weekend we visit our grandma.', 'По выходным мы навещаем бабушку.']),

  // Autumn
  w('autumn', 'autumn', 'осень', ['In autumn the leaves are brown.', 'Осенью листья коричневые.']),
  w('autumn', 'bonfire', 'костёр', ['The bonfire is hot.', 'Костёр горячий.']),
  w('autumn', 'gold', 'золото; золотой', ['The leaves are red and gold.', 'Листья красные и золотые.']),
  w('autumn', 'leaf, leaves', 'лист, листья', ['The leaves are on the ground.', 'Листья лежат на земле.']),
  w('autumn', 'November', 'ноябрь', ["It's cold in November.", 'В ноябре холодно.']),
  w('autumn', 'October', 'октябрь', ['My birthday is in October.', 'Мой день рождения в октябре.']),
  w('autumn', 'September', 'сентябрь', ['School starts in September.', 'Школа начинается в сентябре.']),
  w('autumn', 'wind', 'ветер', ['The wind is cold today.', 'Сегодня холодный ветер.']),

  // Winter
  w('winter', 'December', 'декабрь', ['Winter starts in December.', 'Зима начинается в декабре.']),
  w('winter', 'February', 'февраль', ['February is cold.', 'Февраль холодный.']),
  w('winter', 'ice skates', 'коньки', ['I have new ice skates.', 'У меня новые коньки.']),
  w('winter', 'January', 'январь', ['My birthday is in January.', 'Мой день рождения в январе.']),
  w('winter', 'snowball', 'снежок', ['The boy has a snowball.', 'У мальчика в руке снежок.']),
  w('winter', 'snowflake', 'снежинка', ['A snowflake is small and white.', 'Снежинка маленькая и белая.']),
  w('winter', 'snowman', 'снеговик', ['The snowman has a red nose.', 'У снеговика красный нос.']),

  // Spring
  w('spring', 'April', 'апрель', ['It rains a lot in April.', 'В апреле много дождей.']),
  w('spring', 'chick', 'цыплёнок', ['The chick is small and yellow.', 'Цыплёнок маленький и жёлтый.']),
  w('spring', 'March', 'март', ['My mum has a birthday in March.', 'У моей мамы день рождения в марте.']),
  w('spring', 'May', 'май', ['In May the sun is bright.', 'В мае солнце яркое.']),
  w('spring', 'rabbit', 'кролик', ['The rabbit has long ears.', 'У кролика длинные уши.']),
  w('spring', 'rain', 'дождь', ["We don't play in the rain.", 'Мы не играем под дождём.']),
  w('spring', 'rainbow', 'радуга', ['Look! A rainbow!', 'Смотри! Радуга!']),

  // Summer
  w('summer', 'August', 'август', ['We have a holiday in August.', 'В августе у нас отпуск.']),
  w('summer', 'beach', 'пляж', ['We play volleyball on the beach.', 'Мы играем в волейбол на пляже.']),
  w('summer', 'July', 'июль', ["It's hot in July.", 'В июле жарко.']),
  w('summer', 'June', 'июнь', ['In June we go to the seaside.', 'В июне мы едем на море.']),
  w('summer', 'picnic', 'пикник', ['We have a picnic in the park.', 'Мы устраиваем пикник в парке.']),
  w('summer', 'surfboard', 'доска для сёрфинга', ['My surfboard is blue.', 'Моя доска для сёрфинга синяя.']),
  w('summer', 'tent', 'палатка', ['The tent is green.', 'Палатка зелёная.']),

  // Play
  w('play', 'banana', 'банан', ['I eat a banana for breakfast.', 'На завтрак я ем банан.']),
  w('play', 'bookcase', 'книжный шкаф', ['My books are in the bookcase.', 'Мои книги стоят в книжном шкафу.']),
  w('play', 'ghost', 'привидение', ['Is there a ghost in the house?', 'В доме есть привидение?']),
  w('play', 'jewel', 'драгоценный камень, украшение', ['This jewel is very beautiful.', 'Этот драгоценный камень очень красивый.']),
  w('play', 'money', 'деньги', ['I have some money for pizza.', 'У меня есть немного денег на пиццу.']),
  w('play', 'narrator', 'рассказчик', ['Who is the narrator in the play?', 'Кто в пьесе рассказчик?']),
  w('play', 'noise', 'шум', ['I can hear a noise in the garden.', 'Я слышу шум в саду.']),
  w('play', 'only', 'только; единственный', ['She only eats hamburgers on Saturdays.', 'Она ест гамбургеры только по субботам.']),
  w('play', 'ready', 'готовый', ["Are you ready? Let's go!", 'Ты готов? Пойдём!']),
  w('play', 'rob', 'грабить', ['The robbers rob the house.', 'Грабители грабят дом.']),
  w('play', 'robber', 'грабитель', ['The robber is in the room.', 'Грабитель находится в комнате.']),
  w('play', 'sad', 'грустный', ['The dog is sad.', 'Собака грустная.']),
  w('play', 'scared', 'испуганный', ["I'm scared of ghosts.", 'Я боюсь привидений.']),
  w('play', 'strangers', 'незнакомцы, чужие люди', ['There are strangers in the house.', 'В доме чужие люди.']),
];

export const B8: ContentBlock = {
  words,
  lessons: [
    {
      unit: 'u22',
      blocks: [
        {
          type: 'p',
          text: 'Чтобы сказать «не» в Present Simple, перед глаголом ставят помощника: *don\'t* (для *I, you, we, they*) или *doesn\'t* (для *he, she, it*). После *doesn\'t* глагол возвращается в начальную форму — без -s: *She doesn\'t wear jeans*. Окончание -s уже «ушло» в *doesn\'t*. Полные формы — *do not* и *does not*, в речи почти всегда используют короткие.',
        },
        {
          type: 'p',
          text: 'Фраза *a lot* в конце предложения значит «много», а *not … a lot* — «немного, не так уж много»: *It doesn\'t rain a lot here*. Глагол *have* в отрицании тоже получает помощника: *They don\'t have a car* — это то же, что *They haven\'t got a car*.',
        },
        {
          type: 'rule',
          title: 'Present Simple: отрицание',
          rows: [
            ["I / you / we / they + don't", "We don't wear a school uniform.", 'Мы не носим школьную форму.'],
            ["he / she / it + doesn't", "She doesn't wear a dress.", 'Она не носит платье.'],
            ['do not / does not (полные формы)', 'He does not live near the sea.', 'Он не живёт у моря.'],
          ],
        },
        {
          type: 'rule',
          title: 'Было → стало',
          rows: [
            ['I wear jeans.', "I don't wear jeans.", 'Я не ношу джинсы.'],
            ['She lives near the sea.', "She doesn't live near the sea.", 'Она не живёт у моря.'],
            ['Uncle Tom works in the garden.', "Uncle Tom doesn't work in the garden.", 'Дядя Том не работает в саду.'],
            ['They fly kites.', "They don't fly kites.", 'Они не запускают воздушных змеев.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ["I don't wear jeans in the summer.", 'Летом я не ношу джинсы.'],
            ["My sister doesn't wear a cap.", 'Моя сестра не носит кепку.'],
            ["We don't fly kites in the rain.", 'Мы не запускаем воздушных змеев в дождь.'],
            ["He doesn't live near the sea.", 'Он не живёт у моря.'],
            ["They don't wear a school uniform in the summer.", 'Летом они не носят школьную форму.'],
            ["My dad doesn't work on Saturdays.", 'Мой папа не работает по субботам.'],
            ["It doesn't rain a lot in my town.", 'В моём городе дождей немного.'],
            ["I don't like this skirt. It's too big.", 'Мне не нравится эта юбка. Она слишком большая.'],
            ["She doesn't have new shoes.", 'У неё нет новых туфель.'],
          ],
        },
        {
          type: 'note',
          text: 'После *doesn\'t* — глагол без -s: ✗ *She doesn\'t plays* → ✓ *She doesn\'t play*. Здесь «лишнее» -s ставят почти все, потому что только что учили, что к *she* надо добавлять -s.',
        },
        {
          type: 'note',
          text: 'По-русски достаточно сказать «не», а по-английски нужен помощник: ✗ *I not play* → ✓ *I don\'t play*. Не смешивай с *to be*: *I\'m not* (с глаголом *am*), но *I don\'t play* (с обычным глаголом).',
        },
        {
          type: 'p',
          text: 'Слова юнита: одежда (jeans, dress, skirt, cap, trainers, shoes, clothes, school uniform), место и время (seaside, sea, year, summer) и глаголы (wear, live, work, fly, rain).',
        },
        {
          type: 'book',
          items: [
            'SB стр. 70: упр. 1 — прочитай три рассказа о летних каникулах (Jade, Micky, Sophie), затем перечитай вслух; найди в них все предложения с don\'t и doesn\'t',
            'SB стр. 71: упр. 2 — выбери верные ответы по текстам; упр. 3 — преврати предложения в отрицательные письменно; упр. 4 — соедини глаголы со словами; упр. 5 — скажи, что ты делаешь и не делаешь летом; упр. 6 — напиши о своём лете; упр. 7 — послушай и обведи слова; упр. 8 — расскажи об одежде',
            'WB стр. 52: упр. 1–4 письменно',
          ],
        },
      ],
    },
    {
      unit: 'u23',
      blocks: [
        {
          type: 'p',
          text: 'Вопрос в Present Simple строится с помощником: в начале стоит *Do* (для *I, you, we, they*) или *Does* (для *he, she, it*), потом подлежащее, потом глагол в начальной форме: *Do you wash your dog?*, *Does she wear a coat?* После *does* глагол снова без -s: *Does he play?* — окончание унёс помощник. По-русски вопрос задают интонацией («Ты любишь пиццу?»), а в английском нужен *Do / Does* в самом начале. Ты уже знаешь *Do you like…?* и *Does he like…?* — то же самое работает с любыми глаголами.',
        },
        {
          type: 'p',
          text: 'Краткие ответы: *Yes, I do. / No, I don\'t.* *Yes, she does. / No, she doesn\'t.* Основной глагол в ответе не повторяют — говорят только *do / does* или *don\'t / doesn\'t*.',
        },
        {
          type: 'rule',
          title: 'Вопросы',
          rows: [
            ['Do I / you / we / they + глагол?', 'Do you wash your dog every day?', 'Ты каждый день моешь свою собаку?'],
            ['Does he / she / it + глагол?', 'Does your cat drink milk?', 'Твоя кошка пьёт молоко?'],
          ],
        },
        {
          type: 'rule',
          title: 'Краткие ответы',
          rows: [
            ['Yes, I / you / we / they do.', 'Do they like pizza? — Yes, they do.', 'Они любят пиццу? — Да.'],
            ["No, I / you / we / they don't.", "Do you wear a cap? — No, I don't.", 'Ты носишь кепку? — Нет.'],
            ['Yes, he / she / it does.', 'Does she understand French? — Yes, she does.', 'Она понимает по-французски? — Да.'],
            ["No, he / she / it doesn't.", "Does your dog wear a coat? — No, he doesn't.", 'Твоя собака носит пальто? — Нет.'],
          ],
        },
        {
          type: 'examples',
          items: [
            ["Do you speak French? — No, I don't.", 'Ты говоришь по-французски? — Нет.'],
            ['Does your brother understand English? — Yes, he does.', 'Твой брат понимает по-английски? — Да.'],
            ['Do your mum and dad like hamburgers? — Yes, they do.', 'Твои мама и папа любят гамбургеры? — Да.'],
            ["Does your dog wear a coat in the winter? — No, he doesn't.", 'Твоя собака носит зимой пальто? — Нет.'],
            ["Does Tilly brush her hair? — No, she doesn't.", 'Тилли расчёсывает волосы? — Нет.'],
            ['Do you eat a lot of chips? — Yes, I do.', 'Ты ешь много картошки фри? — Да.'],
            ['Does your sister do her homework every day? — Yes, she does.', 'Твоя сестра каждый день делает домашнее задание? — Да.'],
            ['Do birds fly? — Yes, they do.', 'Птицы летают? — Да.'],
          ],
        },
        {
          type: 'note',
          text: 'После *does* нет -s: ✗ *Does she plays?* → ✓ *Does she play?*. И короткий ответ — это помощник, а не глагол: ✗ *Yes, she plays* как краткий ответ → ✓ *Yes, she does.*',
        },
        {
          type: 'note',
          text: 'Не смешивай *to be* и *do*: вопросы с *am / is / are* — *Are you from France?*, а вопросы с остальными глаголами — *Do you speak French?*. ✗ *Are you speak French?*',
        },
        {
          type: 'p',
          text: 'Слова юнита: quiz, understand, French, coat, winter, brush (щётка), a lot of, hard и восклицание Huh!. Все слова — в карточках.',
        },
        {
          type: 'book',
          items: [
            'SB стр. 72: упр. 1 — послушай и прочитай комикс про викторину о собаках, затем перечитай вслух',
            'SB стр. 73: упр. 2 — отметь верно / неверно; упр. 3 — расставь слова в вопросы, задай их и ответь; упр. 4 — спроси и ответь по таблице о Joe и Suzie, затем спроси партнёра; упр. 5 — расскажи о партнёре; упр. 6 — составь вопросы, закончи ответы и пройди Crazy Pets Quiz',
            'WB стр. 53: упр. 1–3 письменно (в упр. 3 ответь за себя и за друга)',
          ],
        },
      ],
    },
    {
      unit: 'u24',
      blocks: [
        {
          type: 'p',
          text: 'Это последний Story Time в книге (Selest 8), и в нём встречается почти вся грамматика курса. Новых правил нет — задача в том, чтобы узнавать знакомые формы в тексте и использовать их самому. Если какая-то форма вызывает сомнение, вернись к её юниту (в таблице ниже). Главное, что стоит держать в голове: в Present Simple помощник *do / does / don\'t / doesn\'t* принимает на себя «изменения», а глагол после него остаётся в начальной форме.',
        },
        {
          type: 'rule',
          title: 'Грамматика курса в одном месте',
          rows: [
            ['to be: am / is / are', 'Uncle Tom is in the computer room.', 'Дядя Том в компьютерной комнате.'],
            ['have got / has got', 'Jed has got a dog.', 'У Джеда есть собака.'],
            ['there is / there are', 'There is a king on the planet.', 'На планете есть король.'],
            ['can / can\'t', 'Anna can dance.', 'Анна умеет танцевать.'],
            ["Let's + глагол", "Let's go home!", 'Пойдёмте домой!'],
            ['Present Simple (+)', 'Luke plays football.', 'Люк играет в футбол.'],
            ['Present Simple (−)', "Anna doesn't like robots.", 'Анна не любит роботов.'],
            ['Present Simple (?)', 'Does Luke live on Earth?', 'Люк живёт на Земле?'],
            ['who / what / where', 'Where is Hobo?', 'Где Хобо?'],
          ],
        },
        {
          type: 'examples',
          items: [
            ["Let's go home!", 'Пойдёмте домой!'],
            ["Hurray! It's Saturday!", 'Ура! Сегодня суббота!'],
            ['Do you remember my name?', 'Ты помнишь моё имя?'],
            ['There are old things in the ground.', 'В земле лежат старые вещи.'],
            ['We are inside the house.', 'Мы находимся внутри дома.'],
            ['Read "dog" backwards: G-O-D.', 'Прочитай «dog» задом наперёд: G-O-D.'],
            ["My brother doesn't like robots. He likes football.", 'Мой брат не любит роботов. Он любит футбол.'],
            ['Robots are in the future.', 'Роботы — в будущем.'],
          ],
        },
        {
          type: 'note',
          text: 'Самая частая ошибка при смешении времён — лишнее -s рядом с помощником: ✗ *Does he likes robots?*, ✗ *She doesn\'t likes robots* → ✓ *Does he like…?*, *She doesn\'t like…*. Вторая — не отличать *to be* от *do*: ✗ *Is she play?* → ✓ *Does she play?*',
        },
        {
          type: 'note',
          text: '*Home* без предлога: ✗ *go to home* → ✓ *go home*; но *at home* («дома») — с *at*. И слова *Hurray!* и *adventure* лучше сразу запомнить с примерами: *Hurray! What an adventure!*',
        },
        {
          type: 'p',
          text: 'Слова юнита: future, inside, ground, home, hurray, remember, thing, backwards, adventure.',
        },
        {
          type: 'book',
          items: [
            'SB стр. 74: упр. 1 — вспомни прошлую историю и обведи нужные слова; упр. 2 — послушай и прочитай финальную историю Selest 8, затем перечитай вслух по ролям',
            'SB стр. 75: упр. 3 — ответь на вопросы по истории; упр. 4 — составь отрицательные предложения; упр. 5 — прочитай диалог и вставь вопросы a–d; упр. 6 — задай вопросы по истории и ответь; Quiz — десять вопросов обо всей истории Selest (устно, потом сверь с текстами)',
            'WB стр. 54: упр. 1–3 письменно',
          ],
        },
      ],
    },
    {
      unit: 'r8',
      blocks: [
        {
          type: 'p',
          text: 'Повторение Units 22–24. Что нужно помнить: (1) *Unit 22* — отрицание в Present Simple: *don\'t* для *I, you, we, they* и *doesn\'t* для *he, she, it*, глагол после них без -s: *I don\'t wear a cap. She doesn\'t live near the sea.*; (2) *Unit 23* — вопросы и краткие ответы: *Do you…? — Yes, I do. / No, I don\'t.*, *Does she…? — Yes, she does. / No, she doesn\'t.*; (3) *Unit 24* — грамматика всего курса: *to be, have got, there is / there are, can, Let\'s*, Present Simple (+ − ?) и вопросы *who / what / where*.',
        },
        {
          type: 'p',
          text: 'Это последнее повторение в книге. Когда закончишь, пройди итоговую викторину *Friends Quiz* (WB стр. 60–61): это вопросы по всей книге — по рубрикам My World, Crazy Pets и Story Time. Отвечай без подсказок, а потом проверь себя по ответам в конце тетради.',
        },
        {
          type: 'note',
          text: 'Чаще всего ошибаются в трёх местах: ставят -s после помощника (*doesn\'t plays*, *Does she plays?*), отвечают на вопрос глаголом вместо помощника (*Yes, she plays* вместо *Yes, she does*) и забывают помощника совсем (*I not like*). Ещё одна ловушка — слова, которые звучат одинаково: *your / you\'re, hear / here, sun / son, I / eye, see / sea, two / too* — их нужно различать по смыслу и написанию.',
        },
        {
          type: 'book',
          items: [
            'SB стр. 76: Vocabulary — упр. 1–2 (кроссворд про одежду, соедини глаголы со словами); Pronunciation — упр. 3 (послушай и повтори пары слов, затем обведи верное слово в предложениях); Grammar — упр. 4–5 (послушай и отметь, что делает семья Helen; расскажи об этом от её имени)',
            'SB стр. 77: таблица вопросов и кратких ответов; упр. 6 — задай вопросы по таблице и ответь; упр. 7 — прочитай текст и обведи верные краткие ответы; упр. 8 — послушай песенку и впиши слова; игра Fun Time — квиз «Are you a good English student?»',
            'WB стр. 55: Language Diary — заполни таблицы Present Simple; Vocabulary — упр. 1–2',
            'WB стр. 56: Grammar — упр. 3–6 письменно; Use your English — упр. 7 (впиши по одному слову)',
            'WB стр. 57: Check Yourself, Units 22–24 — выполни без подсказок, затем проверь себя по ответам в WB стр. 62–63',
            'WB стр. 60–61: итоговая викторина Friends Quiz — вопросы по всей книге; ответы — в конце тетради (WB стр. 63, Quiz Answers)',
          ],
        },
      ],
    },
    {
      unit: 'cc2',
      blocks: [
        {
          type: 'p',
          text: 'Culture Corner «Weekends Around The World» — четыре коротких рассказа от первого лица: ребята из Австралии, ЮАР, Великобритании и США говорят, как проводят выходные. Читай так: сначала целиком, не останавливаясь на непонятных словах — просто пойми, кто где живёт и чем занят. Потом ещё раз, медленно и вслух. Незнакомые слова (rodeo, cowboy, cricket, famous…) занеси в карточки. И присмотрись к Present Simple: *I go*, *we eat*, *he plays*, *he doesn\'t like* — все формы, которые ты уже знаешь.',
        },
        {
          type: 'examples',
          items: [
            ['At the weekend I cook hamburgers with my dad.', 'По выходным я готовлю гамбургеры вместе с папой.'],
            ['My brother is a famous footballer.', 'Мой брат — знаменитый футболист.'],
            ['Our football team plays on Saturdays.', 'Наша футбольная команда играет по субботам.'],
            ['We walk to the park together.', 'Мы вместе идём в парк пешком.'],
            ['The cowboy wears a big hat.', 'Ковбой носит большую шляпу.'],
            ['A rodeo is a show with horses.', 'Родео — это шоу с лошадьми.'],
          ],
        },
        {
          type: 'book',
          items: [
            'SB стр. 78: Reading — упр. 1 — прочитай четыре рассказа и соедини их с фотографиями a–d',
            'SB стр. 79: упр. 2 — отметь верно / неверно; упр. 3 — исправь неверные предложения письменно; упр. 4 (Speaking) — задай пять вопросов о героях и ответь; упр. 5 (Listening) — послушай и соедини дни с картинками; упр. 6 (Writing) — напиши о неделе Ramesh; Project — картинный дневник недели (по желанию)',
            'WB стр. 58: Skills Corner 4, Reading — упр. 1 (выбери название текста), упр. 2 (допиши предложения и наклей наклейки)',
            'WB стр. 59: Writing — упр. 3 (напиши о школах и каникулах в Греции), упр. 4 (исправь ошибки в тексте), упр. 5 (напиши о школе в твоей стране)',
          ],
        },
      ],
    },
    {
      unit: 'autumn',
      blocks: [
        {
          type: 'p',
          text: 'Страница «Autumn» — не история, а картинка со словами: осень, три осенних месяца, ветер, воздушный змей, костёр, листья. Сначала послушай и повтори слова по картинке, затем спой песню про листья. Читай вслух и особенно проговаривай названия месяцев: *September, October, November*. Новые слова занеси в карточки.',
        },
        {
          type: 'examples',
          items: [
            ['In autumn the leaves are brown and gold.', 'Осенью листья коричневые и золотые.'],
            ['School starts in September.', 'Школа начинается в сентябре.'],
            ['The wind is cold today.', 'Сегодня холодный ветер.'],
            ['The bonfire is hot.', 'Костёр горячий.'],
            ['The leaves are on the ground.', 'Листья лежат на земле.'],
          ],
        },
        {
          type: 'book',
          items: [
            'SB стр. 80: упр. 1 — послушай и повтори слова по картинке (autumn, September, October, November, kite, wind, clouds, bonfire, leaves, tree)',
            'SB стр. 81: упр. 2 — послушай и спой песню; упр. 3 — найди в строке осенние слова; упр. 4 — допиши буквы и собери осеннее слово; Activity — по желанию, дома и в классе',
          ],
        },
      ],
    },
    {
      unit: 'winter',
      blocks: [
        {
          type: 'p',
          text: 'Страница «Winter» устроена так же: картинка со словами (зима, три зимних месяца, снежинка, снег, лёд, коньки, снеговик, снежок), песня и задания на слова. Читай вслух, называй месяцы *December, January, February* и повторяй сочетания с *have got* из текстов: *The snowman has got…* Слова — в карточки.',
        },
        {
          type: 'examples',
          items: [
            ['Winter starts in December.', 'Зима начинается в декабре.'],
            ['I have new ice skates.', 'У меня новые коньки.'],
            ['The snowman has a red nose.', 'У снеговика красный нос.'],
            ['A snowflake is small and white.', 'Снежинка маленькая и белая.'],
            ['The boy has a snowball.', 'У мальчика в руке снежок.'],
          ],
        },
        {
          type: 'book',
          items: [
            'SB стр. 82: упр. 1 — послушай и повтори слова по картинке (winter, December, January, February, snowflake, snow, ice, ice skates, snowman, snowball)',
            'SB стр. 83: упр. 2 — послушай и спой песню; упр. 3 — расставь буквы и собери зимние слова; упр. 4 — по картинке из упр. 1 соедини части предложений; Activity — по желанию',
          ],
        },
      ],
    },
    {
      unit: 'spring',
      blocks: [
        {
          type: 'p',
          text: 'Страница «Spring» — весенние слова: три месяца, солнце, радуга, дождь, кролики, цыплята, цветы. Послушай и повтори их, потом спой песню. В заданиях ты считаешь предметы на картинке и составляешь предложения с *There are…*, поэтому заодно повторишь числа и оборот *there are*. Слова — в карточки.',
        },
        {
          type: 'examples',
          items: [
            ['Spring starts in March.', 'Весна начинается в марте.'],
            ['It rains a lot in April.', 'В апреле много дождей.'],
            ['The rabbit has long ears.', 'У кролика длинные уши.'],
            ['The chick is small and yellow.', 'Цыплёнок маленький и жёлтый.'],
            ['Look! A rainbow!', 'Смотри! Радуга!'],
          ],
        },
        {
          type: 'book',
          items: [
            'SB стр. 84: упр. 1 — послушай и повтори слова по картинке (spring, March, April, May, sun, rainbow, rain, rabbits, chicks, flowers)',
            'SB стр. 85: упр. 2 — послушай и спой песню; упр. 3 — посмотри на картинку из упр. 1 и впиши числа в предложения с There are; упр. 4 — разгадай кроссворд с числами; Activity — по желанию',
          ],
        },
      ],
    },
    {
      unit: 'summer',
      blocks: [
        {
          type: 'p',
          text: 'Страница «Summer» — летние слова: три месяца, лодка, доска для сёрфинга, море, пляж, палатка, пикник. Послушай и повтори их, спой песню, а потом сыграй в крестики-нолики со словами: чтобы поставить знак, нужно составить правильное предложение с этим словом. Слова — в карточки.',
        },
        {
          type: 'examples',
          items: [
            ['In June we go to the seaside.', 'В июне мы едем на море.'],
            ['We play volleyball on the beach.', 'Мы играем в волейбол на пляже.'],
            ['We have a picnic in the park.', 'Мы устраиваем пикник в парке.'],
            ['My surfboard is blue.', 'Моя доска для сёрфинга синяя.'],
            ['The tent is green.', 'Палатка зелёная.'],
          ],
        },
        {
          type: 'book',
          items: [
            'SB стр. 86: упр. 1 — послушай и повтори слова по картинке (summer, June, July, August, boat, surfboard, sea, beach, tent, picnic)',
            'SB стр. 87: упр. 2 — послушай и спой песню; упр. 3 — сыграй в крестики-нолики со словами и составь предложения; Activity — летний коллаж, по желанию',
          ],
        },
      ],
    },
    {
      unit: 'play',
      blocks: [
        {
          type: 'p',
          text: 'Mini Play «House Ghosts!» — короткая пьеса в двух действиях (Act I и Act II) о семье, привидениях и грабителях. В ней участвуют мама, папа, трое детей (Penny, Cindy, Harry), шесть привидений, три грабителя и четыре рассказчика. Читай так: сначала всю пьесу целиком, как рассказ — курсивные строки описывают, что делают герои на сцене. Потом ещё раз, но уже вслух и по ролям: сначала за каждого героя по очереди, затем попробуй выучить одну роль. Пока читаешь, находи знакомую грамматику: *have got*, *can*, *there is / there are*, Present Simple, вопросы с *Do / Does*. Незнакомые слова — в карточки.',
        },
        {
          type: 'p',
          text: 'Когда дочитаешь пьесу и закончишь Revision 8, пройди итоговую викторину Friends Quiz (WB стр. 60–61): вопросы по всей книге. Ответы сверяй в конце тетради (WB стр. 63).',
        },
        {
          type: 'examples',
          items: [
            ['Is there a ghost in the house?', 'В доме есть привидение?'],
            ['I can hear a noise in the garden.', 'Я слышу шум в саду.'],
            ['The robbers rob the house.', 'Грабители грабят дом.'],
            ['My books are in the bookcase.', 'Мои книги стоят в книжном шкафу.'],
            ["I'm scared of ghosts.", 'Я боюсь привидений.'],
            ["Are you ready? Let's go!", 'Ты готов? Пойдём!'],
          ],
        },
        {
          type: 'book',
          items: [
            'SB стр. 88–89: Act I — прочитай до конца, затем перечитай вслух по ролям (семья, рассказчики, привидения)',
            'SB стр. 90–91: Act II — прочитай, затем перечитай вслух по ролям (грабители, привидения, финал); при желании выучи одну роль и разыграй сцену',
            'WB стр. 60–61: итоговая викторина Friends Quiz — вопросы по всей книге; ответы — в конце тетради (WB стр. 63, Quiz Answers)',
          ],
        },
      ],
    },
  ],
  exercises: [
    ...ex('u22', [
      { type: 'choice', q: 'I ___ wear a skirt.', options: ["don't", "doesn't", 'not'], answer: 0, ru: 'Я не ношу юбку.' },
      { type: 'choice', q: 'She ___ wear jeans.', options: ["doesn't", "don't", 'not'], answer: 0, ru: 'Она не носит джинсы.' },
      { type: 'choice', q: "My dad doesn't ___ in the sea.", options: ['swim', 'swims', 'swimming'], answer: 0, ru: 'Мой папа не плавает в море.' },
      { type: 'choice', q: 'We ___ go to school in the summer.', options: ["don't", "doesn't", "aren't"], answer: 0, ru: 'Летом мы не ходим в школу.' },
      { type: 'gap', q: 'He ___ live near the sea.', answers: ["doesn't"], ru: 'Он не живёт у моря.' },
      { type: 'gap', q: 'My friends ___ wear a school uniform.', answers: ["don't"], ru: 'Мои друзья не носят школьную форму.' },
      { type: 'gap', q: 'It ___ rain a lot in the summer.', answers: ["doesn't"], ru: 'Летом дождей немного.' },
      { type: 'order', words: ['I', "don't", 'wear', 'a', 'cap'], answers: ["I don't wear a cap."], ru: 'Я не ношу кепку.' },
      { type: 'order', words: ['she', "doesn't", 'like', 'skirts'], answers: ["She doesn't like skirts."], ru: 'Она не любит юбки.' },
      {
        type: 'order',
        words: ['they', "don't", 'work', 'in', 'the', 'garden'],
        answers: ["They don't work in the garden."],
        ru: 'Они не работают в саду.',
      },
      { type: 'translate', ru: 'Я не ношу джинсы.', answers: ["I don't wear jeans."] },
      {
        type: 'translate',
        ru: 'Мой брат не живёт у моря.',
        answers: [
          "My brother doesn't live near the sea.",
          "My brother doesn't live by the sea.",
          "My brother doesn't live at the seaside.",
          "My brother doesn't live near the seaside.",
        ],
      },
      {
        type: 'translate',
        ru: 'Летом они не носят школьную форму.',
        answers: [
          "They don't wear a school uniform in the summer.",
          "They don't wear school uniforms in the summer.",
          "In the summer they don't wear a school uniform.",
          "In the summer they don't wear school uniforms.",
          "They don't wear a school uniform in summer.",
          "In summer they don't wear a school uniform.",
        ],
      },
      {
        type: 'translate',
        ru: 'Моя мама не работает летом.',
        answers: [
          "My mum doesn't work in the summer.",
          "My mother doesn't work in the summer.",
          "In the summer my mum doesn't work.",
          "In the summer my mother doesn't work.",
          "My mum doesn't work in summer.",
          "My mother doesn't work in summer.",
        ],
      },
    ]),
    ...ex('u23', [
      { type: 'choice', q: '___ you like pizza?', options: ['Do', 'Does', 'Are'], answer: 0, ru: 'Ты любишь пиццу?' },
      { type: 'choice', q: '___ he wear a coat in the winter?', options: ['Does', 'Do', 'Is'], answer: 0, ru: 'Он носит пальто зимой?' },
      {
        type: 'choice',
        q: 'Does your sister speak French? — Yes, she ___.',
        options: ['does', 'do', 'speaks'],
        answer: 0,
        ru: 'Твоя сестра говорит по-французски? — Да.',
      },
      {
        type: 'choice',
        q: 'Do your friends like hamburgers? — No, they ___.',
        options: ["don't", "doesn't", "aren't"],
        answer: 0,
        ru: 'Твои друзья любят гамбургеры? — Нет.',
      },
      { type: 'gap', q: '___ your dog eat onions?', answers: ['Does'], ru: 'Твоя собака ест лук?' },
      { type: 'gap', q: 'Do you understand French? — Yes, I ___.', answers: ['do'], ru: 'Ты понимаешь по-французски? — Да.' },
      {
        type: 'gap',
        q: 'Does Tilly brush her hair? — No, she ___.',
        answers: ["doesn't"],
        ru: 'Тилли расчёсывает волосы? — Нет.',
      },
      {
        type: 'order',
        words: ['do', 'you', 'wash', 'your', 'dog', 'every', 'day'],
        answers: ['Do you wash your dog every day?'],
        ru: 'Ты каждый день моешь свою собаку?',
      },
      {
        type: 'order',
        words: ['does', 'your', 'cat', 'drink', 'milk'],
        answers: ['Does your cat drink milk?'],
        ru: 'Твоя кошка пьёт молоко?',
      },
      {
        type: 'order',
        words: ['do', 'they', 'play', 'football', 'in', 'the', 'park'],
        answers: ['Do they play football in the park?'],
        ru: 'Они играют в футбол в парке?',
      },
      { type: 'translate', ru: 'Ты говоришь по-французски?', answers: ['Do you speak French?'] },
      {
        type: 'translate',
        ru: 'Твоя собака носит пальто зимой?',
        answers: ['Does your dog wear a coat in the winter?', 'Does your dog wear a coat in winter?'],
      },
      {
        type: 'translate',
        ru: 'Они любят пиццу? — Нет, не любят.',
        answers: ["Do they like pizza? No, they don't."],
      },
      { type: 'translate', ru: 'Твой брат понимает по-английски?', answers: ['Does your brother understand English?'] },
    ]),
    ...ex('u24', [
      { type: 'choice', q: 'Jed ___ got a dog.', options: ['has', 'have', 'is'], answer: 0, ru: 'У Джеда есть собака.' },
      {
        type: 'choice',
        q: 'There ___ strange things in the ground.',
        options: ['are', 'is', 'have'],
        answer: 0,
        ru: 'В земле лежат странные вещи.',
      },
      { type: 'choice', q: 'Anna ___ like robots.', options: ["doesn't", "don't", "isn't"], answer: 0, ru: 'Анна не любит роботов.' },
      { type: 'choice', q: '___ Luke and Anna from Earth?', options: ['Are', 'Do', 'Does'], answer: 0, ru: 'Люк и Анна с Земли?' },
      { type: 'gap', q: "Let's ___ home!", answers: ['go'], ru: 'Пойдёмте домой!' },
      { type: 'gap', q: '___ you remember my birthday?', answers: ['Do'], ru: 'Ты помнишь мой день рождения?' },
      { type: 'gap', q: 'The children ___ (be) inside the house.', answers: ['are'], ru: 'Дети находятся внутри дома.' },
      {
        type: 'order',
        words: ['the', 'old', 'houses', 'are', 'in', 'the', 'ground'],
        answers: ['The old houses are in the ground.'],
        ru: 'Старые дома находятся в земле.',
      },
      {
        type: 'order',
        words: ['does', 'Luke', 'remember', 'his', 'birthday'],
        answers: ['Does Luke remember his birthday?'],
        ru: 'Люк помнит свой день рождения?',
      },
      {
        type: 'order',
        words: ['there', 'is', 'a', 'robot', 'inside', 'the', 'house'],
        answers: ['There is a robot inside the house.'],
        ru: 'Внутри дома есть робот.',
      },
      {
        type: 'translate',
        ru: 'Ура! Мы дома!',
        answers: ["Hurray! We're at home.", "Hurray! We're home.", "Hurray! We are at home!"],
      },
      { type: 'translate', ru: 'Пойдём домой.', answers: ["Let's go home."] },
      { type: 'translate', ru: 'Я не помню его имя.', answers: ["I don't remember his name."] },
      {
        type: 'translate',
        ru: 'Это большое приключение!',
        answers: ["It's a big adventure.", "This is a big adventure.", "That's a big adventure."],
      },
    ]),
  ],
};
