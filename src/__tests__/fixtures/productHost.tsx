// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import type { Product } from '../../types';

/** What a test reads back. `writes` counts `updateProduct` calls, so "one action, one call" can be seen. */
export interface HostedProduct {
  product: Product;
  writes: number;
}

/**
 * A page mounted as `ProductLayout` mounts it: the real outlet, holding the product in
 * state, so a confirm that writes re-renders the page. `updateProduct` applies updaters
 * the way `useProduct` does. Published from an effect, because assigning outside the
 * component during render is what the hooks rules forbid.
 */
export function mountHosted(View: () => ReactElement, initial: Product): HostedProduct {
  const hosted: HostedProduct = { product: initial, writes: 0 };

  function Host() {
    const [product, setProduct] = useState(initial);
    useEffect(() => { hosted.product = product; }, [product]);
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
