'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

/* ------------------------------------------------------------------ */
/*  Petit logo SVG "instrument" — un cercle optique                   */
/* ------------------------------------------------------------------ */
function InstrumentMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Panneau d'instrument — remplace le terminal cyberpunk              */
/*  Affiche une "planche de mesures" façon revue scientifique         */
/* ------------------------------------------------------------------ */
const BENCH_SCRIPT: { text: string; tone?: 'vermillon' | 'ultramarine' | 'ochre' | 'moss' | 'dim' }[] = [
  { text: 'REV.2.4  ·  rust-core  ·  2026-08-25', tone: 'dim' },
  { text: '' },
  { text: '— INFERENCE BENCH —', tone: 'vermillon' },
  { text: 'neural engine      ················  2 804 tok/s', tone: 'dim' },
  { text: 'symbolic verifier   ················  1 912 tok/s', tone: 'dim' },
  { text: 'rust safety check  ················    998 tok/s', tone: 'dim' },
  { text: '' },
  { text: '— PROOF CHAIN —', tone: 'vermillon' },
  { text: 'trace/2026-08-09/ag-7f1e.yaml', tone: 'ultramarine' },
  { text: 'hash 7c4a9e21·b6fe·4d19', tone: 'ultramarine' },
  { text: 'max uncertainty   ················  0.012', tone: 'ochre' },
  { text: '' },
  { text: '4 agents supervised · 0 manual intervention', tone: 'moss' },
];

function InstrumentPanel() {
  const [lines, setLines] = useState<typeof BENCH_SCRIPT>([]);
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setLines(BENCH_SCRIPT.slice(0, i));
      if (i >= BENCH_SCRIPT.length) clearInterval(timer);
    }, 240);
    return () => clearInterval(timer);
  }, []);

  const toneClass = (t?: string) => {
    if (t === 'vermillon') return 'text-[var(--color-vermillion)]';
    if (t === 'ultramarine') return 'text-[var(--color-ultramarine)]';
    if (t === 'ochre') return 'text-[var(--color-ochre)]';
    if (t === 'moss') return 'text-[var(--color-moss)]';
    return 'text-muted-foreground';
  };

  return (
    <div className="hardtech-terminal rounded-sm overflow-hidden">
      {/* Bandeau de titre façon "planche scientifique" */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--hairline-strong)] bg-[var(--secondary)]">
        <div className="flex items-center gap-2">
          <span className="editorial-section-num">FIG. 01</span>
          <span className="hardtech-data text-[0.66rem]">planche de mesures · noeud superviseur</span>
        </div>
        <span className="hardtech-data text-[0.66rem] text-muted-foreground">/dev/gen3ia/core</span>
      </div>
      {/* Corps */}
      <div className="p-5 font-[family-name:var(--font-geist-mono)] text-[0.78rem] leading-6 min-h-[300px]">
        {lines.map((l, idx) => (
          <div key={idx} className="whitespace-pre-wrap">
            {l.text === '' ? '\u00A0' : (
              <span className={toneClass(l.tone)}>{l.text}</span>
            )}
          </div>
        ))}
        <span className="hardtech-caret" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pipeline déterministe — barres segmentées, déclenchées au scroll   */
