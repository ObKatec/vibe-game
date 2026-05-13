import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Gamepad2, Pause, Play, RotateCcw, Sparkles, UserRound } from 'lucide-react';

type BreakerPlayState = 'ready' | 'running' | 'paused' | 'cleared' | 'ended';
type BrickTrait = 'plain' | 'power' | 'burst' | 'deflect' | 'hidden' | 'locked' | 'key' | 'solid';
type BreakerPowerKind = 'wide' | 'multi' | 'slow' | 'laser';
type HorizontalKey = 'left' | 'right';

type Paddle = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type BreakerBall = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
};

type Brick = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  trait: BrickTrait;
  revealed: boolean;
};

type FallingPower = {
  id: number;
  kind: BreakerPowerKind;
  x: number;
  y: number;
  vy: number;
  r: number;
};

type BreakerEffect = {
  id: number;
  kind: 'burst' | 'laser' | 'hit';
  x: number;
  y: number;
  age: number;
  ttl: number;
  hue: number;
  x2?: number;
  y2?: number;
};

type BreakerGame = {
  paddle: Paddle;
  balls: BreakerBall[];
  bricks: Brick[];
  powers: FallingPower[];
  effects: BreakerEffect[];
  level: number;
  score: number;
  lives: number;
  elapsed: number;
  wideTimer: number;
  slowTimer: number;
  laserTimer: number;
  nextLaser: number;
  keysUnlocked: boolean;
};

