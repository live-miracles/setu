import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';

const source = ts.transpileModule(
    await readFile(new URL('../src/Notifications.ts', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.None } },
).outputText;
let propertyValue;
let gmailCalls = 0;
let mailCalls = 0;

const context = {
    PropertiesService: {
        getScriptProperties: () => ({
            getProperty: (key) => (key === 'NOTIFICATION_EMAIL' ? propertyValue : null),
        }),
    },
    CacheService: {
        getScriptCache: () => ({
            get: () => null,
            put: () => undefined,
        }),
    },
    GmailApp: { sendEmail: () => gmailCalls++ },
    MailApp: { sendEmail: () => mailCalls++ },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://example.test' }) },
    Tables: { FailedEmails: { insert: () => undefined } },
    nowIso: () => '2026-08-11T00:00:00.000Z',
    escapeHtml: (value) => value,
};
vm.createContext(context);
vm.runInContext(source, context);

propertyValue = '  alerts@example.com  ';
assert.equal(context.notificationFromEmail(), 'alerts@example.com');

propertyValue = null;
assert.equal(context.notificationFromEmail(), '');

propertyValue = '   ';
assert.equal(context.notificationFromEmail(), '');

context.sendNotificationEmail('', [], 'event', 'Title', 'Message', '/');
assert.equal(gmailCalls, 0);
assert.equal(mailCalls, 0);

console.log('notifications test passed');
