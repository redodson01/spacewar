# Multiplayer Architecture

## Design Decisions

- **Networking**: WebSocket server with local multiplayer as fallback when no server is available
- **Authority model**: Client-authoritative — each client owns its own ship state; the server relays messages between clients
- **Projectile ownership**: Tracked via `ownerId`; any projectile can destroy any ship (friendly fire)
- **Lua scripting**: In network mode, the server runs the single authoritative Lua engine. In local mode, Fengari runs in-browser.
- **Wire protocol**: Ship state snapshots at 20Hz + discrete events for fire/death/respawn/chat

## Server (`server/index.js`)

A Node.js WebSocket + HTTP server (~575 lines):
- Assigns player IDs on connect, broadcasts join/leave events
- Relays game messages between clients (client-authoritative state)
- Runs a server-side Lua engine for game-global scripting
- Manages server-hosted AI opponents with full game loop (physics, collision, shooting)
- Tracks scores and broadcasts leaderboard updates
- Measures per-player latency via ping/pong
- Serves static files for the client

### Message Types

```
{type: 'state', id, x, y, angle, vx, vy, destroyed, thrusting}     -- 20Hz per player
{type: 'fire', id, x, y, angle, vx, vy}                               -- on each shot
{type: 'death', id, x, y, cause, killerId}                            -- triggers remote explosion
{type: 'respawn', id, x, y}                                           -- ship reappears
{type: 'join', id, name}                                              -- new player connected
{type: 'leave', id}                                                   -- player disconnected
{type: 'chat', text, name, color}                                     -- chat message
{type: 'nameChange', playerId, newName}                               -- player renamed
{type: 'aiJoin', aiId, name} / {type: 'aiLeave', aiId}               -- AI bot management
{type: 'luaExec', code, mode} / {type: 'luaOutput', text, isError}   -- Lua scripting (host only)
{type: 'luaUpdate', updates}                                          -- Lua config changes
{type: 'stateOverride', targetId, ...props}                           -- Lua state mutation
{type: 'gameSpeed', speed}                                            -- game speed change
{type: 'ping'} / {type: 'pong'}                                      -- latency measurement
{type: 'latency', id, rtt}                                            -- latency broadcast
{type: 'scores', scores}                                              -- leaderboard update
```

## Client (`src/net.js`)

A WebSocket client module:
- Connects to the server, sends local ship state + events, receives remote state
- Interpolates remote ship positions for smooth rendering
- Exposes callbacks for the game loop to consume

## Implemented Features

- WebSocket networking with automatic server discovery
- Up to 8 players (human + AI) per session
- Client-hosted and server-hosted AI opponents
- In-game chat with `/commands` (name, ai, removeai, speed, latency, help)
- Player usernames with `/name` command
- Score tracking and leaderboard display
- Server-side Lua engine for game-global scripting
- Latency measurement and display
- dt-scaling for frame-rate-independent physics
- Configurable world size via server flags

## Future Ideas

- **Lobby / room system**: Multiple concurrent games on one server
- **Reconnection handling**: Graceful reconnect after disconnect, state recovery
- **Server deployment guide**: Instructions for hosting on Fly.io, Railway, or similar
- **Configurable key bindings**: Let players remap controls
- **Spectator mode**: Watch a game without controlling a ship
