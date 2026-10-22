import { describe, expect, it } from 'vitest';
import { pickVoice } from './speech';

describe('pickVoice', () => {
  it('американский голос (как у записей) раньше британского и прочих', () => {
    const voices = [{ lang: 'ru-RU' }, { lang: 'en_GB' }, { lang: 'en_US' }];
    expect(pickVoice(voices)?.lang).toBe('en_US');
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

  it('женский раньше мужского, даже простой раньше нейросетевого', () => {
    const voices = [
      { lang: 'en-GB', name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)' },
      { lang: 'en-GB', name: 'Google UK English Male' },
      { lang: 'en-GB', name: 'Daniel' },
      { lang: 'en-GB', name: 'Google UK English Female' },
    ];
    expect(pickVoice(voices)?.name).toBe('Google UK English Female');
    expect(
      pickVoice([...voices, { lang: 'en-GB', name: 'Microsoft Sonia Online (Natural) - English (United Kingdom)' }])?.name,
    ).toContain('Sonia');
  });

  it('нет американского — британский, нет и его — любой английский', () => {
    expect(pickVoice([{ lang: 'en-AU' }, { lang: 'en-GB' }])?.lang).toBe('en-GB');
    expect(pickVoice([{ lang: 'de-DE' }, { lang: 'en-IN' }])?.lang).toBe('en-IN');
    expect(pickVoice([{ lang: 'ru-RU' }])).toBeNull();
  });
});
