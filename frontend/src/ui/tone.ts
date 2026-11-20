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

function hexToHsl(value: string): { h: number; s: number; l: number } {
    let hex = value.trim().slice(1);
    if (hex.length === 3) hex = [...hex].map((digit) => digit + digit).join('');
    const [r, g, b] = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s, l };
}

const PALETTE_HSL = TONE_PALETTE.map((tone) => ({ tone, ...hexToHsl(tone.value) }));

// The palette colour a stored colour stands for. Colours saved before the
// palette existed were free picks, often pastels chosen for the light theme,
// and mixing a pastel into a dark surface only makes grey; so any other colour
// is mapped to the palette colour of the nearest hue (near-greys to Slate or
// Stone). A palette value maps to itself; '' for an empty or invalid colour.
export function snapToTone(value: string | undefined): string {
    const color = (value ?? '').trim();
    if (!isValidHexColor(color)) return '';
    const exact = TONE_PALETTE.find((tone) => tone.value === color.toLowerCase());
    if (exact) return exact.value;
    const { h, s, l } = hexToHsl(color);
    if (s < 0.15) return l < 0.5 || h < 180 ? '#78716c' : '#64748b';
    let best = PALETTE_HSL[0];
    let bestDistance = Infinity;
    for (const entry of PALETTE_HSL) {
        if (entry.s < 0.15) continue;
        const hueGap = Math.abs(h - entry.h);
        const distance = Math.min(hueGap, 360 - hueGap) + 60 * Math.abs(l - entry.l);
        if (distance < bestDistance) {
            best = entry;
            bestDistance = distance;
        }
    }
    return best.tone.value;
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
    const value = snapToTone(color);
    if (!value) return { className: base };
    return {
        className: [base, 'tone-tint', ...parts.map((part) => `tone-${part}`)]
            .filter(Boolean)
            .join(' '),
        style: { '--tone': value } as CSSProperties,
    };
}
