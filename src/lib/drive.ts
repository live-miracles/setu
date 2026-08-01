import { GoogleAuth } from 'google-auth-library';
import { requireEnv } from '@/lib/env';

const DRIVE_UPLOAD_URL =
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
const DRIVE_PERMISSIONS_URL = (fileId: string) =>
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;

function getAuth() {
    return new GoogleAuth({
        credentials: {
            client_email: requireEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
            private_key: requireEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
}

/**
 * Uploads an image into the shared Drive folder and grants "anyone with
 * the link" read access, so it can be hot-linked via driveImageUrl().
 */
export async function uploadImageToDrive(
    bytes: Buffer,
    fileName: string,
    contentType: string,
): Promise<string> {
    const client = await getAuth().getClient();
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('Could not obtain a Google Drive access token.');

    const boundary = 'setu-upload-boundary';
    const metadata = JSON.stringify({
        name: fileName,
        parents: [requireEnv('GOOGLE_DRIVE_FOLDER_ID')],
    });
    const body =
        `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        `${metadata}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${contentType}\r\n` +
        'Content-Transfer-Encoding: base64\r\n\r\n' +
        `${bytes.toString('base64')}\r\n` +
        `--${boundary}--`;

    const uploadResponse = await fetch(DRIVE_UPLOAD_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
    });
    if (!uploadResponse.ok) {
        throw new Error(`Google Drive upload failed: ${await uploadResponse.text()}`);
    }
    const { id: fileId } = (await uploadResponse.json()) as { id: string };

    const permissionResponse = await fetch(DRIVE_PERMISSIONS_URL(fileId), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
    if (!permissionResponse.ok) {
        throw new Error(`Google Drive permission grant failed: ${await permissionResponse.text()}`);
    }

    return fileId;
}
