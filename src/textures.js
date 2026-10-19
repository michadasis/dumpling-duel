// Procedural canvas textures that recreate the studio's surfaces.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

export function tex(c, { repeat = [1, 1], srgb = true, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

function clip(g, x, y, w, h, fn) { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); fn(); g.restore(); }

// Beige 45 cm ceramic floor tiles. One texture = 4 x 4 tiles = 1.8 m.
export function floorTiles() {
  const N = 4, S = 256, W = N * S, Gr = 4;
  const [c, g] = mk(W, W);
  const [rc, rg] = mk(W, W);
  const rnd = mulberry32(11);
  g.fillStyle = '#ab9c84'; g.fillRect(0, 0, W, W);
  rg.fillStyle = '#e6e6e6'; rg.fillRect(0, 0, W, W);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = i * S + Gr / 2, y = j * S + Gr / 2, s = S - Gr;
    const l = 80 + (rnd() - 0.5) * 3, h = 38 + (rnd() - 0.5) * 4, sa = 22 + (rnd() - 0.5) * 6;
    g.fillStyle = `hsl(${h} ${sa}% ${l}%)`; g.fillRect(x, y, s, s);
    clip(g, x, y, s, s, () => {
      for (let k = 0; k < 16; k++) {
        const cx = x + rnd() * s, cy = y + rnd() * s, r = 25 + rnd() * 80;
        const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        const dark = rnd() < 0.55;
        grd.addColorStop(0, dark ? 'rgba(140,118,88,0.09)' : 'rgba(255,252,244,0.10)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd; g.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      for (let k = 0; k < 650; k++) {
        const v = rnd();
        g.fillStyle = v < 0.5 ? `rgba(110,92,70,${0.07 + rnd() * 0.16})` : `rgba(255,255,250,${0.08 + rnd() * 0.16})`;
        const sz = 0.8 + rnd() * 2.4;
        g.fillRect(x + rnd() * s, y + rnd() * s, sz, sz);
      }
    });
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x, y, s, 2); g.fillRect(x, y, 2, s);
    g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(x, y + s - 2, s, 2); g.fillRect(x + s - 2, y, 2, s);
    const rv = 58 + rnd() * 22 | 0;
    rg.fillStyle = `rgb(${rv},${rv},${rv})`; rg.fillRect(x, y, s, s);
  }
  return { map: tex(c), rough: tex(rc, { srgb: false }) };
}

// 15 cm white kitchen wall tiles with faint marbling. One texture = 4 x 4 tiles.
export function backsplash() {
  const N = 4, S = 128, W = N * S;
  const [c, g] = mk(W, W);
  const rnd = mulberry32(5);
  g.fillStyle = '#c9c3b8'; g.fillRect(0, 0, W, W);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = i * S + 2, y = j * S + 2, s = S - 4;
    g.fillStyle = `hsl(40 18% ${92 + (rnd() - 0.5) * 2}%)`; g.fillRect(x, y, s, s);
    clip(g, x, y, s, s, () => {
      g.strokeStyle = 'rgba(160,150,135,0.18)'; g.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) {
        g.beginPath(); let px = x + rnd() * s, py = y + rnd() * s; g.moveTo(px, py);
        for (let m = 0; m < 6; m++) { px += (rnd() - 0.3) * 40; py += (rnd() - 0.5) * 30; g.lineTo(px, py); }
        g.stroke();
      }
    });
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, y, s, 2);
  }
  return tex(c);
}

export function fabric(base = '#808387', seed = 1, size = 256, strength = 0.12) {
  const [c, g] = mk(size, size);
  const rnd = mulberry32(seed);
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let k = 0; k < size * size * 0.35; k++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? `rgba(0,0,0,${rnd() * strength})` : `rgba(255,255,255,${rnd() * strength})`;
    g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  return tex(c);
}

