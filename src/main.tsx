import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, Gamepad2, Pause, Play, RotateCcw, Sparkles, UserRound } from 'lucide-react';
import './styles.css';

type DifficultyKey = 'easy' | 'normal' | 'hard';
type PlayState = 'ready' | 'running' | 'paused' | 'ended';
type BallKind = 'linear' | 'curve' | 'pulse';
type PowerUpKind = 'shield' | 'attack';
type EffectKind = 'shield' | 'attack';
type MovementKey = 'up' | 'down' | 'left' | 'right';

type DifficultyConfig = {
  label: string;
  detail: string;
  initialBalls: number;
  maxBalls: number;
  initialSpeed: number;
  maxSpeed: number;
  spawnEvery: number;
  speedRampSeconds: number;
  powerUpEvery: number;
  shipSpeed: number;
  typeWeights: Record<BallKind, number>;
};

type Ball = {
  x: number;
  y: number;
  r: number;
  baseR: number;
  vx: number;
  vy: number;
  hue: number;
  kind: BallKind;
  age: number;
  phase: number;
  turn: number;
};

type Player = {
  x: number;
  y: number;
  r: number;
  angle: number;
};

type PowerUp = {
  id: number;
  kind: PowerUpKind;
  x: number;
  y: number;
  r: number;
  age: number;
  ttl: number;
};

type Effect = {
  id: number;
  kind: EffectKind;
  x: number;
  y: number;
  age: number;
  ttl: number;
  hue: number;
};

type GameState = {
  player: Player;
  balls: Ball[];
  powerUps: PowerUp[];
  effects: Effect[];
  elapsed: number;
  nextSpawn: number;
  nextPowerUp: number;
  shield: boolean;
};

const ARENA = { width: 920, height: 540 };
const emptyMovement = (): Record<MovementKey, boolean> => ({ up: false, down: false, left: false, right: false });
const movementKeyByCode: Record<string, MovementKey> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

const difficulties: Record<DifficultyKey, DifficultyConfig> = {
  easy: {
    label: 'Cruise',
    detail: 'Room to learn the rhythm.',
    initialBalls: 3,
    maxBalls: 8,
    initialSpeed: 120,
    maxSpeed: 220,
    spawnEvery: 12,
    speedRampSeconds: 90,
    powerUpEvery: 10,
    shipSpeed: 340,
    typeWeights: { linear: 7, curve: 2, pulse: 1 },
  },
  normal: {
    label: 'Arcade',
    detail: 'The intended first-run challenge.',
    initialBalls: 5,
    maxBalls: 14,
    initialSpeed: 160,
    maxSpeed: 320,
    spawnEvery: 8,
    speedRampSeconds: 75,
    powerUpEvery: 12,
    shipSpeed: 360,
    typeWeights: { linear: 4, curve: 3, pulse: 3 },
  },
  hard: {
    label: 'Overdrive',
    detail: 'Fast balls, tight reactions.',
    initialBalls: 7,
    maxBalls: 22,
    initialSpeed: 210,
    maxSpeed: 430,
    spawnEvery: 5,
    speedRampSeconds: 60,
    powerUpEvery: 15,
    shipSpeed: 380,
    typeWeights: { linear: 2, curve: 4, pulse: 4 },
  },
};

const ballStyle: Record<BallKind, { hue: number; label: string }> = {
  linear: { hue: 188, label: 'Linear' },
  curve: { hue: 316, label: 'Curve' },
  pulse: { hue: 52, label: 'Pulse' },
};

const games = [
  { title: 'Neon Dodge', status: 'Playable', description: 'Pilot a neon ship through ricocheting energy balls across selectable difficulty lanes.' },
  { title: 'Pulse Click', status: 'Planned', description: 'Hit the signal at the exact neon beat.' },
  { title: 'Memory Grid', status: 'Planned', description: 'Flip, remember, and clear the arcade board.' },
];

function pickWeightedKind(weights: Record<BallKind, number>): BallKind {
  const total = weights.linear + weights.curve + weights.pulse;
  let roll = Math.random() * total;
  for (const kind of Object.keys(weights) as BallKind[]) {
    roll -= weights[kind];
    if (roll <= 0) return kind;
  }
  return 'linear';
}

