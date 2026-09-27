import { L_ICON_NAMES } from '../../shared/components/ui/icon/icon';
import { CATEGORY_COLORS, CATEGORY_ICONS, MAX_CATEGORY_NAME } from './category';
import { DEFAULT_CATEGORIES } from './default-categories';

describe('DEFAULT_CATEGORIES (Appendix A)', () => {
  it('seeds the Appendix A IDs, each once (ONB-03)', () => {
    const ids = DEFAULT_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith('exp_'))).toHaveLength(19);
    expect(ids.filter((id) => id.startsWith('inc_'))).toHaveLength(10);
    expect(DEFAULT_CATEGORIES.find((c) => c.id === 'exp_food')).toMatchObject({
      name: 'Food and dining',
      type: 'expense',
      icon: 'restaurant',
      parentId: null,
      isSystem: false,
      archived: false,
      sortOrder: 0,
    });
    expect(DEFAULT_CATEGORIES.find((c) => c.id === 'inc_gifts')!.icon).toBe('card_giftcard');
  });

  it('marks Uncategorized and Balance adjustment as system for each type, last (CAT-05)', () => {
    const system = DEFAULT_CATEGORIES.filter((c) => c.isSystem);
    expect(system.map((c) => [c.id, c.name, c.icon, c.sortOrder])).toEqual([
      ['exp_uncategorized', 'Uncategorized', 'help', 17],
      ['exp_adjustment', 'Balance adjustment', 'tune', 18],
      ['inc_uncategorized', 'Uncategorized', 'help', 8],
      ['inc_adjustment', 'Balance adjustment', 'tune', 9],
    ]);
  });

  it('matches its type to its ID prefix and keeps names within the limit', () => {
    for (const c of DEFAULT_CATEGORIES) {
      expect(c.id.startsWith(c.type === 'expense' ? 'exp_' : 'inc_'), c.id).toBe(true);
      expect(c.name.length).toBeLessThanOrEqual(MAX_CATEGORY_NAME);
    }
  });

  it('uses only palette colors and icons the web ships', () => {
    for (const c of DEFAULT_CATEGORIES) {
      expect(CATEGORY_COLORS, c.id).toContain(c.color);
      expect(L_ICON_NAMES, c.id).toContain(c.icon);
    }
    for (const icon of CATEGORY_ICONS) expect(L_ICON_NAMES).toContain(icon);
  });
});
