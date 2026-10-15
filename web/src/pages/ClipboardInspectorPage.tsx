import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ClipboardPaste } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/PageHeader';
import { extractAthleticIds, parseTsv, summarizePaste, type InspectedLink } from '@/lib/clipboardInspect';

// Super-admin only. Shows exactly what a copy from another page carries
// (text/plain, text/html, the table in it, and every link with any Athletic.net
// ids) so the paste importers are built against real clipboards, not guesses.
// Everything happens in this browser tab: nothing pasted here is sent anywhere
// or stored.

interface Captured {
  plain: string;
  html: string;
  types: string[];
}

function tableFromHtml(html: string): string[][] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return [];
  return Array.from(table.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th,td')).map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim())
  );
}

function linksFromHtml(html: string): InspectedLink[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('a[href]')).map((a) => {
    const href = a.getAttribute('href') ?? '';
    return { text: (a.textContent ?? '').replace(/\s+/g, ' ').trim(), href, ...extractAthleticIds(href) };
  });
}

const Pre: React.FC<{ children: string }> = ({ children }) => (
  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">{children || '(empty)'}</pre>
);

export default function ClipboardInspectorPage() {
  const { currentUser } = useAuth();
  const [cap, setCap] = useState<Captured | null>(null);

  const htmlTable = useMemo(() => tableFromHtml(cap?.html ?? ''), [cap]);
  const plainTable = useMemo(() => parseTsv(cap?.plain ?? ''), [cap]);
  const links = useMemo(() => linksFromHtml(cap?.html ?? ''), [cap]);
  const summary = useMemo(
    () => (cap ? summarizePaste({ plain: cap.plain, html: cap.html, links, tableRows: htmlTable.length || plainTable.length }) : null),
    [cap, links, htmlTable, plainTable]
  );

  if (!currentUser?.isSuperAdmin) {
    return <p className="p-6 text-sm text-muted-foreground">This page is for the platform admin.</p>;
  }

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const dt = e.clipboardData;
    setCap({ plain: dt.getData('text/plain'), html: dt.getData('text/html'), types: Array.from(dt.types) });
  };

  const preview = htmlTable.length ? htmlTable : plainTable;

  return (
    <div className="space-y-6">
      <PageHeader section="neutral" icon={ClipboardPaste} title="Clipboard inspector" description="Paste anything to see what the clipboard really carries." />
      <Alert>
        <AlertDescription>
          Nothing pasted here leaves this browser tab. Don't commit real names: fixtures need made-up names.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Paste here</CardTitle>
          <CardDescription>Click the box and press Ctrl/Cmd+V.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            tabIndex={0}
            onPaste={onPaste}
            className="flex h-28 items-center justify-center rounded-xl border-2 border-dashed text-sm text-muted-foreground outline-none focus:border-primary"
          >
            {cap ? 'Pasted. Paste again to replace.' : 'Click, then paste'}
          </div>
          {cap && (
            <Button variant="outline" size="sm" onClick={() => setCap(null)}>
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {cap && summary && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>Clipboard types: {cap.types.join(', ') || 'none'}</p>
              <p>text/plain: {summary.plainChars} chars · text/html: {summary.htmlChars} chars</p>
              <p>Table rows found: {summary.tableRows} ({htmlTable.length ? 'from HTML' : 'from plain text'})</p>
              <p>
                Links: {summary.links} · athlete ids: {summary.athleteIds} · meet ids: {summary.meetIds} ·{' '}
                <strong>{summary.idsSurvive ? 'ids survive in the HTML' : 'no ids found'}</strong>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Parsed table (first 40 rows)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <tbody>
                  {preview.slice(0, 40).map((row, i) => (
                    <tr key={i} className="border-b">
                      {row.map((c, j) => (
                        <td key={j} className="whitespace-nowrap px-2 py-1">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Links ({links.length})</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left">
                    <th className="px-2 py-1">Text</th>
                    <th className="px-2 py-1">Athlete</th>
                    <th className="px-2 py-1">Meet</th>
                    <th className="px-2 py-1">Team</th>
                    <th className="px-2 py-1">href</th>
                  </tr>
                </thead>
                <tbody>
                  {links.slice(0, 200).map((l, i) => (
                    <tr key={i} className="border-b">
                      <td className="px-2 py-1">{l.text}</td>
                      <td className="px-2 py-1">{l.athleteId ?? ''}</td>
                      <td className="px-2 py-1">{l.meetId ?? ''}</td>
                      <td className="px-2 py-1">{l.teamId ?? ''}</td>
                      <td className="max-w-xs truncate px-2 py-1">{l.href}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>text/plain</CardTitle>
            </CardHeader>
            <CardContent>
              <Pre>{cap.plain}</Pre>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>text/html</CardTitle>
            </CardHeader>
            <CardContent>
              <Pre>{cap.html}</Pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
