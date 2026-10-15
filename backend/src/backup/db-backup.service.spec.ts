import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { DbBackupService } from './db-backup.service';

const MONDAY = new Date('2026-10-19T03:00:00Z');

function setup(opts: { last?: Date | null; chatId?: string | null; sendOk?: boolean; size?: number } = {}) {
  const prisma = {
    dbBackup: {
      findFirst: jest.fn().mockResolvedValue(opts.last ? { sentAt: opts.last } : null),
      create: jest.fn().mockResolvedValue({}),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(opts.chatId === null ? null : { telegramChatId: opts.chatId ?? '42' }),
    },
  };
  const telegram = {
    enabled: true,
    sendDocument: jest.fn().mockResolvedValue(opts.sendOk ?? true),
    sendText: jest.fn().mockResolvedValue(true),
  };
  const service = new DbBackupService(prisma as never, telegram as never);
  const files: string[] = [];
  // pg_dump подменён: пишет файл нужного размера туда, куда велено.
  const dump = jest.fn(async (file: string) => {
    files.push(file);
    await writeFile(file, Buffer.alloc(opts.size ?? 10, 1));
  });
  Object.assign(service, { dump, partBytes: 4 });
  return { service, prisma, telegram, dump, files };
}

describe('DbBackupService.tick', () => {
  it('бэкап этой недели уже есть — ничего не снимает', async () => {
    const { service, dump, telegram } = setup({ last: new Date('2026-10-19T00:10:00Z') });
    await service.tick(MONDAY);
    expect(dump).not.toHaveBeenCalled();
    expect(telegram.sendDocument).not.toHaveBeenCalled();
  });

  it('пора — снимает, шлёт владельцу и записывает строку', async () => {
    const { service, prisma, telegram } = setup({ size: 3 });
    await service.tick(MONDAY);
    expect(telegram.sendDocument).toHaveBeenCalledTimes(1);
    const [chatId, bytes, name, caption] = telegram.sendDocument.mock.calls[0];
    expect(chatId).toBe('42');
    expect(bytes).toHaveLength(3);
    expect(name).toBe('trade-play-2026-10-19.dump');
    expect(caption).toContain('pg_restore');
    expect(prisma.dbBackup.create).toHaveBeenCalledWith({ data: { bytes: 3, parts: 1 } });
  });

  it('больше части — режет на файлы с номером и шлёт все', async () => {
    const { service, prisma, telegram } = setup({ size: 10 });
    await service.tick(MONDAY);
    const calls = telegram.sendDocument.mock.calls;
    expect(calls.map((c) => c[2])).toEqual([
      'trade-play-2026-10-19.dump.part01',
      'trade-play-2026-10-19.dump.part02',
      'trade-play-2026-10-19.dump.part03',
    ]);
    expect(calls.map((c) => (c[1] as Uint8Array).length)).toEqual([4, 4, 2]);
    expect(calls[0][3]).toContain('cat trade-play-2026-10-19.dump.part*');
    expect(prisma.dbBackup.create).toHaveBeenCalledWith({ data: { bytes: 10, parts: 3 } });
  });

  it('временный файл удаляется и после успеха, и после сбоя', async () => {
    const ok = setup();
    await ok.service.tick(MONDAY);
    expect(existsSync(ok.files[0])).toBe(false);

    const failed = setup({ sendOk: false });
    await failed.service.tick(MONDAY);
    expect(existsSync(failed.files[0])).toBe(false);
  });

  it('Telegram не принял — строки нет, владелец узнаёт один раз за неделю', async () => {
    const { service, prisma, telegram } = setup({ sendOk: false });
    await service.tick(MONDAY);
    await service.tick(new Date('2026-10-19T04:00:00Z'));
    expect(prisma.dbBackup.create).not.toHaveBeenCalled();
    expect(telegram.sendText).toHaveBeenCalledTimes(1);
    expect(telegram.sendText.mock.calls[0][1]).toContain('Бэкап базы не снят');
  });

  it('чат владельца не привязан — ничего не снимает', async () => {
    const { service, dump, prisma } = setup({ chatId: null });
    await service.tick(MONDAY);
    expect(dump).not.toHaveBeenCalled();
    expect(prisma.dbBackup.create).not.toHaveBeenCalled();
  });
});
