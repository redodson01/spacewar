const MAX_MESSAGES = 20;
const FADE_DURATION = 5; // seconds before messages start fading
const FADE_TIME = 2; // seconds to fully fade out

export function createChat() {
  const messages = []; // { name, color, text, age }

  function addMessage(name, color, text) {
    messages.push({ name, color, text, age: 0 });
    if (messages.length > MAX_MESSAGES) {
      messages.shift();
    }
  }

  function update(dt) {
    for (const msg of messages) {
      msg.age += dt;
    }
    // Remove fully faded messages
    while (messages.length > 0 && messages[0].age > FADE_DURATION + FADE_TIME) {
      messages.shift();
    }
  }

  function draw(ctx, worldWidth, worldHeight) {
    if (messages.length === 0) return;

    ctx.font = '14px monospace';
    ctx.textAlign = 'left';

    let y = worldHeight - 15; // 15px padding from bottom border

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      let alpha = 1;
      if (msg.age > FADE_DURATION) {
        alpha = 1 - (msg.age - FADE_DURATION) / FADE_TIME;
      }
      if (alpha <= 0) continue;

      ctx.globalAlpha = alpha;
      ctx.shadowColor = msg.color;
      ctx.shadowBlur = 4;

      if (msg.name) {
        // Name in player color, message in base0
        ctx.fillStyle = msg.color;
        const nameStr = `${msg.name}: `;
        ctx.fillText(nameStr, 15, y);
        const nameWidth = ctx.measureText(nameStr).width;
        ctx.fillStyle = '#839496';
        ctx.fillText(msg.text, 15 + nameWidth, y);
      } else {
        // No name prefix — just the message in the color
        ctx.fillStyle = msg.color;
        ctx.fillText(msg.text, 15, y);
      }

      y -= 22;
      if (y < worldHeight / 2) break; // don't fill more than half the screen
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  return { addMessage, update, draw };
}
