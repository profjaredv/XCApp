# LeadPack: "Try the New LeadPack" (side-by-side UI trial)

Handoff for Claude Code. Written against the October 2026 repo (`XCApp-neon-migration`, web version 1.1.0).

## What this is

LeadPack is two products sharing one dataset.

1. **Daily.** Run practice, groups, workouts, interval sessions, timers, attendance. This side is used on a phone at the track and organized by *date*.
2. **Insights.** Growth, rising athletes, cohorts, race over race, year over year, group vs. group, the program story. This side is used at a desk and organized by *pattern over time*.

The current UI mixes the two, so coaches can't predict where things live. This build adds a second UI shell, **"next,"** that organizes the app around those two vehicles and around four roles: head coach, coach, athlete, parent.

**The new UI is a hypothesis, so it ships as an opt-in trial.** The current UI ("classic") stays the default and stays unchanged. Users can switch either way at any time. Both UIs log usage the same way, so Jared can see which one people keep.

## Rules of engagement

The rules from `XCApp-build-spec.md` still apply. Do not invent data. Do not add features this document doesn't specify. Do not fix a problem by adding a second implementation of something that exists. Stop and ask when anything is ambiguous.

Rules specific to this build:

1. **Classic does not change.** The only edits allowed to classic are (a) the router wiring in §1.4, (b) the "Try the new LeadPack" entry points in §1.3, and (c) the shared fixes in §2. Anything else that would touch a classic file must be **additive, with a default that keeps classic behaving exactly as it does today.** Example: a new optional `visibleTabs` prop on `AnalyticsPage`, defaulting to the current tabs. If a change can't be made additive, stop and ask.
2. **One dataset, two shells.** Next reuses the existing APIs, pages, and components wherever it can. Next never writes data differently from classic. New backend work is limited to what §1 and §4.6 list.
3. **Same URLs.** Both shells live under `/t/:athleticTeamId/*`. A link copied in one UI opens the same thing in the other, or the closest equivalent.
4. **Every phase ships on its own.** Until a page has a next version, it renders its classic page inside the next shell. A half-built next UI is still usable.
5. **Full-screen tools stay as they are.** These routes render outside `<Layout />`, and that is correct: `race-visualization`, `interval-sessions`, `attendance`, `photos`, `race/:raceId/splits`, `race/:raceId/timer`. Both UIs open the same full-screen pages.
6. **Permissions don't move.** Who can see or do what is decided by the server (`requireRole`, `requireTeam`, `lib/groupPermissions.js`, guardian checks). Next nav follows the same visibility rules as classic `navigation.ts`. Hiding an item in the UI is tidiness, never security.

---

## 1. The trial mechanism

### 1.1 Preference

- Add `uiVersion String @default("classic") @map("ui_version")` to `User`. Values are `classic` and `next`. Store it on the server so it follows a person from phone to laptop, and so adoption can be counted.
- Add `PATCH /api/profile/ui-version` with body `{ uiVersion }`. Validate against the two values. Return the value on whatever endpoint the client already uses to load the signed-in user.
- Add a client `UiVersionProvider`, mounted in `main.tsx` beside `NerdModeProvider` and for the same reason: it has to cover routes outside the team subtree. Follow `NerdModeProvider`'s pattern. Read `localStorage` lazily for first paint, then reconcile with the server value once the user loads. When they differ, the server wins.
- A query param `?ui=next` or `?ui=classic` sets the preference, saves it the same way as the toggle, and strips itself from the URL. This is for demo accounts at the January booth.
- Preview-as-athlete (`lib/impersonation.ts`) shows the athlete version of **whichever UI the coach is currently in**.

### 1.2 Logging

The existing `PageView` table stores route, coarse role, and timestamp, with no user identifiers (`lib/pageViewLogging.js`). Keep that guarantee.