function currentTargetSpeed(config: DifficultyConfig, elapsed: number) {
  const progress = Math.min(elapsed / config.speedRampSeconds, 1);
  return config.initialSpeed + (config.maxSpeed - config.initialSpeed) * progress;
}

function createBall(index: number, config: DifficultyConfig, elapsed = 0, avoidX = ARENA.width / 2, avoidY = ARENA.height / 2): Ball {
  const kind = pickWeightedKind(config.typeWeights);
  let x = 80 + Math.random() * (ARENA.width - 160);
  let y = 70 + Math.random() * (ARENA.height - 140);
  if (Math.hypot(x - avoidX, y - avoidY) < 180) {
    x = index % 2 === 0 ? 95 : ARENA.width - 95;
    y = 85 + Math.random() * (ARENA.height - 170);
  }
  const angle = Math.random() * Math.PI * 2;
  const speed = currentTargetSpeed(config, elapsed) + Math.random() * 35 + index * 3;
  const baseR = kind === 'pulse' ? 16 : 13 + Math.random() * 7;
  return {
    x,
    y,
    r: baseR,
    baseR,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    hue: ballStyle[kind].hue,
    kind,
    age: 0,
    phase: Math.random() * Math.PI * 2,
    turn: Math.random() > 0.5 ? 1 : -1,
  };
}

function createPowerUp(id: number, config: DifficultyConfig): PowerUp {
  const kind: PowerUpKind = Math.random() < 0.56 ? 'shield' : 'attack';
  return {
    id,
    kind,
    x: 80 + Math.random() * (ARENA.width - 160),
    y: 80 + Math.random() * (ARENA.height - 160),
    r: 18,
    age: 0,
    ttl: config.label === 'Overdrive' ? 7 : 9,
  };
}

function createEffect(id: number, kind: EffectKind, x: number, y: number, hue: number): Effect {
  return { id, kind, x, y, age: 0, ttl: kind === 'attack' ? 0.58 : 0.75, hue };
}

function newGame(config: DifficultyConfig): GameState {
  const player: Player = { x: ARENA.width / 2, y: ARENA.height / 2, r: 16, angle: 0 };
  return {
    player,
    balls: Array.from({ length: config.initialBalls }, (_, index) => createBall(index, config, 0, player.x, player.y)),
    powerUps: [],
    effects: [],
    elapsed: 0,
    nextSpawn: config.spawnEvery,
    nextPowerUp: 4 + Math.random() * config.powerUpEvery,
    shield: false,
  };
}

function normalizeVelocity(ball: Ball, speed: number) {
  const length = Math.hypot(ball.vx, ball.vy) || 1;
  ball.vx = (ball.vx / length) * speed;
  ball.vy = (ball.vy / length) * speed;
}

function drawShieldIcon(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.beginPath();
  ctx.moveTo(x, y - 12 * scale);
  ctx.lineTo(x + 11 * scale, y - 6 * scale);
  ctx.lineTo(x + 8 * scale, y + 9 * scale);
  ctx.lineTo(x, y + 15 * scale);
  ctx.lineTo(x - 8 * scale, y + 9 * scale);
  ctx.lineTo(x - 11 * scale, y - 6 * scale);
  ctx.closePath();
}

function drawSwordIcon(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.beginPath();
  ctx.moveTo(x + 11 * scale, y - 13 * scale);
  ctx.lineTo(x + 14 * scale, y - 10 * scale);
  ctx.lineTo(x - 3 * scale, y + 7 * scale);
  ctx.lineTo(x - 7 * scale, y + 3 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x - 10 * scale, y + 6 * scale, 16 * scale, 4 * scale);
  ctx.fillRect(x - 13 * scale, y + 10 * scale, 5 * scale, 5 * scale);
}

