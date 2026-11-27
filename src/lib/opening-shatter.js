
const DURATION = 860;

// Triangulate a shared grid so the fragments form one continuous picture at rest.
function fragments(width, height, origin) {
  const columns = width > height ? 9 : 5;
  const rows = width > height ? 5 : 9;
  const cellW = width / columns;
  const cellH = height / rows;
  const points = Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: columns + 1 }, (_, col) => [
      (col + (col && col < columns ? (Math.random() - 0.5) * 0.62 : 0)) * cellW,
      (row + (row && row < rows ? (Math.random() - 0.5) * 0.62 : 0)) * cellH,
    ]));
  const pieces = [];
  const reach = Math.max(width, height);
  function add(vertices) {
    const cx = vertices.reduce((sum, point) => sum + point[0], 0) / 3;
    const cy = vertices.reduce((sum, point) => sum + point[1], 0) / 3;
    const angle = Math.atan2(cy - origin.y, cx - origin.x) + (Math.random() - 0.5) * 0.9;
    const distance = reach * (0.09 + Math.random() * 0.23);
    const xValues = vertices.map(point => point[0]);
    const yValues = vertices.map(point => point[1]);
    const x = Math.min(...xValues), y = Math.min(...yValues);
    const w = Math.max(...xValues) - x, h = Math.max(...yValues) - y;
    pieces.push({
      vertices, cx, cy, x, y, w, h,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      rotation: (Math.random() - 0.5) * 0.8,
      depth: 0.82 + Math.random() * 0.33,
      delay: Math.min(0.21, Math.hypot(cx - origin.x, cy - origin.y) / reach * 0.18),
    });
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const [a, b] = points[row].slice(col, col + 2);
      const [c, d] = points[row + 1].slice(col, col + 2);
      if ((row + col) % 2) { add([a, b, c]); add([b, c, d]); }
      else { add([a, b, d]); add([a, c, d]); }
    }
  }
  return pieces;
}

export function shatterPhoto(canvas, image, position, point, finished) {
  const { width, height } = image.getBoundingClientRect();
  const context = canvas.getContext('2d', { alpha: true });
  if (!context || !width || !height || !image.naturalWidth) return null;
  const density = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1500000 / (width * height)));
  canvas.width = Math.ceil(width * density);
  canvas.height = Math.ceil(height * density);
  const source = document.createElement('canvas');
  source.width = canvas.width;
  source.height = canvas.height;
  const buffer = source.getContext('2d');
  if (!buffer) return null;

  // Prepare the cover crop once. Each fragment samples this same bitmap.
  const scale = Math.max(source.width / image.naturalWidth, source.height / image.naturalHeight);
  const imageWidth = image.naturalWidth * scale;
  const imageHeight = image.naturalHeight * scale;
  buffer.drawImage(image, (source.width - imageWidth) * position[0],
    (source.height - imageHeight) * position[1], imageWidth, imageHeight);

  const pieces = fragments(width, height, point);
  const sx = canvas.width / width;
  const sy = canvas.height / height;
  context.setTransform(sx, 0, 0, sy, 0, 0);
  context.drawImage(source, 0, 0, width, height);

  let frame = 0;
  const start = performance.now();
  function draw(now) {
    const progress = Math.min((now - start) / DURATION, 1);
    context.clearRect(0, 0, width, height);
    for (const piece of pieces) {
      const t = Math.max(0, (progress - piece.delay) / (1 - piece.delay));
      if (t >= 1) continue;
      const travel = 1 - (1 - t) ** 2;
      const depth = 1 + (piece.depth - 1) * travel;
      context.save();
      context.translate(piece.cx + piece.dx * travel, piece.cy + piece.dy * travel + t * t * 70);
      context.rotate(piece.rotation * travel);
      context.scale(depth, depth);
      context.translate(-piece.cx, -piece.cy);
      context.globalAlpha = 1 - Math.max(0, (t - 0.17) / 0.83) ** 1.5;
      context.beginPath();
      piece.vertices.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y));
      context.closePath();
      context.clip();
      const { x, y, w, h } = piece;
      context.drawImage(source, x * sx, y * sy, w * sx, h * sy, x, y, w, h);
      context.restore();
    }
    if (progress < 1) frame = requestAnimationFrame(draw);
    else finished();
  }
  frame = requestAnimationFrame(draw);
  const timeout = setTimeout(finished, DURATION + 150);
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(timeout);
    // Promptly release the canvases on mobile Safari.
    source.width = source.height = canvas.width = canvas.height = 1;
  };
}
