import { describe, expect, it } from 'vitest';
import { getSafeRedirect } from './redirects';

describe('hosted checkout redirect safety', () => {
  it('allows same-origin relative checkout routes', () => {
    expect(getSafeRedirect('/access/checkout?intentId=abc')).toBe('http://localhost:3000/access/checkout?intentId=abc');
  });

  it('allows hosted HTTPS provider checkout pages', () => {
    expect(getSafeRedirect('https://checkout.example.test/pay/abc')).toBe('https://checkout.example.test/pay/abc');
  });

  it('rejects javascript and insecure external redirects', () => {
    expect(getSafeRedirect('javascript:alert(1)')).toBeNull();
    expect(getSafeRedirect('http://evil.example/pay')).toBeNull();
  });
});
