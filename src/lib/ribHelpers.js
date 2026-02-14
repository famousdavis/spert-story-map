/**
 * Reusable iterators for the product hierarchy (theme → backbone → rib).
 * Replaces 12+ manual triple-nested loops throughout the codebase.
 */

/**
 * Iterate over every rib item in the product hierarchy.
 * @param {object} product - The product containing themes
 * @param {function} callback - (rib, { theme, backbone }) => void
 */
export function forEachRib(product, callback) {
  for (const theme of product.themes) {
    for (const backbone of theme.backboneItems) {
      for (const rib of backbone.ribItems) {
        callback(rib, { theme, backbone });
      }
    }
  }
}

/**
 * Reduce over all rib items across the product hierarchy.
 * @param {object} product - The product containing themes
 * @param {function} reducer - (accumulator, rib, { theme, backbone }) => accumulator
 * @param {*} initial - Initial accumulator value
 * @returns {*} Final accumulated value
 */
export function reduceRibs(product, reducer, initial) {
  let acc = initial;
  forEachRib(product, (rib, ctx) => {
    acc = reducer(acc, rib, ctx);
  });
  return acc;
}
