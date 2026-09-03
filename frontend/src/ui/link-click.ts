import type { MouseEvent } from 'react';

/** True for a plain left click with no modifier keys held — the case where the
 * app should intercept navigation and route it through the SPA history API
 * instead of letting the browser follow the href. Middle-click, ctrl/cmd-click,
 * shift-click and right-click all fall through to native browser behavior
 * (new tab, new window, context menu), since the element still carries a real
 * href. */
export function isPlainLeftClick(event: MouseEvent): boolean {
    return (
        event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    );
}
