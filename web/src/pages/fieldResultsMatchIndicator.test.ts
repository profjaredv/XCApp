import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// A field-results CSV can upload and normalize fine while matching NONE
// of this team's own athletes by name — the upload looks like a success
// and this team's own scoring/standing/Program-tab numbers see none of
// it. This surfaces the match count on the Field Results screen itself,
// so a coach can tell that apart from "recalculation just hasn't
// happened yet" without guessing.

const read = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const page = code(read('FieldResultsPage.tsx'));

describe('Field Results roster-match indicator', () => {
  it('is shown only once there is field data AND something of ours to match against', () => {
    expect(page).toContain('{race.hasFieldData && race.ourResultCount > 0 && (');
  });

  it('calls out a total mismatch loudly — destructive badge, not a quiet note', () => {
    const block = page.slice(page.indexOf('{race.hasFieldData && race.ourResultCount > 0 && ('), page.indexOf('All {race.ourResultCount}'));
    expect(block).toContain('race.ourMatchedCount === 0');
    expect(block).toContain('variant="destructive"');
    expect(block).toContain('check');
  });

  it('flags a partial match distinctly from zero and from a full match', () => {
    const block = page.slice(page.indexOf('{race.hasFieldData && race.ourResultCount > 0 && ('), page.indexOf('All {race.ourResultCount}'));
    expect(block).toContain('race.ourMatchedCount < race.ourResultCount');
  });

  it('stays quiet — no badge, just muted text — once everything matched', () => {
    expect(page).toContain('All {race.ourResultCount} of your athletes matched');
  });
});
