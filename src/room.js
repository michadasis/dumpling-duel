// Builds the studio apartment: visuals, static physics colliders, and walkable-area obstacles.
// Layout follows the listing photos: kitchenette + entrance door at the -x end, balcony door at the +x end,
// built-in grey cabinets/niches along both long walls, futon + coffee table (the "living room") in the middle,
// bed against the bathroom wall with the world-map decal.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as T from './textures.js';
import { mulberry32 } from './util.js';

const std = (color, roughness = 0.8, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export function buildRoom() {
  const root = new THREE.Group();
  root.name = 'room';
  const colliders = [];
  const obstacles = [];
  const shadowCatchers = [];
  const wobblers = {};

  const floorT = T.floorTiles();
  floorT.map.repeat.set(8 / 1.8, 4.2 / 1.8);
  floorT.rough.repeat.copy(floorT.map.repeat);

  const M = {
    floor: std('#ffffff', 1, 0, { map: floorT.map, roughnessMap: floorT.rough }),
    wall: std('#efede7', 0.93),
    ceiling: std('#f4f3ef', 0.96),
    carcass: std('#c4c7c5', 0.62),
    panel: std('#b3b7b6', 0.48),
    inner: std('#e8e7e2', 0.88),
    knob: std('#dedede', 0.22, 0.9),
    white: std('#f4f3ef', 0.32),
    cream: std('#efe6cf', 0.5),
    steel: std('#c4c7ca', 0.28, 0.85),
    chrome: std('#e8e8e8', 0.12, 1),
    black: std('#1f1f22', 0.42, 0.55),
    matte: std('#18181a', 0.85),
    counter: std('#e3e2dc', 0.38),
    oak: std('#ffffff', 0.62, 0, { map: T.wood('#c7ab84', 'rgba(110,80,45,0.2)', 3) }),
    deskWood: std('#ffffff', 0.6, 0, { map: T.wood('#dcc8a4', 'rgba(120,90,50,0.15)', 4) }),
    doorWood: std('#ffffff', 0.5, 0, { map: T.wood('#b9712f', 'rgba(90,45,10,0.28)', 6) }),
    lightWood: std('#ffffff', 0.6, 0, { map: T.wood('#d9b98c', 'rgba(120,80,40,0.2)', 7) }),
    blanket: std('#ffffff', 1, 0, { map: T.fabric('#76797e', 2, 256, 0.14) }),
    sheet: std('#e2c43b', 0.9),
    futon: std('#ffffff', 1, 0, { map: T.fabric('#8a8d91', 3, 256, 0.12) }),
    pillowDark: std('#ffffff', 1, 0, { map: T.fabric('#55575b', 4) }),
    throwBlanket: std('#ffffff', 1, 0, { map: T.fabric('#e9e6df', 5, 256, 0.08) }),
    leaves: std('#ffffff', 0.95, 0, { map: T.leafPillow() }),
    glassDark: std('#151617', 0.08, 0.3),
    screen: std('#0d0e10', 0.15, 0.2),
    lamp: std('#f3d07a', 0.9, 0, { emissive: '#f2c55c', emissiveIntensity: 0.55 }),
    lampWhite: std('#ffffff', 0.9, 0, { emissive: '#ffffff', emissiveIntensity: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#e3eef2', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 1.2, depthWrite: false }),
    mirror: std('#ffffff', 0.03, 1),
    tile: std('#ffffff', 0.25, 0, { map: T.backsplash() }),
    grout: std('#d7cdb9', 0.7),
    cork: std('#ffffff', 0.95, 0, { map: T.cork() }),
    magnets: std('#ffffff', 0.35, 0, { map: T.fridgeMagnets() }),
    heater: std('#ffffff', 0.45, 0, { map: T.grille(9) }),
    hoodGrille: std('#ffffff', 0.5, 0, { map: T.grille(12, '#e9dfc6', 'rgba(80,70,50,0.5)', 256, 128, 0.1, 0.9) }),
    acFace: std('#ffffff', 0.4, 0, { map: T.grille(4, '#f6f6f3', 'rgba(70,70,70,0.4)', 256, 128, 0.72, 0.92) }),
    gold: std('#c9a45c', 0.35, 0.8),
    curtain: new THREE.MeshStandardMaterial({ map: T.curtain([245, 243, 236]), roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.94 }),
    drape: new THREE.MeshStandardMaterial({ map: T.curtain([228, 220, 204], 256, 64, 12), roughness: 1, side: THREE.DoubleSide }),
    map: new THREE.MeshBasicMaterial({ map: T.worldMap(), transparent: true, depthWrite: false }),
    outside: new THREE.MeshBasicMaterial({ map: T.outsideView() }),
    navy: std('#2e3a61', 0.6),
    jacketBlue: std('#3f78c0', 0.9),
    jacketNavy: std('#28324a', 0.9),
    jacketRed: std('#6d2a35', 0.9),
    mopBlue: std('#2b6fd6', 0.6),
    red: std('#bf2b2f', 0.55),
    plantGreen: std('#3f7d3a', 0.8),
    pot: std('#e8e2d6', 0.6),
    tape: std('#ffffff', 0.7, 0, { map: T.tapeTex() }),
  };
  M.mirror.envMapIntensity = 1;

  // ---------- helpers ----------
  function add(mesh, { cast = true, recv = true, parent = root } = {}) {
    mesh.castShadow = cast; mesh.receiveShadow = recv; parent.add(mesh); return mesh;
  }
  function box(x0, y0, z0, x1, y1, z1, mat, o = {}) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const geo = o.round ? new RoundedBoxGeometry(w, h, d, 2, o.round) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    add(m, o);
    if (o.col) colliders.push({ type: 'box', c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], h: [w / 2, h / 2, d / 2], ...o.col });
    if (o.obs) obstacles.push({ x0, z0, x1, z1 });
    if (o.catcher) shadowCatchers.push(m);
    return m;
  }
  function colBox(x0, y0, z0, x1, y1, z1, col) {
    colliders.push({ type: 'box', c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], h: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2], ...col });
  }
  function cyl(r0, r1, h, x, y, z, mat, o = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, o.seg || 20), mat);
    m.position.set(x, y, z);
    if (o.rx) m.rotation.x = o.rx;
    if (o.rz) m.rotation.z = o.rz;
    return add(m, o);
  }
  function plane(w, h, mat, pos, rotY = 0, o = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(...pos); m.rotation.y = rotY;
    if (o.rx) m.rotation.x = o.rx;
    return add(m, { cast: false, recv: o.recv ?? true, parent: o.parent });
  }
  const KNOB = new THREE.SphereGeometry(0.014, 10, 8);
  function knob(x, y, z) { const k = new THREE.Mesh(KNOB, M.knob); k.position.set(x, y, z); k.scale.set(1, 1, 0.8); root.add(k); }

  // Built-in run along a long wall. side +1: front at z=+1.55 facing -z. side -1: front at z=-1.55 facing +z.
  function unit(xa, xb, side, sections) {
    const zf = side * 1.55, zw = side * 2.1;
    const zlo = Math.min(zf, zw), zhi = Math.max(zf, zw);
    const pz0 = side > 0 ? zf - 0.016 : zf, pz1 = side > 0 ? zf : zf + 0.016;
    const kz = zf - side * 0.026;
    for (const s of sections) {
      const { y0, y1 } = s;
      if (s.type === 'niche') {
        const depth = s.depth ?? 0.44;
        const zb = zf + side * depth;
        box(xa, y0, Math.min(zb, zw), xb, y1, Math.max(zb, zw), M.inner, { col: { kind: 'cabinet', sound: 'wood' } });
        box(xa, y0, zlo, xa + 0.025, y1, zhi, M.carcass);
        box(xb - 0.025, y0, zlo, xb, y1, zhi, M.carcass);
        colBox(xa - 0.04, y0, zlo, xa + 0.025, y1, zhi, { kind: 'cabinet', sound: 'wood' });
        colBox(xb - 0.025, y0, zlo, xb + 0.04, y1, zhi, { kind: 'cabinet', sound: 'wood' });
        box(xa + 0.025, y0, zlo, xb - 0.025, y0 + 0.022, zhi, M.inner, { catcher: true });
        box(xa + 0.025, y1 - 0.02, zlo, xb - 0.025, y1, zhi, M.inner);
        for (const yy of s.shelves || []) {
          box(xa + 0.025, yy - 0.011, Math.min(zf, zb), xb - 0.025, yy + 0.011, Math.max(zf, zb), M.inner, { col: { kind: 'cabinet', sound: 'wood' }, catcher: true });
        }
        continue;
      }
      const mat = s.type === 'wallface' ? M.wall : M.carcass;
      box(xa, y0, zlo, xb, y1, zhi, mat, { col: { kind: 'cabinet', sound: s.type === 'wallface' ? 'wall' : 'wood' } });
      if (s.type === 'doors') {
        const n = s.n || 2, gap = 0.007, w = (xb - xa) / n;
        for (let k = 0; k < n; k++) {
          const a = xa + k * w + gap, b = xa + (k + 1) * w - gap;
          box(a, y0 + gap, pz0, b, y1 - gap, pz1, M.panel, { cast: false });
          const ky = y1 < 1.3 ? y1 - 0.09 : y0 > 1.0 ? y0 + 0.09 : 1.02;
          const kx = n === 1 ? (k === 0 ? b - 0.05 : a + 0.05) : (k % 2 === 0 ? b - 0.04 : a + 0.04);
          knob(kx, ky, kz);
        }
      } else if (s.type === 'drawers') {
        const n = s.n || 3, gap = 0.007, h = (y1 - y0) / n;
        for (let k = 0; k < n; k++) {
          box(xa + gap, y0 + k * h + gap, pz0, xb - gap, y0 + (k + 1) * h - gap, pz1, M.panel, { cast: false });
          knob((xa + xb) / 2, y0 + (k + 1) * h - 0.05, kz);
        }
      }
    }
  }

  // ---------- shell ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.2), M.floor);
  floor.rotation.x = -Math.PI / 2;
  add(floor, { cast: false });
  shadowCatchers.push(floor);
  colliders.push({ type: 'plane', p: [0, 0, 0], n: [0, 1, 0], kind: 'floor', sound: 'tile' });

  {
    const g = new THREE.BufferGeometry();
    const v = [
      -4, 3.05, 0, 4, 3.05, 0, 4, 2.0, 2.1, -4, 3.05, 0, 4, 2.0, 2.1, -4, 2.0, 2.1,
      4, 3.05, 0, -4, 3.05, 0, -4, 2.0, -2.1, 4, 3.05, 0, -4, 2.0, -2.1, 4, 2.0, -2.1,
    ];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    add(new THREE.Mesh(g, M.ceiling), { cast: false });
    colliders.push({ type: 'plane', p: [0, 3.05, 0], n: [0, -0.894, -0.447], kind: 'ceiling', sound: 'wall' });
    colliders.push({ type: 'plane', p: [0, 3.05, 0], n: [0, -0.894, 0.447], kind: 'ceiling', sound: 'wall' });
    colliders.push({ type: 'plane', p: [0, 0, 2.1], n: [0, 0, -1], kind: 'wall', sound: 'wall' });
    colliders.push({ type: 'plane', p: [0, 0, -2.1], n: [0, 0, 1], kind: 'wall', sound: 'wall' });
    colliders.push({ type: 'plane', p: [-4, 0, 0], n: [1, 0, 0], kind: 'wall', sound: 'wall' });
    colliders.push({ type: 'plane', p: [4, 0, 0], n: [-1, 0, 0], kind: 'wall', sound: 'wall' });
    plane(8, 2.0, M.wall, [0, 1, 2.099], Math.PI);
    plane(8, 2.0, M.wall, [0, 1, -2.099], 0);
  }
  {
    // Kitchen end wall (solid) and balcony end wall (with door opening).
    const s1 = new THREE.Shape();
    s1.moveTo(-2.1, 0); s1.lineTo(2.1, 0); s1.lineTo(2.1, 2.0); s1.lineTo(0, 3.05); s1.lineTo(-2.1, 2.0); s1.closePath();
    const w1 = new THREE.Mesh(new THREE.ShapeGeometry(s1), M.wall);
    w1.rotation.y = Math.PI / 2; w1.position.x = -4;
    add(w1, { cast: false });
    const s2 = new THREE.Shape();
    s2.moveTo(-2.1, 0); s2.lineTo(-0.86, 0); s2.lineTo(-0.86, 2.25); s2.lineTo(0.86, 2.25); s2.lineTo(0.86, 0);
    s2.lineTo(2.1, 0); s2.lineTo(2.1, 2.0); s2.lineTo(0, 3.05); s2.lineTo(-2.1, 2.0); s2.closePath();
    const w2 = new THREE.Mesh(new THREE.ShapeGeometry(s2), M.wall);
    w2.rotation.y = -Math.PI / 2; w2.position.x = 4;
    add(w2, { cast: false });
  }

  // ---------- kitchenette (-x end, against the end wall) ----------
  box(-4, 0, 0.35, -3.42, 0.86, 2.1, M.carcass, { col: { kind: 'cabinet', sound: 'wood' } });
  box(-3.445, 0, 0.36, -3.42, 0.1, 2.08, M.matte, { cast: false });
  {
    const fz = [[0.36, 0.95, 'door'], [0.95, 1.55, 'drawers'], [1.55, 2.08, 'door']];
    for (const [a, b, t] of fz) {
      if (t === 'door') {
        box(-3.42, 0.11, a + 0.006, -3.405, 0.85, b - 0.006, M.panel, { cast: false });
        knob(-3.395, 0.77, a < 1 ? b - 0.05 : a + 0.05);
      } else {
        for (let k = 0; k < 3; k++) {
          const y0 = 0.11 + k * 0.247, y1 = y0 + 0.24;
          box(-3.42, y0, a + 0.006, -3.405, y1, b - 0.006, M.panel, { cast: false });
          knob(-3.395, y1 - 0.05, (a + b) / 2);
        }
      }
    }
  }
  box(-4, 0.86, 0.35, -3.39, 0.9, 2.1, M.counter, { col: { kind: 'counter', sound: 'counter' }, catcher: true });
  box(-3.999, 0.9, 0.35, -3.995, 1.6, 2.1, M.tile, { cast: false });
  M.tile.map.repeat.set(1.75 / 0.6, 0.7 / 0.6);
  // sink + faucet
  box(-3.93, 0.9, 1.05, -3.5, 0.905, 1.5, M.steel, { cast: false });
  box(-3.88, 0.903, 1.09, -3.55, 0.908, 1.46, std('#7e8286', 0.3, 0.8), { cast: false });
  cyl(0.018, 0.022, 0.12, -3.94, 0.96, 1.28, M.chrome);
  {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-3.94, 1.0, 1.28), new THREE.Vector3(-3.92, 1.12, 1.28), new THREE.Vector3(-3.84, 1.13, 1.28), new THREE.Vector3(-3.78, 1.06, 1.28)]);
    add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.012, 8), M.chrome));
  }
  // mini oven with two hotplates (classic Greek studio "κουζινάκι")
  box(-3.95, 0.9, 0.4, -3.48, 1.22, 0.95, M.white, { col: { kind: 'appliance', sound: 'metalDull' }, round: 0.012, catcher: true });
  box(-3.482, 0.95, 0.45, -3.474, 1.16, 0.81, M.glassDark, { cast: false });
  box(-3.47, 1.165, 0.48, -3.455, 1.18, 0.78, M.chrome, { cast: false });
  for (const y of [1.15, 1.07, 0.99]) cyl(0.014, 0.014, 0.02, -3.47, y, 0.885, M.matte, { rz: Math.PI / 2, cast: false });
  for (const z of [0.55, 0.8]) cyl(0.085, 0.085, 0.014, -3.72, 1.227, z, M.matte);
  // range hood + upper cabinets
  box(-4, 1.5, 0.38, -3.55, 1.62, 0.97, M.cream, { col: { kind: 'appliance', sound: 'metalDull' } });
  box(-3.98, 1.495, 0.4, -3.57, 1.5, 0.95, M.hoodGrille, { cast: false });
  box(-3.555, 1.52, 0.4, -3.545, 1.6, 0.95, std('#d8cba8', 0.5), { cast: false });
  box(-4, 1.62, 0.35, -3.67, 2.2, 1.55, M.carcass, { col: { kind: 'cabinet', sound: 'wood' } });
  for (const [a, b] of [[0.35, 0.95], [0.95, 1.55]]) {
    box(-3.67, 1.627, a + 0.006, -3.655, 2.193, b - 0.006, M.panel, { cast: false });
    knob(-3.645, 1.69, a < 0.9 ? b - 0.05 : a + 0.05);
  }
  box(-3.998, 1.25, 1.75, -3.99, 1.33, 1.82, M.white, { cast: false });

  // ---------- entrance door + bathroom block (-x end, -z side) ----------
  box(-4, 0, -0.52, -3.955, 2.05, 0.3, M.doorWood, { col: { kind: 'door', sound: 'knock', id: 'door' } });
  box(-4, 0, -0.6, -3.97, 2.13, -0.52, M.white, { cast: false });
  box(-4, 0, 0.3, -3.97, 2.13, 0.38, M.white, { cast: false });
  box(-4, 2.05, -0.6, -3.97, 2.13, 0.38, M.white, { cast: false });
  box(-3.95, 0.98, 0.1, -3.93, 1.02, 0.24, M.chrome);
  cyl(0.025, 0.025, 0.02, -3.945, 1.0, 0.22, M.chrome, { rz: Math.PI / 2 });
  box(-4, 0, -2.1, -2.6, 2.76, -0.62, M.wall, { col: { kind: 'wall', sound: 'wall' } });
  box(-2.6, 0, -2.1, -2.585, 0.08, -0.62, M.grout, { cast: false });
  box(-4, 0, -0.62, -2.6, 0.08, -0.605, M.grout, { cast: false });
  plane(1.3, 0.65, M.map, [-2.598, 1.78, -1.35], Math.PI / 2, { recv: false });
  // light switch
  box(-3.92, 1.15, -0.62, -3.84, 1.23, -0.61, M.white, { cast: false });
  // coat rack + jackets + mop
  box(-3.72, 1.62, -0.62, -2.82, 1.7, -0.595, M.lightWood);
  const jackets = new THREE.Group(); root.add(jackets);
  const jk = [[-3.55, M.jacketBlue], [-3.25, M.jacketNavy], [-2.98, M.jacketRed]];
  for (const [x, mat] of jk) {
    const piv = new THREE.Group(); piv.position.set(x, 1.66, -0.56); jackets.add(piv);
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.68, 0.1, 3, 0.04), mat);
    body.position.y = -0.38; body.castShadow = true; piv.add(body);
    const sl = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.45, 4, 8), mat);
    sl.position.set(0.15, -0.35, 0.03); sl.rotation.z = 0.08; piv.add(sl);
    piv.rotation.z = (Math.random() - 0.5) * 0.05;
    cyl(0.008, 0.008, 0.05, x, 1.66, -0.585, M.chrome, { rx: Math.PI / 2, cast: false });
  }
  wobblers.jackets = { obj: jackets.children, kind: 'swing', t: 0, a: 0 };
  colBox(-3.72, 0.9, -0.62, -2.82, 1.68, -0.47, { kind: 'soft', sound: 'cloth', id: 'jackets' });
  // AC unit
  box(-3.65, 2.18, -0.62, -2.85, 2.46, -0.42, M.acFace, { round: 0.03, col: { kind: 'appliance', sound: 'ac', id: 'ac' } });
  box(-3.62, 2.2, -0.43, -2.88, 2.215, -0.415, std('#cfcfcb', 0.5), { cast: false });
  box(-2.95, 2.4, -0.421, -2.93, 2.41, -0.418, std('#55ff88', 0.4, 0, { emissive: '#33ff77', emissiveIntensity: 1 }), { cast: false });

  // ---------- built-ins along the +z wall ----------
  unit(-3.4, -2.85, 1, [{ y0: 0, y1: 1.4, type: 'niche', depth: 0.53 }, { y0: 1.4, y1: 2.05, type: 'doors', n: 1 }]);
  box(-3.37, 0, 1.585, -2.88, 0.85, 2.07, M.white, { round: 0.015, col: { kind: 'appliance', sound: 'fridge', id: 'fridge' }, catcher: true });
  plane(0.47, 0.81, M.magnets, [-3.125, 0.43, 1.583], Math.PI, { recv: true });
  box(-2.93, 0.35, 1.56, -2.91, 0.72, 1.575, std('#dcdcd6', 0.4));
  unit(-2.85, -2.05, 1, [{ y0: 0, y1: 1.2, type: 'doors', n: 2 }, { y0: 1.2, y1: 2.05, type: 'doors', n: 2 }]);
  unit(-2.05, -1.25, 1, [
    { y0: 0, y1: 1.12, type: 'niche', depth: 0.5 },
    { y0: 1.12, y1: 1.2, type: 'solid' },
    { y0: 1.2, y1: 1.86, type: 'niche', shelves: [1.52] },
    { y0: 1.86, y1: 2.05, type: 'solid' },
  ]);
  // convector heater in the lower niche
  box(-1.99, 0.1, 1.74, -1.31, 0.64, 1.93, M.heater, { round: 0.012, col: { kind: 'appliance', sound: 'metalDull' } });
  for (const x of [-1.93, -1.37]) box(x - 0.02, 0, 1.78, x + 0.02, 0.1, 1.9, M.white);
  // futon recess (white wall below a band of three niches)
  box(-1.25, 0, 1.85, 0.85, 1.25, 2.1, M.wall, { col: { kind: 'wall', sound: 'wall' } });
  for (const [a, b] of [[-1.25, -0.55], [-0.55, 0.15], [0.15, 0.85]]) {
    unit(a, b, 1, [{ y0: 1.25, y1: 1.32, type: 'solid' }, { y0: 1.32, y1: 1.88, type: 'niche', depth: 0.4 }, { y0: 1.88, y1: 2.05, type: 'solid' }]);
  }
  unit(0.85, 1.65, 1, [{ y0: 0, y1: 2.05, type: 'doors', n: 2 }]);
  unit(1.65, 2.6, 1, [
    { y0: 0, y1: 0.86, type: 'niche', shelves: [0.44] },
    { y0: 0.86, y1: 0.92, type: 'solid' },
    { y0: 0.92, y1: 1.6, type: 'niche' },
    { y0: 1.6, y1: 2.05, type: 'doors', n: 2 },
  ]);
  unit(2.6, 4.0, 1, [{ y0: 0, y1: 0.78, type: 'doors', n: 2 }, { y0: 0.78, y1: 2.05, type: 'wallface' }]);
  // bottles + bits in the niches above the futon
  {
    const rnd = mulberry32(17);
    const bottleCols = ['#2f6b3a', '#7a3b1f', '#d9d4c8', '#3a2d1d', '#9c2f2f', '#c8a34a', '#244a6b'];
    const bottleGeo = new THREE.CylinderGeometry(0.032, 0.034, 0.2, 14);
    const neckGeo = new THREE.CylinderGeometry(0.011, 0.015, 0.08, 10);
    let k = 0;
    for (const [a, b] of [[-1.2, -0.6], [-0.5, 0.1]]) {
      for (let x = a + 0.07; x < b - 0.04; x += 0.075 + rnd() * 0.03) {
        const col = bottleCols[k++ % bottleCols.length];
        const mat = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.08, transmission: 0, transparent: true, opacity: 0.85 });
        const z = 1.78 + rnd() * 0.06, h = 0.16 + rnd() * 0.08;
        const bt = new THREE.Mesh(bottleGeo, mat); bt.scale.y = h / 0.2; bt.position.set(x, 1.342 + h / 2, z); add(bt);
        const nk = new THREE.Mesh(neckGeo, mat); nk.position.set(x, 1.342 + h + 0.04, z); add(nk);
      }
    }
    // little plant in the third niche
    cyl(0.05, 0.04, 0.09, 0.5, 1.387, 1.8, M.pot);
    for (let i = 0; i < 7; i++) {
      const lf = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), M.plantGreen);
      lf.scale.set(0.6, 1.4, 0.3); lf.position.set(0.5 + (rnd() - 0.5) * 0.06, 1.49 + rnd() * 0.05, 1.8 + (rnd() - 0.5) * 0.06);
      lf.rotation.z = (rnd() - 0.5) * 1.2; add(lf);
    }
    // basket + box in the open shelf by the balcony
    box(1.75, 0.022, 1.7, 2.05, 0.2, 2.0, std('#b88d5a', 0.9), { round: 0.01 });
    box(2.15, 0.462, 1.68, 2.45, 0.6, 1.98, std('#e0d6c4', 0.8));
    box(1.8, 0.942, 1.75, 1.84, 1.18, 1.95, std('#5a6d8c', 0.6));
    box(1.85, 0.942, 1.75, 1.88, 1.16, 1.95, std('#a33', 0.6));
  }

  // ---------- built-ins along the -z wall ----------
  unit(-2.6, -1.45, -1, [{ y0: 0, y1: 1.55, type: 'doors', n: 2 }, { y0: 1.55, y1: 2.05, type: 'doors', n: 2 }]);
  unit(-1.45, -0.55, -1, [{ y0: 0, y1: 0.7, type: 'doors', n: 2 }, { y0: 0.7, y1: 1.65, type: 'niche' }, { y0: 1.65, y1: 2.05, type: 'doors', n: 2 }]);
  // TV in its niche
  box(-1.3, 0.722, -1.9, -0.7, 0.74, -1.78, M.matte);
  box(-1.04, 0.74, -1.86, -0.96, 0.78, -1.82, M.matte);
  box(-1.31, 0.78, -1.86, -0.69, 1.14, -1.82, M.matte, { round: 0.006 });
  box(-1.29, 0.795, -1.82, -0.71, 1.125, -1.818, M.screen, { cast: false });
  unit(-0.55, 0.45, -1, [{ y0: 0, y1: 2.05, type: 'niche', depth: 0.42, shelves: [0.42, 0.82, 1.22, 1.62] }]);
  {
    // books (instanced) + red suitcase
    const rnd = mulberry32(99);
    const pal = ['#c0392b', '#27ae60', '#2471a3', '#f39c12', '#f4d03f', '#ecf0f1', '#2c3e50', '#8e44ad', '#16a085', '#d35400', '#7f8c8d', '#e74c3c'];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = std('#ffffff', 0.75);
    const inst = new THREE.InstancedMesh(geo, mat, 140);
    inst.castShadow = true; inst.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color();
    let n = 0;
    for (const yb of [0.42, 0.82, 1.22, 1.62]) {
      let x = -0.51;
      while (x < 0.4 && n < 140) {
        const w = 0.022 + rnd() * 0.035, h = 0.2 + rnd() * 0.13, d = 0.16 + rnd() * 0.06;
        if (x + w > 0.41) break;
        const lean = rnd() < 0.08 ? 0.18 : 0;
        ps.set(x + w / 2, yb + 0.011 + h / 2, -1.95 + d / 2 + 0.02);
        q.setFromEuler(new THREE.Euler(0, 0, -lean)); sc.set(w, h, d);
        m4.compose(ps, q, sc); inst.setMatrixAt(n, m4);
        inst.setColorAt(n, col.set(pal[Math.floor(rnd() * pal.length)]));
        n++; x += w + 0.003 + (lean ? 0.03 : 0);
        if (rnd() < 0.04) x += 0.06;
      }
    }
    inst.count = n; root.add(inst);
    box(-0.5, 0.022, -1.95, 0.0, 0.36, -1.62, M.red, { round: 0.03 });
    box(0.05, 0.022, -1.9, 0.38, 0.12, -1.65, std('#d9d2c3', 0.8));
  }
  unit(0.45, 1.0, -1, [{ y0: 0, y1: 2.05, type: 'doors', n: 1 }]);
  unit(1.0, 4.0, -1, [{ y0: 0, y1: 2.05, type: 'wallface' }]);
  plane(0.72, 0.52, M.cork, [1.5, 1.38, -1.548], 0);
  box(1.13, 1.1, -1.55, 1.87, 1.12, -1.535, M.lightWood); box(1.13, 1.64, -1.55, 1.87, 1.66, -1.535, M.lightWood);
  box(1.12, 1.1, -1.55, 1.14, 1.66, -1.535, M.lightWood); box(1.86, 1.1, -1.55, 1.88, 1.66, -1.535, M.lightWood);

  // ---------- bed ----------
  box(-2.55, 0.3, -1.48, -0.62, 0.5, -0.17, M.sheet, { round: 0.04 });
  box(-2.25, 0.49, -1.53, -0.55, 0.565, -0.11, M.blanket, { round: 0.03, catcher: true });
  box(-2.25, 0.29, -1.535, -0.56, 0.52, -1.515, M.blanket, { cast: false });
  box(-2.25, 0.29, -0.125, -0.56, 0.52, -0.105, M.blanket, { cast: false });
  box(-0.57, 0.3, -1.53, -0.55, 0.53, -0.11, M.blanket, { cast: false });
  box(-2.52, 0.5, -1.38, -2.16, 0.64, -0.82, M.leaves, { round: 0.06 });
  box(-2.5, 0.5, -0.78, -2.18, 0.62, -0.25, M.leaves, { round: 0.06 });
  for (const z of [-1.5, -0.14]) {
    box(-2.6, 0.26, z - 0.015, -0.6, 0.3, z + 0.015, M.black);
    box(-0.63, 0, z - 0.015, -0.6, 0.3, z + 0.015, M.black);
    cyl(0.017, 0.017, 0.98, -2.575, 0.49, z, M.black, { seg: 10 });
  }
  {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, z = -1.5 + t * 1.36;
      pts.push(new THREE.Vector3(-2.575, 0.9 + Math.sin(t * Math.PI) * 0.12, z));
    }
    add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.014, 8), M.black));
    const pts2 = pts.map((p) => new THREE.Vector3(p.x, 0.62 + (p.y - 0.9) * 0.7, p.z));
    add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2), 40, 0.01, 8), M.black));
    for (let i = 1; i < 6; i++) {
      const t = i / 6, z = -1.5 + t * 1.36, top = 0.9 + Math.sin(t * Math.PI) * 0.12;
      cyl(0.008, 0.008, top - 0.62, -2.575, (top + 0.62) / 2, z, M.black, { seg: 6 });
    }
  }
  colBox(-2.6, 0, -1.53, -0.56, 0.56, -0.11, { kind: 'soft', sound: 'cloth' });
  colBox(-2.62, 0.56, -1.52, -2.54, 1.0, -0.12, { kind: 'metal', sound: 'metalLight' });
  obstacles.push({ x0: -2.62, z0: -1.55, x1: -0.55, z1: -0.1 });
  // wooden chair at the bed head (as in the photos)
  {
    const c = new THREE.Group(); c.position.set(-2.32, 0, -1.72); root.add(c);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.38), M.lightWood); seat.position.y = 0.45; c.add(seat);
    for (const [x, z] of [[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.45, 0.03), M.lightWood); l.position.set(x, 0.225, z); c.add(l);
    }
    for (const x of [-0.18, 0.18]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), M.lightWood); p.position.set(x, 0.72, -0.17); c.add(p); }
    for (const y of [0.66, 0.84]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.05, 0.02), M.lightWood); r.position.set(0, y, -0.17); c.add(r); }
    c.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  }

  // ---------- futon ----------
  box(-1.15, 0.3, 1.0, 0.8, 0.48, 1.84, M.futon, { round: 0.06, catcher: true });
  {
    const back = new THREE.Mesh(new RoundedBoxGeometry(1.95, 0.52, 0.15, 3, 0.06), M.futon);
    back.position.set(-0.175, 0.74, 1.76); back.rotation.x = 0.16; add(back);
    const pil = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.4, 0.13, 3, 0.06), M.pillowDark);
    pil.position.set(-0.85, 0.66, 1.62); pil.rotation.set(0.2, 0.1, 0.06); add(pil);
    const bl = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.05, 0.8, 2, 0.02), M.throwBlanket);
    bl.position.set(0.42, 0.5, 1.42); bl.rotation.y = 0.12; add(bl);
  }
  for (const x of [-1.16, 0.81]) {
    box(x - 0.012, 0.2, 0.98, x + 0.012, 0.32, 1.86, M.black);
    box(x - 0.012, 0, 1.0, x + 0.012, 0.2, 1.03, M.black);
    box(x - 0.012, 0, 1.8, x + 0.012, 0.2, 1.83, M.black);
    box(x - 0.012, 0.3, 1.82, x + 0.012, 1.02, 1.85, M.black);
  }
  colBox(-1.17, 0, 1.0, 0.82, 0.48, 1.86, { kind: 'soft', sound: 'cloth' });
  colBox(-1.17, 0.48, 1.66, 0.82, 1.0, 1.86, { kind: 'soft', sound: 'cloth' });
  obstacles.push({ x0: -1.2, z0: 0.95, x1: 0.85, z1: 1.9 });

  // ---------- coffee table ----------
  box(-0.5, 0.42, 0.06, 0.5, 0.47, 0.66, M.oak, { col: { kind: 'table', sound: 'wood' }, catcher: true });
  box(-0.5, 0, 0.08, -0.44, 0.42, 0.64, M.oak, { col: { kind: 'table', sound: 'wood' } });
  box(0.44, 0, 0.08, 0.5, 0.42, 0.64, M.oak, { col: { kind: 'table', sound: 'wood' } });
  obstacles.push({ x0: -0.52, z0: 0.04, x1: 0.52, z1: 0.68 });
  {
    const lap = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.018, 0.22, 2, 0.006), std('#d6d7d9', 0.35, 0.4));
    lap.position.set(0.16, 0.48, 0.4); lap.rotation.y = 0.35; add(lap);
    const nb = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.012, 0.29), std('#9cb6d8', 0.8));
    nb.position.set(-0.2, 0.476, 0.33); nb.rotation.y = -0.4; add(nb);
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 6), std('#2a4fa8', 0.4));
    pen.position.set(-0.2, 0.486, 0.32); pen.rotation.set(0, 0.6, Math.PI / 2); add(pen);
    const rem = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.02, 0.15, 2, 0.008), M.white);
    rem.position.set(-0.36, 0.48, 0.56); rem.rotation.y = 0.9; add(rem);
    const cable = new THREE.CatmullRomCurve3([[-0.05, 0.474, 0.18], [0.02, 0.474, 0.26], [-0.1, 0.474, 0.38], [0.0, 0.474, 0.5], [0.06, 0.474, 0.45]].map((p) => new THREE.Vector3(...p)));
    add(new THREE.Mesh(new THREE.TubeGeometry(cable, 30, 0.004, 5), M.matte));
    box(0.04, 0.47, 0.42, 0.09, 0.5, 0.48, M.matte);
  }

  // ---------- desk + folding chair ----------
  box(1.05, 0.72, -1.55, 2.05, 0.745, -0.98, M.deskWood, { col: { kind: 'table', sound: 'wood' }, catcher: true });
  for (const x of [1.08, 2.02]) for (const z of [-1.52, -1.01]) cyl(0.012, 0.012, 0.72, x, 0.36, z, std('#8b8e92', 0.4, 0.6), { seg: 8 });
  {
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.33, 0.016, 0.23, 2, 0.005), std('#3a3c40', 0.4, 0.5));
    base.position.set(1.52, 0.754, -1.22); add(base);
    const scr = new THREE.Group(); scr.position.set(1.52, 0.762, -1.335); scr.rotation.x = -0.32; root.add(scr);
    const lid = new THREE.Mesh(new RoundedBoxGeometry(0.33, 0.22, 0.012, 2, 0.005), std('#3a3c40', 0.4, 0.5)); lid.position.y = 0.11; lid.castShadow = true; scr.add(lid);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.19), std('#20262e', 0.3, 0, { emissive: '#5c7da6', emissiveIntensity: 0.35 })); disp.position.set(0, 0.11, 0.007); scr.add(disp);
    cyl(0.035, 0.03, 0.1, 1.15, 0.795, -1.45, std('#e9e3d7', 0.5));
    for (let i = 0; i < 4; i++) cyl(0.004, 0.004, 0.14, 1.14 + i * 0.008, 0.86, -1.45 + (i % 2) * 0.01, std(['#d33', '#33a', '#111', '#3a3'][i], 0.4), { seg: 5 });
    const c = new THREE.Group(); c.position.set(1.55, 0, -0.78); root.add(c);
    const fr = std('#9a9ea3', 0.35, 0.7);
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.04, 0.38, 2, 0.015), M.navy); seat.position.y = 0.46; c.add(seat);
    const bk = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.2, 0.03, 2, 0.012), M.navy); bk.position.set(0, 0.8, 0.2); bk.rotation.x = -0.08; c.add(bk);
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.92, 8), fr); a.position.set(s * 0.2, 0.44, 0.06); a.rotation.x = 0.28; c.add(a);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.5, 8), fr); b.position.set(s * 0.2, 0.23, -0.1); b.rotation.x = -0.45; c.add(b);
    }
    c.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    colBox(1.33, 0, -0.98, 1.77, 0.9, -0.56, { kind: 'chair', sound: 'metalLight', id: 'chair' });
    wobblers.chair = { obj: [c], kind: 'rock', t: 0, a: 0 };
  }
  obstacles.push({ x0: 1.03, z0: -1.6, x1: 2.07, z1: -0.97 });
  obstacles.push({ x0: 1.32, z0: -1.0, x1: 1.78, z1: -0.55 });

  // ---------- round side table near the balcony ----------
  cyl(0.27, 0.27, 0.02, 3.25, 0.55, 1.2, M.black, { seg: 32, catcher: true });
  cyl(0.24, 0.24, 0.012, 3.25, 0.15, 1.2, M.black, { seg: 32 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    cyl(0.009, 0.009, 0.55, 3.25 + Math.cos(a) * 0.22, 0.275, 1.2 + Math.sin(a) * 0.22, M.black, { seg: 6 });
  }
  colBox(2.98, 0.53, 0.93, 3.52, 0.565, 1.47, { kind: 'table', sound: 'metalLight' });
  colBox(3.2, 0, 1.15, 3.3, 0.53, 1.25, { kind: 'table', sound: 'metalLight' });
  obstacles.push({ cx: 3.25, cz: 1.2, r: 0.3 });

  // ---------- standing mirror ----------
  const mirrorGroup = new THREE.Group();
  mirrorGroup.position.set(3.68, 0, -1.28); mirrorGroup.rotation.y = -0.93; root.add(mirrorGroup);
  {
    const frame = std('#7f8388', 0.4, 0.5);
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.62, 0.035), frame); f.position.y = 0.86; f.castShadow = true; mirrorGroup.add(f);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 1.56), M.mirror); g.position.set(0, 0.86, 0.019); mirrorGroup.add(g);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.2, 0.03), frame); st.position.set(0, 0.55, -0.22); st.rotation.x = 0.35; mirrorGroup.add(st);
    colliders.push({ type: 'box', c: [3.68, 0.86, -1.28], h: [0.25, 0.81, 0.04], rotY: -0.93, kind: 'mirror', sound: 'glass', id: 'mirror' });
    wobblers.mirror = { obj: [mirrorGroup], kind: 'rock', t: 0, a: 0 };
  }
  obstacles.push({ cx: 3.68, cz: -1.28, r: 0.32 });

  // ---------- balcony door ----------
  {
    const fr = std('#1c1d20', 0.45, 0.4);
    box(3.93, 0, -0.9, 4.0, 2.25, -0.83, fr); box(3.93, 0, 0.83, 4.0, 2.25, 0.9, fr);
    box(3.93, 2.18, -0.9, 4.0, 2.25, 0.9, fr); box(3.93, 0, -0.9, 4.0, 0.05, 0.9, fr);
    for (const [a, b] of [[-0.83, 0], [0, 0.83]]) {
      box(3.945, 0.05, a, 3.985, 0.16, b, fr); box(3.945, 2.1, a, 3.985, 2.18, b, fr);
      box(3.945, 0.05, a, 3.985, 2.18, a + 0.06, fr); box(3.945, 0.05, b - 0.06, 3.985, 2.18, b, fr);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(b - a - 0.12, 1.94), M.glass);
      gl.position.set(3.965, 1.13, (a + b) / 2); gl.rotation.y = -Math.PI / 2; gl.renderOrder = 2; root.add(gl);
      box(3.93, 1.0, b - 0.11, 3.945, 1.12, b - 0.09, M.chrome);
    }
    colBox(3.9, 0, -0.9, 3.99, 2.25, 0.9, { kind: 'glass', sound: 'rattle', id: 'balcony' });
    // outside: balcony floor, railing, view
    const out = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), M.outside);
    out.position.set(7.5, 2.2, 0); out.rotation.y = -Math.PI / 2; root.add(out);
    const bf = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 6), std('#c9c2b6', 0.8));
    bf.rotation.x = -Math.PI / 2; bf.position.set(5.1, -0.01, 0); root.add(bf);
    const rail = std('#26272a', 0.5, 0.5);
    box(5.6, 0.98, -3, 5.64, 1.02, 3, rail, { cast: false });
    for (let z = -3; z <= 3; z += 0.12) box(5.61, 0, z - 0.008, 5.63, 1.0, z + 0.008, rail, { cast: false });
    box(4.0, 0, -3, 5.6, 2.6, -2.95, std('#e8e4dc', 0.9), { cast: false });
    box(4.0, 0, 2.95, 5.6, 2.6, 3, std('#e8e4dc', 0.9), { cast: false });
    // curtain rod + curtains
    cyl(0.012, 0.012, 2.4, 3.86, 2.33, 0, M.gold, { rx: Math.PI / 2, seg: 10 });
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.48, 2.3, 30, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const u = p.getX(i); p.setZ(i, Math.sin(u * 52) * 0.035); }
      g.computeVertexNormals();
      const cm = new THREE.Mesh(g, M.curtain); cm.position.set(3.84, 1.16, s * 0.98); cm.rotation.y = -Math.PI / 2; add(cm, { cast: false });
      const g2 = new THREE.PlaneGeometry(0.3, 2.3, 20, 1);
      const p2 = g2.attributes.position;
      for (let i = 0; i < p2.count; i++) { const u = p2.getX(i); p2.setZ(i, Math.sin(u * 40 + 1) * 0.03); }
      g2.computeVertexNormals();
      const dm = new THREE.Mesh(g2, M.drape); dm.position.set(3.8, 1.16, s * 1.12); dm.rotation.y = -Math.PI / 2; add(dm, { cast: false });
    }
    colBox(3.75, 0, -1.3, 3.9, 2.3, -0.82, { kind: 'soft', sound: 'cloth' });
    colBox(3.75, 0, 0.82, 3.9, 2.3, 1.3, { kind: 'soft', sound: 'cloth' });
  }

  // ---------- ceiling lights ----------
  {
    const sq = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.08, 0.46, 2, 0.02), M.lamp);
    sq.position.set(-1.2, 2.78, 0.55); sq.rotation.x = -0.4636; add(sq, { cast: false });
    const rd = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.05, 28), M.lampWhite);
    rd.position.set(2.0, 3.02, 0); add(rd, { cast: false });
  }

  // ---------- hot potato draw-zone tape (hidden unless that mode is on) ----------
  const hotTape = new THREE.Group(); hotTape.visible = false; root.add(hotTape);
  {
    const strip = (x, z0, z1) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.05, z1 - z0), M.tape);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.002, (z0 + z1) / 2); m.receiveShadow = true; hotTape.add(m);
    };
    strip(-0.7, -0.08, 0.93); strip(0.7, -1.52, 0.93);
    for (const x of [-0.35, 0, 0.35]) {
      const a = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.18), M.tape); a.rotation.set(-Math.PI / 2, 0, 0.7); a.position.set(x, 0.003, -0.55); hotTape.add(a);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.18), M.tape); b.rotation.set(-Math.PI / 2, 0, -0.7); b.position.set(x, 0.003, -0.55); hotTape.add(b);
    }
  }

  // ---------- wobble animation for things the dumpling bumps ----------
  function wobble(id, strength = 1) {
    const w = wobblers[id];
    if (!w) return;
    w.a = Math.min(1, w.a + strength);
    w.t = 0;
  }
  function update(dt) {
    for (const id in wobblers) {
      const w = wobblers[id];
      if (w.a <= 0.001) continue;
      w.t += dt; w.a *= Math.exp(-dt * 2.2);
      const s = Math.sin(w.t * (w.kind === 'swing' ? 7 : 16)) * w.a;
      w.obj.forEach((o, i) => {
        if (w.kind === 'swing') o.rotation.z = s * 0.25 * (i % 2 ? -1 : 1);
        else o.rotation.z = s * 0.04;
      });
    }
  }

  // Merge static meshes that share a material into single draw calls (big win on phones).
  {
    const keep = new Set(shadowCatchers);
    const groups = new Map();
    for (const m of [...root.children]) {
      if (!m.isMesh || m.isInstancedMesh || keep.has(m) || m.renderOrder || m.material.transparent) continue;
      const g = m.geometry;
      const key = [m.material.uuid, Object.keys(g.attributes).sort().join(','), g.index ? 'i' : 'n', m.castShadow, m.receiveShadow].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => { m.updateMatrix(); const c = m.geometry.clone(); c.applyMatrix4(m.matrix); c.clearGroups(); return c; });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      const mm = new THREE.Mesh(merged, list[0].material);
      mm.castShadow = list[0].castShadow; mm.receiveShadow = list[0].receiveShadow;
      for (const m of list) { root.remove(m); m.geometry.dispose(); }
      geos.forEach((g) => g.dispose());
      root.add(mm);
    }
  }

  return { root, colliders, obstacles, shadowCatchers, mirrorGroup, hotTape, wobble, update, M };
}
