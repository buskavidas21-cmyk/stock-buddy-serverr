/** Display reference for legacy SKU or optional model number. */
export const itemInventoryRef = (item: { sku?: string; modelNumber?: string }): string =>
  item.sku || item.modelNumber || '—';
