import { describe, expect, it } from 'vitest';
import nextConfig from './next.config.mjs';

describe('browser device permissions policy', () => {
  it('keeps same-origin location and motion available across client navigation', async () => {
    const rules = await nextConfig.headers?.();
    const policyHeaders = rules?.flatMap(rule => rule.headers)
      .filter(header => header.key.toLowerCase() === 'permissions-policy');

    expect(rules).toHaveLength(1);
    expect(policyHeaders).toEqual([{
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(self), accelerometer=(self), gyroscope=(self)',
    }]);
  });
});
