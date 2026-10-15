import { inventoryQrValue, sortInventoryLabels } from './inventory-qr';

// Builds a printable A4 sheet of small QR stickers as a PDF. QR codes are drawn
// as vector squares (no images, no PDF library), so they stay sharp at the
// small size used for stickers on equipment.

export type QrModules = { size: number; get(row: number, col: number): number };

export type QrStickerEntry = {
    modules: QrModules;
    // The value printed under the QR code, e.g. "34-12".
    code: string;
};

const MM = 72 / 25.4;
const PT_TO_MM = 25.4 / 72;
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 10;
const QR_SIZE_MM = 12.6;
// Quiet zone around the QR code, kept inside the sticker so it still scans
// after cutting along the outline.
const QR_TOP_MM = 2;
const CELL_WIDTH_MM = 16.5;
const CAPTION_SIZE = 9;
const CAPTION_GAP_MM = 1.2;
// Cap height of Helvetica is about 0.72 of the font size.
const CAPTION_BASELINE_MM =
    QR_TOP_MM + QR_SIZE_MM + CAPTION_GAP_MM + CAPTION_SIZE * 0.72 * PT_TO_MM;
const CELL_HEIGHT_MM = CAPTION_BASELINE_MM + 1.2;
// Thin gap between stickers: one scissor cut separates neighbors.
const CELL_GAP_MM = 1;
// Helvetica Bold digits are 0.556 of the font size wide; use a slightly wider
// estimate so the code always fits inside its sticker.
const CHAR_WIDTH = 0.6;

const COLUMNS = Math.floor(
    (PAGE_WIDTH_MM - 2 * PAGE_MARGIN_MM + CELL_GAP_MM) / (CELL_WIDTH_MM + CELL_GAP_MM),
);
const ROWS = Math.floor(
    (PAGE_HEIGHT_MM - 2 * PAGE_MARGIN_MM + CELL_GAP_MM) / (CELL_HEIGHT_MM + CELL_GAP_MM),
);
export const STICKERS_PER_PAGE = COLUMNS * ROWS;
const GRID_LEFT_MM = (PAGE_WIDTH_MM - (COLUMNS * (CELL_WIDTH_MM + CELL_GAP_MM) - CELL_GAP_MM)) / 2;

const num = (value: number) => value.toFixed(2);

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

function stickerOps(entry: QrStickerEntry, slot: number): string {
    const cellLeftMm = GRID_LEFT_MM + (slot % COLUMNS) * (CELL_WIDTH_MM + CELL_GAP_MM);
    const cellTopMm = PAGE_MARGIN_MM + Math.floor(slot / COLUMNS) * (CELL_HEIGHT_MM + CELL_GAP_MM);
    const { modules } = entry;
    const moduleMm = QR_SIZE_MM / modules.size;
    const qrLeftMm = cellLeftMm + (CELL_WIDTH_MM - QR_SIZE_MM) / 2;
    const qrTopMm = cellTopMm + QR_TOP_MM;
    // Light cell outline doubles as a cutting guide.
    let ops = `0.8 G 0.25 w ${num(cellLeftMm * MM)} ${num((PAGE_HEIGHT_MM - cellTopMm - CELL_HEIGHT_MM) * MM)} ${num(CELL_WIDTH_MM * MM)} ${num(CELL_HEIGHT_MM * MM)} re S\n`;
    ops += '0 g\n';
    for (let row = 0; row < modules.size; row++) {
        let col = 0;
        while (col < modules.size) {
            if (!modules.get(row, col)) {
                col++;
                continue;
            }
            const start = col;
            while (col < modules.size && modules.get(row, col)) col++;
            ops += `${num((qrLeftMm + start * moduleMm) * MM)} ${num((PAGE_HEIGHT_MM - qrTopMm - (row + 1) * moduleMm) * MM)} ${num((col - start) * moduleMm * MM)} ${num(moduleMm * MM)} re\n`;
        }
    }
    ops += 'f\n';
    ops += codeOps(entry.code, cellLeftMm, cellTopMm + CAPTION_BASELINE_MM);
    return ops;
}

export function buildQrStickerPdf(entries: QrStickerEntry[]): Uint8Array<ArrayBuffer> {
    if (!entries.length) throw new Error('There are no QR codes to export.');
    const pageCount = Math.ceil(entries.length / STICKERS_PER_PAGE);
    const firstPageObject = 4;
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, page) => `${firstPageObject + page * 2} 0 R`).join(' ')}] /Count ${pageCount} >>`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    ];
    for (let page = 0; page < pageCount; page++) {
        const stream = entries
            .slice(page * STICKERS_PER_PAGE, (page + 1) * STICKERS_PER_PAGE)
            .map((entry, slot) => stickerOps(entry, slot))
            .join('');
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

// One sticker per labeled item; the unlabeled inventory type QR codes are
// left out on purpose.
export function inventoryLabelStickerEntries(
    types: InventoryTypeDTO[],
    createModules: (text: string) => QrModules,
): QrStickerEntry[] {
    return types.flatMap((type) =>
        sortInventoryLabels(type.labels).map((label) => {
            const code = inventoryQrValue(type, label);
            return { modules: createModules(code), code };
        }),
    );
}
