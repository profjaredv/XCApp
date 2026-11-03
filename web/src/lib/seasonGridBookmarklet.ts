// Bookmarklet for importing a season's results from Athletic.net's team
// Results Grid (https://www.athletic.net/team/<id>/cross-country/<year>/results-grid)
// in the coach's own browser.
//
// Why a bookmarklet: Athletic.net now answers server-side scraping with a
// Cloudflare bot check (see archive/athletic-net-scrapers), and moved the
// season grid to an Angular page the old scraper can't read. The coach
// already opens this page as a normal visitor; this reads what is on their
// screen, one page, when they click it — it does not fetch anything else
// from Athletic.net and does nothing to get past its checks.
//
// Output is the server scraper's own CSV (backend/routes/teams.js
// importSeasonCsv): Race Name, Athlete Name, Grade, Gender, Time, Race Date,
// Distance, Source URL, Athletic Meet ID, Athletic Athlete ID — with Race
// Name = the meet name, Race Date = "Sep 8, 2026" and Distance = the grid's
// legend text ("5000 Meters"), exactly as the old scraper wrote them, so
// re-importing updates the existing races instead of duplicating them.
//
// Page structure confirmed against a saved copy of Ellensburg's 2026 grid
// (Angular 22): table.results-table rows (tr.y<grade>, td.grade,
// td.athlete-name a, td.result-cell > span + span.subscript), the
// .distance-legend-horizontal key, the .meet-list-table (date label + meet
// link, in column order) and the .gender-switch Mens/Womens buttons. The
// page shows one gender at a time, so this reads the visible one, clicks
// the other, waits for the table to change, reads it, and switches back.
//
// The copy happens from a button in a small panel this adds to the page:
// after the gender switch the original click is too old for the browser to
// allow a clipboard write, and a fresh click on "Copy" always is.
const BOOKMARKLET_SOURCE = `
(function () {
  var PANEL_ID = 'leadpack-season-import';
  function clean(v) { return (v || '').replace(/\\s+/g, ' ').trim(); }
  function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function fail(msg) { alert('LeadPack: ' + msg); }

  var yearMatch = location.pathname.match(/\\/cross-country\\/(\\d{4})\\/results-grid/);
  if (!yearMatch) {
    fail('Open your team\\'s Results Grid on athletic.net first (Team page \\u2192 Results \\u2192 Results Grid, a URL ending in /cross-country/<year>/results-grid), then click this bookmark again.');
    return;
  }
  var year = yearMatch[1];

  function legend() {
    var key = {};
    function add(sub, container) {
      var copy = container.cloneNode(true);
      var subs = copy.querySelectorAll('sub');
      for (var i = 0; i < subs.length; i++) subs[i].parentNode.removeChild(subs[i]);
      var label = clean(copy.textContent);
      var k = clean(sub.textContent);
      if (/^\\d+$/.test(k) && label && label.indexOf('|') < 0) key[k] = label;
    }
    document.querySelectorAll('.distance-legend-horizontal span').forEach(function (span) {
      var sub = span.querySelector('sub');
      if (sub) add(sub, span);
    });
    if (Object.keys(key).length === 0) {
      // The key may live outside the class the saved page used: any <sub> number
      // beside a label, anywhere but the results table.
      document.querySelectorAll('sub').forEach(function (sub) {
        if (sub.closest('table.results-table')) return;
        if (sub.parentNode && sub.parentNode !== document.body) add(sub, sub.parentNode);
      });
    }
    return key;
  }

  function meets() {
    var list = [];
    document.querySelectorAll('.meet-list-table tbody tr').forEach(function (tr) {
      var label = tr.querySelector('label');
      var link = tr.querySelector('a[href*="/meet/"]');
      if (!label || !link) return;
      var id = (link.getAttribute('href') || '').match(/\\/meet\\/(\\d+)/);
      list.push({ date: clean(label.textContent), name: clean(link.textContent), url: link.href, id: id ? id[1] : '' });
    });
    return list;
  }

  function activeGender() {
    var active = document.querySelector('.gender-switch button.active');
    var t = clean(active && active.textContent).toLowerCase();
    if (/women|girl/.test(t)) return 'Women';
    if (/men|boy/.test(t)) return 'Men';
    return '';
  }

  function signature() {
    var rows = document.querySelectorAll('table.results-table tbody tr');
    var first = rows[0] && rows[0].querySelector('td.athlete-name a');
    return rows.length + '|' + clean(first && first.textContent) + '|' + activeGender();
  }

  var unread = 0;
  var unreadSeen = {};
  function readTable(gender, key, meetList) {
    var out = [];
    document.querySelectorAll('table.results-table tbody tr').forEach(function (tr) {
      var nameEl = tr.querySelector('td.athlete-name a');
      if (!nameEl) return;
      var gradeEl = tr.querySelector('td.grade');
      var grade = clean(gradeEl && gradeEl.textContent);
      if (!/^\\d+$/.test(grade)) {
        var m = (tr.className || '').match(/\\by(\\d+)\\b/);
        grade = m ? m[1] : '';
      }
      tr.querySelectorAll('td.result-cell').forEach(function (td, i) {
        var spans = td.querySelectorAll('span');
        var timeEl = null, subEl = td.querySelector('.subscript, sub, sup');
        for (var k = 0; k < spans.length; k++) { if (!spans[k].classList.contains('subscript')) { timeEl = spans[k]; break; } }
        var time = clean(timeEl && timeEl.textContent);
        if (!/^\\d+:\\d/.test(time)) return;
        var meet = meetList[i] || {};
        if (subEl && !key[clean(subEl.textContent)]) unreadSeen[clean(subEl.textContent)] = 1;
        out.push([
          meet.name || 'Unknown Meet',
          clean(nameEl.textContent),
          grade,
          gender,
          time,
          (meet.date || 'Unknown Date') + ', ' + year,
          key[clean(subEl && subEl.textContent)] || (unread++, 'Unknown'),
          meet.url || '',
          meet.id || '',
          nameEl.href || ''
        ]);
      });
    });
    return out;
  }

  function waitForChange(before, ms) {
    return new Promise(function (resolve) {
      var start = Date.now();
      (function poll() {
        if (signature() !== before) return setTimeout(function () { resolve(true); }, 300);
        if (Date.now() - start > ms) return resolve(false);
        setTimeout(poll, 150);
      })();
    });
  }

  function showPanel(csv, summary) {
    var old = document.getElementById(PANEL_ID);
    if (old) old.parentNode.removeChild(old);
    var box = document.createElement('div');
    box.id = PANEL_ID;
    box.setAttribute('style', 'position:fixed;z-index:2147483647;right:16px;bottom:16px;width:360px;max-width:calc(100vw - 32px);background:#fff;color:#14231a;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.25);padding:16px;font:14px/1.4 system-ui,sans-serif');
    box.innerHTML = '<div style="font-weight:700;font-size:15px;margin-bottom:4px">LeadPack season import</div>' +
      '<div class="lp-sum" style="margin-bottom:10px"></div>' +
      '<button type="button" class="lp-copy" style="width:100%;padding:10px;border:0;border-radius:12px;background:#14532d;color:#fff;font-weight:600;cursor:pointer">Copy results</button>' +
      '<textarea class="lp-text" readonly style="width:100%;height:70px;margin-top:8px;font:11px monospace;border:1px solid #ccc;border-radius:8px"></textarea>' +
      '<div style="margin-top:6px;font-size:12px;color:#555">Then paste it into LeadPack\\'s Data Management page. <a href="#" class="lp-close">Close</a></div>';
    document.body.appendChild(box);
    box.querySelector('.lp-sum').textContent = summary;
    var ta = box.querySelector('.lp-text');
    ta.value = csv;
    box.querySelector('.lp-close').onclick = function (e) { e.preventDefault(); box.parentNode.removeChild(box); };
    box.querySelector('.lp-copy').onclick = function () {
      var btn = this;
      function done() { btn.textContent = 'Copied \\u2014 now paste it into LeadPack'; }
      function manual() { ta.focus(); ta.select(); btn.textContent = 'Press Ctrl/Cmd+C to copy the selected text'; }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(csv).then(done, manual);
      else manual();
    };
  }

  try {
    var key = legend();
    var legendKey = key;
    var meetList = meets();
    if (!document.querySelector('table.results-table') || meetList.length === 0) {
      fail('No results grid found on this page. Wait for it to finish loading, then click the bookmark again.');
      return;
    }
    var first = activeGender() || 'Men';
    var rows = readTable(first, key, meetList);
    var counts = {}; counts[first] = rows.length;
    var buttons = Array.prototype.slice.call(document.querySelectorAll('.gender-switch button'));
    var other = buttons.filter(function (b) { return !b.classList.contains('active'); })[0];
    var back = buttons.filter(function (b) { return b.classList.contains('active'); })[0];

    var finish = function (gotOther, otherGender) {
      if (rows.length === 0) { fail('The grid has no times yet for this season.'); return; }
      var csv = [['Race Name', 'Athlete Name', 'Grade', 'Gender', 'Time', 'Race Date', 'Distance', 'Source URL', 'Athletic Meet ID', 'Athletic Athlete ID']]
        .concat(rows).map(function (r) { return r.map(csvCell).join(','); }).join('\\n');
      var parts = Object.keys(counts).map(function (g) { return counts[g] + ' ' + (g === 'Men' ? 'boys' : 'girls') + ' results'; });
      var warn = unread > 0 ? ' WARNING: ' + unread + ' results have no distance (the page\\'s distance key was not read: ' + Object.keys(legendKey).length + ' entries found, unmatched subscripts: ' + (Object.keys(unreadSeen).join(',') || 'none') + '). Do not import these yet.' : '';
      var note = gotOther ? '' : ' Only ' + (first === 'Men' ? 'boys' : 'girls') + ' were read; the other side did not load. LeadPack will add them without removing anything, and you can run this again for the other side.';
      showPanel(csv, year + ': ' + parts.join(' and ') + ' across ' + meetList.length + ' meets.' + note + warn);
    };

    if (!other) { finish(false); return; }
    var before = signature();
    other.click();
    waitForChange(before, 8000).then(function (changed) {
      var otherGender = activeGender();
      if (changed && otherGender && otherGender !== first) {
        var more = readTable(otherGender, key, meetList);
        counts[otherGender] = more.length;
        rows = rows.concat(more);
      }
      if (back) back.click();
      finish(changed && !!otherGender && otherGender !== first, otherGender);
    });
  } catch (e) {
    fail('Reading the grid failed: ' + (e && e.message ? e.message : e));
  }
})();
`.trim();

export function buildSeasonGridBookmarkletHref(): string {
  return `javascript:${encodeURIComponent(BOOKMARKLET_SOURCE)}`;
}

/** Exported for tests only: the source runs in a coach's browser tab, never under Node. */
export const __TEST_ONLY_SEASON_GRID_SOURCE = BOOKMARKLET_SOURCE;
