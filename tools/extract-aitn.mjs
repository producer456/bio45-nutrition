#!/usr/bin/env node
// Read-only scaffold builder.
//
// Parses the local copy of "An Introduction to Nutrition" (Saylor, 2013,
// CC BY-NC-SA 3.0) and writes each section's learning objectives, key takeaways,
// exercises and subheads to content/_seed/ so the author has the shape of a
// chapter in front of them.
//
// The seed is NOT shipped. content/_seed/ is gitignored, and tests/content.test.mjs
// checks that no long verbatim run from a source book appears in what is. Reading
// cards are written in our own words with a citation; the book stays the book.
//
//   node tools/extract-aitn.mjs [path-to-zip]

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ZIP = process.argv[2] ??
  '/home/david/Downloads/nutrition/an-introduction-to-nutrition.zip';
const OUT = new URL('../content/_seed/', import.meta.url).pathname;

if (!existsSync(ZIP)) {
  console.error(`No source archive at ${ZIP}.\n` +
    `It lives outside this repo on purpose — nothing from it is redistributed.`);
  process.exit(1);
}

// sNN -> book chapter number: s05 is chapter 1, through s19 = chapter 15.
const chapterOf = file => Number(file.slice(1, 3)) - 4;

const list = execFileSync('unzip', ['-Z1', ZIP], { encoding: 'utf8' })
  .split('\n').filter(n => /\/s\d\d-\d\d-.*\.html$/.test(n)).sort();

// A plain regex cannot find these blocks: the markup nests <div>s inside them, so
// the first </div> is usually not the block's own. Walk the tags and count depth.
function block(html, cls) {
  // A section can carry more than one block of a kind — "Discussion Starters" is
  // another exercises block — so collect every one, not just the first.
  const out = [];
  let from = 0;
  for (;;) {
    const marker = html.indexOf(`class="${cls}`, from);
    if (marker === -1) return out;
    const start = html.lastIndexOf('<div', marker);
    if (start === -1) return out;
    from = marker + 1;

    // We are already inside the opening <div>, so depth starts at 1.
    let depth = 1, p = start, end = -1;
    while (depth > 0) {
      const nextOpen = html.indexOf('<div', p + 1);
      const nextClose = html.indexOf('</div>', p + 1);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) { depth++; p = nextOpen; }
      else { depth--; p = nextClose; if (depth === 0) end = nextClose; }
    }
    if (end === -1) continue;
    out.push(...[...html.slice(start, end).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
      .map(m => text(m[1])).filter(Boolean));
    from = end;
  }
}
const text = s => s.replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ')
  .replace(/\s+/g, ' ').trim();

mkdirSync(OUT, { recursive: true });
const manifest = [];

for (let ch = 1; ch <= 15; ch++) {
  const files = list.filter(f => chapterOf(f.split('/').pop()) === ch);
  if (!files.length) continue;
  const sections = files.map(f => {
    const html = execFileSync('unzip', ['-p', ZIP, f], { encoding: 'utf8' });
    const h2 = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const title = h2 ? text(h2[1]) : '';
    const cite = title.match(/^(\d+\.\d+)/)?.[1] ?? null;
    return {
      file: f.split('/').pop(), cite, title: title.replace(/^\d+\.\d+\s*/, ''),
      objectives: block(html, 'learning_objectives'),
      takeaways: block(html, 'key_takeaways'),
      exercises: block(html, 'exercises'),
      subheads: [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map(m => text(m[1])).filter(Boolean),
    };
  });
  const path = join(OUT, `chapter-${String(ch).padStart(2,'0')}.json`);
  writeFileSync(path, JSON.stringify({ chapter: ch, sections }, null, 1));
  const n = k => sections.reduce((s, x) => s + x[k].length, 0);
  manifest.push({ chapter: ch, sections: sections.length,
    objectives: n('objectives'), takeaways: n('takeaways'), exercises: n('exercises') });
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
  source: 'An Introduction to Nutrition (Saylor Academy, 2013), CC BY-NC-SA 3.0',
  extractedAt: new Date().toISOString().slice(0,10),
  note: 'Authoring scaffold only. Not shipped, not redistributed.',
  chapters: manifest,
}, null, 1));

const tot = k => manifest.reduce((s, c) => s + c[k], 0);
console.log(`${manifest.length} chapters -> ${OUT}`);
console.log(`  ${tot('sections')} sections, ${tot('objectives')} objectives, ` +
            `${tot('takeaways')} takeaways, ${tot('exercises')} exercises`);
