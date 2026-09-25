import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { APP_VERSION } from '../version';

// A small build identifier under the sidebar logo — something a coach can
// point to when reporting "did my fix actually deploy" without having to
// read behavior alone. See version.ts for why it's a hand-bumped string,
// not a hash.

describe('APP_VERSION', () => {
  it('is a simple, human-readable version string, not a hash or timestamp', () => {
    expect(APP_VERSION).toMatch(/^\d+(\.\d+)*$/);
  });
});

describe('sidebar version display', () => {
  const layout = fs.readFileSync(path.join(__dirname, 'Layout.tsx'), 'utf8');

  it('imports the shared version constant rather than hardcoding a string here', () => {
    expect(layout).toContain("import { APP_VERSION } from '@/version';");
  });

  it('renders it under the expanded logo, in small muted type', () => {
    const expanded = layout.slice(layout.indexOf('LeadPack XC'), layout.indexOf('LeadPack XC') + 400);
    expect(expanded).toContain('Version {APP_VERSION}');
    expect(expanded).toContain('text-[10px]');
    expect(expanded).toContain('text-muted-foreground');
  });

  it('is not crammed into the collapsed logo state, which has no room for it', () => {
    const collapsedBlock = layout.slice(layout.indexOf('{isCollapsed ? ('), layout.indexOf(') : ('));
    expect(collapsedBlock).not.toContain('APP_VERSION');
  });
});
