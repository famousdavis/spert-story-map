// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Where a route sits in the SPERT® Suite app frame (FRAME26, v0.57.0): which navigation item is
// the current page, whether the navigation row shows a product's tabs and sticks, and how `main`
// lays out the body. Read from the pathname alone, so the frame needs no product data and draws
// at once, before a product has loaded.
//
// React Router matches routes without regard to case, so this does too: "/About" is About.

/** A product's tabs, in the navigation row after "Products" (William, 2026-11-26). */
export const PRODUCT_TABS = [
  { path: 'structure', label: 'Structure' },
  { path: 'releases', label: 'Releases' },
  { path: 'storymap', label: 'Map' },
  { path: 'sizing', label: 'Sizing' },
  { path: 'progress', label: 'Progress' },
  { path: 'insights', label: 'Insights' },
  { path: 'settings', label: 'Product Settings' },
] as const;

export type ProductTab = (typeof PRODUCT_TABS)[number]['path'];

export interface FramePlace {
  /** The navigation item that is the current page: 'products', 'about', a product tab, or none. */
  active: 'products' | 'about' | ProductTab | null;
  /** The product whose tabs the navigation row shows (the route's own segment), or null. */
  productId: string | null;
  /** A canvas view (Map, Sizing): the body runs full bleed (X2) and there is no footer (X5). */
  canvas: boolean;
  /** About and the changelog: the body is capped at 896 px (X4). */
  capped: boolean;
  /** Inside a product: the navigation row sticks (X3). */
  sticky: boolean;
}

const TAB_PATHS: readonly string[] = PRODUCT_TABS.map(t => t.path);

/**
 * A product route is `/product/:id` (which redirects to Structure) or `/product/:id/<tab>` for a
 * known tab. Anything else under `/product/` is the 404, with no product tabs.
 */
function productRoute(pathname: string): { productId: string; tab: ProductTab } | null {
  const m = /^\/product\/([^/]+)(?:\/([^/]*))?\/?$/i.exec(pathname);
  if (!m || !m[1]) return null;
  const tab = (m[2] ?? '').toLowerCase() || 'structure';
  if (!TAB_PATHS.includes(tab)) return null;
  return { productId: m[1], tab: tab as ProductTab };
}

export function framePlace(pathname: string): FramePlace {
  const product = productRoute(pathname);
  if (product) {
    return {
      active: product.tab,
      productId: product.productId,
      canvas: product.tab === 'storymap' || product.tab === 'sizing',
      capped: false,
      sticky: true,
    };
  }
  const path = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return {
    active: path === '/' ? 'products' : path === '/about' ? 'about' : null,
    productId: null,
    canvas: false,
    capped: path === '/about' || path === '/changelog',
    sticky: false,
  };
}

/** `main`'s classes for a route: the shared column, capped on About and the changelog (X4), full bleed on a canvas (X2). */
export function mainClass(pathname: string): string {
  const place = framePlace(pathname);
  if (place.canvas) return 'sf-col sf-main sf-main--bleed';
  if (place.capped) return 'sf-col sf-main sf-main--capped';
  return 'sf-col sf-main';
}

/**
 * The Map's and Sizing's canvas: full bleed (X2) from just under the product's heading row to the window's bottom, with
 * no footer (X5). Its top is the frame (56 + 44) + `main`'s 24 px + the heading row's 36 + the 16 px below it = 176 px.
 * The canvas root also carries `-mb-12`, which takes back `main`'s 48 px bottom padding, so the page itself does not
 * scroll. A notice above it pushes it down, and the page then scrolls by that much, as before v0.57.0.
 */
export const CANVAS_TOP = 176;
export const CANVAS_HEIGHT = `calc(100vh - ${CANVAS_TOP}px)`;
