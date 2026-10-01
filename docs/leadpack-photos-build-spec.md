# LeadPack Photos: Build Spec

Oct 1, 2026 · @Jared Vallejo

## Overview

LeadPack Photos lets athletes and parents tag themselves in meet photos once, so every athlete ends the season with a personal gallery and a ready-made collage and nobody sorts photos by hand.

**The problem.** The team has about 120 athletes and 9 meets, and each meet produces 400 or more photos, so roughly 3,600 a season. Sorting them into one folder per athlete fails because a single photo often shows three or four athletes.

**The idea.** Store each photo once and treat "who is in it" as data. A photo-to-athlete tag table lets one photo belong to any number of athletes at no extra storage. An athlete's folder is just a filtered view.

**The experience.** A clean, Lightroom-style workspace with three modules, Load, Tag, and Build, so that loading a meet, tagging it, and building a collage are each a few clicks or key presses. The interface is the product.

**Success looks like:**

- Every athlete has 3 to 5 chosen photos spread across the season by the final meet.
- The coach's tagging work is limited to uploading photos and bulk-tagging team shots.
- Photos of minors are never publicly reachable.
- Total hosting cost stays under a few dollars a month.

**Out of scope for v1:** face recognition, public galleries, print ordering, team posters, and video.

## Architecture

Image bytes live only in R2 and travel directly between the browser and R2, while Neon holds the tags and LeadPack's API decides who may see what.

[embedded content: architecture · 4 components, 1 direct path]

The browser sends and receives image bytes directly with R2 through URLs the API signs, so the API and Neon only handle sessions, tags, and file pointers.

**Reused from LeadPack:** login and sessions, the athlete roster, parent-to-athlete links, meets, and seasons.

**New:** one private R2 bucket, four tables and one column in Neon, five screens, and a handful of API routes (authorize, finalize, tag, pick, generate collage). This assumes LeadPack's API runs on Vercel with Neon, as the rest of the stack does.

## Data model (Neon)

Neon stores only pointers, tags, and picks, never image bytes. Four new tables plus one column on the athlete table cover the whole feature; at 50,000 photos with several tags each, this is still a small database.

The SQL assumes LeadPack already has `teams`, `athletes`, `meets`, `seasons`, and `users`. The build starts by reading LeadPack's actual schema, including how parents link to athletes, and renaming to match. Every photo carries `team_id` from day one, because LeadPack is planned for licensing to other teams and this keeps each team's photos separate.

```sql
create table photos (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references teams(id),
  meet_id      uuid not null references meets(id),
  object_key   text not null unique,      -- R2 key of the original
  sha256       text not null,             -- dedupe re-uploads
  taken_at     timestamptz,               -- from EXIF when present
  width        int,
  height       int,
  bytes        bigint,
  status       text not null default 'pending'
               check (status in ('pending','ready','hidden')),
  uploaded_by  uuid references users(id),
  created_at   timestamptz not null default now(),
  unique (team_id, sha256)
);
create index on photos (meet_id, taken_at);

create table photo_athletes (
  photo_id    uuid not null references photos(id) on delete cascade,
  athlete_id  uuid not null references athletes(id),
  tagged_by   uuid references users(id),
  source      text not null check (source in ('self','parent','coach')),
  created_at  timestamptz not null default now(),
  primary key (photo_id, athlete_id)
);
create index on photo_athletes (athlete_id);

create table picks (
  athlete_id  uuid not null,
  season_id   uuid not null references seasons(id),
  photo_id    uuid not null,
  position    smallint not null check (position between 1 and 5),
  primary key (athlete_id, season_id, position),
  unique (athlete_id, season_id, photo_id),
  -- a pick must be a photo the athlete is tagged in
  foreign key (photo_id, athlete_id) references photo_athletes (photo_id, athlete_id)
);

create table collages (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references athletes(id),
  season_id    uuid not null references seasons(id),
  template     text not null,
  object_key   text not null,            -- R2 key of the rendered PNG
  version      int not null default 1,
  generated_at timestamptz not null default now()
);

alter table athletes add column photos_opt_out boolean not null default false;
```

