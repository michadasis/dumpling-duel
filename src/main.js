import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildRoom } from './room.js';
import { Sim, DSTATE_NAMES, applyFlags, playerFlags } from './sim.js';
import { Bot } from './bot.js';
import { Avatar, LOOKS } from './avatar.js';
import { FPRig } from './fprig.js';
import { DumplingView } from './dumpling.js';
import { buildPropMesh } from './props.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { Particles, ScreenFX } from './fx.js';
import { PeerLink, TabLink, describeNetError } from './net.js';
import { resolveMove } from './movement.js';
import { radialShadow, ringTex } from './textures.js';
import { SPAWN, ZONES, RULES, PHYS, NET, PLAYER_COLORS, MODES, EYE, CROUCH_EYE } from './config.js';
import { clamp, damp, lerp, forward, throwOrigin, catchDistance, randomCode, safeStorage, r3 } from './util.js';

const PREVIEW = !!window.DD_PREVIEW;
const params = new URLSearchParams(location.search);
const USE_TABS = params.get('net') === 'tabs';
const NO_RENDER = params.get('norender') === '1'; // headless tests only
const store = safeStorage();
const settings = Object.assign({ name: '', sens: 1, vol: 0.8, gfx: 'high', arc: true, char: 'm' }, store.get('dd-settings', {}));
const CHAR = { m: LOOKS[0], f: LOOKS[1] };
const otherChar = (c) => (c === 'f' ? 'm' : 'f');
if (!settings.name) settings.name = 'Player ' + (10 + Math.floor(Math.random() * 89));
const saveSettings = () => store.set('dd-settings', settings);
const $ = (id) => document.getElementById(id);
const nowS = () => performance.now() / 1000;
const isLow = () => settings.gfx === 'low';

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.type = THREE.PCFShadowMap;
function applyGfx() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, isLow() ? 1 : 1.75));
  renderer.shadowMap.enabled = !isLow();
  scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true)); });
}
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9e4da');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.03, 60);
scene.add(camera);

scene.add(new THREE.HemisphereLight('#ffffff', '#e2d6c2', 1.0));
const sun = new THREE.DirectionalLight('#fff1dc', 1.7);
sun.position.set(6, 7.5, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -5.5, right: 5.5, top: 5.5, bottom: -5.5, near: 1, far: 22 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight('#e8f0ff', 0.55); fill.position.set(-4, 3, -2); scene.add(fill);
const lampLight = new THREE.PointLight('#ffd58a', 3.2, 6, 2); lampLight.position.set(-1.2, 2.55, 0.55); scene.add(lampLight);

const room = buildRoom();
scene.add(room.root);

const cubeRT = new THREE.WebGLCubeRenderTarget(256);
const cubeCam = new THREE.CubeCamera(0.05, 20, cubeRT);
cubeCam.position.set(3.5, 1.15, -1.1);
scene.add(cubeCam);
function refreshMirror() {
  room.mirrorGroup.visible = false;
  const vis = avatars.map((a) => a.root.visible);
  avatars.forEach((a) => (a.root.visible = false));
  cubeCam.update(renderer, scene);
  avatars.forEach((a, i) => (a.root.visible = vis[i]));
  room.mirrorGroup.visible = true;
  room.M.mirror.envMap = cubeRT.texture; room.M.mirror.needsUpdate = true;
}

const dv = new DumplingView();
scene.add(dv.root);
const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: radialShadow(), transparent: true, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; blob.renderOrder = 3; scene.add(blob);
const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: ringTex(), transparent: true, depthWrite: false, color: '#ffffff' }));
ring.rotation.x = -Math.PI / 2; ring.renderOrder = 4; ring.visible = false; scene.add(ring);
const ARC_DOTS = 22;
const arcDots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: '#f2b632', transparent: true, opacity: 0.85 }), ARC_DOTS);
arcDots.frustumCulled = false; arcDots.visible = false; scene.add(arcDots);

// Each player picks Male or Female; the slot (P1 kitchen side / P2 balcony side) only sets the name-tag colour.
const avatars = [null, null];
const charOf = ['m', 'f'];
function setAvatar(i, ch, name) {
  const vis = avatars[i] ? avatars[i].root.visible : false;
  if (avatars[i]) scene.remove(avatars[i].root);
  charOf[i] = ch === 'f' ? 'f' : 'm';
  avatars[i] = new Avatar(CHAR[charOf[i]], PLAYER_COLORS[i], name || (i ? 'P2' : 'P1'));
  avatars[i].root.visible = vis;
  scene.add(avatars[i].root);
}
setAvatar(0, settings.char, settings.name || 'P1');
setAvatar(1, otherChar(settings.char), 'Bao Bot');
const fp = new FPRig(CHAR[settings.char].top.color);
camera.add(fp.root); fp.root.visible = false;
const particles = new Particles(scene);
const sfx = new ScreenFX();
const audio = new Sound();
audio.volume = settings.vol;
const input = new Input(canvas);
input.bindTouch($('touch'));

// ---------- game state ----------
const mkP = (i) => ({ x: SPAWN[i].x, z: SPAWN[i].z, yaw: SPAWN[i].yaw, pitch: 0, crouch: false, handsOut: false, brace: false, eyes: false, charging: false, power: 0 });
const G = {
  phase: 'menu', role: null, me: 0, sim: null, bot: null, link: null,
  mode: 'classic', target: RULES.penaltyTarget, diff: 'normal',
  view: { players: [mkP(0), mkP(1)], d: { state: 'held', holder: 0, id: 0, th: -1, landed: false, owner: -1, ownerLocked: false, pos: { x: 0, y: 0, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 }, vel: { x: 0, y: 0, z: 0 } }, gs: null },
  paused: false, propMeshes: [], wobbles: [], outEv: [], snapAcc: 0, inAcc: 0, pingT: 0,
  names: ['', ''], oppSm: mkP(1), ow: 0.04, rtt: 0, clockOff: null, snaps: [], latest: null, pred: null, optimistic: null,
  disp: new THREE.Vector3(), dispQ: new THREE.Quaternion(), lastState: null, claimedId: 0, guestName: '', hostName: '',
  throwsDone: 0, lastCount: -1, overTimer: 0, heatTick: 0, steamT: 0, lastPenaltyClock: -1,
};
const L = { x: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, crouch: false, handsOutUntil: 0, catchCd: 0, brace: false, eyes: false, charging: false, chargeStart: 0, power: 0, moving: false, stepT: 0, shake: 0, kick: 0, eyeY: EYE, bob: 0 };

function resetLocal() {
  const s = SPAWN[G.me];
  Object.assign(L, { x: s.x, z: s.z, yaw: s.yaw, pitch: 0, vx: 0, vz: 0, crouch: false, charging: false, power: 0, brace: false, eyes: false, handsOutUntil: 0 });
  Object.assign(G.oppSm, mkP(1 - G.me));
}

function ensureSim() {
  if (!G.sim) G.sim = new Sim({ colliders: room.colliders });
  return G.sim;
}

