/**
 * Частицы выигрыша на одном холсте поверх страницы: монеты (вращаются
 * ребром, как настоящие), искры (сложение света) и конфетти. Каждый вид
 * рисуется готовым спрайтом с заранее отрисованного холста — градиенты
 * считаются один раз, а не на каждую частицу каждого кадра.
 *
 * Цикл кадров живёт, только пока есть частицы: в покое холст не стоит
 * ничего.
 */

type Kind = 'coin' | 'spark' | 'confetti' | 'ring';

interface P {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  age: number;
  size: number;
  spin: number;
  rot: number;
  vr: number;
  color: string;
}

const CONFETTI = ['#ffd34a', '#ff2a55', '#2bd0ff', '#7cff6b', '#c46bff', '#ffffff', '#ff8a1f'];
const MAX = 900;

function sprite(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  draw(c, size);
  return cv;
}

function coinSprite() {
  return sprite(96, (c, s) => {
    const r = s / 2 - 2;
    const g = c.createRadialGradient(s * 0.38, s * 0.32, 2, s / 2, s / 2, r);
    g.addColorStop(0, '#fff8d2');
    g.addColorStop(0.35, '#ffd447');
    g.addColorStop(0.8, '#c47f00');
    g.addColorStop(1, '#6b3d00');
    c.fillStyle = g;
    c.beginPath();
    c.arc(s / 2, s / 2, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#8a5600';
    c.lineWidth = 4;
    c.setLineDash([3, 3]);
    c.beginPath();
    c.arc(s / 2, s / 2, r - 3, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = 'rgba(255,240,180,0.9)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(s / 2, s / 2, r * 0.68, 0, Math.PI * 2);
    c.stroke();
    // Звезда на лице монеты.
    c.fillStyle = '#b06d00';
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.22 : r * 0.5;
      c.lineTo(s / 2 + Math.cos(a) * rr, s / 2 + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.beginPath();
    c.ellipse(s * 0.36, s * 0.3, r * 0.3, r * 0.14, -0.6, 0, Math.PI * 2);
    c.fill();
  });
}

function sparkSprite() {
  return sprite(64, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,236,160,0.95)');
    g.addColorStop(0.45, 'rgba(255,180,40,0.35)');
    g.addColorStop(1, 'rgba(255,140,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    // Лучи — четырёхконечная вспышка, как блик на стекле.
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgba(255,250,220,0.9)';
    for (const [w, h] of [
      [s, 2],
      [2, s],
    ]) {
      c.fillRect((s - w) / 2, (s - h) / 2, w, h);
    }
  });
}

export class Fx {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly parts: P[] = [];
  private raf = 0;
  private last = 0;
  private dpr = 1;
  private readonly coin: HTMLCanvasElement;
  private readonly spark: HTMLCanvasElement;
  /** Меньше частиц при `prefers-reduced-motion`. */
  scale = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.coin = coinSprite();
    this.spark = sparkSprite();
    this.resize();
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(window.innerWidth * this.dpr);
    this.canvas.height = Math.round(window.innerHeight * this.dpr);
  }

  private push(p: Partial<P> & Pick<P, 'kind' | 'x' | 'y'>) {
    if (this.parts.length >= MAX) return;
    this.parts.push({
      vx: 0,
      vy: 0,
      g: 0,
      life: 1.5,
      age: 0,
      size: 20,
      spin: Math.random() * Math.PI * 2,
      rot: 0,
      vr: 0,
      color: '#fff',
      ...p,
    });
    this.run();
  }

  private n(count: number) {
    return Math.max(1, Math.round(count * this.scale));
  }

  /** Фонтан монет из точки: вверх веером, потом падают. */
  fountain(x: number, y: number, count: number, power = 1) {
    for (let i = 0; i < this.n(count); i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
      const v = (520 + Math.random() * 560) * power;
      this.push({
        kind: 'coin',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        g: 1500,
        life: 2.2 + Math.random(),
        size: 22 + Math.random() * 22,
        vr: (Math.random() - 0.5) * 20,
      });
    }
  }

  /** Дождь монет сверху во всю ширину — для крупного выигрыша. */
  rain(count: number) {
    const w = window.innerWidth;
    for (let i = 0; i < this.n(count); i++) {
      this.push({
        kind: 'coin',
        x: Math.random() * w,
        y: -40 - Math.random() * 400,
        vx: (Math.random() - 0.5) * 80,
        vy: 200 + Math.random() * 300,
        g: 900,
        life: 3.2,
        size: 26 + Math.random() * 30,
        vr: (Math.random() - 0.5) * 16,
      });
    }
  }

  /** Искры — вспышка во все стороны. */
  burst(x: number, y: number, count: number, speed = 360) {
    for (let i = 0; i < this.n(count); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random());
      this.push({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        g: 260,
        life: 0.5 + Math.random() * 0.7,
        size: 14 + Math.random() * 26,
      });
    }
  }

  /** Расходящееся кольцо света — удар по символу выигрыша. */
  ring(x: number, y: number, size: number) {
    this.push({ kind: 'ring', x, y, life: 0.6, size });
  }

  /** Конфетти из двух пушек по нижним углам. */
  confetti(count: number) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < this.n(count); i++) {
      const left = i % 2 === 0;
      const a = left ? -Math.PI / 2 + 0.25 + Math.random() * 0.5 : -Math.PI / 2 - 0.25 - Math.random() * 0.5;
      const v = 900 + Math.random() * 700;
      this.push({
        kind: 'confetti',
        x: left ? 0 : w,
        y: h,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        g: 700,
        life: 3.5 + Math.random(),
        size: 8 + Math.random() * 8,
        vr: (Math.random() - 0.5) * 14,
        color: CONFETTI[i % CONFETTI.length],
      });
    }
  }

  clear() {
    this.parts.length = 0;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.clear();
  }

  private run() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const h = window.innerHeight;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life || p.y > h + 80) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      // Сопротивление воздуха: конфетти парит, монета падает.
      const drag = p.kind === 'confetti' ? 1.6 : p.kind === 'spark' ? 2.2 : 0.4;
      p.vx -= p.vx * drag * dt;
      if (p.kind === 'confetti') p.vy -= p.vy * 1.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.spin += p.vr * dt;
      p.rot += p.vr * 0.4 * dt;
      const fade = Math.min(1, (p.life - p.age) / 0.4);
      this.draw(p, fade);
    }
    if (this.parts.length) this.raf = requestAnimationFrame(this.frame);
    else {
      this.raf = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  };

  private draw(p: P, fade: number) {
    const { ctx, dpr } = this;
    ctx.globalAlpha = fade;
    switch (p.kind) {
      case 'coin': {
        // Монета вращается вокруг вертикали: ширина — косинус, ребром — тёмная полоса.
        const sx = Math.cos(p.spin);
        ctx.globalCompositeOperation = 'source-over';
        ctx.setTransform(dpr * sx, 0, 0, dpr, p.x * dpr, p.y * dpr);
        ctx.rotate(p.rot * 0.2);
        if (Math.abs(sx) < 0.18) {
          ctx.fillStyle = '#8a5600';
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        } else {
          ctx.drawImage(this.coin, -p.size / 2, -p.size / 2, p.size, p.size);
        }
        break;
      }
      case 'spark': {
        ctx.globalCompositeOperation = 'lighter';
        const s = p.size * (1 - p.age / p.life / 2);
        ctx.setTransform(dpr, 0, 0, dpr, p.x * dpr, p.y * dpr);
        ctx.drawImage(this.spark, -s / 2, -s / 2, s, s);
        break;
      }
      case 'confetti': {
        ctx.globalCompositeOperation = 'source-over';
        ctx.setTransform(dpr, 0, 0, dpr, p.x * dpr, p.y * dpr);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.spin));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        break;
      }
      case 'ring': {
        ctx.globalCompositeOperation = 'lighter';
        const u = p.age / p.life;
        ctx.setTransform(dpr, 0, 0, dpr, p.x * dpr, p.y * dpr);
        ctx.strokeStyle = `rgba(255,220,120,${(1 - u) * 0.9})`;
        ctx.lineWidth = 6 * (1 - u) + 1;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * (0.4 + u * 0.9), 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
    }
    ctx.globalAlpha = 1;
  }
}
