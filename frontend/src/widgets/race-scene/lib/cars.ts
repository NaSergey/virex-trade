import type { CarId } from '@/entities/race';
import { circ, ell, G, hex, line, paintOn, poly, rgb, rr, shade, tint, type RGB } from './paint';

export interface CarLook {
  dead?: boolean;
  brake?: boolean;
  /** Секунды для мигания маячков. */
  t: number;
}

function tail(x: number, y: number, w: number, h: number, o: CarLook, round = false) {
  if (o.dead) {
    G.fillStyle = '#2e1414';
    if (round) circ(x, y, w);
    else G.fillRect(x, y, w, h);
    return;
  }
  G.save();
  G.globalCompositeOperation = 'lighter';
  G.fillStyle = o.brake ? 'rgba(255,50,40,.42)' : 'rgba(255,40,40,.2)';
  if (round) circ(x, y, w * 2.2);
  else rr(x - 8, y - 8, w + 16, h + 16, 9);
  G.restore();
  G.fillStyle = o.brake ? '#ff6250' : '#e2302b';
  if (round) circ(x, y, w);
  else G.fillRect(x, y, w, h);
  G.fillStyle = 'rgba(255,224,214,.75)';
  if (round) circ(x, y, w * 0.4);
  else G.fillRect(x + 2, y + h * 0.35, w - 4, Math.max(1, h * 0.3));
}

