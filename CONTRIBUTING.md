# Contributing

Thanks for your interest in contributing to Spacewar!

## Getting Started

1. Fork the repository and clone your fork
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the local dev server:

   ```bash
   npm run dev
   ```

4. Open http://localhost:8080 in your browser

## Development Workflow

### Running Tests

```bash
npm test             # Run all tests once
npm run test:watch   # Run tests in watch mode
```

### Linting

```bash
npm run lint
```

ESLint enforces semicolons, flags unused variables, and catches undeclared references. Fix any lint errors before submitting a PR.

### Multiplayer Testing

```bash
npm run serve        # Start the WebSocket server on localhost
```

Open multiple browser tabs to test multiplayer. See [MULTIPLAYER.md](MULTIPLAYER.md) for architecture details.

## Submitting Changes

1. Create a branch from `main`
2. Make your changes in small, focused commits
3. Ensure `npm run lint` and `npm test` both pass
4. Open a pull request against `main`

### Commit Messages

Write clear, descriptive commit messages. Use the imperative mood ("Add feature", not "Added feature"). Keep the subject line under 72 characters and add a body for non-trivial changes.

### Pull Requests

- Keep PRs focused on a single change
- Include a description of what changed and why
- Link any related issues
- PRs must pass CI (lint + tests) before merging

## Architecture Notes

- **No build step** -- the game runs as plain ES modules served over HTTP
- All modules use **dependency injection** for testability
- `src/` modules are shared between the browser client and Node server
- See the [README](README.md) for the full project structure

## Code Style

- 2-space indentation
- Single quotes
- Semicolons required (enforced by ESLint)
- Prefix intentionally unused parameters with `_`
