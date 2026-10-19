// Authoritative game simulation: physics, throws, catches, pickups and the three mode rule sets.
// Runs on the host (or locally against the bot). The guest only renders snapshots of it.
import { createPhysics, ALL_FOR_DUMPLING } from './physics.js';
import { generateProps, PROP_TYPES } from './props.js';
import { RULES, PHYS, SPAWN, ZONES, EYE, CROUCH_EYE } from './config.js';
import { throwOrigin, catchDistance, bodyDistance, distToColumn, headY, r3, clamp } from './util.js';

export const DSTATE = { held: 0, flying: 1, loose: 2, gone: 3 };
export const DSTATE_NAMES = ['held', 'flying', 'loose', 'gone'];
const NOISY_STATIC = new Set(['door', 'glass', 'appliance', 'metal', 'mirror', 'cabinet', 'table', 'counter', 'chair', 'soft']);

export function playerFlags(p) {
  return (p.handsOut ? 1 : 0) | (p.brace ? 2 : 0) | (p.eyes ? 4 : 0) | (p.charging ? 8 : 0) | (p.crouch ? 16 : 0);
}
export function applyFlags(p, f) {
  p.handsOut = !!(f & 1); p.brace = !!(f & 2); p.eyes = !!(f & 4); p.charging = !!(f & 8); p.crouch = !!(f & 16);
}

function freshPlayer(i, name) {
  return {
    i, name, x: SPAWN[i].x, z: SPAWN[i].z, yaw: SPAWN[i].yaw, pitch: 0,
    crouch: false, handsOut: false, brace: false, eyes: false, charging: false, power: 0,
    catchUntil: 0, catchCd: 0, remote: false, latency: 0, vx: 0, vz: 0,
  };
}

export class Sim {
  constructor({ colliders, names = ['Player 1', 'Player 2'] }) {
    this.phys = createPhysics(colliders);
    this.world = this.phys.world;
    this.db = this.phys.dumpling;
    this.time = 0;
    this.acc = 0;
    this.events = [];
    this.contacts = [];
    this.players = [0, 1].map((i) => freshPlayer(i, names[i]));
    this.props = [];
    this.propSpecs = [];
    this.d = { state: 'held', holder: 0, flight: null, owner: -1, ownerLocked: false, restT: 0, stuckT: 0, inWorld: false, maskT: 0, flightId: 0, lastHeadT: [-9, -9] };
    this.pendingPenalty = null;
    this.penaltyEndAt = 0;
    this.db.addEventListener('collide', (e) => this.onCollide(e));
    this.gs = null;
  }

