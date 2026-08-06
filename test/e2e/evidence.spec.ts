import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const output = resolve('docs/test-evidence/ui-ux-refactor/final');
const fast = 'mockFast=1';

test.beforeAll(async () => mkdir(output, { recursive: true }));

test('capture desktop evidence', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop'), 'desktop evidence');
    await page.goto(`/?${fast}`);
    await expect(page.getByRole('heading', { name: /actions need attention/i })).toBeVisible();
    await page.screenshot({ path: `${output}/01-admin-home-desktop.png`, fullPage: true });

    await page.goto(`/?${fast}&mockUser=sam%40example.com`);
    await expect(page.getByRole('heading', { name: 'Your workspace is up to date' })).toBeVisible();
    await page.screenshot({ path: `${output}/02-user-home-desktop.png`, fullPage: true });

    await page.goto(`/?section=programs&mode=create&${fast}`);
    const date = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel('Place').selectOption('place-5');
    await page.getByLabel('Session name').fill('Conflicting interview');
    await page.getByLabel('Session type').fill('Recording');
    await page.getByLabel('Start').fill(`${date}T09:30`);
    await page.getByLabel('End').fill(`${date}T10:30`);
    await expect(page.getByText(/approved booking conflict/i)).toBeVisible();
    await page.screenshot({ path: `${output}/06-program-conflict-desktop.png`, fullPage: true });

    await page.goto(`/?section=tickets&ticket=ticket-1&${fast}`);
    await expect(page.getByRole('heading', { name: 'Projector flickering' })).toBeVisible();
    await page.screenshot({ path: `${output}/07-ticket-activity-desktop.png`, fullPage: true });

    await page.goto(`/?section=roster&${fast}`);
    await expect(page.getByText('August 2026')).toBeVisible();
    await page.screenshot({ path: `${output}/08-roster-month-desktop.png`, fullPage: true });

    await page.goto(`/?section=home-settings&${fast}`);
    await expect(page.getByRole('heading', { name: 'Home settings' })).toBeVisible();
    await page.screenshot({ path: `${output}/11-settings-desktop.png`, fullPage: true });
});

test('capture mobile evidence', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'mobile evidence');
    await page.goto(`/?${fast}`);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('complementary', { name: 'Primary navigation' })).toBeVisible();
    await page.screenshot({ path: `${output}/03-mobile-navigation.png`, fullPage: true });

    await page.goto(`/?section=inventory&${fast}`);
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
    await page.screenshot({ path: `${output}/04-inventory-board-mobile.png`, fullPage: true });

    await page.goto(`/?section=inventory&request=req-3&${fast}`);
    await page.getByRole('button', { name: 'Return', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({
        path: `${output}/05-inventory-return-dialog-mobile.png`,
        fullPage: true,
    });
    await page.keyboard.press('Escape');
    await page.screenshot({
        path: `${output}/10-dialog-focus-restored-mobile.png`,
        fullPage: true,
    });

    await page.goto(`/?section=roster&${fast}`);
    await expect(page.getByRole('heading', { name: 'Roster agenda' })).toBeVisible();
    await page.screenshot({ path: `${output}/09-roster-agenda-mobile.png`, fullPage: true });

    await page.goto(`/?${fast}&mockFailure=dashboard`);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeFocused();
    await page.screenshot({ path: `${output}/12-error-retry-state-mobile.png`, fullPage: true });
});
