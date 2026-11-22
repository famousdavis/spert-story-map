// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Products page's SPERT® Story Map is drawn as a gradient in Story Map's favicon indigo (#4f46e5, HDR26,
 * v0.56.4), and every point of it stays readable on the page behind it, in both themes.
 *
 * ⚠️ jsdom has no paint, so nothing here is measured from a render: the end colours are read from
 * `ProjectsHeader.tsx`'s source, the page's background from `ProductList.tsx`'s classes, resolved through the
 * installed Tailwind's own `theme.css`, and the contrast is computed here from the WCAG 2.x definition. The
 * rendered page was measured in headless Chrome when this was written (the colours, the backgrounds at 1,024 and
 * 800 px, a live theme switch, print and increased contrast). The colour maths is the HDR26 plan's Appendix A,
 * typed; it is copied from SPERT Scheduler's guard, not shared.
 *
 * The bar is 3 : 1 at every point of each ramp. The title is bold and at least 24 px at every width (`text-2xl`,
 * 33.6 px from 768 px up), which is large text at every width (18.66 px bold is the threshold), and 3 : 1 is the
 * owner's bar for a title that stays large (WCAG exempts logotypes). Both ramps clear it with little room, the
 * dark one by hundredths (3.03), on purpose: the pinned backgrounds below are what catches a change that would
 * sink them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from '@tailwindcss/node';
import { req } from './testHelpers';

const SRC = resolve(__dirname, '..');
const HEADER = resolve(SRC, 'components/product/ProjectsHeader.tsx');
const PAGE = resolve(SRC, 'pages/ProductList.tsx');
const INDEX_CSS = resolve(SRC, 'index.css');
const THEME_CSS = resolve(SRC, '../node_modules/tailwindcss/theme.css');

const BAR = 3;
/** The page's background in each theme, measured in Chrome (`getComputedStyle`, read through a canvas). */
const PREMISE = { light: '#ffffff', dark: '#030712' } as const;
/** "SPERT" and "Story Map": one gradient per word, with the ® between them. */
const GRADIENT_SPANS = 2;

// ---- Appendix A (HDR26 plan v6), typed --------------------------------------------------------------------------

type Triple = [number, number, number];

const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const delin = (v: number) =>
  Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
const rgb = (h: string): Triple => [1, 3, 5].map(i => Number.parseInt(h.slice(i, i + 2), 16)) as Triple;
const hex = (a: number[]) => '#' + a.map(v => v.toString(16).padStart(2, '0')).join('');
const luminance = (h: string) => {
  const [r, g, b] = rgb(h).map(lin) as Triple;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** A contrast ratio to two decimals, truncated: never rounded up across a bar. */
const trunc = (n: number) => (Math.floor(n * 100) / 100).toFixed(2);

const toOklab = (h: string): Triple => {
  const [r, g, b] = rgb(h).map(lin) as Triple;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};
const linFromOklab = ([lk, a, b]: Triple): Triple => {
  const l = (lk + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lk - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lk - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
};
const fromOklab = (lab: Triple) => hex(linFromOklab(lab).map(delin));
const toLch = (h: string): Triple => {
  const [lk, a, b] = toOklab(h);
  return [lk, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
};
const lab = ([lk, c, h]: Triple): Triple => [lk, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
const inGamut = (lch: Triple) => linFromOklab(lab(lch)).every(v => v >= -1e-6 && v <= 1 + 1e-6);
/** Fit to sRGB by cutting chroma at fixed lightness and hue; never by clamping channels, which turns the hue. */
const fromLch = ([lk, c, h]: Triple) => {
  let fit = c;
  if (!inGamut([lk, c, h])) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut([lk, mid, h])) lo = mid;
      else hi = mid;
    }
    fit = lo;
  }
  return fromOklab(lab([lk, fit, h]));
};

/** A colour as Tailwind's theme.css writes it: `#rgb`, `#rrggbb`, or `oklch(L% C H)` with H possibly `none`. */
function parseCssColor(value: string): string {
  const v = value.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(v);
  if (short) return '#' + Array.from(req(short[1], 'short hex')).map(c => c + c).join('').toLowerCase();
  const long = /^#([0-9a-f]{6})$/i.exec(v);
  if (long) return '#' + req(long[1], 'hex').toLowerCase();
  const ok = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+|none)\s*\)$/i.exec(v);
  if (ok) {
    const [, l, c, h] = ok;
    return fromOklab(lab([Number(l) / 100, Number(c), h === 'none' ? 0 : Number(h)]));
  }
  throw new Error('unreadable color: ' + v);
}

