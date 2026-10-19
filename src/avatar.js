// Player bodies. The Male and Female looks are stylized after the two real players (hair, face and outfits).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { labelTex } from './textures.js';
import { damp, clamp } from './util.js';

export const LOOKS = [
  {
    // Male: dark brown curly mullet (textured fringe on top, faded sides, longer at the back), thick straight brows, light stubble, grey hoodie.
    skin: '#e9bd9c', hair: '#3a281d', style: 'crop', brows: 'thick',
    top: { kind: 'hoodie', color: '#8f9297', dark: '#74777c' },
    pants: '#25282e', shoes: '#1d1d1f', soles: '#f2f2f2', lips: '#b87a6c', stubble: true,
    head: [1.04, 1.0, 1.0], shoulders: 1.14,
  },
  {
    // Female: long very dark brown hair with a middle part, curtain bangs and wavy ends, red lips, nose ring,
    // black denim jacket over a black hoodie, light blue jeans.
    skin: '#efcdb6', hair: '#1d1512', tip: '#4b3023', style: 'long', brows: 'arched',
    top: { kind: 'jacket', color: '#2e2e33', dark: '#3c3c42', inner: '#121214' },
    pants: '#7f9dc4', shoes: '#f1f1f1', soles: '#d9d9d9', lips: '#b04a53', noseRing: true, lashes: true,
    head: [0.95, 1.02, 0.97], shoulders: 1.02,
  },
];

const mat = (color, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function cap(r, len, m) {
  const c = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), m);
  c.castShadow = true;
  return c;
}
function sph(r, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), m);
  s.position.set(x, y, z); s.scale.set(sx, sy, sz); s.castShadow = true;
  return s;
}

function buildHair(look, pivot) {
  const hair = mat(look.hair, 0.85);
  const rnd = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
  if (look.style === 'crop') {
    // textured top
    pivot.add(sph(0.15, hair, 0, 0.178, -0.004, 1.04, 0.6, 1.0));
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2, r = 0.03 + rnd() * 0.075;
      pivot.add(sph(0.026 + rnd() * 0.012, hair, Math.cos(a) * r, 0.235 + rnd() * 0.02 - r * 0.25, Math.sin(a) * r - 0.01));
    }
    // fringe down to the brows
    const fr = new THREE.Mesh(new RoundedBoxGeometry(0.235, 0.05, 0.06, 2, 0.02), hair);
    fr.position.set(0, 0.195, -0.1); fr.rotation.x = 0.35; fr.castShadow = true; pivot.add(fr);
    for (let i = 0; i < 7; i++) pivot.add(sph(0.02, hair, -0.09 + i * 0.03, 0.178 - (i % 2) * 0.006, -0.118 + Math.abs(i - 3) * 0.004));
    // short faded sides (left open at the front so the face stays clear)
    const fade = mat(new THREE.Color(look.hair).lerp(new THREE.Color(look.skin), 0.28), 0.95);
    const side = new THREE.Mesh(new THREE.SphereGeometry(0.1375, 28, 16, Math.PI * 1.5 + 0.9, Math.PI * 2 - 1.8, 0.16 * Math.PI, 0.34 * Math.PI), fade);
    side.position.y = 0.11; side.scale.set(look.head[0], look.head[1], look.head[2]); pivot.add(side);
    // modern mullet: full textured hair over the back of the head, nothing hanging down the neck
    const backCap = new THREE.Mesh(new THREE.SphereGeometry(0.142, 28, 16, Math.PI * 0.5 - 1.05, 2.1, 0.12 * Math.PI, 0.46 * Math.PI), hair);
    backCap.position.y = 0.11; backCap.scale.set(look.head[0], look.head[1], look.head[2]); backCap.castShadow = true; pivot.add(backCap);
  } else {
    // long hair: crown tilted so the forehead shows, with a thin middle part
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.148, 28, 18, 0, Math.PI * 2, 0, 0.5 * Math.PI), hair);
    crown.position.set(0, 0.112, 0.006); crown.scale.set(look.head[0] * 1.03, 1.08, look.head[2] * 1.05); crown.rotation.x = 0.42; crown.castShadow = true;
    pivot.add(crown);
    // curtain bangs sweeping out from the part, framing the eyes
    for (const s of [-1, 1]) {
      const b = sph(0.05, hair, s * 0.098, 0.185, -0.11, 0.5, 1.25, 0.3); b.rotation.z = s * 0.7; pivot.add(b);
      const c = sph(0.04, hair, s * 0.122, 0.12, -0.085, 0.45, 1.4, 0.45); c.rotation.z = s * 0.15; pivot.add(c);
    }
    // back curtain of hair down to mid-back
    const back = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.56, 0.13, 3, 0.055), hair);
    back.position.set(0, -0.06, 0.065); back.castShadow = true; pivot.add(back);
    const tip = mat(look.tip, 0.85);
    for (let i = 0; i < 6; i++) pivot.add(sph(0.045, i % 2 ? tip : hair, -0.12 + i * 0.048, -0.33 + (i % 2) * 0.02, 0.07, 1, 1.2, 0.8));
    // face-framing strands falling to the shoulders
    for (const s of [-1, 1]) {
      const st = cap(0.036, 0.3, hair); st.position.set(s * 0.13, -0.07, -0.03); st.rotation.set(-0.1, 0, s * 0.08); pivot.add(st);
    }
  }
}

