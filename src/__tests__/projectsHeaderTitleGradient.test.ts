// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * SPERT® Story Map, the brand title on every screen, is drawn as a gradient in Story Map's favicon indigo (#4f46e5,
 * HDR26, v0.56.4), and every point of it stays readable on the page behind it, in both themes.
 *
 * Re-pinned at v0.57.0 (FRAME26), on purpose: the title moved onto the SPERT® Suite app frame. It is the frame's
 * `.sf-title` in `AppHeader.tsx`, its words are `.sf-grad` spans, and the two ramps are `--app-grad-light` and
 * `--app-grad-dark` on `:root` in `src/index.css`. The page behind it is the frame's `--sf-page`, read from the
 * vendored `src/styles/spert-frame.css`: #ffffff, and #101828 in the dark theme (it was #030712, gray-950). On that
 * ground v0.56.5's dark ramp (#828dff → #4c45d9) fell to 2.67, so the dark ramp was re-derived by HDR26's own method,
 * D1 (William accepted it, 2026-11-26): #8d99ff → #534fe3, 3.03 at its weakest. The light ramp is unchanged.
 *
 * ⚠️ jsdom has no paint, so nothing here is measured from a render: the ends are read from the source, the grounds
 * and the title's size from the vendored stylesheet, and the contrast is computed from the WCAG 2.x definition.
 * frame-check measures the rendered title in Chrome (41 points, sRGB). The colour maths is the HDR26 plan's Appendix A,
 * typed; it is copied from SPERT Scheduler's guard, not shared.
 *
 * The bar is 3 : 1 at every point of each ramp: the frame's title is 24 px bold at every width (`.sf-title`), which is
 * large text (18.66 px bold is the threshold), and 3 : 1 is the owner's bar for a title that stays large. Both ramps
 * clear it with little room, the dark one by hundredths (3.03), on purpose: the pinned grounds below are what catch a
 * change that would sink them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from '@tailwindcss/node';
import { req } from './testHelpers';

const SRC = resolve(__dirname, '..');
const HEADER = resolve(SRC, 'components/layout/AppHeader.tsx');
const INDEX_CSS = resolve(SRC, 'index.css');
const FRAME_CSS = resolve(SRC, 'styles/spert-frame.css');

const BAR = 3;
/** The frame's page ground in each theme (`--sf-page`), and what it was before the frame (gray-950). */
const PREMISE = { light: '#ffffff', dark: '#101828' } as const;
const OLD_DARK_GROUND = '#030712';
/** The ramps (HDR26 D1): light unchanged since v0.56.4; dark re-derived for #101828 at v0.57.0. */
const RAMPS = { light: ['#696ef5', '#3a27bd'], dark: ['#8d99ff', '#534fe3'] } as const;
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
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** A custom property's declared value in a block of CSS, e.g. `--app-grad-dark` → `linear-gradient(…)`. Exactly one. */
function declared(css: string, prop: string): string {
  const hits = Array.from(strip(css).matchAll(new RegExp(`${prop}\\s*:\\s*([^;]+);`, 'g')), m => req(m[1], prop).trim());
  if (hits.length !== 1) throw new Error(`${prop}: declared ${hits.length} times, expected exactly 1`);
  return req(hits[0], prop);
}

/** A ramp's two ends, in order, from its declaration. It must interpolate in Oklab, as `bg-gradient-to-r` did. */
function rampEnds(value: string): [string, string] {
  const m = /^linear-gradient\(\s*to right in oklab\s*,\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)$/i.exec(value);
  if (!m) throw new Error('not a two-stop "to right in oklab" gradient: ' + value);
  return [req(m[1], 'from').toLowerCase(), req(m[2], 'to').toLowerCase()];
}

const ramps = () => {
  const css = read(INDEX_CSS);
  return { light: rampEnds(declared(css, '--app-grad-light')), dark: rampEnds(declared(css, '--app-grad-dark')) };
};

/** The body of one rule in the vendored stylesheet, by its exact selector at the start of a line. */
function rule(css: string, selector: string): string {
  const text = strip(css);
  const at = text.search(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'm'));
  if (at < 0) throw new Error(`spert-frame.css: no rule ${selector}`);
  const open = text.indexOf('{', at);
  return text.slice(open + 1, text.indexOf('}', open));
}

