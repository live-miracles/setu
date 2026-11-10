import {
    STICKERS_PER_PAGE,
    STICKER_COLUMNS,
    buildQrStickerPdf,
    inventoryLabelLocations,
    inventoryLabelStickerEntries,
    isPcrLocation,
    stickerLocationShortName,
    type QrModules,
    type QrStickerEntry,
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

    assert(
        entries.every((entry) => entry.group === undefined),
        'stickers get no group heading when no type has a location',
    );

    const located = [
        {
            Id: 't1',
            DisplayId: 1,
            Name: 'Camera',
            Location: 'Studio',
            labels: [{ DisplayId: 1 }],
        },
        {
            Id: 't2',
            DisplayId: 2,
            Name: 'Lens',
            Location: 'Store room ',
            labels: [{ DisplayId: 1 }, { DisplayId: 2 }],
        },
        { Id: 't3', DisplayId: 3, Name: 'Cable', Location: 'Archive', labels: [] },
        { Id: 't4', DisplayId: 4, Name: 'Tripod', labels: [{ DisplayId: 1 }] },
        {
            Id: 't5',
            DisplayId: 5,
            Name: 'Mic',
            Location: 'Studio',
            labels: [{ DisplayId: 1 }],
        },
    ] as unknown as InventoryTypeDTO[];
    assert(
        inventoryLabelLocations(located)
            .map((location) => `${location.title}:${location.labelCount}`)
            .join(',') === 'Store room:2,Studio:2,No location:1',
        'locations without labels should be left out and types without a location grouped last',
    );
    const locatedEntries = (locationKeys?: string[]) =>
        inventoryLabelStickerEntries(located, () => checkerboard, locationKeys);
    const codesFor = (locationKeys?: string[]) =>
        locatedEntries(locationKeys)
            .map((entry) => entry.code)
            .join(',');
    assert(
        codesFor() === '2-1,2-2,1-1,5-1,4-1',
        'stickers should be grouped by location, then sorted by code inside each location',
    );
    assert(
        locatedEntries()
            .map((entry) => entry.group)
            .join(',') === 'Store room,Store room,Studio,Studio,No location',
        'stickers should carry their location as the group heading',
    );
    assert(
        codesFor(['Studio', 'Store room']) === '2-1,2-2,1-1,5-1',
        'only the chosen locations should be included, in the usual location order',
    );
    assert(codesFor(['']) === '4-1', 'an empty key should select types without a location');
    assert(codesFor([]) === '', 'an empty selection should include nothing');
    assert(
        locatedEntries(['Studio']).every((entry) => entry.location === undefined),
        'stickers outside the PCR rooms should not print a location',
    );
    const pcrEntries = inventoryLabelStickerEntries(
        [
            {
                Id: 'p1',
                DisplayId: 9,
                Name: 'Mouse',
                Location: 'Big PCR Cupboard 3',
                labels: [{ DisplayId: 1, Name: '1 | Big PCR Cupboard 3' }],
            },
            {
                Id: 'p2',
                DisplayId: 8,
                Name: 'Cable',
                Location: 'SPCR Cupboard 9',
                labels: [{ DisplayId: 1 }],
            },
        ] as unknown as InventoryTypeDTO[],
        () => checkerboard,
    );
    assert(
        pcrEntries.map((entry) => entry.location).join(',') ===
            'Big PCR Cupboard 3,SPCR Cupboard 9',
        'Small and Big PCR stickers should carry their location',
    );
    assert(
        isPcrLocation('BPCR 3') && isPcrLocation('Small PCR') && !isPcrLocation('Studio 2'),
        'only Small and Big PCR locations should count as PCR',
    );
    assert(
        [
            'Big PCR Cupboard 3',
            'Big PCR Cupboard TOP 2',
            'Studio 11 stock area',
            'Drishti Studio 12',
            'SPCR Cupboard 9',
        ]
            .map(stickerLocationShortName)
            .join(',') === 'BPCR C3,BPCR Top2,S11 Stock,S12,SPCR C9',
        'locations should print in a short form',
    );
    const withLocation = new TextDecoder().decode(
        buildQrStickerPdf([{ modules: checkerboard, code: '1-1', location: 'Big PCR Cupboard 3' }]),
    );
    assert(withLocation.includes('(BPCR C3) Tj'), 'the short location should print on the sticker');

    const studios = [
        {
            Id: 'cam',
            DisplayId: 7,
            Name: 'Camera',
            Location: 'Studio 1-12',
            labels: [
                { DisplayId: 2, Name: 'SN-2 | Studio 2' },
                { DisplayId: 1, Name: 'SN-1 | Studio 1' },
                { DisplayId: 3, Name: '1 | Studio 2' },
                { DisplayId: 4, Name: 'Spare' },
            ],
        },
        {
            Id: 'kvm',
            DisplayId: 3,
            Name: 'KVM',
            Location: 'Studio 1-12',
            labels: [{ DisplayId: 1, Name: 'A1 | Backup | Studio 2' }],
        },
    ] as unknown as InventoryTypeDTO[];
    assert(
        inventoryLabelLocations(studios)
            .map((location) => `${location.title}:${location.labelCount}`)
            .join(',') === 'Studio 1:1,Studio 1-12:1,Studio 2:3',
        'label locations should be counted per label, not per type',
    );
    const studioEntries = inventoryLabelStickerEntries(studios, () => checkerboard);
    assert(
        studioEntries.map((entry) => `${entry.group}:${entry.code}`).join(',') ===
            'Studio 1:7-1,Studio 1-12:7-4,Studio 2:3-1,Studio 2:7-2,Studio 2:7-3',
        'each label should print once, under the location in its name',
    );
    assert(
        inventoryLabelStickerEntries(studios, () => checkerboard, ['Studio 2'])
            .map((entry) => entry.code)
            .join(',') === '3-1,7-2,7-3',
        'choosing a studio should print only the labels in that studio',
    );

    const sticker = (code: string, group?: string): QrStickerEntry => ({
        modules: checkerboard,
        code,
        group,
    });
    const pageCount = (stickers: QrStickerEntry[]) =>
        Number(/\/Count (\d+) /.exec(new TextDecoder().decode(buildQrStickerPdf(stickers)))?.[1]);
    const twoGroups = [sticker('1', 'Store room'), sticker('2', 'Studio')];
    const twoGroupsText = new TextDecoder().decode(buildQrStickerPdf(twoGroups));
    assert(
        twoGroupsText.includes('(Store room) Tj') && twoGroupsText.includes('(Studio) Tj'),
        'each group should print its heading',
    );
    assert(
        pageCount(twoGroups) === 1,
        'a new group should continue on the same page instead of starting a new one',
    );
    const yOf = (code: string) =>
        Number(
            new RegExp(`/F1 [\\d.]+ Tf [\\d.]+ ([\\d.]+) Td \\(${code}\\) Tj`).exec(
                twoGroupsText,
            )?.[1],
        );
    assert(
        yOf('1') - yOf('2') > 60,
        'a group should start on its own row even when the previous row is not full',
    );
    const filled = (rows: number, group: string, code: string) =>
        Array.from({ length: rows * STICKER_COLUMNS }, () => sticker(code, group));
    const rowsPerPage = STICKERS_PER_PAGE / STICKER_COLUMNS;
    assert(
        pageCount([...filled(rowsPerPage - 2, 'A', '1'), sticker('2', 'B')]) === 1,
        'a heading and its first row should fit in the space left on the page',
    );
    // The most rows of one group that still fit on a single page.
    let fullRows = rowsPerPage;
    while (pageCount(filled(fullRows, 'A', '1')) > 1) fullRows--;
    const overflowText = new TextDecoder().decode(
        buildQrStickerPdf([...filled(fullRows, 'A', '1'), sticker('2', 'B')]),
    );
    const secondPageAt = overflowText.indexOf(
        '/Type /Page /Parent',
        overflowText.indexOf('/Type /Page /Parent') + 1,
    );
    assert(
        /\/Count 2 /.test(overflowText) &&
            secondPageAt > 0 &&
            overflowText.indexOf('(B) Tj') > secondPageAt,
        'a heading should move to the next page together with its first row, never alone',
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
            printedNames('Camera')[0].size === 7,
        'the type name should print above the QR code in the same size as the code',
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
    assert(fontSize('34-1') === 7, 'short codes should print at the full caption size');
    assert(fontSize('12345-67890') < 7, 'long codes should shrink to fit inside the sticker');
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
