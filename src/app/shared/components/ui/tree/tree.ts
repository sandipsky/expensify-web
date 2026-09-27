import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { TreeItem } from './tree-item';

/** A single node in the tree data. Children make it a branch; none makes it a leaf. */
export interface TreeNode {
  /** Unique key across the whole tree. */
  key: string;
  label: string;
  children?: TreeNode[];
  /** Optional glyph/emoji shown when `showIcon` is on. */
  icon?: string;
  /** Not selectable and (with `checkable`) its checkbox is skipped by cascade. */
  disabled?: boolean;
  /** Disable just this node's checkbox. */
  disableCheckbox?: boolean;
}

export type CheckState = 'checked' | 'indeterminate' | 'unchecked';

/**
 * Tree view with Reddit-style connecting rails, inspired by Ant Design's `Tree`.
 * Data-driven via `nodes`; expand/collapse, selection and (optional) cascading
 * checkboxes are all owned here and read by the recursive {@link TreeItem}
 * renderer. Expanded / checked / selected state is exposed as two-way `model`s so
 * it can be driven from outside, and `expandAll()` / `collapseAll()` are callable
 * via a template ref for external buttons.
 *
 * ```html
 * <l-tree #tree [nodes]="data" [checkable]="true" [(expandedKeys)]="open" />
 * <button (click)="tree.expandAll()">Expand all</button>
 * ```
 */
@Component({
  selector: 'l-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TreeItem],
  templateUrl: './tree.html',
  styleUrl: './tree.scss',
  host: {
    class: 'l-tree',
    role: 'tree',
  },
})
export class Tree {
  readonly nodes = input<readonly TreeNode[]>([]);
  /** Show a checkbox on every node. */
  readonly checkable = input(false);
  /** Draw the connecting rails between nodes. */
  readonly showLine = input(true);
  /** Render each node's `icon`. */
  readonly showIcon = input(false);
  /** Allow selecting (highlighting) nodes on click. */
  readonly selectable = input(true);
  /** Allow more than one node to be selected. */
  readonly multiple = input(false);
  /** Uncouple parent/child checkboxes (no cascade, no indeterminate). */
  readonly checkStrictly = input(false);

  readonly expandedKeys = model<string[]>([]);
  readonly checkedKeys = model<string[]>([]);
  readonly selectedKeys = model<string[]>([]);

  /** Emits the clicked node (fires even when selection is off/disabled). */
  readonly nodeClick = output<TreeNode>();
  readonly selectedChange = output<TreeNode[]>();
  readonly checkedChange = output<TreeNode[]>();
  readonly expandedChange = output<{ node: TreeNode; expanded: boolean }>();

  private readonly _expandedSet = computed(() => new Set(this.expandedKeys()));
  private readonly _checkedSet = computed(() => new Set(this.checkedKeys()));
  private readonly _selectedSet = computed(() => new Set(this.selectedKeys()));

  /** key → node and key → parentKey lookups, rebuilt when `nodes` changes. */
  private readonly _index = computed(() => {
    const map = new Map<string, TreeNode>();
    const parent = new Map<string, string | undefined>();
    const walk = (list: readonly TreeNode[], parentKey: string | undefined): void => {
      for (const node of list) {
        map.set(node.key, node);
        parent.set(node.key, parentKey);
        if (node.children?.length) walk(node.children, node.key);
      }
    };
    walk(this.nodes(), undefined);
    return { map, parent };
  });

  private readonly _branchKeys = computed(() => {
    const keys: string[] = [];
    for (const node of this._index().map.values()) {
      if (node.children?.length) keys.push(node.key);
    }
    return keys;
  });

  isExpanded(node: TreeNode): boolean {
    return this._expandedSet().has(node.key);
  }

  isSelected(node: TreeNode): boolean {
    return this._selectedSet().has(node.key);
  }

  checkState(node: TreeNode): CheckState {
    const checked = this._checkedSet();
    if (checked.has(node.key)) return 'checked';
    if (!this.checkStrictly() && this._hasCheckedDescendant(node, checked)) return 'indeterminate';
    return 'unchecked';
  }

  toggleExpand(node: TreeNode): void {
    const set = new Set(this.expandedKeys());
    set.has(node.key) ? set.delete(node.key) : set.add(node.key);
    this.expandedKeys.set([...set]);
    this.expandedChange.emit({ node, expanded: set.has(node.key) });
  }

  onRowClick(node: TreeNode): void {
    this.nodeClick.emit(node);
    if (!this.selectable() || node.disabled) return;
    const wasSelected = this._selectedSet().has(node.key);
    let next: string[];
    if (this.multiple()) {
      const set = new Set(this.selectedKeys());
      wasSelected ? set.delete(node.key) : set.add(node.key);
      next = [...set];
    } else {
      next = wasSelected ? [] : [node.key];
    }
    this.selectedKeys.set(next);
    this.selectedChange.emit(next.map((k) => this._index().map.get(k)!).filter(Boolean));
  }

  toggleCheck(node: TreeNode): void {
    if (node.disabled || node.disableCheckbox) return;
    const set = new Set(this.checkedKeys());
    if (this.checkStrictly()) {
      set.has(node.key) ? set.delete(node.key) : set.add(node.key);
    } else {
      const target = this.checkState(node) !== 'checked';
      this._setSubtree(node, target, set);
      this._recomputeAncestors(node, set);
    }
    this.checkedKeys.set([...set]);
    this.checkedChange.emit([...set].map((k) => this._index().map.get(k)!).filter(Boolean));
  }

  /** Expand every branch node. Call from an external control. */
  expandAll(): void {
    this.expandedKeys.set([...this._branchKeys()]);
  }

  /** Collapse everything. */
  collapseAll(): void {
    this.expandedKeys.set([]);
  }

  private _hasCheckedDescendant(node: TreeNode, checked: ReadonlySet<string>): boolean {
    return (
      node.children?.some(
        (child) => checked.has(child.key) || this._hasCheckedDescendant(child, checked),
      ) ?? false
    );
  }

  private _setSubtree(node: TreeNode, target: boolean, set: Set<string>): void {
    if (!node.disabled && !node.disableCheckbox) {
      target ? set.add(node.key) : set.delete(node.key);
    }
    node.children?.forEach((child) => this._setSubtree(child, target, set));
  }

  private _recomputeAncestors(node: TreeNode, set: Set<string>): void {
    const { map, parent } = this._index();
    let parentKey = parent.get(node.key);
    while (parentKey) {
      const parentNode = map.get(parentKey)!;
      const kids = (parentNode.children ?? []).filter((c) => !c.disabled && !c.disableCheckbox);
      const allChecked = kids.length > 0 && kids.every((c) => set.has(c.key));
      allChecked ? set.add(parentKey) : set.delete(parentKey);
      parentKey = parent.get(parentKey);
    }
  }
}
