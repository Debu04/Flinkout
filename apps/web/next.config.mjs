/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{
      source: '/record',
      headers: [{
        key: 'Permissions-Policy',
        value: 'geolocation=(self), accelerometer=(self), gyroscope=(self)',
      }],
    }];
  },
};

export default nextConfig;
