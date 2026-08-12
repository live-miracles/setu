const MAX_IMAGE_SIZE = 480;
const AVIF_MIME_TYPE = 'image/avif';
const AVIF_QUALITY = 0.72;

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

export function encodeAvif(canvas: HTMLCanvasElement): {
    dataUrl: string;
    mimeType: typeof AVIF_MIME_TYPE;
} {
    const dataUrl = canvas.toDataURL(AVIF_MIME_TYPE, AVIF_QUALITY);
    if (!dataUrl.startsWith(`data:${AVIF_MIME_TYPE};`)) {
        throw new Error('This browser cannot encode images as AVIF.');
    }
    return { dataUrl, mimeType: AVIF_MIME_TYPE };
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
    mimeType: typeof AVIF_MIME_TYPE;
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

    const encoded = encodeAvif(canvas);
    const prefix = `data:${encoded.mimeType};base64,`;
    const base64Data = encoded.dataUrl.slice(prefix.length);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'inventory-image';
    return { base64Data, fileName: `${baseName}.avif`, mimeType: encoded.mimeType };
}
