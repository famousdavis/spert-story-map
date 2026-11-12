// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useState } from 'react';
import type { Dispatch, ReactElement, SetStateAction } from 'react';
import { act, render } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import type { Product } from '../../types';

/** What a test reads back. `writes` counts `updateProduct` calls, so "one action, one call" can be seen. */
export interface HostedProduct {
  product: Product;
  writes: number;
  /**
   * Change the product from outside the page, as a collaborator, Connect AI or an
   * undo elsewhere would: the page sees a new product it did not write. Not counted
   * in `writes`, which stays the page's own `updateProduct` calls.
   */
  replace: (next: Product | ((prev: Product) => Product)) => void;
}

/**
 * A page mounted as `ProductLayout` mounts it: the real outlet, holding the product in
 * state, so a confirm that writes re-renders the page. `updateProduct` applies updaters
 * the way `useProduct` does. Published from an effect, because assigning outside the
 * component during render is what the hooks rules forbid.
 */
export function mountHosted(View: () => ReactElement, initial: Product): HostedProduct {
  const bridge: { set: Dispatch<SetStateAction<Product>> | null } = { set: null };
  const hosted: HostedProduct = {
    product: initial,
    writes: 0,
    replace: next => {
      const set = bridge.set;
      if (!set) throw new Error('replace() before the host mounted');
      act(() => { set(next); });
    },
  };

  function Host() {
    const [product, setProduct] = useState(initial);
    useEffect(() => { hosted.product = product; }, [product]);
    useEffect(() => { bridge.set = setProduct; }, []);
    const updateProduct = (updater: unknown) => {
      hosted.writes++;
      setProduct(updater as (prev: Product) => Product);
    };
    const context = { product, updateProduct, undo: () => {}, redo: () => {} };
    return (
      <MemoryRouter>
        <Routes>
          <Route element={<Outlet context={context} />}>
            <Route path="*" element={<View />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  }

  render(<Host />);
  return hosted;
}
