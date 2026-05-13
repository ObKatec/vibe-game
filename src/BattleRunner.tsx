import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Gamepad2, Pause, Play, RotateCcw, Sparkles, UserRound } from 'lucide-react';

type PlayState = 'ready' | 'running' | 'paused' | 'won' | 'ended';
type ItemType = 'gate' | 'crate' | 'enemy' | 'boss';
type RunnerItem = {
  id: number;
  type: ItemType;
  z: number;
  x: number;
  value: number;
  label?: string;
  kind?: 'power' | 'weapon' | 'ally';
  left?: { value: number; label: string };
  right?: { value: number; label: string };
  count?: number;
  active: boolean;
};
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type RunnerState = {
  power: number;
  distance: number;
  playerX: number;
  targetX: number;
  weapon: number;
  fire: number;
  shake: number;
  drag: { active: boolean; startX: number; startTarget: number };
  items: RunnerItem[];
  shots: { x: number; z: number; life: number }[];
  sparks: Spark[];
};

const SIZE = { w: 450, h: 800 };
const road = { center: SIZE.w / 2, horizon: 36, bottom: SIZE.h + 30, topW: 235, bottomW: 520 };
const lanes = [-132, 0, 132];
const segments: Omit<RunnerItem, 'id' | 'active'>[] = [
  { type: 'gate', z: 620, x: 0, value: 0, left: { value: 12, label: '+12' }, right: { value: -7, label: '-7' } },
  { type: 'enemy', z: 950, x: 0, value: 16, count: 5 },
  { type: 'crate', z: 1250, x: -132, value: 18, label: 'Weapon', kind: 'weapon' },
  { type: 'crate', z: 1260, x: 132, value: 10, label: '+10', kind: 'power' },
  { type: 'gate', z: 1660, x: 0, value: 0, left: { value: -15, label: '-15' }, right: { value: 20, label: '+20' } },
  { type: 'enemy', z: 2020, x: -72, value: 22, count: 7 },
  { type: 'enemy', z: 2060, x: 122, value: 30, count: 8 },
  { type: 'crate', z: 2420, x: 0, value: 15, label: '+Squad', kind: 'ally' },
  { type: 'gate', z: 2800, x: 0, value: 0, left: { value: 28, label: '+28' }, right: { value: -24, label: '-24' } },
  { type: 'enemy', z: 3220, x: -122, value: 35, count: 10 },
  { type: 'crate', z: 3250, x: 132, value: 25, label: 'MG', kind: 'weapon' },
  { type: 'enemy', z: 3660, x: 0, value: 50, count: 14 },
  { type: 'boss', z: 4200, x: 0, value: 90, count: 18 },
];

function makeRunner(): RunnerState {
  return {
    power: 25,
    distance: 0,
    playerX: 0,
    targetX: 0,
    weapon: 0,
    fire: 0,
    shake: 0,
    drag: { active: false, startX: 0, startTarget: 0 },
    items: segments.map((item, id) => ({ ...item, id, active: true })),
    shots: [],
    sparks: [],
  };
}

function project(x: number, z: number) {
  const depth = Math.max(0.02, 1 - z / 4700);
  const scale = 0.55 + depth * 0.65;
  return { x: road.center + x * scale, y: SIZE.h - 118 - z * 0.17, scale };
}

