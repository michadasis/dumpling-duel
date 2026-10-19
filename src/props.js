// The random noisy stuff placed behind each player in Classic mode.
// Each type knows how to draw itself and what physics shape/sound it has.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mulberry32, shuffle } from './util.js';

const std = (color, roughness = 0.6, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const MAT = {
  steel: std('#c9ccd0', 0.25, 0.9),
  darkSteel: std('#55585c', 0.35, 0.8),
  black: std('#1d1d1f', 0.5, 0.3),
  white: std('#f6f5f1', 0.35),
  glassGreen: new THREE.MeshPhysicalMaterial({ color: '#2f7a46', roughness: 0.05, transparent: true, opacity: 0.8 }),
  glassClear: new THREE.MeshPhysicalMaterial({ color: '#d8ecf2', roughness: 0.05, transparent: true, opacity: 0.45 }),
  yellow: std('#f4c20d', 0.4),
  green: std('#2f9e44', 0.5),
  blue: std('#2b6fd6', 0.5),
  orange: std('#e8702a', 0.7),
  red: std('#d62f2f', 0.45),
  pink: std('#f7a8b8', 0.5),
  terracotta: std('#c4673f', 0.85),
  leaf: std('#3d8b3d', 0.8),
  wood: std('#c99d66', 0.7),
  soil: std('#4a3424', 1),
};

function grp(...meshes) {
  const g = new THREE.Group();
  for (const m of meshes) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  return g;
}
const C = (r0, r1, h, mat, seg = 20) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat);
const B = (w, h, d, mat, r = 0) => new THREE.Mesh(r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), mat);
const S = (r, mat) => new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat);
const at = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; };

