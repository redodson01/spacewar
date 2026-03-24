// AI decision-making for computer-controlled ships.
// Returns an actions object { thrust, left, right, fire } — same shape as getActions.

export const AI_FIRE_ANGLE_THRESHOLD = 0.15; // radians
export const AI_APPROACH_DISTANCE = 300;
export const AI_TOO_CLOSE_DISTANCE = 80;
export const AI_DODGE_DISTANCE = 150;

export function getAIActions(ship, allShips, allProjectiles, worldWidth, worldHeight) {
  const s = ship.state;
  if (s.destroyed) return { thrust: false, left: false, right: false, fire: false };

  // Lazily init AI state
  if (!ship._ai) ship._ai = { jitter: Math.random() * Math.PI * 2 };

  // Find nearest alive enemy
  let target = null;
  let targetDist = Infinity;
  for (const other of allShips) {
    if (other === ship || other.state.destroyed) continue;
    const d = wrapDist(s.x, s.y, other.state.x, other.state.y, worldWidth, worldHeight);
    if (d < targetDist) {
      targetDist = d;
      target = other;
    }
  }

  if (!target) return { thrust: false, left: false, right: false, fire: false };

  // Angle to target (accounting for wrapping)
  const targetAngle = wrapAngleTo(s.x, s.y, target.state.x, target.state.y, worldWidth, worldHeight);

  // Check for incoming projectiles to dodge
  let dodgeAngle = null;
  for (const p of allProjectiles) {
    if (p.ownerId === ship.id) continue;
    const pd = Math.sqrt((s.x - p.x) ** 2 + (s.y - p.y) ** 2);
    if (pd > AI_DODGE_DISTANCE) continue;
    // Is projectile heading toward us?
    const projAngle = Math.atan2(p.vy, p.vx);
    const angleToShip = Math.atan2(s.y - p.y, s.x - p.x);
    if (Math.abs(normalizeAngle(projAngle - angleToShip)) < 0.5) {
      // Dodge perpendicular to the projectile's path
      dodgeAngle = projAngle + Math.PI / 2;
      break;
    }
  }

  // Decide aim direction
  const aimAngle = dodgeAngle !== null ? dodgeAngle : targetAngle;
  const angleDiff = normalizeAngle(aimAngle - s.angle);

  const left = angleDiff < -0.05;
  const right = angleDiff > 0.05;
  const facing = Math.abs(normalizeAngle(targetAngle - s.angle)) < AI_FIRE_ANGLE_THRESHOLD;
  const thrust = dodgeAngle !== null || targetDist > AI_TOO_CLOSE_DISTANCE;
  const fire = facing && dodgeAngle === null;

  return { thrust, left, right, fire };
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function wrapDist(x1, y1, x2, y2, w, h) {
  let dx = Math.abs(x2 - x1);
  let dy = Math.abs(y2 - y1);
  if (dx > w / 2) dx = w - dx;
  if (dy > h / 2) dy = h - dy;
  return Math.sqrt(dx * dx + dy * dy);
}

function wrapAngleTo(x1, y1, x2, y2, w, h) {
  let dx = x2 - x1;
  let dy = y2 - y1;
  if (dx > w / 2) dx -= w;
  if (dx < -w / 2) dx += w;
  if (dy > h / 2) dy -= h;
  if (dy < -h / 2) dy += h;
  return Math.atan2(dy, dx);
}