Three rules the schema enforces or the app must enforce:

1. A photo is never duplicated. Four athletes in one photo means one `photos` row and four `photo_athletes` rows.
2. An athlete can only pick photos they are tagged in, which the composite foreign key on `picks` guarantees.
3. Thumbnail and web-size keys are derived from `object_key` by naming convention (next section), so they need no columns.

## Storage layout and delivery (R2)

Use one private R2 bucket with no public access, and give each photo three objects under one prefix so the derived sizes never need database columns.

| Object | Key | Format and size | Used for |
| --- | --- | --- | --- |
| Original | `teams/{team_id}/photos/{photo_id}/orig.jpg` | Untouched upload | Print and collage rendering |
| Thumbnail | `teams/{team_id}/photos/{photo_id}/thumb.webp` | 400 px long edge, about 30 KB | Tagging grid |
| Web size | `teams/{team_id}/photos/{photo_id}/web.webp` | 1600 px long edge, about 250 KB | Athlete page, pick screen |
| Collage | `teams/{team_id}/collages/{athlete_id}/{season_id}-v{n}.png` | Rendered image | Download and print |

The `photo_id` is generated by the server when the upload is authorized, and the same value is used in the key and the `photos` row.

**Delivery, version 1.** The LeadPack API checks the user's session and permissions, then returns short-lived presigned GET URLs (60 minutes) for only the objects that page needs. The browser never gets a bucket credential and nothing is public. R2 serves presigned URLs over its S3-compatible endpoint, and egress is free.

**Delivery, version 2 (only if needed).** If repeated visits feel slow because every presigned URL is unique and defeats browser caching, put a small Cloudflare Worker on `photos.leadpack.cc` that validates a short-lived signed token, reads the object through an R2 binding, and sets cache headers. Do not build this until the grid is measurably slow.

**Bucket settings:**

- Public access off, with a CORS rule allowing `PUT` from the LeadPack origin for direct browser uploads.
- A billing alert at a few dollars a month in the Cloudflare account.
- Separate access keys for the app, scoped to this bucket only, kept in Vercel environment variables.

**Retention.** After the season is finalized, originals that were never picked can be exported to a drive and deleted, or moved to a cheaper storage class. Tags and picks stay in Neon either way.

## Upload and processing pipeline

Photos go from the coach's browser straight to R2, and the browser makes the smaller copies itself, so LeadPack's server never handles image bytes. This matters because Vercel functions cap request bodies at roughly 4.5 MB, well under a typical photo.

1. **Select.** The coach opens a meet and drops in a batch of files. For each one the browser computes a SHA-256 hash and reads the capture time and dimensions from EXIF.
2. **Authorize.** The browser sends the batch metadata to `POST /api/photos/authorize`. The server confirms the coach role and team, skips any photo whose `(team_id, sha256)` already exists, inserts a `photos` row with status `pending` for each new one, and returns a `photo_id` plus three presigned PUT URLs (original, thumbnail, web size).
3. **Resize and upload.** The browser draws the image to a canvas to produce the 400 px and 1600 px WebP copies, then uploads all three objects directly to R2, a few photos in parallel.
4. **Finalize.** The browser calls `POST /api/photos/finalize` with the `photo_id` list. The server checks that all three objects exist in R2 and flips each row to `ready`. Only `ready` photos appear in any grid.
5. **Clean up.** A scheduled job deletes `pending` rows older than 24 hours along with any partial objects. Re-running an interrupted batch is safe because the hash check skips what already arrived.
6. **Optional bulk tag.** Right after upload, the coach can multi-select photos and tag athletes, which is the fast path for team shots and award photos.

**Known snags to handle:**

- Uploads are JPEGs exported from RAW, so HEIC support is not needed in version 1. If admins later upload straight from phones, add a small server function that converts HEIC with `sharp` before the resize step.
- A meet is roughly 2 GB of originals at 5 MB each, so the upload screen needs a visible progress bar, pause and resume, and a warning not to close the tab.
- Large batches should show per-file status so a failed photo can be retried alone.

