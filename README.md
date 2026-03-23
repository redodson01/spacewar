# Spacewar

A 2D spaceship game built with HTML5 Canvas, featuring an embedded Lua scripting engine (via [Fengari](https://fengari.io/)) for real-time game modification.

![Spacewar screenshot](screenshot.png)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)

### Install & Run

```bash
npm install
npm run dev
```

Open http://localhost:8080 in your browser.

## Controls

| Key | Action |
|---|---|
| Arrow keys / WASD | Rotate and thrust |
| Space | Shoot |
| `` ` `` (backtick) | Toggle script editor |
| Escape | Close script editor |
| Ctrl/Cmd+Enter | Run full script |
| Ctrl/Cmd+Up / Ctrl/Cmd+Down | Switch focus: script editor / REPL |
| Ctrl/Cmd+Left / Ctrl/Cmd+Right | Switch focus: game / editor panel |

## Lua Scripting

Press backtick to open the editor. A single-line REPL is at the bottom for quick commands; the textarea above is for multi-line scripts.

### API

| Global | Description |
|---|---|
| `ship.color` | Ship color (CSS color string) |
| `ship.thrust` | Acceleration per frame |
| `ship.turnSpeed` | Rotation speed per frame |
| `ship.friction` | Velocity multiplier per frame (0-1) |
| `ship.radius` | Ship triangle size |
| `ship.x`, `ship.y` | Position (read/write) |
| `ship.angle` | Facing angle in radians |
| `ship.vx`, `ship.vy` | Velocity (read/write) |
| `ship.fireCooldown` | Seconds between shots |
| `ship.destroyed` | Whether the ship is currently destroyed (read-only) |
| `ship.respawnTimer` | Seconds until respawn (read-only) |
| `screen.width`, `screen.height` | Canvas dimensions |
| `projectiles` | Array of active projectiles |
| `shoot()` | Fire a projectile from the ship |
| `print(...)` | Output to the editor console |
| `function onUpdate(dt) ... end` | Per-frame callback (dt in seconds) |

### Examples

```lua
-- Change color
ship.color = "#ff0"

-- Rainbow cycling
local t = 0
function onUpdate(dt)
  t = t + dt * 2
  local r = math.floor(math.sin(t) * 127 + 128)
  local g = math.floor(math.sin(t + 2.094) * 127 + 128)
  local b = math.floor(math.sin(t + 4.189) * 127 + 128)
  ship.color = string.format("#%02x%02x%02x", r, g, b)
end
```

## Development

### Project Structure

```
src/
  main.js              Entry point, wires modules together
  ship.js              Ship physics (pure logic, no DOM)
  input.js             Keyboard state manager
  stars.js             Starfield generation and rendering
  projectiles.js       Projectile spawning, movement, and rendering
  explosions.js        Particle explosion effects
  collision.js         Collision detection
  lua-integration.js   Fengari/Lua bridge
  editor.js            Script editor panel UI
  storage.js           localStorage persistence layer
tests/
  ship.test.js             Ship physics unit tests
  projectiles.test.js      Projectile system unit tests
  explosions.test.js       Explosion particle unit tests
  collision.test.js        Collision detection unit tests
  lua-integration.test.js  Lua bridge integration tests
  input.test.js            Input manager unit tests
  stars.test.js            Starfield unit tests
  storage.test.js          Storage persistence unit tests
```

### Scripts

```bash
npm run dev          # Start local dev server on port 8080
npm run lint         # Run ESLint
npm test             # Run tests (Vitest)
npm run test:watch   # Run tests in watch mode
```

### Architecture

- **No build step** -- the game runs as plain ES modules served over HTTP
- **Fengari** is loaded from CDN in the browser; the npm `fengari`/`fengari-interop` packages are dev dependencies for testing only
- All modules use **dependency injection** for testability (fengari, canvas, DOM elements are passed as parameters)

## License

MIT