/**
 * The weakest contrast along a ramp, 41 samples. `oklab` is how Tailwind 4's `bg-gradient-to-r` interpolates
 * (`to right in oklab`); `srgb` is a plain gradient's. Both are checked, so a change of interpolation cannot pass.
 */
function weakest(e1: string, e2: string, ground: string, space: 'oklab' | 'srgb'): number {
  const [a, b] = [toOklab(e1), toOklab(e2)];
  const [p, q] = [rgb(e1), rgb(e2)];
  const mix = (x: number[], y: number[], t: number) => x.map((v, k) => v + (req(y[k], 'channel') - v) * t);
  let min = Infinity;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const c = space === 'oklab' ? fromOklab(mix(a, b, t) as Triple) : hex(mix(p, q, t).map(Math.round));
    min = Math.min(min, contrast(c, ground));
  }
  return min;
}

// ---- Reading the source ---------------------------------------------------------------------------------------

const read = (file: string) => readFileSync(file, 'utf8');
const classList = (raw: string) => raw.split(/\s+/).filter(Boolean);

/** Every `const NAME = '…'` (or "…") in a file, so a `className={NAME}` can be resolved to the classes it carries. */
function stringConstants(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const m of text.matchAll(/\bconst\s+([A-Za-z_]\w*)\s*=\s*(?:'([^']*)'|"([^"]*)")/g)) {
    found.set(req(m[1], 'name'), req(m[2] ?? m[3], 'value'));
  }
  return found;
}

/** The title: ProjectsHeader's one `<h1 className=…>` element up to its closing tag (comments may name `<h1>`). */
function titleH1(text: string): string {
  const opens = Array.from(text.matchAll(/<h1\s+className=/g), m => m.index);
  const start = req(opens[0], 'the title <h1>');
  const end = text.indexOf('</h1>', start);
  if (opens.length !== 1 || end === -1) throw new Error('ProjectsHeader: not exactly one <h1> element');
  return text.slice(start, end);
}

/** JSX text as rendered: `{' x'}` / `{"x"}` unwrapped; a line break and its indentation is no text at all. */
function jsxText(raw: string): string {
  return raw.replace(/\s*\n\s*/g, '')
    .replace(/\{'([^']*)'\}|\{"([^"]*)"\}/g, (_, a: string | undefined, b: string | undefined) => a ?? b ?? '');
}

interface TitleSpan {
  classes: string[];
  text: string;
}

const SPAN = /<span\s+className=(?:"([^"]*)"|'([^']*)'|\{(\w+)\})>([^<]*)<\/span>/g;

/**
 * Every span in the title, in order: a literal `className="…"`, or a `className={NAME}` resolved through the file's
 * string constants. A class name that cannot be resolved, or a span of any other shape, fails loudly, so no span can
 * escape the census by carrying its classes some other way.
 */
function titleSpans(text: string): TitleSpan[] {
  const h1 = titleH1(text);
  const constants = stringConstants(text);
  const spans = Array.from(h1.matchAll(SPAN), m => {
    const raw = m[1] ?? m[2] ?? constants.get(req(m[3], 'constant name'));
    if (raw === undefined) throw new Error(`ProjectsHeader: className={${m[3]}} is not a string constant`);
    return { classes: classList(raw), text: jsxText(req(m[4], 'span text')) };
  });
  if (spans.length !== (h1.match(/<span\b/g) ?? []).length) throw new Error('ProjectsHeader: a title span the guard cannot read');
  return spans;
}

const gradientSpans = (text: string) => titleSpans(text).filter(s => s.classes.includes('bg-clip-text'));

