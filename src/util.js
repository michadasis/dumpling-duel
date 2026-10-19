import { EYE, CROUCH_EYE } from './config.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a, b) => a + Math.random() * (b - a);
export const r3 = (v) => Math.round(v * 1000) / 1000;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, r = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function angleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const eyeY = (p) => (p.crouch ? CROUCH_EYE : EYE);
export const headY = (p) => eyeY(p) + 0.08;

export function forward(yaw, pitch = 0) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

// Point where a throw leaves the right hand.
export function throwOrigin(p, dir) {
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  return {
    x: p.x + rx * 0.2 + dir.x * 0.4,
    y: eyeY(p) - 0.14 + dir.y * 0.4,
    z: p.z + rz * 0.2 + dir.z * 0.4,
  };
}

// Distance from a point to a vertical segment at (x, z) between y0 and y1.
export function distToColumn(px, py, pz, x, z, y0, y1) {
  const dx = px - x, dz = pz - z;
  const cy = clamp(py, y0, y1);
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Zone where a player's hands can catch: a column slightly in front of the chest.
export function catchDistance(p, pos) {
  const f = forward(p.yaw, 0);
  const top = eyeY(p) + 0.22;
  return distToColumn(pos.x, pos.y, pos.z, p.x + f.x * 0.22, p.z + f.z * 0.22, Math.max(0.35, top - 1.35), top);
}

export function bodyDistance(p, pos) {
  return distToColumn(pos.x, pos.y, pos.z, p.x, p.z, 0.25, eyeY(p) + 0.2);
}

export function randomCode(n = 5) {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export function safeStorage() {
  const mem = {};
  return {
    get(k, d) {
      try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return k in mem ? mem[k] : d; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch { mem[k] = v; }
    },
  };
}