export const PROP_TYPES = {
  pot: {
    shape: { cyl: [0.09, 0.11] }, mass: 0.6, sound: 'metal', freq: 380,
    build: () => grp(C(0.09, 0.088, 0.11, MAT.steel), at(C(0.084, 0.084, 0.002, MAT.darkSteel), 0, 0.054, 0),
      at(B(0.05, 0.012, 0.02, MAT.black), 0.115, 0.035, 0), at(B(0.05, 0.012, 0.02, MAT.black), -0.115, 0.035, 0)),
  },
  pan: {
    shape: { cyl: [0.12, 0.04] }, mass: 0.5, sound: 'metal', freq: 240,
    build: () => grp(C(0.12, 0.105, 0.04, MAT.black), at(B(0.18, 0.018, 0.03, MAT.black), 0.2, 0.01, 0)),
  },
  lid: {
    shape: { cyl: [0.095, 0.02] }, mass: 0.2, sound: 'metal', freq: 720,
    build: () => grp(C(0.095, 0.095, 0.012, MAT.glassClear), at(C(0.096, 0.096, 0.006, MAT.steel), 0, -0.004, 0), at(S(0.016, MAT.black), 0, 0.012, 0)),
  },
  kettle: {
    shape: { cyl: [0.08, 0.17] }, mass: 0.6, sound: 'metal', freq: 520,
    build: () => grp(C(0.065, 0.085, 0.17, MAT.steel), at(C(0.012, 0.018, 0.1, MAT.steel), 0.085, 0.02, 0, 0, 0, -0.9),
      at(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 16, Math.PI), MAT.black), 0, 0.09, 0)),
  },
  bottle: {
    shape: { cyl: [0.036, 0.3] }, mass: 0.45, sound: 'glass', freq: 1500,
    build: () => grp(at(C(0.036, 0.036, 0.2, MAT.glassGreen), 0, -0.05, 0), at(C(0.013, 0.03, 0.08, MAT.glassGreen), 0, 0.09, 0), at(C(0.014, 0.014, 0.02, MAT.steel), 0, 0.14, 0)),
  },
  detergent: {
    shape: { box: [0.042, 0.12, 0.03] }, mass: 0.35, sound: 'plastic',
    build: () => grp(B(0.084, 0.21, 0.06, MAT.yellow, 0.02), at(C(0.02, 0.02, 0.04, MAT.green), 0, 0.12, 0)),
  },
  mug: {
    shape: { cyl: [0.043, 0.095] }, mass: 0.28, sound: 'ceramic', freq: 1300,
    build: (sp) => {
      const cols = ['#e63946', '#f1faee', '#457b9d', '#ffb703', '#2a9d8f'];
      const m = std(cols[(sp?.id ?? 0) % cols.length], 0.3);
      return grp(C(0.043, 0.04, 0.095, m), at(new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.008, 6, 12), m), 0.048, 0, 0));
    },
  },
  plates: {
    shape: { cyl: [0.11, 0.05] }, mass: 0.7, sound: 'ceramic', freq: 900,
    build: () => grp(...[0, 1, 2, 3].map((i) => at(C(0.11, 0.09, 0.011, MAT.white), 0, -0.02 + i * 0.013, 0))),
  },
  can: {
    shape: { cyl: [0.033, 0.12] }, mass: 0.15, sound: 'tin',
    build: () => grp(C(0.033, 0.033, 0.12, MAT.red), at(C(0.031, 0.031, 0.006, MAT.steel), 0, 0.062, 0)),
  },
  duck: {
    shape: { sphere: 0.055 }, mass: 0.05, sound: 'squeak',
    build: () => grp(at(S(0.055, MAT.yellow), 0, -0.01, 0), at(S(0.034, MAT.yellow), 0.035, 0.05, 0), at(B(0.03, 0.012, 0.024, MAT.orange), 0.07, 0.045, 0),
      at(S(0.007, MAT.black), 0.055, 0.062, 0.018), at(S(0.007, MAT.black), 0.055, 0.062, -0.018)),
  },
  bucket: {
    shape: { cyl: [0.13, 0.25] }, mass: 0.7, sound: 'plastic',
    build: () => grp(C(0.13, 0.11, 0.25, MAT.blue), at(C(0.115, 0.115, 0.004, std('#7fb3e6', 0.2)), 0, 0.09, 0),
      at(C(0.012, 0.012, 1.1, MAT.blue, 8), 0.04, 0.6, 0, 0, 0, -0.12), at(C(0.08, 0.06, 0.1, std('#e8e2c8', 1)), 0.0, 0.07, 0)),
  },
  trash: {
    shape: { cyl: [0.11, 0.32] }, mass: 1.0, sound: 'metal', freq: 160,
    build: () => grp(C(0.11, 0.1, 0.3, MAT.steel), at(C(0.112, 0.112, 0.025, MAT.black), 0, 0.16, 0), at(B(0.06, 0.015, 0.05, MAT.black), 0.11, -0.15, 0)),
  },
  shoes: {
    shape: { box: [0.1, 0.045, 0.14] }, mass: 0.5, sound: 'soft',
    build: () => {
      const m = std('#eeeeee', 0.8), s = std('#ff6b6b', 0.7);
      return grp(at(B(0.09, 0.08, 0.27, m, 0.03), -0.05, 0, 0), at(B(0.09, 0.08, 0.27, m, 0.03), 0.05, 0, 0.02),
        at(B(0.092, 0.02, 0.27, s, 0.008), -0.05, -0.035, 0), at(B(0.092, 0.02, 0.27, s, 0.008), 0.05, -0.035, 0.02));
    },
  },
  jar: {
    shape: { cyl: [0.055, 0.14] }, mass: 0.5, sound: 'glass', freq: 1100,
    build: () => grp(C(0.055, 0.055, 0.12, MAT.glassClear), at(C(0.05, 0.05, 0.09, std('#c28b4a', 0.9)), 0, -0.012, 0), at(C(0.057, 0.057, 0.025, MAT.red), 0, 0.07, 0)),
  },
  clock: {
    shape: { box: [0.06, 0.07, 0.035] }, mass: 0.3, sound: 'ring',
    build: () => grp(at(C(0.055, 0.055, 0.05, MAT.red), 0, -0.01, 0, Math.PI / 2), at(C(0.047, 0.047, 0.004, MAT.white), 0, -0.01, 0.026, Math.PI / 2),
      at(S(0.022, MAT.steel), -0.035, 0.05, 0), at(S(0.022, MAT.steel), 0.035, 0.05, 0), at(C(0.006, 0.006, 0.04, MAT.black), -0.04, -0.06, 0), at(C(0.006, 0.006, 0.04, MAT.black), 0.04, -0.06, 0)),
  },
  plant: {
    shape: { cyl: [0.075, 0.15] }, mass: 0.7, sound: 'ceramic', freq: 620,
    build: () => {
      const g = grp(at(C(0.075, 0.055, 0.13, MAT.terracotta), 0, -0.01, 0), at(C(0.068, 0.068, 0.005, MAT.soil), 0, 0.052, 0));
      for (let i = 0; i < 9; i++) {
        const l = S(0.035, MAT.leaf); l.scale.set(0.5, 1.6, 0.25);
        const a = (i / 9) * Math.PI * 2;
        l.position.set(Math.cos(a) * 0.03, 0.11 + Math.random() * 0.04, Math.sin(a) * 0.03);
        l.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); l.castShadow = true; g.add(l);
      }
      return g;
    },
  },
  books: {
    shape: { box: [0.09, 0.05, 0.125] }, mass: 0.8, sound: 'thud',
    build: () => grp(at(B(0.17, 0.03, 0.24, std('#2471a3', 0.8)), 0, -0.033, 0), at(B(0.16, 0.035, 0.23, std('#c0392b', 0.8)), 0.005, 0, 0, 0, 0.08), at(B(0.15, 0.028, 0.22, std('#f4d03f', 0.8)), -0.004, 0.032, 0, 0, -0.1)),
  },
  lamp: {
    shape: { cyl: [0.07, 0.36] }, mass: 0.6, sound: 'metalLight', freq: 900,
    build: () => grp(at(C(0.07, 0.075, 0.025, MAT.black), 0, -0.165, 0), at(C(0.008, 0.008, 0.25, MAT.black, 8), 0.02, -0.04, 0, 0, 0, -0.2),
      at(C(0.008, 0.008, 0.14, MAT.black, 8), 0.02, 0.12, 0, 0, 0, 0.7), at(C(0.03, 0.065, 0.08, std('#f2efe6', 0.6)), -0.04, 0.16, 0, 0, 0, 0.5)),
  },
  speaker: {
    shape: { box: [0.09, 0.045, 0.045] }, mass: 0.5, sound: 'boom',
    build: () => grp(B(0.18, 0.09, 0.09, std('#2d3436', 0.8), 0.035), at(C(0.03, 0.03, 0.002, std('#636e72', 0.5)), 0, 0, 0.046, Math.PI / 2), at(S(0.006, std('#55efc4', 0.3, 0, { emissive: '#55efc4', emissiveIntensity: 1 })), 0.07, 0.045, 0)),
  },
  ball: {
    shape: { sphere: 0.12 }, mass: 0.6, sound: 'ball', bouncy: true,
    build: () => {
      const g = grp(S(0.12, MAT.orange));
      for (const r of [0, Math.PI / 2]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.1205, 0.003, 6, 40), MAT.black); t.rotation.y = r; g.add(t); }
      const t2 = new THREE.Mesh(new THREE.TorusGeometry(0.1205, 0.003, 6, 40), MAT.black); t2.rotation.x = Math.PI / 2; g.add(t2);
      return g;
    },
  },
  water: {
    shape: { cyl: [0.04, 0.24] }, mass: 0.3, sound: 'plastic',
    build: () => grp(C(0.04, 0.04, 0.2, new THREE.MeshPhysicalMaterial({ color: '#8ecae6', roughness: 0.1, transparent: true, opacity: 0.6 })), at(C(0.018, 0.035, 0.03, MAT.white), 0, 0.115, 0), at(C(0.016, 0.016, 0.02, MAT.blue), 0, 0.135, 0)),
  },
  piggy: {
    shape: { sphere: 0.07 }, mass: 0.45, sound: 'coins',
    build: () => {
      const g = grp(S(0.07, MAT.pink));
      g.children[0].scale.set(1.25, 0.9, 0.9);
      for (const [x, y, z, r] of [[0.085, 0.0, 0, 0.025], [0.03, 0.06, 0.03, 0.015], [0.03, 0.06, -0.03, 0.015], [-0.04, -0.06, 0.03, 0.015], [0.04, -0.06, 0.03, 0.015], [-0.04, -0.06, -0.03, 0.015], [0.04, -0.06, -0.03, 0.015]]) {
        const m = S(r, MAT.pink); m.position.set(x, y, z); m.castShadow = true; g.add(m);
      }
      return g;
    },
  },
  rack: {
    shape: { box: [0.04, 0.33, 0.25] }, mass: 1.4, sound: 'metalLight', freq: 640,
    build: () => {
      const g = new THREE.Group();
      const m = std('#d9dbde', 0.3, 0.8);
      for (const z of [-0.24, 0.24]) g.add(at(C(0.008, 0.008, 0.66, m, 6), 0, 0, z));
      for (let y = -0.2; y <= 0.3; y += 0.07) g.add(at(C(0.004, 0.004, 0.48, m, 5), 0, y, 0, Math.PI / 2));
      g.add(at(B(0.03, 0.2, 0.18, std('#ffafcc', 0.95)), 0.015, 0.15, 0.08));
      g.traverse((o) => { o.castShadow = true; });
      return g;
    },
  },
  guitar: {
    fixed: true, shape: { box: [0.19, 0.5, 0.07] }, sound: 'guitar',
    build: () => {
      const g = new THREE.Group();
      const body = std('#c47f3c', 0.4), dark = std('#2b1b10', 0.6);
      const lower = S(0.19, body); lower.scale.set(1, 1, 0.32); lower.position.y = -0.24;
      const upper = S(0.145, body); upper.scale.set(1, 1, 0.32); upper.position.y = 0.0;
      const hole = C(0.05, 0.05, 0.01, dark); hole.rotation.x = Math.PI / 2; hole.position.set(0, -0.12, 0.062);
      const neck = B(0.05, 0.46, 0.025, dark); neck.position.y = 0.36;
      const head = B(0.07, 0.12, 0.03, dark); head.position.y = 0.64;
      g.add(lower, upper, hole, neck, head);
      g.traverse((o) => { o.castShadow = true; });
      return g;
    },
  },
  chime: {
    fixed: true, shape: { box: [0.08, 0.25, 0.08] }, sound: 'chime',
    build: () => {
      const g = new THREE.Group();
      const m = std('#d8dce0', 0.2, 0.95);
      g.add(at(C(0.06, 0.06, 0.012, std('#9b7b55', 0.7)), 0, 0.24, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2, len = 0.18 + i * 0.04;
        g.add(at(C(0.007, 0.007, len, m, 8), Math.cos(a) * 0.045, 0.22 - len / 2 - 0.03, Math.sin(a) * 0.045));
      }
      g.add(at(C(0.002, 0.002, 0.2, std('#444', 0.8), 4), 0, 0.35, 0));
      g.traverse((o) => { o.castShadow = true; });
      return g;
    },
  },
};