/** The `<h1>`'s own text, between its spans, as rendered. */
const h1OwnText = (text: string) => jsxText(titleH1(text).replace(/^<h1[^>]*>/, '').replace(SPAN, ''));

/** The one class with this exact variant and utility, e.g. `dark:` + `from-` → `#828dff`. Exactly one, or it fails. */
function endColor(classes: string[], variant: '' | 'dark:', utility: 'from' | 'to'): string {
  const pattern = new RegExp(`^${variant}${utility}-\\[(#[0-9a-f]{6})\\]$`, 'i');
  const hits = classes.flatMap(c => pattern.exec(c)?.[1] ?? []);
  if (hits.length !== 1) throw new Error(`${variant}${utility}-[#…]: found ${hits.length}, expected exactly 1`);
  return req(hits[0], 'end colour').toLowerCase();
}

interface Ends {
  light: [string, string];
  dark: [string, string];
}

const endsOf = (classes: string[]): Ends => ({
  light: [endColor(classes, '', 'from'), endColor(classes, '', 'to')],
  dark: [endColor(classes, 'dark:', 'from'), endColor(classes, 'dark:', 'to')],
});

/**
 * A class list's one colour class for a variant: `bg-white` → `white` for `bg-`, `dark:bg-gray-950` → `gray-950`.
 * Only colour shapes count, so `text-2xl` or `text-base` is never read as a colour.
 */
function colorToken(classes: string[], head: string): string {
  const shape = new RegExp(`^${head}(?:white|black|[a-z]+-\\d{2,3})$`);
  const hits = classes.filter(c => shape.test(c)).map(c => c.slice(head.length));
  if (hits.length !== 1) throw new Error(`${head}…: found ${hits.length}, expected exactly 1`);
  return req(hits[0], 'colour token');
}

/** A Tailwind colour token's value in the installed theme.css (`white` → `#fff`), as #rrggbb. */
function themeColor(token: string): string {
  const m = new RegExp(`--color-${token}:\\s*([^;]+);`).exec(read(THEME_CSS));
  return parseCssColor(req(m?.[1], `theme.css --color-${token}`));
}

/** Every static `className="…"` in a stretch of JSX, in order. */
const classNamesIn = (jsx: string) => Array.from(jsx.matchAll(/className="([^"]*)"/g), m => classList(req(m[1], 'classes')));

/**
 * The title's ground: the page's root, from ProductList's `return (` down to `<ProjectsHeader`. The first element
 * paints it; nothing after it, nor anything in the header down to the `<h1>`, may paint a ground of its own.
 */
function groundChain(): { ground: string[]; between: string[][] } {
  const page = read(PAGE);
  const at = page.indexOf('<ProjectsHeader');
  const [ground, ...rest] = classNamesIn(page.slice(page.lastIndexOf('return (', at), at));
  const header = read(HEADER);
  const inHeader = classNamesIn(header.slice(header.indexOf('<header className='), header.search(/<h1\s+className=/)));
  return { ground: req(ground, 'the page root\'s classes'), between: [...rest, ...inHeader] };
}

/** The page's own text colours: the body rule's `@apply` in src/index.css, which the title inherits today. */
function bodyClasses(): string[] {
  const m = /\bbody\s*\{[^}]*?@apply\s+([^;]+);/.exec(read(INDEX_CSS));
  return classList(req(m?.[1], 'index.css body @apply'));
}

