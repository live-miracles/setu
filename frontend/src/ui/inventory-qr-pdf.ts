import { groupInventoryTypes, inventoryQrValue } from './inventory-qr';

// Builds a printable A4 sheet of small QR stickers as a PDF. QR codes are drawn
// as vector squares (no images, no PDF library), so they stay sharp at the
// small size used for stickers on equipment.

export type QrModules = { size: number; get(row: number, col: number): number };

export type QrStickerEntry = {
    modules: QrModules;
    // The value printed under the QR code, e.g. "34-12".
    code: string;
    // The inventory type name, printed small above the QR code and cut off
    // where it no longer fits the sticker width.
    name?: string;
    // Entries of one group must be consecutive. Each group starts on a new
    // sticker row under a heading with this title, e.g. the location.
    group?: string;
};

const MM = 72 / 25.4;
const PT_TO_MM = 25.4 / 72;
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 10;
const QR_SIZE_MM = 12.6;
const CELL_WIDTH_MM = 16.5;
// Cap height of Helvetica is about 0.72 of the font size.
const CAP_HEIGHT = 0.72;
const NAME_SIZE = 5.5;
const NAME_TOP_MM = 1;
const NAME_BASELINE_MM = NAME_TOP_MM + NAME_SIZE * CAP_HEIGHT * PT_TO_MM;
// Space between the type name and the QR code, and above the QR code when
// there is no name, kept inside the sticker so it still scans after cutting
// along the outline.
const QR_TOP_MM = NAME_BASELINE_MM + 1.5;
const CAPTION_SIZE = 9;
const CAPTION_GAP_MM = 1.2;
const CAPTION_BASELINE_MM =
    QR_TOP_MM + QR_SIZE_MM + CAPTION_GAP_MM + CAPTION_SIZE * CAP_HEIGHT * PT_TO_MM;
const CELL_HEIGHT_MM = CAPTION_BASELINE_MM + 1.2;
const HEADING_SIZE = 10;
const HEADING_BASELINE_MM = 1.5 + HEADING_SIZE * CAP_HEIGHT * PT_TO_MM;
const HEADING_HEIGHT_MM = HEADING_BASELINE_MM + 2;
// Helvetica Bold digits are 0.556 of the font size wide; use a slightly wider
// estimate so the code always fits inside its sticker.
const CHAR_WIDTH = 0.6;

const COLUMNS = Math.floor((PAGE_WIDTH_MM - 2 * PAGE_MARGIN_MM) / CELL_WIDTH_MM);
const ROWS = Math.floor((PAGE_HEIGHT_MM - 2 * PAGE_MARGIN_MM) / CELL_HEIGHT_MM);
export const STICKER_COLUMNS = COLUMNS;
// Without group headings; a heading takes some of a page's space.
export const STICKERS_PER_PAGE = COLUMNS * ROWS;
const GRID_LEFT_MM = (PAGE_WIDTH_MM - COLUMNS * CELL_WIDTH_MM) / 2;

const num = (value: number) => value.toFixed(2);

// Helvetica-Bold advance widths (1/1000 em) for ASCII 32-126, from the font's
// AFM metrics, so type names are cut exactly where they stop fitting.
const HELVETICA_BOLD_WIDTHS = [
    278, 333, 474, 556, 556, 889, 722, 278, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
    611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
    667, 611, 333, 278, 333, 584, 556, 278, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
    278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

const charWidth = (char: string, size: number) =>
    (HELVETICA_BOLD_WIDTHS[char.charCodeAt(0) - 32] * size) / 1000;

function codeOps(code: string, cellLeftMm: number, baselineMm: number): string {
    // Codes are digits and hyphens; dropping anything else keeps the file
    // plain ASCII, which also lets byte offsets be computed from string lengths.
    const text = code.replace(/[^0-9A-Za-z-]/g, '');
    if (!text) return '';
    const size = Math.min(CAPTION_SIZE, ((CELL_WIDTH_MM - 2) * MM) / (text.length * CHAR_WIDTH));
    const textWidth = text.length * size * CHAR_WIDTH;
    const x = cellLeftMm * MM + (CELL_WIDTH_MM * MM - textWidth) / 2;
    const y = (PAGE_HEIGHT_MM - baselineMm) * MM;
    return `BT /F1 ${num(size)} Tf ${num(x)} ${num(y)} Td (${text}) Tj ET\n`;
}

// Keeps the file plain ASCII (so byte offsets can be computed from string
// lengths): accents are dropped from their letters, other characters removed.
function asciiText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[^\x20-\x7e]/g, '')
        .trim();
}

