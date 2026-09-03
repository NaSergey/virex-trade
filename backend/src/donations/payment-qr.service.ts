import { Inject, Injectable, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { formatUsdt } from './amount';
import { DONATION_CONFIG, DonationConfig } from './donation.config';

/**
 * QR-код платежа.
 *
 * По умолчанию в QR лежит ГОЛЫЙ адрес кошелька, без суммы. Это осознанный
 * выбор, а не упрощение: единого стандарта платёжной ссылки в TRON нет.
 * Схему `tron:<address>?amount=…` понимают не все кошельки, а вывод с биржи
 * (откуда приходит заметная часть донатов) сканирует QR исключительно как
 * адрес — всё, что в ссылке кроме адреса, там либо игнорируется, либо ломает
 * разбор. Адрес в QR читают все.
 *
 * Сумма же в этой системе — не удобство, а идентификатор платежа: по её
 * младшим знакам перевод и опознаётся. Поэтому она показывается отдельным
 * полем с кнопкой «скопировать» и предупреждением «переведите ровно столько».
 * Класть идентификатор в поле, которое половина кошельков молча выбросит,
 * нельзя.
 *
 * `DONATION_QR_MODE=tron-uri` включает ссылку с суммой для тех, кто знает
 * кошельки своей аудитории. Формат остаётся тем же `tron:` — но это соглашение
 * части кошельков, а не стандарт сети, и по умолчанию он выключен.
 */
@Injectable()
export class PaymentQrService {
  private readonly logger = new Logger(PaymentQrService.name);

  constructor(
    @Inject(DONATION_CONFIG) private readonly config: DonationConfig,
  ) {}

  /** Полезная нагрузка QR — ровно то, что увидит сканер кошелька. */
  buildPayload(expectedUnits: bigint): string {
    const address = this.config.receivingAddress;
    if (this.config.qrMode === 'tron-uri') {
      const params = new URLSearchParams({
        amount: formatUsdt(expectedUnits),
        token: this.config.usdtContract,
      });
      return `tron:${address}?${params.toString()}`;
    }
    return address;
  }

  /**
   * PNG в виде data:URL — картинку можно отдать в JSON и вставить в <img> без
   * второго запроса и без библиотеки QR на фронтенде.
   *
   * Уровень коррекции 'M' (~15%): адрес TRON — 34 символа, кода хватает с
   * запасом, а более высокий уровень только уплотнил бы модули.
   */
  async buildDataUrl(expectedUnits: bigint): Promise<string | null> {
    try {
      return await QRCode.toDataURL(this.buildPayload(expectedUnits), {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
      });
    } catch (e) {
      // QR — удобство поверх адреса, который и так отдан текстом. Его отказ не
      // должен ронять создание интента: платёж возможен и без картинки.
      this.logger.warn(`не удалось построить QR: ${e}`);
      return null;
    }
  }
}