const localPlayer = () => ({ x: L.x, z: L.z, vx: L.vx, vz: L.vz, yaw: L.yaw, pitch: L.pitch, crouch: L.crouch, handsOut: nowS() < L.handsOutUntil, brace: L.brace, eyes: L.eyes, charging: L.charging, power: L.power });
const gsNow = () => G.view.gs;
const iHold = () => G.view.d.state === 'held' && G.view.d.holder === G.me;
const oppName = () => G.names[1 - G.me] || 'Opponent';
function canThrowNow() {
  const gs = gsNow();
  if (!gs) return false;
  if (gs.phase === 'live') return true;
  return gs.phase === 'penalty' && gs.penalty && gs.penalty.shooter === G.me && !gs.penalty.shot && !gs.penalty.result;
}
function pickupOwner() { const d = G.view.d; return d.owner; }
function nearDumpling(extra = 0) { const d = G.view.d; return Math.hypot(d.pos.x - L.x, d.pos.z - L.z) <= RULES.pickupReach + extra && d.pos.y < RULES.pickupMaxY; }

// ---------- actions ----------
function doCatch() {
  if (G.phase !== 'game' || G.paused) return;
  const t = nowS();
  if (t < L.catchCd) return;
  const gs = gsNow();
  if (gs && gs.phase === 'penalty') return;
  L.handsOutUntil = t + RULES.catchWindow;
  L.catchCd = t + RULES.catchWindow + RULES.catchCooldown;
  if (G.role !== 'guest') G.sim.requestCatch(G.me);
}
function doPickup() {
  if (G.phase !== 'game' || G.paused) return;
  if (G.view.d.state !== 'loose') return;
  if (G.role === 'guest') G.link.send({ t: 'pick' });
  else G.sim.requestPickup(G.me);
}
function doThrow() {
  if (!iHold() || !canThrowNow()) return;
  const dir = forward(L.yaw, L.pitch);
  const power = Math.max(0.04, L.power);
  L.power = 0;
  G.throwsDone++;
  if (G.role === 'guest') {
    G.link.send({ t: 'throw', d: [r3(dir.x), r3(dir.y), r3(dir.z)], pw: r3(power), x: r3(L.x), z: r3(L.z), vx: r3(L.vx), vz: r3(L.vz), yaw: r3(L.yaw), pitch: r3(L.pitch), lag: r3(Math.min(0.12, G.ow)) });
    const o = throwOrigin(L, dir), sp = PHYS.throwMin + (PHYS.throwMax - PHYS.throwMin) * power;
    G.pred = { t0: performance.now(), o, v: { x: dir.x * sp + L.vx * 0.3, y: dir.y * sp, z: dir.z * sp + L.vz * 0.3 }, prevId: G.view.d.id || 0 };
    G.disp.set(o.x, o.y, o.z);
    fp.throwAnim();
    audio.play('whoosh', { v: power });
  } else if (G.sim.requestThrow(G.me, dir, power, { x: L.x, z: L.z, vx: L.vx, vz: L.vz, yaw: L.yaw, pitch: L.pitch })) {
    fp.throwAnim();
  }
}
input.on('primary', () => {
  audio.init();
  if (G.phase !== 'game' || G.paused) return;
  if (iHold()) { if (canThrowNow()) { L.charging = true; L.chargeStart = performance.now(); L.power = 0; } return; }
  const d = G.view.d;
  if (d.state === 'loose' && pickupOwner() === G.me && nearDumpling()) { doPickup(); return; }
  doCatch();
});
input.on('throwEnd', () => { if (L.charging) { L.charging = false; doThrow(); } });
input.on('catch', () => { audio.init(); doCatch(); });
input.on('pickup', doPickup);
input.on('help', () => { const k = $('h-keys'); k.hidden = !k.hidden; });
input.on('mute', () => { settings.vol = settings.vol > 0 ? 0 : 0.8; audio.setVolume(settings.vol); saveSettings(); toast(settings.vol ? 'Sound on' : 'Sound off'); });
input.on('pause', () => { if (G.phase === 'game') openPause(); });
input.on('unlocked', () => { if (G.phase === 'game' && !G.paused && $('menu').hidden) openPause(); });
input.on('lockchange', (locked) => { $('clickplay').hidden = locked || G.phase !== 'game' || G.paused || input.isTouch || input.cursorAim; });
input.on('cursorAim', () => { $('clickplay').hidden = true; toast('Aim follows your cursor here'); });
input.on('lockfail', () => { if (G.phase === 'game' && $('menu').hidden) $('clickplay').hidden = false; });
input.on('touchDetected', () => { if (G.phase === 'game') showTouch(true); });
$('clickplay').addEventListener('click', () => { audio.init(); input.requestLock(); });

