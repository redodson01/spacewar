export let WORLD_WIDTH = 1920;
export let WORLD_HEIGHT = 1080;

export function setWorldSize(w, h) {
  WORLD_WIDTH = w;
  WORLD_HEIGHT = h;
  // Recalculate spawn positions
  SPAWN_POSITIONS[0] = { x: w / 4,     y: h / 4,     angle: Math.PI / 4 };
  SPAWN_POSITIONS[1] = { x: 3 * w / 4, y: 3 * h / 4, angle: -3 * Math.PI / 4 };
  SPAWN_POSITIONS[2] = { x: 3 * w / 4, y: h / 4,     angle: 3 * Math.PI / 4 };
  SPAWN_POSITIONS[3] = { x: w / 4,     y: 3 * h / 4, angle: -Math.PI / 4 };
}

export const PLAYER_COLORS = ['#dc322f', '#859900', '#268bd2', '#b58900'];

export const SPAWN_POSITIONS = [
  { x: WORLD_WIDTH / 4,     y: WORLD_HEIGHT / 4,     angle: Math.PI / 4 },       // top-left, faces SE
  { x: 3 * WORLD_WIDTH / 4, y: 3 * WORLD_HEIGHT / 4, angle: -3 * Math.PI / 4 },  // bottom-right, faces NW
  { x: 3 * WORLD_WIDTH / 4, y: WORLD_HEIGHT / 4,     angle: 3 * Math.PI / 4 },   // top-right, faces SW
  { x: WORLD_WIDTH / 4,     y: 3 * WORLD_HEIGHT / 4, angle: -Math.PI / 4 },      // bottom-left, faces NE
];
