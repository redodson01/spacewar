# Multiplayer Roadmap

## Decisions Made

- **Networking**: WebSocket server (Phase 2), with local multiplayer as Phase 1 foundation
- **Authority model**: Client-authoritative, server is a dumb relay
- **Projectile ownership**: Tracked via `ownerId` for future use, but any projectile can destroy any ship (friendly fire preserved)
- **Lua scripting**: Local-only for now (affects your own ship). Future: game-global scripting for scenarios (e.g., a shared script that spawns obstacles, sets rules, or controls AI ships)
- **Wire protocol (Phase 2)**: Ship state snapshots at 20Hz + discrete events for fire/death/respawn

## Phase 2: WebSocket Networking

### Server (`server/index.js`)

A lightweight Node.js WebSocket server (~80-100 lines):
- Assigns player IDs on connect, broadcasts join/leave events
- Relays messages between clients (no game logic on server)
- Manages rooms or a single global session
- Single dependency: `ws` npm package

### Client (`src/net.js`)

A WebSocket client module:
- Connects to the server, sends local ship state + events, receives remote state
- Exposes an event-based API for the game loop to consume

### Message Types

```
{type: 'state', id, x, y, angle, vx, vy, color, destroyed, thrusting}  -- 20Hz per player
{type: 'fire', id, x, y, angle, vx, vy, color}                         -- on each shot
{type: 'death', id, x, y, color}                                        -- triggers remote explosion
{type: 'respawn', id, x, y}                                             -- ship reappears
{type: 'join', id, color}                                                -- new player connected
{type: 'leave', id}                                                      -- player disconnected
```

### Game Loop Changes

- Local ship: updated from keyboard input (same as Phase 1)
- Remote ships: updated from received state snapshots, with interpolation for smooth rendering
- Remote projectiles: spawned locally on receipt of `fire` event (not synced per-frame)
- Collision detection: runs on each client independently

### Connection UI

- Simple text input for server address (default `ws://localhost:8080`)
- Connection status indicator
- Could be integrated into the editor panel

## Phase 3: Polish (Deferred)

- **Score / kill tracking**: Display kill count per player, announce kills
- **More than 2 players**: Extend to N players with color assignment, spawn point distribution
- **Lobby / room system**: Multiple concurrent games on one server
- **Latency compensation**: Interpolation smoothing for remote ships, possible client-side prediction
- **Reconnection handling**: Graceful reconnect after disconnect, state recovery
- **Server deployment guide**: Instructions for hosting on Fly.io, Railway, or similar
- **Configurable key bindings**: Let players remap controls
- **Game-global Lua scripting**: Shared scripts that define scenarios, spawn obstacles, control AI ships, or set custom rules — runs on all clients or on a host
- **Spectator mode**: Watch a game without controlling a ship
