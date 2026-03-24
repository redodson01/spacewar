export function createLeaderboard() {
  const entries = new Map(); // id -> { name, color, score }

  function addPlayer(id, name, color) {
    entries.set(id, { id, name, color, score: 0 });
  }

  function removePlayer(id) {
    entries.delete(id);
  }

  function updateColor(id, color) {
    const entry = entries.get(id);
    if (entry) entry.color = color;
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

  function setScores(scoreList) {
    for (const { id, score } of scoreList) {
      const entry = entries.get(id);
      if (entry) entry.score = score;
    }
  }

  function getScores() {
    return [...entries.values()].sort((a, b) => b.score - a.score || a.id - b.id);
  }

  function draw(ctx) {
    const scores = getScores();
    if (scores.length === 0) return;

    ctx.font = '18px monospace';
    ctx.textAlign = 'left';
    const x = 15;
    let y = 25;

    const col2 = x + 50;
    ctx.fillStyle = '#839496';
    ctx.shadowColor = '#839496';
    ctx.shadowBlur = 6;
    ctx.textAlign = 'right';
    ctx.fillText('SCORE', col2, y);
    ctx.textAlign = 'left';
    ctx.fillText('  PLAYER', col2, y);
    y += 20;

    for (const entry of scores) {
      ctx.fillStyle = entry.color;
      ctx.shadowColor = entry.color;
      const scoreStr = String(entry.score).padStart(4, ' ');
      ctx.textAlign = 'right';
      ctx.fillText(scoreStr, col2, y);
      ctx.textAlign = 'left';
      ctx.fillText(`  ${entry.name}`, col2, y);
      y += 18;
    }

    ctx.shadowBlur = 0;
  }

  return { addPlayer, removePlayer, updateColor, clear, recordKill, recordCollision, setScores, getScores, draw };
}
