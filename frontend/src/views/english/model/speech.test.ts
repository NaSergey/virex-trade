import { describe, expect, it } from 'vitest';
import { pickVoice } from './speech';

describe('pickVoice', () => {
  it('британский голос раньше американского и прочих', () => {
    const voices = [{ lang: 'ru-RU' }, { lang: 'en-US' }, { lang: 'en_GB' }];
    expect(pickVoice(voices)?.lang).toBe('en_GB');
  });

  it('нейросетевой и Google — раньше встроенного, даже американский', () => {
    const voices = [
      { lang: 'en-GB', name: 'Microsoft Hazel - English (United Kingdom)' },
      { lang: 'en-US', name: 'Google US English' },
      { lang: 'en-US', name: 'Microsoft Aria Online (Natural) - English (United States)' },
    ];
    expect(pickVoice(voices)?.name).toContain('Aria');
    expect(pickVoice(voices.slice(0, 2))?.name).toBe('Google US English');
  });

  it('нет британского — американский, нет и его — любой английский', () => {
    expect(pickVoice([{ lang: 'en-AU' }, { lang: 'en-US' }])?.lang).toBe('en-US');
    expect(pickVoice([{ lang: 'de-DE' }, { lang: 'en-IN' }])?.lang).toBe('en-IN');
    expect(pickVoice([{ lang: 'ru-RU' }])).toBeNull();
  });
});
