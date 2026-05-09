import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, Gamepad2, Pause, Play, RotateCcw, Sparkles, UserRound } from 'lucide-react';
import './styles.css';

type DifficultyKey = 'easy' | 'normal' | 'hard';
type PlayState = 'ready' | 'running' | 'paused' | 'ended';

type Ball = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  hue: number;
};

type GameState = {
  player: { x: number; y: number; r: number };
  balls: Ball[];
  elapsed: number;
  nextSpawn: number;
};

const ARENA = { width: 920, height: 540 };

const difficulties: Record<DifficultyKey, { label: string; detail: string; balls: number; maxBalls: number; ballSpeed: number; spawnEvery: number; shipSpeed: number }> = {
  easy: { label: 'Cruise', detail: 'Room to learn the rhythm.', balls: 3, maxBalls: 6, ballSpeed: 130, spawnEvery: 13, shipSpeed: 340 },
  normal: { label: 'Arcade', detail: 'The intended first-run challenge.', balls: 5, maxBalls: 10, ballSpeed: 170, spawnEvery: 9, shipSpeed: 360 },
  hard: { label: 'Overdrive', detail: 'Fast balls, tight reactions.', balls: 7, maxBalls: 14, ballSpeed: 215, spawnEvery: 6, shipSpeed: 380 },
};

const games = [
  { title: 'Neon Dodge', status: 'Playable', description: 'Pilot a neon ship through ricocheting energy balls across selectable difficulty lanes.' },
  { title: 'Pulse Click', status: 'Planned', description: 'Hit the signal at the exact neon beat.' },
  { title: 'Memory Grid', status: 'Planned', description: 'Flip, remember, and clear the arcade board.' },
];

function createBall(index: number, config: (typeof difficulties)[DifficultyKey], avoidX = ARENA.width / 2, avoidY = ARENA.height / 2): Ball {
  let x = 80 + Math.random() * (ARENA.width - 160);
  let y = 70 + Math.random() * (ARENA.height - 140);
  if (Math.hypot(x - avoidX, y - avoidY) < 180) {
    x = index % 2 === 0 ? 95 : ARENA.width - 95;
    y = 85 + Math.random() * (ARENA.height - 170);
  }
  const angle = Math.random() * Math.PI * 2;
  const speed = config.ballSpeed + Math.random() * 55 + index * 4;
  return {
    x,
    y,
    r: 13 + Math.random() * 8,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    hue: [188, 316, 52, 270][index % 4],
  };
}

