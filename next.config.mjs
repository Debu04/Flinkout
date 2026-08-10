/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const securityHeaders = [
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), accelerometer=(), gyroscope=()' },
      ...(process.env.NODE_ENV === 'production'
        ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
        : []),
    ];
    return [
      { source: '/(.*)', headers: securityHeaders },
      {
        source: '/record',
        headers: [{
          key: 'Permissions-Policy',
          value: 'camera=(), microphone=(), geolocation=(self), accelerometer=(self), gyroscope=(self)',
        }],
      },
    ];
  },
};

export default nextConfig;