// ---------- HUD helpers ----------
let bannerTimer = 0, toastTimer = 0;
function banner(title, sub = '', color = '') {
  const b = $('h-banner');
  b.querySelector('.b-title').textContent = title;
  b.querySelector('.b-sub').textContent = sub;
  b.className = 'banner ' + color;
  void b.offsetWidth; b.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), 1800);
}
function toast(msg) {
  const t = $('h-toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1700);
}
const isMe = (i) => i === G.me;
const colorOf = (i) => (i === 0 ? 'red' : 'blue');
const hint = (desk, touch) => (input.isTouch ? touch : desk);

function showTouch(on) {
  $('touch').hidden = !on;
  $('h-keys').hidden = on;
  $('crosshair').style.display = '';
}

// ---------- props ----------
function setupProps(specs) {
  for (const pm of G.propMeshes) if (pm) scene.remove(pm.obj);
  G.propMeshes = [];
  for (const s of specs || []) {
    const obj = buildPropMesh(s);
    scene.add(obj);
    G.propMeshes[s.id] = { obj, id: s.id, tp: obj.position.clone(), tq: obj.quaternion.clone(), fixed: !!s.fixed || s.type === 'guitar' || s.type === 'chime', base: obj.rotation.clone() };
  }
}
function wobbleProp(id, v) {
  const n = parseInt(String(id).slice(4), 10);
  const pm = G.propMeshes[n];
  if (!pm || !pm.fixed) return;
  G.wobbles.push({ pm, a: Math.min(1, 0.4 + v), t: 0 });
}

// ---------- events from the simulation ----------
function handleEvent(ev) {
  const me = G.me;
  switch (ev.e) {
    case 'start': {
      G.mode = ev.mode; G.target = ev.target || G.target;
      setupProps(ev.specs);
      room.hotTape.visible = ev.mode === 'hotpotato';
      resetLocal();
      G.throwsDone = 0;
      if (G.phase !== 'game') enterGame();
      closeMenus();
      sfx.clear();
      banner(MODES[ev.mode].name, ev.starter === me ? 'You start with the dumpling' : `${oppName()} starts with it`, 'gold');
      G.lastCount = -1;
      break;
    }
    case 'go': audio.play('go'); break;
    case 'round': banner(`Round ${ev.round}`, ev.starter === me ? 'You start with the potato' : `${oppName()} starts with it`, 'gold'); resetLocalKeepPos(); break;
    case 'throw':
      if (ev.who !== me) { avatars[ev.who].throwAnim(); audio.play('whoosh', { p: [G.oppSm.x, 1.5, G.oppSm.z], v: ev.pw }); }
      else if (G.role !== 'guest') audio.play('whoosh', { v: ev.pw });
      break;
    case 'catch':
      audio.play('catch', { p: ev.who === me ? null : [G.oppSm.x, 1.3, G.oppSm.z] });
      if (ev.who === me) { G.optimistic = null; if (ev.streak > 1) toast(`Nice catch! Streak ${ev.streak}`); }
      break;
    case 'pickup': audio.play('pickup', { p: ev.who === me ? null : [G.oppSm.x, 0.8, G.oppSm.z] }); break;
    case 'deny': if (ev.who === me) { audio.play('deny'); toast(`That one is closer to ${oppName()}`); } break;
    case 'snd': audio.play(ev.k, { p: ev.p, v: ev.v, f: ev.f }); break;
    case 'sq': dv.impact(ev.n, ev.s); if (ev.s > 0.35) particles.burst('puff', [G.view.d.pos.x, G.view.d.pos.y, G.view.d.pos.z]); break;
    case 'wob': if (String(ev.id).startsWith('prop')) wobbleProp(ev.id, ev.v); else room.wobble(ev.id, ev.v); break;
    case 'head': {
      audio.play('bonk', { p: ev.p });
      if (ev.victim === me) {
        sfx.splat(); L.kick = 1; L.shake = Math.max(L.shake, 0.6);
      } else avatars[ev.victim].bonk(ev.v);
      if (ev.direct && !ev.pen && G.mode !== 'penalty') banner(ev.victim === me ? 'Bonk!' : 'Headshot!', ev.victim === me ? 'Right in the face' : `You got ${oppName()}`, colorOf(ev.by));
      break;
    }
    case 'drop':
      if (ev.pen) { audio.play('whistle'); banner(ev.who === me ? 'You dropped it!' : `${oppName()} dropped it!`, 'Free shot coming up', 'red'); }
      else toast(ev.who === me ? 'Dropped it' : `${oppName()} dropped it`);
      break;
    case 'miss': toast(ev.who === me ? 'Wild throw' : `${oppName()} threw it wide`); break;
    case 'penalty':
      banner('Free shot', ev.shooter === me ? 'Aim for the head' : 'Brace yourself or close your eyes', ev.shooter === me ? 'gold' : 'red');
      L.charging = false;
      break;
    case 'penres':
      if (ev.result === 'headshot') { audio.play('ding'); banner('Headshot!', ev.shooter === me ? '+1 for you' : `+1 for ${oppName()}`, colorOf(ev.shooter)); }
      else if (ev.result === 'timeout') banner('Too slow', 'The shot clock ran out');
      else banner('Missed!', ev.victim === me ? 'Phew' : 'So close');
      break;
    case 'resume': toast(ev.holder === me ? 'Your dumpling. Play on' : 'Play on'); break;
    case 'boom': {
      audio.play('explosion', { p: ev.p, v: 1 });
      particles.burst('boom', ev.p);
      sfx.flash();
      const d = Math.hypot(ev.p[0] - L.x, ev.p[2] - L.z);
      L.shake = Math.max(L.shake, 1.2 / (1 + d * 0.5));
      if (ev.loser >= 0) avatars[ev.loser].sootify();
      if (ev.loser === me) { sfx.splat(); }
      if (ev.loser === -1) { audio.play('draw'); banner('Draw!', 'It popped in the middle', 'gold'); }
      else if (ev.loser === me) { audio.play('lose'); banner('Cooked!', 'It blew up on your side', 'red'); }
      else { audio.play('win'); banner('Got them!', `It blew up on ${oppName()}`, colorOf(me)); }
      break;
    }
    case 'stuck': toast(ev.who === me ? 'It got stuck, so it came back to you' : `It got stuck, so it went back to ${oppName()}`); break;
    case 'match': G.overTimer = 1.4; G.overWinner = ev.winner; audio.play(ev.winner === me ? 'win' : 'lose'); break;
    default: break;
  }
}
function resetLocalKeepPos() { L.charging = false; L.power = 0; }

// ---------- network: host side ----------
function hostOnMessage(m) {
  const sim = G.sim;
  if (m.t === 'hello') {
    G.guestName = (m.name || 'Guest').slice(0, 14);
    G.names[1] = G.guestName; sim.players[1].name = G.guestName; sim.players[1].remote = true;
    setAvatar(1, m.char, G.guestName);
    G.link.send({ t: 'welcome', name: G.names[0], char: settings.char });
    setLobbyStatus(`${G.guestName} joined. Pick a mode and start.`, 'ok');
    $('b-start').disabled = false;
    audio.play('ui');
  } else if (m.t === 'in') {
    const [x, z, yaw, pitch, flags, power] = m.s;
    const st = { x, z, yaw, pitch, power };
    applyFlags(st, flags);
    sim.setPlayerState(1, st);
    sim.players[1].latency = clamp(m.lat || 0, 0, 0.3);
  } else if (m.t === 'throw') {
    sim.requestThrow(1, { x: m.d[0], y: m.d[1], z: m.d[2] }, m.pw, { x: m.x, z: m.z, vx: m.vx, vz: m.vz, yaw: m.yaw, pitch: m.pitch, lag: m.lag });
  } else if (m.t === 'claim') sim.claimCatch(1, m.id);
  else if (m.t === 'pick') sim.requestPickup(1);
  else if (m.t === 'ping') G.link.send({ t: 'pong', c: m.c });
  else if (m.t === 'bye') G.link.onClose && G.link.onClose();
}

// ---------- network: guest side ----------
function guestOnMessage(m) {
  if (m.t === 'snap') onSnap(m);
  else if (m.t === 'welcome') { G.hostName = (m.name || 'Host').slice(0, 14); G.names[0] = G.hostName; setAvatar(0, m.char, G.hostName); $('wait-text').textContent = `Connected to ${G.hostName}. Waiting for them to start...`; }
  else if (m.t === 'pong') { const rtt = (performance.now() - m.c) / 1000; G.rtt = G.rtt ? G.rtt * 0.7 + rtt * 0.3 : rtt; G.ow = G.rtt / 2; }
  else if (m.t === 'full') { leaveGame('That room already has two players.'); }
  else if (m.t === 'bye') { G.link.onClose && G.link.onClose(); }
}

function onSnap(s) {
  const now = performance.now() / 1000;
  const off = s.ts - now;
  G.clockOff = G.clockOff === null ? off : Math.max(off, G.clockOff - 0.0015);
  G.snaps.push({ ts: s.ts, p: s.p });
  if (G.snaps.length > 40) G.snaps.shift();
  G.latest = s;
  G.view.gs = s.gs;
  for (const o of s.o || []) {
    const pm = G.propMeshes[o[0]];
    if (pm) { pm.tp.set(o[1], o[2], o[3]); pm.tq.set(o[4], o[5], o[6], o[7]); }
  }
  for (const ev of s.ev || []) handleEvent(ev);
}

const hostNow = () => performance.now() / 1000 + (G.clockOff || 0) + G.ow;

function guestView(dt) {
  const s = G.latest;
  if (!s) return;
  const v = G.view;
  // opponent (host) avatar, interpolated 100 ms behind
  const rt = hostNow() - 0.1 - G.ow;
  let a = G.snaps[0], b = G.snaps[G.snaps.length - 1];
  for (let k = G.snaps.length - 1; k > 0; k--) { if (G.snaps[k - 1].ts <= rt) { a = G.snaps[k - 1]; b = G.snaps[k]; break; } }
  const t = b.ts > a.ts ? clamp((rt - a.ts) / (b.ts - a.ts), 0, 1) : 1;
  for (const i of [0, 1]) {
    const pa = a.p[i], pb = b.p[i], P = v.players[i];
    P.x = lerp(pa[0], pb[0], t); P.z = lerp(pa[1], pb[1], t);
    let dy = pb[2] - pa[2]; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    P.yaw = pa[2] + dy * t; P.pitch = lerp(pa[3], pb[3], t);
    applyFlags(P, pb[4]); P.power = pb[5];
  }
  // dumpling
  const d = s.d, V = v.d;
  const prevState = V.state;
  V.state = DSTATE_NAMES[d.s]; V.holder = d.h; V.id = d.id; V.th = d.th; V.landed = !!d.l; V.owner = d.o; V.ownerLocked = !!d.ol;
  if (G.optimistic) {
    if (V.state === 'held' && V.holder === G.me) G.optimistic = null;
    else if (performance.now() > G.optimistic.until) G.optimistic = null;
    else { V.state = 'held'; V.holder = G.me; }
  }
  if (G.pred) {
    const age = (performance.now() - G.pred.t0) / 1000;
    const fresh = d.s === 1 && d.th === G.me && d.id > G.pred.prevId;
    if (age > 1.2) G.pred = null;
    else if (!fresh) {
      const P = G.pred;
      V.state = 'flying'; V.holder = -1; V.th = G.me;
      V.pos.x = P.o.x + P.v.x * age; V.pos.y = P.o.y + P.v.y * age - 4.905 * age * age; V.pos.z = P.o.z + P.v.z * age;
      V.vel.x = P.v.x; V.vel.y = P.v.y - 9.81 * age; V.vel.z = P.v.z;
      if (V.pos.y < 0.09) V.pos.y = 0.09;
      G.disp.set(V.pos.x, V.pos.y, V.pos.z);
      return;
    } else G.pred = null;
  }
  if (d.k && (V.state === 'flying' || V.state === 'loose')) {
    const k = d.k;
    const T = clamp(hostNow() - s.ts, 0, 0.15);
    const fly = d.s === 1 && !d.l;
    const tx = k[0] + k[7] * T, ty = Math.max(0.085, k[1] + k[8] * T - (fly ? 4.905 * T * T : 0)), tz = k[2] + k[9] * T;
    if (prevState === 'held' || prevState === 'gone' || G.disp.distanceTo({ x: tx, y: ty, z: tz }) > 1.5) G.disp.set(tx, ty, tz);
    else { const kk = 1 - Math.exp(-dt * (fly ? 30 : 16)); G.disp.x += (tx - G.disp.x) * kk; G.disp.y += (ty - G.disp.y) * kk; G.disp.z += (tz - G.disp.z) * kk; }
    V.pos.x = G.disp.x; V.pos.y = G.disp.y; V.pos.z = G.disp.z;
    V.vel.x = k[7]; V.vel.y = k[8]; V.vel.z = k[9];
    G.dispQ.slerp(new THREE.Quaternion(k[3], k[4], k[5], k[6]), 1 - Math.exp(-dt * 20));
    V.quat.x = G.dispQ.x; V.quat.y = G.dispQ.y; V.quat.z = G.dispQ.z; V.quat.w = G.dispQ.w;
  }
  // props
  for (const pm of G.propMeshes) {
    if (!pm || pm.fixed) continue;
    pm.obj.position.lerp(pm.tp, 1 - Math.exp(-dt * 18));
    pm.obj.quaternion.slerp(pm.tq, 1 - Math.exp(-dt * 18));
  }
}

function guestCatchCheck() {
  const gs = gsNow(), d = G.view.d;
  if (!gs || gs.phase !== 'live' || nowS() >= L.handsOutUntil || G.optimistic) return;
  const speed = Math.hypot(d.vel.x, d.vel.y, d.vel.z);
  const airborne = d.state === 'flying' || (d.state === 'loose' && d.pos.y > 0.3 && speed > 0.9);
  if (!airborne || !d.id || G.claimedId === d.id) return;
  if (catchDistance(localPlayer(), d.pos) < RULES.catchRadius) {
    G.link.send({ t: 'claim', id: d.id });
    G.claimedId = d.id;
    G.optimistic = { until: performance.now() + 450 };
    audio.play('catch');
  }
}

// ---------- per-frame ----------
function hostView() {
  const sim = G.sim, v = G.view;
  for (const i of [0, 1]) {
    const p = sim.players[i], P = v.players[i];
    P.x = p.x; P.z = p.z; P.yaw = p.yaw; P.pitch = p.pitch; P.crouch = p.crouch;
    P.handsOut = p.handsOut || sim.time < p.catchUntil; P.brace = p.brace; P.eyes = p.eyes; P.charging = p.charging; P.power = p.power;
  }
  sim.dumplingView(v.d);
  v.gs = sim.gs;
  for (const pm of G.propMeshes) {
    if (!pm || pm.fixed) continue;
    const pr = sim.props[pm.id];
    if (pr) { pm.obj.position.copy(pr.body.position); pm.obj.quaternion.copy(pr.body.quaternion); }
  }
}

function updateLocal(dt) {
  const gs = gsNow();
  const phase = gs ? gs.phase : 'intro';
  const frozen = !gs || phase === 'intro' || phase === 'penalty' || phase === 'roundOver' || phase === 'matchOver';
  const victim = phase === 'penalty' && gs.penalty && gs.penalty.victim === G.me && !gs.penalty.result;
  const lk = input.consumeLook();
  if (!G.paused) {
    if (input.cursorAim && !input.isTouch) {
      L.yaw = damp(L.yaw, SPAWN[G.me].yaw - input.cursor.x * 1.15, 12, dt);
      L.pitch = damp(L.pitch, -input.cursor.y * 0.8, 12, dt);
    } else {
      const s = 0.0022 * settings.sens;
      L.yaw -= lk.dx * s;
      L.pitch = clamp(L.pitch - lk.dy * s, -1.35, 1.35);
    }
  }
  const handsOut = nowS() < L.handsOutUntil;
  L.crouch = !frozen && !G.paused && input.held('crouch');
  L.brace = victim && input.held('brace');
  L.eyes = victim && input.held('eyes');
  const mv = frozen || G.paused ? { x: 0, y: 0 } : input.moveVector();
  const sp = PHYS.moveSpeed * (L.crouch ? 0.45 : 1) * (L.charging ? 0.65 : 1) * (handsOut ? 0.7 : 1);
  const fx = -Math.sin(L.yaw), fz = -Math.cos(L.yaw), rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
  L.vx = damp(L.vx, (fx * mv.y + rx * mv.x) * sp, 12, dt);
  L.vz = damp(L.vz, (fz * mv.y + rz * mv.x) * sp, 12, dt);
  const r = resolveMove(L.x + L.vx * dt, L.z + L.vz * dt, ZONES[G.me], room.obstacles);
  if (dt > 0) { L.vx = (r.x - L.x) / dt; L.vz = (r.z - L.z) / dt; }
  L.x = r.x; L.z = r.z;
  if (frozen) { L.vx = 0; L.vz = 0; }
  const speed = Math.hypot(L.vx, L.vz);
  L.moving = speed > 0.3;
  if (L.moving) { L.stepT -= dt * speed; if (L.stepT <= 0) { L.stepT = 0.75; audio.play('step', { v: 0.6 }); } }
  if (L.charging) {
    if (!iHold() || !canThrowNow()) { L.charging = false; L.power = 0; }
    else L.power = clamp((performance.now() - L.chargeStart) / (PHYS.chargeTime * 1000), 0, 1);
  }
}

const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), flipY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
const m4 = new THREE.Matrix4(), camRight = new THREE.Vector3();
const tiltQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0.25, 0));