const BREAKER_ARENA = { width: 920, height: 540 };
const basePaddleWidth = 126;
const horizontalKeyByCode: Record<string, HorizontalKey> = {
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

const brickHueByHp: Record<number, number> = {
  1: 188,
  2: 274,
  3: 48,
  4: 326,
};

const powerLabels: Record<BreakerPowerKind, string> = {
  wide: 'W',
  multi: 'M',
  slow: 'S',
  laser: 'L',
};

const powerNames: Record<BreakerPowerKind, string> = {
  wide: 'Wide paddle',
  multi: 'Multiball',
  slow: 'Slow field',
  laser: 'Laser paddle',
};

const emptyHorizontal = () => ({ left: false, right: false });

function levelStats(level: number) {
  const tier = Math.floor((level - 1) / 8);
  const patternIndex = (level - 1) % 8;
  const rows = Math.min(7, 4 + Math.floor((level + 1) / 3));
  const cols = Math.min(12, 8 + Math.floor((level + 2) / 3));
  const speed = Math.min(860, 300 + level * 28 + tier * 18);
  const dropRate = Math.max(0.1, 0.24 - level * 0.009);
  const hpBoost = Math.min(3, Math.floor((level + 2) / 5));
  return { tier, patternIndex, rows, cols, speed, dropRate, hpBoost };
}

function targetBricks(bricks: Brick[]) {
  return bricks.filter((brick) => brick.trait !== 'solid' && brick.hp > 0);
}

function brickHue(brick: Brick) {
  if (brick.trait === 'solid') return 220;
  return brickHueByHp[Math.max(1, Math.min(4, brick.hp))] ?? 326;
}

function createBreakerBall(x: number, y: number, speed: number, angle = -Math.PI / 2.8): BreakerBall {
  return {
    x,
    y,
    r: 8,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
  };
}

function brickExists(pattern: number, row: number, col: number, rows: number, cols: number) {
  const mid = (cols - 1) / 2;
  switch (pattern) {
    case 1:
      return col >= row && col < cols - row + 1;
    case 2:
      return Math.abs(col - mid) <= row + 1;
    case 3:
      return col < 3 || col > cols - 4;
    case 4:
      return row === 0 || row === rows - 1 || col === 0 || col === cols - 1 || (row > 1 && row < rows - 2 && col > 2 && col < cols - 3);
    case 5:
      return row < 2 || col < 2 || col > cols - 3;
    case 6:
      return Math.hypot((col - mid) / Math.max(1, cols / 2), (row - rows / 2) / Math.max(1, rows / 2)) < 0.9;
    case 7:
      return row % 2 === 0 || col === Math.floor(mid) || col === Math.ceil(mid);
    default:
      return true;
  }
}

function traitForCell(level: number, pattern: number, row: number, col: number, id: number): BrickTrait {
  if (level >= 8 && (row === 0 && (col === 1 || col === 2))) return 'key';
  if (level >= 8 && row > 1 && col % 4 === 1) return 'locked';
  if (level >= 7 && (row + col + level) % 11 === 0) return 'hidden';
  if (level >= 6 && (row * 2 + col + pattern) % 13 === 0) return 'deflect';
  if (level >= 4 && (row + col * 3 + level) % 10 === 0) return 'burst';
  if ((id + level) % Math.max(4, 8 - Math.floor(level / 4)) === 0) return 'power';
  return 'plain';
}

function hpForCell(level: number, row: number, col: number, boost: number) {
  let hp = 1;
  if (level >= 2 && (row + col + level) % 4 === 0) hp = 2;
  if (level >= 5 && (row * 2 + col + level) % 7 === 0) hp = 3;
  if (level >= 12 && (row + col * 2 + level) % 11 === 0) hp = 4;
  return Math.min(4, hp + (Math.random() < boost * 0.08 ? 1 : 0));
}

function buildLevel(level: number): Brick[] {
  const { rows, cols, patternIndex, hpBoost } = levelStats(level);
  const brickW = 54;
  const brickH = 18;
  const gap = 8;
  const startX = (BREAKER_ARENA.width - cols * brickW - (cols - 1) * gap) / 2;
  const startY = 84;
  const bricks: Brick[] = [];
  let id = 1;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!brickExists(patternIndex, row, col, rows, cols)) continue;
      const trait = traitForCell(level, patternIndex, row, col, id);
      const hp = hpForCell(level, row, col, hpBoost);
      bricks.push({
        id,
        x: startX + col * (brickW + gap),
        y: startY + row * (brickH + gap),
        w: brickW,
        h: brickH,
        hp,
        maxHp: hp,
        trait,
        revealed: trait !== 'hidden',
      });
      id += 1;
    }
  }

  if (level >= 4) {
    bricks.push({
      id: 9000 + level,
      x: BREAKER_ARENA.width / 2 - 22,
      y: patternIndex === 4 ? 252 : 286,
      w: 44,
      h: 114,
      hp: 999,
      maxHp: 999,
      trait: 'solid',
      revealed: true,
    });
  }
  if (level >= 6) {
    bricks.push({
      id: 9100 + level,
      x: patternIndex % 2 ? 232 : 644,
      y: 250,
      w: 82,
      h: 18,
      hp: 999,
      maxHp: 999,
      trait: 'solid',
      revealed: true,
    });
  }

  return bricks;
}

function newBreakerGame(level = 1, score = 0, lives = 3): BreakerGame {
  const speed = levelStats(level).speed;
  const paddle = { x: BREAKER_ARENA.width / 2 - basePaddleWidth / 2, y: 486, w: basePaddleWidth, h: 16 };
  return {
    paddle,
    balls: [createBreakerBall(paddle.x + paddle.w / 2, paddle.y - 14, speed)],
    bricks: buildLevel(level),
    powers: [],
    effects: [],
    level,
    score,
    lives,
    elapsed: 0,
    wideTimer: 0,
    slowTimer: 0,
    laserTimer: 0,
    nextLaser: 0,
    keysUnlocked: false,
  };
}

function clampSpeed(ball: BreakerBall, speed: number) {
  const length = Math.hypot(ball.vx, ball.vy) || 1;
  ball.vx = (ball.vx / length) * speed;
  ball.vy = (ball.vy / length) * speed;
}