const textWidth = (text: string, size: number) =>
    [...text].reduce((sum, char) => sum + charWidth(char, size), 0);

// Keeps only the first characters of the text that fit the width; a long
// text is simply cut off.
function fitText(value: string, size: number, maxWidth: number): string {
    let text = '';
    for (const char of asciiText(value)) {
        if (textWidth(text + char, size) > maxWidth) break;
        text += char;
    }
    return text.trimEnd();
}

const escapePdfText = (text: string) => text.replace(/[\\()]/g, '\\$&');

function nameOps(name: string, cellLeftMm: number, baselineMm: number): string {
    const text = fitText(name, NAME_SIZE, (CELL_WIDTH_MM - 2) * MM);
    if (!text) return '';
    const x = cellLeftMm * MM + (CELL_WIDTH_MM * MM - textWidth(text, NAME_SIZE)) / 2;
    const y = (PAGE_HEIGHT_MM - baselineMm) * MM;
    return `BT /F1 ${num(NAME_SIZE)} Tf ${num(x)} ${num(y)} Td (${escapePdfText(text)}) Tj ET\n`;
}

// A group title on its own row, left-aligned with the sticker grid.
function headingOps(title: string, topMm: number): string {
    const text = fitText(title, HEADING_SIZE, COLUMNS * CELL_WIDTH_MM * MM);
    if (!text) return '';
    const x = GRID_LEFT_MM * MM;
    const y = (PAGE_HEIGHT_MM - topMm - HEADING_BASELINE_MM) * MM;
    return `0 g BT /F1 ${num(HEADING_SIZE)} Tf ${num(x)} ${num(y)} Td (${escapePdfText(text)}) Tj ET\n`;
}

// topEdge: draw the sticker's top cutting line, which is not already the
// bottom line of a sticker above it (first row on a page or under a heading).
function stickerOps(
    entry: QrStickerEntry,
    column: number,
    cellTopMm: number,
    topEdge: boolean,
): string {
    const cellLeftMm = GRID_LEFT_MM + column * CELL_WIDTH_MM;
    const { modules } = entry;
    const moduleMm = QR_SIZE_MM / modules.size;
    const qrLeftMm = cellLeftMm + (CELL_WIDTH_MM - QR_SIZE_MM) / 2;
    const qrTopMm = cellTopMm + QR_TOP_MM;
    // Stickers touch, so neighbors share a single cutting line: each sticker
    // draws its right and bottom edges, and the first column and the top row
    // of a block also draw their left and top edges.
    const left = cellLeftMm * MM;
    const right = (cellLeftMm + CELL_WIDTH_MM) * MM;
    const top = (PAGE_HEIGHT_MM - cellTopMm) * MM;
    const bottom = (PAGE_HEIGHT_MM - cellTopMm - CELL_HEIGHT_MM) * MM;
    const edges = [
        `${num(right)} ${num(top)} m ${num(right)} ${num(bottom)} l`,
        `${num(left)} ${num(bottom)} m ${num(right)} ${num(bottom)} l`,
        ...(column === 0 ? [`${num(left)} ${num(top)} m ${num(left)} ${num(bottom)} l`] : []),
        ...(topEdge ? [`${num(left)} ${num(top)} m ${num(right)} ${num(top)} l`] : []),
    ];
    let ops = `0.8 G 0.25 w ${edges.join(' ')} S\n`;
    ops += '0 g\n';
    for (let moduleRow = 0; moduleRow < modules.size; moduleRow++) {
        let col = 0;
        while (col < modules.size) {
            if (!modules.get(moduleRow, col)) {
                col++;
                continue;
            }
            const start = col;
            while (col < modules.size && modules.get(moduleRow, col)) col++;
            ops += `${num((qrLeftMm + start * moduleMm) * MM)} ${num((PAGE_HEIGHT_MM - qrTopMm - (moduleRow + 1) * moduleMm) * MM)} ${num((col - start) * moduleMm * MM)} ${num(moduleMm * MM)} re\n`;
        }
    }
    ops += 'f\n';
    if (entry.name) ops += nameOps(entry.name, cellLeftMm, cellTopMm + NAME_BASELINE_MM);
    ops += codeOps(entry.code, cellLeftMm, cellTopMm + CAPTION_BASELINE_MM);
    return ops;
}