/** What the gradient string may carry (R5): the gradient, its `dark:` ends, and the two fallbacks. Nothing else. */
const ALLOWED = [
  /^bg-gradient-to-r$/,
  /^(?:dark:)?(?:from|to)-\[#[0-9a-f]{6}\]$/i,
  /^bg-clip-text$/,
  /^text-transparent$/,
  /^(?:print|contrast-more):bg-none$/,
  /^(?:print|contrast-more|dark:contrast-more):text-[a-z]+-\d{2,3}$/,
];

/** Where a class's own rule starts in compiled CSS (its selector as Tailwind escapes it, whole), or -1. */
function ruleAt(css: string, cls: string): number {
  const selector = '.' + cls.replace(/[:[\]#@()]/g, m => '\\' + m);
  let i = css.indexOf(selector);
  while (i !== -1 && /[\w-]/.test(css.charAt(i + selector.length))) i = css.indexOf(selector, i + 1);
  return i;
}

// ---- The guard --------------------------------------------------------------------------------------------------

describe('the Products page\'s SPERT® Story Map: a gradient in Story Map\'s indigo, readable in both themes (HDR26)', () => {
  describe('instrument self-checks', () => {
    it('the contrast formula: #767676 on white is 4.54 : 1', () => {
      expect(trunc(contrast('#767676', '#ffffff'))).toBe('4.54');
    });

    it('the OKLCH steps rebuild the suite\'s old blue gradient from #0070f3, with its hue turns', () => {
      // As Appendix A writes it. Algebraically this is a round trip of #0099ff and #0051cc through OKLCH and the
      // gamut fit, so it checks those conversions, not the steps themselves.
      const [p, g1, g2] = ['#0070f3', '#0099ff', '#0051cc'].map(toLch) as [Triple, Triple, Triple];
      const stepOf = (g: Triple): Triple => [g[0] - p[0], g[1] / p[1], g[2] - p[2]];
      const withTurn = (fav: string, d: Triple) => {
        const [lk, c, h] = toLch(fav);
        return fromLch([lk + d[0], c * d[1], h + d[2]]);
      };
      expect(withTurn('#0070f3', stepOf(g1))).toBe('#0099ff');
      expect(withTurn('#0070f3', stepOf(g2))).toBe('#0051cc');
    });

    it('parseCssColor reads Tailwind\'s #fff and \'none\'-hue forms, and refuses what it cannot read', () => {
      expect(parseCssColor('#fff')).toBe('#ffffff');
      expect(parseCssColor('oklch(98.5% 0 none)')).toBe('#fafafa');
      expect(() => parseCssColor('rgb(1, 2, 3)')).toThrow(/unreadable/);
    });

    it('the ramp sampler fails a known-bad: the old blue gradient is 2.99 : 1 on white and 2.92 on gray-950', () => {
      // Vacuity control: a sampler that always passed would pass every row below.
      expect(trunc(weakest('#0099ff', '#0051cc', PREMISE.light, 'oklab'))).toBe('2.99');
      expect(trunc(weakest('#0099ff', '#0051cc', PREMISE.dark, 'oklab'))).toBe('2.92');
    });
  });

  it('the title has exactly two gradient spans, SPERT and Story Map, and reads "SPERT® Story Map"', () => {
    // Must-find, and the census: a reader that found nothing would pass every row below.
    const spans = gradientSpans(read(HEADER));
    expect(spans.map(s => s.text)).toEqual(['SPERT', 'Story Map']);
    expect(spans).toHaveLength(GRADIENT_SPANS);
    expect(titleSpans(read(HEADER)).map(s => s.text).join('')).toBe('SPERT®Story Map');
  });

  it('the space before "Story Map" is the <h1>\'s own text, never the start of a gradient span', () => {
    // HDR26 ruling F1: inside a span, jsdom's accessible name loses a leading space.
    expect(h1OwnText(read(HEADER))).toBe(' ');
    for (const span of gradientSpans(read(HEADER))) expect(span.text, span.text).toBe(span.text.trim());
  });

  it('both gradient spans carry the same four end colours', () => {
    const [first, ...rest] = gradientSpans(read(HEADER)).map(s => endsOf(s.classes));
    expect(first).toBeDefined();
    for (const other of rest) expect(other).toEqual(first);
  });

  it('the gradient string carries only the gradient and its fallbacks: no size, weight or other class (R5)', () => {
    for (const span of gradientSpans(read(HEADER))) {
      const stray = span.classes.filter(c => !ALLOWED.some(re => re.test(c)));
      expect(stray, `${span.text}: classes outside the gradient string's list`).toEqual([]);
      expect(span.classes).toEqual(expect.arrayContaining(['bg-gradient-to-r', 'bg-clip-text', 'text-transparent']));
    }
  });

  it('the bar\'s premise: the <h1> is bold and at least text-2xl (24 px), so the title is large at every width', () => {
    const h1 = classList(req(/^<h1\s+className="([^"]*)"/.exec(titleH1(read(HEADER)))?.[1], '<h1> classes'));
    expect(h1).toEqual(expect.arrayContaining(['font-bold', 'text-2xl']));
    expect(h1.filter(c => /^text-(?:xs|sm|base|lg|xl)$/.test(c))).toEqual([]);
  });

  it('the page\'s background resolves, through the installed Tailwind, to the pinned premise in each theme', () => {
    const { ground } = groundChain();
    expect(themeColor(colorToken(ground, 'bg-'))).toBe(PREMISE.light);
    expect(themeColor(colorToken(ground, 'dark:bg-'))).toBe(PREMISE.dark);
  });

  it('nothing between the page\'s root and the title paints a ground of its own or fades it', () => {
    // The root is the title's ground only while nothing in between paints one, and a fade would sink a ramp that
    // clears the bar by hundredths.
    const { between } = groundChain();
    expect(between.length).toBeGreaterThan(0);
    expect(between.flat().filter(c => /(?:^|:)(?:bg-|opacity-)/.test(c))).toEqual([]);
  });

  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}: every point of the ramp meets ${BAR} : 1 on the page, in Oklab and in sRGB`, () => {
      for (const span of gradientSpans(read(HEADER))) {
        const [from, to] = endsOf(span.classes)[theme];
        for (const space of ['oklab', 'srgb'] as const) {
          const w = weakest(from, to, PREMISE[theme], space);
          expect(w, `${span.text} ${theme} ${from} → ${to} on ${PREMISE[theme]} (${space}): ${trunc(w)}`)
            .toBeGreaterThanOrEqual(BAR);
        }
      }
    });
  }

  it('falls back to the page\'s own solid text colours in print and under prefers-contrast: more', () => {
    // The fallbacks use the body's near-black and near-white (src/index.css), so they cannot drift from them.
    const body = bodyClasses();
    const nearBlack = colorToken(body, 'text-');
    const nearWhite = colorToken(body, 'dark:text-');
    for (const span of gradientSpans(read(HEADER))) {
      expect(span.classes, span.text).toEqual(
        expect.arrayContaining([
          'print:bg-none',
          `print:text-${nearBlack}`,
          'contrast-more:bg-none',
          `contrast-more:text-${nearBlack}`,
          `dark:contrast-more:text-${nearWhite}`,
        ]),
      );
    }
    expect(contrast(themeColor(nearBlack), PREMISE.light)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(themeColor(nearWhite), PREMISE.dark)).toBeGreaterThanOrEqual(4.5);
  });

  it('compiled, every gradient class produces CSS, and print beats the increased-contrast colours (P-GA3)', async () => {
    // The title prints here (Story Map has no print rules), and a print also matches prefers-contrast: more on a
    // Mac with Increase contrast on. The rules have equal specificity, so the LAST one wins: if a Tailwind upgrade
    // reordered the variants, or a fallback were written with an arbitrary variant (which compiles after print:),
    // a dark-theme print would come out near-white on paper.
    const [span] = gradientSpans(read(HEADER));
    const classes = req(span, 'a gradient span').classes;
    const compiler = await compile(read(INDEX_CSS), { base: SRC, onDependency() {} });
    const css = compiler.build(classes);
    const at = (c: string) => ruleAt(css, c);
    expect(classes.filter(c => at(c) < 0), 'classes with no CSS of their own').toEqual([]);
    const printColor = req(classes.find(c => c.startsWith('print:text-')), 'print:text-…');
    for (const c of classes.filter(x => /(?:^|:)text-/.test(x) && x !== printColor)) {
      expect(at(printColor), `${printColor} after ${c}`).toBeGreaterThan(at(c));
    }
    for (const c of classes.filter(x => /(?:^|:)bg-(?:gradient|none)/.test(x) && x !== 'print:bg-none')) {
      expect(at('print:bg-none'), `print:bg-none after ${c}`).toBeGreaterThan(at(c));
    }
    expect(at('contrast-more:bg-none')).toBeGreaterThan(at('bg-gradient-to-r'));
  }, 60_000);
});
