import { readdirSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(process.cwd(), 'src');
const sourceExtensions = new Set(['.ts', '.tsx']);

function collectSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectSources(path);
    if (!sourceExtensions.has(extname(entry.name)) || entry.name.endsWith('.test.ts')) return [];
    return [readFileSync(path, 'utf8')];
  });
}

const sourceFiles = collectSources(sourceRoot);
const gradientUtilities = [...new Set(
  sourceFiles.flatMap((source) => source.match(/bg-\[[^\]]*(?:gradient-brand|linear-gradient)[^\]]*\]/g) ?? []),
)];

describe('Tailwind gradient utilities', () => {
  it('generates background-image declarations for gradient classes used by the app', async () => {
    const tailwind = await compile('@tailwind utilities;');

    expect(gradientUtilities.length).toBeGreaterThan(0);
    for (const utility of gradientUtilities) {
      expect(tailwind.build([utility]), utility).toMatch(/background-image\s*:/);
    }
  });

  it('keeps a navy solid fallback on every brand gradient surface', async () => {
    const tailwind = await compile('@tailwind utilities;');
    expect(tailwind.build(['bg-[var(--color-navy)]'])).toContain('background-color: var(--color-navy);');

    const brandGradientLines = sourceFiles
      .flatMap((source) => source.split('\n'))
      .filter((line) => line.includes('bg-[image:var(--gradient-brand'));

    expect(brandGradientLines.length).toBeGreaterThan(0);
    for (const line of brandGradientLines) {
      expect(line).toContain('bg-[var(--color-navy)]');
    }
  });
});
