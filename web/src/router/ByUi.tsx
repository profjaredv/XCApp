import React from 'react';
import { useUiVersion } from '../contexts/UiVersionContext';

// For the few routes where the "next" shell renders a different page at
// the SAME URL (docs/leadpack-new-ui-trial.md §1.4): today, groups,
// group/:groupId, meets, meet/:meetId, me. A link copied in one UI opens
// the same thing in the other.
//
// `next` is optional on purpose: until a page has a next version, the
// classic page renders inside the next shell (rule 4 — a half-built next
// UI is still usable).
const ByUi: React.FC<{ classic: React.ReactNode; next?: React.ReactNode }> = ({ classic, next }) => {
  const { uiVersion } = useUiVersion();
  return <>{uiVersion === 'next' && next !== undefined ? next : classic}</>;
};

export default ByUi;
