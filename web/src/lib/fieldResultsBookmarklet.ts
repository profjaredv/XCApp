// Bookmarklet source for extracting a Cross Country meet's full results
// (every school, every finisher, every division) straight off an
// athletic.net results page, as a CSV shaped for the Field Results upload
// box (see FieldResultsPage.tsx / backend/lib/fieldResultsCsv.js — only
// "Athlete Name" is required, this also fills Division/Gender/School/Grade/
// Time/Place/Status). Gender is only populated on the results/all layout,
// which reliably marks each division as Mens/Womens Results; a single-race
// page has no such marker and leaves it blank rather than guessing.
//
// A results/all page is usually more than one race: Varsity, JV Gold, JV
// White, Freshman, etc. each get their own section, and our own Race rows
// don't reliably split along those same lines (the season scraper that
// creates them only ever saw our own team's PRs per meet, never which
// heat/level each one raced in — see NOTES.md's field-results notes). So
// this can't guess which of our races a division belongs to; it just tags
// every row with the on-page division label and leaves the human to map
// each one in the upload dialog.
//
// Runs entirely in the coach's own browser tab, the same trick a
// third-party extension (athletic.net-data-extractor, MIT) already does —
// see NOTES.md "Meet scraper (Phase 2 step 3): real selectors found" for
// where the shared-result-grid/.result-row selectors came from. That's also
// why this has to be a bookmarklet and not something our server fetches:
// athletic.net's Cloudflare challenge blocks server-side automation, but
// not a real, logged-in human browser tab.
//
// Two different page layouts, confirmed against real markup (not
// assumption — this project's rule for selectors) from a coach's own
// browser:
//   - A single race's own results page renders shared-result-grid's
//     .result-row cards (h5/.mb-4 ancestor for sectioned pages).
//   - The meet's combined results/all page — the one this feature actually
//     wants, since it's every division in one page — instead renders a
//     plain Angular table per division: each division is a `.event-block`
//     containing an `h5[id] a` header (the division name) and a
//     `table.DataTable` of `<tr>`s, `td.athlete-name a` / `td.td-truncate a`
//     / `a[href*="/result/"]` for name/school/time. .result-row and
//     shared-result-grid don't exist anywhere on this page — an earlier
//     version of this bookmarklet only knew the single-race layout and
//     silently found zero rows here. Division names can repeat verbatim
//     across genders (e.g. both Mens and Womens "1 Miles Youth 1 mile" as
//     distinct events), so the division label is prefixed with the
//     Mens/Womens Results header above it.
//
// Kept as a template string (not minified) so it stays readable/diffable
// here; buildBookmarkletHref() below does the one-line javascript: encoding
// at render time.
const BOOKMARKLET_SOURCE = `
(function () {
  try {
    if (window.location.href.indexOf('/CrossCountry/meet/') === -1) {
      alert('Open a Cross Country meet results page on athletic.net first (a URL like .../CrossCountry/meet/<id>/results/all), then click this bookmarklet again.');
      return;
    }

    function clean(v) {
      if (!v) return '';
      v = v.trim();
      return v === '--' ? '' : v;
    }
    function csvCell(v) {
      return '"' + String(v || '').replace(/"/g, '""') + '"';
    }

    var rows = [['Athlete Name', 'Division', 'Gender', 'School', 'Grade', 'Time', 'Place', 'Status']];
    var count = 0;

    // Layout A: results/all's per-division Angular table. Every division on
    // the page is its own .event-block; skip a block with no id'd h5 (that's
    // the "Official Team Scores" sub-table, not a results table) and skip a
    // table row with no name+time (team-scoring rows, blank rows).
    var eventBlocks = document.querySelectorAll('.event-block');
    if (eventBlocks.length > 0) {
      eventBlocks.forEach(function (block) {
        var headerLink = block.querySelector('h5[id] a');
        var divisionLabel = clean(headerLink && headerLink.textContent);
        if (!divisionLabel) return;

        // h4's own text is "Mens Results"/"Womens Results", but on narrow
        // viewports it also nests a "jump to the other gender" link (e.g.
        // "Women") whose text textContent would otherwise pull in too —
        // strip any nested <a> before reading it.
        var genderHeader = block.parentElement && block.parentElement.querySelector('h4');
        var genderLabel = '';
        if (genderHeader) {
          var headerClone = genderHeader.cloneNode(true);
          var toggleLink = headerClone.querySelector('a');
          if (toggleLink && toggleLink.parentNode) toggleLink.parentNode.removeChild(toggleLink);
          genderLabel = clean(headerClone.textContent);
        }
        var fullLabel = genderLabel ? genderLabel + ' - ' + divisionLabel : divisionLabel;

        // "Women" contains "men" as a substring, so check it first —
        // genderLabel is always "Mens Results" or "Womens Results" (the
        // toggle-link text was already stripped above).
        var genderValue = '';
        if (/women/i.test(genderLabel)) genderValue = 'F';
        else if (/men/i.test(genderLabel)) genderValue = 'M';

        block.querySelectorAll('table.DataTable > tbody > tr').forEach(function (row) {
          var nameEl = row.querySelector('td.athlete-name a');
          var timeEl = row.querySelector('a[href*="/result/"]');
          var name = clean(nameEl && nameEl.textContent);
          var time = clean(timeEl && timeEl.textContent);
          if (!name || !time) return;

          var cells = row.querySelectorAll('td');
          var placeRaw = clean(cells[0] && cells[0].textContent);
          var place = placeRaw.replace(/\\.$/, '');
          var gradeEl = row.querySelector('td.small.text-muted');
          var grade = clean(gradeEl && gradeEl.textContent);
          var schoolEl = row.querySelector('td.td-truncate a');
          var school = clean(schoolEl && schoolEl.textContent);

          rows.push([name, fullLabel, genderValue, school, grade, time, place, 'FINISHED']);
          count++;
        });
      });
    } else {
      // Layout B: a single race/division's own results page — shared-
      // result-grid's .result-row cards. Each division is its own h5-headed
      // section wrapping a shared-result-grid when the page splits heats
      // this way; falls back to a flat sweep (one unlabeled division) when
      // it doesn't.
      var extractCardRow = function (row, division) {
        var placeEl = row.querySelector('.place-column');
        var nameEl = row.querySelector('.primary .title a[href*="/athlete/"]');
        var schoolEl = row.querySelector('.subtitle.team .text-overflow-ellipsis a');
        var timeEl = row.querySelector('.secondary .title a');
        var tertiaryEl = row.querySelector('shared-tertiary-stats');

        var name = clean(nameEl && nameEl.textContent);
        var time = clean(timeEl && timeEl.textContent);
        if (!name || !time) return; // no reliable row without at least a name and a time

        var place = clean(placeEl && placeEl.textContent);
        var school = clean(schoolEl && schoolEl.textContent);
        var tertiaryText = clean(tertiaryEl && tertiaryEl.textContent);
        var gradeMatch = tertiaryText.match(/Yr: (\\d+)/);
        var grade = gradeMatch ? gradeMatch[1] : '';

        // No reliable gender signal on this layout (no Mens/Womens Results
        // header to read) — left blank rather than guessed.
        rows.push([name, division, '', school, grade, time, place, 'FINISHED']);
        count++;
      };

      var sections = [];
      document.querySelectorAll('h5').forEach(function (h5) {
        var container = h5.closest('.mb-4');
        if (!container) return;
        var grid = container.querySelector('shared-result-grid');
        if (!grid) return;
        sections.push({ label: clean(h5.textContent), grid: grid });
      });

      if (sections.length > 0) {
        sections.forEach(function (section) {
          section.grid.querySelectorAll('.result-row').forEach(function (row) {
            extractCardRow(row, section.label);
          });
        });
      } else {
        document.querySelectorAll('.result-row').forEach(function (row) {
          extractCardRow(row, '');
        });
      }
    }

    if (count === 0) {
      alert('No results found on this page. If it looked empty when it loaded, scroll down (some meet pages lazy-load results) and try again.');
      return;
    }

    var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\\n');

    function fallbackPrompt() {
      window.prompt('Copy this CSV (select all, then Ctrl/Cmd+C), then paste it into LeadPack\\'s Field Results upload box:', csv);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(csv).then(function () {
        alert('Copied ' + count + ' finisher(s) as CSV. Switch to LeadPack\\'s Field Results page and paste into the upload box.');
      }, fallbackPrompt);
    } else {
      fallbackPrompt();
    }
  } catch (e) {
    alert('Extraction failed: ' + (e && e.message ? e.message : e));
  }
})();
`.trim();

export function buildBookmarkletHref(): string {
  return `javascript:${encodeURIComponent(BOOKMARKLET_SOURCE)}`;
}
