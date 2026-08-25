// next.config.mjs — config source de vérité (ESM, Next.js 14 compatible)
// Phase 1.1 — Fondations : sécurité, compression, images optimisées, redirects.
// NOTE : Next.js 14 ne supporte pas next.config.ts (ajouté dans Next.js 15+).
//        Pour rester sur une source unique, on utilise .mjs qui est supporté
//        nativement par Next.js 14, 15 et 16. Lors du passage à Next 15+,
//        ce fichier peut être renommé en next.config.ts si souhaité.
// NOTE CSP : Content-Security-Policy est gérée par src/middleware.ts (CSP par nonce),
// on ne la définit PAS ici pour éviter tout conflit avec la CSP dynamique du middleware.

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ——— Headers de sécurité HTTP (COOP/COEP, X-Frame-Options, etc.) ———
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

// ——— Redirections temporaires (307) — pas permanentes (307) ———
// IMPORTANT: on utilise 307 (Temporary Redirect) et NON 308 (Permanent)
// pour éviter que le navigateur ne cache la redirection côté client.
// Avec 308, un navigateur qui a visité la page ne repasse plus par le
// serveur et applique la redirection à vie, même si on la supprime
// ensuite. 307 force une vérification serveur à chaque fois.
const redirects = () => [
  { source: '/home', destination: '/', permanent: false },
  // Toutes les anciennes routes /dashboard/* redirigent vers le SPA dashboard à /
  { source: '/dashboard/:path*', destination: '/', permanent: false },
];

