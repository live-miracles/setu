import { dropIndex, moveItem, reorderSubset } from './sortable';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

export function runSortableAssertions(): void {
    const rects = [
        { top: 0, height: 10 },
        { top: 12, height: 10 },
        { top: 24, height: 10 },
    ];
    assert(dropIndex(rects, 0, 0) === 0, 'an item that has not moved keeps its slot');
    assert(dropIndex(rects, 0, 8) === 0, 'an item that has not passed the next middle stays');
    assert(dropIndex(rects, 0, 13) === 1, 'passing the next middle moves one slot down');
    assert(dropIndex(rects, 0, 100) === 2, 'dragging far down lands in the last slot');
    assert(dropIndex(rects, 2, -100) === 0, 'dragging far up lands in the first slot');
    assert(dropIndex(rects, 1, -13) === 0, 'passing the previous middle moves one slot up');

    assert(moveItem(['a', 'b', 'c'], 0, 2).join() === 'b,c,a', 'an item can move down');
    assert(moveItem(['a', 'b', 'c'], 2, 0).join() === 'c,a,b', 'an item can move up');
    assert(moveItem(['a', 'b'], 1, 1).join() === 'a,b', 'moving to the same slot changes nothing');

    assert(
        reorderSubset(['a', 'x', 'b', 'y', 'c'], ['a', 'b', 'c'], ['c', 'a', 'b']).join() ===
            'c,x,a,y,b',
        'reordering a subset should leave the other items in their slots',
    );
}
