// Walking inside your half of the room, sliding around furniture.
import { clamp } from './util.js';
import { PHYS } from './config.js';

export function resolveMove(x, z, zone, obstacles, r = PHYS.playerR) {
  x = clamp(x, zone.x0, zone.x1);
  z = clamp(z, zone.z0, zone.z1);
  for (let pass = 0; pass < 2; pass++) {
    for (const o of obstacles) {
      if (o.r !== undefined) {
        const dx = x - o.cx, dz = z - o.cz, d = Math.hypot(dx, dz), min = o.r + r;
        if (d < min && d > 1e-6) { x = o.cx + (dx / d) * min; z = o.cz + (dz / d) * min; }
        continue;
      }
      if (x <= o.x0 - r || x >= o.x1 + r || z <= o.z0 - r || z >= o.z1 + r) continue;
      const cx = clamp(x, o.x0, o.x1), cz = clamp(z, o.z0, o.z1);
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d > 1e-6) { x = cx + (dx / d) * r; z = cz + (dz / d) * r; }
      else {
        const pen = [x - (o.x0 - r), o.x1 + r - x, z - (o.z0 - r), o.z1 + r - z];
        const m = Math.min(...pen);
        if (m === pen[0]) x = o.x0 - r; else if (m === pen[1]) x = o.x1 + r; else if (m === pen[2]) z = o.z0 - r; else z = o.z1 + r;
      }
    }
    x = clamp(x, zone.x0, zone.x1);
    z = clamp(z, zone.z0, zone.z1);
  }
  return { x, z };
}
