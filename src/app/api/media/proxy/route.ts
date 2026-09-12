import { NextResponse } from 'next/server';
import { isAllowedMediaContentType, validateRemoteMediaUrl } from '@/lib/security/media-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_REDIRECTS = 3;
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const RANGE_PATTERN = /^bytes=\d*-\d*$/i;

async function fetchValidatedMedia(initialUrl: URL, rangeHeader: string | null) {
  let current = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const headers: HeadersInit = {
      Accept: 'image/*,audio/*,video/*,application/pdf,application/octet-stream;q=0.9,*/*;q=0.1',
      'User-Agent': 'Travel-LMS-Media-Proxy/1.0',
    };
    if (rangeHeader && RANGE_PATTERN.test(rangeHeader)) headers.Range = rangeHeader;

    const response = await fetch(current, {
      headers,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(12_000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirectCount === MAX_REDIRECTS) throw new Error('Media redirect was rejected.');
      current = await validateRemoteMediaUrl(new URL(location, current).toString());
      continue;
    }

    return response;
  }

  throw new Error('Too many media redirects.');
}

export async function GET(request: Request) {
  const targetUrl = new URL(request.url).searchParams.get('url');
  if (!targetUrl) return new NextResponse('Missing url parameter', { status: 400 });

  let parsed: URL;
  try {
    parsed = await validateRemoteMediaUrl(targetUrl);
  } catch {
    return new NextResponse('Media URL is not allowed', { status: 403 });
  }

  const requestedRange = request.headers.get('range');
  if (requestedRange && !RANGE_PATTERN.test(requestedRange)) {
    return new NextResponse('Invalid Range header', { status: 416 });
  }

  try {
    const upstream = await fetchValidatedMedia(parsed, requestedRange);
    if (!upstream.ok && upstream.status !== 206) {
      console.warn('Media proxy upstream failed:', upstream.status, parsed.hostname);
      return new NextResponse('Media unavailable', { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 });
    }

    const contentType = upstream.headers.get('content-type');
    if (!isAllowedMediaContentType(contentType)) {
      return new NextResponse('Unsupported media type', { status: 415 });
    }

    const contentLength = Number(upstream.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_MEDIA_BYTES) {
      return new NextResponse('Media is too large', { status: 413 });
    }

    const responseHeaders = new Headers();
    for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const value = upstream.headers.get(header);
      if (value) responseHeaders.set(header, value);
    }
    responseHeaders.set('Cache-Control', 'private, max-age=3600, stale-while-revalidate=86400');
    responseHeaders.set('Cross-Origin-Resource-Policy', 'same-origin');
    responseHeaders.set('Referrer-Policy', 'no-referrer');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('Vary', 'Range');

    let streamedBytes = 0;
    const limitedBody = upstream.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        streamedBytes += chunk.byteLength;
        if (streamedBytes > MAX_MEDIA_BYTES) {
          controller.error(new Error('Media response exceeded the size limit.'));
          return;
        }
        controller.enqueue(chunk);
      },
    })) ?? null;

    return new NextResponse(limitedBody, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Media proxy fetch failed:', error instanceof Error ? error.message : 'Unknown error');
    return new NextResponse('Media proxy request failed', { status: 502 });
  }
}
