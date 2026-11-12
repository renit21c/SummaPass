type SalesCategory = { id: string; salesStart?: string; salesEnd?: string };
export function simulationSalesState(category: SalesCategory, serverNow: string): 'OPEN' | 'UPCOMING' | 'CLOSED' {
  const now = Date.parse(serverNow);
  if (category.salesStart && now < Date.parse(category.salesStart)) return 'UPCOMING';
  if (category.salesEnd && now >= Date.parse(category.salesEnd)) return 'CLOSED';
  return 'OPEN';
}
export function simulationInitialCategoryId(categories: SalesCategory[], activeId: string | undefined, serverNow: string) {
  return (categories.find(c => c.id === activeId && simulationSalesState(c, serverNow) === 'OPEN')
    ?? categories.find(c => simulationSalesState(c, serverNow) === 'OPEN')
    ?? categories.find(c => c.id === activeId) ?? categories[0])?.id ?? '';
}