  emit(ev) { this.events.push(ev); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  reset(mode, { target = RULES.penaltyTarget, seed = (Math.random() * 1e9) | 0 } = {}) {
    for (const p of this.props) this.world.removeBody(p.body);
    this.props = [];
    this.propSpecs = mode === 'classic' ? generateProps(seed) : [];
    for (const s of this.propSpecs) {
      const body = this.phys.makeProp(s);
      const pr = { spec: s, body, last: null, knocked: false, sndT: -1, fixed: !!PROP_TYPES[s.type].fixed };
      if (!pr.fixed) body.addEventListener('collide', (e) => this.onPropCollide(pr, e));
      this.props[s.id] = pr;
    }
    this.gs = {
      mode, phase: 'intro', phaseT: RULES.introTime,
      timeLeft: mode === 'hotpotato' ? RULES.hotPotatoTime : 0,
      scores: [0, 0], wins: [0, 0], draws: 0, target,
      penalty: null, streak: 0, best: 0, heads: [0, 0], knocked: 0, catches: 0,
      round: 1, winner: -1, last: null, seed,
    };
    this.pendingPenalty = null;
    this.penaltyEndAt = 0;
    for (const p of this.players) Object.assign(p, { x: SPAWN[p.i].x, z: SPAWN[p.i].z, yaw: SPAWN[p.i].yaw, pitch: 0, catchUntil: 0, catchCd: 0 });
    const starter = Math.random() < 0.5 ? 0 : 1;
    this.hold(starter);
    this.emit({ e: 'start', mode, starter, target, specs: this.propSpecs });
  }

  // ---------- player input ----------
  setPlayerState(i, s) {
    const p = this.players[i];
    const frozen = this.isFrozen();
    if (!frozen && s.x !== undefined) {
      const z = ZONES[i];
      const nx = clamp(s.x, z.x0, z.x1), nz = clamp(s.z, z.z0, z.z1);
      const dtv = Math.max(1e-3, this.time - (p._t || 0));
      if (dtv < 0.5) { p.vx = p.vx * 0.6 + ((nx - p.x) / dtv) * 0.4; p.vz = p.vz * 0.6 + ((nz - p.z) / dtv) * 0.4; }
      p.x = nx; p.z = nz;
    }
    p._t = this.time;
    if (s.yaw !== undefined) { p.yaw = s.yaw; p.pitch = s.pitch; }
    p.crouch = frozen ? p.crouch && !this.isPenaltyVictim(i) : !!s.crouch;
    if (this.isPenaltyVictim(i)) p.crouch = false;
    p.handsOut = !!s.handsOut;
    p.charging = !!s.charging;
    p.power = s.power || 0;
    const canReact = this.isPenaltyVictim(i);
    p.brace = canReact && !!s.brace;
    p.eyes = canReact && !!s.eyes;
  }

  isFrozen() { const ph = this.gs?.phase; return ph === 'intro' || ph === 'penalty' || ph === 'roundOver' || ph === 'matchOver'; }
  isPenaltyVictim(i) { return this.gs?.phase === 'penalty' && this.gs.penalty?.victim === i; }

  requestThrow(i, dir, power, extra = {}) {
    const gs = this.gs, d = this.d;
    if (d.state !== 'held' || d.holder !== i) return false;
    const pen = gs.phase === 'penalty';
    if (pen) { if (!gs.penalty || gs.penalty.shooter !== i || gs.penalty.shot) return false; }
    else if (gs.phase !== 'live') return false;
    const p = this.players[i];
    if (extra.x !== undefined && !this.isFrozen()) { p.x = extra.x; p.z = extra.z; }
    if (extra.yaw !== undefined) { p.yaw = extra.yaw; p.pitch = extra.pitch; }
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const dx = dir.x / len, dy = dir.y / len, dz = dir.z / len;
    power = clamp(power, 0, 1);
    const speed = PHYS.throwMin + (PHYS.throwMax - PHYS.throwMin) * power;
    const o = throwOrigin(p, { x: dx, y: dy, z: dz });
    let vx = dx * speed + p.vx * 0.3, vy = dy * speed, vz = dz * speed + p.vz * 0.3;
    let ox = o.x, oy = o.y, oz = o.z;
    const lag = clamp(extra.lag || 0, 0, 0.12);
    if (lag > 0) { ox += vx * lag; oy += vy * lag - 4.905 * lag * lag; oz += vz * lag; vy -= 9.81 * lag; }
    const b = this.db;
    b.position.set(ox, oy, oz);
    b.velocity.set(vx, vy, vz);
    b.angularVelocity.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5);
    b.quaternion.setFromEuler(0, p.yaw + Math.PI, 0);
    b.collisionFilterMask = ALL_FOR_DUMPLING & ~this.phys.players[i].group;
    d.maskT = this.time + 0.22;
    if (!d.inWorld) { this.world.addBody(b); d.inWorld = true; }
    b.wakeUp();
    const r = 1 - i, rp = this.players[r];
    d.flight = { id: ++d.flightId, thrower: i, receiver: r, rx: rp.x, rz: rp.z, rcrouch: rp.crouch, catchable: false, landed: false, landT: 0, penalty: pen, scored: false, start: this.time };
    Object.assign(d, { state: 'flying', holder: -1, owner: -1, ownerLocked: false, restT: 0, stuckT: 0 });
    if (pen) gs.penalty.shot = true;
    p.charging = false;
    this.emit({ e: 'throw', who: i, pw: r3(power), id: d.flight.id });
    return true;
  }

  requestCatch(i) {
    const p = this.players[i];
    if (this.time < p.catchCd) return;
    p.catchUntil = this.time + RULES.catchWindow;
    p.catchCd = this.time + RULES.catchWindow + RULES.catchCooldown;
  }