- Add `ui String @default("classic")` to `PageView`. Send it from `api/pageViewService.ts`. The server validates it and stores anything else as `classic`.
- In `roleForLogging`, split `HEAD_COACH` into its own `head_coach` bucket. Add a `parent` bucket for users with no team role who have at least one approved `GuardianLink`. That costs one count query. Do not add any other identifiers.
- Add a model `UiSwitchEvent { id, fromUi, toUi, role, reason String?, createdAt }`, with **no user id**. `reason` holds the optional switch-back answer from §1.3, capped at 500 characters.
- Register both new or changed models in `backend/lib/dataClassification.js` and `backend/lib/exportManifest.js`, following `PageView`. A test enforces that every model is classified.
- Extend `GET /api/admin/usage` to group page views by `ui` as well, and add:
  - a count of users by `uiVersion` and role bucket (aggregate counts only);
  - a count of switch events by direction, plus the reason texts, newest first.
- Show these on the existing admin usage screen (`adminService.ts`, `getUsage`).

### 1.3 Entry points

- **Classic:** add a one-line, dismissible card at the top of Today: "Try the new LeadPack. You can switch back anytime." [Try it]. Add an item "Try the new LeadPack" in the sidebar's bottom account stack. These two are the only visible changes to classic outside §2.
- **Next:** add "Switch to classic" in the avatar menu (§3.1). Switching back opens a small sheet: "What made you switch back?" with an optional text field and two buttons, [Switch] and [Cancel]. Skipping the text is fine. Never ask more than once per switch.
- Nobody is enrolled automatically. A team-wide default is out of scope.

### 1.4 Router wiring

- In `router/index.tsx`, the element that wraps the team routes in `<Layout />` becomes `<ShellSwitch />`. That component renders classic `<Layout />` or the new `<AppShell />`. Both render `<Outlet />`.
- Add a small helper, `<ByUi classic={...} next={...} />`, for the few routes where next renders a different page at the **same URL**: `today`, `groups`, `group/:groupId`, `meets`, `meet/:meetId`, `me`.
- Add **new routes**, reachable in both shells but linked only from next: `train`, `athletes`, `season`, `groups/manage`. A new route renders the classic page inside the next shell until its next page exists. `groups/manage` renders the classic `GroupsPage`.
- `LegacyRedirect` entries keep working unchanged.

### Gate 1

1. A new user lands on classic. Classic looks identical to today apart from the Try card, the sidebar item, and the §2 fixes.
2. Switching to next and back works without signing out, survives a reload, and follows the user to a second device.
3. `?ui=next` works on a fresh sign-in.
4. `page_views` rows carry `ui`. Admin usage shows the split by UI and by role, user counts by `uiVersion`, and switch reasons.
5. Every route that resolves today still resolves in both shells. Full-screen routes are unchanged.
6. `npm test` passes, including the data classification test.

---

## 2. Shared fixes (both UIs)

Fix these in classic **and** next. They are bugs, and the comparison should be about structure, not about which UI got its bugs fixed. Keep each fix minimal.

- **F1. Remove meet entry status for athletes.** `MyProgressPage.tsx` (~line 226) says "You're entered" or "You're not entered in this meet." Entries are managed on Athletic.net, so this is often wrong. Show the next meet without any entry status. Keep the prediction card. If the prediction depends on an entry existing, show it for the meet's races at the athlete's usual distance, or hide it when that can't be determined. Do not guess.
- **F2. Results Grid filter chips.** Every chip renders dark green, so you can't tell which filters are on. Use filled for selected and outline for unselected. "All" clears the class filters. Check gender behaves the same way.
- **F3. Data Management step labels.** On the Step 1 (Import) tab, the card heading reads "Step 2: Import Season Data." Fix the heading. On mobile there is both a dropdown and a tab row for the same choice. Show one control per breakpoint.
- **F4. Recalculate metrics after import.** Check whether a successful Athletic.net season import triggers the metrics calculation. `routes/athletes.js` already fires it after roster edits, imports, and merges, so follow that fire-and-forget pattern. If import does not trigger it, add the trigger. Keep the manual "Recalculate Metrics" button.
- **F5. Hardcoded "SB 5K / PR 5K" labels.** Label each value with the event it came from. If the metrics are only computed for 5K, keep the label but show it only when the value really is a 5K. Show "No 5K yet" rather than a number with the wrong label.

