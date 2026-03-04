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
const EXIT_ZONE_W = 40;
const MAX_BLOCKS = 3;
const REQUIRED_TO_WIN = 7;
const TOTAL_ENTITIES = 12;
const SPAWN_INTERVAL_MS = 500;

let signalIntegrity = 100;
let runOver = false;
let rescuedCount = 0;
const placedBlocks = new Set<string>();

function getSpeedMultiplier(): number {
  return Math.max(MIN_SPEED_MULT, signalIntegrity / 100);
}

enum GameState { PLAYING }

// 1 = solid, 0 = air
// Layout (15 rows × 20 cols):
//  - Ground floor with a death pit (cols 9-11)
//  - Mid platform (row 11, cols 4-9) catches falling entities
//  - Upper platform (row 8, cols 10-16) leads toward exit
//  - Ramp/step at col 17-19 row 11 connects to ground near exit
const TILEMAP: number[][] = Array.from({ length: ROWS }, (_, r) =>
  Array.from({ length: COLS }, (_, c) => {
    // ground floor — gap at cols 9-11 = death pit
    if (r === ROWS - 1 && !(c >= 9 && c <= 11)) return 1;
    // mid-level platform
    if (r === 11 && c >= 4 && c <= 9) return 1;
    // upper platform toward exit
    if (r === 8 && c >= 10 && c <= 16) return 1;
    // step connecting upper area to ground near exit
    if (r === 11 && c >= 17 && c <= 19) return 1;
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
  const size = Math.round(TILE / 3);
  const baseSpeed = 2;
  const direction = Math.random() < 0.5 ? 1 : -1;
  const speedVariation = baseSpeed * (0.9 + Math.random() * 0.2); // ±10%
  return { x: TILE * 2 + index * 20, y: TILE * (ROWS - 3), vx: speedVariation * direction, vy: 0, w: size, h: size };
}

function isSolid(col: number, row: number): boolean {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  return TILEMAP[row][col] === 1 || placedBlocks.has(`${col},${row}`);
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

  // exit zone detection (right edge)
  if (e.x + e.w >= W - EXIT_ZONE_W) {
    rescuedCount++;
    return true; // remove entity, but caller must NOT reduce signal
  }

  // entity off screen?
  if (e.y > H + TILE || e.x + e.w < 0) return true; // dead
  return false;
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
  // draw placed blocks
  for (const key of placedBlocks) {
    const [c, r] = key.split(",").map(Number);
    ctx.fillStyle = "#7a6a4c";
    ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
    ctx.strokeStyle = "#3e3e28";
    ctx.strokeRect(c * TILE, r * TILE, TILE, TILE);
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

function drawDebugOverlay(ctx: CanvasRenderingContext2D) {
  const mult = getSpeedMultiplier();
  ctx.fillStyle = "#fff";
  ctx.font = "12px monospace";
  ctx.fillText(`Signal: ${signalIntegrity}  Speed: x${mult.toFixed(2)}  Rescued: ${rescuedCount}`, 10, 32);
}

function drawRunOverlay(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 24px monospace";
  ctx.textAlign = "center";
  ctx.fillText("Run complete", W / 2, H / 2 - 30);
  ctx.font = "16px monospace";
  ctx.fillText(`Rescued: ${rescuedCount} / ${TOTAL_ENTITIES}`, W / 2, H / 2 + 10);
  const won = rescuedCount >= REQUIRED_TO_WIN;
  ctx.fillStyle = won ? "#4ae84a" : "#e85d3a";
  ctx.fillText(`Required to win: ${REQUIRED_TO_WIN}  ${won ? "— SUCCESS" : "— FAILED"}`, W / 2, H / 2 + 40);
  ctx.textAlign = "start";
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
    const entities: Entity[] = [];
    let spawnedCount = 0;
    let lastSpawnTime = performance.now();
    signalIntegrity = 100;
    rescuedCount = 0;
    runOver = false;
    placedBlocks.clear();
    let raf = 0;

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const col = Math.floor((e.clientX - rect.left) * scaleX / TILE);
      const row = Math.floor((e.clientY - rect.top) * scaleY / TILE);
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS && TILEMAP[row][col] === 0 && placedBlocks.size < MAX_BLOCKS) {
        placedBlocks.add(`${col},${row}`);
      }
    };
    canvas.addEventListener("click", handleClick);

    function loop() {
      // state machine
      switch (state) {
        case GameState.PLAYING:
          if (!runOver) {
            // spawn entities one at a time
            const now = performance.now();
            if (spawnedCount < TOTAL_ENTITIES && now - lastSpawnTime >= SPAWN_INTERVAL_MS) {
              entities.push(createPlayer(spawnedCount));
              spawnedCount++;
              lastSpawnTime = now;
            }
            for (let i = entities.length - 1; i >= 0; i--) {
              const e = entities[i];
              const prevRescued = rescuedCount;
              const removed = updateEntity(e);
              if (removed) {
                entities.splice(i, 1);
                if (rescuedCount === prevRescued) {
                  signalIntegrity = Math.max(0, signalIntegrity - SIGNAL_DECAY);
                }
              }
            }
            if (entities.length === 0) {
              runOver = true;
            }
          }
          break;
      }

      // render
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, W, H);
      drawTiles(ctx);
      ctx.fillStyle = "rgba(74, 232, 74, 0.15)";
      ctx.fillRect(W - EXIT_ZONE_W, 0, EXIT_ZONE_W, H);
      for (const e of entities) drawEntity(ctx, e);
      drawSignalBar(ctx);
      drawDebugOverlay(ctx);
      if (runOver) drawRunOverlay(ctx);

      raf = requestAnimationFrame(loop);
    }

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("click", handleClick);
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <canvas ref={canvasRef} style={{ imageRendering: "pixelated", border: "2px solid #333" }} />
    </div>
  );
};

export default Index;