  // Receiver-side catch decision from a remote player (they saw it land in their hands).
  claimCatch(i, id) {
    const d = this.d, f = d.flight, gs = this.gs;
    if (!f || f.id !== id || gs.phase !== 'live') return;
    if (d.state === 'held' || d.state === 'gone') return;
    const grace = 0.3 + Math.min(0.25, this.players[i].latency || 0);
    if (d.state === 'loose' && this.time - f.landT > grace) return;
    const pos = this.db.position;
    if (catchDistance(this.players[i], pos) > 2.2) return; // sanity check
    this.grantCatch(i, true);
  }

  requestPickup(i) {
    const d = this.d, gs = this.gs;
    if (d.state !== 'loose' || gs.phase !== 'live' || this.pendingPenalty) return false;
    const pos = this.db.position;
    const owner = d.ownerLocked ? d.owner : this.closer(pos);
    if (owner !== i) { this.emit({ e: 'deny', who: i }); return false; }
    const p = this.players[i];
    if (Math.hypot(pos.x - p.x, pos.z - p.z) > RULES.pickupReach || pos.y > RULES.pickupMaxY) return false;
    this.hold(i);
    this.emit({ e: 'pickup', who: i });
    return true;
  }

  // ---------- simulation ----------
  step(dt) {
    dt = Math.min(dt, 0.1);
    this.acc += dt;
    let n = 0;
    while (this.acc >= PHYS.step && n < 14) { this.fixedStep(PHYS.step); this.acc -= PHYS.step; n++; }
    if (n >= 14) this.acc = 0;
    this.updateRules(dt);
  }

  fixedStep(h) {
    this.time += h;
    for (const p of this.players) {
      const pb = this.phys.players[p.i];
      this.kin(pb.body, p.x, p.crouch ? 0.32 : 0.73, p.z, h);
      this.kin(pb.head, p.x, headY(p), p.z, h);
    }
    if (this.d.maskT && this.time > this.d.maskT) { this.db.collisionFilterMask = ALL_FOR_DUMPLING; this.d.maskT = 0; }
    this.world.step(h);
    if (this.contacts.length) {
      const list = this.contacts; this.contacts = [];
      for (const c of list) this.handleContact(c);
    }
    this.afterStep(h);
  }

  kin(body, x, y, z, h) {
    const dx = x - body.position.x, dy = y - body.position.y, dz = z - body.position.z;
    if (dx * dx + dy * dy + dz * dz > 1) { body.position.set(x, y, z); body.velocity.set(0, 0, 0); return; }
    body.velocity.set(dx / h, dy / h, dz / h);
  }

  onCollide(e) {
    const c = e.contact;
    const v = Math.abs(c.getImpactVelocityAlongNormal());
    let nx = c.ni.x, ny = c.ni.y, nz = c.ni.z;
    if (c.bi === this.db) { nx = -nx; ny = -ny; nz = -nz; }
    const p = this.db.position;
    this.contacts.push({ other: e.body, v, n: [nx, ny, nz], pos: [p.x, p.y, p.z] });
  }

