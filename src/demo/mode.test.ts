import { afterEach, describe, expect, it } from 'vitest';
import { isDemoMode } from './mode';

const original = {
  ORG_DEMO: process.env.ORG_DEMO,
  DATABASE_URL: process.env.DATABASE_URL,
  VERCEL: process.env.VERCEL,
};

afterEach(() => {
  for (const key of ['ORG_DEMO', 'DATABASE_URL', 'VERCEL'] as const) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

describe('isDemoMode', () => {
  it('uses the in-memory demo when DATABASE_URL is missing', () => {
    delete process.env.ORG_DEMO;
    delete process.env.DATABASE_URL;
    delete process.env.VERCEL;
    expect(isDemoMode()).toBe(true);
  });

  it('uses the live database for a local Docker URL off Vercel', () => {
    delete process.env.ORG_DEMO;
    delete process.env.VERCEL;
    process.env.DATABASE_URL = 'postgresql://omni:omni@127.0.0.1:55433/omni';
    expect(isDemoMode()).toBe(false);
  });

  it('uses the in-memory demo when Vercel is given a localhost DATABASE_URL', () => {
    delete process.env.ORG_DEMO;
    process.env.VERCEL = '1';
    process.env.DATABASE_URL = 'postgresql://omni:omni@127.0.0.1:55433/omni';
    expect(isDemoMode()).toBe(true);
  });
});
