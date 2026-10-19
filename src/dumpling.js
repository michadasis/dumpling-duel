// The squishy dumpling: plump white bun, pleated swirl on top, little face, jelly squash.
import * as THREE from 'three';
import { smooth, clamp } from './util.js';

const SCALE = 0.098; // unit model (2 wide) -> ~19.6 cm

// Maps a direction on the unit sphere to the dumpling surface.
function shapePoint(v) {
  const phi = Math.atan2(v.z, v.x);
  const t = smooth(0.15, 0.95, v.y);
  let y = v.y >= 0 ? v.y * 0.74 : v.y * 0.6;
  if (y < -0.52) y = -0.52 + (y + 0.52) * 0.15;
  const pleat = 1 + 0.085 * t * Math.sin(12 * phi + v.y * 4.5);
  const pinch = 1 - 0.42 * t * t;
  const belly = 1 + 0.06 * (1 - Math.abs(v.y)) - (v.y < -0.6 ? 0.05 : 0);
  const r = pleat * pinch * belly;
  return new THREE.Vector3(v.x * r, y + 0.06, v.z * r);
}

function buildBunGeometry() {
  const g = new THREE.SphereGeometry(1, 72, 48);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    const s = shapePoint(v);
    p.setXYZ(i, s.x, s.y, s.z);
  }
  g.computeVertexNormals();
  return g;
}

function onSurface(dir, lift = 0.012) {
  const v = new THREE.Vector3(...dir).normalize();
  const s = shapePoint(v);
  const eps = 0.01;
  const a = shapePoint(new THREE.Vector3(v.x + eps, v.y, v.z).normalize());
  const b = shapePoint(new THREE.Vector3(v.x, v.y + eps, v.z).normalize());
  const n = new THREE.Vector3().subVectors(a, s).cross(new THREE.Vector3().subVectors(b, s)).normalize();
  if (n.dot(s) < 0) n.negate();
  s.addScaledVector(n, lift);
  return { pos: s, normal: n };
}

function place(obj, dir, lift) {
  const { pos, normal } = onSurface(dir, lift);
  obj.position.copy(pos);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  return obj;
}

export function createDumplingMesh() {
  const bunMat = new THREE.MeshPhysicalMaterial({
    color: '#fbf7ef', roughness: 0.62, sheen: 0.6, sheenColor: new THREE.Color('#fff4e6'), sheenRoughness: 0.5,
    clearcoat: 0.08, emissive: new THREE.Color('#000000'),
  });
  const bun = new THREE.Mesh(buildBunGeometry(), bunMat);
  bun.castShadow = true;

  const face = new THREE.Group();
  const ink = new THREE.MeshStandardMaterial({ color: '#1b1714', roughness: 0.25 });
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const blushMat = new THREE.MeshBasicMaterial({ color: '#ff9fb1', transparent: true, opacity: 0.6, depthWrite: false });

  const eyes = new THREE.Group();
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.088, 16, 12), ink);
    e.scale.set(1, 1.18, 0.42);
    place(e, [s * 0.31, 0.2, 1], 0.0);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), shine);
    hl.position.set(-0.025, 0.035, 0.03); e.add(hl);
    eyes.add(e);
  }
  const squint = new THREE.Group();
  for (const s of [-1, 1]) {
    const pts = [new THREE.Vector3(-0.06 * s, 0.05, 0), new THREE.Vector3(0.05 * s, 0, 0), new THREE.Vector3(-0.06 * s, -0.05, 0)];
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 10, 0.016, 6), ink);
    place(m, [s * 0.31, 0.2, 1], 0.01);
    squint.add(m);
  }
  squint.visible = false;
  const closed = new THREE.Group();
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 6, 14, Math.PI), ink);
    place(m, [s * 0.31, 0.18, 1], 0.01);
    m.rotateZ(Math.PI);
    closed.add(m);
  }
  closed.visible = false;
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), blushMat);
    b.scale.set(1.35, 0.8, 1);
    place(b, [s * 0.57, 0.04, 0.82], 0.006);
    face.add(b);
  }
  const mouth = new THREE.Group();
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.014, 6, 14, Math.PI), ink);
    place(m, [s * 0.043, 0.04, 1], 0.008);
    m.rotateZ(Math.PI);
    mouth.add(m);
  }
  const ohMouth = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.013, 6, 16), ink);
  place(ohMouth, [0, 0.02, 1], 0.008);
  ohMouth.visible = false;
  // nervous sweat drop for Hot Potato
  const sweat = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshPhysicalMaterial({ color: '#9fd8ff', roughness: 0.05, transparent: true, opacity: 0.85 }));
  sweat.scale.set(0.8, 1.2, 0.6);
  place(sweat, [0.7, 0.25, 0.6], 0.03);
  sweat.visible = false;
  face.add(eyes, squint, closed, mouth, ohMouth, sweat);

  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), bunMat);
  knot.position.set(0, 0.79, 0); knot.scale.set(1, 0.7, 1); knot.castShadow = true;

  const model = new THREE.Group();
  model.add(bun, face, knot);
  model.scale.setScalar(SCALE);
  return { model, bunMat, parts: { eyes, squint, closed, mouth, ohMouth, sweat } };
}