function renderGame(dt, now) {
  const v = G.view, me = G.me, opp = 1 - me;
  const gs = v.gs;
  // camera
  L.eyeY = damp(L.eyeY, L.crouch ? CROUCH_EYE : EYE, 14, dt);
  L.bob += dt * (L.moving ? 10 : 0);
  L.shake = Math.max(0, L.shake - dt * 1.6);
  L.kick = Math.max(0, L.kick - dt * 2.5);
  const sh = L.shake * L.shake * 0.06;
  camera.position.set(L.x + (Math.random() - 0.5) * sh, L.eyeY + Math.sin(L.bob) * 0.018 * (L.moving ? 1 : 0) + (Math.random() - 0.5) * sh, L.z + (Math.random() - 0.5) * sh);
  camera.rotation.set(L.pitch + L.kick * 0.3 - (L.brace ? 0.14 : 0), L.yaw, L.brace ? Math.sin(now * 0.04) * 0.008 : 0, 'YXZ');
  const fov = L.brace ? 62 : 72;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = damp(camera.fov, fov, 8, dt); camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld(true);
  // opponent
  const op = v.players[opp], sm = G.oppSm;
  const k = 1 - Math.exp(-dt * 18);
  sm.x += (op.x - sm.x) * k; sm.z += (op.z - sm.z) * k;
  let dy = op.yaw - sm.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
  sm.yaw += dy * k; sm.pitch += (op.pitch - sm.pitch) * k;
  Object.assign(sm, { crouch: op.crouch, handsOut: op.handsOut, brace: op.brace, eyes: op.eyes, charging: op.charging, power: op.power });
  const oppHolding = v.d.state === 'held' && v.d.holder === opp;
  avatars[opp].update(dt, sm, oppHolding);
  avatars[opp].root.updateMatrixWorld(true);
  // hands
  fp.update(dt, { holding: iHold(), charging: L.charging, power: L.power, handsOut: nowS() < L.handsOutUntil, brace: L.brace, moving: L.moving });
  fp.root.updateMatrixWorld(true);
  // dumpling
  const d = v.d;
  const heat = gs && gs.mode === 'hotpotato' && gs.phase === 'live' ? clamp(1 - gs.timeLeft / RULES.hotPotatoTime, 0, 1) : 0;
  dv.setHeat(heat);
  if (d.state === 'gone') { dv.root.visible = false; blob.visible = false; }
  else {
    dv.root.visible = true;
    if (d.state === 'held' && d.holder === me) {
      fp.R.anchor.getWorldPosition(tmpV);
      dv.root.position.copy(tmpV);
      tmpQ.copy(camera.quaternion).multiply(tiltQ);
      camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      dv.squeeze(L.charging ? L.power * 0.38 : 0, L.charging ? camRight : null);
      dv.update(dt, tmpQ);
    } else if (d.state === 'held') {
      const A = avatars[d.holder];
      A.holdAnchor.getWorldPosition(tmpV);
      dv.root.position.copy(tmpV);
      tmpQ.copy(A.root.quaternion).multiply(flipY);
      dv.squeeze(sm.charging ? sm.power * 0.3 : 0, null);
      dv.update(dt, tmpQ);
    } else {
      dv.root.position.set(d.pos.x, d.pos.y, d.pos.z);
      tmpQ.set(d.quat.x, d.quat.y, d.quat.z, d.quat.w);
      dv.squeeze(0, null);
      dv.update(dt, tmpQ);
    }
    // blob shadow
    const p = dv.root.position;
    ray.set(tmpV.set(p.x, p.y + 0.02, p.z), down);
    ray.far = 3;
    const hit = ray.intersectObjects(room.shadowCatchers, false)[0];
    if (hit && d.state !== 'held') {
      const h = Math.max(0, p.y - hit.point.y);
      blob.visible = true;
      blob.position.set(p.x, hit.point.y + 0.004, p.z);
      const s = 0.26 * (1 + h * 0.5);
      blob.scale.set(s, s, 1);
      blob.material.opacity = clamp(0.9 / (1 + h * 1.6), 0.15, 0.9);
    } else blob.visible = false;
    // hot potato steam
    if (heat > 0.3) { G.steamT -= dt * (1 + heat * 6); if (G.steamT <= 0) { G.steamT = 0.12; particles.burst('steam', [p.x, p.y, p.z]); } }
  }
  // pickup ring
  const loose = d.state === 'loose' && Math.hypot(d.vel.x, d.vel.y, d.vel.z) < 1.2 && gs && gs.phase === 'live';
  ring.visible = loose && blob.visible;
  if (ring.visible) {
    ring.position.set(d.pos.x, blob.position.y + 0.002, d.pos.z);
    ring.material.color.set(PLAYER_COLORS[d.owner] || '#ffffff');
    const pul = 1 + Math.sin(now * 0.008) * 0.08;
    ring.scale.set(pul, pul, 1);
  }
  // aim guide
  arcDots.visible = L.charging && settings.arc;
  if (arcDots.visible) {
    const dir = forward(L.yaw, L.pitch);
    const o = throwOrigin({ x: L.x, z: L.z, yaw: L.yaw, crouch: L.crouch }, dir);
    const spd = PHYS.throwMin + (PHYS.throwMax - PHYS.throwMin) * L.power;
    let span = 0.3;
    if (gs && gs.phase === 'penalty') {
      // Free shot: show most of the flight so you can see how far it drops before the head.
      const o2 = v.players[opp], dist = Math.hypot(o2.x - L.x, o2.z - L.z);
      span = clamp((0.72 * dist) / Math.max(1, spd * Math.cos(L.pitch)), 0.3, 1.0);
    }
    for (let i = 0; i < ARC_DOTS; i++) {
      const t = 0.03 + (i / (ARC_DOTS - 1)) * span;
      m4.makeTranslation(o.x + dir.x * spd * t, o.y + dir.y * spd * t - 4.905 * t * t, o.z + dir.z * spd * t);
      arcDots.setMatrixAt(i, m4);
    }
    arcDots.instanceMatrix.needsUpdate = true;
  }
  // fixed prop wobble
  for (let i = G.wobbles.length - 1; i >= 0; i--) {
    const w = G.wobbles[i];
    w.t += dt; w.a *= Math.exp(-dt * 2.4);
    const s = Math.sin(w.t * 14) * w.a;
    w.pm.obj.rotation.set(w.pm.base.x + s * 0.05, w.pm.base.y, w.pm.base.z + s * 0.12);
    if (w.a < 0.01) { w.pm.obj.rotation.copy(w.pm.base); G.wobbles.splice(i, 1); }
  }
  // audio listener + screen fx
  camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
  audio.setListener(camera.position, camRight);
  audio.setMuffle(L.eyes);
  sfx.setEyes(L.eyes);
  sfx.setVignette(L.brace);
  sfx.setHot(heat > 0.75 ? (heat - 0.75) * 4 : 0);
  if (heat > 0) {
    G.heatTick -= dt;
    const period = lerp(1.0, 0.12, heat);
    if (G.heatTick <= 0) { G.heatTick = period; audio.play('tick', { f: heat > 0.8 ? 2200 : 1800 }); }
  }
}

