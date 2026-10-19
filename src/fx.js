// Particles (flour puffs, steam, the hot potato explosion) and DOM screen effects.
import * as THREE from 'three';
import { softDot } from './textures.js';

export class Particles {
  constructor(scene, max = 500) {
    this.max = max;
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot() }, scale: { value: 400 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC;
        uniform float scale;
        void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); if (gl_FragColor.a < 0.01) discard; }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.p = [];
  }

  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, opts = {}) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({ x, y, z, vx, vy, vz, life, max: life, size, r, g, b, drag: opts.drag ?? 2, grav: opts.grav ?? 0, grow: opts.grow ?? 1.5, fade: opts.fade ?? 1 });
  }

  burst(kind, at) {
    const [x, y, z] = at;
    const R = (a, b) => a + Math.random() * (b - a);
    if (kind === 'boom') {
      for (let i = 0; i < 140; i++) {
        const a = Math.random() * Math.PI * 2, e = R(-0.4, 1.2), s = R(1.5, 6.5);
        const w = R(0.85, 1);
        this.spawn(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 0.8, Math.sin(a) * Math.cos(e) * s, R(0.9, 2.0), R(0.18, 0.45), w, w * 0.97, w * 0.93, { drag: 2.8, grav: -0.3, grow: 2.2 });
      }
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2, e = R(-0.2, 1.3), s = R(3, 9);
        this.spawn(x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s, R(0.3, 0.8), R(0.05, 0.12), 1, R(0.5, 0.8), 0.15, { drag: 1.5, grav: 6, grow: 0.2 });
      }
      for (let i = 0; i < 25; i++) this.spawn(x, y, z, R(-1, 1), R(-1, 1), R(-1, 1), R(0.2, 0.4), R(0.4, 0.9), 1, 0.75, 0.3, { drag: 3, grow: 3 });
    } else if (kind === 'puff') {
      for (let i = 0; i < 9; i++) this.spawn(x, y, z, R(-0.8, 0.8), R(0.1, 0.9), R(-0.8, 0.8), R(0.35, 0.7), R(0.03, 0.07), 1, 0.98, 0.95, { drag: 4, grow: 1.6 });
    } else if (kind === 'steam') {
      this.spawn(x + R(-0.03, 0.03), y + 0.06, z + R(-0.03, 0.03), R(-0.08, 0.08), R(0.3, 0.6), R(-0.08, 0.08), R(0.5, 0.9), R(0.03, 0.06), 1, 0.85, 0.75, { drag: 1, grav: -0.2, grow: 2 });
    }
  }

  update(dt) {
    let k = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.life -= dt;
      if (q.life <= 0) { this.p.splice(i, 1); continue; }
      const dr = Math.exp(-q.drag * dt);
      q.vx *= dr; q.vy = q.vy * dr - q.grav * dt; q.vz *= dr;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.02) { q.y = 0.02; q.vy = Math.abs(q.vy) * 0.2; }
    }
    for (const q of this.p) {
      const t = q.life / q.max;
      this.pos[k * 3] = q.x; this.pos[k * 3 + 1] = q.y; this.pos[k * 3 + 2] = q.z;
      this.col[k * 3] = q.r; this.col[k * 3 + 1] = q.g; this.col[k * 3 + 2] = q.b;
      this.size[k] = q.size * (1 + (1 - t) * q.grow);
      this.alpha[k] = Math.min(1, t * 2.2) * 0.85;
      k++;
    }
    this.geo.setDrawRange(0, k);
    for (const a of ['position', 'color', 'size', 'alpha']) this.geo.attributes[a].needsUpdate = true;
  }
}

export class ScreenFX {
  constructor() {
    this.eyes = document.getElementById('fx-eyes');
    this.vig = document.getElementById('fx-vig');
    this.splatEl = document.getElementById('fx-splat');
    this.flashEl = document.getElementById('fx-flash');
    this.hot = document.getElementById('fx-hot');
  }
  restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  splat() { this.restart(this.splatEl, 'on'); }
  flash() { this.restart(this.flashEl, 'on'); }
  setEyes(closed) { this.eyes.classList.toggle('closed', !!closed); }
  setVignette(on) { this.vig.classList.toggle('on', !!on); }
  setHot(h) { this.hot.style.boxShadow = h > 0 ? `inset 0 0 ${40 + h * 120}px ${h * 30}px rgba(255,${90 - h * 50},40,${h * 0.45})` : 'none'; }
  clear() { this.setEyes(false); this.setVignette(false); this.setHot(0); }
}
