// Local-dev entry point (`npm run dev`), and the only module that reaches
// mock/backend.ts. Importing it installs `window.googleMock`, which api.ts
// falls back to when `google.script.run` is absent — i.e. anywhere outside
// the Apps Script HTML service. The production entry (main.ts) never imports
// this file, so none of the mock data can end up in the deployed bundle.
import './mock/backend';
import './main';
