import { compareNewestFirst, localDate, localTime } from './transactions';

const at = (ms: number) => ({ toMillis: () => ms });

describe('transactions', () => {
  describe('compareNewestFirst', () => {
    it('orders by date, then time, then creation, newest first', () => {
      const rows = [
        { id: 'a', date: '2026-09-25', time: '09:00', createdAt: at(1) },
        { id: 'b', date: '2026-09-26', time: null, createdAt: at(2) },
        { id: 'c', date: '2026-09-26', time: '08:00', createdAt: at(3) },
        { id: 'd', date: '2026-09-26', time: '08:00', createdAt: at(4) },
        { id: 'e', date: '2026-09-26', time: '14:30', createdAt: at(5) },
      ];
      expect([...rows].sort(compareNewestFirst).map((r) => r.id)).toEqual([
        'e',
        'd',
        'c',
        'b',
        'a',
      ]);
    });

    it('puts entries the server has not timestamped yet first', () => {
      const confirmed = { date: '2026-09-26', time: '10:00', createdAt: at(10) };
      const pending = { date: '2026-09-26', time: '10:00', createdAt: null };
      expect(compareNewestFirst(pending, confirmed)).toBeLessThan(0);
      expect(compareNewestFirst(pending, pending)).toBe(0);
    });
  });

  it('formats the local calendar date and time (BR-06)', () => {
    const now = new Date(2026, 8, 5, 7, 4);
    expect(localDate(now)).toBe('2026-09-05');
    expect(localTime(now)).toBe('07:04');
  });
});
