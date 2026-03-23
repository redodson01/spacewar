export function createStars(width, height, count = 200) {
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    size: Math.random() * 1.5 + 0.5,
    brightness: Math.random(),
  }));
}

export function resizeStars(stars, width, height) {
  for (const star of stars) {
    star.x = Math.random() * width;
    star.y = Math.random() * height;
  }
}

export function drawStars(ctx, stars) {
  for (const star of stars) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + star.brightness * 0.7})`;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }
}