## Interface: a Lightroom-style workspace

LeadPack Photos is one clean workspace with three modules, Load, Tag, and Build, laid out the way Lightroom is, so loading a meet, tagging it, and building a collage each take a few clicks or key presses. This interface is the product, and the rest of this spec exists to support it.

**Design principles**

1. **Photos are the interface.** Neutral dark gray panels, small quiet type, and a single accent color, so the photos supply all the color. No modal dialogs and no save buttons: every change saves instantly and can be undone with Ctrl or Cmd+Z.
2. **One frame for every module.** A module switcher across the top, a left panel to choose what to look at, a center canvas, a right panel for details, and a filmstrip along the bottom.
3. **Armed athlete.** Choose an athlete once, and every click or key press applies to that athlete, like Lightroom's spray can. This is what makes tagging fast.
4. **Batch by default.** Select many photos, act once.
5. **Keyboard first, touch friendly.** Every common action has a key, and phones get the same flow with taps.
6. **Instant feel.** A virtualized grid that renders only visible thumbnails, preloaded thumbnails, prefetched next and previous photos in the loupe, and optimistic updates that show a tag immediately and reconcile with the server.

**The three modules**

| Module | Who | Left panel | Center | Right panel |
| --- | --- | --- | --- | --- |
| Load | Admins | Meets, with a new-meet button | Full-window drop zone, then a grid that fills as each photo finishes | Upload progress, counts, and a "Tag these now" button |
| Tag | Everyone | Meets with tagged and untagged counts, the roster with search, and saved filters (Untagged, Mine, and for admins, Needs photos) | Photo grid with a thumbnail-size slider. Space opens one large photo (the loupe) | Tags on the selected photo as chips, type-ahead to add one, meet and capture time, and hide for admins |
| Build | Everyone | Athletes with a dot per pick (admins only; families land on their own athlete) | Live letter-size page preview | The athlete's tagged photos, template choice (3, 4, or 5 photos), header text, and export |

[embedded content: Tag module wireframe · top tabs, left panel, grid, right panel, filmstrip]

Every module uses this same frame: tabs on top, a left panel to choose what to look at, the canvas in the middle, a right panel for details, and a filmstrip below.

**Tagging in the Tag module**

- Arm an athlete by clicking their name or pressing T and typing. A chip in the top bar shows who is armed.
- With an athlete armed, click a photo to toggle that athlete's tag. Shift-click or drag across photos to select a range, then press Enter to tag them all.
- A check marks photos tagged with the armed athlete and a star marks picks for the collage. Small initials chips on a thumbnail show who else is tagged, so group photos stand out.
- Families skip arming: their own athlete or child is armed on arrival, so tagging is tap, tap, tap.
- A time-window jump lets someone enter a start and end time and land on the photos taken then, near their race.

**Keyboard shortcuts**

| Key | Action |
| --- | --- |
| Arrow keys | Move the selection |
| Space | Open or close the loupe |
| T | Arm an athlete (type a name) |
| Enter | Tag the selected photos with the armed athlete |
| U | Remove the armed athlete's tag from the selected photos |
| P | Pick or unpick the selected photo for the armed athlete's collage (up to 5) |
| H | Hide the selected photo (admins only) |
| Ctrl or Cmd + A, Esc | Select all photos in view, clear the selection |
| Ctrl or Cmd + Z | Undo |

**Load, made dead easy**

- Drop a folder or files anywhere on the window. If no meet is chosen yet, ask once with a single dropdown that defaults to the most recent meet.
- Thumbnails appear in the grid as each photo finishes, with an overall progress bar, pause and resume, and a retry on any single failed file.
- Duplicates are skipped silently and counted. When the batch ends, show the number added and the number skipped as duplicates, with a "Tag these now" button that opens the Tag module filtered to this upload.

**Build, made dead easy**