### Gate 2

Each fix is verified in both shells, and nothing else in classic changed.

---

## 3. The next shell

### 3.1 Desktop (≥1024px)

- **Left sidebar** (~240px, collapsible to icons) with two labeled zones and a collapsed Setup group:

```
THIS WEEK
  Today
  Train
  Groups

INSIGHTS
  Athletes
  Meets
  Season
  Program

Setup  (collapsed)
```

- **Account stack becomes one avatar row** at the bottom of the sidebar. It opens a menu with Profile, Settings, Nerd mode, Dark mode, Switch to classic, Admin: switch team (super admins only), Platform (super admins only), and Log out. This fixes the bug where the eight-item stack pushes Setup off screen.
- **Top bar**, left to right:
  - team name;
  - season picker (the existing shared `SeasonContext`);
  - **group scope picker** (§3.3, coaches only);
  - **Find athlete** (§3.4);
  - **Timer** (§3.5, coaches only);
  - Feedback.
- **One header rule for every next page:** a title, at most one primary button, and everything else in a `⋯` overflow menu.

### 3.2 Mobile (<1024px)

- **No hamburger drawer.** Use a fixed **bottom tab bar** with 4 items plus a **"More"** tab with a text label. Every tab has an icon and a text label. Respect the safe-area insets.
- **"More"** opens a bottom sheet with the remaining nav items, then the avatar menu items.
- **Top bar:** team name (truncates), season chip ("2026 ▾", opens a sheet), group scope chip (coaches), Find athlete icon, Timer icon (coaches).
- **Touch targets are at least 48×48px.** This covers tab items, top bar buttons, row taps, and primary buttons. Make whole rows tappable, with no "View Profile" button inside a row.
- **Thumb zone.** On pages where the primary action is used constantly (group page: attendance or interval session; meet page on race day: Start timer), put it in a sticky bar just above the tab bar. Everywhere else it goes in the header.
- **No horizontal page scroll at 360px.**
- **Preview-as-athlete banner on one line:** "Viewing as Aedan Martin · changes save to their account" plus an [Exit] button. It truncates, never wraps to several lines.

### 3.3 Group scope (coaches)

Groups drive daily and weekly work, so the group is a **scope** that applies across pages, the same way the season is.

- Options: "All athletes," then **Training groups** (`GroupType.TRAINING`), then **Captain groups** (`CAPTAIN`), then **Other** (`CUSTOM`). The cross-training group is not a scope; it shows as a status (§4.3).
- Persist per user, team, and season in `localStorage`.
- Default: if the coach leads exactly one group this season, use that group. Otherwise use All.
- Volunteer coaches see only the groups they lead, and default to them.
- **These pages respect the scope:** Today (group strip), Train, Athletes, Season → Groups tab, and the meet Results tab.
  - Filter client-side using the group memberships the groups API already returns. Do not change server queries for this.
  - A page that can't respect the scope doesn't show the chip.

### 3.4 Find athlete

- A search sheet built on the existing `lib/athleteSearch.ts`.
- Selecting an athlete opens the inspector (§4.4) on desktop, or `/athlete/:id` on mobile.
- Coaches see the whole roster. Athletes and parents don't get this control.

### 3.5 Timer (coaches)

One button that opens whichever timer fits right now:
1. If a meet today has a race without results, open `race/:raceId/timer`. If there's more than one such race, open a sheet to pick.
2. Otherwise, if the scoped group has an interval session today, open it.
3. Otherwise, open `interval-sessions`, with the scoped group preselected if that page supports it.

### 3.6 Nav per role

Put this in a **new file**, `web/src/lib/navigationNext.ts`, and leave `navigation.ts` untouched. Each entry has an `audience`, a `zone` (`week`, `insights`, `setup`), and a `mobileTab` order or `false`. Visibility per role follows the existing rules.

