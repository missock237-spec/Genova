import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import './editorial.css';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { siteConfig } from '@/lib/seo/config';
import { ErrorBoundary, ErrorProvider } from '@/components/error-boundary';
import { UpdateBannerClient } from '@/components/update-banner-client';

// geist package provides the font variables directly
const geistSans = GeistSans;
const geistMono = GeistMono;

const siteUrl = siteConfig.url;
const siteName = siteConfig.name;
const title = "gen3ia - Système d'exploitation pour agents IA";
const description = siteConfig.description;

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#00F5FF' },
  ],
  colorScheme: 'dark light',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: `%s | ${siteName}` },
  description,
  keywords: ['Gen3ia', 'IA', 'agents IA', 'automatisation', 'SaaS', 'AI Operating System',
    'agent autonome', 'ReAct', 'Cameroun', 'Afrique', 'AI agents', 'voice AI',
    'AI automation platform', 'LLM', 'GPT', 'Claude', 'verifiable autonomy',
    'proof of correctness', 'agents neuro-symboliques'],
  authors: [{ name: siteConfig.author, url: siteUrl }],
  creator: siteConfig.author,
  publisher: siteConfig.author,
  applicationName: siteName,
  generator: 'Next.js',
  referrer: 'origin-when-cross-origin',
  category: 'technology',
  classification: 'AI Agent Platform',
  icons: {
    icon: [
      { url: '/favicon-gen3ia.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/favicon-gen3ia.png', sizes: '180x180', type: 'image/png' }],
    other: [{ rel: 'mask-icon', url: '/icon.svg', color: '#00F5FF' }],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: siteName,
    statusBarStyle: 'black-translucent',
    startupImage: `${siteUrl}/favicon-gen3ia.png`,
  },
  openGraph: {
    type: 'website', locale: siteConfig.locale, alternateLocale: siteConfig.alternateLocale,
    url: siteUrl, siteName, title, description,
    countryName: 'Cameroun',
    emails: ['contact@gen3ia.online'],
    images: [{ url: `${siteUrl}/og-image.png`, width: 1200, height: 630, alt: siteName }],
  },
  twitter: {
    card: 'summary_large_image',
    site: siteConfig.twitterHandle,
    creator: siteConfig.twitterHandle,
    title, description,
    images: [`${siteUrl}/og-image.png`],
  },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  alternates: {
    canonical: siteUrl,
    languages: { 'fr-FR': siteUrl, 'en-US': `${siteUrl}/en`, 'ar-SA': `${siteUrl}/ar` },
  },
  formatDetection: { telephone: true, date: true, address: true, email: true, url: true },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // ============================================================
  // T24 — Propagation du nonce CSP aux scripts inline
  // ============================================================
  //  Le middleware (src/middleware.ts) génère un nonce par requête
  //  et le place dans l'header "x-nonce". Next.js 15 App Router
  //  propage automatiquement le nonce passé à <html nonce={...}>
  //  vers TOUS les scripts inline générés par Next.js (notamment
  //  les buffers RSC __next_f.push([...]) et les scripts de
  //  preload). Sans cette propagation, la CSP bloque ces scripts
  //  en production → React ne peut pas hydrater l'HTML SSR →
  //  le spinner "Chargement de Gen3ia..." reste bloqué indéfiniment.
  // ============================================================
  const nonce = (await headers()).get('x-nonce') ?? '';

  // ============================================================
  // URL du service worker versionnée par buildId : force le
  // navigateur à re-vérifier sw.js à chaque chargement de page
  // (updateViaCache: 'none'). Sans ce paramètre de version, un
  // sw.js en cache HTTP peut bloquer la détection des nouveaux
  // déploiements pendant des heures.
  // ============================================================
  const swVersion =
    process.env.NEXT_PUBLIC_BUILD_ID ||
    process.env.NEXT_PUBLIC_GIT_SHA ||
    'dev';
  const swUrl = `/sw.js?v=${encodeURIComponent(swVersion)}`;

  return (
    <html lang="fr" nonce={nonce} suppressHydrationWarning>
      <head>
        <link rel="me" href={siteConfig.githubUrl} />
        <link rel="author" href={`${siteUrl}/about`} />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0A0A0B" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* Newsreader — serif éditorial chargé via Google Fonts CDN */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap"
        />
        {/* SW force-upgrade: unregister old SWs + reload on new SW, URL versionnée par buildId */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){
              if('serviceWorker' in navigator){
                var r=false;
                var sw='${swUrl}';
                navigator.serviceWorker.addEventListener('controllerchange',function(){
                  if(!r){r=true;window.location.reload();}
                });
                navigator.serviceWorker.addEventListener('message',function(e){
                  if(e.data&&e.data.type==='FORCE_RELOAD'&&!r){r=true;window.location.reload();}
                });
                navigator.serviceWorker.register(sw,{scope:'/',updateViaCache:'none'}).then(function(reg){
                  if(reg.update){reg.update().catch(function(){});}
                  if(reg.waiting){reg.waiting.postMessage({type:'SKIP_WAITING'});}
                  if(reg.installing){reg.installing.addEventListener('statechange',function(){
                    if(reg.waiting){reg.waiting.postMessage({type:'SKIP_WAITING'});}
                  });}
                }).catch(function(){});
              }
            })();`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <ErrorProvider>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </ErrorProvider>
          <Toaster richColors position="top-right" />
          <UpdateBannerClient />
        </ThemeProvider>
      </body>
    </html>
  );
}
