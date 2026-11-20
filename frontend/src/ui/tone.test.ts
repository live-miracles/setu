import { isValidHexColor } from './date';
import { TONE_PALETTE, toneName, toneProps } from './tone';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

export function runToneAssertions(): void {
    assert(
        TONE_PALETTE.every((tone) => isValidHexColor(tone.value)),
        'every palette colour should be a valid hex colour',
    );
    assert(
        new Set(TONE_PALETTE.map((tone) => tone.value)).size === TONE_PALETTE.length,
        'palette colours should be unique',
    );
    assert(toneName('#EF4444') === 'Red', 'palette lookup should ignore case');
    assert(toneName('#123456') === undefined, 'a colour outside the palette has no name');

    const tinted = toneProps(' #3b82f6 ', 'block', ['accent']);
    assert(
        tinted.className === 'block tone-tint tone-accent',
        'a valid colour should add the tone classes',
    );
    assert(
        (tinted.style as Record<string, string>)['--tone'] === '#3b82f6',
        'the colour should be trimmed into --tone',
    );
    const plain = toneProps('not-a-colour', 'block', ['accent']);
    assert(
        plain.className === 'block' && plain.style === undefined,
        'an invalid colour should leave the element plain',
    );
    assert(toneProps(undefined).className === '', 'a missing colour should leave no classes');
}