export function wood(base = '#c9a87f', dark = 'rgba(120,85,45,0.22)', seed = 3, w = 256, h = 512) {
  const [c, g] = mk(w, h);
  const rnd = mulberry32(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let k = 0; k < 90; k++) {
    g.strokeStyle = rnd() < 0.7 ? dark : 'rgba(255,240,215,0.18)';
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath();
    let x = rnd() * w; g.moveTo(x, 0);
    const amp = 2 + rnd() * 6, fr = 0.005 + rnd() * 0.02, ph = rnd() * 6;
    for (let y = 0; y <= h; y += 8) g.lineTo(x + Math.sin(y * fr + ph) * amp, y);
    g.stroke();
  }
  return tex(c);
}

function blob(g, pts, w, h) {
  g.beginPath();
  const P = pts.map(([x, y]) => [x * w, y * h]);
  const n = P.length;
  g.moveTo((P[0][0] + P[n - 1][0]) / 2, (P[0][1] + P[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  g.closePath(); g.fill();
}

// Black world-map wall decal (stylized).
export function worldMap() {
  const W = 1024, H = 512;
  const [c, g] = mk(W, H);
  g.fillStyle = '#151515';
  const shapes = [
    [[0.04, 0.2], [0.1, 0.12], [0.2, 0.09], [0.29, 0.11], [0.34, 0.17], [0.3, 0.21], [0.27, 0.27], [0.28, 0.33], [0.24, 0.37], [0.22, 0.43], [0.2, 0.47], [0.22, 0.5], [0.19, 0.5], [0.16, 0.45], [0.13, 0.4], [0.11, 0.33], [0.08, 0.27]],
    [[0.33, 0.05], [0.4, 0.04], [0.42, 0.09], [0.38, 0.15], [0.34, 0.12]],
    [[0.24, 0.52], [0.3, 0.53], [0.35, 0.6], [0.34, 0.67], [0.31, 0.74], [0.29, 0.82], [0.27, 0.9], [0.26, 0.8], [0.25, 0.7], [0.23, 0.6]],
    [[0.46, 0.15], [0.5, 0.12], [0.56, 0.13], [0.58, 0.19], [0.55, 0.25], [0.52, 0.29], [0.49, 0.3], [0.465, 0.27], [0.47, 0.23], [0.45, 0.2]],
    [[0.45, 0.33], [0.52, 0.32], [0.57, 0.36], [0.61, 0.42], [0.59, 0.5], [0.57, 0.6], [0.54, 0.69], [0.51, 0.67], [0.5, 0.57], [0.48, 0.49], [0.45, 0.44], [0.44, 0.38]],
    [[0.56, 0.11], [0.65, 0.07], [0.78, 0.08], [0.9, 0.11], [0.95, 0.17], [0.89, 0.24], [0.85, 0.32], [0.81, 0.4], [0.77, 0.44], [0.73, 0.41], [0.7, 0.47], [0.67, 0.4], [0.62, 0.37], [0.58, 0.31], [0.57, 0.22]],
    [[0.8, 0.61], [0.86, 0.59], [0.9, 0.63], [0.9, 0.71], [0.85, 0.74], [0.8, 0.7]],
    [[0.46, 0.17], [0.47, 0.15], [0.475, 0.2], [0.462, 0.21]],
    [[0.885, 0.25], [0.9, 0.24], [0.895, 0.32], [0.885, 0.3]],
    [[0.6, 0.6], [0.615, 0.58], [0.612, 0.66], [0.6, 0.65]],
    [[0.77, 0.48], [0.82, 0.5], [0.8, 0.53], [0.76, 0.51]],
    [[0.93, 0.76], [0.945, 0.75], [0.94, 0.82], [0.928, 0.8]],
  ];
  for (const s of shapes) blob(g, s, W, H);
  return tex(c, { wrap: false });
}

// Fridge door covered in souvenir magnets.
export function fridgeMagnets() {
  const W = 256, H = 400;
  const [c, g] = mk(W, H);
  const rnd = mulberry32(21);
  g.fillStyle = '#f3f2ee'; g.fillRect(0, 0, W, H);
  const cols = ['#e94f37', '#3f88c5', '#f6ae2d', '#44bba4', '#8e5572', '#2f2f2f', '#f2f2f2', '#ff8fab', '#7cb518', '#ffd166'];
  for (let k = 0; k < 34; k++) {
    const x = 18 + rnd() * (W - 60), y = 20 + rnd() * (H - 80), w = 20 + rnd() * 34, h = 16 + rnd() * 30;
    g.save(); g.translate(x + w / 2, y + h / 2); g.rotate((rnd() - 0.5) * 0.5);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(-w / 2 + 2, -h / 2 + 2, w, h);
    g.fillStyle = cols[k % cols.length];
    if (rnd() < 0.3) { g.beginPath(); g.ellipse(0, 0, w / 2, h / 2, 0, 0, 7); g.fill(); }
    else g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = cols[(k * 3 + 2) % cols.length];
    g.fillRect(-w / 4, -h / 4, w / 2, h / 6);
    g.restore();
  }
  g.fillStyle = '#d9d8d2'; g.fillRect(W - 14, 30, 6, 120);
  return tex(c, { wrap: false });
}

// What you see through the balcony door: Ioannina rooftops and hazy daylight.
export function outsideView() {
  const W = 1024, H = 1024;
  const [c, g] = mk(W, H);
  const rnd = mulberry32(8);
  const sky = g.createLinearGradient(0, 0, 0, H * 0.6);
  sky.addColorStop(0, '#bcd8ee'); sky.addColorStop(1, '#f1f6fa');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = '#aebcc6';
  g.beginPath(); g.moveTo(0, 380);
  for (let x = 0; x <= W; x += 32) g.lineTo(x, 330 + Math.sin(x * 0.006) * 40 + Math.sin(x * 0.021) * 14);
  g.lineTo(W, 520); g.lineTo(0, 520); g.fill();
  const blds = [];
  for (let i = 0; i < 14; i++) blds.push({ x: rnd() * W - 100, w: 140 + rnd() * 220, top: 300 + rnd() * 260 });
  blds.sort((a, b) => a.top - b.top);
  for (const b of blds) {
    const shade = 88 + rnd() * 9;
    g.fillStyle = `hsl(${30 + rnd() * 20} ${8 + rnd() * 10}% ${shade}%)`;
    g.fillRect(b.x, b.top, b.w, H - b.top);
    for (let y = b.top + 24; y < H; y += 62) {
      for (let x = b.x + 16; x < b.x + b.w - 30; x += 46) {
        g.fillStyle = rnd() < 0.5 ? '#6e7b86' : '#8f9ba4'; g.fillRect(x, y, 26, 34);
      }
      g.fillStyle = 'rgba(40,40,40,0.55)'; g.fillRect(b.x + 6, y + 44, b.w - 12, 3);
      for (let x = b.x + 8; x < b.x + b.w - 8; x += 9) g.fillRect(x, y + 44, 2, 14);
    }
    g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(b.x + b.w - 18, b.top, 18, H - b.top);
  }
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `hsl(${95 + rnd() * 30} 30% ${35 + rnd() * 12}%)`;
    g.beginPath(); g.ellipse(rnd() * W, 900 + rnd() * 120, 40 + rnd() * 50, 30 + rnd() * 40, 0, 0, 7); g.fill();
  }
  const haze = g.createLinearGradient(0, 0, 0, H);
  haze.addColorStop(0, 'rgba(255,255,255,0.15)'); haze.addColorStop(1, 'rgba(255,255,255,0.25)');
  g.fillStyle = haze; g.fillRect(0, 0, W, H);
  return tex(c, { wrap: false });
}

export function cork() {
  const W = 256, H = 192;
  const [c, g] = mk(W, H);
  const rnd = mulberry32(31);
  g.fillStyle = '#b58a5c'; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 4000; k++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(90,60,30,0.25)' : 'rgba(230,200,160,0.25)';
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const pal = ['#f4a261', '#2a9d8f', '#e9c46a', '#e76f51', '#8ab17d', '#9fb4c7'];
  for (let k = 0; k < 9; k++) {
    const x = 10 + rnd() * (W - 60), y = 8 + rnd() * (H - 60), w = 34 + rnd() * 18, h = 40 + rnd() * 12;
    g.save(); g.translate(x + w / 2, y + h / 2); g.rotate((rnd() - 0.5) * 0.3);
    g.fillStyle = '#fafafa'; g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = pal[k % pal.length]; g.fillRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 12);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(-w / 6, -h / 6, w / 5, 0, 7); g.fill();
    g.fillStyle = '#d62828'; g.beginPath(); g.arc(0, -h / 2 + 3, 2.5, 0, 7); g.fill();
    g.restore();
  }
  return tex(c, { wrap: false });
}

export function leafPillow() {
  const W = 256, H = 256;
  const [c, g] = mk(W, H);
  const rnd = mulberry32(41);
  g.fillStyle = '#f6f4ee'; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 26; k++) {
    g.save(); g.translate(rnd() * W, rnd() * H); g.rotate(rnd() * 6.3);
    g.fillStyle = rnd() < 0.6 ? '#e9c53a' : '#9a9da0';
    g.beginPath(); g.ellipse(0, 0, 24 + rnd() * 10, 11 + rnd() * 4, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-22, 0); g.lineTo(22, 0); g.stroke();
    g.restore();
  }
  return tex(c);
}