function updateHud(dt) {
  const gs = gsNow();
  if (!gs) return;
  const me = G.me, opp = 1 - me;
  $('h-n0').textContent = (G.names[me] || 'You') + ' (you)';
  $('h-n1').textContent = G.names[opp] || 'Opponent';
  document.querySelector('.pill.p1 i').style.background = PLAYER_COLORS[me];
  document.querySelector('.pill.p2 i').style.background = PLAYER_COLORS[opp];
  $('h-mode').textContent = MODES[gs.mode].name;
  let s0 = 0, s1 = 0, big = '', sub = '', hot = false;
  if (gs.mode === 'classic') {
    s0 = gs.heads[me]; s1 = gs.heads[opp];
    sub = `Catch streak ${gs.streak} · Best ${gs.best}` + (gs.knocked ? ` · Stuff hit ${gs.knocked}` : '');
  } else if (gs.mode === 'penalty') {
    s0 = gs.scores[me]; s1 = gs.scores[opp];
    sub = `First to ${gs.target} headshots`;
    if (gs.phase === 'penalty' && gs.penalty && !gs.penalty.shot && !gs.penalty.result) {
      big = String(Math.ceil(gs.penalty.clock));
      sub = gs.penalty.shooter === me ? 'Shot clock' : 'Incoming free shot';
    }
  } else {
    s0 = gs.wins[me]; s1 = gs.wins[opp];
    big = gs.phase === 'live' ? String(Math.ceil(gs.timeLeft)) : gs.phase === 'intro' ? String(RULES.hotPotatoTime) : '0';
    hot = gs.phase === 'live' && gs.timeLeft < 10;
    sub = `Round ${gs.round} · First to ${RULES.hotPotatoWins}` + (gs.draws ? ` · Draws ${gs.draws}` : '');
  }
  $('h-s0').textContent = s0; $('h-s1').textContent = s1;
  const bigEl = $('h-big'); bigEl.textContent = big; bigEl.classList.toggle('hot', hot);
  $('h-sub').textContent = sub;
  // countdown
  const cEl = $('h-count');
  if (gs.phase === 'intro') {
    const n = Math.max(1, Math.ceil(gs.phaseT));
    cEl.hidden = false; cEl.textContent = n;
    if (n !== G.lastCount) { audio.play('beep'); G.lastCount = n; }
    G.goT = 0.6;
  } else {
    G.lastCount = -1;
    if (G.goT > 0) { G.goT -= dt; cEl.hidden = false; cEl.textContent = 'GO'; } else cEl.hidden = true;
  }
  // power ring
  const circ = 2 * Math.PI * 19;
  $('h-ring').setAttribute('stroke-dasharray', `${(L.charging ? L.power : 0) * circ} 200`);
  // prompt
  const d = G.view.d;
  let txt = '', cls = '';
  if (gs.phase === 'penalty' && gs.penalty && !gs.penalty.result) {
    if (gs.penalty.victim === me) { txt = hint('Free shot on you! Hold F to brace or Q to close your eyes', 'Free shot on you! Hold BRACE or CLOSE EYES'); cls = 'warn'; }
    else if (!gs.penalty.shot) { txt = 'Free shot! Aim a little above the head, it drops'; cls = 'go'; }
  } else if (gs.phase === 'live') {
    if (iHold()) {
      if (gs.mode === 'hotpotato') { txt = hint('Get rid of it! Hold click, release to throw', 'Get rid of it! Hold THROW, release'); cls = gs.timeLeft < 8 ? 'warn' : 'go'; }
      else if (G.throwsDone < 2) txt = hint('Hold click to charge, release to throw', 'Hold THROW to charge, release to throw');
    } else if (d.state === 'loose' && Math.hypot(d.vel.x, d.vel.y, d.vel.z) < 1.5) {
      if (d.owner === me) { txt = nearDumpling() ? hint('Press E or click to pick it up', 'Tap PICK UP') : 'Your pickup. Walk over to it'; cls = gs.mode === 'hotpotato' ? 'warn' : ''; }
      else txt = `${oppName()}'s pickup`;
    } else if (d.state === 'flying' && d.th !== me && Math.hypot(d.pos.x - L.x, d.pos.z - L.z) < 3.4) {
      txt = hint('Catch! Space, right click or click', 'Catch! Tap CATCH'); cls = 'go';
    }
  }
  const pr = $('h-prompt');
  pr.hidden = !txt; pr.textContent = txt; pr.className = 'prompt ' + cls;
  // touch buttons
  if (!$('touch').hidden) {
    const victim = gs.phase === 'penalty' && gs.penalty && gs.penalty.victim === me && !gs.penalty.result;
    $('t-brace').hidden = !victim; $('t-eyes').hidden = !victim;
    $('t-throw').hidden = victim; $('t-catch').hidden = victim; $('t-duck').hidden = victim;
    $('t-pick').hidden = !(d.state === 'loose' && d.owner === me);
    $('t-throw').textContent = iHold() ? 'THROW' : 'CATCH';
  }
  // net info
  $('h-net').textContent = G.role === 'guest' ? `Ping ${Math.round(G.rtt * 1000)} ms` : G.role === 'host' ? (G.link && G.link.open ? 'Hosting' : 'Opponent disconnected') : '';
  // match over screen
  if (G.overTimer > 0) { G.overTimer -= dt; if (G.overTimer <= 0) showOver(); }
}