/** Машина сзади: ширина 200 единиц, (0,0) — земля под центром. Рисует на текущем `G`. */
export function carShape(type: CarId, col: RGB, o: CarLook) {
  const c: RGB = o.dead ? [48, 44, 42] : col;
  const dk = shade(c, 0.42);
  const md = shade(c, 0.7);
  const lt = tint(c, 0.3);
  G.fillStyle = 'rgba(0,0,0,.6)';
  ell(0, 2, 114, 13);
  if (!o.dead) {
    G.save();
    G.globalCompositeOperation = 'lighter';
    G.fillStyle = rgb(c, 0.2);
    ell(0, 4, 122, 17);
    G.restore();
  }
  if (type === 'arrow') {
    G.fillStyle = '#09090b';
    rr(-99, -30, 30, 30, 5);
    rr(69, -30, 30, 30, 5);
    G.fillStyle = rgb(dk);
    poly([-100, -12, 100, -12, 101, -44, 92, -54, -92, -54, -101, -44]);
    G.fillStyle = rgb(c);
    poly([-101, -40, 101, -40, 96, -55, -96, -55]);
    G.fillStyle = rgb(md);
    poly([-66, -55, -46, -82, 46, -82, 66, -55]);
    G.fillStyle = '#0c0f15';
    poly([-56, -58, -41, -78, 41, -78, 56, -58]);
    G.strokeStyle = 'rgba(255,255,255,.14)';
    G.lineWidth = 2.5;
    line(-28, -76, -44, -60);
    G.fillStyle = rgb(dk);
    G.fillRect(-58, -67, 6, 12);
    G.fillRect(52, -67, 6, 12);
    G.fillStyle = rgb(shade(c, 0.28));
    G.fillRect(-102, -72, 204, 6);
    G.fillStyle = rgb(lt);
    G.fillRect(-102, -72, 204, 1.8);
    G.fillStyle = '#0a0a0c';
    poly([-74, -12, 74, -12, 62, -2, -62, -2]);
    G.fillStyle = '#1d1d22';
    circ(-20, -9, 5.5);
    circ(20, -9, 5.5);
    G.fillStyle = o.dead ? '#111' : '#ff9a4a';
    circ(-20, -9, 2.4);
    circ(20, -9, 2.4);
    G.fillStyle = o.dead ? '#2a2826' : '#d9d4c6';
    G.fillRect(-15, -31, 30, 9);
    tail(-88, -42, 176, 5, o);
  } else if (type === 'buggy') {
    G.fillStyle = '#0a0a0c';
    rr(-104, -58, 40, 58, 9);
    rr(64, -58, 40, 58, 9);
    G.strokeStyle = '#26262c';
    G.lineWidth = 3;
    for (let y = -50; y < -4; y += 9) {
      line(-100, y, -68, y);
      line(68, y, 100, y);
    }
    G.fillStyle = rgb(dk);
    G.fillRect(-64, -42, 128, 26);
    G.fillStyle = rgb(c);
    poly([-108, -56, -62, -56, -62, -66, -100, -68]);
    poly([108, -56, 62, -56, 62, -66, 100, -68]);
    G.fillStyle = '#24242a';
    rr(-34, -72, 68, 34, 4);
    G.fillStyle = '#35353d';
    for (let k = 0; k < 5; k++) G.fillRect(-28 + k * 12, -68, 7, 26);
    G.strokeStyle = '#5c5c64';
    G.lineWidth = 6;
    line(-16, -72, -22, -98);
    line(16, -72, 22, -98);
    G.strokeStyle = rgb(c);
    G.lineWidth = 7;
    G.lineJoin = 'round';
    G.beginPath();
    G.moveTo(-56, -36);
    G.lineTo(-44, -120);
    G.lineTo(44, -120);
    G.lineTo(56, -36);
    G.stroke();
    line(-50, -86, 50, -86);
    line(-44, -120, 50, -86);
    G.fillStyle = rgb(lt);
    circ(0, -102, 14);
    G.fillStyle = '#0c0f15';
    rr(-10, -106, 20, 7, 3);
    G.fillStyle = o.dead ? '#2a2826' : '#d9d4c6';
    G.fillRect(-14, -28, 28, 8);
    tail(-52, -38, 6, 6, o, true);
    tail(52, -38, 6, 6, o, true);
  } else {
    G.fillStyle = '#0a0a0c';
    rr(-98, -40, 36, 40, 6);
    rr(62, -40, 36, 40, 6);
    G.fillStyle = rgb(dk);
    poly([-96, -18, 96, -18, 96, -120, 82, -136, -82, -136, -96, -120]);
    G.fillStyle = rgb(md);
    poly([-88, -26, 88, -26, 88, -116, 76, -128, -76, -128, -88, -116]);
    G.strokeStyle = rgb(shade(c, 0.36));
    G.lineWidth = 3;
    line(0, -28, 0, -126);
    G.strokeRect(-80, -112, 72, 80);
    G.strokeRect(8, -112, 72, 80);
    G.fillStyle = rgb(tint(c, 0.12));
    const rivets = [
      [-76, -108],
      [-12, -108],
      [12, -108],
      [76, -108],
      [-76, -36],
      [-12, -36],
      [12, -36],
      [76, -36],
    ];
    for (const [x, y] of rivets) circ(x, y, 2.2);
    G.fillStyle = '#0c0f15';
    G.fillRect(-60, -104, 36, 7);
    G.fillRect(24, -104, 36, 7);
    G.fillStyle = '#0d0d10';
    circ(44, -66, 21);
    G.fillStyle = '#2a2a30';
    circ(44, -66, 9);
    G.save();
    G.beginPath();
    G.rect(-100, -26, 200, 12);
    G.clip();
    G.fillStyle = o.dead ? '#2a2624' : '#d9a14f';
    G.fillRect(-100, -26, 200, 12);
    G.fillStyle = '#121010';
    for (let x = -110; x < 110; x += 20) poly([x, -14, x + 10, -14, x + 22, -26, x + 12, -26]);
    G.restore();
    tail(-90, -50, 14, 10, o);
    tail(76, -50, 14, 10, o);
    const on = !o.dead && Math.floor(o.t * 3) % 2 === 1;
    G.fillStyle = on ? '#ffb24a' : '#5a4220';
    G.fillRect(-34, -143, 16, 7);
    G.fillStyle = on ? '#5a4220' : '#ffb24a';
    G.fillRect(18, -143, 16, 7);
  }
}

/** Машина в гараже: та же фигура на кусочке ночной дороги. */
export function drawCarPreview(canvas: HTMLCanvasElement, type: CarId, color: string) {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = '#0d0c11';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1c1b20';
  g.beginPath();
  g.moveTo(W * 0.38, H * 0.3);
  g.lineTo(W * 0.62, H * 0.3);
  g.lineTo(W * 1.05, H);
  g.lineTo(-W * 0.05, H);
  g.fill();
  g.fillStyle = '#7a5828';
  g.beginPath();
  g.moveTo(W * 0.37, H * 0.3);
  g.lineTo(W * 0.38, H * 0.3);
  g.lineTo(-W * 0.05, H);
  g.lineTo(-W * 0.1, H);
  g.fill();
  g.beginPath();
  g.moveTo(W * 0.62, H * 0.3);
  g.lineTo(W * 0.63, H * 0.3);
  g.lineTo(W * 1.1, H);
  g.lineTo(W * 1.05, H);
  g.fill();
  paintOn(g);
  g.save();
  g.translate(W / 2, H - (10 * W) / 224);
  g.scale((0.78 * W) / 224, (0.78 * W) / 224);
  carShape(type, hex(color), { t: 0.2 });
  g.restore();
}