export function grille(lines = 10, bg = '#f2f1ec', fg = 'rgba(60,60,60,0.55)', W = 256, H = 128, from = 0.08, to = 0.4) {
  const [c, g] = mk(W, H);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = fg;
  for (let i = 0; i < lines; i++) {
    const y = H * (from + (to - from) * (i / Math.max(1, lines - 1)));
    g.fillRect(W * 0.06, y, W * 0.88, 2.5);
  }
  return tex(c, { wrap: false });
}

export function curtain(base = [244, 241, 232], W = 256, H = 64, seed = 9) {
  const [c, g] = mk(W, H);
  const rnd = mulberry32(seed);
  for (let x = 0; x < W; x++) {
    const s = 0.86 + 0.14 * Math.sin(x * 0.18 + Math.sin(x * 0.05) * 2) + (rnd() - 0.5) * 0.03;
    g.fillStyle = `rgb(${base[0] * s | 0},${base[1] * s | 0},${base[2] * s | 0})`;
    g.fillRect(x, 0, 1, H);
  }
  return tex(c);
}

export function radialShadow() {
  const [c, g] = mk(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return tex(c, { wrap: false });
}

export function ringTex() {
  const [c, g] = mk(256, 256);
  g.strokeStyle = '#ffffff'; g.lineWidth = 18;
  g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 6; g.setLineDash([16, 14]);
  g.beginPath(); g.arc(128, 128, 76, 0, Math.PI * 2); g.stroke();
  return tex(c, { wrap: false });
}

export function softDot() {
  const [c, g] = mk(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return tex(c, { wrap: false });
}

export function labelTex(text, color = '#ff6f59') {
  const [c, g] = mk(512, 128);
  g.font = '700 54px "Zen Maru Gothic", "Nunito", system-ui, sans-serif';
  const w = Math.min(480, g.measureText(text).width + 60);
  const x = (512 - w) / 2;
  g.fillStyle = 'rgba(43,38,34,0.88)';
  g.beginPath(); g.roundRect(x, 18, w, 84, 42); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc(x + 34, 60, 12, 0, 7); g.fill();
  g.fillStyle = '#fffaf2'; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(text, x + 56, 62, w - 70);
  return tex(c, { wrap: false });
}

export function tapeTex() {
  const [c, g] = mk(64, 256);
  g.fillStyle = '#3b82c4'; g.fillRect(0, 0, 64, 256);
  const rnd = mulberry32(2);
  for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.08})`; g.fillRect(rnd() * 64, rnd() * 256, 2, 2); }
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, 4, 256); g.fillRect(60, 0, 4, 256);
  return tex(c);
}
