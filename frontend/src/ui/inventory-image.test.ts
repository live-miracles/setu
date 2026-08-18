import { fitImageWithinBounds, imageUrlForDriveId } from './inventory-image';

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
}
