// GET /api/recover-abstract?doi=10.1257/aer.20190623
//
// Recovers a missing abstract for a single DOI by running the server-side
// cascade (Crossref → DOI landing page). One DOI per request, so each
// invocation finishes well inside the Vercel Hobby 10s function timeout — the
// "scan" is many of these short calls driven from the browser, never one
// long-running request.
//
// Why server-side: it sidesteps the CORS walls on Crossref and publisher pages
// (a browser fetch of either is blocked).

import { NextResponse } from 'next/server';
import { recoverAbstract } from '@/utils/abstractRecovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const doi = new URL(req.url).searchParams.get('doi')?.trim();
  if (!doi) {
    return NextResponse.json(
      { error: 'Missing required `doi` query parameter.' },
      { status: 400 },
    );
  }

  try {
    const result = await recoverAbstract(doi);
    if (!result) {
      // 200 with found:false — "no abstract anywhere" is a normal outcome,
      // not an error the client should treat as a failure.
      return NextResponse.json(
        { found: false, doi },
        { headers: { 'Cache-Control': 'public, max-age=86400' } },
      );
    }
    return NextResponse.json(
      { found: true, doi, ...result },
      // Abstracts don't change; let the browser/CDN cache the answer a day.
      { headers: { 'Cache-Control': 'public, max-age=86400' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Recovery failed.' },
      { status: 502 },
    );
  }
}
