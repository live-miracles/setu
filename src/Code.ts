function doGet(): GoogleAppsScript.HTML.HtmlOutput {
    return HtmlService.createTemplateFromFile('Index')
        .evaluate()
        .setTitle('Livestream Operations')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename: string): string {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