// Where things may spawn. y is the surface height; slots are fixed spots, rects are areas.
const SURF = {
  hotplates: { side: 0, y: 1.234, slots: [[-3.72, 0.55], [-3.72, 0.8]], types: ['pot', 'pan', 'kettle', 'lid'] },
  counter: { side: 0, y: 0.9, rect: [-3.92, 1.58, -3.52, 2.05], types: ['bottle', 'detergent', 'mug', 'jar', 'can', 'duck', 'plates', 'clock'] },
  sink: { side: 0, y: 0.905, rect: [-3.84, 1.12, -3.6, 1.42], types: ['mug', 'plates', 'can', 'duck'] },
  fridge: { side: 0, y: 0.85, rect: [-3.32, 1.64, -2.94, 2.02], types: ['jar', 'clock', 'bottle', 'can', 'mug', 'piggy'] },
  doorFloor: { side: 0, y: 0, rect: [-3.9, -0.45, -3.52, 0.25], types: ['bucket', 'trash', 'shoes', 'ball', 'water'] },
  kitchenFloor: { side: 0, y: 0, rect: [-3.36, 0.42, -3.26, 1.3], types: ['shoes', 'water', 'can'] },
  plantTable: { side: 1, y: 0.565, rect: [3.1, 1.06, 3.4, 1.34], types: ['plant', 'mug', 'speaker', 'clock', 'piggy', 'lamp'] },
  balconyFloor: { side: 1, y: 0, rect: [3.6, -0.72, 3.84, 0.72], types: ['plant', 'ball', 'rack', 'water', 'speaker', 'shoes', 'books'] },
  wallFloor: { side: 1, y: 0, rect: [2.62, -1.5, 3.22, -1.36], types: ['ball', 'books', 'plant'] },
  desk: { side: 1, y: 0.745, rect: [1.1, -1.48, 1.32, -1.06], types: ['lamp', 'mug', 'books', 'speaker'] },
};

