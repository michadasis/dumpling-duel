// cannon-es world: room colliders, the dumpling, player hitboxes and props. Only the host runs this.
import * as CANNON from 'cannon-es';
import { PHYS } from './config.js';
import { PROP_TYPES } from './props.js';

export const GROUP = { STATIC: 1, DUMP: 2, PROP: 4, P0: 8, P1: 16 };
export const ALL_FOR_DUMPLING = GROUP.STATIC | GROUP.PROP | GROUP.P0 | GROUP.P1;

export function createPhysics(colliders) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0), allowSleep: true });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 10;
  world.defaultContactMaterial.friction = 0.4;
  world.defaultContactMaterial.restitution = 0.15;

  const M = {
    static: new CANNON.Material('static'),
    soft: new CANNON.Material('soft'),
    dumpling: new CANNON.Material('dumpling'),
    prop: new CANNON.Material('prop'),
    bouncy: new CANNON.Material('bouncy'),
    player: new CANNON.Material('player'),
  };
  const cm = (a, b, friction, restitution) => world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution }));
  cm(M.dumpling, M.static, 0.75, 0.16);
  cm(M.dumpling, M.soft, 0.9, 0.04);
  cm(M.dumpling, M.prop, 0.5, 0.2);
  cm(M.dumpling, M.bouncy, 0.5, 0.35);
  cm(M.dumpling, M.player, 0.5, 0.22);
  cm(M.prop, M.static, 0.5, 0.18);
  cm(M.prop, M.soft, 0.8, 0.05);
  cm(M.prop, M.prop, 0.45, 0.15);
  cm(M.prop, M.player, 0.3, 0.1);
  cm(M.bouncy, M.static, 0.5, 0.72);
  cm(M.bouncy, M.soft, 0.6, 0.2);
  cm(M.bouncy, M.prop, 0.4, 0.5);
  cm(M.bouncy, M.player, 0.4, 0.4);

  const statics = [];
  for (const c of colliders) {
    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.STATIC,
      material: c.kind === 'soft' ? M.soft : M.static,
      collisionFilterGroup: GROUP.STATIC,
      collisionFilterMask: GROUP.DUMP | GROUP.PROP,
    });
    if (c.type === 'box') {
      body.addShape(new CANNON.Box(new CANNON.Vec3(...c.h)));
      body.position.set(...c.c);
      if (c.rotY) body.quaternion.setFromEuler(0, c.rotY, 0);
    } else {
      body.addShape(new CANNON.Plane());
      body.position.set(...c.p);
      body.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(...c.n).unit());
    }
    body.userData = { kind: c.kind, sound: c.sound, id: c.id };
    world.addBody(body);
    statics.push(body);
  }

  const dumpling = new CANNON.Body({
    mass: PHYS.dumplingMass,
    shape: new CANNON.Sphere(PHYS.dumplingR),
    material: M.dumpling,
    linearDamping: PHYS.linearDamping,
    angularDamping: 0.45,
    collisionFilterGroup: GROUP.DUMP,
    collisionFilterMask: ALL_FOR_DUMPLING,
    allowSleep: true,
    sleepSpeedLimit: 0.12,
    sleepTimeLimit: 0.8,
  });
  dumpling.userData = { kind: 'dumpling' };

  const players = [0, 1].map((i) => {
    const group = i === 0 ? GROUP.P0 : GROUP.P1;
    // allowSleep: false, otherwise the hitboxes fall asleep while standing still and stop following the player.
    const body = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0, material: M.player, collisionFilterGroup: group, collisionFilterMask: GROUP.DUMP | GROUP.PROP, allowSleep: false });
    body.addShape(new CANNON.Cylinder(0.21, 0.19, 1.42, 10));
    body.userData = { kind: 'body', player: i };
    const head = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0, material: M.player, collisionFilterGroup: group, collisionFilterMask: GROUP.DUMP | GROUP.PROP, allowSleep: false });
    head.addShape(new CANNON.Sphere(PHYS.headR));
    head.userData = { kind: 'head', player: i };
    world.addBody(body); world.addBody(head);
    return { body, head, group };
  });

  function makeProp(spec) {
    const def = PROP_TYPES[spec.type];
    const fixed = !!def.fixed;
    const body = new CANNON.Body({
      mass: fixed ? 0 : def.mass,
      type: fixed ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC,
      material: def.bouncy ? M.bouncy : M.prop,
      collisionFilterGroup: fixed ? GROUP.STATIC : GROUP.PROP,
      collisionFilterMask: fixed ? GROUP.DUMP | GROUP.PROP : GROUP.STATIC | GROUP.DUMP | GROUP.PROP | GROUP.P0 | GROUP.P1,
      linearDamping: 0.05,
      angularDamping: 0.2,
      allowSleep: true,
      sleepSpeedLimit: 0.08,
      sleepTimeLimit: 0.6,
    });
    const s = def.shape;
    if (s.sphere) body.addShape(new CANNON.Sphere(s.sphere));
    else if (s.cyl) body.addShape(new CANNON.Cylinder(s.cyl[0], s.cyl[0], s.cyl[1], 12));
    else body.addShape(new CANNON.Box(new CANNON.Vec3(...s.box)));
    body.position.set(spec.x, spec.y, spec.z);
    body.quaternion.setFromEuler(spec.rx || 0, spec.ry || 0, spec.rz || 0);
    body.userData = { kind: 'prop', prop: spec.id, sound: def.sound, freq: def.freq, fixed, id: 'prop' + spec.id };
    world.addBody(body);
    if (!fixed) body.sleep();
    return body;
  }

  return { world, M, statics, dumpling, players, makeProp };
}
