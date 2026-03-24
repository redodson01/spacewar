export function createLeaderboard() {
  const entries = new Map(); // id -> { name, color, score }

  function addPlayer(id, name, color) {
    entries.set(id, { name, color, score: 0 });
  }

  function removePlayer(id) {
    entries.delete(id);
  }

  function clear() {
    entries.clear();
  }

  function recordKill(killerId) {
    const entry = entries.get(killerId);
    if (entry) entry.score += 1;
  }

  function recordCollision(id1, id2) {
    const e1 = entries.get(id1);
    const e2 = entries.get(id2);
    if (e1) e1.score -= 1;
    if (e2) e2.score -= 1;
  }

  function getScores() {
    return [...entries.values()].sort((a, b) => b.score - a.score);
  }

  function draw(ctx) {
    const scores = getScores();
    if (scores.length === 0) return;

    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    const x = 15;
    let y = 25;

    ctx.fillStyle = '#888';
    ctx.fillText('SCORE', x, y);
    y += 20;

    for (const entry of scores) {
      ctx.fillStyle = entry.color;
      const scoreStr = String(entry.score).padStart(4, ' ');
      ctx.textAlign = 'right';
      ctx.fillText(scoreStr, x + 40, y);
      ctx.textAlign = 'left';
      ctx.fillText(`  ${entry.name}`, x + 40, y);
      y += 18;
    }
  }

  return { addPlayer, removePlayer, clear, recordKill, recordCollision, getScores, draw };
}
