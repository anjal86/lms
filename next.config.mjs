/** @type {import('next').NextConfig} */

function configuredSupabase() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

const isDev = process.env.NODE_ENV === 'development';
const supabaseUrl = configuredSupabase();
const supabaseOrigin = supabaseUrl?.origin || '';
const supabaseWsOrigin = supabaseOrigin
  ? supabaseOrigin.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
  : '';

const remotePatterns = [
  { protocol: 'https', hostname: 'images.unsplash.com' },
  { protocol: 'https', hostname: 'api.dicebear.com' },
  { protocol: 'https', hostname: 'ui-avatars.com' },
  { protocol: 'https', hostname: '**.supabase.co' },
];

if (supabaseUrl && !supabaseUrl.hostname.endsWith('.supabase.co')) {
  remotePatterns.push({
    protocol: supabaseUrl.protocol.slice(0, -1),
    hostname: supabaseUrl.hostname,
    ...(supabaseUrl.port ? { port: supabaseUrl.port } : {}),
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  images: { remotePatterns },
  async headers() {
    const imgSources = [
      "'self'",
      'data:',
      'blob:',
      'https://images.unsplash.com',
      'https://api.dicebear.com',
      'https://ui-avatars.com',
      'https://*.supabase.co',
      supabaseOrigin,
    ].filter(Boolean);
    const connectSources = [
      "'self'",
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'http://localhost:8000',
      'ws://localhost:8000',
      supabaseOrigin,
      supabaseWsOrigin,
    ].filter(Boolean);

    // React/Turbopack use eval() for development-only debugging features.
    // Keep unsafe-eval out of production CSP.
    const scriptSources = ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])];

    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "object-src 'none'",
      `script-src ${scriptSources.join(' ')}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src ${[...new Set(imgSources)].join(' ')}`,
      "font-src 'self' data:",
      `connect-src ${[...new Set(connectSources)].join(' ')}`,
      "media-src 'self' blob:",
    ].join('; ');

    return [{
      source: '/(.*)',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      ],
    }];
  },
};

export default nextConfig;
