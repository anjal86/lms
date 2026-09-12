import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_HOST_PATTERNS = [
  /fbcdn\.net$/i,
  /fbsbx\.com$/i,
  /facebook\.com$/i,
  /cdninstagram\.com$/i,
  /instagram\.com$/i,
  /whatsapp\.net$/i,
  /tiktokcdn\.com$/i,
  /unsplash\.com$/i,
  /dicebear\.com$/i,
  /ui-avatars\.com$/i,
];

function isAllowedHost(host: string): boolean {
  return ALLOWED_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return new NextResponse('Invalid url parameter', { status: 400 });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return new NextResponse('Invalid protocol', { status: 400 });
  }

  // Security: prevent SSRF and internal network probing
  if (!isAllowedHost(parsed.hostname)) {
    return new NextResponse('Host not allowed for proxy', { status: 403 });
  }

  try {
    const rangeHeader = request.headers.get('range');
    const upstreamHeaders: HeadersInit = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept': '*/*',
    };
    if (rangeHeader) {
      upstreamHeaders['Range'] = rangeHeader;
    }

    const upstream = await fetch(parsed.toString(), {
      headers: upstreamHeaders,
      cache: 'no-store',
    });

    if (!upstream.ok && upstream.status !== 304 && upstream.status !== 206) {
      console.warn('Proxy upstream failed:', upstream.status, parsed.hostname);
      return new NextResponse(`Upstream failed: ${upstream.status}`, { status: upstream.status });
    }

    const responseHeaders = new Headers();
    const forwardHeaders = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
      'last-modified',
    ];

    for (const h of forwardHeaders) {
      const val = upstream.headers.get(h);
      if (val) responseHeaders.set(h, val);
    }

    // Cache media on the client for 24 hours
    responseHeaders.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    responseHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error('Media proxy error:', err);
    return new NextResponse(`Media proxy error: ${err?.message || 'Unknown error'}`, { status: 502 });
  }
}
