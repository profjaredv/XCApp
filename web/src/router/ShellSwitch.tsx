import React from 'react';
import Layout from '../components/Layout';
import AppShell from '../components/next/AppShell';
import { useUiVersion } from '../contexts/UiVersionContext';

// The one place the UI trial (docs/leadpack-new-ui-trial.md §1.4) chooses
// a shell. Classic <Layout /> or the new <AppShell /> — both render
// <Outlet />, so every route under them resolves the same in either; only
// the chrome around the page differs. Full-screen tools (timer, splits,
// interval sessions, attendance, photos, race visualization) sit outside
// this element and are identical in both.
const ShellSwitch: React.FC = () => {
  const { uiVersion } = useUiVersion();
  return uiVersion === 'next' ? <AppShell /> : <Layout />;
};

export default ShellSwitch;
