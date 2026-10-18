/**
 * Undo / redo stack. One entry = one player action (a click, a tap or a whole drag), stored as the list of
 * cell changes it made: [{ index, from, to }, ...]. A new action discards whatever could still be redone.
 */
export class History {
  constructor(limit = 1000) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  push(changes) {
    if (!changes.length) return;
    this.undoStack.push(changes);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  /** Returns the changes to revert (apply each `from`), or null if there is nothing to undo. */
  undo() {
    const changes = this.undoStack.pop();
    if (!changes) return null;
    this.redoStack.push(changes);
    return changes;
  }

  /** Returns the changes to re-apply (apply each `to`), or null if there is nothing to redo. */
  redo() {
    const changes = this.redoStack.pop();
    if (!changes) return null;
    this.undoStack.push(changes);
    return changes;
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