| | Head Coach / Coach | Volunteer Coach | Athlete | Parent |
|---|---|---|---|---|
| **Desktop nav** | Today, Train, Groups · Athletes, Meets, Season, Program · Setup | same, minus Setup (as classic does today) | Today, My Season, Train, Meets, Photos | Today, My Runner, Meets, Photos |
| **Phone tabs** | Today, Train, Groups, Meets, More | same | Today, My Season, Train, Photos, More | Today, My Runner, Photos, More |
| **In "More"** | Athletes, Season, Program, Setup, account | Athletes, Season, account | Meets, account | Meets, account |

**Setup** contains Roster (the classic `RosterPage`, for admin work), Data & Import, Equipment, Field Results, Photos, Settings, and Coaching staff. Item visibility follows the current rules.

### Gate 3

1. Every role sees exactly the nav in the table. Check each one via preview-as-athlete, a volunteer coach account, and a parent account if one exists (§4.9).
2. At 360px, no page in the next shell scrolls horizontally, and the tab bar items measure at least 48px.
3. With Season expanded, nothing in the desktop sidebar is cut off at a 768px window height.
4. The group scope persists, and a volunteer coach can't pick a group they don't lead.
5. Timer opens the correct timer in all three cases.

---

## 4. Next pages

Build them in this order. Each page is its own commit and its own gate. Reuse existing components wherever they fit.

### 4.1 Today (`/today`, next = `TodayPageNext`)

Uses the existing `/api/today` (`routes/today.js`). No selectors and no filters, as today.

**Coach:**
1. **My groups strip.** One row per group in scope. Each shows attendance status for today, whether the plan is published, and the cross-training count. The primary action depends on state: **Take attendance** until attendance is taken, then **Start interval session** if one is planned, otherwise **Open group**.
2. **Next meet.** Name, date, days out, course. Add a nudge if any race in it has no distance set. **Show no entry counts.**
3. **Needs attention.** Keep the current items but drop "meet with zero entries." If nothing qualifies, render nothing.
4. **Recent result.** As today.
5. **Remove the Coaching staff block.** Staff management lives in Setup.

**Athlete:**
1. Today's practice: their group, published plans only.
2. Next meet. If the race hasn't started and the athlete has no pre-race goal, show **"Set your goal,"** which opens the existing `RaceReflection` pre-race form.
3. Last race. If there's no post-race reflection, show **"Reflect on this race."**

**Parent:** see §4.9.

### 4.2 Train (`/train`, new)

**Coach:**
- **Today's sessions:** one card per scoped group, showing the plan, attendance, and interval session, each with its action.
- **This week:** the calendar of practices and meets. Reuse `SchedulePage`'s week and agenda views. Embed or extract them only if classic `SchedulePage` still renders exactly as before.
- **Tools:** workout templates, pace calculator (moved here from Season), interval session history, attendance history.
- Primary action: **New practice plan.**

**Athlete:**
- Today's workout for their group.
- Training paces (`TrainingPacesCard`).
- Log a run (the existing training log).
- Strategy (the existing `StrategyPage`, embedded or linked).

### 4.3 Groups (`/groups`, next = `GroupsHubPage`; `/group/:groupId`, next = `GroupPageNext`)

- **Hub:** groups for the season, in sections by type. Each card shows name, leaders, member count, and today's status: attendance ✓ or –, plan ✓ or –, and how many members are on cross-training. Overflow: **Manage groups**, which goes to `/groups/manage` (the classic `GroupsPage` with create, assign, sort by pace, and dynamic groups). **Do not rebuild GroupsPage.**
- **Group page** tabs:
  - **Today:** the existing `GroupDayPage` content, including the date navigator.
  - **Trends:** the group's performance over the season. Reuse the Season "By Group" component filtered to this group. If it can't be filtered, show the members' season progression from existing endpoints.
  - **Members:** the existing member management.
- **Primary action is state-aware**, as in §4.1. On mobile it sits in the sticky bottom bar.
- **Label the icon-only buttons.** The dumbbell is "Send to cross-training." Show the label on desktop, and give it a tooltip plus `aria-label` everywhere.

### 4.4 Athletes (`/athletes`, new)

This is **one list**, replacing the overlap between Roster and Season → Athletes. Roster admin stays in Setup.

