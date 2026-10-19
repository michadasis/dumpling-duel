// Opponent for solo play. Drives sim.players[idx] through the same API a remote player uses.
import { ZONES, RULES, PHYS, SPAWN } from './config.js';
import { resolveMove } from './movement.js';
import { throwOrigin, headY, eyeY, clamp, rand, catchDistance } from './util.js';

export const BOT_LEVELS = {
  easy: { catchP: 0.55, react: 0.34, aimErr: 0.34, speed: 0.7, wait: [1.0, 2.3] },
  normal: { catchP: 0.76, react: 0.22, aimErr: 0.2, speed: 0.88, wait: [0.7, 1.7] },
  hard: { catchP: 0.92, react: 0.13, aimErr: 0.1, speed: 1.0, wait: [0.45, 1.2] },
};

function solveAim(o, t, v) {
  const dx = t.x - o.x, dz = t.z - o.z, dy = t.y - o.y;
  const h = Math.hypot(dx, dz) || 0.01, g = 9.81, v2 = v * v;
  const disc = v2 * v2 - g * (g * h * h + 2 * dy * v2);
  if (disc < 0) return null;
  const ang = Math.atan((v2 - Math.sqrt(disc)) / (g * h));
  return { x: (dx / h) * Math.cos(ang), y: Math.sin(ang), z: (dz / h) * Math.cos(ang) };
}

export class Bot {
  constructor(sim, idx, obstacles, level = 'normal') {
    this.sim = sim; this.i = idx; this.obstacles = obstacles;
    this.L = BOT_LEVELS[level] || BOT_LEVELS.normal;
    this.reset();
  }

  reset() {
    this.holdT = 0; this.plan = null; this.flightId = 0; this.catchPlan = null;
    this.wander = { x: SPAWN[this.i].x, z: SPAWN[this.i].z }; this.wanderT = 0;
    this.pickT = 0; this.react = null; this.lookYaw = SPAWN[this.i].yaw;
  }

  planThrow() {
    const gs = this.sim.gs, L = this.L;
    const e = () => (Math.random() + Math.random() - 1) * L.aimErr;
    if (gs.phase === 'penalty') return { wait: rand(0.8, 2.2), speed: rand(9, 11.5), kind: 'head', ex: e() * 1.1, ey: e() * 0.9 };
    if (gs.mode === 'hotpotato') {
      const urgent = gs.timeLeft < 5;
      const sneaky = !urgent && gs.timeLeft > 12 && Math.random() < 0.2;
      return { wait: urgent ? 0.05 : sneaky ? rand(1.5, 2.4) : rand(0.25, 0.9), speed: rand(9.5, 12.5), kind: 'low', ex: e() + rand(-0.25, 0.25), ey: e() };
    }
    if (gs.mode === 'penalty') {
      const side = Math.random() < 0.5 ? -1 : 1;
      return { wait: rand(...L.wait), speed: rand(9.5, 12.5), kind: Math.random() < 0.4 ? 'low' : 'chest', ex: side * rand(0.2, 0.45) + e(), ey: e() };
    }
    const r = Math.random();
    return { wait: rand(...L.wait), speed: rand(7, 10.5), kind: r < 0.15 ? 'head' : 'chest', ex: e() + (r > 0.9 ? rand(-0.9, 0.9) : 0), ey: e() };
  }

  aimDir(plan) {
    const p = this.sim.players[this.i], opp = this.sim.players[1 - this.i];
    const y = plan.kind === 'head' ? headY(opp) : plan.kind === 'low' ? 0.75 : eyeY(opp) - 0.35;
    const toX = opp.x - p.x, toZ = opp.z - p.z, len = Math.hypot(toX, toZ) || 1;
    const sx = -toZ / len, sz = toX / len;
    const target = { x: opp.x + sx * plan.ex, y: y + plan.ey, z: opp.z + sz * plan.ex };
    const flat = { x: toX / len, y: 0, z: toZ / len };
    const o = throwOrigin(p, flat);
    let v = plan.speed, dir = null;
    for (let k = 0; k < 8; k++) { dir = solveAim(o, target, v); if (dir) break; v += 0.8; }
    if (!dir) { dir = { x: flat.x * 0.85, y: 0.5, z: flat.z * 0.85 }; v = PHYS.throwMax; }
    const power = clamp((v - PHYS.throwMin) / (PHYS.throwMax - PHYS.throwMin), 0, 1);
    return { dir, power };
  }

  predictCross(pos, vel, x) {
    // Ballistic prediction of where the dumpling crosses the plane at this x.
    let px = pos.x, py = pos.y, pz = pos.z, vx = vel.x, vy = vel.y, vz = vel.z;
    const h = 1 / 90;
    for (let t = 0; t < 1.6; t += h) {
      const nx = px + vx * h;
      if ((px - x) * (nx - x) <= 0) return { x, y: py, z: pz, t };
      px = nx; py += vy * h; pz += vz * h; vy -= 9.81 * h;
      if (py < 0) return { x: px, y: 0, z: pz, t, floor: true };
    }
    return null;
  }

