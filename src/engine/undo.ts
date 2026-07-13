/**
 * Snapshot-based undo/redo over immutable scene states. Every tool verb
 * commits a new state; because all models are immutable with structural
 * sharing, snapshots are cheap (prompts/nf03/02 §2).
 */

export class UndoStack<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(
    private current: T,
    private capacity = 64,
  ) {}

  get(): T {
    return this.current;
  }

  /** Commit a new state; clears the redo branch. */
  push(state: T): void {
    if (state === this.current) return; // no-op commits don't pollute history
    this.past.push(this.current);
    if (this.past.length > this.capacity) this.past.shift();
    this.current = state;
    this.future = [];
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): T {
    const prev = this.past.pop();
    if (prev !== undefined) {
      this.future.push(this.current);
      this.current = prev;
    }
    return this.current;
  }

  redo(): T {
    const next = this.future.pop();
    if (next !== undefined) {
      this.past.push(this.current);
      this.current = next;
    }
    return this.current;
  }
}