function buildTop(look, torso, arms) {
  const t = look.top;
  const cloth = mat(t.color, 0.9), dark = mat(t.dark, 0.9);
  const chest = cap(0.17, 0.36, cloth); chest.scale.set(look.shoulders, 1, 0.78); chest.position.y = 0.3; torso.add(chest);
  if (t.kind === 'hoodie') {
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.11, 0.04), dark); pocket.position.set(0, 0.2, -0.125); torso.add(pocket);
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.048, 8, 16), cloth); hood.rotation.x = Math.PI / 2.4; hood.position.set(0, 0.6, 0.06); hood.castShadow = true; torso.add(hood);
    const str = mat('#d8d8d8', 0.7);
    for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 5), str); c.position.set(s * 0.035, 0.5, -0.135); torso.add(c); }
  } else {
    const inner = mat(t.inner, 0.95);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.42, 0.02), inner); strip.position.set(0, 0.36, -0.133); torso.add(strip);
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.042, 8, 16), inner); hood.rotation.x = Math.PI / 2.4; hood.position.set(0, 0.6, 0.07); torso.add(hood);
    for (const s of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.02), dark); col.position.set(s * 0.07, 0.58, -0.105); col.rotation.set(0.5, 0, s * 0.5); torso.add(col);
      const pk = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.015), dark); pk.position.set(s * 0.1, 0.42, -0.128); torso.add(pk);
      const btn = sph(0.007, mat('#c9c9c9', 0.3, 0.9), s * 0.1, 0.45, -0.137); torso.add(btn);
    }
    for (let i = 0; i < 4; i++) torso.add(sph(0.006, mat('#c9c9c9', 0.3, 0.9), 0.055, 0.2 + i * 0.09, -0.136));
  }
  return cloth;
}

