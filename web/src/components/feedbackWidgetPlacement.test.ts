import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The feedback trigger used to be a fixed bottom-right pill. That is the
// one corner a form can't spare: it sat over the last field and the Save
// button under it, and on a phone with the keyboard up it covered the
// input being typed into. It now renders inline in Layout's header.

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\{\/\*)/.test(l))
    .join('\n');

const widget = code(read('components/FeedbackWidget.tsx'));
const layout = code(read('components/Layout.tsx'));

describe('feedback trigger placement', () => {
  it('does not float over the page', () => {
    const trigger = widget.slice(widget.indexOf('<button'), widget.indexOf('</button>'));
    expect(trigger).not.toContain('fixed');
    expect(trigger).not.toContain('bottom-5');
    expect(trigger).not.toContain('right-5');
  });

  it('renders inside the header, not as a sibling of the page content', () => {
    const header = layout.slice(layout.indexOf('<header'), layout.indexOf('</header>'));
    expect(header).toContain('<FeedbackWidget />');
    // Exactly one mount — a leftover copy after <main> would put the pill back.
    expect(layout.match(/<FeedbackWidget \/>/g) ?? []).toHaveLength(1);
  });

  it('keeps its own positioning context so the error badge still anchors to it', () => {
    // `fixed` used to make the button a positioned ancestor for free;
    // without `relative` the absolute badge escapes to the header.
    const trigger = widget.slice(widget.indexOf('<button'), widget.indexOf('</button>'));
    expect(trigger).toContain('relative');
    expect(widget).toContain('absolute right-0 top-0');
  });

  it('right-aligns via the team name flexing, not competing ml-auto siblings', () => {
    // Two siblings both carrying ml-auto split the free space between
    // them; the season picker would drift to the middle instead of
    // sitting next to the feedback button.
    expect(layout).toContain('truncate min-w-0 flex-1');
    const header = layout.slice(layout.indexOf('<header'), layout.indexOf('</header>'));
    expect(header).not.toContain('ml-auto');
    const trigger = widget.slice(widget.indexOf('<button'), widget.indexOf('</button>'));
    expect(trigger).not.toContain('ml-auto');
  });

  it('stays reachable when the label is hidden on a narrow header', () => {
    expect(widget).toContain('aria-label="Log feedback about this screen"');
    expect(widget).toContain('md:inline');
  });
});
