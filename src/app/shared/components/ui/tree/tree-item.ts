import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Tree, TreeNode } from './tree';

/**
 * Recursive renderer for one {@link TreeNode} and its subtree. All state lives
 * in the parent {@link Tree}; this component only reflects it and draws the
 * indentation rails. `guides` carries, per ancestor level, whether that level's
 * vertical rail continues past this node — the child rails are derived by
 * appending this node's own "has a following sibling" flag.
 *
 * @internal Consumers use `<l-tree>`, not this element directly.
 */
@Component({
  selector: 'l-tree-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TreeItem],
  templateUrl: './tree-item.html',
  styleUrl: './tree-item.scss',
  host: {
    class: 'l-tree-item',
  },
})
export class TreeItem {
  readonly node = input.required<TreeNode>();
  /** Ancestor rail-continuation flags; length equals this node's depth. */
  readonly guides = input<readonly boolean[]>([]);
  readonly isLast = input(false);

  private readonly _tree = inject(Tree);

  protected readonly _hasChildren = computed(() => !!this.node().children?.length);
  protected readonly _expanded = computed(() => this._tree.isExpanded(this.node()));
  protected readonly _selected = computed(() => this._tree.isSelected(this.node()));
  protected readonly _checkState = computed(() => this._tree.checkState(this.node()));

  protected readonly _showLine = computed(() => this._tree.showLine());
  protected readonly _checkable = computed(() => this._tree.checkable());
  protected readonly _showIcon = computed(() => this._tree.showIcon());

  protected readonly _childGuides = computed(() => [...this.guides(), !this.isLast()]);

  // Lazily mount the subtree on first expand, then keep it so collapsing can
  // animate its height back to zero instead of blinking out of the DOM.
  private readonly _mounted = signal(false);
  protected readonly _renderChildren = computed(() => this._mounted());

  constructor() {
    effect(() => {
      if (this._expanded()) this._mounted.set(true);
    });
  }

  protected _onRow(): void {
    this._tree.onRowClick(this.node());
  }

  protected _onToggle(event: Event): void {
    event.stopPropagation();
    this._tree.toggleExpand(this.node());
  }

  protected _onCheck(): void {
    this._tree.toggleCheck(this.node());
  }
}