- **Data:** start from the season roster membership the roster page uses. Merge in the metrics the analytics Athletes tab uses, joining client-side by athlete id. **Every rostered athlete appears**, including those with no race data.
- **Columns** (table on desktop, rows on mobile):
  - Name, with a captain badge;
  - Class;
  - Groups (training group first);
  - SB and PR, labeled per F5;
  - Races;
  - a trend indicator, only if existing data supplies one.
  - On mobile, each row shows name, class, SB, and a chevron.
- **Filters:** group scope from the top bar, gender, grade, search, and "Include past athletes." **Sort:** name or SB.
- **Header:** the primary button is **Add athlete** (coaches). The overflow has **Manage roster** (to `/roster`), **Recalculate metrics**, and **Export**.
- **Selecting an athlete:**
  - **Desktop ≥1280px:** an inspector panel (~420px) opens on the right and pushes the list. Put the selection in the URL (`?athlete=<id>`).
  - Panel tabs: **Summary**, **Races** (with splits per race), **Goals & reflections**, **Admin** (the existing `AthleteAdminPanel`, coaches only). Add links to Journey and Strategy, and a labeled **Preview as athlete** button.
  - **Below 1280px:** go to `/athlete/:id` (the existing `TeamAthleteProfilePage`).
- `AthleteDetailModal` is not used in next.

### 4.5 Season (`/season`, new)

- Render the existing `AnalyticsPage` tabs as a visible tab row (scrollable on mobile). Use a new optional prop such as `visibleTabs` that defaults to the current set, so classic is unchanged.
- **Next shows:** Dashboard, Performance, **Groups** (the existing By Group tab), Results Grid, **Insights** (the existing Coach Insights), and **Post Season** (only when that season has postseason data).
- **Next drops:**
  - Athletes, now §4.4;
  - Meets, now §4.6;
  - Pace Calculator, now Train.
- **Program** stays at the existing `/band-trends` page with the label "Program." Its "Share" feature is out of scope.

### 4.6 Meets (`/meets`, next = `MeetsPageNext`; `/meet/:meetId`, next = `MeetPageNext`)

Meet management (entries, heats) lives on Athletic.net. LeadPack ingests meets, sets each race's distance, predicts, captures splits, and analyzes.

**Meets list:**
- Sections: **Upcoming** and **This season, past.**
- Each row shows name, date, course, the **meet series** name if the meet's races belong to a `MeetGroup`, and status chips: "Results in," "Splits 14/22."
- Primary button: **Import meet**, using the existing import. Overflow: calendar import, new meet, **Meet series** (the existing meet group management, wherever it lives today).

**Meet page**, three tabs:

1. **Preview**
   - One row per race: name, **distance chip** (editable, using the existing endpoint), and predictions (existing `MeetPredictionsCard`).
   - Show **goals set** as a count (n of m athletes with a pre-race `RaceReflection`).
   - Logistics (`MeetPlan`): show a read-only summary with Edit, collapsed by default.
   - **Do not show entrants, entry status, or `MissingEntrantsCard`.**
   - **On race day,** each race's primary action is **Start timer**, in the sticky bottom bar on mobile.
2. **Results**
   - Per race, a **status strip:** "Results ✓ · Splits 14/22 · Reflections 9/22."
   - **One primary action, the next incomplete step:** Import results when there are none, then Enter splits.
   - The overflow holds Enter results manually, Live timer, Re-import, and Race visualization.
   - Below the strip, show the existing results view, filtered by group scope.
   - **This replaces the five identical buttons per race row.**
3. **History** (year over year)
   - The **meet series already exists** as `MeetGroup` / `MeetGroupRace` (`routes/meetGroups.js`). Use it, and don't build another.
   - If the meet's races belong to a series, show one row per season: year, distance, team finishers, and team average **by gender**. Add a band summary (top-N average) if `bandAnalytics` provides it per race.
   - **Never compare across different distances.** Show the distance and leave mismatched rows uncompared.
   - **Athletes and parents** see the team-level rows plus their own result highlighted, and no teammates' individual times.
   - If the meet isn't in a series, show "Not linked to past years" plus, for coaches, **Link to a meet series.**
   - If this needs a new endpoint, add **one** read-only, team-scoped endpoint: `GET /api/meet-groups/:id/history` returning per-season aggregates. It returns no per-athlete rows, except the requesting athlete's own.

