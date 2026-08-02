// The app is served inside an iframe, so the browser tab belongs to Google's
// outer page rather than to Index.html — a <link rel="icon"> in our own <head>
// never reaches it. setFaviconUrl is the only hook, and it takes a URL rather
// than a data URI, so the icon has to be hosted somewhere public: the gh-pages
// branch (Settings > Pages > deploy from branch, gh-pages, / root), which
// .github/workflows/pages.yml rebuilds from frontend/icons/ on every push to
// master. Nothing here depends on that succeeding — if Pages is off or the URL
// 404s, the request just fails and the tab falls back to Google's default icon.
const FAVICON_URL = 'https://live-miracles.github.io/setu/icons/icon-192.png';

function doGet(): GoogleAppsScript.HTML.HtmlOutput {
    return HtmlService.createTemplateFromFile('Index')
        .evaluate()
        .setTitle('Setu')
        .setFaviconUrl(FAVICON_URL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename: string): string {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