/** The frame's page ground in each theme, as the vendored stylesheet declares it. */
const frameGround = () => {
  const css = read(FRAME_CSS);
  const value = (body: string) => req(/--sf-page:\s*(#[0-9a-f]{6})/i.exec(body)?.[1], '--sf-page').toLowerCase();
  return { light: value(rule(css, ':root')), dark: value(rule(css, ':root.dark, :root[data-theme="dark"]')) };
};

/** The title element in AppHeader: `<span className="sf-title" …>` up to its closing tag (exactly one). */
function titleSpanSource(text: string): string {
  const opens = Array.from(text.matchAll(/<span className="sf-title"/g), m => m.index);
  const start = req(opens[0], 'the title');
  if (opens.length !== 1) throw new Error('AppHeader: not exactly one .sf-title');
  let depth = 0;
  for (const m of text.slice(start).matchAll(/<span\b|<\/span>/g)) {
    depth += m[0] === '</span>' ? -1 : 1;
    if (depth === 0) return text.slice(start, start + req(m.index, 'end') + m[0].length);
  }
  throw new Error('AppHeader: the title never closes');
}

/** The title's children, in order: each span's class and text, and the title's own text between them. */
function titleParts(text: string): { spans: { cls: string; text: string }[]; own: string } {
  const inner = titleSpanSource(text).replace(/^<span className="sf-title"[^>]*>/, '').replace(/<\/span>$/, '');
  const spans = Array.from(inner.matchAll(/<span className="([^"]*)">([^<]*)<\/span>/g), m => ({ cls: req(m[1], 'class'), text: req(m[2], 'text') }));
  if (spans.length !== (inner.match(/<span\b/g) ?? []).length) throw new Error('AppHeader: a title span the guard cannot read');
  const own = inner.replace(/<span className="[^"]*">[^<]*<\/span>/g, '').replace(/\s*\n\s*/g, '').replace(/\{'([^']*)'\}/g, '$1');
  return { spans, own };
}

const gradientSpans = () => titleParts(read(HEADER)).spans.filter(s => s.cls === 'sf-grad');

// ---- The guard --------------------------------------------------------------------------------------------------

describe('SPERT® Story Map, the frame\'s brand title: a gradient in Story Map\'s indigo, readable in both themes (HDR26, FRAME26)', () => {
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

    it('the ramp sampler fails known-bads: the old blue on white, and v0.56.5\'s own dark ramp on the frame\'s ground', () => {
      // Vacuity controls: a sampler that always passed would pass every row below. The second is why this guard was
      // re-pinned: #828dff → #4c45d9 cleared 3 on gray-950 and does not on #101828.
      expect(trunc(weakest('#0099ff', '#0051cc', PREMISE.light, 'oklab'))).toBe('2.99');
      expect(trunc(weakest('#828dff', '#4c45d9', OLD_DARK_GROUND, 'oklab'))).toBe('3.03');
      expect(trunc(weakest('#828dff', '#4c45d9', PREMISE.dark, 'oklab'))).toBe('2.67');
    });
  });

  it('the title has exactly two gradient spans, SPERT and Story Map, and reads "SPERT® Story Map"', () => {
    // Must-find, and the census: a reader that found nothing would pass every row below.
    const { spans } = titleParts(read(HEADER));
    expect(gradientSpans().map(s => s.text)).toEqual(['SPERT', 'Story Map']);
    expect(gradientSpans()).toHaveLength(GRADIENT_SPANS);
    expect(spans.map(s => [s.cls, s.text])).toEqual([['sf-grad', 'SPERT'], ['sf-mark', '®'], ['sf-grad', 'Story Map']]);
  });

  it('the space before "Story Map" is the title\'s own text, never the start of a gradient span', () => {
    // HDR26 ruling F1: inside a span, jsdom's accessible name loses a leading space.
    expect(titleParts(read(HEADER)).own).toBe(' ');
    for (const span of gradientSpans()) expect(span.text, span.text).toBe(span.text.trim());
  });

  it('the title is not a heading, and no element of the header paints a ground of its own or fades the title', () => {
    // The ground behind the title is the frame's `--sf-page` only while nothing between `.sf-app` and the title paints
    // one; a fade would sink a ramp that clears the bar by hundredths.
    const header = read(HEADER);
    expect(header).not.toMatch(/<h[1-6]\b/);
    const upToTitle = header.slice(header.indexOf('<header'), header.indexOf('<span className="sf-title"'));
    const classes = Array.from(upToTitle.matchAll(/className="([^"]*)"/g), m => req(m[1], 'classes')).join(' ').split(/\s+/);
    expect(classes.length).toBeGreaterThan(0);
    expect(classes.filter(c => /(?:^|:)(?:bg-|opacity-)/.test(c))).toEqual([]);
    const css = read(FRAME_CSS);
    for (const sel of ['.sf-col', '.sf-bar-row', '.sf-brand', '.sf-title']) expect(rule(css, sel), sel).not.toMatch(/background|opacity|filter/);
    expect(rule(css, '.sf-bar')).toMatch(/background:\s*var\(--sf-page\)/);
  });

  it('the ramps in src/index.css are the two this guard pins, each interpolated in Oklab', () => {
    expect(ramps()).toEqual({ light: [...RAMPS.light], dark: [...RAMPS.dark] });
  });

  it('the grounds\' premise: the vendored stylesheet\'s --sf-page is #ffffff and #101828', () => {
    expect(frameGround()).toEqual(PREMISE);
  });

  it('the bar\'s premise: the frame\'s title is bold and 24 px, so it is large at every width', () => {
    const title = rule(read(FRAME_CSS), '.sf-title');
    expect(title).toMatch(/font:\s*700\s+24px\/32px/);
  });

  for (const theme of ['light', 'dark'] as const) {
    it(`${theme}: every point of the ramp meets ${BAR} : 1 on the frame's ground, in Oklab and in sRGB`, () => {
      const [from, to] = ramps()[theme];
      const ground = frameGround()[theme];
      for (const space of ['oklab', 'srgb'] as const) {
        const w = weakest(from, to, ground, space);
        expect(w, `${theme} ${from} → ${to} on ${ground} (${space}): ${trunc(w)}`).toBeGreaterThanOrEqual(BAR);
      }
    });
  }

  it('the weakest points are the ones the re-derivation reported: 4.07 light, 3.03 dark, in both spaces', () => {
    for (const space of ['oklab', 'srgb'] as const) {
      expect(trunc(weakest(...ramps().light, PREMISE.light, space)), space).toBe('4.07');
      expect(trunc(weakest(...ramps().dark, PREMISE.dark, space)), space).toBe('3.03');
    }
  });

  it('falls back to the frame\'s solid heading colour under prefers-contrast: more, and to black in print', () => {
    // The frame's rules, unlayered and `!important`, in the vendored stylesheet. Under more contrast every title is
    // one solid colour, the frame's heading colour (#333333 / #e2e8f0); a print is black.
    const css = strip(read(FRAME_CSS));
    const more = req(/@media \(prefers-contrast: more\) \{([\s\S]*?)\n\}/.exec(css)?.[1], 'the contrast-more block');
    const print = req(/@media print \{([\s\S]*?)\n\}/.exec(css)?.[1], 'the print block');
    expect(more).toMatch(/\.sf-grad \{[^}]*background-image: none !important;[^}]*color: var\(--sf-heading\) !important;/);
    expect(print).toMatch(/\.sf-grad \{[^}]*background-image: none !important;[^}]*color: #000 !important;/);
    const heading = (block: string) => req(/--sf-heading:\s*(#[0-9a-f]{6})/i.exec(block)?.[1], '--sf-heading').toLowerCase();
    expect(contrast(heading(rule(css, ':root')), PREMISE.light)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(heading(rule(css, ':root.dark, :root[data-theme="dark"]')), PREMISE.dark)).toBeGreaterThanOrEqual(4.5);
  });

  it('compiled, the ramps survive and print comes after the increased-contrast fallback (P-GA3)', async () => {
    // A print also matches prefers-contrast: more on a Mac with Increase contrast on (William's, D11). The two rules
    // have equal specificity and both are `!important`, so the LAST one wins: print must stay after it.
    const compiler = await compile(read(INDEX_CSS), { base: SRC, onDependency() {} });
    const css = compiler.build([]);
    expect(css).toContain(`--app-grad-light: linear-gradient(to right in oklab, ${RAMPS.light.join(', ')})`);
    expect(css).toContain(`--app-grad-dark: linear-gradient(to right in oklab, ${RAMPS.dark.join(', ')})`);
    const moreAt = css.indexOf('@media (prefers-contrast: more)');
    const printAt = css.indexOf('@media print');
    expect(moreAt).toBeGreaterThan(-1);
    expect(printAt).toBeGreaterThan(moreAt);
    expect(css.slice(printAt)).toMatch(/\.sf-grad\s*\{[^}]*color: #000 !important/);
  }, 60_000);
});
