import {
  MAX_AMOUNT,
  currencySymbol,
  formatCompactMoney,
  formatMoney,
  fractionDigits,
  toMajorUnits,
  toMinorUnits,
} from './money';

describe('money', () => {
  describe('fractionDigits (BR-01)', () => {
    it('follows ISO 4217 through Intl', () => {
      expect(fractionDigits('JPY')).toBe(0);
      expect(fractionDigits('USD')).toBe(2);
      expect(fractionDigits('NPR')).toBe(2);
      expect(fractionDigits('KWD')).toBe(3);
    });
  });

  describe('toMinorUnits (BR-01)', () => {
    it('turns a major-unit form value into integer minor units', () => {
      expect(toMinorUnits(12.5, 'USD')).toBe(1250);
      expect(toMinorUnits(1250, 'JPY')).toBe(1250);
      expect(toMinorUnits(1.25, 'KWD')).toBe(1250);
      expect(toMinorUnits(0, 'USD')).toBe(0);
    });

    it('avoids the errors of multiplying floats', () => {
      // 19.99 * 100 is 1998.9999999999998 and 0.1 + 0.2 is 0.30000000000000004.
      expect(toMinorUnits(19.99, 'USD')).toBe(1999);
      expect(toMinorUnits(0.1 + 0.2, 'USD')).toBe(30);
      expect(toMinorUnits(1234567.89, 'USD')).toBe(123456789);
    });

    it('keeps the sign without producing -0', () => {
      expect(toMinorUnits(-12.5, 'USD')).toBe(-1250);
      expect(Object.is(toMinorUnits(-0.001, 'USD'), 0)).toBe(true);
    });

    it('reaches the per-transaction maximum exactly (BR-03)', () => {
      expect(toMinorUnits(999999999.99, 'USD')).toBe(MAX_AMOUNT);
    });
  });

  describe('toMajorUnits', () => {
    it('gives the number l-number-input edits, and converts back unchanged', () => {
      expect(toMajorUnits(1250, 'USD')).toBe(12.5);
      expect(toMajorUnits(1250, 'JPY')).toBe(1250);
      expect(toMajorUnits(-99, 'USD')).toBe(-0.99);
      for (const minor of [1, 1999, 123456789, MAX_AMOUNT, -45000]) {
        expect(toMinorUnits(toMajorUnits(minor, 'USD'), 'USD')).toBe(minor);
      }
    });
  });

  it('reads a short currency symbol for input prefixes', () => {
    expect(currencySymbol('USD', 'en-US')).toBe('$');
    expect(currencySymbol('EUR', 'de-DE')).toBe('€');
    expect(currencySymbol('KWD', 'en-US')).toBe('KWD');
    expect(currencySymbol('NPR', 'en-US')).toBe('Rs');
  });

  describe('formatMoney', () => {
    it('divides only for display', () => {
      expect(formatMoney(1250, 'USD', 'en-US')).toBe('$12.50');
      expect(formatMoney(1250, 'JPY', 'en-US')).toBe('¥1,250');
      expect(formatMoney(1250, 'KWD', 'en-US')).toBe('KWD\u00a01.250');
      expect(formatMoney(-500, 'USD', 'en-US')).toBe('-$5.00');
    });

    it('shows rupees with the short symbol', () => {
      expect(formatMoney(12345650, 'NPR', 'en-US')).toBe('Rs\u00a0123,456.50');
      expect(formatMoney(12345650, 'NPR', 'en-IN')).toBe('Rs\u00a01,23,456.50');
    });

    it('shows the sign income and expense carry with exceptZero (NFR-09)', () => {
      expect(formatMoney(1250, 'USD', 'en-US', 'exceptZero')).toBe('+$12.50');
      expect(formatMoney(-1250, 'USD', 'en-US', 'exceptZero')).toBe('-$12.50');
      expect(formatMoney(0, 'USD', 'en-US', 'exceptZero')).toBe('$0.00');
    });
  });

  describe('formatCompactMoney', () => {
    it('shortens large amounts for chart axes, from minor units', () => {
      expect(formatCompactMoney(1_250_000, 'USD', 'en-US')).toBe('$12.5K');
      expect(formatCompactMoney(250_000_000, 'JPY', 'en-US')).toBe('¥250M');
      expect(formatCompactMoney(0, 'USD', 'en-US')).toBe('$0');
      expect(formatCompactMoney(-50_000, 'USD', 'en-US', 'exceptZero')).toBe('-$500');
      expect(formatCompactMoney(50_000, 'USD', 'en-US', 'exceptZero')).toBe('+$500');
    });
  });
});
