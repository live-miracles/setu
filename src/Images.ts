// Apps Script has native Drive access, so uploads go straight through
// DriveApp instead of the source app's service-account/REST approach (that
// workaround only exists because Next.js has no built-in Drive service).
// The target folder must be one this script/deploying account already has
// access to under the 'drive' scope in appsscript.json — created by
// (or shared with edit access to) the same Google account that deploys the
// web app.
const ALLOWED_IMAGE_MIME_TYPES = ['image/avif', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 50 * 1024;

function getImagesDriveFolderId(): string {
    const id = PropertiesService.getScriptProperties().getProperty('IMAGES_DRIVE_FOLDER_ID');
    if (!id) throw new Error('Script property IMAGES_DRIVE_FOLDER_ID is not set.');
    return id;
}

function uploadImage(base64Data: string, fileName: string, mimeType: string): string {
    requireUser();
    if (ALLOWED_IMAGE_MIME_TYPES.indexOf(mimeType) === -1) {
        throw new ValidationError('unsupported_content_type');
    }
    const trimmedName = requireNonEmpty(fileName, 'A file name is required.');
    const bytes = Utilities.base64Decode(base64Data);
    if (bytes.length > MAX_IMAGE_BYTES) {
        throw new ValidationError('file_too_large');
    }

    const blob = Utilities.newBlob(bytes, mimeType, trimmedName);
    const folder = DriveApp.getFolderById(getImagesDriveFolderId());
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getId();
}
