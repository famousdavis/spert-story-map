// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Story Map calls its tiled work a "product" (v0.55.9, BRIEF_product-rename-v3 §4). This guard reads
// every string a person can be shown: each string literal, template part and JSX text in production
// source, checked for the whole word "project" or "projects". `\b` already passes identifiers and
// names that machines read (`projectName`, `ProjectTile`, `spertstorymap_projects`,
// `storymap_get_project`), so none of them needs an entry here.
//
// Three sentences keep the word, because there it means something else. An entry matches by FILE and
// by its EXACT sentence (whitespace collapsed), and must be used exactly once. The sentence is removed
// from its string and the rest of the string is checked again, so a new "project" beside an allowed
// sentence still fails. Never match a whole string (the bridge sits inside a template part of about
// 1,600 characters, so any edit to the prompt's opening would break it) and never by line (a new
// string on that line would pass). A product's name is user data and is never allowed here.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

const SRC = join(import.meta.dirname, '..');
const WORD = /\bprojects?\b/i;

/** Not scanned: a test-only register that quotes SPERT Forecaster's own validator messages (R28). */
const SKIPPED = ['lib/forecasterReachability.ts'];

const ALLOWED = [
  { id: 'A60', file: 'lib/crosslinkProtocol.ts', text: 'SPERT Forecaster opened it as a project for review.',
    reason: "SPERT Forecaster's side of Send to SPERT Forecaster: there it is a project (R43)" },
  { id: 'A75', file: 'pages/AboutView.tsx', text: 'of project management tools.',
    reason: 'the SPERT® Suite describes itself (D9)' },
  { id: 'D13 bridge', file: 'components/ConnectAI/copyPrompt.ts',
    text: 'Some tool names, descriptions and replies still say "project"; wherever they do, it means the product open in SPERT Story Map.',
    reason: 'tells the AI what "project" means in the tools it calls (D13)' },
];

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).sort().flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

function inConsoleCall(node: ts.Node): boolean {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isCallExpression(n) && /^console\./.test(n.expression.getText())) return true;
  }
  return false;
}

/** The text of a node a person can be shown, or null. */
function shownText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) return node.text;
  if (ts.isJsxText(node)) return node.text;
  return null;
}

/** Every string that says "project", as `file:line text`, and how often each allowed sentence was used. */
export function scanForProject(root: string) {
  const hits: string[] = [];
  const used = Object.fromEntries(ALLOWED.map(a => [a.id, 0]));
  for (const path of sourceFiles(root)) {
    const file = relative(root, path).split(sep).join('/');
    if (SKIPPED.includes(file)) continue;
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node) => {
      const text = shownText(node);
      // A literal type (`kind: 'projects'`) and an import path are read by the compiler, not a person.
      if (text !== null && WORD.test(text) && !ts.isLiteralTypeNode(node.parent)
        && !ts.isImportDeclaration(node.parent) && !inConsoleCall(node)) {
        let rest = squash(text);
        for (const entry of ALLOWED) {
          if (entry.file !== file) continue;
          const parts = rest.split(entry.text);
          used[entry.id] = (used[entry.id] ?? 0) + parts.length - 1;
          rest = parts.join(' ');
        }
        if (WORD.test(rest)) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          hits.push(`${file}:${line} ${rest.slice(0, 120)}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { hits, used };
}

describe('"product" on every screen (v0.55.9)', () => {
  it('no production string says "project", except the three allowed sentences', () => {
    expect(scanForProject(SRC).hits).toEqual([]);
  });

  it('each allowed sentence is found exactly once, where it is listed (A75 is the must-find control)', () => {
    expect(scanForProject(SRC).used).toEqual({ A60: 1, A75: 1, 'D13 bridge': 1 });
  });

  it('every skipped file still exists, so a rename cannot widen the skip', () => {
    for (const file of SKIPPED) expect(existsSync(join(SRC, file)), file).toBe(true);
  });

  it('the scan reads JSX text, attributes, templates and plain strings, and skips what it should', () => {
    const dir = join(import.meta.dirname, 'fixtures', 'productWording');
    const { hits } = scanForProject(dir);
    expect(hits).toEqual([
      'probe.tsx:9 Open the project',
      'probe.tsx:10 Delete project',
      'probe.tsx:11 projects',
      'probe.tsx:12 Old Project',
    ]);
  });
});