// Wraps the mesh with a jelly squash/stretch rig.
export class DumplingView {
  constructor() {
    const { model, bunMat, parts } = createDumplingMesh();
    this.bunMat = bunMat;
    this.parts = parts;
    this.root = new THREE.Group();      // world position
    this.axis = new THREE.Group();      // aligns local Y to the squash axis
    this.scaler = new THREE.Group();    // scales along that axis
    this.unaxis = new THREE.Group();    // undoes the axis rotation
    this.spin = new THREE.Group();      // the body orientation
    this.root.add(this.axis); this.axis.add(this.scaler); this.scaler.add(this.unaxis); this.unaxis.add(this.spin); this.spin.add(model);
    this.s = 0; this.sv = 0; this.target = 0;
    this.expr = 'happy'; this.exprT = 0;
    this.heat = 0; this.pulse = 0;
  }

  impact(normal, strength) {
    const n = new THREE.Vector3(...normal);
    if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
    n.normalize();
    this.axis.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    this.unaxis.quaternion.copy(this.axis.quaternion).invert();
    this.sv += clamp(strength, 0, 1) * 9;
    if (strength > 0.25) this.setExpression('squint', 0.7);
  }

  squeeze(amount, axisWorld) {
    this.target = amount;
    if (axisWorld) {
      this.axis.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axisWorld);
      this.unaxis.quaternion.copy(this.axis.quaternion).invert();
    }
  }

  setExpression(e, hold = 0) {
    this.expr = e; this.exprT = hold;
    const P = this.parts;
    P.eyes.visible = e === 'happy' || e === 'nervous';
    P.squint.visible = e === 'squint';
    P.closed.visible = e === 'sleepy';
    P.mouth.visible = e !== 'squint' && e !== 'nervous';
    P.ohMouth.visible = e === 'squint' || e === 'nervous';
    P.sweat.visible = e === 'nervous';
  }

  setHeat(h) { this.heat = h; }

  update(dt, quat) {
    // damped spring: s is compression (positive = squashed along axis)
    const k = 260, c = 11;
    const a = -k * (this.s - this.target) - c * this.sv;
    this.sv += a * dt; this.s += this.sv * dt;
    const s = clamp(this.s, -0.35, 0.55);
    this.scaler.scale.set(1 + s * 0.55, 1 - s, 1 + s * 0.55);
    if (quat) this.spin.quaternion.copy(quat);
    if (this.exprT > 0) { this.exprT -= dt; if (this.exprT <= 0) this.setExpression(this.heat > 0.65 ? 'nervous' : 'happy'); }
    else if (this.heat > 0.65 && this.expr === 'happy') this.setExpression('nervous');
    else if (this.heat <= 0.65 && this.expr === 'nervous') this.setExpression('happy');
    // hot potato glow
    this.pulse += dt * (2 + this.heat * 14);
    const glow = this.heat > 0 ? this.heat * this.heat * (0.55 + 0.45 * Math.sin(this.pulse)) : 0;
    this.bunMat.emissive.setRGB(glow * 1.6, glow * 0.32, glow * 0.04);
    this.bunMat.color.setRGB(0.985, 0.968 - this.heat * 0.5, 0.937 - this.heat * 0.7);
  }
}