// ---------- menu scene ----------
let menuT = 0;
function updateMenu(dt) {
  menuT += dt;
  const a = Math.sin(menuT * 0.18) * 0.35;
  camera.position.set(1.95 + Math.sin(a) * 0.3, 1.42 + Math.sin(menuT * 0.3) * 0.04, 0.55 + Math.cos(a) * 0.35);
  // Keep the scene clear of the menu card: on wide screens the card sits on the left.
  const wide = innerWidth > 900;
  camera.lookAt(wide ? -0.55 : -0.1, 0.78, wide ? 0.55 : 0.1);
  if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
  dv.root.visible = true;
  dv.root.position.set(0.12, 0.47 + 0.075, 0.42);
  tmpQ.setFromEuler(new THREE.Euler(0, Math.atan2(camera.position.x - 0.12, camera.position.z - 0.42), 0));
  if (Math.random() < dt * 0.4) dv.impact([0, 1, 0], 0.18);
  dv.setHeat(0); dv.squeeze(0, null);
  dv.update(dt, tmpQ);
  blob.visible = true; blob.position.set(0.12, 0.474, 0.42); blob.scale.set(0.24, 0.24, 1); blob.material.opacity = 0.8;
  ring.visible = false; arcDots.visible = false;
  // your character, waving now and then
  const A = avatars[0];
  if (A) {
    A.root.visible = true;
    const yaw = Math.atan2(-(camera.position.x + 0.2), -(camera.position.z + 0.45));
    A.update(dt, { x: -0.2, z: -0.45, yaw, pitch: 0.05, handsOut: Math.sin(menuT * 0.7) > 0.93 }, false);
    avatars[1].root.visible = false;
  }
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (window.__ddFrozen) return;
  tick(dt, now);
  if (!NO_RENDER) renderer.render(scene, camera);
}
function tick(dt, now) {
  if (G.phase === 'game') {
    updateLocal(dt);
    if (G.role === 'solo' || G.role === 'host') {
      const sim = G.sim;
      if (!(G.role === 'solo' && G.paused)) {
        sim.setPlayerState(G.me, localPlayer());
        if (G.bot) G.bot.update(dt);
        sim.step(dt);
        const evs = sim.drainEvents();
        hostView();
        for (const ev of evs) handleEvent(ev);
        if (G.role === 'host' && G.link) {
          G.outEv.push(...evs);
          G.snapAcc += dt;
          if (G.snapAcc >= 1 / NET.snapshotHz) { G.snapAcc = 0; if (G.link.open) G.link.send(sim.snapshot(G.outEv)); G.outEv = []; }
        }
      } else hostView();
    } else if (G.role === 'guest') {
      G.inAcc += dt;
      if (G.inAcc >= 1 / NET.inputHz) {
        G.inAcc = 0;
        const s = localPlayer();
        G.link.send({ t: 'in', s: [r3(s.x), r3(s.z), r3(s.yaw), r3(s.pitch), playerFlags(s), r3(s.power)], lat: r3(G.ow) });
      }
      G.pingT -= dt;
      if (G.pingT <= 0) { G.pingT = 1; G.link.send({ t: 'ping', c: performance.now() }); }
      guestView(dt);
      guestCatchCheck();
    }
    renderGame(dt, now);
    updateHud(dt);
  } else updateMenu(dt);
  particles.update(dt);
  room.update(dt);
}

