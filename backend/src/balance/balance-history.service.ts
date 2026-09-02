import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { deriveBalanceAt, type Anchor } from './balance-chain';
import { loadFlows } from './flows';

export interface BalanceAt {
  balance: number;
  source: 'snapshot' | 'derived';
}

/** Непрерывный отрезок ряда: внутри него баланс связан цепочкой сделок. */
interface Segment {
  anchors: Anchor[];
}

@Injectable()
export class BalanceHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Баланс в произвольный момент.
   *
   * Null означает «не знаем», и это не то же самое, что ноль: сделка с
   * неизвестным балансом выпадает из проверки правил целиком, а сделка с
   * нулевым балансом нарушила бы любое правило.
   */
  async balanceAt(userId: string, exchange: string, at: Date): Promise<BalanceAt | null> {
    const rows = await this.prisma.balanceSnapshot.findMany({
      where: { userId, exchange },
      orderBy: { at: 'asc' },
      select: { at: true, balance: true, gap: true },
    });
    if (rows.length === 0) return null;

    const segment = this.segmentFor(rows, at);
    if (!segment) return null;

    const anchor = this.nearestAnchor(segment, at);
    const flows = await loadFlows(
      this.prisma,
      userId,
      exchange,
      at < anchor.at ? at : anchor.at,
      at < anchor.at ? anchor.at : at,
    );
    const balance = deriveBalanceAt(anchor, flows, at);
    const exact = segment.anchors.some((a) => a.at.getTime() === at.getTime());
    return { balance, source: exact ? 'snapshot' : 'derived' };
  }

  /**
   * Разбивает якоря на непрерывные отрезки и возвращает тот, которому
   * принадлежит момент.
   *
   * Якорь с разрывом открывает НОВЫЙ отрезок: он первая точка, в которой
   * баланс уже включает пополнение, и тянуть цепочку через него значило бы
   * приписать пользователю прибыль в размере его собственного взноса.
   *
   * Момент раньше самого первого якоря принадлежит первому отрезку — это и
   * есть реконструкция истории назад. Момент, попавший в промежуток между
   * концом одного отрезка и началом следующего, не принадлежит никому:
   * известно только, что где-то там двигались неторговые деньги.
   */
  private segmentFor(
    rows: { at: Date; balance: number; gap: number | null }[],
    at: Date,
  ): Segment | null {
    const segments: Segment[] = [];
    for (const r of rows) {
      const anchor: Anchor = { at: r.at, balance: r.balance };
      if (segments.length === 0 || r.gap !== null) segments.push({ anchors: [anchor] });
      else segments[segments.length - 1].anchors.push(anchor);
    }

    // Назад ряд продлевается, только если самый ранний якорь разрыва не несёт.
    // Разрыв на первом же якоре означает, что прямо перед началом наблюдений
    // двигались неторговые деньги, и всё, что было раньше, с этим рядом
    // цепочкой не связано.
    const openEnded = rows[0].gap === null;

    const t = at.getTime();
    for (let i = 0; i < segments.length; i += 1) {
      const anchors = segments[i].anchors;
      const first = anchors[0].at.getTime();
      const last = anchors[anchors.length - 1].at.getTime();
      const lowerBound = i === 0 && openEnded ? Number.NEGATIVE_INFINITY : first;
      if (t >= lowerBound && t <= last) return segments[i];
      // Вперёд продлевается только последний: за ним ещё ничего не случилось.
      if (i === segments.length - 1 && t > last) return segments[i];
    }
    return null;
  }

  /** Ближайший по времени якорь отрезка: чем короче цепочка, тем меньше снос. */
  private nearestAnchor(segment: Segment, at: Date): Anchor {
    return segment.anchors.reduce((best, a) =>
      Math.abs(a.at.getTime() - at.getTime()) < Math.abs(best.at.getTime() - at.getTime()) ? a : best,
    );
  }
}
