/**
 * API Route: /api/browser/scrape
 * POST: Scrape a URL for content
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createWebScraper } from '@/lib/browser/web-scraper';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 20, windowMs: 60000 },
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { url, mode, selectors, options, query, maxResults, schema } = body;

    if (!url && !query) {
      const res = NextResponse.json(
        { error: 'URL or query is required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    const scraper = createWebScraper(auth.userId);

    if (mode === 'search' && query) {
      const result = await scraper.searchWeb(query, maxResults);
      const res = NextResponse.json({ result });
      return secureResponse(res, request);
    }

    if (!url) {
      const res = NextResponse.json({ error: 'URL is required for scrape modes' }, { status: 400 });
      return secureResponse(res, request);
    }

    try {
      new URL(url);
    } catch {
      const res = NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
      return secureResponse(res, request);
    }

    if (mode === 'article') {
      const result = await scraper.extractArticle(url);
      const res = NextResponse.json({ result });
      return secureResponse(res, request);
    }

    if (mode === 'products') {
      const result = await scraper.extractProducts(url);
      const res = NextResponse.json({ result });
      return secureResponse(res, request);
    }

    if (mode === 'structured' && schema) {
      const result = await scraper.extractStructured(url, schema);
      const res = NextResponse.json({ result });
      return secureResponse(res, request);
    }

    // Default: full scrape
    const result = await scraper.scrapeUrl(url, {
      selectors,
      ...options,
    });

    const res = NextResponse.json({ result });
    return secureResponse(res, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scraping failed';
    const res = NextResponse.json({ error: message }, { status: 500 });
    return secureResponse(res, request);
  }
}