// ---------- screens ----------
const screens = ['scr-title', 'scr-mode', 'scr-online', 'scr-wait', 'scr-pause', 'scr-over', 'scr-settings', 'scr-howto'];
let backTo = 'scr-title';
function show(id) {
  $('menu').hidden = false;
  for (const s of screens) $(s).hidden = s !== id;
  G.screen = id;
}
function closeMenus() { $('menu').hidden = true; G.paused = false; if (G.phase === 'game' && !input.isTouch && !input.locked && !input.cursorAim) $('clickplay').hidden = false; }

function enterGame() {
  G.phase = 'game';
  $('hud').hidden = false;
  input.enabled = true;
  avatars[G.me].root.visible = false;
  avatars[1 - G.me].root.visible = true;
  fp.root.visible = true;
  fp.setColor(CHAR[charOf[G.me]].top.color);
  showTouch(input.isTouch);
  resetLocal();
  closeMenus();
  camera.fov = 72; camera.updateProjectionMatrix();
}

function leaveGame(msg) {
  if (G.link) { try { G.link.send({ t: 'bye' }); } catch { /* ignore */ } G.link.onClose = null; G.link.close(); G.link = null; }
  G.phase = 'menu'; G.role = null; G.bot = null; G.paused = false; G.overTimer = 0;
  G.latest = null; G.snaps = []; G.clockOff = null; G.pred = null; G.optimistic = null;
  $('hud').hidden = true; $('touch').hidden = true; $('clickplay').hidden = true;
  input.enabled = false; input.exitLock();
  avatars.forEach((a) => (a.root.visible = false)); fp.root.visible = false;
  setupProps([]); room.hotTape.visible = false; sfx.clear(); audio.setMuffle(false);
  setAvatar(0, settings.char, settings.name); setAvatar(1, otherChar(settings.char), 'Bao Bot');
  G.view.gs = null;
  show('scr-title');
  if (msg) setTimeout(() => alertBanner(msg), 50);
}
function alertBanner(msg) {
  const el = document.createElement('p');
  el.className = 'note'; el.textContent = msg; el.style.color = '#c0392b';
  const card = $('scr-title').querySelector('.sticker');
  card.querySelector('.note.err-msg')?.remove();
  el.classList.add('err-msg');
  card.appendChild(el);
}

function openPause() {
  if (G.phase !== 'game') return;
  if (G.role === 'solo') G.paused = true;
  L.charging = false;
  input.exitLock();
  $('clickplay').hidden = true;
  $('b-change').hidden = G.role === 'guest';
  $('pause-note').textContent = G.role === 'solo' ? 'The game is paused.' : 'Online games keep running while this menu is open.';
  show('scr-pause');
}

function showOver() {
  const gs = gsNow(); if (!gs) return;
  const me = G.me, w = G.overWinner;
  $('over-title').textContent = w === me ? 'You win!' : `${oppName()} wins`;
  const sc = gs.mode === 'hotpotato' ? gs.wins : gs.scores;
  $('over-score').innerHTML = `<span class="s1"></span> : <span class="s2"></span>`;
  $('over-score').querySelector('.s1').textContent = sc[me];
  $('over-score').querySelector('.s2').textContent = sc[1 - me];
  $('over-score').querySelector('.s1').style.color = PLAYER_COLORS[me];
  $('over-score').querySelector('.s2').style.color = PLAYER_COLORS[1 - me];
  $('over-note').textContent = gs.mode === 'hotpotato' ? `Rounds won. Draws: ${gs.draws}.` : 'Headshots from free shots.';
  $('b-rematch').hidden = G.role === 'guest';
  if (G.role === 'guest') $('over-note').textContent += ' Waiting for the host to start a rematch.';
  input.exitLock();
  show('scr-over');
}

// mode screen
let modeCtx = 'solo';
function selectMode(m) {
  G.mode = m;
  document.querySelectorAll('.mode-card').forEach((c) => c.setAttribute('aria-checked', String(c.dataset.mode === m)));
  $('opt-target-row').hidden = m !== 'penalty';
  $('opt-hp-note').hidden = m !== 'hotpotato';
}
function seg(id, value, onPick) {
  const el = $(id);
  el.querySelectorAll('button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.v === String(value)));
    b.onclick = () => { el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); audio.init(); audio.play('ui'); onPick(b.dataset.v); };
  });
}
document.querySelectorAll('.mode-card').forEach((c) => c.addEventListener('click', () => { audio.init(); audio.play('ui'); selectMode(c.dataset.mode); }));
function openModeScreen(ctx) {
  modeCtx = ctx;
  $('lobby-box').hidden = ctx !== 'host';
  $('opt-diff-row').hidden = ctx !== 'solo';
  $('mode-title').textContent = ctx === 'host' ? 'Pick a mode' : 'Pick a mode';
  $('b-start').disabled = ctx === 'host' && !(G.link && G.link.open && G.guestName);
  $('b-start').textContent = G.phase === 'game' ? 'Restart in this mode' : 'Start';
  selectMode(G.mode);
  seg('opt-diff', G.diff, (v) => (G.diff = v));
  seg('opt-target', G.target, (v) => (G.target = +v));
  show('scr-mode');
}
function setLobbyStatus(text, kind = '') {
  $('lobby-status-text').textContent = text;
  $('lobby-status').className = 'status ' + kind;
}

