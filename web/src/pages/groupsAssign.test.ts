import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Guards on the group assignment control.
//
// The bug: the "Assign to group…" dropdown mapped only trainingGroups, so
// captain and custom groups were structurally impossible to reach from it.
// The only way to put someone in a captain group was to open that group's
// own dialog and re-find them.
//
// The fix has a trap in it. pendingChanges is one-group-per-athlete and
// drives the training board, so routing a captain group through it would
// replace the athlete's TRAINING membership and then make them vanish
// from the board, since a captain group has no column. Captain and custom
// membership is additive — the New Group dialog says so itself: "Captain
// and Custom groups can run alongside a training group."

const SOURCE = fs.readFileSync(
  path.join(__dirname, 'GroupsPage.tsx'),
  'utf8'
);
/** Comments here describe the very things the assertions forbid. */
const code = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
  .join('\n');

describe('group assignment', () => {
  it('offers captain and custom groups, not only training groups', () => {
    const dropdown = code.slice(
      code.indexOf('placeholder="Assign to group…"'),
      code.indexOf('</Select>', code.indexOf('placeholder="Assign to group…"'))
    );
    expect(dropdown).toContain('trainingGroups.map');
    expect(dropdown, 'captain and custom groups must be reachable here').toContain(
      'otherGroups.map'
    );
  });

  it('routes additive membership away from pendingChanges', () => {
    // The trap. handleAssignSelectedTo stages an exclusive training move;
    // captain/custom must not go through it.
    expect(code).toContain('handleAddSelectedToGroup');
    const additive = code.slice(
      code.indexOf('const handleAddSelectedToGroup'),
      code.indexOf('const handleSave')
    );
    expect(additive.length).toBeGreaterThan(0);
    expect(additive).toContain('addMember.mutateAsync');
    expect(
      additive,
      'an additive add must not stage a pendingChange — that map is exclusive and drives the board'
    ).not.toContain('setPendingChanges');
  });

  it('decides which handler to use by group type, not by position', () => {
    const handler = code.slice(
      code.indexOf('onValueChange={(value) => {'),
      code.indexOf('<SelectTrigger className="w-[240px]')
    );
    expect(handler).toContain('trainingGroups.some');
    expect(handler).toContain('handleAssignSelectedTo');
    expect(handler).toContain('handleAddSelectedToGroup');
  });

  it('keeps X_TRAINING out of both lists', () => {
    // Cross-training memberships are bounded stints with their own
    // date-aware flow; a generic bulk add would create open-ended rows.
    expect(code).toContain("g.type !== 'X_TRAINING'");
  });
});