const nextConfig = {
  // Turbopack config (silences Next.js 16 Turbopack default warning)
  turbopack: {
    // Stable module IDs → smaller long-term cache
    moduleIds: 'deterministic',
  },

  // Mode standalone retiré — Vercel gère l'output nativement,
  // et standalone mode provoque des erreurs de copy des client-reference-manifest
  // pour les routes dynamiques avec parentheses (app router).
  // output: 'standalone',

  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // ——— Production hardening ———
  // Tree-shake audit logs in production (pino, debug, etc.)
  // Reduces bundle size + prevents accidental PII leakage via logs.
  productionBrowserSourceMaps: false, // already at bottom; kept for clarity

  // ——— Tolérance build (préviews branches feature) ———
  // Les branches feature/fix peuvent avoir du code en cours de développement
  // avec des erreurs TypeScript ou ESLint. On ignore ces erreurs pendant le
  // build Vercel pour que la preview se déploie quand même.
  // Le CI GitHub Actions (ci.yml) reste strict sur main.
  // NEXT_PUBLIC_STRICT_BUILD=1 permet de forcer le strict pour un audit.
  typescript: {
    ignoreBuildErrors: process.env.NEXT_PUBLIC_STRICT_BUILD !== '1',
  },
  eslint: {
    ignoreDuringBuilds: process.env.NEXT_PUBLIC_STRICT_BUILD !== '1',
  },

  // ——— Modern optimizations (Next.js 15+) ———
  experimental: {
    // Tree-shake large icon libraries (lucide-react has 50k+ icons)
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@radix-ui/react-icons',
      'recharts',
      'react-hook-form',
      'date-fns',
    ],
    // Smaller CSS via dead-code elimination
    // NOTE: optimizeCss requires 'critters' package — not installed in this repo.
    // To enable: `npm i -D critters` then uncomment.
    // optimizeCss: true,
    // NOTE: workerThreads disabled — incompatible with the custom webpack(config)
    // function below (functions are not structured-cloneable across worker threads,
    // triggers "DataCloneError" during build). Re-enable only after refactoring
    // webpack customizations into a static config.
    // workerThreads: true,
  },

  // ——— Optimisation des images ———
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [420, 640, 768, 1024, 1280, 1536],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60,
    remotePatterns: [
      { protocol: 'https', hostname: '*.githubusercontent.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: 'cdn.huggingface.co' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // Assets statiques Next.js: hashés par build → cache immutable.
        // Le hash change à chaque build, donc si le navigateur a une vieille
        // version en cache, il la utilisera mais le HTML demandera les
        // nouveaux hashes → pas de stale bug.
        source: '/_next/static/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // HTML: ne JAMAIS cacher — sinon le navigateur sert une vieille
        // version sans re-demander le serveur. Sans ce header, Vercel
        // ajoute déjà "cache-control: public, max-age=0, must-revalidate"
        // ce qui force une revalidation. On l'explicite ici pour être sûr.
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        // /sw.js: ne JAMAIS cacher — sinon le navigateur garde un vieux SW
        // qui sert du vieux contenu. Le SW lui-même gère le cache applicatif.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },

  async rewrites() {
    // SPA routes — toutes ces URLs servent src/app/page.tsx (SPA).
    // page.tsx lit window.location.pathname pour setter currentView.
    const spaPaths = [
      '/dashboard', '/agents', '/agent-chat', '/automation', '/guardrails',
      '/coordination', '/settings', '/approvals', '/analytics', '/billing',
      '/developers', '/voice', '/images', '/integrations', '/notifications',
      '/scheduler', '/prompts',
    ];
    return spaPaths.map((p) => ({
      source: p,
      destination: '/',
    }));
  },

  async redirects() {
    return redirects();
  },

  // Exclude native modules that can't run on Vercel serverless
  serverExternalPackages: [
    'isolated-vm',
    '@valkey/valkey-glide',
    'bullmq',
    'ioredis',
    'redis',
    'better-sqlite3',
    'sqlite3',
    'canvas',
    'sharp',
    'argon2',
  ],

  webpack: (config) => {
    config.resolve.alias['@'] = path.join(__dirname, 'src');
    // NOTE: z-ai-web-dev-sdk alias REMOVED — real package now installed via npm.
    // Was: alias to src/lib/__stubs__/z-ai-web-dev-sdk.ts (returned fake responses).
    // Now: bundler resolves to node_modules/z-ai-web-dev-sdk (real ZAI SDK).
    // Rust NAPI crate — non compile sur Vercel.
    // Le require() dynamique dans agent-security-middleware.ts construit
    // le chemin a l'execution (join de segments), donc aucun bundler
    // ne tente de le resoudre au build. Ces alias sont conserves
    // comme filet de securite pour webpack statique.
    config.resolve.alias['./agent-safety.node'] = false;
    config.resolve.alias['agent-safety.node'] = false;
    // Workspace package — resolve to source (avoids needing workspace:* dependency
    // which can break with npm install --legacy-peer-deps on Vercel).
    config.resolve.alias['@gen3ia/agent-safety'] = path.join(__dirname, 'packages/agent-safety/index.js');

    // Modules optionnels/non-installés sur certaines branches feature
    // Alias vers false = webpack les remplace par un objet vide au lieu de crasher.
    const optionalModules = [
      '@prisma/client',
      '@whiskeysockets/baileys',
      '@whiskeysockets/baileys/lib/Utils/logger.js',
      '@hapi/boom',
      'react-helmet',
    ];
    for (const mod of optionalModules) {
      if (!config.resolve.alias[mod]) {
        config.resolve.alias[mod] = false;
      }
    }

    // Mark native modules as external (can't be bundled on Vercel)
    config.externals = config.externals || [];
    config.externals.push({
      'isolated-vm': 'commonjs isolated-vm',
      '@valkey/valkey-glide': 'commonjs @valkey/valkey-glide',
    });

    return config;
  },

  // Disable source maps in production browser bundle (security + bundle size).
  // Server source maps are still generated for Sentry symbolication.
  productionBrowserSourceMaps: false,

  // ——— Vercel-specific ———
  // Allow Vercel to leverage its native Image Optimization at the edge.
  // (Next.js 15+)
  staticPageGenerationTimeout: 120, // 2 min — large monorepo cold builds
};

export default nextConfig;