/* ------------------------------------------------------------------ */
const PIPELINE = [
  { label: '01 · Inférence neurale', width: '100%', note: '2 804 tok/s' },
  { label: '02 · Vérification symbolique', width: '92%', note: '412 contraintes' },
  { label: '03 · Check de sécurité (Rust)', width: '87%', note: '0 vuln exposée' },
  { label: '04 · Arbitrage humain', width: '64%', note: 'ciblé' },
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
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-sm">{s.label}</span>
            <span className="hardtech-data text-[0.7rem] text-muted-foreground">{s.note}</span>
          </div>
          <div className="deterministic-bar">
            {on && <i style={{ width: s.width }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Chaîne de vérification — arbre de preuves (sans glow néon)        */
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
    <div className="divide-y divide-[var(--hairline)] border border-[var(--hairline-strong)] rounded-sm overflow-hidden bg-[var(--card)]">
      {HASH_CHAIN.map((h, i) => (
        <div key={i}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--secondary)] transition-colors"
            style={{ paddingLeft: `${16 + h.depth * 18}px` }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[var(--color-vermillion)] text-xs font-[family-name:var(--font-geist-mono)]">{open === i ? '▾' : '▸'}</span>
              <span className="hardtech-data text-[0.74rem] truncate">{h.label}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="hidden sm:inline verification-hash">{h.hash}</span>
              <span className="hardtech-data text-[0.66rem] text-[var(--color-moss)] flex items-center gap-1.5">
                <span className="status-mark" /> {h.status}
              </span>
            </div>
          </button>
          {open === i && (
            <div className="px-6 pb-3 pt-1 hardtech-data text-[0.7rem] text-muted-foreground" style={{ paddingLeft: `${34 + h.depth * 18}px` }}>
              preuve de logique : madeleine → {h.label} → {h.hash.split('·')[0]}…
              <div className="mt-1 text-[var(--color-ultramarine)]">raw: sha256:{h.hash.replace(/·/g, '')} · payload 1 284 octets · nonce 0x3f</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Cartographie d'incertitude — heatmap sobre, sans glow             */
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
              className="h-3 rounded-[1px]"
              style={{
                background: isFragile
                  ? 'var(--color-ochre)'
                  : `rgba(27, 58, 107, ${0.08 + v * 0.45})`,
              }}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-3 hardtech-data text-[0.66rem] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-[1px] bg-[var(--color-ultramarine)]/30 inline-block" /> confiance haute
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-[1px] bg-[var(--color-ochre)] inline-block" /> zone fragile (intervention humaine)
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  BENTO — adaptateurs, moteur, traces YAML, pipeline, heatmap       */
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[var(--hairline-strong)] border border-[var(--hairline-strong)] auto-rows-[minmax(160px,auto)]">
      {/* Adaptateurs — span 2 cols */}
      <div className="bento-card p-5 md:col-span-2 rounded-none">
        <div className="flex items-baseline justify-between">
          <span className="editorial-tag">Adaptateurs de modèles</span>
          <span className="editorial-meta">04 actifs</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-px bg-[var(--hairline-strong)] border border-[var(--hairline-strong)]">
          {ADAPTERS.map((a) => (
            <div key={a.name} className="flex items-center justify-between bg-[var(--card)] px-3 py-2.5">
              <span className="text-sm font-medium">{a.name}</span>
              <span className="flex items-center gap-1.5">
                <span className="hardtech-data text-[0.66rem] text-muted-foreground">{a.metric}</span>
                <span className="status-mark" />
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 hardtech-data text-[0.7rem] text-muted-foreground leading-relaxed">
          Routing adaptatif context-aware · bascule à chaud en cas de dégradation d&apos;un fournisseur.
        </p>
      </div>

      {/* Moteur Rust */}
      <div className="bento-card p-5 rounded-none">
        <div className="flex items-baseline justify-between">
          <span className="editorial-tag editorial-tag--ochre">Moteur d&apos;exécution</span>
          <span className="editorial-meta">REV.2.4</span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <InstrumentMark className="h-10 w-10 text-[var(--color-vermillion)]" />
          <div>
            <div className="font-[family-name:var(--font-newsreader)] text-lg italic">rust-core</div>
            <div className="hardtech-data text-[0.66rem] text-muted-foreground">ordinateur neuro-symbolique</div>
          </div>
        </div>
        <div className="mt-4 space-y-1.5 hardtech-data text-[0.7rem] border-t border-[var(--hairline)] pt-3">
          <div className="flex justify-between"><span>mémoire tampon</span><span className="text-[var(--color-vermillion)]">128k ctx</span></div>
          <div className="flex justify-between"><span>latence check</span><span className="text-[var(--color-vermillion)]">0.4 ms</span></div>
          <div className="flex justify-between"><span>arbitrage</span><span className="text-[var(--color-ochre)]">intervention ciblée</span></div>
        </div>
      </div>

      {/* Traces YAML */}
      <div className="bento-card p-5 rounded-none">
        <div className="flex items-baseline justify-between">
          <span className="editorial-tag editorial-tag--ultramarine">Traces vérifiables</span>
          <span className="editorial-meta">YAML</span>
        </div>
        <pre className="mt-3 hardtech-data text-[0.66rem] text-foreground/80 overflow-x-auto leading-relaxed">{YAML_TRACE}</pre>
      </div>

      {/* Pipeline */}
      <div className="bento-card p-5 md:col-span-2 rounded-none">
        <div className="flex items-baseline justify-between">
          <span className="editorial-tag">Transparence — Verifiable Autonomy</span>
          <span className="editorial-meta">04 étapes</span>
        </div>
        <div className="mt-4"><DeterministicPipeline /></div>
      </div>

      {/* Heatmap */}
      <div className="bento-card p-5 rounded-none">
        <div className="flex items-baseline justify-between">
          <span className="editorial-tag editorial-tag--ochre">Cartographie d&apos;incertitude</span>
          <span className="editorial-meta">192 zones</span>
        </div>
        <div className="mt-4"><UncertaintyHeatmap /></div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Panic Interrupt — sobre, pas de rayures jaunes cyberpunk           */
/* ------------------------------------------------------------------ */
function PanicInterrupt() {
  const [armed, setArmed] = useState(false);
  const [released, setReleased] = useState(false);
  return (
    <div className="relative border border-[var(--hairline-strong)] bg-[var(--card)]">
      <div className="hardtech-safe-stripes h-2 w-full opacity-30" />
      <div className="p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start lg:items-center">
          <div className="flex-1">
            <div className="flex items-baseline justify-between">
              <span className="editorial-tag editorial-tag--ochre">Panic Interrupt · contrôle manuel</span>
              <span className="editorial-meta">FIG. 04</span>
            </div>
            <h3 className="mt-3 text-2xl font-[family-name:var(--font-newsreader)] italic font-medium tracking-tight">
              Reprenez la main. <span className="text-[var(--color-vermillion)] not-italic font-semibold">À tout moment.</span>
            </h3>
            <p className="mt-2 text-muted-foreground max-w-xl text-sm leading-relaxed">
              Chaque boucle d&apos;agent expose un interrupteur d&apos;arrêt d&apos;urgence. Toute action humainement
              sensible est mise en attente d&apos;arbitrage — jamais exécutée dans le vide.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={() => { setArmed(true); setReleased(false); }}
                className="panic-release rounded-sm px-4 py-2 text-sm font-medium font-[family-name:var(--font-geist-mono)] uppercase tracking-wider text-[0.72rem]"
              >
                ⏻ Armer l&apos;interrupteur
              </button>
              <button
                onClick={() => { setReleased(true); setArmed(false); }}
                className="rounded-sm px-4 py-2 text-sm font-medium border border-[var(--hairline-strong)] text-muted-foreground hover:border-[var(--color-vermillion)] hover:text-[var(--color-vermillion)] transition-colors font-[family-name:var(--font-geist-mono)] uppercase tracking-wider text-[0.72rem]"
              >
                ✕ Relâcher
              </button>
            </div>
            <div className="mt-4 hardtech-data text-[0.7rem]">
              {released ? (
                <span className="text-[var(--color-moss)] flex items-center gap-1.5"><span className="status-mark" /> interrupteur relâché — les agents reprennent leur exécution.</span>
              ) : armed ? (
                <span className="text-[var(--color-ochre)] flex items-center gap-1.5"><span className="status-mark status-mark--warn" /> arrêt d&apos;urgence armé — toutes les boucles sont suspendues.</span>
              ) : (
                <span className="text-muted-foreground flex items-center gap-1.5"><span className="status-mark" /> état : veille — aucune intervention requise.</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div
              className={`h-24 w-24 rounded-full grid place-items-center border-2 transition-all duration-300 ${
                released
                  ? 'border-[var(--color-moss)] text-[var(--color-moss)]'
                  : armed
                  ? 'border-[var(--color-ochre)] text-[var(--color-ochre)]'
                  : 'border-[var(--hairline-strong)] text-muted-foreground'
              }`}
            >
              <span className="text-3xl font-[family-name:var(--font-newsreader)]">{released ? '→' : armed ? '■' : '⏸'}</span>
            </div>
            <span className="hardtech-data text-[0.64rem] text-muted-foreground uppercase tracking-wider">
              {released ? 'running' : armed ? 'emergency_lock' : 'standby'}
            </span>
          </div>
        </div>
      </div>
      <div className="hardtech-safe-stripes h-2 w-full opacity-30" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Landing complet — Editorial Instrument                             */
/* ------------------------------------------------------------------ */
export default function HardTechLanding() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV — header éditorial, hairline, pas de backdrop blur */}
      <header className="sticky top-0 z-40 border-b border-[var(--hairline-strong)] bg-background/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Gen3ia" width={32} height={32} className="h-8 w-8 rounded-sm" priority />
            <span className="font-[family-name:var(--font-newsreader)] text-xl italic font-medium tracking-tight">Gen3ia</span>
            <span className="hardtech-data text-[0.6rem] text-muted-foreground hidden sm:inline">REV.2.4</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <a href="#intelligence" className="hover:text-foreground transition-colors">Intelligence</a>
            <a href="#transparence" className="hover:text-foreground transition-colors">Transparence</a>
            <a href="#architecture" className="hover:text-foreground transition-colors">Architecture</a>
            <a href="#controle" className="hover:text-foreground transition-colors">Contrôle</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-[family-name:var(--font-geist-mono)] uppercase tracking-wider text-[0.72rem]">
              Connexion
            </Link>
            <Link href="/register" className="btn-signal rounded-sm px-4 py-2 text-sm font-[family-name:var(--font-geist-mono)] uppercase tracking-wider text-[0.72rem]">
              Démarrer
            </Link>
          </div>
        </div>
      </header>

      {/* HERO — grille éditoriale asymétrique 7/5 */}
      <section id="intelligence" className="relative editorial-grid border-b border-[var(--hairline-strong)]">
        <div className="relative mx-auto max-w-7xl px-5 sm:px-8 pt-20 pb-20 grid lg:grid-cols-12 gap-12 items-start">
          {/* Colonne gauche 7/12 */}
          <div className="lg:col-span-7 editorial-reveal">
            <div className="flex items-center gap-4 mb-6">
              <span className="editorial-eyebrow">Verifiable Autonomy</span>
              <span className="hardtech-data text-[0.66rem] text-muted-foreground">— Modèle 2026</span>
            </div>
            <h1 className="editorial-headline text-5xl sm:text-6xl lg:text-7xl">
              Le système d&apos;exploitation<br />
              pour agents IA{' '}
              <span className="text-[var(--color-vermillion)] italic">prouvés.</span>
            </h1>
            <p className="editorial-dropcap mt-8 text-base sm:text-lg text-foreground/80 max-w-xl leading-relaxed">
              Pas des résultats aveugles. Une autonomie <em className="text-[var(--color-vermillion)] not-italic font-medium">vérifiable</em> :
              chaque action est accompagnée de sa preuve de logique, de son hash et de sa marge d&apos;incertitude.
              Gen3ia orchestre des agents neuro-symboliques dont chaque étape est documentée, auditable,
              et interrompible à tout moment.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/register" className="btn-signal rounded-sm px-6 py-3 text-sm font-[family-name:var(--font-geist-mono)] uppercase tracking-wider text-[0.72rem]">
                Créer un compte →
              </Link>
              <a href="#architecture" className="btn-ghost rounded-sm px-6 py-3 text-sm font-[family-name:var(--font-geist-mono)] uppercase tracking-wider text-[0.72rem]">
                Voir l&apos;architecture
              </a>
            </div>
            <div className="mt-8 pt-6 border-t border-[var(--hairline)] flex items-center gap-6 hardtech-data text-[0.66rem] text-muted-foreground">
              <span className="flex items-center gap-2"><span className="status-mark" /> 4/4 noeuds opérationnels</span>
              <span className="opacity-40">/</span>
              <span>uptime 99.98%</span>
              <span className="opacity-40">/</span>
              <span>412 contraintes vérifiées</span>
            </div>
          </div>

          {/* Colonne droite 5/12 — panneau d'instrument */}
          <div className="lg:col-span-5 editorial-reveal" style={{ animationDelay: '0.15s' }}>
            <InstrumentPanel />
          </div>
        </div>

        {/* Ticker Proof of Correctness — remplacé par une bande statique éditoriale */}
        <div className="border-t border-[var(--hairline-strong)] bg-[var(--secondary)]">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-4 hardtech-data text-[0.66rem] text-muted-foreground uppercase tracking-wider">
            <span className="flex items-center gap-2"><span className="status-mark" /> proof::verif 7c4a…9e21</span>
            <span className="flex items-center gap-2"><span className="status-mark" /> proof::safety 9f2c…d41a</span>
            <span>incertitude médiane 0.012</span>
            <span>interventions humaines 0</span>
          </div>
        </div>
      </section>

      {/* ARCHITECTURE BENTO */}
      <section id="architecture" className="mx-auto max-w-7xl px-5 sm:px-8 py-24">
        <div className="mb-12 grid lg:grid-cols-12 gap-8 items-end">
          <div className="lg:col-span-7">
            <span className="editorial-eyebrow">02 · Architecture</span>
            <h2 className="editorial-headline mt-4 text-4xl sm:text-5xl">
              Une grille dense, <em className="text-[var(--color-vermillion)] not-italic">pas des pastilles.</em>
            </h2>
          </div>
          <p className="lg:col-span-5 text-muted-foreground text-sm leading-relaxed max-w-md">
            Adaptateurs de modèles, moteur Rust et traces YAML exposés comme des données —
            lisibles, vérifiables, auditables. Aucune logique cachée dans le décor.
          </p>
        </div>
        <BentoGrid />
      </section>

      {/* TRANSPARENCE — split éditorial */}
      <section id="transparence" className="border-t border-[var(--hairline-strong)] bg-[var(--secondary)]">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-24 grid lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-6">
            <span className="editorial-eyebrow">03 · Verifiable Autonomy</span>
            <h2 className="editorial-headline mt-4 text-4xl sm:text-5xl">
              L&apos;UI ne cache plus rien. <em className="text-[var(--color-vermillion)] not-italic">Elle prouve.</em>
            </h2>
            <p className="mt-6 text-muted-foreground text-sm leading-relaxed max-w-xl">
              Visualisez le cheminement exact de chaque décision : inférence neurale → vérification
              symbolique → check de sécurité Rust. Chaque étape expose un hash de preuve et sa marge d&apos;incertitude.
            </p>
            <div className="mt-8 space-y-5 border-t border-[var(--hairline)] pt-6">
              {[
                ['01', 'Barres déterministes', 'Chaque étape du pipeline est segmentée et mesurée — rien n’est décoratif.'],
                ['02', 'Hashes de vérification', 'Cliquez sur une preuve pour en dérouler la trace de logique brute.'],
                ['03', 'Cartographie d’incertitude', 'Les zones fragiles sont signalées pour intervention humaine.'],
              ].map(([num, t, d]) => (
                <div key={t} className="flex gap-4">
                  <span className="editorial-section-num shrink-0">{num}</span>
                  <div>
                    <div className="font-medium font-[family-name:var(--font-newsreader)] italic text-lg">{t}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-6 space-y-6">
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <span className="editorial-tag">Pipeline déterministe</span>
                <span className="editorial-meta">FIG. 02</span>
              </div>
              <div className="rounded-sm border border-[var(--hairline-strong)] p-5 bg-[var(--card)]">
                <DeterministicPipeline />
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <span className="editorial-tag editorial-tag--ultramarine">Preuves de logique</span>
                <span className="editorial-meta">FIG. 03</span>
              </div>
              <VerificationChain />
            </div>
          </div>
        </div>
      </section>

      {/* PANIC INTERRUPT / CONTRÔLE */}
      <section id="controle" className="mx-auto max-w-7xl px-5 sm:px-8 py-24">
        <div className="mb-12 max-w-2xl">
          <span className="editorial-eyebrow">04 · Panic Interrupt</span>
          <h2 className="editorial-headline mt-4 text-4xl sm:text-5xl">
            L&apos;autonomie, oui. <em className="text-[var(--color-ochre)] not-italic">L&apos;autorité, toujours la vôtre.</em>
          </h2>
        </div>
        <PanicInterrupt />
      </section>

      {/* CTA FINAL — éditorial, sobre */}
      <section className="border-t border-[var(--hairline-strong)] editorial-grid">
        <div className="mx-auto max-w-4xl px-5 sm:px-8 py-24 text-center">
          <span className="editorial-eyebrow justify-center">05 · Déploiement</span>
          <h2 className="editorial-headline mt-6 text-4xl sm:text-5xl">
            Déployez des agents que vous <em className="text-[var(--color-vermillion)] not-italic">pouvez prouver.</em>
          </h2>
          <p className="mt-6 text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">
            Gen3ia est prêt pour 2026 : raisonnement neuro-symbolique, transparence vérifiable
            et contrôle manuel garanti. Aucun agent n&apos;agit dans le vide.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/register" className="btn-signal rounded-sm px-6 py-3 text-sm font-[family-name:var(--font-geist-mono)] uppercase tracking-wider text-[0.72rem]">
              Créer un compte gratuit — 10 crédits →
            </Link>
            <Link href="/login" className="btn-ghost rounded-sm px-6 py-3 text-sm font-[family-name:var(--font-geist-mono)] uppercase tracking-wider text-[0.72rem]">
              Se connecter
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER — colophon éditorial */}
      <footer className="border-t border-[var(--hairline-strong)] bg-[var(--secondary)]">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-10 grid md:grid-cols-3 gap-8 items-start">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center h-7 w-7 rounded-sm border border-[var(--color-vermillion)] text-[var(--color-vermillion)]">
                <InstrumentMark className="h-4 w-4" />
              </span>
              <span className="font-[family-name:var(--font-newsreader)] text-lg italic font-medium">Gen3ia</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed max-w-xs">
              Système d&apos;exploitation pour agents IA vérifiables. Fabriqué au Cameroun.
            </p>
          </div>
          <div className="hardtech-data text-[0.66rem] text-muted-foreground uppercase tracking-wider space-y-1.5">
            <div>verifiable autonomy · rust-core</div>
            <div>© 2026 gen3ia · cameroun</div>
            <div className="text-[var(--color-vermillion)]">REV.2.4 · modèle 2026</div>
          </div>
          <div className="hardtech-data text-[0.66rem] text-muted-foreground uppercase tracking-wider space-y-1.5 md:text-right">
            <div>contact@gen3ia.online</div>
            <div>github.com/missock237-spec/Gen3ia</div>
            <div>uptime 99.98% · 4/4 noeuds</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