  update(dt) {
    const sim = this.sim, gs = sim.gs, i = this.i, p = sim.players[i], opp = sim.players[1 - i], d = sim.d, L = this.L;
    if (!gs) return;
    const frozen = sim.isFrozen();
    p.handsOut = sim.time < p.catchUntil;
    let tx = p.x, tz = p.z, speedMul = 1;
    let look = { x: opp.x, y: headY(opp) - 0.25, z: opp.z };

    // Penalty victim: brace or close eyes.
    if (gs.phase === 'penalty' && gs.penalty?.victim === i && !gs.penalty.result) {
      if (!this.react) this.react = { kind: Math.random() < 0.55 ? 'brace' : 'eyes', at: sim.time + rand(0.3, 1.2) };
      const on = sim.time > this.react.at;
      p.brace = on && this.react.kind === 'brace';
      p.eyes = on && this.react.kind === 'eyes';
    } else { this.react = null; p.brace = false; p.eyes = false; }

    // Holding: wait, charge, throw.
    if (d.state === 'held' && d.holder === i && (gs.phase === 'live' || (gs.phase === 'penalty' && gs.penalty?.shooter === i && !gs.penalty.shot))) {
      if (!this.plan) { this.plan = this.planThrow(); this.holdT = 0; }
      this.holdT += dt;
      const aim = this.aimDir(this.plan);
      look = { x: p.x + aim.dir.x, y: eyeY(p) + aim.dir.y, z: p.z + aim.dir.z };
      if (this.holdT > this.plan.wait) {
        p.charging = true;
        p.power = Math.min(aim.power, p.power + dt / PHYS.chargeTime);
        if (p.power >= aim.power - 0.01) {
          sim.requestThrow(i, aim.dir, aim.power);
          this.plan = null; p.charging = false; p.power = 0;
        }
      }
      speedMul = 0.4;
    } else { this.plan = null; p.charging = false; p.power = 0; }

    // Incoming throw: move to intercept and time the catch.
    if (d.state === 'flying' && d.flight && d.flight.thrower !== i && !d.flight.penalty) {
      const f = d.flight;
      if (this.flightId !== f.id) {
        this.flightId = f.id;
        const must = gs.mode === 'penalty' || gs.mode === 'hotpotato';
        this.catchPlan = { success: Math.random() < (must ? L.catchP + 0.04 : L.catchP), decideAt: sim.time + L.react, pressed: false, cross: null };
      }
      const cp = this.catchPlan;
      if (sim.time > cp.decideAt) {
        const b = sim.db;
        cp.cross = this.predictCross(b.position, b.velocity, p.x) || cp.cross;
        if (cp.cross && !cp.cross.floor && cp.cross.y > 0.35 && cp.cross.y < 2.3) {
          if (cp.miss === undefined) cp.miss = (Math.random() < 0.5 ? -1 : 1) * rand(0.1, 0.3);
          tz = cp.success ? cp.cross.z : cp.cross.z + cp.miss;
          if (cp.cross.y < 0.75) p.crouch = cp.success;
        } else if (cp.cross && cp.cross.floor && Math.abs(cp.cross.x - p.x) < 1.2) {
          tx = cp.cross.x; tz = cp.cross.z;
        }
        look = { x: b.position.x, y: b.position.y, z: b.position.z };
        const dist = catchDistance(p, b.position);
        if (!cp.pressed) {
          // A failed attempt either never gets the hands out or gets them out far too early.
          if (cp.early === undefined) cp.early = Math.random() < 0.5;
          const trigger = cp.success ? dist < 0.85 + b.velocity.length() * 0.05 : cp.early && dist < 4.2 && dist > 3.4;
          if (trigger) { sim.requestCatch(i); cp.pressed = true; }
        }
      }
      speedMul = 1.15;
    } else {
      p.crouch = false;
    }

    // Loose dumpling on my side: go pick it up.
    if (d.state === 'loose' && gs.phase === 'live' && !sim.pendingPenalty) {
      const b = sim.db.position;
      const owner = d.ownerLocked ? d.owner : sim.closer(b);
      if (owner === i) {
        tx = b.x; tz = b.z;
        look = { x: b.x, y: b.y, z: b.z };
        if (Math.hypot(b.x - p.x, b.z - p.z) < RULES.pickupReach - 0.15) {
          this.pickT += dt;
          if (this.pickT > 0.18) { sim.requestPickup(i); this.pickT = 0; }
        }
      }
    } else this.pickT = 0;

    // Idle wander.
    if (tx === p.x && tz === p.z && d.state !== 'flying') {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        const z = ZONES[i];
        this.wander = { x: clamp(SPAWN[i].x + rand(-0.5, 0.5), z.x0, z.x1), z: clamp(SPAWN[i].z + rand(-0.6, 0.6), z.z0, z.z1) };
        this.wanderT = rand(1.2, 3);
      }
      tx = this.wander.x; tz = this.wander.z; speedMul *= 0.35;
    }

    if (!frozen) {
      const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);
      const sp = PHYS.moveSpeed * L.speed * speedMul;
      let nx = p.x, nz = p.z;
      if (dist > 0.02) { const s = Math.min(dist, sp * dt); nx += (dx / dist) * s; nz += (dz / dist) * s; }
      const r = resolveMove(nx, nz, ZONES[i], this.obstacles);
      p.vx = (r.x - p.x) / Math.max(dt, 1e-3); p.vz = (r.z - p.z) / Math.max(dt, 1e-3);
      p.x = r.x; p.z = r.z;
    } else { p.vx = 0; p.vz = 0; }

    const lx = look.x - p.x, lz = look.z - p.z;
    const wantYaw = Math.atan2(-lx, -lz);
    let dy = wantYaw - p.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    p.yaw += dy * Math.min(1, dt * 8);
    const wantPitch = Math.atan2(look.y - eyeY(p), Math.hypot(lx, lz) || 0.01);
    p.pitch += (clamp(wantPitch, -1.2, 1.2) - p.pitch) * Math.min(1, dt * 8);
  }
}
