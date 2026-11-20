import type { CSSProperties } from 'react';
import { isValidHexColor } from './date';

// The colours a shift type or program type can be given. Each is a mid-tone, so
// it reads as a tint on both the light and the dark theme (see .tone-* in
// input.css: the colour is mixed into the theme's surface rather than used as a
// solid background). Values are stored as hex, so a colour saved before the
// palette existed still renders.
export const TONE_PALETTE: ReadonlyArray<{ name: string; value: string }> = [
    { name: 'Red', value: '#ef4444' },
    { name: 'Rose', value: '#f43f5e' },
    { name: 'Pink', value: '#ec4899' },
    { name: 'Fuchsia', value: '#d946ef' },
    { name: 'Purple', value: '#a855f7' },
    { name: 'Violet', value: '#8b5cf6' },
    { name: 'Indigo', value: '#6366f1' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Sky', value: '#0ea5e9' },
    { name: 'Cyan', value: '#06b6d4' },
    { name: 'Teal', value: '#14b8a6' },
    { name: 'Emerald', value: '#10b981' },
    { name: 'Green', value: '#22c55e' },
    { name: 'Lime', value: '#84cc16' },
    { name: 'Yellow', value: '#eab308' },
    { name: 'Amber', value: '#f59e0b' },
    { name: 'Orange', value: '#f97316' },
    { name: 'Brown', value: '#a16207' },
    { name: 'Crimson', value: '#b91c1c' },
    { name: 'Forest', value: '#15803d' },
    { name: 'Navy', value: '#1d4ed8' },
    { name: 'Plum', value: '#7e22ce' },
    { name: 'Slate', value: '#64748b' },
    { name: 'Stone', value: '#78716c' },
];

export function toneName(value: string): string | undefined {
    const wanted = value.trim().toLowerCase();
    return TONE_PALETTE.find((tone) => tone.value === wanted)?.name;
}

// className and style for an element shown in a palette colour: it sets the
// --tone custom property that the .tone-* classes in input.css read, and adds
// them (`tint` the background, `accent` a coloured left edge, `ring` a thin
// outline). A missing or invalid colour leaves the element's normal look.
export function toneProps(
    color: string | undefined,
    base = '',
    parts: ReadonlyArray<'accent' | 'ring'> = [],
): { className: string; style?: CSSProperties } {
    const value = (color ?? '').trim();
    if (!isValidHexColor(value)) return { className: base };
    return {
        className: [base, 'tone-tint', ...parts.map((part) => `tone-${part}`)]
            .filter(Boolean)
            .join(' '),
        style: { '--tone': value } as CSSProperties,
    };
}
