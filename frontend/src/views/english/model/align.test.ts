import { describe, expect, it } from 'vitest';
import { alignScore, alignWords } from './align';

const kinds = (expected: string, actual: string) =>
  alignWords(expected, actual).map((m) => `${m.kind[0]}:${m.word}`);

describe('alignWords', () => {
  it('совпадение без учёта регистра и пунктуации', () => {
    expect(kinds('This is my pen.', 'this is my pen')).toEqual(['o:This', 'o:is', 'o:my', 'o:pen']);
  });

  it('пропущенное слово не сбивает остальные', () => {
    expect(kinds('This is my pen.', 'This my pen')).toEqual(['o:This', 'm:is', 'o:my', 'o:pen']);
  });

  it('лишнее и заменённое слово: при равенстве пропуск идёт раньше лишнего', () => {
    expect(kinds('I am Tom', 'I am a Tim')).toEqual(['o:I', 'o:am', 'm:Tom', 'e:a', 'e:Tim']);
  });

  it('пустой ответ — все слова пропущены', () => {
    expect(kinds('Hello!', '')).toEqual(['m:Hello']);
  });
});

describe('alignScore', () => {
  it('доля совпавших слов эталона', () => {
    expect(alignScore(alignWords('This is my pen', 'This my pen'))).toBe(0.75);
    expect(alignScore([])).toBe(0);
  });
});

describe('alignWords — формы', () => {
  it('сокращение равно полной форме', () => {
    expect(kinds("I'm twelve.", 'I am twelve')).toEqual(['o:I', 'o:am', 'o:twelve']);
    expect(kinds("I don't like milk", 'I do not like milk').every((k) => k.startsWith('o:'))).toBe(true);
  });

  it('число цифрами равно числу словом', () => {
    expect(kinds('I am twelve.', 'I am 12')).toEqual(['o:I', 'o:am', 'o:twelve']);
  });
});