### 4.7 My Season (`/me`, next = `MySeasonPage`) — athlete

- **Header:** name, class, groups.
- **PR strip:** one PR per event they've raced.
- **Season chart:** reuse the existing one.
- **Races:** one card per race, newest first. Each shows result, time, place, **goal vs. result** (from the pre-race `RaceReflection`), the **reflection** (post-race), and splits if any exist. Add prompts to fill in a missing goal or reflection, using the existing forms.
- Link to **Journey.**
- **Leave out today's practice and the next meet.** They live in Today.

### 4.8 Train for athletes

This is covered in §4.2.

### 4.9 Parent — conditional

**Investigate before building.** Find out how a guardian-only user (an approved `GuardianLink`, no `TeamMember` role) experiences the app today:
- where they land after sign-in;
- whether they have a team context in the client;
- what the `/athlete/:id`, `/journey`, `/strategy`, and photos routes return for them (the server already authorizes guardians on these).

- **If they can sign in and reach a team context:** build
  - **Today:** next meet (date and place), their runner's last race, new photos;
  - **My Runner:** the athlete page, read-only, for their linked athlete, with a switcher if they have more than one;
  - **Meets:** the list and History, with their runner highlighted;
  - **Photos.**
- **If they can't, stop and report.** Do not build parent sign-in or team context in this pass.

### Page gates

For each page:
1. It renders correctly for every role that can reach it, at 360px and at 1440px.
2. Nothing in classic changed.
3. The group scope works where it's supposed to.
4. Empty states are written as sentences and never look broken. Examples: no meets yet, no series, no reflections.

**Final gate:** a coach can complete five tasks in next on a phone.
1. Take attendance for their group, within 3 taps of opening the app.
2. Find one athlete's progress.
3. See last year's results at this meet.
4. Start a timer.
5. See a group's trend.

---

## 5. Words in the UI

Use one word per thing, in both titles and buttons.

| Use | For | Don't use |
|---|---|---|
| **Athlete** | a runner | runner, member (in UI chrome) |
| **Group** | a training, captain, or custom group | squad, pod |
| **Meet** / **Race** | a meet contains races | event (that word is reserved for track) |
| **Meet series** | the same meet across years (`MeetGroup` in code) | "meet group" in the UI; it collides with Group |
| **Practice** / **Session** | a practice plan / an interval session | workout day |
| **Season**, **Program** | this year / all years | Analytics, Band Trends (in next) |
| **Roster** | the admin list in Setup only | (don't use it for the Athletes page) |
| **Train** | the practice side, for every role | Schedule, Practice Plans, Coaches Tools |
| **Timer** | live race timer or interval timer | Run, Capture |

---

## 6. Out of scope (do not build)

- Offline queueing for timer, attendance, or splits. It's a separate workstream: "Saved on device / Pending upload / Uploaded," resumable and idempotent.
- Program "Share" reports.
- A right-hand contextual menu or double slide-outs. The inspector in §4.4 is a detail panel, not a menu.
- Push notifications and email digests.
- Anything for Track & Field.
- Making next the default, or a team-wide UI setting.

## 7. Stop and ask if

- a change to classic can't be made additive;
- guardian users have no team context (§4.9);
- the meet series data doesn't link races across seasons the way §4.6 assumes;
- metrics exist only for 5K, and F5 would leave most cards blank;
- any next page needs a new endpoint other than the two named here (`PATCH /api/profile/ui-version`, `GET /api/meet-groups/:id/history`) and the admin usage extension.

## 8. How Jared will judge it

Run the trial for three weeks, then look at admin usage:
- How many users tried next, and how many were still on it after 7 days, by role.
- Switch-back reasons.
- Page views per role per UI for the five tasks in the final gate.
- In person, the five-task test with the two main coaches, once in each UI, counting taps.
