// Bookmarklet source for extracting a Cross Country meet's full results
// (every school, every finisher) straight off an athletic.net results page,
// as a CSV shaped for the Field Results upload box (see FieldResultsPage.tsx
// / backend/lib/fieldResultsCsv.js — only "Athlete Name" is required, this
// also fills School/Grade/Time/Place/Status).
//
// Runs entirely in the coach's own browser tab, the same trick a
// third-party extension (athletic.net-data-extractor, MIT) already does —
// see NOTES.md "Meet scraper (Phase 2 step 3): real selectors found" for
// where these selectors came from. That's also why this has to be a
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

    var rows = [['Athlete Name', 'School', 'Grade', 'Time', 'Place', 'Status']];
    var count = 0;

    document.querySelectorAll('.result-row').forEach(function (row) {
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

      rows.push([name, school, grade, time, place, 'FINISHED']);
      count++;
    });

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