$('b-solo').onclick = () => { audio.init(); audio.play('ui'); readName(); openModeScreen('solo'); };
$('b-online').onclick = () => {
  audio.init(); audio.play('ui'); readName();
  $('online-preview-note').hidden = !PREVIEW;
  $('b-create').disabled = PREVIEW; $('b-join').disabled = PREVIEW;
  $('online-status').hidden = true;
  show('scr-online');
};
$('b-howto').onclick = () => { backTo = 'scr-title'; show('scr-howto'); };
$('b-settings').onclick = () => { backTo = 'scr-title'; openSettings(); };
$('b-howto-done').onclick = () => show(backTo);
$('b-mode-back').onclick = () => {
  if (G.phase === 'game') { openPause(); return; }
  if (modeCtx === 'host') { if (G.link) { G.link.onClose = null; G.link.close(); G.link = null; } G.role = null; show('scr-online'); return; }
  show('scr-title');
};
$('b-online-back').onclick = () => show('scr-title');
$('b-start').onclick = () => {
  audio.init();
  if (modeCtx === 'solo') startSolo();
  else startHostGame();
};
$('b-resume').onclick = () => { closeMenus(); if (!input.isTouch && !input.cursorAim) input.requestLock(); };
$('b-change').onclick = () => openModeScreen(G.role === 'host' ? 'host' : 'solo');
$('b-pause-howto').onclick = () => { backTo = 'scr-pause'; show('scr-howto'); };
$('b-pause-settings').onclick = () => { backTo = 'scr-pause'; openSettings(); };
$('b-leave').onclick = () => leaveGame();
$('b-over-leave').onclick = () => leaveGame();
$('b-rematch').onclick = () => { audio.init(); if (G.role === 'solo') { G.bot.reset(); G.sim.reset(G.mode, { target: G.target }); } else if (G.role === 'host') G.sim.reset(G.mode, { target: G.target }); };
$('b-wait-leave').onclick = () => leaveGame();
$('b-copy').onclick = async () => {
  const url = `${location.origin}${location.pathname}?room=${G.code}`;
  try { await navigator.clipboard.writeText(url); $('copy-note').textContent = 'Link copied'; }
  catch { $('copy-note').textContent = url; }
};

function readName() {
  const v = $('in-name').value.trim().slice(0, 14);
  if (v) settings.name = v;
  saveSettings();
}

function startSolo() {
  const sim = ensureSim();
  G.role = 'solo'; G.me = 0;
  G.names = [settings.name, 'Bao Bot'];
  sim.players[0].name = settings.name; sim.players[1].name = 'Bao Bot';
  sim.players[1].remote = false; sim.players[0].remote = false;
  setAvatar(0, settings.char, settings.name);
  setAvatar(1, otherChar(settings.char), 'Bao Bot');
  G.bot = new Bot(sim, 1, room.obstacles, G.diff);
  sim.reset(G.mode, { target: G.target });
  sim.drainEvents().forEach(handleEvent);
}

function startHostGame() {
  const sim = ensureSim();
  sim.players[1].remote = true; sim.players[0].remote = false;
  G.names[0] = settings.name;
  sim.reset(G.mode, { target: G.target });
  const evs = sim.drainEvents();
  hostView();
  evs.forEach(handleEvent);
  G.outEv.push(...evs);
}

async function createRoom() {
  readName();
  const status = (t, k = '') => { $('online-status').hidden = false; $('online-status-text').textContent = t; $('online-status').className = 'status ' + k; };
  status('Opening a room...');
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomCode();
    try {
      const Link = USE_TABS ? TabLink : PeerLink;
      const link = await Link.host(code, { onGuest: () => {}, onError: () => setLobbyStatus('Lost the matchmaking server. Your current game keeps going.', 'err') });
      G.link = link; G.code = code; G.role = 'host'; G.me = 0; G.guestName = '';
      G.names = [settings.name, ''];
      setAvatar(0, settings.char, settings.name);
      ensureSim();
      link.on(hostOnMessage);
      link.onClose = () => {
        G.guestName = '';
        if (G.phase === 'game') { leaveGame('Your friend left the game.'); }
        else { setLobbyStatus('Your friend left. Waiting for someone to join...'); $('b-start').disabled = true; }
      };
      $('lobby-code').textContent = code;
      $('copy-note').textContent = '';
      setLobbyStatus('Waiting for a friend to join...');
      openModeScreen('host');
      return;
    } catch (err) {
      if (err && err.type === 'unavailable-id') continue;
      status(describeNetError(err), 'err');
      return;
    }
  }
  status('Could not open a room. Try again.', 'err');
}

async function joinRoom(codeRaw) {
  readName();
  const code = (codeRaw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  const status = (t, k = '') => { $('online-status').hidden = false; $('online-status-text').textContent = t; $('online-status').className = 'status ' + k; };
  if (code.length !== 5) { show('scr-online'); status('Room codes have 5 characters.', 'err'); return; }
  show('scr-online');
  status(`Joining room ${code}...`);
  try {
    const Link = USE_TABS ? TabLink : PeerLink;
    const link = await Link.join(code);
    G.link = link; G.role = 'guest'; G.me = 1; G.code = code;
    G.names = ['Host', settings.name];
    G.clockOff = null; G.snaps = []; G.latest = null;
    link.on(guestOnMessage);
    link.onClose = () => leaveGame('The host closed the room.');
    setAvatar(1, settings.char, settings.name);
    link.send({ t: 'hello', name: settings.name, char: settings.char });
    $('wait-text').textContent = 'Connected. Waiting for the host to start...';
    show('scr-wait');
  } catch (err) {
    status(describeNetError(err), 'err');
  }
}
$('b-create').onclick = () => { audio.init(); createRoom(); };
$('b-join').onclick = () => { audio.init(); joinRoom($('in-code').value); };
$('in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') { audio.init(); joinRoom($('in-code').value); } });

// settings
function openSettings() {
  $('set-sens').value = settings.sens; $('set-sens-v').textContent = Number(settings.sens).toFixed(1);
  $('set-vol').value = settings.vol; $('set-vol-v').textContent = Math.round(settings.vol * 100) + '%';
  seg('set-gfx', settings.gfx, (v) => { settings.gfx = v; applyGfx(); saveSettings(); });
  seg('set-arc', settings.arc ? 'on' : 'off', (v) => { settings.arc = v === 'on'; saveSettings(); });
  show('scr-settings');
}
$('set-sens').oninput = (e) => { settings.sens = +e.target.value; $('set-sens-v').textContent = settings.sens.toFixed(1); saveSettings(); };
$('set-vol').oninput = (e) => { settings.vol = +e.target.value; $('set-vol-v').textContent = Math.round(settings.vol * 100) + '%'; audio.setVolume(settings.vol); saveSettings(); };
$('b-settings-done').onclick = () => show(backTo);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- boot ----------
$('in-name').value = settings.name;
seg('set-char', settings.char, (v) => { settings.char = v; saveSettings(); setAvatar(0, v, settings.name); setAvatar(1, otherChar(v), 'Bao Bot'); fp.setColor(CHAR[v].top.color); });
applyGfx();
show('scr-title');
requestAnimationFrame(frame);
setTimeout(refreshMirror, 300);
const roomParam = params.get('room');
if (roomParam && !PREVIEW) { $('in-code').value = roomParam.toUpperCase(); joinRoom(roomParam); }

// Debug/test hook (harmless in production).
window.__dd = {
  G, L, room, get sim() { return G.sim; }, handleEvent, camera, scene, renderer, avatars, dv, input, setAvatar,
  freeze(on = true) { window.__ddFrozen = on; },
  advance(seconds, fn) { let t = performance.now(); for (let i = 0; i < Math.round(seconds * 60); i++) { if (fn) fn(i); t += 1000 / 60; tick(1 / 60, t); } },
  render() { renderer.render(scene, camera); },
  start(mode, diff = 'normal') { G.mode = mode; G.diff = diff; readName(); startSolo(); },
  act: { throw(power = 0.5) { L.power = power; doThrow(); }, catch: () => doCatch(), pickup: () => doPickup() },
};
