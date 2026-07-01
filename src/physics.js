// 2D Vector Math Utilities
export const Vec = {
  create: (x = 0, y = 0) => ({ x, y }),
  clone: (v) => ({ x: v.x, y: v.y }),
  set: (v, x, y) => { v.x = x; v.y = y; },
  add: (v1, v2) => ({ x: v1.x + v2.x, y: v1.y + v2.y }),
  sub: (v1, v2) => ({ x: v1.x - v2.x, y: v1.y - v2.y }),
  mult: (v, s) => ({ x: v.x * s, y: v.y * s }),
  dot: (v1, v2) => v1.x * v2.x + v1.y * v2.y,
  cross: (v1, v2) => v1.x * v2.y - v1.y * v2.x,
  magSq: (v) => v.x * v.x + v.y * v.y,
  mag: (v) => Math.sqrt(v.x * v.x + v.y * v.y),
  normalize: (v) => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
  },
  distSq: (v1, v2) => {
    const dx = v1.x - v2.x;
    const dy = v1.y - v2.y;
    return dx * dx + dy * dy;
  },
  dist: (v1, v2) => Math.sqrt(Vec.distSq(v1, v2)),
  angle: (v) => Math.atan2(v.y, v.x),
};

// Check collision between a moving ball and a static circular bumper
// ball: { pos, vel, radius, mass }
// bumper: { pos, radius, restitution, isBumper }
export function checkCircleCollision(ball, bumper) {
  const distSq = Vec.distSq(ball.pos, bumper.pos);
  const minCDist = ball.radius + bumper.radius;

  if (distSq >= minCDist * minCDist) return null;

  const dist = Math.sqrt(distSq);
  // Collision normal pointing from bumper center to ball center
  const normal = dist === 0 ? Vec.create(0, -1) : Vec.mult(Vec.sub(ball.pos, bumper.pos), 1 / dist);
  const depth = minCDist - dist;

  return {
    normal,
    depth,
    point: Vec.add(bumper.pos, Vec.mult(normal, bumper.radius)),
  };
}

// Check collision between ball and a static or moving line segment (wall/flipper)
// ball: { pos, vel, radius }
// segment: { p1, p2, restitution, friction, isSlingshot }
// combinedRadius: additional padding (e.g. flipper capsule thickness)
export function checkSegmentCollision(ball, segment, combinedRadius = 0) {
  const ab = Vec.sub(segment.p2, segment.p1);
  const ac = Vec.sub(ball.pos, segment.p1);

  const abLenSq = Vec.magSq(ab);
  if (abLenSq === 0) {
    // It's a point, do circle check
    const distSq = Vec.distSq(ball.pos, segment.p1);
    const minDist = ball.radius + combinedRadius;
    if (distSq >= minDist * minDist) return null;
    const dist = Math.sqrt(distSq);
    const normal = dist === 0 ? Vec.create(0, -1) : Vec.mult(Vec.sub(ball.pos, segment.p1), 1 / dist);
    return { normal, depth: minDist - dist, point: Vec.clone(segment.p1), t: 0 };
  }

  // Project ac onto ab to find projection factor t
  let t = Vec.dot(ac, ab) / abLenSq;
  t = Math.max(0, Math.min(1, t)); // Clamp to segment length

  // Closest point on segment
  const closestPoint = Vec.add(segment.p1, Vec.mult(ab, t));

  const distSq = Vec.distSq(ball.pos, closestPoint);
  const minDist = ball.radius + combinedRadius;

  if (distSq >= minDist * minDist) return null;

  const dist = Math.sqrt(distSq);
  // Normal pointing from closest point on line to ball
  const normal = dist === 0 ? Vec.create(0, -1) : Vec.mult(Vec.sub(ball.pos, closestPoint), 1 / dist);
  const depth = minDist - dist;

  return {
    normal,
    depth,
    point: closestPoint,
    t,
  };
}

// Resolve collisions and return if an event was triggered
export function resolveCollision(ball, col, restitution, friction, flipperVelocity = null, isBumper = false, isSlingshot = false) {
  // 1. Positional correction (prevents sinking into surfaces)
  ball.pos = Vec.add(ball.pos, Vec.mult(col.normal, col.depth));

  // 2. Relative velocity calculation
  // If colliding with a moving flipper, relative velocity is ball.vel - flipperVelocity
  const surfaceVel = flipperVelocity || Vec.create(0, 0);
  const relVel = Vec.sub(ball.vel, surfaceVel);

  const velAlongNormal = Vec.dot(relVel, col.normal);

  // If already separating, do not apply impulse
  if (velAlongNormal > 0) return false;

  // 3. Calculate impulse scalar
  let e = restitution;
  let kickImpulse = 0;

  if (isBumper) {
    e = restitution * 1.5; // active bumper kick
    kickImpulse = 220; // Flat velocity boost (px/s)
  } else if (isSlingshot) {
    e = restitution * 1.3; // slingshot kick
    kickImpulse = 280; // Slingshot active kick
  }

  let j = -(1 + e) * velAlongNormal;

  // Apply collision impulse
  let impulseVector = Vec.mult(col.normal, j);
  ball.vel = Vec.add(ball.vel, impulseVector);

  if (kickImpulse > 0) {
    ball.vel = Vec.add(ball.vel, Vec.mult(col.normal, kickImpulse));
  }

  // 4. Apply friction along normal tangent
  const tangent = Vec.create(-col.normal.y, col.normal.x);
  const velAlongTangent = Vec.dot(relVel, tangent);
  const tangentImpulse = -velAlongTangent * friction;
  ball.vel = Vec.add(ball.vel, Vec.mult(tangent, tangentImpulse));

  return true;
}