function drawArena(ctx: CanvasRenderingContext2D, game: GameState, score: number, state: PlayState) {
  ctx.clearRect(0, 0, ARENA.width, ARENA.height);

  const bg = ctx.createLinearGradient(0, 0, ARENA.width, ARENA.height);
  bg.addColorStop(0, '#090b20');
  bg.addColorStop(0.55, '#101632');
  bg.addColorStop(1, '#160719');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);

  ctx.save();
  ctx.strokeStyle = 'rgba(0, 245, 255, 0.1)';
  ctx.lineWidth = 1;
  for (let x = 30; x < ARENA.width; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ARENA.height);
    ctx.stroke();
  }
  for (let y = 26; y < ARENA.height; y += 46) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(ARENA.width, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(0, 245, 255, 0.7)';
  ctx.lineWidth = 3;
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 18;
  ctx.strokeRect(10, 10, ARENA.width - 20, ARENA.height - 20);
  ctx.shadowBlur = 0;

  game.powerUps.forEach((powerUp) => {
    const hue = powerUp.kind === 'shield' ? 188 : 46;
    const pulse = 1 + Math.sin(powerUp.age * 5) * 0.08;
    ctx.save();
    ctx.translate(powerUp.x, powerUp.y);
    ctx.scale(pulse, pulse);
    ctx.shadowColor = `hsl(${hue}, 100%, 58%)`;
    ctx.shadowBlur = 20;
    ctx.fillStyle = `hsla(${hue}, 100%, 58%, 0.18)`;
    ctx.strokeStyle = `hsl(${hue}, 100%, 66%)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, powerUp.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `hsl(${hue}, 100%, 70%)`;
    if (powerUp.kind === 'shield') {
      drawShieldIcon(ctx, 0, -1, 0.82);
      ctx.fill();
    } else {
      drawSwordIcon(ctx, 0, 0, 0.75);
    }
    ctx.restore();
  });

  game.balls.forEach((ball) => {
    const glow = ctx.createRadialGradient(ball.x, ball.y, 2, ball.x, ball.y, ball.r * 3.2);
    glow.addColorStop(0, `hsla(${ball.hue}, 100%, 72%, 0.95)`);
    glow.addColorStop(0.35, `hsla(${ball.hue}, 100%, 56%, 0.38)`);
    glow.addColorStop(1, `hsla(${ball.hue}, 100%, 50%, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r * 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `hsl(${ball.hue}, 100%, 66%)`;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(7, 7, 20, 0.5)';
    ctx.font = '900 10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(ballStyle[ball.kind].label[0], ball.x, ball.y + 3);
    ctx.textAlign = 'left';
  });

  game.effects.forEach((effect) => {
    const progress = Math.min(effect.age / effect.ttl, 1);
    const radius = 18 + progress * 58;
    const alpha = 1 - progress;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = `hsl(${effect.hue}, 100%, 64%)`;
    ctx.lineWidth = effect.kind === 'attack' ? 5 : 3;
    ctx.shadowColor = `hsl(${effect.hue}, 100%, 58%)`;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    if (effect.kind === 'attack') {
      for (let i = 0; i < 9; i += 1) {
        const angle = (Math.PI * 2 * i) / 9 + progress;
        ctx.beginPath();
        ctx.moveTo(effect.x + Math.cos(angle) * 8, effect.y + Math.sin(angle) * 8);
        ctx.lineTo(effect.x + Math.cos(angle) * (radius + 18), effect.y + Math.sin(angle) * (radius + 18));
        ctx.stroke();
      }
    }
    ctx.restore();
  });

  const { player } = game;
  if (game.shield) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.92)';
    ctx.shadowColor = '#00f5ff';
    ctx.shadowBlur = 24;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 29 + Math.sin(game.elapsed * 5) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#d8fdff';
  ctx.strokeStyle = '#00f5ff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(18, 18);
  ctx.lineTo(0, 10);
  ctx.lineTo(-18, 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = '#ff2bd6';
  ctx.fillStyle = '#ff2bd6';
  ctx.fillRect(-5, 18, 10, 12);
  ctx.restore();

  ctx.fillStyle = 'rgba(247, 251, 255, 0.88)';
  ctx.font = '800 18px Inter, system-ui, sans-serif';
  ctx.fillText(`SCORE ${score}`, 28, 42);
  ctx.fillStyle = game.shield ? '#94f9ff' : 'rgba(211, 216, 255, 0.48)';
  ctx.font = '900 13px Inter, system-ui, sans-serif';
  ctx.fillText(`SHIELD ${game.shield ? 'ON' : 'OFF'}`, 28, 66);

  if (state === 'paused') {
    ctx.fillStyle = 'rgba(7, 7, 20, 0.58)';
    ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f7fbff';
    ctx.font = '900 42px Inter, system-ui, sans-serif';
    ctx.fillText('PAUSED', ARENA.width / 2, ARENA.height / 2 - 8);
    ctx.font = '700 16px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#94f9ff';
    ctx.fillText('Press Space to continue. R to restart.', ARENA.width / 2, ARENA.height / 2 + 30);
    ctx.textAlign = 'left';
  }
}

function App() {
  const [activeGame, setActiveGame] = useState<string | null>(null);

  if (activeGame === 'Neon Dodge') {
    return <NeonDodge onBack={() => setActiveGame(null)} />;
  }

  return (
    <main className="shell">
      <nav className="topbar" aria-label="Main navigation">
        <div className="brand"><Gamepad2 size={24} /> Vibe Game</div>
        <div className="session"><UserRound size={18} /> Guest mode</div>
      </nav>

      <section className="hero" aria-labelledby="title">
        <p className="eyebrow"><Sparkles size={16} /> Neon arcade collection</p>
        <h1 id="title">Vibe Game</h1>
        <p className="lede">A desktop-first game hub for quick playable experiments, guest access, and future sign-in features.</p>
      </section>

      <section className="library" aria-label="Game library">
        {games.map((game) => (
          <article className="game-card" key={game.title}>
            <div>
              <p className="status">{game.status}</p>
              <h2>{game.title}</h2>
              <p>{game.description}</p>
            </div>
            <button type="button" onClick={() => game.title === 'Neon Dodge' && setActiveGame(game.title)} disabled={game.status !== 'Playable'}>
              {game.status === 'Playable' ? 'Play' : 'Soon'}
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}

function NeonDodge({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const movementRef = useRef<Record<MovementKey, boolean>>(emptyMovement());
  const gameRef = useRef<GameState>(newGame(difficulties.normal));
  const stateRef = useRef<PlayState>('ready');
  const difficultyRef = useRef<DifficultyKey>('normal');
  const effectIdRef = useRef(1);
  const powerUpIdRef = useRef(1);
  const [difficulty, setDifficulty] = useState<DifficultyKey>('normal');
  const [playState, setPlayState] = useState<PlayState>('ready');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const config = useMemo(() => difficulties[difficulty], [difficulty]);
  const showDifficultyOverlay = playState === 'ready' || playState === 'ended';

  useEffect(() => {
    difficultyRef.current = difficulty;
    const stored = Number(localStorage.getItem(`neon-dodge-best-${difficulty}`) || 0);
    setBest(stored);
    gameRef.current = newGame(difficulties[difficulty]);
    movementRef.current = emptyMovement();
    setScore(0);
    setPlayState('ready');
  }, [difficulty]);

  useEffect(() => {
    stateRef.current = playState;
    if (playState !== 'running') {
      movementRef.current = emptyMovement();
    }
  }, [playState]);

  const finishRun = (finalScore: number) => {
    const key = `neon-dodge-best-${difficultyRef.current}`;
    const previous = Number(localStorage.getItem(key) || 0);
    if (finalScore > previous) {
      localStorage.setItem(key, String(finalScore));
      setBest(finalScore);
    }
    movementRef.current = emptyMovement();
    setPlayState('ended');
  };

  const resetRun = (nextState: PlayState = 'ready') => {
    gameRef.current = newGame(difficulties[difficultyRef.current]);
    movementRef.current = emptyMovement();
    setScore(0);
    setPlayState(nextState);
  };

  const startRun = () => resetRun('running');

  const selectDifficulty = (nextDifficulty: DifficultyKey) => {
    if (!showDifficultyOverlay) return;
    setDifficulty(nextDifficulty);
  };

  const triggerAttack = (game: GameState) => {
    if (game.balls.length === 0) return;
    const index = Math.floor(Math.random() * game.balls.length);
    const [target] = game.balls.splice(index, 1);
    game.effects.push(createEffect(effectIdRef.current, 'attack', target.x, target.y, target.hue));
    effectIdRef.current += 1;
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
    resetRun('running');
  };

  useEffect(() => {
    const clearMovement = () => {
      movementRef.current = emptyMovement();
    };
    const down = (event: KeyboardEvent) => {
      const movement = movementKeyByCode[event.code];
      if (movement) {
        event.preventDefault();
        movementRef.current[movement] = true;
        return;
      }
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        togglePlay();
      }
      if (event.code === 'KeyR' && !event.repeat) resetRun('running');
    };
    const up = (event: KeyboardEvent) => {
      const movement = movementKeyByCode[event.code];
      if (!movement) return;
      event.preventDefault();
      movementRef.current[movement] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clearMovement);
    document.addEventListener('visibilitychange', clearMovement);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clearMovement);
      document.removeEventListener('visibilitychange', clearMovement);
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
      const current = gameRef.current;
      const currentState = stateRef.current;
      const currentConfig = difficulties[difficultyRef.current];

      if (currentState === 'running') {
        const movement = movementRef.current;
        let dx = 0;
        let dy = 0;
        if (movement.left) dx -= 1;
        if (movement.right) dx += 1;
        if (movement.up) dy -= 1;
        if (movement.down) dy += 1;
        if (dx || dy) {
          const len = Math.hypot(dx, dy);
          const nx = dx / len;
          const ny = dy / len;
          current.player.x += nx * currentConfig.shipSpeed * dt;
          current.player.y += ny * currentConfig.shipSpeed * dt;
          current.player.angle = Math.atan2(ny, nx) + Math.PI / 2;
        }
        current.player.x = Math.max(28, Math.min(ARENA.width - 28, current.player.x));
        current.player.y = Math.max(30, Math.min(ARENA.height - 30, current.player.y));

        current.elapsed += dt;
        const nextScore = Math.floor(current.elapsed * 12);
        setScore(nextScore);

        if (current.elapsed >= current.nextSpawn && current.balls.length < currentConfig.maxBalls) {
          current.balls.push(createBall(current.balls.length, currentConfig, current.elapsed, current.player.x, current.player.y));
          current.nextSpawn += currentConfig.spawnEvery;
        }

        if (current.elapsed >= current.nextPowerUp && current.powerUps.length < 2) {
          current.powerUps.push(createPowerUp(powerUpIdRef.current, currentConfig));
          powerUpIdRef.current += 1;
          current.nextPowerUp += currentConfig.powerUpEvery + Math.random() * 4;
        }

        const targetSpeed = currentTargetSpeed(currentConfig, current.elapsed);
        current.balls.forEach((ball) => {
          ball.age += dt;
          normalizeVelocity(ball, targetSpeed + (ball.kind === 'curve' ? 18 : 0));
          if (ball.kind === 'curve') {
            const turnAmount = Math.sin(ball.age * 1.55 + ball.phase) * ball.turn * 1.65 * dt;
            const cos = Math.cos(turnAmount);
            const sin = Math.sin(turnAmount);
            const vx = ball.vx * cos - ball.vy * sin;
            const vy = ball.vx * sin + ball.vy * cos;
            ball.vx = vx;
            ball.vy = vy;
          }
          if (ball.kind === 'pulse') {
            ball.r = ball.baseR * (1 + Math.sin(ball.age * 3.4 + ball.phase) * 0.34);
          }
          ball.x += ball.vx * dt;
          ball.y += ball.vy * dt;
          if (ball.x < 22 + ball.r || ball.x > ARENA.width - 22 - ball.r) {
            ball.vx *= -1;
            ball.x = Math.max(22 + ball.r, Math.min(ARENA.width - 22 - ball.r, ball.x));
          }
          if (ball.y < 22 + ball.r || ball.y > ARENA.height - 22 - ball.r) {
            ball.vy *= -1;
            ball.y = Math.max(22 + ball.r, Math.min(ARENA.height - 22 - ball.r, ball.y));
          }
        });

        current.powerUps.forEach((powerUp) => {
          powerUp.age += dt;
        });
        current.powerUps = current.powerUps.filter((powerUp) => powerUp.age <= powerUp.ttl);

        current.effects.forEach((effect) => {
          effect.age += dt;
        });
        current.effects = current.effects.filter((effect) => effect.age <= effect.ttl);

        current.powerUps = current.powerUps.filter((powerUp) => {
          const picked = Math.hypot(powerUp.x - current.player.x, powerUp.y - current.player.y) < powerUp.r + current.player.r;
          if (!picked) return true;
          if (powerUp.kind === 'shield') {
            if (!current.shield) {
              current.shield = true;
              current.effects.push(createEffect(effectIdRef.current, 'shield', current.player.x, current.player.y, 188));
              effectIdRef.current += 1;
            }
          } else {
            triggerAttack(current);
          }
          return false;
        });

        const hitIndex = current.balls.findIndex((ball) => Math.hypot(ball.x - current.player.x, ball.y - current.player.y) < ball.r + current.player.r - 2);
        if (hitIndex >= 0) {
          const hitBall = current.balls[hitIndex];
          if (current.shield) {
            current.shield = false;
            current.effects.push(createEffect(effectIdRef.current, 'shield', current.player.x, current.player.y, 188));
            effectIdRef.current += 1;
            current.balls.splice(hitIndex, 1);
            current.effects.push(createEffect(effectIdRef.current, 'attack', hitBall.x, hitBall.y, hitBall.hue));
            effectIdRef.current += 1;
          } else {
            finishRun(nextScore);
          }
        }
      }

      drawArena(ctx, current, Math.floor(current.elapsed * 12), currentState);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <main className="shell game-shell">
      <nav className="topbar" aria-label="Game navigation">
        <button className="ghost-button" type="button" onClick={onBack}><ArrowLeft size={18} /> Lobby</button>
        <div className="brand"><Gamepad2 size={24} /> Neon Dodge</div>
        <div className="session"><UserRound size={18} /> Guest mode</div>
      </nav>

      <section className="game-layout">
        <aside className="control-panel" aria-label="Neon Dodge information">
          <div className="game-info">
            <p className="eyebrow"><Sparkles size={16} /> Neon Dodge</p>
            <p>Pilot a neon ship through ricocheting energy balls. Collect shields and sword strikes to survive the rising storm.</p>
          </div>

          <div className="best-card">
            <span>Best</span>
            <strong>{best}</strong>
            <small>{config.label} mode</small>
          </div>

          <dl className="keymap">
            <div><dt>Move</dt><dd>WASD / Arrow keys</dd></div>
            <div><dt>Start / Pause</dt><dd>Space</dd></div>
            <div><dt>Restart</dt><dd>R</dd></div>
            <div><dt>Items</dt><dd>Fly over shield or sword</dd></div>
          </dl>
        </aside>

        <section className="arena-wrap" aria-label="Neon Dodge play area">
          <div className="arena-header">
            <div>
              <p className="status">{config.label} mode</p>
              <h1>Outfly the neon storm.</h1>
            </div>
            <div className="arena-actions">
              <button type="button" onClick={togglePlay}>{playState === 'running' ? <Pause size={18} /> : <Play size={18} />} {playState === 'running' ? 'Pause' : 'Start'}</button>
              <button className="ghost-button icon-button" type="button" aria-label="Restart" onClick={() => resetRun('running')}><RotateCcw size={18} /></button>
              <span className={`state-pill ${playState}`}>{playState}</span>
            </div>
          </div>
          <div className="stage">
            <canvas ref={canvasRef} width={ARENA.width} height={ARENA.height} aria-label="Neon Dodge canvas" />
            {showDifficultyOverlay && (
              <div className="start-panel" aria-label="Choose Neon Dodge difficulty">
                <div className="start-inner">
                  <p className="eyebrow"><Sparkles size={16} /> {playState === 'ended' ? 'Run complete' : 'Choose your run'}</p>
                  {playState === 'ended' ? (
                    <div className="result-score">
                      <span>Score</span>
                      <strong>{score}</strong>
                    </div>
                  ) : (
                    <h2>Select difficulty before launch.</h2>
                  )}
                  <div className="mode-grid" role="group" aria-label="Difficulty options">
                    {(Object.keys(difficulties) as DifficultyKey[]).map((key) => (
                      <button
                        className={key === difficulty ? 'mode-card active' : 'mode-card'}
                        type="button"
                        key={key}
                        aria-pressed={key === difficulty}
                        onClick={() => selectDifficulty(key)}
                      >
                        <span>{difficulties[key].label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="panel-actions">
                    <p>Selected: <strong>{config.label}</strong></p>
                    <button type="button" onClick={startRun}><Play size={18} /> {playState === 'ended' ? 'Run Again' : 'Start Run'}</button>
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

createRoot(document.getElementById('root')!).render(<App />);
