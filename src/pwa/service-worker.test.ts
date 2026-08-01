import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('PWA service worker', () => {
    it('only installs/activates: no push, offline fetch or caches', async () => {
        const source = await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8');
        expect(source).toContain('addEventListener("install"');
        expect(source).toContain('addEventListener("activate"');
        expect(source).not.toContain('addEventListener("push"');
        expect(source).not.toContain('addEventListener("notificationclick"');
        expect(source).not.toContain('addEventListener("fetch"');
        expect(source).not.toContain('caches.');
    });
});
