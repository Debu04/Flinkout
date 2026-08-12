/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const securityHeaders = [
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      // Permissions Policy belongs to the active document, not to an App Router
      // screen. Keep Flinkout's same-origin activity features available after
      // client-side navigation while continuing to block camera and microphone.
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), accelerometer=(self), gyroscope=(self)' },
      ...(process.env.NODE_ENV === 'production'
        ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
        : []),
    ];
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