const FIXED_SPOTS = {
  guitar: { side: 1, x: 2.9, y: 0.45, z: -1.43, ry: 0, rz: 0.06, rx: -0.12 },
  chime: { side: 1, x: 3.82, y: 1.86, z: 0.45, ry: 0 },
};

function radiusOf(t) {
  const s = PROP_TYPES[t].shape;
  if (s.sphere) return s.sphere;
  if (s.cyl) return s.cyl[0];
  return Math.max(s.box[0], s.box[2]);
}
function halfHeight(t) {
  const s = PROP_TYPES[t].shape;
  if (s.sphere) return s.sphere;
  if (s.cyl) return s.cyl[1] / 2;
  return s.box[1];
}

// Random but reproducible (seeded) layout so host and guest agree.
export function generateProps(seed) {
  const rnd = mulberry32(seed);
  const specs = [];
  let id = 0;
  const placed = [];
  const fits = (x, z, r, y) => placed.every((p) => Math.abs(p.y - y) > 0.3 || Math.hypot(p.x - x, p.z - z) > p.r + r + 0.02);
  const place = (surfKey, type) => {
    const s = SURF[surfKey], r = radiusOf(type);
    for (let tries = 0; tries < 14; tries++) {
      let x, z;
      if (s.slots) { const sl = s.slots[Math.floor(rnd() * s.slots.length)]; x = sl[0]; z = sl[1]; }
      else { x = s.rect[0] + rnd() * (s.rect[2] - s.rect[0]); z = s.rect[1] + rnd() * (s.rect[3] - s.rect[1]); }
      if (!fits(x, z, r, s.y)) continue;
      placed.push({ x, z, r, y: s.y });
      specs.push({ id: id++, type, x, y: s.y + halfHeight(type) + 0.003, z, ry: rnd() * Math.PI * 2 });
      return true;
    }
    return false;
  };
  const fill = (side, count) => {
    const keys = Object.keys(SURF).filter((k) => SURF[k].side === side);
    let n = 0, guard = 0;
    while (n < count && guard++ < 80) {
      const k = keys[Math.floor(rnd() * keys.length)];
      const types = SURF[k].types;
      if (place(k, types[Math.floor(rnd() * types.length)])) n++;
    }
  };
  // Always at least one pot on the stove and one thing on the plant table.
  place('hotplates', shuffle(['pot', 'pan', 'kettle'], rnd)[0]);
  place('plantTable', 'plant');
  fill(0, 7 + Math.floor(rnd() * 3));
  fill(1, 6 + Math.floor(rnd() * 3));
  for (const t of ['guitar', 'chime']) {
    if (rnd() < 0.75) { const f = FIXED_SPOTS[t]; specs.push({ id: id++, type: t, x: f.x, y: f.y, z: f.z, ry: f.ry, rx: f.rx || 0, rz: f.rz || 0 }); }
  }
  return specs;
}

export function buildPropMesh(spec) {
  const def = PROP_TYPES[spec.type];
  const obj = def.build(spec);
  obj.position.set(spec.x, spec.y, spec.z);
  obj.rotation.set(spec.rx || 0, spec.ry || 0, spec.rz || 0);
  obj.userData.spec = spec;
  return obj;
}