// Fills pages row by row. A new group starts on a fresh row under its heading,
// without a page break, so the paper is used fully; the heading always stays
// on the same page as the first row of its stickers.
function layoutPages(entries: QrStickerEntry[]): string[] {
    const pages: string[] = [];
    const bottomMm = PAGE_HEIGHT_MM - PAGE_MARGIN_MM;
    let y = PAGE_MARGIN_MM;
    let column = 0;
    let topEdge = true;
    entries.forEach((entry, index) => {
        const newGroup = entry.group !== undefined && entry.group !== entries[index - 1]?.group;
        if (newGroup && column > 0) {
            y += CELL_HEIGHT_MM;
            column = 0;
        }
        if (column === 0) {
            topEdge = false;
            const needMm = (newGroup ? HEADING_HEIGHT_MM : 0) + CELL_HEIGHT_MM;
            if (!pages.length || y + needMm > bottomMm + 0.001) {
                pages.push('');
                y = PAGE_MARGIN_MM;
                topEdge = true;
            }
            if (newGroup) {
                pages[pages.length - 1] += headingOps(entry.group as string, y);
                y += HEADING_HEIGHT_MM;
                topEdge = true;
            }
        }
        pages[pages.length - 1] += stickerOps(entry, column, y, topEdge);
        if (++column === COLUMNS) {
            column = 0;
            y += CELL_HEIGHT_MM;
        }
    });
    return pages;
}

export function buildQrStickerPdf(entries: QrStickerEntry[]): Uint8Array<ArrayBuffer> {
    if (!entries.length) throw new Error('There are no QR codes to export.');
    const streams = layoutPages(entries);
    const pageCount = streams.length;
    const firstPageObject = 4;
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, page) => `${firstPageObject + page * 2} 0 R`).join(' ')}] /Count ${pageCount} >>`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    ];
    for (let page = 0; page < pageCount; page++) {
        const stream = streams[page];
        objects.push(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_WIDTH_MM * MM)} ${num(PAGE_HEIGHT_MM * MM)}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${firstPageObject + page * 2 + 1} 0 R >>`,
            `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
        );
    }
    let pdf = '%PDF-1.4\n';
    const offsets = objects.map((body, index) => {
        const offset = pdf.length;
        pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
        return offset;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return new TextEncoder().encode(pdf);
}

export type LabelLocation = { key: string; title: string; labelCount: number };

// The locations that have at least one labeled item, in the same order as the
// "Group by location" view. The key is the trimmed location ('' for types
// without one), which is what inventoryLabelStickerEntries filters on.
export function inventoryLabelLocations(types: InventoryTypeDTO[]): LabelLocation[] {
    return groupInventoryTypes(types, 'location')
        .map((group) => ({
            key: group.key,
            title: group.title,
            labelCount: group.rows.reduce((sum, type) => sum + (type.labels || []).length, 0),
        }))
        .filter((location) => location.labelCount > 0);
}

// One sticker per labeled item, captioned with the type name; the unlabeled
// inventory type QR codes are left out on purpose. Stickers are grouped by
// location (headed with its name, in the "Group by location" order) and sorted
// by code (type number, then label number) inside each. When every type lacks
// a location there is nothing to head, so no groups are made. When
// locationKeys is given, only types in those locations are included.
export function inventoryLabelStickerEntries(
    types: InventoryTypeDTO[],
    createModules: (text: string) => QrModules,
    locationKeys?: string[],
): QrStickerEntry[] {
    const wanted = locationKeys && new Set(locationKeys);
    const groups = groupInventoryTypes(
        types.filter((type) => !wanted || wanted.has(String(type.Location || '').trim())),
        'location',
    );
    const showGroups = groups.some((group) => group.key);
    return groups.flatMap((group) =>
        [...group.rows]
            .sort((a, b) => a.DisplayId - b.DisplayId)
            .flatMap((type) =>
                [...(type.labels || [])]
                    .sort((a, b) => a.DisplayId - b.DisplayId)
                    .map((label) => {
                        const code = inventoryQrValue(type, label);
                        return {
                            modules: createModules(code),
                            code,
                            name: type.Name,
                            ...(showGroups ? { group: group.title } : {}),
                        };
                    }),
            ),
    );
}