function roadX(y: number, side: number) {
  const t = Math.max(0, Math.min(1, (y - road.horizon) / (road.bottom - road.horizon)));
  const width = road.topW + (road.bottomW - road.topW) * t;
  return road.center + side * width * 0.5;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = '#ffffff') {
  ctx.save();
  ctx.font = `900 ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#07111f';
  ctx.lineWidth = Math.max(4, size * 0.16);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function burst(game: RunnerState, x: number, y: number, color: string, amount = 12) {
  for (let i = 0; i < amount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 55 + Math.random() * 145;
    game.sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color });
  }
}

function drawRoad(ctx: CanvasRenderingContext2D, game: RunnerState) {
  const sky = ctx.createLinearGradient(0, 0, 0, SIZE.h);
  sky.addColorStop(0, '#72c7e8');
  sky.addColorStop(0.3, '#91def4');
  sky.addColorStop(1, '#315c75');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SIZE.w, SIZE.h);
  ctx.fillStyle = '#1d7a99';
  ctx.fillRect(0, 0, SIZE.w, SIZE.h);
  ctx.beginPath();
  ctx.moveTo(roadX(road.horizon, -1), road.horizon);
  ctx.lineTo(roadX(road.horizon, 1), road.horizon);
  ctx.lineTo(roadX(road.bottom, 1), road.bottom);
  ctx.lineTo(roadX(road.bottom, -1), road.bottom);
  ctx.closePath();
  ctx.fillStyle = '#8f989d';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#d9ecef';
  ctx.beginPath();
  ctx.moveTo(roadX(road.horizon, -1), road.horizon);
  ctx.lineTo(roadX(road.bottom, -1), road.bottom);
  ctx.moveTo(roadX(road.horizon, 1), road.horizon);
  ctx.lineTo(roadX(road.bottom, 1), road.bottom);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  for (let i = -1; i < 8; i += 1) {
    const y = ((game.distance * 0.38 + i * 94) % 752) + 18;
    ctx.beginPath();
    ctx.moveTo(road.center, y);
    ctx.lineTo(road.center, y + 48);
    ctx.stroke();
  }
  [-1, 1].forEach((side) => {
    ctx.strokeStyle = '#c42531';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(roadX(road.horizon, side) + side * 20, road.horizon);
    ctx.lineTo(roadX(road.bottom, side) + side * 42, road.bottom);
    ctx.stroke();
    ctx.strokeStyle = '#801923';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i += 1) {
      const y = 60 + i * 70 + ((game.distance * 0.18) % 70);
      const x = roadX(y, side) + side * 24;
      ctx.beginPath();
      ctx.moveTo(x, y - 22);
      ctx.lineTo(x + side * 18, y + 22);
      ctx.stroke();
    }
  });
}

function soldier(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, helmet: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath();
  ctx.ellipse(6, 24, 17, 6, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f5f1df';
  ctx.fillRect(-9, -1, 18, 24);
  ctx.fillStyle = '#f3c3a7';
  ctx.beginPath();
  ctx.arc(0, -12, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = helmet;
  ctx.beginPath();
  ctx.arc(0, -17, 11, Math.PI, 0);
  ctx.lineTo(11, -14);
  ctx.lineTo(-11, -14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(-8, 23, 6, 13);
  ctx.fillRect(3, 23, 6, 13);
  ctx.restore();
}

function drawGate(ctx: CanvasRenderingContext2D, item: RunnerItem, game: RunnerState) {
  if (!item.left || !item.right) return;
  const z = item.z - game.distance;
  const panels = [
    { choice: item.left, pos: project(-100, z), side: -1 },
    { choice: item.right, pos: project(100, z), side: 1 },
  ];
  panels.forEach(({ choice, pos, side }) => {
    const w = 180 * pos.scale;
    const h = 54 * pos.scale;
    const x = side < 0 ? pos.x - w : pos.x;
    const gradient = ctx.createLinearGradient(x, pos.y, x + w, pos.y);
    const good = choice.value >= 0;
    gradient.addColorStop(0, good ? '#37a4ff' : '#ff3d3d');
    gradient.addColorStop(1, good ? '#77e0ff' : '#ff8972');
    rounded(ctx, x, pos.y - h / 2, w, h, 8 * pos.scale);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.fillStyle = good ? '#0964b0' : '#a22a2a';
    ctx.fillRect(x - pos.scale, pos.y - h / 2 - 7 * pos.scale, 10 * pos.scale, h + 14 * pos.scale);
    ctx.fillRect(x + w - 9 * pos.scale, pos.y - h / 2 - 7 * pos.scale, 10 * pos.scale, h + 14 * pos.scale);
    label(ctx, choice.label, x + w / 2, pos.y, 32 * pos.scale);
  });
}

function drawCrate(ctx: CanvasRenderingContext2D, item: RunnerItem, game: RunnerState) {
  const p = project(item.x, item.z - game.distance);
  const w = 76 * p.scale;
  const h = 58 * p.scale;
  rounded(ctx, p.x - w / 2, p.y - h / 2, w, h, 7 * p.scale);
  ctx.fillStyle = '#b87942';
  ctx.fill();
  ctx.fillStyle = '#7b4c2c';
  ctx.fillRect(p.x - w * 0.08, p.y - h / 2, w * 0.16, h);
  ctx.strokeStyle = '#5c371f';
  ctx.lineWidth = 2 * p.scale;
  ctx.strokeRect(p.x - w / 2, p.y - h / 2, w, h);
  label(ctx, item.label || '', p.x, p.y, 22 * p.scale, item.kind === 'weapon' ? '#ffd84a' : '#ffffff');
  if (item.kind === 'weapon') {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(p.x - 24 * p.scale, p.y - 48 * p.scale, 50 * p.scale, 10 * p.scale);
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(p.x + 20 * p.scale, p.y - 51 * p.scale, 16 * p.scale, 5 * p.scale);
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, item: RunnerItem, game: RunnerState) {
  const p = project(item.x, item.z - game.distance);
  const count = item.count || 5;
  const cols = Math.ceil(Math.sqrt(count));
  const gap = 20 * p.scale;
  for (let i = 0; i < count; i += 1) {
    soldier(ctx, p.x + (i % cols - (cols - 1) / 2) * gap, p.y + (Math.floor(i / cols) - 1) * gap * 0.72, p.scale * 0.58, '#ef4444');
  }
  label(ctx, String(Math.max(0, Math.round(item.value))), p.x, p.y + 34 * p.scale, 28 * p.scale);
}

function drawBoss(ctx: CanvasRenderingContext2D, item: RunnerItem, game: RunnerState) {
  const p = project(item.x, item.z - game.distance);
  const w = 118 * p.scale;
  const h = 84 * p.scale;
  rounded(ctx, p.x - w / 2, p.y - h / 2, w, h, 12 * p.scale);
  ctx.fillStyle = '#b87942';
  ctx.fill();
  ctx.fillStyle = '#e33f3f';
  ctx.beginPath();
  ctx.arc(p.x, p.y - 12 * p.scale, 28 * p.scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(p.x - 9 * p.scale, p.y - 16 * p.scale, 6 * p.scale, 0, Math.PI * 2);
  ctx.arc(p.x + 9 * p.scale, p.y - 16 * p.scale, 6 * p.scale, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, String(Math.max(0, Math.round(item.value))), p.x, p.y + 48 * p.scale, 30 * p.scale);
}

function drawPlayer(ctx: CanvasRenderingContext2D, game: RunnerState) {
  const p = project(game.playerX, 0);
  const members = Math.min(18, Math.max(1, Math.ceil(game.power / 8)));
  const cols = Math.min(5, Math.ceil(Math.sqrt(members)));
  for (let i = members - 1; i >= 0; i -= 1) {
    soldier(ctx, p.x + (i % cols - (cols - 1) / 2) * 24, p.y - Math.floor(i / cols) * 20, 0.9, '#1fa8ff');
  }
  if (game.weapon > 0) {
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(p.x - 24, p.y - 62, 52, 9);
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(p.x + 24, p.y - 64, 18, 5);
  }
}

function render(ctx: CanvasRenderingContext2D, game: RunnerState, playState: PlayState) {
  ctx.save();
  if (game.shake > 0) ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  drawRoad(ctx, game);
  game.items
    .filter((item) => item.active && item.z - game.distance > -120 && item.z - game.distance < 4700)
    .sort((a, b) => b.z - a.z)
    .forEach((item) => {
      if (item.type === 'gate') drawGate(ctx, item, game);
      if (item.type === 'crate') drawCrate(ctx, item, game);
      if (item.type === 'enemy') drawEnemy(ctx, item, game);
      if (item.type === 'boss') drawBoss(ctx, item, game);
    });
  game.shots.forEach((shot) => {
    const p = project(shot.x, shot.z);
    ctx.save();
    ctx.globalAlpha = shot.life;
    ctx.strokeStyle = '#ffe16a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y + 18);
    ctx.lineTo(p.x, p.y - 18);
    ctx.stroke();
    ctx.restore();
  });
  drawPlayer(ctx, game);
  game.sparks.forEach((spark) => {
    ctx.save();
    ctx.globalAlpha = spark.life;
    ctx.fillStyle = spark.color;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
  rounded(ctx, 16, 16, 132, 52, 8);
  ctx.fillStyle = 'rgba(9, 13, 32, 0.74)';
  ctx.fill();
  label(ctx, `POWER ${Math.round(game.power)}`, 82, 43, 18, '#94f9ff');
  if (playState === 'paused') {
    ctx.fillStyle = 'rgba(7, 7, 20, 0.58)';
    ctx.fillRect(0, 0, SIZE.w, SIZE.h);
    label(ctx, 'PAUSED', SIZE.w / 2, SIZE.h / 2, 42);
  }
}

export function BattleRunner({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef(makeRunner());
  const stateRef = useRef<PlayState>('ready');
  const [playState, setPlayState] = useState<PlayState>('ready');
  const [power, setPower] = useState(25);
  const [bestPower, setBestPower] = useState(0);

  useEffect(() => setBestPower(Number(localStorage.getItem('battle-runner-best-power') || 0)), []);
  useEffect(() => {
    stateRef.current = playState;
  }, [playState]);

  const syncPower = () => setPower(Math.round(Math.max(0, gameRef.current.power)));
  const finish = (next: PlayState) => {
    if (stateRef.current !== 'running') return;
    if (next === 'won') {
      const best = Math.max(Number(localStorage.getItem('battle-runner-best-power') || 0), Math.round(gameRef.current.power));
      localStorage.setItem('battle-runner-best-power', String(best));
      setBestPower(best);
    }
    syncPower();
    setPlayState(next);
  };
  const applyPower = (delta: number) => {
    const game = gameRef.current;
    game.power = Math.max(0, game.power + delta);
    syncPower();
    if (game.power <= 0) finish('ended');
  };
  const resetRun = (next: PlayState = 'ready') => {
    gameRef.current = makeRunner();
    setPower(25);
    setPlayState(next);
  };
  const togglePlay = () => {
    if (stateRef.current === 'running') return setPlayState('paused');
    if (stateRef.current === 'paused') return setPlayState('running');
    resetRun('running');
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const game = gameRef.current;
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
        event.preventDefault();
        game.targetX = Math.max(lanes[0], game.targetX - 66);
      }
      if (event.code === 'ArrowRight' || event.code === 'KeyD') {
        event.preventDefault();
        game.targetX = Math.min(lanes[2], game.targetX + 66);
      }
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        togglePlay();
      }
      if (event.code === 'KeyR' && !event.repeat) resetRun('running');
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const pointerDown = (event: PointerEvent) => {
      const game = gameRef.current;
      game.drag = { active: true, startX: event.clientX, startTarget: game.targetX };
      canvas.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      const game = gameRef.current;
      if (!game.drag.active) return;
      const rect = canvas.getBoundingClientRect();
      game.targetX = Math.max(lanes[0], Math.min(lanes[2], game.drag.startTarget + ((event.clientX - game.drag.startX) / rect.width) * 420));
    };
    const pointerUp = (event: PointerEvent) => {
      const game = gameRef.current;
      game.drag.active = false;
      const rect = canvas.getBoundingClientRect();
      game.targetX = Math.max(lanes[0], Math.min(lanes[2], ((event.clientX - rect.left) / rect.width - 0.5) * 370));
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerUp);

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;
      const game = gameRef.current;
      if (stateRef.current === 'running') {
        game.distance += 245 * dt;
        game.playerX += (game.targetX - game.playerX) * Math.min(1, dt * 9);
        game.shake = Math.max(0, game.shake - 35 * dt);

        game.items.forEach((item) => {
          const z = item.z - game.distance;
          if (!item.active || z < -80 || z > 80) return;
          if (item.type === 'gate' && item.left && item.right) {
            item.active = false;
            const choice = game.playerX < 0 ? item.left : item.right;
            if (choice.value < 0) game.shake = 10;
            applyPower(choice.value);
            return;
          }
          if (Math.abs(game.playerX - item.x) > 90) return;
          item.active = false;
          const p = project(item.x, z);
          if (item.type === 'crate') {
            if (item.kind === 'weapon') game.weapon = 7;
            applyPower(item.value);
            burst(game, p.x, p.y, '#ffd84a', 18);
          }
          if (item.type === 'enemy' || item.type === 'boss') {
            applyPower(-item.value);
            burst(game, p.x, p.y, '#ef4444', item.type === 'boss' ? 28 : 16);
            game.shake = 16;
            if (item.type === 'boss' && game.power > 0) finish('won');
          }
        });

        if (game.weapon > 0) {
          game.weapon -= dt;
          game.fire -= dt;
          if (game.fire <= 0) {
            const target = game.items
              .filter((item) => item.active && (item.type === 'enemy' || item.type === 'boss'))
              .map((item) => ({ item, z: item.z - game.distance }))
              .filter(({ item, z }) => z > 130 && z < 760 && Math.abs(item.x - game.playerX) < 130)
              .sort((a, b) => a.z - b.z)[0];
            if (target) {
              game.fire = 0.18;
              target.item.value = Math.max(0, target.item.value - 3);
              game.shots.push({ x: game.playerX, z: target.z * 0.55, life: 1 });
              const p = project(target.item.x, target.z);
              burst(game, p.x, p.y, '#ffe16a', 3);
              if (target.item.value <= 0) {
                target.item.active = false;
                applyPower(4);
              }
            }
          }
        }

        game.shots.forEach((shot) => {
          shot.z += 980 * dt;
          shot.life -= dt * 2.8;
        });
        game.shots = game.shots.filter((shot) => shot.life > 0);
        game.sparks.forEach((spark) => {
          spark.x += spark.vx * dt;
          spark.y += spark.vy * dt;
          spark.vy += 220 * dt;
          spark.life -= dt * 1.8;
        });
        game.sparks = game.sparks.filter((spark) => spark.life > 0);
        if (game.distance > 4530) finish(game.power > 0 ? 'won' : 'ended');
      }
      render(ctx, game, stateRef.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerUp);
    };
  }, []);

  const showOverlay = playState === 'ready' || playState === 'won' || playState === 'ended';

  return (
    <main className="shell game-shell">
      <nav className="topbar" aria-label="Game navigation">
        <button className="ghost-button" type="button" onClick={onBack}><ArrowLeft size={18} /> Lobby</button>
        <div className="brand"><Gamepad2 size={24} /> Battle Runner</div>
        <div className="session"><UserRound size={18} /> Guest mode</div>
      </nav>

      <section className="game-layout">
        <aside className="control-panel" aria-label="Battle Runner information">
          <div className="game-info">
            <p className="eyebrow"><Sparkles size={16} /> Battle Runner</p>
            <p>Swipe between lanes, collect power gates and weapons, then spend squad power to break through numbered enemies.</p>
          </div>
          <div className="best-card">
            <span>Best Finish</span>
            <strong>{bestPower}</strong>
            <small>Highest remaining power</small>
          </div>
          <dl className="keymap">
            <div><dt>Move</dt><dd>Drag / A / D / Arrow keys</dd></div>
            <div><dt>Start / Pause</dt><dd>Space</dd></div>
            <div><dt>Restart</dt><dd>R</dd></div>
            <div><dt>Goal</dt><dd>Reach the boss with power left</dd></div>
          </dl>
        </aside>

        <section className="arena-wrap" aria-label="Battle Runner play area">
          <div className="arena-header">
            <div>
              <p className="status">Power route</p>
              <h1>Pick the better lane.</h1>
            </div>
            <div className="arena-actions">
              <button type="button" onClick={togglePlay}>{playState === 'running' ? <Pause size={18} /> : <Play size={18} />} {playState === 'running' ? 'Pause' : 'Start'}</button>
              <button className="ghost-button icon-button" type="button" aria-label="Restart" onClick={() => resetRun('running')}><RotateCcw size={18} /></button>
              <span className={`state-pill ${playState}`}>{playState}</span>
            </div>
          </div>
          <div className="runner-stage">
            <canvas ref={canvasRef} width={SIZE.w} height={SIZE.h} aria-label="Battle Runner canvas" />
            {showOverlay && (
              <div className="start-panel runner-start-panel" aria-label="Battle Runner run state">
                <div className="start-inner">
                  <p className="eyebrow"><Sparkles size={16} /> {playState === 'won' ? 'Bridge cleared' : playState === 'ended' ? 'Power depleted' : 'Choose your route'}</p>
                  {playState === 'ready' ? <h2>Build power before numbered enemies drain the squad.</h2> : (
                    <div className="result-score">
                      <span>{playState === 'won' ? 'Remaining Power' : 'Final Power'}</span>
                      <strong>{power}</strong>
                    </div>
                  )}
                  <div className="panel-actions">
                    <p>Power: <strong>{power}</strong> / Best: <strong>{bestPower}</strong></p>
                    <button type="button" onClick={() => resetRun('running')}><Play size={18} /> {playState === 'ready' ? 'Start Run' : 'Run Again'}</button>
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