export class Avatar {
  constructor(look, tagColor, name) {
    this.look = look;
    this.root = new THREE.Group();
    const jeans = mat(look.pants, 0.9);
    const shoe = mat(look.shoes, 0.6), sole = mat(look.soles, 0.6);
    this.skin = mat(look.skin, 0.7);
    const ink = mat('#1d1714', 0.4);

    this.hips = new THREE.Group(); this.hips.position.y = 0.88; this.root.add(this.hips);
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.095, 0, 0); this.hips.add(hip);
      const thigh = cap(0.07, 0.3, jeans); thigh.position.y = -0.21; hip.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
      const shin = cap(0.062, 0.3, jeans); shin.position.y = -0.2; knee.add(shin);
      const foot = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.08, 0.25, 2, 0.03), shoe); foot.position.set(0, -0.42, -0.04); foot.castShadow = true; knee.add(foot);
      const so = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.022, 0.25), sole); so.position.set(0, -0.455, -0.04); knee.add(so);
      this.legs.push({ hip, knee });
    }
    this.torso = new THREE.Group(); this.hips.add(this.torso);
    const cloth = buildTop(look, this.torso);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), this.skin); neck.position.y = 0.66; this.torso.add(neck);

    this.headPivot = new THREE.Group(); this.headPivot.position.y = 0.7; this.torso.add(this.headPivot);
    const hp = this.headPivot;
    const head = sph(0.135, this.skin, 0, 0.11, 0, ...look.head); hp.add(head);
    this.head = head;
    for (const s of [-1, 1]) hp.add(sph(0.03, this.skin, s * 0.135 * look.head[0], 0.1, 0.005, 0.45, 1, 0.8));
    hp.add(sph(0.021, mat(new THREE.Color(look.skin).multiplyScalar(0.94), 0.7), 0, 0.095, -0.136, 0.8, 1.05, 1.1));
    buildHair(look, hp);

    this.eyes = [];
    const browMat = mat(look.hair, 0.8);
    for (const s of [-1, 1]) {
      const e = sph(0.018, ink, s * 0.047, 0.127, -0.127, 1, 1.25, 0.5); e.castShadow = false; hp.add(e);
      const hl = sph(0.005, new THREE.MeshBasicMaterial({ color: '#ffffff' }), s * 0.047 - 0.005, 0.133, -0.135); hp.add(hl);
      const thick = look.brows === 'thick';
      const brow = new THREE.Mesh(new THREE.BoxGeometry(thick ? 0.052 : 0.044, thick ? 0.015 : 0.009, 0.012), browMat);
      const by = thick ? 0.163 : 0.166;
      brow.position.set(s * 0.048, by, -0.128);
      brow.rotation.z = thick ? 0 : s * -0.18;
      hp.add(brow);
      if (look.lashes) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.005, 0.01), ink); l.position.set(s * 0.05, 0.142, -0.131); l.rotation.z = s * -0.25; hp.add(l); }
      this.eyes.push({ e, hl, brow, s, by, bz: brow.rotation.z });
    }
    const lips = mat(look.lips, 0.5);
    this.mouth = new THREE.Group(); hp.add(this.mouth);
    if (look.lashes) {
      this.mouth.add(sph(0.017, lips, 0, 0.068, -0.129, 1.35, 0.42, 0.5), sph(0.016, lips, 0, 0.06, -0.128, 1.2, 0.5, 0.5));
    } else {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 12, Math.PI), lips); m.position.set(0, 0.068, -0.132); m.rotation.z = Math.PI; this.mouth.add(m);
    }
    this.mouthO = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.007, 6, 12), ink);
    this.mouthO.position.set(0, 0.066, -0.132); this.mouthO.visible = false; hp.add(this.mouthO);
    if (look.stubble) {
      const stub = new THREE.Mesh(new THREE.SphereGeometry(0.1365, 24, 12, Math.PI * 1.5 - 0.95, 1.9, 0.6 * Math.PI, 0.3 * Math.PI),
        new THREE.MeshStandardMaterial({ color: '#3a2a20', transparent: true, opacity: 0.13, roughness: 1, depthWrite: false }));
      stub.position.y = 0.11; stub.scale.set(...look.head); hp.add(stub);
    }
    if (look.noseRing) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.007, 0.0018, 6, 14), mat('#d9d9d9', 0.2, 1));
      ring.position.set(-0.013, 0.085, -0.142); ring.rotation.y = 0.5; hp.add(ring);
    }
    const blush = new THREE.MeshBasicMaterial({ color: '#ff9b9b', transparent: true, opacity: 0.22, depthWrite: false });
    for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CircleGeometry(0.022, 12), blush); b.position.set(s * 0.082, 0.09, -0.12); b.rotation.y = Math.PI + s * 0.5; hp.add(b); }
    this.soot = new THREE.Mesh(new THREE.SphereGeometry(0.139, 20, 14), new THREE.MeshBasicMaterial({ color: '#1a1410', transparent: true, opacity: 0 }));
    this.soot.position.y = 0.11; this.soot.scale.set(...look.head); hp.add(this.soot);

    this.arms = [];
    const sw = look.shoulders > 1.08 ? 0.215 : 0.2;
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * sw, 0.55, 0); this.torso.add(sh);
      const up = cap(0.055, 0.2, cloth); up.position.y = -0.14; sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
      const fo = cap(0.05, 0.19, cloth); fo.position.y = -0.13; el.add(fo);
      const hand = sph(0.052, this.skin, 0, -0.29, 0); el.add(hand);
      const anchor = new THREE.Group(); anchor.position.set(0, -0.36, -0.03); el.add(anchor);
      this.arms.push({ sh, el, hand, anchor, s });
    }
    this.holdAnchor = this.arms[1].anchor;

    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(name, tagColor), depthTest: true, transparent: true }));
    this.tag.scale.set(0.62, 0.155, 1); this.tag.position.y = 2.08; this.root.add(this.tag);

    this.walk = 0; this.hit = 0; this.hitDir = 1; this.throwT = 0; this.prev = null; this.sootT = 0; this.celebrate = 0;
    this.st = { crouch: 0, catch: 0, charge: 0, brace: 0, eyes: 0 };
  }

  setName(name, color) {
    this.tag.material.map?.dispose();
    this.tag.material.map = labelTex(name, color);
    this.tag.material.needsUpdate = true;
  }

  bonk(strength = 1) { this.hit = Math.min(1.2, this.hit + 0.6 + strength * 0.6); this.hitDir = Math.random() < 0.5 ? -1 : 1; }
  throwAnim() { this.throwT = 0.35; }
  sootify() { this.sootT = 4.5; }

  update(dt, p, holding) {
    // p: { x, z, yaw, pitch, crouch, handsOut, brace, eyes, charging, power }
    const st = this.st;
    if (this.prev) {
      const sp = Math.hypot(p.x - this.prev.x, p.z - this.prev.z) / Math.max(dt, 1e-3);
      this.walk += clamp(sp, 0, 3) * dt * 7;
      this.speed = damp(this.speed || 0, clamp(sp / 2.5, 0, 1), 10, dt);
    }
    this.prev = { x: p.x, z: p.z };
    this.root.position.set(p.x, 0, p.z);
    this.root.rotation.y = p.yaw;
    st.crouch = damp(st.crouch, p.crouch ? 1 : 0, 14, dt);
    st.catch = damp(st.catch, p.handsOut ? 1 : 0, 18, dt);
    st.charge = damp(st.charge, p.charging ? 0.4 + p.power * 0.6 : 0, 12, dt);
    st.brace = damp(st.brace, p.brace ? 1 : 0, 10, dt);
    st.eyes = damp(st.eyes, p.eyes ? 1 : 0, 14, dt);
    this.hit = Math.max(0, this.hit - dt * 2.2);
    this.throwT = Math.max(0, this.throwT - dt);

    const sw = Math.sin(this.walk) * 0.55 * (this.speed || 0);
    const c = st.crouch;
    this.hips.position.y = 0.88 - c * 0.42 + Math.abs(Math.cos(this.walk)) * 0.02 * (this.speed || 0);
    for (const [k, L] of this.legs.entries()) {
      const s = k === 0 ? 1 : -1;
      L.hip.rotation.x = s * sw + c * 1.25;
      L.knee.rotation.x = -Math.max(0, -s * sw) * 0.8 - c * 2.0;
    }
    this.torso.rotation.x = -c * 0.35 - st.brace * 0.06;
    this.torso.position.y = Math.sin(performance.now() * 0.002) * 0.01;

    // head: look pitch, brace tuck, hit snap
    this.headPivot.rotation.x = clamp(p.pitch * 0.6, -0.5, 0.5) - st.brace * 0.18 + this.hit * 0.7 + c * 0.2;
    this.headPivot.rotation.z = this.hit * 0.35 * this.hitDir + st.eyes * 0.15;
    this.headPivot.rotation.y = st.eyes * 0.35;
    for (const E of this.eyes) {
      const shut = Math.max(st.eyes, this.hit > 0.3 ? 0.85 : 0, st.brace * 0.6);
      E.e.scale.y = 1.25 * (1 - shut * 0.88);
      E.hl.visible = shut < 0.5;
      E.brow.rotation.z = E.bz + E.s * (st.brace * 0.5 - this.hit * 0.3);
      E.brow.position.y = E.by - st.brace * 0.01;
    }
    this.mouth.visible = this.hit < 0.3 && st.brace < 0.5;
    this.mouthO.visible = !this.mouth.visible;
    this.mouthO.scale.setScalar(st.brace > 0.5 ? 0.6 : 1);
    if (this.sootT > 0) { this.sootT -= dt; this.soot.material.opacity = Math.min(0.85, this.sootT); } else this.soot.material.opacity = 0;

    // arms
    const [L, R] = this.arms;
    const sw2 = -sw * 0.7;
    let lx = sw2, rx = -sw2, lz = 0.08, rz = -0.08, le = 0.25, re = 0.25;
    if (holding) { rx = 0.6; re = 1.1; }
    if (st.charge > 0.01) { rx = 0.6 + (-2.5 - 0.6) * Math.min(1, st.charge * 1.4); rz = -0.25; re = 1.3; lx = 1.25 * st.charge; le = 0.3; }
    if (this.throwT > 0) { const t = 1 - this.throwT / 0.35; rx = -2.5 - t * 2.9; re = 0.3; }
    if (st.catch > 0.01) { lx = lx * (1 - st.catch) + 1.45 * st.catch; rx = rx * (1 - st.catch) + 1.45 * st.catch; lz = 0.08 + 0.3 * st.catch; rz = -0.08 - 0.3 * st.catch; le = 0.35; re = 0.35; }
    if (st.brace > 0.01) { lx = 0.9 * st.brace; rx = 0.9 * st.brace; lz = 0.45 * st.brace; rz = -0.45 * st.brace; le = 2.2 * st.brace; re = 2.2 * st.brace; }
    if (this.celebrate > 0) { this.celebrate -= dt; lx = 2.9; rx = 2.9; lz = -0.3; rz = 0.3; le = 0.2; re = 0.2; }
    // The avatar faces -z locally; positive x-rotation swings an arm forward.
    L.sh.rotation.set(lx, 0, lz); R.sh.rotation.set(rx, 0, rz);
    L.el.rotation.x = le; R.el.rotation.x = re;
    L.sh.position.y = 0.55 + st.brace * 0.03; R.sh.position.y = 0.55 + st.brace * 0.03;
  }
}
