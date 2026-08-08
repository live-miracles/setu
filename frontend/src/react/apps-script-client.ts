import { api } from '../api';

/**
 * The React frontend uses the same typed Apps Script RPC layer as the legacy
 * frontend. Keeping this boundary small means the Google Sheets backend does
 * not need to know whether a screen is rendered by React Admin or by a legacy
 * section during the migration.
 */
export const appsScriptClient = api;
