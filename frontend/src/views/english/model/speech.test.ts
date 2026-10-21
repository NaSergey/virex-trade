import { describe, expect, it } from 'vitest';
import { pickVoice } from './speech';

describe('pickVoice', () => {
  it('британский голос раньше американского и прочих', () => {
    const voices = [{ lang: 'ru-RU' }, { lang: 'en-US' }, { lang: 'en_GB' }];
    expect(pickVoice(voices)?.lang).toBe('en_GB');
  });

  it('нет британского — американский, нет и его — любой английский', () => {
    expect(pickVoice([{ lang: 'en-AU' }, { lang: 'en-US' }])?.lang).toBe('en-US');
    expect(pickVoice([{ lang: 'de-DE' }, { lang: 'en-IN' }])?.lang).toBe('en-IN');
    expect(pickVoice([{ lang: 'ru-RU' }])).toBeNull();
  });
});
