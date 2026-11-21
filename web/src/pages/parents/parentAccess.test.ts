import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

describe('parent access, web side', () => {
  it('routes the three parent pages outside the team app', () => {
    const router = read('router/index.tsx');
    for (const p of ["path: '/parents/:code'", "path: '/parent-invite/:token'", "path: '/my-runners'"]) {
      expect(router).toContain(p);
      expect(router.indexOf(p)).toBeLessThan(router.indexOf("path: '/t/:teamSlug'"));
    }
  });

  it('the join code card shows the current code and a parent link, and warns before replacing it', () => {
    const card = read('components/team/TeamJoinCodeCard.tsx');
    expect(card).toContain("'/teams/current'");
    expect(card).toContain('parentJoinLink(joinCode)');
    expect(card).toContain('window.confirm');
  });

  it('the parent link prefills the code and onboarding looks it up', () => {
    expect(read('pages/parents/ParentLinkPage.tsx')).toContain("saveIntent({ role: 'parent', joinCode })");
    const onboarding = read('pages/OnboardingPage.tsx');
    expect(onboarding).toContain('stored.joinCode');
    expect(onboarding).toContain("navigate('/my-runners')");
  });

  it('a coach invite chooses the runners and lists pending invites', () => {
    const card = read('components/team/ParentInvitesCard.tsx');
    expect(card).toContain('parentService.invite(email.trim(), picked)');
    expect(card).toContain('parentService.cancelInvite');
    expect(read('pages/SettingsPage.tsx')).toContain('<ParentInvitesCard />');
  });

  it('Today links waiting parents to the place they are approved', () => {
    expect(read('pages/TodayPage.tsx')).toContain("teamPath('/settings#athlete-access')");
    expect(read('pages/next/TodayPageNext.tsx')).toContain("teamPath('/settings#athlete-access')");
  });

  it('My runners shows only what the guardian endpoint returns', () => {
    const page = read('pages/parents/MyRunnersPage.tsx');
    const code = page.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(code).toContain('parentService.athlete(');
    expect(code).not.toMatch(/training-?logs?|reflection/i);
  });
});