function newGame(config: (typeof difficulties)[DifficultyKey]): GameState {
  const player = { x: ARENA.width / 2, y: ARENA.height / 2, r: 16 };
  return {
    player,
    balls: Array.from({ length: config.balls }, (_, index) => createBall(index, config, player.x, player.y)),
    elapsed: 0,
    nextSpawn: config.spawnEvery,
  };
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
  });

  const { player } = game;
  ctx.save();
  ctx.translate(player.x, player.y);
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

  if (state !== 'running') {
    ctx.fillStyle = 'rgba(7, 7, 20, 0.58)';
    ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f7fbff';
    ctx.font = '900 42px Inter, system-ui, sans-serif';
    const label = state === 'ended' ? 'GAME OVER' : state === 'paused' ? 'PAUSED' : 'READY';
    ctx.fillText(label, ARENA.width / 2, ARENA.height / 2 - 10);
    ctx.font = '700 16px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#94f9ff';
    ctx.fillText('Press Space to fly. WASD or Arrow Keys to move. R to restart.', ARENA.width / 2, ARENA.height / 2 + 28);
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
  const keysRef = useRef<Set<string>>(new Set());
  const gameRef = useRef<GameState>(newGame(difficulties.normal));
  const stateRef = useRef<PlayState>('ready');
  const difficultyRef = useRef<DifficultyKey>('normal');
  const [difficulty, setDifficulty] = useState<DifficultyKey>('normal');
  const [playState, setPlayState] = useState<PlayState>('ready');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const config = useMemo(() => difficulties[difficulty], [difficulty]);

  useEffect(() => {
    difficultyRef.current = difficulty;
    const stored = Number(localStorage.getItem(`neon-dodge-best-${difficulty}`) || 0);
    setBest(stored);
    gameRef.current = newGame(difficulties[difficulty]);
    setScore(0);
    setPlayState('ready');
  }, [difficulty]);

  useEffect(() => {
    stateRef.current = playState;
  }, [playState]);

  const finishRun = (finalScore: number) => {
    const key = `neon-dodge-best-${difficultyRef.current}`;
    const previous = Number(localStorage.getItem(key) || 0);
    if (finalScore > previous) {
      localStorage.setItem(key, String(finalScore));
      setBest(finalScore);
    }
    setPlayState('ended');
  };

  const resetRun = (nextState: PlayState = 'ready') => {
    gameRef.current = newGame(difficulties[difficultyRef.current]);
    setScore(0);
    setPlayState(nextState);
  };

  const togglePlay = () => {
    if (stateRef.current === 'running') {
      setPlayState('paused');
      return;
    }
    if (stateRef.current === 'ended') {
      resetRun('running');
      return;
    }
    setPlayState('running');
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar'].includes(event.key)) {
        event.preventDefault();
      }
      if (event.key === ' ' || event.key === 'Spacebar') togglePlay();
      if (event.key.toLowerCase() === 'r') resetRun('running');
      keysRef.current.add(event.key.toLowerCase());
    };
    const up = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
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
        const keys = keysRef.current;
        let dx = 0;
        let dy = 0;
        if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
        if (keys.has('d') || keys.has('arrowright')) dx += 1;
        if (keys.has('w') || keys.has('arrowup')) dy -= 1;
        if (keys.has('s') || keys.has('arrowdown')) dy += 1;
        if (dx || dy) {
          const len = Math.hypot(dx, dy);
          current.player.x += (dx / len) * currentConfig.shipSpeed * dt;
          current.player.y += (dy / len) * currentConfig.shipSpeed * dt;
        }
        current.player.x = Math.max(28, Math.min(ARENA.width - 28, current.player.x));
        current.player.y = Math.max(30, Math.min(ARENA.height - 30, current.player.y));

        current.elapsed += dt;
        const nextScore = Math.floor(current.elapsed * 12);
        setScore(nextScore);

        if (current.elapsed >= current.nextSpawn && current.balls.length < currentConfig.maxBalls) {
          current.balls.push(createBall(current.balls.length, currentConfig, current.player.x, current.player.y));
          current.nextSpawn += currentConfig.spawnEvery;
        }

        current.balls.forEach((ball) => {
          const pressure = 1 + Math.min(current.elapsed / 75, 0.42);
          ball.x += ball.vx * pressure * dt;
          ball.y += ball.vy * pressure * dt;
          if (ball.x < 22 + ball.r || ball.x > ARENA.width - 22 - ball.r) {
            ball.vx *= -1;
            ball.x = Math.max(22 + ball.r, Math.min(ARENA.width - 22 - ball.r, ball.x));
          }
          if (ball.y < 22 + ball.r || ball.y > ARENA.height - 22 - ball.r) {
            ball.vy *= -1;
            ball.y = Math.max(22 + ball.r, Math.min(ARENA.height - 22 - ball.r, ball.y));
          }
        });

        const hit = current.balls.some((ball) => Math.hypot(ball.x - current.player.x, ball.y - current.player.y) < ball.r + current.player.r - 2);
        if (hit) finishRun(nextScore);
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
        <aside className="control-panel" aria-label="Neon Dodge controls">
          <p className="eyebrow"><Sparkles size={16} /> Select difficulty</p>
          <div className="difficulty-list">
            {(Object.keys(difficulties) as DifficultyKey[]).map((key) => (
              <button className={key === difficulty ? 'difficulty active' : 'difficulty'} type="button" key={key} onClick={() => setDifficulty(key)} disabled={playState === 'running'}>
                <span>{difficulties[key].label}</span>
                <small>{difficulties[key].detail}</small>
              </button>
            ))}
          </div>

          <div className="score-grid">
            <div><span>Score</span><strong>{score}</strong></div>
            <div><span>Best</span><strong>{best}</strong></div>
          </div>

          <div className="action-row">
            <button type="button" onClick={togglePlay}>{playState === 'running' ? <Pause size={18} /> : <Play size={18} />} {playState === 'running' ? 'Pause' : 'Start'}</button>
            <button className="ghost-button" type="button" onClick={() => resetRun('running')}><RotateCcw size={18} /> Restart</button>
          </div>

          <dl className="keymap">
            <div><dt>Move</dt><dd>WASD / Arrow keys</dd></div>
            <div><dt>Start</dt><dd>Space</dd></div>
            <div><dt>Restart</dt><dd>R</dd></div>
          </dl>
        </aside>

        <section className="arena-wrap" aria-label="Neon Dodge play area">
          <div className="arena-header">
            <div>
              <p className="status">{config.label} mode</p>
              <h1>Outfly the neon storm.</h1>
            </div>
            <span className={`state-pill ${playState}`}>{playState}</span>
          </div>
          <canvas ref={canvasRef} width={ARENA.width} height={ARENA.height} aria-label="Neon Dodge canvas" />
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
