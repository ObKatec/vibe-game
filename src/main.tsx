import React from 'react';
import { createRoot } from 'react-dom/client';
import { Gamepad2, Sparkles, UserRound } from 'lucide-react';
import './styles.css';

const games = [
  { title: 'Neon Dodge', status: 'Prototype', description: 'A fast reflex arena for the first playable game.' },
  { title: 'Pulse Click', status: 'Planned', description: 'Hit the signal at the exact neon beat.' },
  { title: 'Memory Grid', status: 'Planned', description: 'Flip, remember, and clear the arcade board.' },
];

function App() {
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
            <button type="button">Play</button>
          </article>
        ))}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