- Open an athlete and their picks already fill the page preview. With fewer than three picks, the right panel lists their tagged photos with a one-click Add.
- Click a slot to swap its photo, drag to reorder, and switch templates with one click. The header fills in the athlete's name, team, and season automatically.
- Export a letter-size PDF or a PNG. Admins also get "generate all" and the zip download described under Collage generation.

**Admin extras.** A Coverage filter in the Tag module lists athletes with zero to two tagged photos so a coach knows whom to look for, plus bulk tagging, hide, and opt-out management.

**On phones.** The same three modules with a bottom tab bar, a three-column grid, tap to tag the armed athlete, long-press to select several photos, the roster in a bottom sheet, and swipe between photos in the loupe. Parents will mostly tag on phones, so this path must feel as good as the desktop one. Load is built for desktop first.

**Look and feel.** Use LeadPack's existing component library and design tokens, and theme this workspace dark and neutral. Panel edges are 1 px lines, UI text is 12 to 13 px, and the accent color marks only the armed athlete, selection, and picks.

## Roles and tagging rules

These rules apply inside the workspace described above, which sits behind the existing LeadPack login. Tagging happens one meet at a time during the season, so the work is spread across every family instead of landing on the coach at the end.

**Roles.** In this spec, "coach" means any LeadPack admin role allowed to upload: super admin, coach, or volunteer coach. Parents and athletes tag and pick but do not upload.

**Tagging rules:**

1. A parent or athlete can tag only the athletes linked to their own account. Tagging someone else's child is a coach-only action.
2. Each tag records who made it and whether it was `self`, `parent`, or `coach`.
3. A tag can be removed by whoever made it or by a coach.
4. A photo with no tags is visible to every logged-in team member in the tag grid, so someone can claim it. Once an athlete has opted out, any photo tagged with that athlete leaves every grid except the coach's.
5. Picks must come from the athlete's own tagged photos, enforced by the database.

**Why time-window jump matters.** Photos carry a capture time, and races run on a schedule, so "jump to 10:40 to 11:10" lets a family land near their kid's race instead of scrolling 400 thumbnails.

## Collage generation

The app builds each collage itself from fixed templates, so the work costs nothing per run and does not depend on Canva, whose automated template filling is Enterprise-only.

**Templates.** Start with one US letter portrait layout (8.5 by 11 inches) for each pick count (3, 4, and 5 photos), rendered at 300 dpi, which is 2550 by 3300 pixels. Each template is a small JSON list of rectangles, plus a header area with the athlete's name, team name, and season. Adding a new look later means adding one JSON file.

**Cropping.** Photos are cover-fit into their rectangle, centered. There is no automatic face or subject detection, which keeps the feature consistent with the no-face-recognition rule. If a crop cuts someone off, add a nullable `crop` JSON column to `picks` and let the athlete drag a focus point on the Collage screen.

**Two render paths:**

1. **Preview.** The browser composes the collage on a canvas from the 1600 px web-size copies. It is instant and costs nothing.
2. **Final.** `POST /api/collages/generate` runs `sharp` in a Vercel function, fetches the five originals from R2, scales each to its cell, composites them onto the template, writes the PNG to the collage key, and inserts or updates the `collages` row with a new `version`. Five photos at a few megabytes each should finish within a function's time limit, but verify on the real plan.

**Coach tools:**

- A "generate all" action that renders a collage for every athlete with at least three picks, one at a time in a queue.
- A zip download of all finished collages, each as a letter-size PDF page, for easy printing.
- A list of athletes still under three picks, with the option for a coach to pick on their behalf.

**Selection rule.** Picks are 3 to 5 photos chosen by the athlete or parent. The picker shows meet labels so a season spread is easy to see, but it does not force one photo per meet.

## Privacy and guardrails

These photos show minors, so the default is closed: nothing is public, and every request is checked against the LeadPack session and the user's team.

**Access**

