import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Extracted out of GroupsPage.tsx so the Groups board and the group's Day
// view (GroupDayPage) send someone to cross training through the exact
// same dialog and mutation, rather than two copies that could drift.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const dialog = code(read('components/groups/XTrainingSendDialog.tsx'));
const groupsPage = code(read('pages/GroupsPage.tsx'));
const groupDayPage = code(read('pages/GroupDayPage.tsx'));

describe('cross training send dialog', () => {
  it('requires a reason before Send is enabled', () => {
    expect(dialog).toContain('disabled={!reason.trim() || sendToXTraining.isPending}');
  });

  it('reports a callback after a successful send, for callers that need to react', () => {
    expect(dialog).toContain('onSent?.(athlete.id)');
  });

  it('is used by both the Groups board and the group Day view, not duplicated', () => {
    expect(groupsPage).toContain("from '@/components/groups/XTrainingSendDialog'");
    expect(groupsPage).not.toContain('X_TRAINING_DAY_OPTIONS');
    expect(groupDayPage).toContain("from '@/components/groups/XTrainingSendDialog'");
  });
});
