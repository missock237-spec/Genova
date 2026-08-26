'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

/* ------------------------------------------------------------------ */
/*  Petit SVG schema de circuit (remplace le cerveau)                  */
/* ------------------------------------------------------------------ */
function Circuit({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4 6h6M14 6h6M4 18h6M14 18h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="18" r="2.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 8.4v3.2M10 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Terminal interactif : benchmarks memoire + Proof of Correctness    */
/* ------------------------------------------------------------------ */
const TERMINAL_SCRIPT: { text: string; tint?: 'cyan' | 'amber' | 'dim' | 'ok' }[] = [
  { text: 'gen3ia@core:~$ ./run --agent supervisor --verify true', tint: 'dim' },
  { text: '' },
  { text: '[init] moteur Rust ............... OK (sha256:9f2c…d41a)' },
  { text: '[load] adaptateur llama-5 ........ 1.42s  ·  ctx 128k' },
  { text: '[load] adaptateur openai .......... 1.18s  ·  ctx 200k' },
  { text: '[load] adaptateur anthropic ....... 1.31s  ·  ctx 200k' },
  { text: '' },
  { text: '┌─ MEMORY BENCH (tokens/s) ────────────────┐', tint: 'cyan' },
  { text: '│  inference neurale   ........... 2 804 tok/s', tint: 'cyan' },
  { text: '│  verification symbolique ...... 1 912 tok/s', tint: 'cyan' },
  { text: '│  check securite (Rust) ........  998 tok/s', tint: 'cyan' },
  { text: '└──────────────────────────────────────────┘' },
  { text: '' },
  { text: '[proof] trace/2026-08-09/ag-7f1e.yaml ......... VERIFIED', tint: 'ok' },
  { text: '[proof] hash 7c4a…9e21 ....................... VERIFIED', tint: 'ok' },
  { text: '[proof] incertitude maximale ................. 0.012', tint: 'ok' },
  { text: '' },
  { text: 'system ready — 4 agents supervisés · 0 intervention manuelle requise', tint: 'amber' },
];

function TerminalHero() {
  const [lines, setLines] = useState<typeof TERMINAL_SCRIPT>([]);
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setLines(TERMINAL_SCRIPT.slice(0, i));
      if (i >= TERMINAL_SCRIPT.length) clearInterval(timer);
    }, 260);
    return () => clearInterval(timer);
  }, []);

  const tintClass = (t?: string) => {
    if (t === 'cyan') return 'text-[#00F5FF]';
    if (t === 'amber') return 'text-[#FFB800]';
    if (t === 'ok') return 'text-emerald-400';
    return 'text-[#D6DAE0]';
  };

  return (
    <div className="hardtech-terminal rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1C1E22] bg-[#0B0C0D]">
        <span className="h-3 w-3 rounded-full bg-[#FF5C5C]" />
        <span className="h-3 w-3 rounded-full bg-[#FFB800]" />
        <span className="h-3 w-3 rounded-full bg-emerald-400" />
        <span className="ml-3 hardtech-data text-[0.7rem] text-muted-foreground">
          gen3ia-core · supervisor-node · zsh
        </span>
      </div>
      <div className="p-5 font-[family-name:var(--font-geist-mono)] text-[0.8rem] leading-6 min-h-[300px]">
        {lines.map((l, idx) => (
          <div key={idx} className="whitespace-pre-wrap">
            {l.text === '' ? ' ' : (
              <span className={tintClass(l.tint)}>{l.text}</span>
            )}
          </div>
        ))}
        <span className="hardtech-caret" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Barres de progression deterministes (declenchees au scroll)        */
/* ------------------------------------------------------------------ */
const PIPELINE = [
  { label: '01 · Inférence neurale', width: '100%', note: '2 804 tok/s', color: 'bg-[#00F5FF]' },
  { label: '02 · Vérification symbolique', width: '92%', note: '412 contraintes', color: 'bg-[#4D9FFF]' },
  { label: '03 · Check de sécurité (Rust)', width: '87%', note: '0 vuln exposée', color: 'bg-[#7CFFB2]' },
  { label: '04 · Arbitrage humain', width: '64%', note: 'ciblé', color: 'bg-[#FFB800]' },
];

function DeterministicPipeline() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setOn(true); obs.disconnect(); }
    }, { threshold: 0.35 });
    obs.observe(node);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className="space-y-5">
      {PIPELINE.map((s) => (
        <div key={s.label}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm text-foreground/90">{s.label}</span>
            <span className="hardtech-data text-[0.7rem] text-muted-foreground">{s.note}</span>
          </div>
          <div className="deterministic-bar">
            {on && <i className={s.color} style={{ width: s.width }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hash de verification cliquable                                     */
/* ------------------------------------------------------------------ */
const HASH_CHAIN = [
  { label: 'action.agent_7f1e.select_memory', hash: '7c4a9e21·b6fe·4d19', status: 'VERIFIED', depth: 0 },
  { label: 'proof.inference.neurale', hash: 'a1f0·9c2d·88e3', status: 'VERIFIED', depth: 1 },
  { label: 'proof.symbolic.constraints(412)', hash: 'd3b7·41aa·5f20', status: 'VERIFIED', depth: 1 },
  { label: 'proof.rust.safety_check', hash: '9f2c·77eb·01d4', status: 'VERIFIED', depth: 1 },
  { label: 'trace://yaml/2026-08-09/ag-7f1e.yaml', hash: 'e8a5·90c1·3b66', status: 'VERIFIED', depth: 2 },
];

function VerificationChain() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="divide-y divide-[#1C1E22] border border-[#1C1E22] rounded-lg overflow-hidden bg-[#0B0C0D]">
      {HASH_CHAIN.map((h, i) => (
        <div key={i}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#0E0F11] transition-colors"
            style={{ paddingLeft: `${16 + h.depth * 18}px` }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[#00F5FF] text-xs">{open === i ? '▾' : '▸'}</span>
              <span className="hardtech-data text-[0.76rem] truncate">{h.label}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="hidden sm:inline verification-hash">{h.hash}</span>
              <span className="hardtech-data text-[0.68rem] text-emerald-400">✓ {h.status}</span>
            </div>
          </button>
          {open === i && (
            <div className="px-6 pb-3 pt-1 hardtech-data text-[0.72rem] text-muted-foreground" style={{ paddingLeft: `${34 + h.depth * 18}px` }}>
              preuve de logique : madeleine → {h.label} → {h.hash.split('·')[0]}…
              <div className="mt-1 text-[#00F5FF]/70">raw: sha256:{h.hash.replace(/·/g, '')} · payload 1 284 octets · nonce 0x3f</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cartographie d'incertitude (heatmap)                               */
/* ------------------------------------------------------------------ */
function UncertaintyHeatmap() {
  const rows = 8;
  const cols = 24;
  const cell = (x: number, y: number): number => {
    const base = Math.abs(Math.sin((x * 0.7) + (y * 1.3)));
    const spike = (x === 9 && (y === 2 || y === 3)) || (x === 16 && y === 5) ? 1 : 0;
    return Math.min(1, base + spike * 0.6);
  };
  return (
    <div>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: rows * cols }).map((_, idx) => {
          const x = idx % cols;
          const y = Math.floor(idx / cols);
          const v = cell(x, y);
          const isFragile = (x === 9 && (y === 2 || y === 3)) || (x === 16 && y === 5);
          return (
            <div
              key={idx}
              title={`zone logique (${x},${y}) incertitude ${Math.round(v * 100)}%`}
              className={`h-3 rounded-[2px] ${isFragile ? 'bg-[#FFB800]' : ''}`}
              style={{
                background: isFragile ? undefined : `rgba(0,245,255,${0.05 + v * 0.5})`,
                boxShadow: isFragile ? '0 0 8px rgba(255,184,0,0.7)' : undefined,
              }}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-3 hardtech-data text-[0.68rem] text-muted-foreground">
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-[#00F5FF]/20 inline-block" /> confiance haute</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm bg-[#FFB800] inline-block" /> zone fragile (intervention humaine)</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BENTO - adaptateurs, moteur Rust, traces YAML, panique             */
/* ------------------------------------------------------------------ */
const ADAPTERS = [
  { name: 'Llama-5', metric: 'ctx 128k', status: 'online' },
  { name: 'OpenAI', metric: 'ctx 200k', status: 'online' },
  { name: 'Anthropic', metric: 'ctx 200k', status: 'online' },
  { name: 'Mistral', metric: 'ctx 128k', status: 'online' },
];

const YAML_TRACE = `trace: 2026-08-09/ag-7f1e
runtime: rust-core v2.4.1
steps:
  - infer: llama-5
  - verify: symbolic/412
  - safety: rust-check
uncertainty: 0.012
hash: 7c4a9e21b6fe4d19`;

function BentoGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[minmax(150px,auto)]">
      {/* Adaptateurs */}
      <div className="bento-card rounded-lg p-5 md:col-span-2 md:row-span-1">
        <div className="hardtech-tag">Adaptateurs de modèles</div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {ADAPTERS.map((a) => (
            <div key={a.name} className="flex items-center justify-between rounded-md border border-[#1C1E22] bg-[#0B0C0D] px-3 py-2.5">
              <span className="text-sm font-medium">{a.name}</span>
              <span className="flex items-center gap-1.5">
                <span className="hardtech-data text-[0.66rem] text-muted-foreground">{a.metric}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 hardtech-data text-[0.72rem] text-muted-foreground">
          Routing adaptatif context-aware · bascule à chaud en cas de dégradation d&apos;un fournisseur.
        </p>
      </div>

      {/* Moteur Rust */}
      <div className="bento-card rounded-lg p-5">
        <div className="hardtech-tag hardtech-tag-amber">Moteur d&apos;exécution</div>
        <div className="mt-4 flex items-center gap-3">
          <Circuit className="h-10 w-10 text-[#00F5FF]" />
          <div>
            <div className="text-sm font-semibold">rust-core</div>
            <div className="hardtech-data text-[0.7rem] text-muted-foreground">ordinateur neuro-symbolique</div>
          </div>
        </div>
        <div className="mt-4 space-y-1.5 hardtech-data text-[0.72rem]">
          <div className="flex justify-between"><span>mémoire tampon</span><span className="text-[#00F5FF]">128k ctx</span></div>
          <div className="flex justify-between"><span>latence check</span><span className="text-[#00F5FF]">0.4 ms</span></div>
          <div className="flex justify-between"><span>alloc.</span><span className="text-[#FFB800]">intervention ciblée</span></div>
        </div>
      </div>

      {/* Traces YAML */}
      <div className="bento-card rounded-lg p-5 md:col-span-1">
        <div className="hardtech-tag">Traces vérifiables</div>
        <pre className="mt-3 hardtech-data text-[0.68rem] text-[#A9B0B8] overflow-x-auto">{YAML_TRACE}</pre>
      </div>

      {/* Pipeline verification */}
      <div className="bento-card rounded-lg p-5 md:col-span-2">
        <div className="hardtech-tag">Transparence — Verifiable Autonomy</div>
        <div className="mt-4"><DeterministicPipeline /></div>
      </div>

      {/* Heatmap incertitude */}
      <div className="bento-card rounded-lg p-5">
        <div className="hardtech-tag hardtech-tag-amber">Cartographie d&apos;incertitude</div>
        <div className="mt-3"><UncertaintyHeatmap /></div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Panic Interrupt                                                    */
/* ------------------------------------------------------------------ */
function PanicInterrupt() {
  const [armed, setArmed] = useState(false);
  const [released, setReleased] = useState(false);
  return (
    <div className="relative rounded-xl overflow-hidden border border-[#1C1E22]">
      <div className="hardtech-safe-stripes h-3 w-full" />
      <div className="bg-[#0B0C0D] p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start lg:items-center">
          <div className="flex-1">
            <div className="hardtech-tag hardtech-tag-amber">Panic Interrupt · contrôle manuel</div>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight">
              Reprenez la main. <span className="hardtech-glow">À tout moment.</span>
            </h3>
            <p className="mt-2 text-muted-foreground max-w-xl">
              Chaque boucle d&apos;agent expose un interrupteur d&apos;arrêt d&apos;urgence. Toute action humainement
              sensible est mise en attente d&apos;arbitrage — jamais exécutée dans le vide.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={() => { setArmed(true); setReleased(false); }}
                className="panic-release rounded-md px-4 py-2 text-sm font-medium"
              >
                ⏻ Armer l&apos;interrupteur
              </button>
              <button
                onClick={() => { setReleased(true); setArmed(false); }}
                className="rounded-md px-4 py-2 text-sm font-medium border border-[#1C1E22] text-muted-foreground hover:border-[#FF5C5C] hover:text-[#FF5C5C] transition-colors"
              >
                ✕ Relâcher
              </button>
            </div>
            <div className="mt-4 hardtech-data text-[0.7rem]">
              {released ? (
                <span className="text-emerald-400">✓ interrupteur relâché — les agents reprennent leur exécution.</span>
              ) : armed ? (
                <span className="text-[#FFB800]">■ arrêt d&apos;urgence armé — toutes les boucles sont suspendues.</span>
              ) : (
                <span className="text-muted-foreground">état : veille — aucune intervention requise.</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div
              className={`h-24 w-24 rounded-full grid place-items-center border-2 transition-all duration-300 ${
                released
                  ? 'border-emerald-400 text-emerald-400'
                  : armed
                  ? 'border-[#FFB800] text-[#FFB800] shadow-[0_0_30px_rgba(255,184,0,0.5)]'
                  : 'border-[#1C1E22] text-muted-foreground'
              }`}
            >
              <span className="text-4xl">{released ? '→' : armed ? '■' : '⏸'}</span>
            </div>
            <span className="hardtech-data text-[0.66rem] text-muted-foreground">
              {released ? 'RUNNING' : armed ? 'EMERGENCY_LOCK' : 'STANDBY'}
            </span>
          </div>
        </div>
      </div>
      <div className="hardtech-safe-stripes h-3 w-full" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Landing complète                                                   */
/* ------------------------------------------------------------------ */
export default function HardTechLanding() {
  return (
    <div className="min-h-screen bg-[#0A0A0B] text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-[#1C1E22] bg-[#0A0A0B]/85 backdrop-blur">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Gen3ia" width={36} height={36} className="h-9 w-9 rounded-md" priority />
            <span className="font-semibold tracking-tight">gen3ia</span>
            <span className="hardtech-data text-[0.6rem] text-muted-foreground hidden sm:inline">v2.4 · rust-core</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <a href="#intelligence" className="hover:text-foreground transition-colors">Intelligence</a>
            <a href="#transparence" className="hover:text-foreground transition-colors">Transparence</a>
            <a href="#architecture" className="hover:text-foreground transition-colors">Architecture</a>
            <a href="#controle" className="hover:text-foreground transition-colors">Contrôle</a>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link href="/login" className="px-3.5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Connexion
            </Link>
            <Link href="/register" className="px-4 py-2 text-sm font-medium rounded-md bg-[#00F5FF] text-[#001416] hover:bg-[#33f7ff] transition-colors">
              Démarrer
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section id="intelligence" className="relative hardtech-circuit-grid">
        <div className="absolute inset-0 bg-[radial-gradient(70%_50%_at_50%_0%,rgba(0,245,255,0.10),transparent_70%)] pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-8 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
          <div className="hardtech-reveal">
            <div className="flex items-center gap-2 mb-5">
              <span className="hardtech-tag">Verifiable Autonomy</span>
              <span className="hardtech-tag hardtech-tag-amber">Modèle 2026</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
              Le système d&apos;exploitation
              <br />
              pour agents IA <span className="hardtech-glow">prouvés.</span>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground max-w-xl">
              Pas des résultats aveugles. Une autonomie <span className="text-[#00F5FF]">vérifiable</span> :
              chaque action est accompagnée de sa preuve de logique, de son hash et de sa marge d&apos;incertitude.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="px-6 py-3 rounded-md bg-[#00F5FF] text-[#001416] font-medium hover:bg-[#33f7ff] transition-all shadow-[0_0_30px_rgba(0,245,255,0.25)]">
                Créer un compte →
              </Link>
              <a href="#architecture" className="px-6 py-3 rounded-md border border-[#1C1E22] text-foreground hover:border-[#00F5FF]/50 hover:text-[#00F5FF] transition-colors">
                Voir l&apos;architecture
              </a>
            </div>
            <div className="mt-8 flex items-center gap-3 hardtech-data text-[0.7rem] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 4/4 noeuds opérationnels</span>
              <span className="text-[#1C1E22]">|</span>
              <span>uptime 99.98%</span>
            </div>
          </div>
          <div className="hardtech-reveal" style={{ animationDelay: '0.15s' }}>
            <TerminalHero />
          </div>
        </div>

        {/* Ticker Proof of Correctness */}
        <div className="relative border-y border-[#1C1E22] bg-[#0B0C0D] overflow-hidden py-2.5">
          <div className="hardtech-ticker hardtech-data text-[0.72rem] text-muted-foreground">
            {[0, 1].map((k) => (
              <div key={k} className="flex items-center gap-8 pr-8 whitespace-nowrap">
                <span>proof::verif 7c4a…9e21 <span className="text-emerald-400">✓</span></span>
                <span>proof::safety 9f2c…d41a <span className="text-emerald-400">✓</span></span>
                <span>incertitude médiane 0.012</span>
                <span>constraintes vérifiées 412</span>
                <span>interventions humaines 0</span>
                <span>reprendre la main → <span className="text-[#FFB800]">panic://interrupt</span></span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ARCHITECTURE BENTO */}
      <section id="architecture" className="mx-auto max-w-7xl px-5 sm:px-8 py-20">
        <div className="mb-10 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="hardtech-tag">Architecture</div>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Une grille dense, pas des pastilles.</h2>
          </div>
          <p className="max-w-md text-muted-foreground text-sm">
            Adaptateurs de modèles, moteur Rust et traces YAML exposés comme des données — lisibles, vérifiables, auditables.
          </p>
        </div>
        <BentoGrid />
      </section>

      {/* TRANSPARENCE */}
      <section id="transparence" className="border-t border-[#1C1E22] bg-[#0B0C0D]">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-20 grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <div className="hardtech-tag">Verifiable Autonomy</div>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
              L&apos;UI ne cache plus rien. <span className="hardtech-glow">Elle prouve.</span>
            </h2>
            <p className="mt-4 text-muted-foreground max-w-xl">
              Visualisez le cheminement exact de chaque décision : inférence neurale → vérification
              symbolique → check de sécurité Rust. Chaque étape expose un hash de preuve et sa marge d&apos;incertitude.
            </p>
            <div className="mt-8 space-y-4">
              {[
                ['Barres déterministes', 'Chaque étape du pipeline est segmentée et mesurée — rien n’est décoratif.'],
                ['Hashes de vérification', 'Cliquez sur une preuve pour en dérouler la trace de logique brute.'],
                ['Cartographie d’incertitude', 'Les zones fragiles sont signalées pour intervention humaine.'],
              ].map(([t, d]) => (
                <div key={t} className="flex gap-3">
                  <span className="mt-1 text-[#00F5FF]"><Circuit className="h-4 w-4" /></span>
                  <div>
                    <div className="font-medium">{t}</div>
                    <div className="text-sm text-muted-foreground">{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-6">
            <div>
              <div className="hardtech-tag mb-3">Pipeline déterministe</div>
              <div className="rounded-lg border border-[#1C1E22] p-5 bg-[#0B0C0D]">
                <DeterministicPipeline />
              </div>
            </div>
            <div>
              <div className="hardtech-tag mb-3">Preuves de logique</div>
              <VerificationChain />
            </div>
          </div>
        </div>
      </section>

      {/* PANIC INTERRUPT / CONTRÔLE */}
      <section id="controle" className="mx-auto max-w-7xl px-5 sm:px-8 py-20">
        <div className="mb-10 max-w-2xl">
          <div className="hardtech-tag hardtech-tag-amber">Panic Interrupt</div>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">
            L&apos;autonomie, oui. <span className="text-[#FFB800]">L&apos;autorité, toujours la vôtre.</span>
          </h2>
        </div>
        <PanicInterrupt />
      </section>

      {/* CTA FINAL */}
      <section className="border-t border-[#1C1E22] hardtech-circuit-grid">
        <div className="mx-auto max-w-4xl px-5 sm:px-8 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Déployez des agents que vous <span className="hardtech-glow">pouvez prouver.</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Gen3ia est prêt pour 2026 : raisonnement neuro-symbolique, transparence vérifiable et contrôle manuel garanti.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register" className="px-6 py-3 rounded-md bg-[#00F5FF] text-[#001416] font-medium hover:bg-[#33f7ff] transition-colors shadow-[0_0_30px_rgba(0,245,255,0.25)]">
              Créer un compte gratuit → 10 crédits
            </Link>
            <Link href="/login" className="px-6 py-3 rounded-md border border-[#1C1E22] hover:border-[#00F5FF]/50 transition-colors">
              Se connecter
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#1C1E22] bg-[#0B0C0D]">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center h-7 w-7 rounded border border-[#00F5FF]/40 text-[#00F5FF]">
              <Circuit className="h-4 w-4" />
            </span>
            <span className="text-sm font-medium">gen3ia</span>
          </div>
          <div className="hardtech-data text-[0.7rem] text-muted-foreground text-center">
            © 2026 gen3ia · Cameroun · verifiable autonomy · <span className="text-[#00F5FF]">rust-core</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
