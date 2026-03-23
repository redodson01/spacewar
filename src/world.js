export const WORLD_WIDTH = 1920;
export const WORLD_HEIGHT = 1080;

export const PLAYER_COLORS = ['#f00', '#0f0', '#00f', '#ff0'];

export const SPAWN_POSITIONS = [
  { x: WORLD_WIDTH / 4,     y: WORLD_HEIGHT / 4,     angle: Math.PI / 4 },       // top-left, faces SE
  { x: 3 * WORLD_WIDTH / 4, y: 3 * WORLD_HEIGHT / 4, angle: -3 * Math.PI / 4 },  // bottom-right, faces NW
  { x: 3 * WORLD_WIDTH / 4, y: WORLD_HEIGHT / 4,     angle: 3 * Math.PI / 4 },   // top-right, faces SW
  { x: WORLD_WIDTH / 4,     y: 3 * WORLD_HEIGHT / 4, angle: -Math.PI / 4 },      // bottom-left, faces NE
];
