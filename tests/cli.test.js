import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { join } from 'path';
import { readFileSync } from 'fs';

const ROOT = join(import.meta.dirname, '..');
const BIN = join(ROOT, 'bin', 'spacewar');
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

describe('CLI', () => {
  it('--version prints the package version', () => {
    const output = execFileSync('node', [BIN, '--version'], { encoding: 'utf8' }).trim();
    expect(output).toBe(version);
  });

  it('-v prints the package version', () => {
    const output = execFileSync('node', [BIN, '-v'], { encoding: 'utf8' }).trim();
    expect(output).toBe(version);
  });
});
