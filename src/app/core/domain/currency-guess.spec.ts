import { guessCurrency } from './currency-guess';

describe('guessCurrency (ONB-01: base currency preselected from the browser locale)', () => {
  it('reads the region from the locale tag', () => {
    expect(guessCurrency('en-GB', 'USD')).toBe('GBP');
    expect(guessCurrency('ne-NP', 'USD')).toBe('NPR');
    expect(guessCurrency('de-AT', 'USD')).toBe('EUR');
    expect(guessCurrency('en-IN', 'USD')).toBe('INR');
  });

  it('fills in the likely region when the tag has none', () => {
    expect(guessCurrency('ja', 'USD')).toBe('JPY');
    expect(guessCurrency('ne', 'USD')).toBe('NPR');
    expect(guessCurrency('en', 'NPR')).toBe('USD');
  });

  it('falls back for unknown regions and malformed tags', () => {
    expect(guessCurrency('en-AQ', 'NPR')).toBe('NPR');
    expect(guessCurrency('not a locale!', 'NPR')).toBe('NPR');
    expect(guessCurrency('', 'NPR')).toBe('NPR');
  });
});
