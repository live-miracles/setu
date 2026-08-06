import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const fast = 'mockFast=1';

test('admin Home exposes a role-aware action queue and filtered links', async ({ page }) => {
    await page.goto(`/?${fast}`);
    await expect(page.getByRole('heading', { name: /actions need attention/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Equipment review/i })).toBeVisible();
    await page.getByRole('button', { name: /Equipment review/i }).click();
    await expect(page).toHaveURL(/section=inventory/);
    await expect(page).toHaveURL(/status=submitted/);
});

for (const role of [
    { email: 'admin@example.com', roster: true, tickets: true },
    { email: 'ana@example.com', roster: true, tickets: true },
    { email: 'vic@example.com', roster: false, tickets: true },
    { email: 'sam@example.com', roster: false, tickets: false },
]) {
    test(`${role.email} sees the correct navigation`, async ({ page }, testInfo) => {
        await page.goto(`/?${fast}&mockUser=${encodeURIComponent(role.email)}`);
        const mobile = testInfo.project.name.startsWith('mobile');
        if (mobile) await page.getByRole('button', { name: 'Open navigation' }).click();
        const nav = mobile
            ? page.getByRole('complementary', { name: 'Primary navigation' })
            : page.getByRole('navigation', { name: 'Primary navigation' });
        const roster = nav.getByRole('button', { name: 'Roster' });
        const tickets = nav.getByRole('button', { name: 'Tickets' });
        if (role.roster) await expect(roster).toBeVisible();
        else await expect(roster).toBeHidden();
        if (role.tickets) await expect(tickets).toBeVisible();
        else await expect(tickets).toBeHidden();
    });
}

test('inventory return uses one structured dialog and prevents duplicate interaction', async ({
    page,
}) => {
    await page.goto('/?section=inventory&request=req-3');
    const returnButton = page.getByRole('button', { name: 'Return', exact: true });
    await returnButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /Return REQ-3/i })).toBeVisible();
    await dialog.getByLabel(/Camera/).selectOption('good');
    await dialog.getByRole('button', { name: 'Return', exact: true }).click();
    await expect(returnButton).toBeDisabled();
    await expect(page.getByText('Returned', { exact: true }).first()).toBeVisible();
});

test('inventory requests can be saved, edited, and submitted as drafts', async ({ page }) => {
    await page.goto(`/?section=inventory&mode=create&${fast}`);
    const start = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel('Name').fill('Draft field kit');
    await page.getByLabel('From').fill(start);
    await page.locator('#request-end').fill(end);
    await page.getByLabel('Equipment type').selectOption('inv-1');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Edit draft' }).click();
    await page.getByLabel('Name').fill('Submitted field kit');
    await page.getByRole('button', { name: 'Save and submit' }).click();
    await expect(page.getByText('Needs review', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/submitted this request/i)).toBeVisible();
});

test('rejection requires a structured reason and records the new state', async ({ page }) => {
    await page.goto(`/?section=inventory&request=req-1&${fast}`);
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Reason').fill('Equipment is reserved for a priority broadcast.');
    await dialog.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect(page.getByText('Rejected', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/priority broadcast/i)).toBeVisible();
});

test('dialog Escape restores focus to the action that opened it', async ({ page }) => {
    await page.goto(`/?section=inventory&request=req-3&${fast}`);
    const button = page.getByRole('button', { name: 'Return', exact: true });
    await button.click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(button).toBeFocused();
});

test('program form reports approved place conflicts before submission', async ({ page }) => {
    await page.goto(`/?section=programs&mode=create&${fast}`);
    const date = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
    await page.getByLabel('Place').selectOption('place-5');
    await page.getByLabel('Session name').fill('Conflicting interview');
    await page.getByLabel('Session type').fill('Recording');
    await page.getByLabel('Start').fill(`${date}T09:30`);
    await page.getByLabel('End').fill(`${date}T10:30`);
    await expect(page.getByText(/approved booking conflict/i)).toBeVisible();
});

test('ticket assignment and activity use structured controls', async ({ page }) => {
    await page.goto(`/?section=tickets&ticket=ticket-1&${fast}`);
    await expect(page.getByRole('definition').filter({ hasText: 'Vic Viewer' })).toBeVisible();
    await page.getByRole('button', { name: 'Assign', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Assignee').selectOption('ana@example.com');
    await dialog.getByRole('button', { name: 'Assign ticket' }).click();
    await expect(page.getByText('Ana Approver', { exact: true }).first()).toBeVisible();
    await page.getByLabel('Add a comment').fill('Verified during UI regression testing.');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Verified during UI regression testing.')).toBeVisible();
});

test('legacy settings URL resolves to Home settings and new roster presets are separate', async ({
    page,
}) => {
    await page.goto(`/?section=home-content&${fast}`);
    await expect(page.getByRole('heading', { name: 'Home settings' })).toBeVisible();
    await page.goto(`/?section=roster-presets&${fast}`);
    await expect(page.getByRole('heading', { name: 'Roster presets' })).toBeVisible();
});

test('dashboard failure exposes a focused retry path', async ({ page }) => {
    await page.goto(`/?${fast}&mockFailure=dashboard`);
    const retry = page.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeFocused();
    await retry.click();
    await expect(page.getByRole('heading', { name: /actions need attention/i })).toBeVisible();
});

test('mobile roster uses an agenda without horizontal overflow', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile'), 'mobile viewport only');
    await page.goto(`/?section=roster&${fast}`);
    await expect(page.getByRole('heading', { name: 'Roster agenda' })).toBeVisible();
    const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
});

for (const route of [
    '/',
    '/?section=inventory',
    '/?section=programs&mode=create',
    '/?section=tickets&ticket=ticket-1',
    '/?section=roster',
    '/?section=home-settings',
]) {
    test(`has no serious accessibility violations: ${route}`, async ({ page }, testInfo) => {
        test.skip(
            testInfo.project.name.startsWith('mobile') &&
                !['/', '/?section=roster'].includes(route),
            'desktop coverage',
        );
        await page.goto(`${route}${route.includes('?') ? '&' : '?'}${fast}`);
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        expect(
            results.violations.filter((item) =>
                ['critical', 'serious'].includes(item.impact || ''),
            ),
        ).toEqual([]);
    });
}
