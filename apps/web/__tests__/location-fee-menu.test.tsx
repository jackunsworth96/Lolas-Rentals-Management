// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LocationFeeMenu } from '../src/components/booking/LocationFeeMenu.js';
import type { FeeLocation } from '../src/utils/locationFeeDisplay.js';

const locations: FeeLocation[] = [
  { id: 1, name: "Lola's Rentals Store", deliveryCost: 0, collectionCost: 0, locationType: 'store' },
  { id: 2, name: 'General Luna', deliveryCost: 100, collectionCost: 150, locationType: 'area' },
  { id: 4, name: 'IAO Airport', deliveryCost: 200, collectionCost: 250, locationType: 'area' },
];

function markup(props: Partial<{ value: number | null; pairIsFree: boolean; kind: 'delivery' | 'collection' }>) {
  return renderToStaticMarkup(
    <LocationFeeMenu
      label="Pickup Location"
      feeLabel={props.kind === 'collection' ? 'Collection fee' : 'Delivery fee'}
      locations={locations}
      value={props.value ?? 2}
      kind={props.kind ?? 'delivery'}
      offerLocationIds={new Set([2])}
      pairIsFree={props.pairIsFree ?? false}
      onChange={() => undefined}
    />,
  );
}

describe('LocationFeeMenu', () => {
  it('keeps the normal delivery fee until pickup and return both qualify', () => {
    const html = markup({ pairIsFree: false });
    expect(html).toContain('General Luna');
    expect(html).toContain('Delivery fee:');
    expect(html).toContain('100');
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain('>Free<');
  });

  it('strikes the selected fee once the pair is covered', () => {
    const html = markup({ pairIsFree: true });
    expect(html).toContain('line-through');
    expect(html).toContain('>Free<');
    expect(html).toContain('100');
    expect(html).not.toContain('Delivery fee:');
  });

  it('leaves the shop without a fee line and uses the collection amount on return', () => {
    expect(markup({ value: 1 })).not.toContain('Delivery fee');
    const collection = markup({ kind: 'collection', pairIsFree: false });
    expect(collection).toContain('Collection fee:');
    expect(collection).toContain('150');
  });
});