  onPropCollide(pr, e) {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v < 0.45 || this.time - pr.sndT < 0.07) return;
    if ((e.body.userData || {}).kind === 'dumpling') return;
    pr.sndT = this.time;
    const bp = pr.body.position, ud = pr.body.userData;
    this.emit({ e: 'snd', k: ud.sound, p: [r3(bp.x), r3(bp.y), r3(bp.z)], v: r3(Math.min(1, v / 5)), f: ud.freq });
  }

  handleContact({ other, v, n, pos }) {
    const ud = other.userData || {};
    const d = this.d, f = d.flight, gs = this.gs;
    const p = pos.map(r3);
    if (v > 0.6) this.emit({ e: 'sq', n: n.map(r3), s: r3(Math.min(1, v / 10)) });
    if (v > 0.3) this.emit({ e: 'snd', k: 'squish', p, v: r3(Math.min(1, v / 9)) });
    if (gs.mode === 'classic' && v > 0.5) {
      if (ud.kind === 'prop' || NOISY_STATIC.has(ud.kind)) {
        this.emit({ e: 'snd', k: ud.sound, p, v: r3(Math.min(1, v / 7)), f: ud.freq });
        if (ud.id) this.emit({ e: 'wob', id: ud.id, v: r3(Math.min(1, v / 7)) });
      }
      if (ud.kind === 'prop') {
        const pr = this.props[ud.prop];
        if (pr && !pr.knocked) { pr.knocked = true; gs.knocked++; }
      }
    }
    if (ud.kind === 'head') { this.onHead(ud.player, v, p); return; }
    if (ud.kind === 'body') { if (v > 1) this.emit({ e: 'body', who: ud.player, v: r3(Math.min(1, v / 10)) }); return; }
    if (d.state === 'flying' && f && !f.landed) this.onLanding();
  }

  onHead(victim, v, p) {
    const d = this.d, f = d.flight, gs = this.gs;
    if (v < 0.8 || this.time - d.lastHeadT[victim] < 0.5) return;
    d.lastHeadT[victim] = this.time;
    const by = f ? f.thrower : -1;
    const direct = d.state === 'flying' && f && !f.landed && by !== victim;
    if (direct) gs.heads[by]++;
    this.emit({ e: 'head', victim, by, direct, pen: !!(f && f.penalty), v: r3(Math.min(1, v / 10)), p });
    if (direct && f.penalty && !f.scored && gs.penalty && victim === gs.penalty.victim) {
      f.scored = true;
      this.finishPenalty('headshot');
    }
  }

  onLanding() {
    const d = this.d, f = d.flight, gs = this.gs;
    d.state = 'loose';
    if (!f) return;
    f.landed = true; f.landT = this.time;
    if (f.penalty) { if (!f.scored) this.finishPenalty('miss'); return; }
    gs.streak = 0;
    if (gs.mode === 'penalty' && gs.phase === 'live' && f.catchable) {
      const rp = this.players[f.receiver];
      this.pendingPenalty = { at: this.time + 0.28 + (rp.remote ? Math.min(0.25, rp.latency) : 0), shooter: f.thrower, victim: f.receiver, id: f.id };
    } else {
      this.emit({ e: f.catchable ? 'drop' : 'miss', who: f.catchable ? f.receiver : f.thrower, thrower: f.thrower });
    }
  }

  afterStep(h) {
    const d = this.d;
    if (d.state !== 'flying' && d.state !== 'loose') return;
    const b = this.db, pos = b.position, f = d.flight;
    if (d.state === 'flying' && f && !f.penalty && pos.y > 0.2 && pos.y < 2.4) {
      const rp = this.players[f.receiver];
      const top = (f.rcrouch ? CROUCH_EYE : EYE) + 0.2;
      if (bodyDistance(rp, pos) < RULES.reach || distToColumn(pos.x, pos.y, pos.z, f.rx, f.rz, 0.25, top) < RULES.reach) f.catchable = true;
    }
    const speed = b.velocity.length();
    const airborne = d.state === 'flying' || (pos.y > 0.3 && speed > 0.9);
    if (airborne && this.gs.phase === 'live' && !this.pendingPenalty) {
      for (const p of this.players) {
        if (p.remote) continue;
        if (this.time < p.catchUntil && catchDistance(p, pos) < RULES.catchRadius) { this.grantCatch(p.i, false); return; }
      }
    }
    if (d.state === 'flying' && f && this.time - f.start > 4) this.onLanding();
    if (d.state === 'loose') this.updateLoose(h, pos, speed);
    if (pos.y < -0.5 || Math.abs(pos.x) > 4.3 || Math.abs(pos.z) > 2.3 || pos.y > 3.4) {
      const to = this.closer(pos);
      this.returnTo(to);
      this.emit({ e: 'stuck', who: to });
    }
  }

  updateLoose(h, pos, speed) {
    const d = this.d;
    // A squishy doesn't keep rolling like a ball: settle it upright, face kept toward its current yaw.
    if (speed < 1.2 && pos.y < 2.2) {
      const b = this.db, q = b.quaternion;
      const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
      const t = Math.min(1, h * 6);
      const ux = 0, uy = Math.sin(yaw / 2), uz = 0, uw = Math.cos(yaw / 2);
      let dot = q.x * ux + q.y * uy + q.z * uz + q.w * uw;
      const sgn = dot < 0 ? -1 : 1;
      q.set(q.x + (ux * sgn - q.x) * t, q.y + (uy * sgn - q.y) * t, q.z + (uz * sgn - q.z) * t, q.w + (uw * sgn - q.w) * t);
      q.normalize();
      b.angularVelocity.scale(1 - t, b.angularVelocity);
    }
    if (speed < 0.25) d.restT += h; else { d.restT = 0; if (speed > 1.2) d.ownerLocked = false; }
    if (!d.ownerLocked) { d.owner = this.closer(pos); if (d.restT > 0.35) d.ownerLocked = true; }
    if (d.ownerLocked && this.gs.phase === 'live' && !this.pendingPenalty) {
      if (!this.reachable(d.owner, pos)) {
        d.stuckT += h;
        if (d.stuckT > 1.6) { const o = d.owner; this.returnTo(o); this.emit({ e: 'stuck', who: o }); }
      } else d.stuckT = 0;
    }
  }

  reachable(i, pos) {
    const z = ZONES[i];
    const cx = clamp(pos.x, z.x0, z.x1), cz = clamp(pos.z, z.z0, z.z1);
    return Math.hypot(pos.x - cx, pos.z - cz) < 0.85 && pos.y < RULES.pickupMaxY;
  }

  closer(pos) {
    const a = this.players[0], b = this.players[1];
    return Math.hypot(pos.x - a.x, pos.z - a.z) <= Math.hypot(pos.x - b.x, pos.z - b.z) ? 0 : 1;
  }

  hold(i) {
    const d = this.d;
    if (d.inWorld) { this.world.removeBody(this.db); d.inWorld = false; }
    Object.assign(d, { state: 'held', holder: i, owner: -1, ownerLocked: false, restT: 0, stuckT: 0, flight: null });
  }

  returnTo(i) { this.hold(i); }

  grantCatch(i, claimed) {
    const d = this.d, f = d.flight, gs = this.gs;
    const fromOther = f && f.thrower !== i && (!f.landed || claimed);
    this.hold(i);
    this.pendingPenalty = null;
    if (fromOther) { gs.streak++; gs.best = Math.max(gs.best, gs.streak); gs.catches++; }
    this.emit({ e: 'catch', who: i, streak: gs.streak });
  }

  startPenalty(shooter, victim) {
    const gs = this.gs;
    gs.phase = 'penalty';
    gs.penalty = { shooter, victim, clock: RULES.shotClock, shot: false, result: null };
    this.pendingPenalty = null;
    this.hold(shooter);
    for (const p of this.players) { p.catchUntil = 0; }
    this.emit({ e: 'penalty', shooter, victim });
  }

  finishPenalty(result) {
    const gs = this.gs;
    if (!gs.penalty || gs.penalty.result) return;
    gs.penalty.result = result;
    if (result === 'headshot') gs.scores[gs.penalty.shooter]++;
    this.emit({ e: 'penres', result, shooter: gs.penalty.shooter, victim: gs.penalty.victim });
    this.penaltyEndAt = this.time + 2.0;
  }

  boom() {
    const gs = this.gs, d = this.d;
    gs.timeLeft = 0;
    let loser = -1, pos;
    if (d.state === 'held') {
      loser = d.holder;
      const p = this.players[loser];
      pos = { x: p.x, y: 1.2, z: p.z };
    } else {
      const b = this.db.position;
      pos = { x: b.x, y: b.y, z: b.z };
      if (Math.abs(pos.x) > RULES.middleBand) loser = this.closer(pos);
    }
    if (d.inWorld) { this.world.removeBody(this.db); d.inWorld = false; }
    Object.assign(d, { state: 'gone', holder: -1, flight: null, owner: -1 });
    if (loser >= 0) gs.wins[1 - loser]++; else gs.draws++;
    gs.last = { loser };
    gs.phase = 'roundOver';
    gs.phaseT = 4.2;
    this.emit({ e: 'boom', loser, p: [r3(pos.x), r3(pos.y), r3(pos.z)] });
  }

  nextRound() {
    const gs = this.gs;
    gs.round++;
    gs.phase = 'intro';
    gs.phaseT = RULES.introTime;
    gs.timeLeft = RULES.hotPotatoTime;
    gs.last = null;
    const starter = Math.random() < 0.5 ? 0 : 1;
    this.hold(starter);
    this.emit({ e: 'round', round: gs.round, starter });
  }

  matchOver(w) {
    const gs = this.gs;
    gs.phase = 'matchOver';
    gs.winner = w;
    this.emit({ e: 'match', winner: w });
  }

  updateRules(dt) {
    const gs = this.gs;
    if (!gs) return;
    if (gs.phase === 'intro') {
      gs.phaseT -= dt;
      if (gs.phaseT <= 0) { gs.phase = 'live'; gs.phaseT = 0; this.emit({ e: 'go' }); }
    } else if (gs.phase === 'live') {
      if (gs.mode === 'hotpotato') {
        gs.timeLeft -= dt;
        if (gs.timeLeft <= 0) this.boom();
      }
      if (this.pendingPenalty && this.time >= this.pendingPenalty.at) {
        const pp = this.pendingPenalty;
        this.emit({ e: 'drop', who: pp.victim, thrower: pp.shooter, pen: true });
        this.startPenalty(pp.shooter, pp.victim);
      }
    } else if (gs.phase === 'penalty') {
      const pen = gs.penalty;
      if (!pen.shot && !pen.result) {
        pen.clock -= dt;
        if (pen.clock <= 0) this.finishPenalty('timeout');
      }
      if (pen.shot && !pen.result && (!this.d.flight || this.time - this.d.flight.start > 3)) this.finishPenalty('miss');
      if (pen.result && this.time >= this.penaltyEndAt) {
        if (gs.scores[pen.shooter] >= gs.target) this.matchOver(pen.shooter);
        else {
          gs.phase = 'live';
          gs.penalty = null;
          this.hold(pen.victim);
          this.emit({ e: 'resume', holder: pen.victim });
        }
      }
    } else if (gs.phase === 'roundOver') {
      gs.phaseT -= dt;
      if (gs.phaseT <= 0) {
        const w = gs.wins.findIndex((x) => x >= RULES.hotPotatoWins);
        if (w >= 0) this.matchOver(w); else this.nextRound();
      }
    }
  }

  // ---------- state out ----------
  dumplingView(out = {}) {
    const d = this.d, b = this.db;
    out.state = d.state; out.holder = d.holder; out.id = d.flight ? d.flight.id : 0;
    out.th = d.flight ? d.flight.thrower : -1; out.landed = d.flight ? d.flight.landed : false;
    out.owner = d.ownerLocked ? d.owner : (d.state === 'loose' ? this.closer(b.position) : -1);
    out.ownerLocked = d.ownerLocked;
    out.pos = out.pos || { x: 0, y: 0, z: 0 }; out.quat = out.quat || { x: 0, y: 0, z: 0, w: 1 }; out.vel = out.vel || { x: 0, y: 0, z: 0 };
    out.pos.x = b.position.x; out.pos.y = b.position.y; out.pos.z = b.position.z;
    out.quat.x = b.quaternion.x; out.quat.y = b.quaternion.y; out.quat.z = b.quaternion.z; out.quat.w = b.quaternion.w;
    out.vel.x = b.velocity.x; out.vel.y = b.velocity.y; out.vel.z = b.velocity.z;
    return out;
  }

  snapshot(events) {
    const d = this.d, b = this.db;
    const dv = this.dumplingView();
    const ds = { s: DSTATE[d.state], h: d.holder, id: dv.id, th: dv.th, l: dv.landed ? 1 : 0, o: dv.owner, ol: dv.ownerLocked ? 1 : 0 };
    if (d.state === 'flying' || d.state === 'loose') {
      ds.k = [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w, b.velocity.x, b.velocity.y, b.velocity.z].map(r3);
    }
    const p = this.players.map((pl) => [r3(pl.x), r3(pl.z), r3(pl.yaw), r3(pl.pitch), playerFlags(pl), r3(pl.power)]);
    const o = [];
    for (const pr of this.props) {
      if (!pr || pr.fixed) continue;
      const bp = pr.body.position, q = pr.body.quaternion;
      const cur = [bp.x, bp.y, bp.z, q.x, q.y, q.z, q.w].map(r3);
      if (!pr.last || cur.some((v, k) => Math.abs(v - pr.last[k]) > 0.001)) { o.push([pr.spec.id, ...cur]); pr.last = cur; }
    }
    return { t: 'snap', ts: r3(this.time), p, d: ds, o, gs: this.gs, ev: events };
  }
}
