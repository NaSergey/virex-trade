import 'reflect-metadata';

const GAME_MODULES = ['GamesModule', 'PokerModule', 'BlackjackModule', 'JetpackModule'];

/** Имена импортов `AppModule`, загруженного заново под ролью `role`. */
function importsUnder(role: string): string[] {
  const prev = process.env.ROLE;
  process.env.ROLE = role;
  let names: string[] = [];
  jest.isolateModules(() => {
    const { AppModule } = jest.requireActual<{ AppModule: object }>('./app.module');
    const imports = Reflect.getMetadata('imports', AppModule) as unknown[];
    // Класс модуля, динамический модуль (`{ module }`) или его промис —
    // `ConfigModule.forRoot` в @nestjs/config v4 асинхронный; игровые модули
    // статические, и промисам имя здесь не нужно.
    names = imports.map((m) => {
      if (typeof m === 'function') return m.name;
      const dynamic = m as { module?: { name: string } };
      return dynamic.module?.name ?? '(async)';
    });
  });
  if (prev === undefined) delete process.env.ROLE;
  else process.env.ROLE = prev;
  return names;
}

describe('AppModule по ролям', () => {
  it.each(['api', 'worker'])('%s: игр в графе нет — 404 вместо второго рантайма', (role) => {
    const names = importsUnder(role);
    expect(names).toContain('AuthModule');
    for (const game of GAME_MODULES) expect(names).not.toContain(game);
  });

  it('all: игры в том же процессе, как локально и раньше', () => {
    const names = importsUnder('all');
    for (const game of GAME_MODULES) expect(names).toContain(game);
  });
});
