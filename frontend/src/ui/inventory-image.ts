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

function encodeJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare the selected image.');
    // JPEG is supported natively by every browser. Keeping conversion native
    // also avoids the AVIF encoder's worker URL, which cannot be resolved
    // from the bundled non-module app script.
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) =>
                blob ? resolve(blob) : reject(new Error('Unable to encode the selected image.')),
            JPEG_MIME_TYPE,
            0.72,
        );
    });
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
    blob: Blob;
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
    const blob = await encodeJpeg(canvas);
    return { blob, fileName: `${baseName}.jpg`, mimeType: JPEG_MIME_TYPE };
}
