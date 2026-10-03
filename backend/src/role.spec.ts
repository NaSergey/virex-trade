/** Роль читается из окружения при загрузке модуля — поэтому каждый случай грузит его заново. */
function load(role: string | undefined): typeof import('./role') {
  const prev = process.env.ROLE;
  if (role === undefined) delete process.env.ROLE;
  else process.env.ROLE = role;
  let mod!: typeof import('./role');
  jest.isolateModules(() => {
    mod = jest.requireActual('./role');
  });
  if (prev === undefined) delete process.env.ROLE;
  else process.env.ROLE = prev;
  return mod;
}

describe('роль процесса', () => {
  it.each([
    ['api', true, false, false],
    ['worker', false, true, false],
    ['games', true, false, true],
    ['all', true, true, true],
  ])('%s: HTTP %s, фон %s, игры %s', (role, http, background, games) => {
    const r = load(role);
    expect(r.ROLE).toBe(role);
    expect(r.servesHttp()).toBe(http);
    expect(r.runsBackgroundJobs()).toBe(background);
    expect(r.runsGames()).toBe(games);
  });

  it('незнакомое или пустое значение — all', () => {
    expect(load('gmaes').ROLE).toBe('all');
    expect(load(undefined).ROLE).toBe('all');
  });
});
