export let WORLD_WIDTH = 1920;
export let WORLD_HEIGHT = 1080;

export const MAX_PLAYERS = 8;

export const PLAYER_COLORS = [
  '#dc322f', // red
  '#859900', // green
  '#268bd2', // blue
  '#b58900', // yellow
  '#2aa198', // cyan
  '#d33682', // magenta
  '#cb4b16', // orange
  '#6c71c4', // violet
];

export function computeSpawnPositions(w, h) {
  const positions = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const angle = (i / MAX_PLAYERS) * Math.PI * 2 - Math.PI / 2; // start from top
    positions.push({
      x: w / 2 + Math.cos(angle) * w * 0.35,
      y: h / 2 + Math.sin(angle) * h * 0.35,
      angle: angle + Math.PI, // face center
    });
  }
  return positions;
}

export const SPAWN_POSITIONS = computeSpawnPositions(WORLD_WIDTH, WORLD_HEIGHT);

export function setWorldSize(w, h) {
  WORLD_WIDTH = w;
  WORLD_HEIGHT = h;
  const newPositions = computeSpawnPositions(w, h);
  for (let i = 0; i < MAX_PLAYERS; i++) {
    SPAWN_POSITIONS[i] = newPositions[i];
  }
}
