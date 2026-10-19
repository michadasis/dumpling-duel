// First-person hands attached to the camera.
import * as THREE from 'three';
import { damp } from './util.js';

export class FPRig {
  constructor(color) {
    this.root = new THREE.Group();
    const sleeve = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: '#f1c7a4', roughness: 0.7 });
    this.sleeve = sleeve;
    const mkArm = (side) => {
      const g = new THREE.Group();
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), skin);
      hand.scale.set(1, 0.85, 1.2);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.03, 4, 6), skin);
      thumb.position.set(-side * 0.04, 0.012, -0.02); thumb.rotation.set(0.4, 0, side * 1.0);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.26, 4, 10), sleeve);
      fore.position.set(side * 0.03, -0.09, 0.15); fore.rotation.x = -1.0;
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.012, 6, 14), sleeve);
      cuff.position.set(side * 0.008, -0.03, 0.05); cuff.rotation.x = -1.0 + Math.PI / 2;
      g.add(hand, thumb, fore, cuff);
      const anchor = new THREE.Group(); anchor.position.set(-side * 0.02, 0.07, -0.05); g.add(anchor);
      this.root.add(g);
      return { g, anchor, pos: new THREE.Vector3(), rot: new THREE.Euler() };
    };
    this.R = mkArm(1); this.L = mkArm(-1);
    this.R.pos.set(0.24, -0.32, -0.46); this.L.pos.set(-0.27, -0.36, -0.48);
    this.throwT = 0; this.bob = 0; this.shake = 0;
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 5; } });
  }

  setColor(c) { this.sleeve.color.set(c); }
  throwAnim() { this.throwT = 0.3; }

  update(dt, st) {
    // st: { holding, charging, power, handsOut, brace, moving, eyes }
    this.throwT = Math.max(0, this.throwT - dt);
    this.bob += dt * (st.moving ? 9 : 2);
    const bobY = Math.sin(this.bob) * (st.moving ? 0.012 : 0.004);
    let r = [0.25, -0.34, -0.48], l = [-0.28, -0.4, -0.5], rr = [0, 0, 0.2], lr = [0, 0, -0.2];
    if (st.holding) { r = [0.23, -0.27, -0.5]; rr = [0.15, 0.1, 0.25]; }
    if (st.charging) {
      const k = 0.3 + st.power * 0.7;
      r = [0.25 + k * 0.03, -0.17 + k * 0.06, -0.36 + k * 0.14]; rr = [0.5 * k, 0.2, 0.35];
      l = [-0.2, -0.24, -0.56]; lr = [0.3, 0, -0.3];
    }
    if (this.throwT > 0) { const t = 1 - this.throwT / 0.3; r = [0.2 - t * 0.12, -0.12 - t * 0.06, -0.3 - t * 0.38]; rr = [-0.6 * t, 0, 0]; }
    if (st.handsOut) { r = [0.1, -0.16, -0.5]; l = [-0.1, -0.16, -0.5]; rr = [0.3, 0.3, 1.2]; lr = [0.3, -0.3, -1.2]; }
    if (st.brace) { this.shake += dt * 40; const sh = Math.sin(this.shake) * 0.004; r = [0.13 + sh, -0.24, -0.32]; l = [-0.13 - sh, -0.24, -0.32]; rr = [0.9, 0.2, 0.6]; lr = [0.9, -0.2, -0.6]; }
    for (const [A, p, q] of [[this.R, r, rr], [this.L, l, lr]]) {
      A.pos.set(damp(A.pos.x, p[0], 16, dt), damp(A.pos.y, p[1] + bobY, 16, dt), damp(A.pos.z, p[2], 16, dt));
      A.g.position.copy(A.pos);
      A.g.rotation.set(damp(A.g.rotation.x, q[0], 14, dt), damp(A.g.rotation.y, q[1], 14, dt), damp(A.g.rotation.z, q[2], 14, dt));
    }
  }
}