- The bucket is private. Every image is delivered through a presigned URL that the API issues only after checking the session, and each URL expires after 60 minutes.
- Every query and every URL-issuing route is scoped by `team_id`. Put this check in one shared data-access helper, not in each route, because LeadPack is planned for licensing to other teams and a cross-team leak is the worst failure here.
- Object keys and filenames use UUIDs only. No athlete name ever appears in a key, a URL, or a download filename.

**Opt-out and removal**

- A parent or coach can set `photos_opt_out` for an athlete. From then on, any photo tagged with that athlete disappears from every grid except the coach's, and the athlete is skipped by collage generation.
- A coach can hide a single photo (`status = hidden`) or delete it, which removes the row and all three R2 objects.
- Opt-out hides photos rather than deleting them, so a coach can reverse it. Deletion is a separate, deliberate action.

**What the system does not do**

- No face recognition, no face grouping, and no third-party vision or AI service ever receives a photo. The coach's own tagging and the families' tagging are the only identification.
- No public gallery, no share links, and no search-engine indexing.

**Upload hygiene**

- Accept only JPEG, with a size cap per file (suggest 25 MB). The finalize step checks the stored size and type and deletes anything that fails.
- The thumbnail and web copies are re-encoded in the browser and carry no EXIF data. Originals keep their EXIF, including GPS if the camera recorded it, and stay private. Strip GPS at upload if the team prefers.
- Rate-limit the authorize endpoint per user.

**Confirm outside the software:** the retention period the existing athlete photo release expects, which decides how long originals are kept after a season. The release itself is already on file.

## Costs and limits

R2 storage for the first season should cost about $0.15 a month, and even 30,000 photos stays near $2.40 a month. Cloudflare's [R2 pricing page](https://developers.cloudflare.com/r2/pricing/), updated Oct 1, 2026, lists standard storage at $0.015 per GB-month, a free allowance of 10 GB-months of storage, 1 million Class A (write) and 10 million Class B (read) operations each month, and no egress charge.

| Scale | Photos | Storage (originals plus derived copies) | R2 cost per month |
| --- | --- | --- | --- |
| Season 1 | about 3,600 | about 20 GB | about $0.15 |
| About 4 seasons | about 15,000 | about 85 GB | about $1.10 |
| Long run | about 30,000 | about 170 GB | about $2.40 |

**Assumptions to verify.** Originals average about 5 MB and the two derived copies add about 0.3 MB per photo. Check a typical file from the last meet. At 10 MB per original, storage and cost roughly double, which is still under $5 a month at the long-run scale.

**Operations.** Each photo costs about three writes to upload and three read-type checks at finalize, roughly 11,000 writes and 11,000 reads a season. Families browsing thumbnails add perhaps a million reads a season. Both are far inside the free allowance.

**Other costs.**

- Neon and Vercel: already paid for LeadPack. Verify that the extra tables, the `sharp` collage function, and a scheduled cleanup job fit the current plan limits.
- Cloudflare typically wants a payment method on file even when usage stays in the free tier, so confirm this when creating the account. The account belongs to DriftBound Media, and because object keys are prefixed by team, storage per team can be measured later if licensing should account for it.
- Billing rounds usage up to the next whole unit (1.1 GB-month is billed as 2), which is why the small figures above are approximate.
- Set a billing alert at a few dollars to catch a runaway upload loop early.

**Cost of the alternatives considered.** Cloudinary's free plan gives 25 credits a month shared across storage, bandwidth, and transformations, and its next paid tier is listed near $89 to $99 a month, so it is far more expensive for this use. Canva's automated template filling is limited to Enterprise accounts.

**Sources**

- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudinary plans and credits](https://cloudinary.com/documentation/billing_and_plans)
- [Canva data autofill help](https://www.canva.com/help/data-autofill/)

## Build phases and open questions

Build in the order below so tagging can start on the meets still ahead while the collage work is finished, and so each phase ends on something a real person can test. Photos from meets already run can be loaded later through the same upload screen.

1. **Interface prototype.** Build the Load, Tag, and Build workspace with seeded sample photos, athletes, and tags and no backend, in the dark neutral theme with keyboard shortcuts, undo, and a phone layout. *Done when* the click-through feels right: load a meet, arm an athlete, tag with the keyboard, and build a collage preview.
2. **Foundation.** Read LeadPack's actual schema and adapt the SQL to it, then create the private R2 bucket and CORS rule, add the scoped access keys to Vercel, run the Neon migration, and write the team-scoped data helper. *Done when* one test photo goes up through a presigned URL, gets a `photos` row, and displays from a presigned GET.
3. **Upload.** Connect the Load module: authorize and finalize, the browser resize, the progress screen, hash dedupe, and the cleanup job. *Done when* a real 400-photo meet uploads end to end and re-running the same batch skips every photo.
4. **Tagging.** Connect the Tag module to real data: the tagging rules, bulk tagging, saved filters, and the coach coverage view. *Done when* a handful of pilot families tag a full meet and the coverage view shows correct counts.
5. **Picks and collage.** Connect the Build module: the pick flow, the three templates, the canvas preview, the `sharp` final render, and the PDF and zip export. *Done when* one pilot athlete's collage prints cleanly on letter-size paper.
6. **Hardening and rollout.** Add opt-out, hide and delete, upload type and size checks, and rate limits, then open it to all families.
7. **Later, only if needed.** A shared Drive or Dropbox folder as an intake inbox, the Worker-based delivery path, bib-number OCR as a tagging aid, cold-storage archiving, and multi-team licensing controls.

**Decisions**

- A photo release for athletes is already on file with the school.
- Originals are JPEGs exported from RAW.
- The build starts by reading LeadPack's actual schema and parent-to-athlete links, then adapting the SQL.
- Only authorized admins upload: super admin, coach, and volunteer coach.
- Collages are US letter size only, set up for easy printing. Team posters are out of scope.
- The Cloudflare account is a DriftBound Media property.

**Still open**

- [ ] What retention period does the existing photo release expect for originals after a season?
- [ ] What is a typical original's file size in MB? JPEGs exported from RAW may run larger than the 5 MB assumed in the cost estimate.

## Handoff to Claude Code

Give Claude Code this document and the kickoff prompt below. It should build the interface first, with seeded data, so the look and feel can be reviewed before any plumbing is wired.

**Working agreements**

- Read LeadPack first: repo layout, schema, auth and roles, parent-to-athlete links, and the UI component library and design tokens. Adapt this spec's names to what exists.
- Build in the phase order above. Stop for review with screenshots after phase 1 (the interface prototype) and after phase 4 (tagging).
- Never store image bytes in Neon, and scope every query by `team_id` through one shared helper.
- No face recognition and no third-party vision service.
- Route every tag, untag, pick, and hide action through one rules module that enforces the tagging rules above, with unit tests.
- Provide a seed script with sample photos and athletes for development, and keep the feature behind a flag until rollout.

**Interface acceptance checks (verify in the prototype)**

- [ ] A grid of 2,000 photos scrolls smoothly because only visible thumbnails render.
- [ ] Arm an athlete, then tag photos using only clicks or the keyboard, with no dialogs.
- [ ] Undo and redo work for tag, untag, pick, and hide.
- [ ] Loading a batch shows thumbnails as they finish, with pause, resume, and a retry on a single file.
- [ ] Build shows a live letter-size preview and swaps a slot in one click.
- [ ] The whole flow works at phone width.
- [ ] A family account lands with its own athlete armed and cannot upload.

**Kickoff prompt**

```text
Read the LeadPack Photos Build Spec in full before writing code.

1. Inspect the LeadPack repo: schema, auth and roles, parent-to-athlete links, UI components and tokens. Summarize what you find and what you will reuse.
2. Build phase 1 first: the Load, Tag, and Build workspace with seeded sample data and no backend, in a dark neutral theme, keyboard-first, as described in the Interface section. Stop and show me screenshots.
3. After my approval, continue through the phases in order. Follow the data model, storage layout, upload pipeline, and privacy rules exactly, and keep every query scoped by team_id.
4. Ask me before changing anything the spec lists under Decisions.
```
