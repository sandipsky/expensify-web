// Appendix A: the categories both apps seed, under fixed IDs so seeding again, on
// web or Android, never duplicates them (ONB-02, ONB-03). Appendix A gives no
// colors, so the colors here are part of the same contract. This list belongs in
// spec/default-categories.json, for the Kotlin app to seed from too, once the
// shared spec folder exists.
import { Category, CategoryType, SYSTEM_CATEGORY_IDS } from '../models/category';
import { PALETTE } from './category';

/** A category as seeding writes it, under its fixed ID. */
export type SeedCategory = Omit<Category, 'createdAt' | 'updatedAt' | 'pending'>;

type Entry = Pick<Category, 'id' | 'name' | 'icon' | 'color'>;

const EXPENSE: readonly Entry[] = [
  { id: 'exp_food', name: 'Food and dining', icon: 'restaurant', color: PALETTE.orange },
  { id: 'exp_groceries', name: 'Groceries', icon: 'shopping_cart', color: PALETTE.green },
  { id: 'exp_transport', name: 'Transport', icon: 'directions_bus', color: PALETTE.blue },
  { id: 'exp_housing', name: 'Housing and rent', icon: 'home', color: PALETTE.brown },
  { id: 'exp_utilities', name: 'Utilities', icon: 'bolt', color: PALETTE.amber },
  { id: 'exp_phone_internet', name: 'Phone and internet', icon: 'wifi', color: PALETTE.sky },
  { id: 'exp_shopping', name: 'Shopping', icon: 'shopping_bag', color: PALETTE.pink },
  { id: 'exp_health', name: 'Health', icon: 'medical_services', color: PALETTE.red },
  { id: 'exp_education', name: 'Education', icon: 'school', color: PALETTE.indigo },
  { id: 'exp_entertainment', name: 'Entertainment', icon: 'movie', color: PALETTE.purple },
  { id: 'exp_subscriptions', name: 'Subscriptions', icon: 'autorenew', color: PALETTE.teal },
  { id: 'exp_travel', name: 'Travel', icon: 'flight', color: PALETTE.sky },
  { id: 'exp_personal_care', name: 'Personal care', icon: 'spa', color: PALETTE.pink },
  { id: 'exp_gifts', name: 'Gifts and donations', icon: 'redeem', color: PALETTE.red },
  { id: 'exp_family', name: 'Family and kids', icon: 'family_restroom', color: PALETTE.amber },
  { id: 'exp_insurance', name: 'Insurance', icon: 'shield', color: PALETTE.teal },
  { id: 'exp_fees', name: 'Fees and charges', icon: 'receipt_long', color: PALETTE.slate },
];

const INCOME: readonly Entry[] = [
  { id: 'inc_salary', name: 'Salary', icon: 'payments', color: PALETTE.green },
  { id: 'inc_business', name: 'Business and freelance', icon: 'work', color: PALETTE.blue },
  { id: 'inc_bonus', name: 'Bonus', icon: 'star', color: PALETTE.amber },
  { id: 'inc_interest', name: 'Interest and dividends', icon: 'savings', color: PALETTE.teal },
  { id: 'inc_rental', name: 'Rental income', icon: 'apartment', color: PALETTE.brown },
  { id: 'inc_gifts', name: 'Gifts received', icon: 'card_giftcard', color: PALETTE.pink },
  { id: 'inc_refunds', name: 'Refunds', icon: 'undo', color: PALETTE.sky },
  { id: 'inc_other', name: 'Other income', icon: 'add_circle', color: PALETTE.indigo },
];

/** Uncategorized and Balance adjustment for a type (CAT-05), last in its list. */
function systemEntries(type: CategoryType): Entry[] {
  const ids = SYSTEM_CATEGORY_IDS[type];
  return [
    { id: ids.uncategorized, name: 'Uncategorized', icon: 'help', color: PALETTE.slate },
    { id: ids.adjustment, name: 'Balance adjustment', icon: 'tune', color: PALETTE.slate },
  ];
}

function seeds(type: CategoryType, entries: readonly Entry[]): SeedCategory[] {
  const system = systemEntries(type);
  return [...entries, ...system].map((entry, sortOrder) => ({
    ...entry,
    type,
    parentId: null,
    isSystem: system.includes(entry),
    archived: false,
    sortOrder,
  }));
}

/** Every Appendix A category, expense first, each with its position in its type's list. */
export const DEFAULT_CATEGORIES: readonly SeedCategory[] = [
  ...seeds('expense', EXPENSE),
  ...seeds('income', INCOME),
];
