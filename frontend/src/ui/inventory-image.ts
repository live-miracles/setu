const MAX_IMAGE_SIZE = 480;
const JPEG_MIME_TYPE = 'image/jpeg';

export function fitImageWithinBounds(
    width: number,
    height: number,
    maxSize = MAX_IMAGE_SIZE,
): { width: number; height: number } {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error('Image dimensions are invalid.');
    }
    if (!Number.isFinite(maxSize) || maxSize <= 0) {
        throw new Error('Image size limit is invalid.');
    }
    const scale = Math.min(1, maxSize / width, maxSize / height);
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

export function imageUrlForDriveId(imageId: string): string {
    const value = imageId.trim();
    return value ? `https://drive.google.com/uc?export=view&id=${encodeURIComponent(value)}` : '';
}

function encodeJpeg(canvas: HTMLCanvasElement): {
    base64Data: string;
    mimeType: typeof JPEG_MIME_TYPE;
} {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare the selected image.');
    // JPEG is supported by every browser, including the Apps Script iframe.
    // Keeping conversion native also avoids the AVIF encoder's worker URL,
    // which cannot be resolved from the bundled non-module app script.
    const dataUrl = canvas.toDataURL(JPEG_MIME_TYPE, 0.72);
    const prefix = `data:${JPEG_MIME_TYPE};base64,`;
    if (!dataUrl.startsWith(prefix)) throw new Error('Unable to encode the selected image.');
    return {
        base64Data: dataUrl.slice(prefix.length),
        mimeType: JPEG_MIME_TYPE,
    };
}

export function readImageFile(file: File): Promise<HTMLImageElement> {
    if (!file.type.startsWith('image/')) {
        return Promise.reject(new Error('Please select an image file.'));
    }
    return new Promise((resolve, reject) => {
        const image = new Image();
        const objectUrl = URL.createObjectURL(file);
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Unable to read the selected image.'));
        };
        image.src = objectUrl;
    });
}

export async function prepareInventoryImage(file: File): Promise<{
    base64Data: string;
    fileName: string;
    mimeType: typeof JPEG_MIME_TYPE;
}> {
    const image = await readImageFile(file);
    const dimensions = fitImageWithinBounds(
        image.naturalWidth || image.width,
        image.naturalHeight || image.height,
    );
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare the selected image.');
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'inventory-image';
    const encoded = encodeJpeg(canvas);
    return { ...encoded, fileName: `${baseName}.jpg` };
}
