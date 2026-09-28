/**
 * The modals and drawers open right now, oldest first. Both containers listen
 * for Escape on the document, so each asks this whether it's on top before
 * closing: a dialog opened over a sheet (a receipt over its transaction form)
 * closes alone.
 */
const open: object[] = [];

export const overlayStack = {
  push(overlay: object): void {
    open.push(overlay);
  },

  remove(overlay: object): void {
    const index = open.lastIndexOf(overlay);
    if (index >= 0) open.splice(index, 1);
  },

  isTop(overlay: object): boolean {
    return open[open.length - 1] === overlay;
  },
};
