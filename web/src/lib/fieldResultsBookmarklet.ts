// Bookmarklet source for extracting a Cross Country meet's full results
// (every school, every finisher, every division) straight off an
// athletic.net results page, as a CSV shaped for the Field Results upload
// box (see FieldResultsPage.tsx / backend/lib/fieldResultsCsv.js — only
// "Athlete Name" is required, this also fills Division/School/Grade/Time/
// Place/Status).
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
// where these selectors came from, including the h5-section-header walk
// used below to split divisions. That's also why this has to be a
// bookmarklet and not something our server fetches: athletic.net's
// Cloudflare challenge blocks server-side automation, but not a real,
// logged-in human browser tab.
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

    var rows = [['Athlete Name', 'Division', 'School', 'Grade', 'Time', 'Place', 'Status']];
    var count = 0;

    function extractRow(row, division) {
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

      rows.push([name, division, school, grade, time, place, 'FINISHED']);
      count++;
    }

    // Each division (Varsity, JV Gold, Freshman, ...) is its own h5-headed
    // section wrapping a shared-result-grid of .result-row's. Walk sections
    // when present so every row keeps its division label; only fall back to
    // a flat sweep (single unlabeled division) if the page has none — e.g.
    // a meet with just one race.
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
          extractRow(row, section.label);
        });
      });
    } else {
      document.querySelectorAll('.result-row').forEach(function (row) {
        extractRow(row, '');
      });
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
