# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Four dedicated input surfaces: Chat (Enter), Command bar (/), Lua bar (:), Script editor (backtick)
- `/color` command — any player can change their ship color (e.g. `/color #ff0`)
- Per-mode input history (chat, command, and Lua each have independent history with up/down arrows)
- Server-side `colorChange` and `setGameSpeed` message types with validation

### Changed

- Player 2 fire/join key changed from `/` to `.` (frees `/` for command bar)
- `/ai`, `/removeai`, `/speed` commands are now self-contained (no longer Lua wrappers)
- Commands no longer fall through to Lua — unknown commands show an error message

### Fixed

- `onUpdate` callbacks (e.g. rainbow color cycling) no longer killed when players join/leave or AI is added/removed

### Housekeeping

- CLI entry point (`bin/spacewar`) with `--version` flag
- Homebrew formula for `brew install` distribution
- GitHub Actions release workflow (tag → GitHub Release → Homebrew tap update)
- Contributing guide (`CONTRIBUTING.md`)
- EditorConfig for consistent formatting across editors
- README badges (CI, license, Node version)

## [1.0.0] - 2026-03-28

### Added

- Modular spaceship game with HTML5 Canvas
- Lua scripting engine with in-browser editor and REPL (via [Fengari](https://fengari.io/))
- Projectile shooting with spacebar and Lua `shoot()` API
- Ship explosions with particle effects and respawn
- Local two-player multiplayer (WASD + arrow keys)
- Networked multiplayer with WebSocket server (up to 8 players)
- In-game chat with `/commands` (`/name`, `/ai`, `/removeai`, `/speed`, `/help`)
- AI computer players (client-hosted and server-hosted)
- Server-side Lua REPL for game-global scripting
- dt-scaling for frame-rate-independent physics
- Game speed control (0.1x--10x)
- Latency measurement and per-player ping display
- Leaderboard with scores, names, and ping
- Configurable world size via server flags (`--width`, `--height`)
- Public URL tunneling for remote play (`--tunnel`)
- Server TUI with dashboard, colored event log, player list, and Lua REPL
- Script editor with persistent history across reloads (localStorage)
- Rate limiting (120 msg/s per client) and input validation
- Static file server with path traversal protection
- ESLint configuration and comprehensive test suite (251 tests, Vitest)
- GitHub Actions CI (lint + test)
- MIT License

[Unreleased]: https://github.com/redodson01/spacewar/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/redodson01/spacewar/releases/tag/v1.0.0
