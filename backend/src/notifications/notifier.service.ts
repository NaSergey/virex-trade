import { Injectable, Logger } from '@nestjs/common';
import { TelegramService } from '../telegram/telegram.service';
import { NotificationStateService } from './notification-state.service';
import { PrefsService } from './prefs.service';
import { isEnabled, thresholdOf } from './prefs';
import { NotifKey, notifDef } from './registry';
import { isQuietNow } from './quiet-hours';

export interface Outgoing {
  text: string;
  replyMarkup?: object;
}

/**
 * Единственное место, где принимается решение «слать или нет». Чекеры считают
 * метрику и отдают текст; включённость, тихие часы, фронт нарастания и
 * cooldown — здесь. Иначе каждый новый сигнал заново переписывал бы те же
 * четыре проверки, и какую-нибудь из них однажды забыл бы.
 */
@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);

  constructor(
    private readonly prefs: PrefsService,
    private readonly state: NotificationStateService,
    private readonly telegram: TelegramService,
  ) {}

  /** Порог текущего пресета — чекеру, чтобы посчитать условие. */
  async thresholdFor(userId: string, key: NotifKey): Promise<number | null> {
    return thresholdOf(await this.prefs.get(userId), key);
  }

  /**
   * Сигнал с условием: `holds` — держится ли метрика выше порога прямо сейчас.
   * `build` вызывается только если отправка разрешена, чтобы не собирать текст
   * (и не ходить за данными) впустую.
   */
  async maybeSend(
    userId: string,
    key: NotifKey,
    holds: boolean,
    build: () => Outgoing,
  ): Promise<boolean> {
    const def = notifDef(key);
    if (!def) return false;
    const prefs = await this.prefs.get(userId);
    if (!isEnabled(prefs, key)) return false;

    const now = new Date();
    const send = await this.state.check(userId, key, holds, def.cooldownMs, now);
    if (!send) return false;
    if (prefs.quietHours && !def.ignoresQuietHours && isQuietNow(now)) return false;

    return this.deliver(userId, build());
  }

  /**
   * Событийный сигнал: событие уже произошло, условия нет. Проверяются
   * включённость, тихие часы и cooldown.
   */
  async sendEvent(userId: string, key: NotifKey, out: Outgoing): Promise<boolean> {
    const def = notifDef(key);
    if (!def) return false;
    const prefs = await this.prefs.get(userId);
    if (!isEnabled(prefs, key)) return false;

    const now = new Date();
    if (prefs.quietHours && !def.ignoresQuietHours && isQuietNow(now)) return false;
    if (!(await this.state.canSendEvent(userId, key, def.cooldownMs, now))) return false;

    const ok = await this.deliver(userId, out);
    if (ok) await this.state.markSent(userId, key, now);
    return ok;
  }

  private async deliver(userId: string, out: Outgoing): Promise<boolean> {
    try {
      const chatId = await this.telegram.chatIdOf(userId);
      if (!chatId) return false;
      return await this.telegram.sendText(chatId, out.text, out.replyMarkup);
    } catch (e) {
      // Провал доставки не должен ронять цикл синхронизации или тик чекера.
      this.logger.warn(`отправка уведомления не удалась: ${e}`);
      return false;
    }
  }
}
