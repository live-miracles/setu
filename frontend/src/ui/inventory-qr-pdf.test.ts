import {
    STICKERS_PER_PAGE,
    buildQrStickerPdf,
    inventoryLabelStickerEntries,
    type QrModules,
} from './inventory-qr-pdf';

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

const checkerboard: QrModules = { size: 5, get: (row, col) => (row + col) % 2 };

export function runInventoryQrPdfAssertions(): void {
    const entries = inventoryLabelStickerEntries(
        [
            {
                Id: 'type-3',
                DisplayId: 35,
                Name: 'Lens',
                labels: [{ Id: 'label-3', DisplayId: 1, InventoryTypeId: 'type-3', Name: 'A' }],
            },
            {
                Id: 'type-1',
                DisplayId: 34,
                Brand: 'Sony',
                Name: 'Camera',
                labels: [
                    { Id: 'label-10', DisplayId: 10, InventoryTypeId: 'type-1', Name: 'Case 1' },
                    { Id: 'label-2', DisplayId: 2, InventoryTypeId: 'type-1', Name: 'Case 2' },
                    { Id: 'label-1', DisplayId: 1, InventoryTypeId: 'type-1', Name: 'Case 3' },
                ],
            },
            { Id: 'type-2', DisplayId: 5, Name: 'Cable', labels: [] },
        ] as unknown as InventoryTypeDTO[],
        () => checkerboard,
    );
    assert(entries.length === 4, 'only labeled items should get a sticker');
    assert(
        entries.map((entry) => entry.code).join(',') === '34-1,34-2,34-10,35-1',
        'stickers should use the label QR value in ascending numeric order, not name order',
    );

    assert(
        entries[0].name === 'Camera' && entries[3].name === 'Lens',
        'stickers should carry their inventory type name',
    );

    const text = new TextDecoder().decode(buildQrStickerPdf(entries));
    assert(text.startsWith('%PDF-1.4\n') && text.endsWith('%%EOF\n'), 'pdf should be framed');
    const printedNames = (name?: string) =>
        [
            ...new TextDecoder()
                .decode(buildQrStickerPdf([{ ...entries[0], name }]))
                .matchAll(/\/F1 ([\d.]+) Tf [\d.]+ [\d.]+ Td \((.*)\) Tj ET/g),
        ]
            .filter((match) => match[2] !== entries[0].code)
            .map((match) => ({ size: Number(match[1]), text: match[2] }));
    assert(
        printedNames('Camera').length === 1 &&
            printedNames('Camera')[0].text === 'Camera' &&
            printedNames('Camera')[0].size < 9,
        'the type name should print above the QR code in a smaller font than the code',
    );
    const longName = 'Professional broadcast camera kit';
    const cutLong = printedNames(longName)[0].text;
    assert(
        cutLong.length > 0 && cutLong.length < longName.length && longName.startsWith(cutLong),
        'a long type name should be cut to the first characters that fit',
    );
    assert(
        printedNames('i'.repeat(40))[0].text.length > printedNames('W'.repeat(40))[0].text.length,
        'name cutoff should follow glyph widths, not character count',
    );
    assert(
        printedNames('Café (2)')[0].text === 'Cafe \\(2\\)',
        'accents are dropped and parentheses escaped',
    );
    assert(
        printedNames('日本語').length === 0 && printedNames('').length === 0,
        'a name without printable characters should be omitted',
    );
    assert(text.includes('/Count 1 '), 'a few stickers should fit on one page');
    assert(
        text.includes('(34-1) Tj') && text.includes('(34-2) Tj'),
        'each sticker should print only its code',
    );
    const fontSize = (code: string) =>
        Number(
            new RegExp(`/F1 ([\\d.]+) Tf [\\d.]+ [\\d.]+ Td \\(${code}\\) Tj`).exec(
                new TextDecoder().decode(buildQrStickerPdf([{ ...entries[0], code }])),
            )?.[1],
        );
    assert(fontSize('34-1') === 9, 'short codes should print at the full caption size');
    assert(fontSize('1234-5678') < 9, 'long codes should shrink to fit inside the sticker');
    const startxref = Number(/startxref\n(\d+)\n/.exec(text)?.[1]);
    assert(text.slice(startxref, startxref + 4) === 'xref', 'startxref should point at xref');
    const offsets = [...text.slice(startxref).matchAll(/(\d{10}) 00000 n /g)].map((match) =>
        Number(match[1]),
    );
    assert(offsets.length > 0, 'xref should list objects');
    offsets.forEach((offset, index) =>
        assert(
            text.slice(offset).startsWith(`${index + 1} 0 obj`),
            `xref offset for object ${index + 1} should point at the object`,
        ),
    );

    const many = Array.from({ length: STICKERS_PER_PAGE + 1 }, () => entries[0]);
    assert(
        new TextDecoder().decode(buildQrStickerPdf(many)).includes('/Count 2 '),
        'stickers beyond one page should flow onto a second page',
    );
    let threw = false;
    try {
        buildQrStickerPdf([]);
    } catch {
        threw = true;
    }
    assert(threw, 'building a pdf without stickers should fail');
}
