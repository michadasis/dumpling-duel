// Shared constants. Units are meters and seconds.
// Room axes: x runs kitchen (-4) -> balcony (+4), z runs bed side (-) -> sofa/kitchen-wall side (+), y is up.

export const VERSION = '1.0.0';

export const ROOM = {
  x0: -4, x1: 4,
  z0: -2.1, z1: 2.1,
  knee: 2.0,   // height where the sloped ceiling meets the side walls
  ridge: 3.05, // ceiling height at the ridge (z = 0)
  front: 1.55, // built-in cabinets' front faces sit at z = +-1.55
};

export const EYE = 1.6;
export const CROUCH_EYE = 1.08;

// Where each player may walk. P1 (index 0) is on the kitchen side, P2 (index 1) on the balcony side.
export const ZONES = [
  { x0: -3.22, x1: -0.9, z0: -0.48, z1: 1.3 },
  { x0: 0.9, x1: 3.52, z0: -1.3, z1: 1.3 },
];

export const SPAWN = [
  { x: -2.15, z: 0.55, yaw: -Math.PI / 2 },
  { x: 2.45, z: 0.25, yaw: Math.PI / 2 },
];

export const RULES = {
  hotPotatoTime: 40,
  hotPotatoWins: 3,
  penaltyTargets: [3, 5, 7],
  penaltyTarget: 5,
  shotClock: 8,
  middleBand: 0.7,     // |x| <= this when the potato explodes = draw
  catchWindow: 0.5,
  catchCooldown: 0.28,
  catchRadius: 0.5,
  reach: 0.72,         // a throw passing this close to you counts as catchable
  pickupReach: 1.15,
  pickupMaxY: 2.0,
  introTime: 3,
};

export const PHYS = {
  step: 1 / 120,
  dumplingR: 0.085,
  dumplingMass: 0.12,
  linearDamping: 0.06,
  throwMin: 4.5,
  throwMax: 13,
  chargeTime: 0.85,
  moveSpeed: 2.7,
  playerR: 0.24,
  headR: 0.16,
};

export const NET = {
  prefix: 'dumpling-duel-v1-',
  snapshotHz: 30,
  inputHz: 30,
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // For players behind strict NATs add a TURN server, for example:
    // { urls: 'turn:your-turn-host:3478', username: 'user', credential: 'secret' },
  ],
};

export const PLAYER_COLORS = ['#ff6f59', '#3fa7d6'];

export const MODES = {
  classic: { name: 'Classic', blurb: 'Endless catch. No penalties. Knock the stuff behind them over.' },
  penalty: { name: 'Penalty', blurb: 'Drop a catchable throw and your opponent gets a free shot at your head.' },
  hotpotato: { name: 'Hot Potato', blurb: '40 seconds. Holding it or leaving it at your feet when it pops loses.' },
};
