import { describe, expect, it } from 'vitest';
import { fillGap, isCorrect, isGapCorrect, normalize } from './check';

describe('normalize', () => {
  it('регистр, пунктуация и пробелы не важны', () => {
    expect(normalize('  Hello,   Sophie!  ')).toBe('hello sophie');
  });

  it('сокращения раскрываются', () => {
    expect(normalize("I'm Tom.")).toBe('i am tom');
    expect(normalize("She isn't here")).toBe('she is not here');
    expect(normalize("They're my friends")).toBe('they are my friends');
    expect(normalize("I can't swim")).toBe('i cannot swim');
    expect(normalize('I can not swim')).toBe('i cannot swim');
    expect(normalize("He doesn't like milk")).toBe('he does not like milk');
    expect(normalize("We've got a cat")).toBe('we have got a cat');
  });

  it("'s после местоимения — is, перед got — has, у имени — притяжательный", () => {
    expect(normalize("It's a cat")).toBe('it is a cat');
    expect(normalize("What's your name?")).toBe('what is your name');
    expect(normalize("There's a desk")).toBe('there is a desk');
    expect(normalize("He's got a dog")).toBe('he has got a dog');
    expect(normalize("Tom's bag")).toBe("tom's bag");
  });

  it('типографский апостроф — как обычный', () => {
    expect(normalize('I’m fine')).toBe('i am fine');
  });
});

describe('isCorrect', () => {
  it('засчитывает любой из ответов', () => {
    expect(isCorrect('hi', ['Hello', 'Hi'])).toBe(true);
  });

  it('полная форма равна сокращённой', () => {
    expect(isCorrect('I am Tom', ["I'm Tom."])).toBe(true);
  });

  it('пустой ответ — неверно', () => {
    expect(isCorrect('  ', [''])).toBe(false);
  });

  it('притяжательный не равен is', () => {
    expect(isCorrect('Tom is dog', ["Tom's dog"])).toBe(false);
  });
});

describe('пропуск', () => {
  it("'m прилипает к слову слева", () => {
    expect(fillGap('I ___ not a teacher.', "'m")).toBe("I'm not a teacher.");
    expect(fillGap('She ___ my friend.', ' is ')).toBe('She is my friend.');
  });

  it('сокращение в пропуске равно полной форме', () => {
    expect(isGapCorrect('I ___ not a teacher.', "'m", ['am'])).toBe(true);
    expect(isGapCorrect('I ___ not a teacher.', 'am', ["'m"])).toBe(true);
    expect(isGapCorrect('He ___ (not be) here.', "isn't", ['is not'])).toBe(true);
    expect(isGapCorrect('I ___ a teacher.', 'is', ['am'])).toBe(false);
    expect(isGapCorrect('I ___ a teacher.', ' ', ['am'])).toBe(false);
  });
});