function circleRectCollision(ball: BreakerBall, rect: { x: number; y: number; w: number; h: number }) {
  const closestX = Math.max(rect.x, Math.min(ball.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(ball.y, rect.y + rect.h));
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  if (dx * dx + dy * dy > ball.r * ball.r) return null;
  return { dx, dy };
}

function choosePowerKind(): BreakerPowerKind {
  const roll = Math.random();
  if (roll < 0.28) return 'wide';
  if (roll < 0.54) return 'multi';
  if (roll < 0.78) return 'slow';
  return 'laser';
}

function drawBrickTrait(ctx: CanvasRenderingContext2D, brick: Brick, time: number) {
  const cx = brick.x + brick.w / 2;
  const cy = brick.y + brick.h / 2;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(7, 7, 20, 0.5)';
  ctx.fillStyle = 'rgba(7, 7, 20, 0.42)';

  if (brick.trait === 'power') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx + 8, cy);
    ctx.lineTo(cx, cy + 6);
    ctx.lineTo(cx - 8, cy);
    ctx.closePath();
    ctx.stroke();
  }
  if (brick.trait === 'burst') {
    ctx.beginPath();
    ctx.moveTo(brick.x + 12, brick.y + 4);
    ctx.lineTo(cx - 3, cy);
    ctx.lineTo(cx + 5, cy + 4);
    ctx.lineTo(brick.x + brick.w - 10, brick.y + brick.h - 5);
    ctx.stroke();
  }
  if (brick.trait === 'deflect') {
    for (let i = -1; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(brick.x + 10 + i * 14, brick.y + brick.h - 3);
      ctx.lineTo(brick.x + 22 + i * 14, brick.y + 3);
      ctx.stroke();
    }
  }
  if (brick.trait === 'hidden') {
    ctx.globalAlpha = 0.35 + Math.sin(time * 4 + brick.id) * 0.12;
    for (let y = brick.y + 4; y < brick.y + brick.h; y += 5) {
      ctx.beginPath();
      ctx.moveTo(brick.x + 5, y);
      ctx.lineTo(brick.x + brick.w - 5, y);
      ctx.stroke();
    }
  }
  if (brick.trait === 'locked') {
    ctx.strokeRect(cx - 7, cy - 3, 14, 9);
    ctx.beginPath();
    ctx.arc(cx, cy - 3, 5, Math.PI, 0);
    ctx.stroke();
  }
  if (brick.trait === 'key') {
    ctx.beginPath();
    ctx.arc(cx - 4, cy, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 12, cy);
    ctx.moveTo(cx + 8, cy);
    ctx.lineTo(cx + 8, cy + 5);
    ctx.stroke();
  }
  if (brick.trait === 'solid') {
    ctx.strokeStyle = 'rgba(148, 249, 255, 0.5)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let x = brick.x + 8; x < brick.x + brick.w; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, brick.y + 3);
      ctx.lineTo(x - 10, brick.y + brick.h - 3);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawBreakerArena(ctx: CanvasRenderingContext2D, game: BreakerGame, state: BreakerPlayState) {
  ctx.clearRect(0, 0, BREAKER_ARENA.width, BREAKER_ARENA.height);
  const bg = ctx.createLinearGradient(0, 0, BREAKER_ARENA.width, BREAKER_ARENA.height);
  bg.addColorStop(0, '#090b20');
  bg.addColorStop(0.55, '#101632');
  bg.addColorStop(1, '#17081a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, BREAKER_ARENA.width, BREAKER_ARENA.height);

  ctx.save();
  ctx.strokeStyle = 'rgba(0, 245, 255, 0.1)';
  ctx.lineWidth = 1;
  for (let x = 30; x < BREAKER_ARENA.width; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, BREAKER_ARENA.height);
    ctx.stroke();
  }
  for (let y = 26; y < BREAKER_ARENA.height; y += 46) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(BREAKER_ARENA.width, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(0, 245, 255, 0.7)';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 18;
  ctx.strokeRect(10, 10, BREAKER_ARENA.width - 20, BREAKER_ARENA.height - 20);
  ctx.shadowBlur = 0;

  game.bricks.forEach((brick) => {
    if (brick.hp <= 0) return;
    const hue = brickHue(brick);
    ctx.save();
    ctx.shadowColor = `hsl(${hue}, 100%, 58%)`;
    ctx.shadowBlur = brick.trait === 'solid' ? 8 : 15;
    ctx.fillStyle = brick.trait === 'solid' ? 'rgba(42, 50, 76, 0.9)' : `hsla(${hue}, 100%, 58%, ${brick.revealed ? 0.78 : 0.26})`;
    ctx.strokeStyle = brick.trait === 'solid' ? 'rgba(148, 249, 255, 0.46)' : `hsla(${hue}, 100%, 74%, 0.9)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (brick.revealed || brick.trait === 'solid') drawBrickTrait(ctx, brick, game.elapsed);
  });

  game.powers.forEach((power) => {
    const hue = power.kind === 'laser' ? 326 : power.kind === 'slow' ? 48 : power.kind === 'multi' ? 274 : 188;
    ctx.save();
    ctx.shadowColor = `hsl(${hue}, 100%, 58%)`;
    ctx.shadowBlur = 20;
    ctx.fillStyle = `hsla(${hue}, 100%, 58%, 0.18)`;
    ctx.strokeStyle = `hsl(${hue}, 100%, 66%)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(power.x, power.y, power.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `hsl(${hue}, 100%, 72%)`;
    ctx.font = '900 13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(powerLabels[power.kind], power.x, power.y + 5);
    ctx.restore();
  });

  game.effects.forEach((effect) => {
    const progress = Math.min(effect.age / effect.ttl, 1);
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = `hsl(${effect.hue}, 100%, 64%)`;
    ctx.lineWidth = effect.kind === 'laser' ? 4 : 3;
    ctx.shadowColor = `hsl(${effect.hue}, 100%, 58%)`;
    ctx.shadowBlur = 18;
    if (effect.kind === 'laser' && effect.x2 !== undefined && effect.y2 !== undefined) {
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(effect.x2, effect.y2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 18 + progress * 42, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  });

  game.balls.forEach((ball) => {
    const glow = ctx.createRadialGradient(ball.x, ball.y, 1, ball.x, ball.y, ball.r * 4);
    glow.addColorStop(0, 'rgba(255,255,255,0.96)');
    glow.addColorStop(0.35, 'rgba(0,245,255,0.48)');
    glow.addColorStop(1, 'rgba(0,245,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f7fbff';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
  });

  const paddleHue = game.laserTimer > 0 ? 326 : game.wideTimer > 0 ? 48 : 188;
  ctx.save();
  ctx.shadowColor = `hsl(${paddleHue}, 100%, 58%)`;
  ctx.shadowBlur = 24;
  ctx.fillStyle = `hsl(${paddleHue}, 100%, 55%)`;
  ctx.strokeStyle = '#f7fbff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(game.paddle.x, game.paddle.y, game.paddle.w, game.paddle.h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(247, 251, 255, 0.88)';
  ctx.font = '800 18px Inter, system-ui, sans-serif';
  ctx.fillText(`SCORE ${game.score}`, 28, 42);
  ctx.fillStyle = '#94f9ff';
  ctx.font = '900 13px Inter, system-ui, sans-serif';
  ctx.fillText(`LEVEL ${game.level}`, 28, 66);
  ctx.fillStyle = 'rgba(247, 251, 255, 0.88)';
  ctx.font = '900 16px Inter, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`LIVES ${game.lives}`, BREAKER_ARENA.width - 28, 42);
  ctx.textAlign = 'left';

  const activePowers = [
    game.wideTimer > 0 ? `WIDE ${Math.ceil(game.wideTimer)}s` : '',
    game.slowTimer > 0 ? `SLOW ${Math.ceil(game.slowTimer)}s` : '',
    game.laserTimer > 0 ? `LASER ${Math.ceil(game.laserTimer)}s` : '',
  ].filter(Boolean);
  if (activePowers.length) {
    ctx.fillStyle = '#ffe074';
    ctx.font = '900 13px Inter, system-ui, sans-serif';
    ctx.fillText(activePowers.join('  /  '), 28, BREAKER_ARENA.height - 28);
  }

  if (state === 'paused') {
    ctx.fillStyle = 'rgba(7, 7, 20, 0.58)';
    ctx.fillRect(0, 0, BREAKER_ARENA.width, BREAKER_ARENA.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f7fbff';
    ctx.font = '900 42px Inter, system-ui, sans-serif';
    ctx.fillText('PAUSED', BREAKER_ARENA.width / 2, BREAKER_ARENA.height / 2 - 8);
    ctx.font = '700 16px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#94f9ff';
    ctx.fillText('Press Space to continue. R to restart.', BREAKER_ARENA.width / 2, BREAKER_ARENA.height / 2 + 30);
    ctx.textAlign = 'left';
  }
}

export function NeonBreaker({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef(emptyHorizontal());
  const stateRef = useRef<BreakerPlayState>('ready');
  const gameRef = useRef<BreakerGame>(newBreakerGame());
  const powerIdRef = useRef(1);
  const effectIdRef = useRef(1);
  const [playState, setPlayState] = useState<BreakerPlayState>('ready');
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [bestLevel, setBestLevel] = useState(1);
  const showOverlay = playState === 'ready' || playState === 'cleared' || playState === 'ended';

  useEffect(() => {
    setBestLevel(Number(localStorage.getItem('neon-breaker-best-level') || 1));
  }, []);

  useEffect(() => {
    stateRef.current = playState;
    if (playState !== 'running') keysRef.current = emptyHorizontal();
  }, [playState]);

  const syncHud = () => {
    setScore(gameRef.current.score);
    setLevel(gameRef.current.level);
  };

  const updateBestLevel = (clearedLevel: number) => {
    const previous = Number(localStorage.getItem('neon-breaker-best-level') || 1);
    const next = Math.max(previous, clearedLevel);
    localStorage.setItem('neon-breaker-best-level', String(next));
    setBestLevel(next);
  };

  const resetRun = () => {
    const nextLevel = Math.max(1, Math.min(99, Math.round(selectedLevel || 1)));
    gameRef.current = newBreakerGame(nextLevel, 0, 3);
    keysRef.current = emptyHorizontal();
    syncHud();
    setPlayState('ready');
  };

  const startRun = () => {
    if (stateRef.current === 'cleared') {
      const current = gameRef.current;
      const nextLevel = current.level + 1;
      gameRef.current = newBreakerGame(nextLevel, current.score + current.lives * 100, current.lives);
      setSelectedLevel(nextLevel);
      syncHud();
    }
    setPlayState('running');
  };

  const chooseLevel = (nextLevel: number) => {
    const safeLevel = Math.max(1, Math.min(99, Math.round(nextLevel || 1)));
    setSelectedLevel(safeLevel);
    gameRef.current = newBreakerGame(safeLevel, 0, 3);
    keysRef.current = emptyHorizontal();
    syncHud();
    setPlayState('ready');
  };

  const togglePlay = () => {
    if (stateRef.current === 'running') {
      setPlayState('paused');
      return;
    }
    if (stateRef.current === 'paused') {
      setPlayState('running');
      return;
    }
    if (stateRef.current === 'ended') resetRun();
    setPlayState('running');
  };

  const damageBrick = (game: BreakerGame, brick: Brick, amount = 1) => {
    if (brick.trait === 'solid') return;
    if (brick.trait === 'locked' && !game.keysUnlocked) {
      game.effects.push({ id: effectIdRef.current, kind: 'hit', x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, age: 0, ttl: 0.28, hue: 326 });
      effectIdRef.current += 1;
      return;
    }
    if (brick.trait === 'hidden' && !brick.revealed) {
      brick.revealed = true;
      game.score += 5;
      return;
    }
    brick.hp -= amount;
    game.score += 5;
    game.effects.push({ id: effectIdRef.current, kind: 'hit', x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, age: 0, ttl: 0.22, hue: brickHue(brick) });
    effectIdRef.current += 1;
    if (brick.hp > 0) return;

    brick.hp = 0;
    game.score += brick.maxHp * 10 + (brick.trait === 'key' ? 25 : 0);
    if (brick.trait === 'key') game.keysUnlocked = true;
    if (brick.trait === 'power' || Math.random() < levelStats(game.level).dropRate) {
      game.powers.push({
        id: powerIdRef.current,
        kind: choosePowerKind(),
        x: brick.x + brick.w / 2,
        y: brick.y + brick.h / 2,
        vy: 150,
        r: 16,
      });
      powerIdRef.current += 1;
    }
    if (brick.trait === 'burst') {
      game.effects.push({ id: effectIdRef.current, kind: 'burst', x: brick.x + brick.w / 2, y: brick.y + brick.h / 2, age: 0, ttl: 0.55, hue: 326 });
      effectIdRef.current += 1;
      game.bricks.forEach((other) => {
        if (other.id === brick.id || other.trait === 'solid' || other.hp <= 0) return;
        const close = Math.abs(other.x - brick.x) <= brick.w + 10 && Math.abs(other.y - brick.y) <= brick.h + 10;
        if (close) {
          other.revealed = true;
          other.hp -= 1;
          if (other.hp <= 0) {
            other.hp = 0;
            game.score += Math.ceil(other.maxHp * 5);
          }
        }
      });
    }
  };

  const applyPower = (game: BreakerGame, kind: BreakerPowerKind) => {
    game.score += 5;
    if (kind === 'wide') game.wideTimer = 12;
    if (kind === 'slow') game.slowTimer = 8;
    if (kind === 'laser') game.laserTimer = 10;
    if (kind === 'multi') {
      const seeds = game.balls.slice(0, 2);
      seeds.forEach((ball) => {
        const speed = Math.hypot(ball.vx, ball.vy);
        game.balls.push(createBreakerBall(ball.x, ball.y, speed, Math.atan2(ball.vy, ball.vx) - 0.55));
        game.balls.push(createBreakerBall(ball.x, ball.y, speed, Math.atan2(ball.vy, ball.vx) + 0.55));
      });
      game.balls = game.balls.slice(0, 6);
    }
  };

  useEffect(() => {
    const clearKeys = () => {
      keysRef.current = emptyHorizontal();
    };
    const down = (event: KeyboardEvent) => {
      const key = horizontalKeyByCode[event.code];
      if (key) {
        event.preventDefault();
        keysRef.current[key] = true;
      }
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        togglePlay();
      }
      if (event.code === 'KeyR' && !event.repeat) resetRun();
    };
    const up = (event: KeyboardEvent) => {
      const key = horizontalKeyByCode[event.code];
      if (!key) return;
      event.preventDefault();
      keysRef.current[key] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', clearKeys);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', clearKeys);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;
      const game = gameRef.current;

      if (stateRef.current === 'running') {
        game.elapsed += dt;
        const move = (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0);
        const paddleSpeed = 540 + Math.min(90, game.level * 5);
        game.paddle.w = game.wideTimer > 0 ? basePaddleWidth * 1.45 : basePaddleWidth;
        game.paddle.x = Math.max(24, Math.min(BREAKER_ARENA.width - 24 - game.paddle.w, game.paddle.x + move * paddleSpeed * dt));
        game.wideTimer = Math.max(0, game.wideTimer - dt);
        game.slowTimer = Math.max(0, game.slowTimer - dt);
        game.laserTimer = Math.max(0, game.laserTimer - dt);
        game.nextLaser = Math.max(0, game.nextLaser - dt);

        if (game.laserTimer > 0 && game.nextLaser <= 0) {
          game.nextLaser = 0.55;
          const laserX = game.paddle.x + game.paddle.w / 2;
          const target = game.bricks
            .filter((brick) => brick.hp > 0 && brick.trait !== 'solid' && laserX >= brick.x && laserX <= brick.x + brick.w)
            .sort((a, b) => b.y - a.y)[0];
          game.effects.push({ id: effectIdRef.current, kind: 'laser', x: laserX, y: game.paddle.y, x2: laserX, y2: target ? target.y + target.h : 18, age: 0, ttl: 0.22, hue: 326 });
          effectIdRef.current += 1;
          if (target) damageBrick(game, target, 1);
        }

        const targetSpeed = levelStats(game.level).speed * (game.slowTimer > 0 ? 0.75 : 1) * (1 + Math.min(game.elapsed / 60, 0.25));
        game.balls.forEach((ball) => {
          clampSpeed(ball, targetSpeed);
          ball.x += ball.vx * dt;
          ball.y += ball.vy * dt;
          if (ball.x < 22 + ball.r || ball.x > BREAKER_ARENA.width - 22 - ball.r) {
            ball.vx *= -1;
            ball.x = Math.max(22 + ball.r, Math.min(BREAKER_ARENA.width - 22 - ball.r, ball.x));
          }
          if (ball.y < 22 + ball.r) {
            ball.vy = Math.abs(ball.vy);
            ball.y = 22 + ball.r;
          }
          if (circleRectCollision(ball, game.paddle) && ball.vy > 0) {
            const offset = (ball.x - (game.paddle.x + game.paddle.w / 2)) / (game.paddle.w / 2);
            const angle = -Math.PI / 2 + offset * 0.95;
            ball.vx = Math.cos(angle) * targetSpeed;
            ball.vy = Math.sin(angle) * targetSpeed;
            ball.y = game.paddle.y - ball.r - 1;
          }

          for (const brick of game.bricks) {
            if (brick.hp <= 0) continue;
            const hit = circleRectCollision(ball, brick);
            if (!hit) continue;
            if (Math.abs(hit.dx) > Math.abs(hit.dy)) ball.vx *= -1;
            else ball.vy *= -1;
            if (brick.trait === 'deflect') {
              ball.vx += ball.vx > 0 ? 60 : -60;
              ball.vy -= 35;
            }
            damageBrick(game, brick, 1);
            break;
          }
        });

        game.balls = game.balls.filter((ball) => ball.y < BREAKER_ARENA.height + 50);
        if (game.balls.length === 0) {
          game.lives -= 1;
          if (game.lives <= 0) {
            setPlayState('ended');
          } else {
            const speed = levelStats(game.level).speed;
            game.balls = [createBreakerBall(game.paddle.x + game.paddle.w / 2, game.paddle.y - 14, speed)];
            setPlayState('ready');
          }
        }

        game.powers.forEach((power) => {
          power.y += power.vy * dt;
        });
        game.powers = game.powers.filter((power) => {
          const caught = power.y + power.r >= game.paddle.y && power.x >= game.paddle.x && power.x <= game.paddle.x + game.paddle.w;
          if (caught) {
            applyPower(game, power.kind);
            return false;
          }
          return power.y < BREAKER_ARENA.height + 40;
        });

        game.effects.forEach((effect) => {
          effect.age += dt;
        });
        game.effects = game.effects.filter((effect) => effect.age <= effect.ttl);

        if (targetBricks(game.bricks).length === 0) {
          updateBestLevel(game.level);
          setPlayState('cleared');
        }
        syncHud();
      }

      drawBreakerArena(ctx, game, stateRef.current);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <main className="shell game-shell">
      <nav className="topbar" aria-label="Game navigation">
        <button className="ghost-button" type="button" onClick={onBack}><ArrowLeft size={18} /> Lobby</button>
        <div className="brand"><Gamepad2 size={24} /> Neon Breaker</div>
        <div className="session"><UserRound size={18} /> Guest mode</div>
      </nav>

      <section className="game-layout">
        <aside className="control-panel" aria-label="Neon Breaker information">
          <div className="game-info">
            <p className="eyebrow"><Sparkles size={16} /> Neon Breaker</p>
            <p>Clear neon brick formations level by level. Brick color shows durability; textures reveal special behavior.</p>
          </div>

          <div className="best-card">
            <span>Best Level</span>
            <strong>{bestLevel}</strong>
            <small>Highest cleared level</small>
          </div>

          <dl className="keymap">
            <div><dt>Move</dt><dd>A / D / Arrow keys</dd></div>
            <div><dt>Launch / Pause</dt><dd>Space</dd></div>
            <div><dt>Restart</dt><dd>R</dd></div>
            <div><dt>Level Select</dt><dd>Before or after a run</dd></div>
            <div><dt>Goal</dt><dd>Clear every destructible brick</dd></div>
          </dl>
        </aside>

        <section className="arena-wrap" aria-label="Neon Breaker play area">
          <div className="arena-header">
            <div>
              <p className="status">Level mode</p>
              <h1>Break the neon wall.</h1>
            </div>
            <div className="arena-actions">
              <button type="button" onClick={togglePlay}>{playState === 'running' ? <Pause size={18} /> : <Play size={18} />} {playState === 'running' ? 'Pause' : 'Start'}</button>
              <button className="ghost-button icon-button" type="button" aria-label="Restart" onClick={resetRun}><RotateCcw size={18} /></button>
              <span className={`state-pill ${playState}`}>{playState}</span>
            </div>
          </div>
          <div className="stage">
            <canvas ref={canvasRef} width={BREAKER_ARENA.width} height={BREAKER_ARENA.height} aria-label="Neon Breaker canvas" />
            {showOverlay && (
              <div className="start-panel" aria-label="Neon Breaker run state">
                <div className="start-inner">
                  <p className="eyebrow"><Sparkles size={16} /> {playState === 'cleared' ? 'Level cleared' : playState === 'ended' ? 'Run ended' : 'Level run'}</p>
                  {playState === 'ready' && <h2>Clear every brick to reach the next level.</h2>}
                  {playState === 'cleared' && (
                    <div className="result-score">
                      <span>Level Complete</span>
                      <strong>{level}</strong>
                    </div>
                  )}
                  {playState === 'ended' && (
                    <div className="result-score">
                      <span>Reached Level</span>
                      <strong>{level}</strong>
                    </div>
                  )}
                  <div className="level-picker" aria-label="Choose Neon Breaker level">
                    <label htmlFor="breaker-level-select">Choose level</label>
                    <div className="level-picker-row">
                      <input
                        id="breaker-level-select"
                        type="number"
                        min="1"
                        max="99"
                        value={selectedLevel}
                        onChange={(event) => chooseLevel(Number(event.target.value))}
                      />
                      {[1, 5, 10, 15, 20].map((quickLevel) => (
                        <button
                          className={selectedLevel === quickLevel ? 'level-chip active' : 'level-chip'}
                          type="button"
                          key={quickLevel}
                          onClick={() => chooseLevel(quickLevel)}
                        >
                          L{quickLevel}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="panel-actions">
                    <p>Score: <strong>{score}</strong> / Best Level: <strong>{bestLevel}</strong></p>
                    <button type="button" onClick={playState === 'ended' ? resetRun : startRun}><Play size={18} /> {playState === 'cleared' ? 'Next Level' : playState === 'ended' ? 'Run Again' : 'Start Run'}</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
