import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('PWA service worker', () => {
    it('supports push without registering offline fetch or caches', async () => {
        const source = await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8');
        expect(source).toContain('addEventListener("push"');
        expect(source).toContain('addEventListener("notificationclick"');
        expect(source).not.toContain('addEventListener("fetch"');
        expect(source).not.toContain('caches.');
    });
});
