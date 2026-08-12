import { encodeAvif, fitImageWithinBounds, imageUrlForDriveId } from './inventory-image';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

export function runInventoryImageAssertions(): void {
    const landscape = fitImageWithinBounds(1920, 1080);
    assert(
        landscape.width === 480 && landscape.height === 270,
        'landscape images fit within 480px',
    );

    const portrait = fitImageWithinBounds(600, 1200);
    assert(portrait.width === 240 && portrait.height === 480, 'portrait images fit within 480px');

    const square = fitImageWithinBounds(480, 480);
    assert(square.width === 480 && square.height === 480, 'square images stay square');

    const small = fitImageWithinBounds(320, 200);
    assert(small.width === 320 && small.height === 200, 'small images are not enlarged');

    assert(imageUrlForDriveId('') === '', 'empty image IDs should not produce a preview URL');
    assert(
        imageUrlForDriveId('drive/id') === 'https://drive.google.com/uc?export=view&id=drive%2Fid',
        'Drive IDs should be URL encoded in preview URLs',
    );

    const avifCanvas = {
        toDataURL: (mimeType: string) => `data:${mimeType};base64,encoded`,
    } as unknown as HTMLCanvasElement;
    assert(
        encodeAvif(avifCanvas).mimeType === 'image/avif',
        'AVIF should be the only output format',
    );

    const unsupportedCanvas = {
        toDataURL: () => 'data:image/png;base64,encoded',
    } as unknown as HTMLCanvasElement;
    let failed = false;
    try {
        encodeAvif(unsupportedCanvas);
    } catch (error) {
        failed = error instanceof Error && error.message.includes('AVIF');
    }
    assert(failed, 'AVIF-unavailable browsers should fail instead of using a fallback');
}
