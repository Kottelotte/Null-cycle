import { useEffect, useRef } from "react";

// ── Types & Constants ──────────────────────────────────────
const TILE = 32;
const COLS = 20;
const ROWS = 15;
const W = COLS * TILE;
const H = ROWS * TILE;
const GRAVITY = 0.5;
const SIGNAL_DECAY = 10;
const MIN_SPEED_MULT = 0.6;

let signalIntegrity = 100;

function getSpeedMultiplier(): number {
  return Math.max(MIN_SPEED_MULT, signalIntegrity / 100);
}

enum GameState { PLAYING }

// 1 = solid, 0 = air
const TILEMAP: number[][] = Array.from({ length: ROWS }, (_, r) =>
  Array.from({ length: COLS }, (_, c) => {
    if (r === ROWS - 1) return 1;                // ground
    if (r >= ROWS - 3 && (c === 0 || c === COLS - 1)) return 1; // walls
    if (r === ROWS - 4 && c >= 8 && c <= 12) return 1; // floating platform
    return 0;
  })
);

// ── Entity ─────────────────────────────────────────────────
interface Entity {
  x: number; y: number;
  vx: number; vy: number;
  w: number; h: number;
}

function createPlayer(index: number = 0): Entity {
  return { x: TILE * 2 + index * 20, y: TILE * (ROWS - 3), vx: 2, vy: 0, w: TILE - 4, h: TILE - 4 };
}

function isSolid(col: number, row: number): boolean {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return true;
  return TILEMAP[row][col] === 1;
}

function updateEntity(e: Entity): boolean {
  const mult = getSpeedMultiplier();
  // gravity
  e.vy += GRAVITY;

  // horizontal movement + collision
  e.x += e.vx * mult;
  const left = Math.floor(e.x / TILE);
  const right = Math.floor((e.x + e.w - 1) / TILE);
  const topR = Math.floor(e.y / TILE);
  const botR = Math.floor((e.y + e.h - 1) / TILE);

  for (let r = topR; r <= botR; r++) {
    if (e.vx > 0 && isSolid(right, r)) {
      e.x = right * TILE - e.w;
      e.vx *= -1;
      break;
    }
    if (e.vx < 0 && isSolid(left, r)) {
      e.x = (left + 1) * TILE;
      e.vx *= -1;
      break;
    }
  }

  // vertical movement + collision
  e.y += e.vy;
  const left2 = Math.floor(e.x / TILE);
  const right2 = Math.floor((e.x + e.w - 1) / TILE);
  const topR2 = Math.floor(e.y / TILE);
  const botR2 = Math.floor((e.y + e.h - 1) / TILE);

  for (let c = left2; c <= right2; c++) {
    if (e.vy > 0 && isSolid(c, botR2)) {
      e.y = botR2 * TILE - e.h;
      e.vy = 0;
      break;
    }
    if (e.vy < 0 && isSolid(c, topR2)) {
      e.y = (topR2 + 1) * TILE;
      e.vy = 0;
      break;
    }
  }

  // entity fell off screen?
  return e.y > H + TILE;
}

// ── Rendering ──────────────────────────────────────────────
function drawTiles(ctx: CanvasRenderingContext2D) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (TILEMAP[r][c] === 1) {
        ctx.fillStyle = "#5a5a3c";
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        ctx.strokeStyle = "#3e3e28";
        ctx.strokeRect(c * TILE, r * TILE, TILE, TILE);
      }
    }
  }
}

function drawEntity(ctx: CanvasRenderingContext2D, e: Entity) {
  ctx.fillStyle = "#e85d3a";
  ctx.fillRect(e.x, e.y, e.w, e.h);
}

function drawSignalBar(ctx: CanvasRenderingContext2D) {
  const barW = W - 20;
  ctx.fillStyle = "#333";
  ctx.fillRect(10, 6, barW, 10);
  ctx.fillStyle = "#4ae84a";
  ctx.fillRect(10, 6, barW * (signalIntegrity / 100), 10);
}
// ── React wrapper (thin shell) ─────────────────────────────
const Index = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = W;
    canvas.height = H;

    let state: GameState = GameState.PLAYING;
    const entities: Entity[] = Array.from({ length: 12 }, (_, i) => createPlayer(i));
    signalIntegrity = 100;
    let raf = 0;

    function loop() {
      // state machine
      switch (state) {
        case GameState.PLAYING:
          for (let i = entities.length - 1; i >= 0; i--) {
            const dead = updateEntity(entities[i]);
            if (dead) {
              entities.splice(i, 1);
              signalIntegrity = Math.max(0, signalIntegrity - SIGNAL_DECAY);
            }
          }
          break;
      }

      // render
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, W, H);
      drawTiles(ctx);
      for (const e of entities) drawEntity(ctx, e);
      drawSignalBar(ctx);

      raf = requestAnimationFrame(loop);
    }

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <canvas ref={canvasRef} style={{ imageRendering: "pixelated", border: "2px solid #333" }} />
    </div>
  );
};

export default Index;
