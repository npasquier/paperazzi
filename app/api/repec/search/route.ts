// RePEc-native mode was removed — paperazzi now stays entirely on
// OpenAlex. This file is kept as a stubbed 410 so existing client URLs
// (deep links, third-party bookmarks) fail loudly instead of silently
// returning the wrong-shape envelope. (The unused utils/repec/ helpers
// were deleted in the 2026-06 audit; this stub stays because it still
// serves a purpose for stale deep links.)
import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json(
    {
      results: [],
      meta: { count: 0, page: 1, per_page: 0 },
      error: 'RePEc backend was removed; use the OpenAlex /api/search endpoint.',
    },
    { status: 410 },
  );
}
