import { describe, expect, it } from 'vitest';
import { UndoStack } from '../../src/engine/undo';

describe('UndoStack', () => {
  it('push/undo/redo walk the history', () => {
    const s = new UndoStack('a');
    s.push('b');
    s.push('c');
    expect(s.get()).toBe('c');
    expect(s.undo()).toBe('b');
    expect(s.undo()).toBe('a');
    expect(s.canUndo()).toBe(false);
    expect(s.undo()).toBe('a'); // bottoming out is safe
    expect(s.redo()).toBe('b');
    expect(s.redo()).toBe('c');
    expect(s.canRedo()).toBe(false);
  });

  it('a new push clears the redo branch', () => {
    const s = new UndoStack(1);
    s.push(2);
    s.push(3);
    s.undo();
    s.push(99);
    expect(s.canRedo()).toBe(false);
    expect(s.undo()).toBe(2);
    expect(s.redo()).toBe(99);
  });

  it('identical-state pushes are no-ops; capacity bounds history', () => {
    const s = new UndoStack(0, 3);
    s.push(0); // no-op
    expect(s.canUndo()).toBe(false);
    for (let i = 1; i <= 10; i++) s.push(i);
    expect(s.get()).toBe(10);
    let u = s.get();
    let count = 0;
    while (s.canUndo()) {
      u = s.undo();
      count++;
    }
    expect(count).toBe(3); // capacity
    expect(u).toBe(7);
  });
});
