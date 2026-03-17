import { jsPDF } from 'jspdf';
import type { IogcLeaseAuditData } from '../../types';
import { getAssetUrl } from '../SafeImage';

// ─── PDF Layout Constants ──────────────────────────────────────────

const BORDER = 12.7;          // page border margin
const PAD = 4;                // content padding inside border
const CM = BORDER + PAD;      // content margin (left/right)
const TEAL: [number, number, number] = [0, 130, 100];   // green-teal matching X-Terra logo
const BLACK: [number, number, number] = [0, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];
const GREY_LINE: [number, number, number] = [180, 180, 180];
const LW_BOX = 0.3;          // line width for boxes
const LW_GRID = 0.2;         // line width for grid lines inside sections
const BOX_PAD = 3.5;         // padding inside boxes — enough to clear text ascenders/descenders from grid lines
const HEADER_H = 6;          // teal header bar height

const getPageDims = (doc: jsPDF) => ({
    pw: doc.internal.pageSize.getWidth(),
    ph: doc.internal.pageSize.getHeight(),
    cw: doc.internal.pageSize.getWidth() - CM * 2,
    maxY: doc.internal.pageSize.getHeight() - CM - 8,  // leave room for footer line + info text
});

// ─── Image loading helper ────────────────────────────────────────

const loadImageAsBase64 = async (fileName: string): Promise<string | null> => {
    try {
        const url = await getAssetUrl(fileName);
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const blob = await resp.blob();
        return new Promise<string | null>(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch { return null; }
};

// ─── Footer ──────────────────────────────────────────────────────

// Standard footer for all pages except the cover
const _drawFooterBase = (doc: jsPDF, data: IogcLeaseAuditData) => {
    const { pw, ph } = getPageDims(doc);
    const footerLineY = ph - BORDER - 4;
    doc.setDrawColor(...TEAL); doc.setLineWidth(0.5);
    doc.line(BORDER, footerLineY, pw - BORDER, footerLineY);

    doc.setFontSize(6); doc.setFont('times', 'normal'); doc.setTextColor(100, 100, 100);
    const loc = data.cover.legalLocation || data.location || '';
    const infoText = `Surface Lease Audit: ${loc}   Project #: ${data.projectNumber}   Client: ${data.cover.lesseeName}   Creation Date: ${data.reportDate}`;
    doc.text(infoText, pw / 2, footerLineY + 3, { align: 'center' });
    doc.setTextColor(...BLACK);
};

const drawCompanyHeader = (doc: jsPDF) => {
    doc.setFontSize(8); doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
    doc.text('A THUNDERCHILD ENERGY SERVICES COMPANY', CM, CM + 3);
};

// ─── Teal section header bar ─────────────────────────────────────

const drawSectionBar = (doc: jsPDF, title: string, y: number, cw: number): number => {
    doc.setFillColor(...TEAL); doc.setDrawColor(...TEAL); doc.setLineWidth(LW_BOX);
    doc.rect(CM, y, cw, HEADER_H, 'FD');
    doc.setFontSize(10); doc.setFont('times', 'bold'); doc.setTextColor(...WHITE);
    doc.text(title, CM + BOX_PAD + 1, y + 4.2);
    doc.setTextColor(...BLACK);
    return y + HEADER_H;
};

// ─── Cover sheet box (teal header + bordered content) ────────────

const drawCoverBox = (doc: jsPDF, header: string, x: number, y: number, w: number, contentH: number): { iy: number; ey: number } => {
    // Teal header
    doc.setFillColor(...TEAL); doc.setDrawColor(...TEAL); doc.setLineWidth(LW_BOX);
    doc.rect(x, y, w, HEADER_H, 'FD');
    doc.setFontSize(8); doc.setFont('times', 'bold'); doc.setTextColor(...WHITE);
    doc.text(header, x + BOX_PAD + 1, y + 4.2);
    doc.setTextColor(...BLACK);
    // Content box
    doc.setDrawColor(...GREY_LINE); doc.setLineWidth(LW_BOX);
    doc.rect(x, y + HEADER_H, w, contentH, 'S');
    return { iy: y + HEADER_H + BOX_PAD, ey: y + HEADER_H + contentH };
};

// ─── Sub-section header (teal italic) ────────────────────────────

const drawSubHeader = (doc: jsPDF, title: string, y: number, cw: number): number => {
    doc.setDrawColor(...TEAL); doc.setLineWidth(LW_BOX);
    doc.line(CM, y, CM + cw, y);
    y += 4.5;
    doc.setFontSize(10); doc.setFont('times', 'bolditalic'); doc.setTextColor(...TEAL);
    doc.text(title, CM + 1, y);
    doc.setTextColor(...BLACK);
    return y + 4;
};

// ─── Inline radio circles ────────────────────────────────────────

const drawRadio = (doc: jsPDF, value: string, options: string[], x: number, y: number): number => {
    doc.setFontSize(8); doc.setFont('times', 'normal');
    let cx = x;
    for (const opt of options) {
        doc.setLineWidth(0.2); doc.setDrawColor(...BLACK);
        if (opt === value) { doc.setFillColor(...TEAL); doc.circle(cx + 1.3, y - 0.8, 1.3, 'FD'); }
        else { doc.circle(cx + 1.3, y - 0.8, 1.3, 'S'); }
        doc.text(opt, cx + 3.5, y);
        cx += doc.getTextWidth(opt) + 7;
    }
    return 4;
};

// ─── Inline checkboxes ──────────────────────────────────────────

const drawCheckbox = (doc: jsPDF, selected: string[], options: string[], x: number, y: number): number => {
    doc.setFontSize(8); doc.setFont('times', 'normal');
    let cx = x;
    for (const opt of options) {
        doc.setLineWidth(0.2); doc.setDrawColor(...BLACK);
        if (selected.includes(opt)) { doc.setFillColor(...TEAL); doc.rect(cx, y - 2.2, 2.5, 2.5, 'FD'); }
        else { doc.rect(cx, y - 2.2, 2.5, 2.5, 'S'); }
        doc.text(opt, cx + 3.5, y);
        cx += doc.getTextWidth(opt) + 9;
    }
    return 4;
};

// ─── Label with radio right-aligned ──────────────────────────────

const drawLabelRadioRight = (doc: jsPDF, label: string, value: string, options: string[], x: number, y: number, fullW: number): number => {
    doc.setFontSize(8); doc.setFont('times', 'normal');
    doc.text(label, x, y);
    let rightX = x + fullW;
    const totalOptW = options.reduce((a, o) => a + doc.getTextWidth(o) + 6, 0);
    let cx = rightX - totalOptW;
    for (const opt of options) {
        doc.setLineWidth(0.2); doc.setDrawColor(...BLACK);
        if (opt === value) { doc.setFillColor(...TEAL); doc.circle(cx + 1.3, y - 0.8, 1.3, 'FD'); }
        else { doc.circle(cx + 1.3, y - 0.8, 1.3, 'S'); }
        doc.text(opt, cx + 3.5, y);
        cx += doc.getTextWidth(opt) + 6;
    }
    return 4;
};

// ─── Label: Value pair ───────────────────────────────────────────

const drawLV = (doc: jsPDF, label: string, value: string, x: number, y: number, maxW: number, fontSize = 9): number => {
    doc.setFontSize(fontSize);
    const lbl = `${label}: `;
    doc.setFont('times', 'bold');
    const lw = doc.getTextWidth(lbl);
    doc.text(lbl, x, y);
    doc.setFont('times', 'normal');
    const lines = doc.splitTextToSize(value || '', Math.max(maxW - lw - 1, 30));
    doc.text(lines, x + lw, y);
    return doc.getTextDimensions(lines).h + 0.5;
};

// ─── Question field types ────────────────────────────────────────

interface QField {
    label: string;
    value: string;
    type?: 'text' | 'radio' | 'checkbox' | 'rating';
    options?: string[];
    /** If true, value rendered on same line as question number/title */
    primary?: boolean;
}

// ─── Measure question height (for page break calc) ──────────────

const INDENT = 8;       // width of the question-number column
const NUM_LINE_X_OFF = INDENT; // vertical separator x offset from CM

const measureQ = (doc: jsPDF, qText: string, fields: QField[], cw: number, showEmpty = false): number => {
    const innerW = cw - INDENT - BOX_PAD * 2;
    doc.setFontSize(9);

    const primary = fields.find(f => f.primary);
    const qLine = primary ? `${qText} ${primary.value || ''}` : qText;
    doc.setFont('times', 'bold');
    const qLines = doc.splitTextToSize(qLine, innerW);
    let h = doc.getTextDimensions(qLines).h + 1;

    doc.setFontSize(8);
    for (const f of fields) {
        if (f.primary) continue;
        if (f.type === 'radio' || f.type === 'checkbox' || f.type === 'rating') {
            h += 4.5;
        } else {
            if (!showEmpty && (!f.value || !f.value.trim())) continue;
            doc.setFont('times', 'bold');
            const lbl = `${f.label}: `;
            const lw = doc.getTextWidth(lbl);
            doc.setFont('times', 'normal');
            if (f.value && f.value.trim()) {
                const vLines = doc.splitTextToSize(f.value, innerW - lw);
                h += doc.getTextDimensions(vLines).h + 1;
            } else {
                h += 4; // just the label line
            }
        }
    }
    return h + BOX_PAD * 2;
};

// ─── Draw a single question inside its grid box ─────────────────
// Returns the y position after the question (bottom of the box)

const drawQ = (doc: jsPDF, num: string, qText: string, fields: QField[], boxTop: number, cw: number, showEmpty = false): number => {
    const numX = CM + BOX_PAD;                       // question number x
    const contentX = CM + INDENT + BOX_PAD;          // content column x (after vertical separator)
    const contentW = cw - INDENT - BOX_PAD * 2;      // content column width
    let y = boxTop + BOX_PAD;

    const primary = fields.find(f => f.primary);

    // Question number in left column
    doc.setFontSize(9); doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
    doc.text(`${num}.`, numX, y);

    // Question text + primary value in right column
    if (primary && primary.value) {
        const qLabel = `${qText} `;
        doc.text(qLabel, contentX, y);
        const qlW = doc.getTextWidth(qLabel);
        doc.setFont('times', 'normal');
        const valLines = doc.splitTextToSize(primary.value, contentW - qlW);
        doc.text(valLines, contentX + qlW, y);
        y += doc.getTextDimensions(valLines).h + 0.5;
    } else {
        const qLines = doc.splitTextToSize(qText, contentW);
        doc.text(qLines, contentX, y);
        y += doc.getTextDimensions(qLines).h + 0.5;
    }

    // Sub-fields (all in content column)
    doc.setFontSize(8);
    for (const f of fields) {
        if (f.primary) continue;

        if ((f.type === 'radio' || f.type === 'rating') && f.options) {
            doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
            const lbl = `${f.label}: `;
            doc.text(lbl, contentX, y);
            drawRadio(doc, f.value, f.options, contentX + doc.getTextWidth(lbl), y);
            y += 4.5;
        } else if (f.type === 'checkbox' && f.options) {
            doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
            const lbl = `${f.label}: `;
            doc.text(lbl, contentX, y);
            const sel = f.value ? f.value.split('||') : [];
            drawCheckbox(doc, sel, f.options, contentX + doc.getTextWidth(lbl), y);
            y += 4.5;
        } else {
            if (!showEmpty && (!f.value || !f.value.trim())) continue;
            doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
            const lbl = `${f.label}: `;
            const lw = doc.getTextWidth(lbl);
            doc.text(lbl, contentX, y);
            if (f.value && f.value.trim()) {
                doc.setFont('times', 'normal');
                const vLines = doc.splitTextToSize(f.value, contentW - lw);
                doc.text(vLines, contentX + lw, y);
                y += doc.getTextDimensions(vLines).h + 1;
            } else {
                y += 4; // just the label, no value
            }
        }
    }

    y += BOX_PAD;
    return y;
};

// ─── Draw grid box border around a question ──────────────────────

const drawQBox = (doc: jsPDF, top: number, bottom: number, cw: number) => {
    doc.setDrawColor(...GREY_LINE); doc.setLineWidth(LW_GRID);
    // Left, right vertical lines + bottom horizontal line
    // Top line is either the section bar or the previous question's bottom
    doc.line(CM, top, CM, bottom);           // left
    doc.line(CM + cw, top, CM + cw, bottom); // right
    doc.line(CM, bottom, CM + cw, bottom);   // bottom
};

// ─── Render list of questions with grid boxes around each ────────

const renderQs = async (
    doc: jsPDF,
    data: IogcLeaseAuditData,
    qs: { num: string; text: string; fields: QField[] }[],
    startY: number,
    cw: number,
    maxY: number,
    newPageFn: () => Promise<number>,
    footerFn: (d: jsPDF, dd: IogcLeaseAuditData) => void,
    subHeaders?: { beforeQ: string; title: string }[],
    showEmpty = false
): Promise<number> => {
    let cy = startY;

    // Draw top border line for the first question
    doc.setDrawColor(...GREY_LINE); doc.setLineWidth(LW_GRID);
    doc.line(CM, cy, CM + cw, cy);

    for (let i = 0; i < qs.length; i++) {
        const q = qs[i];

        // Sub-header before this question?
        if (subHeaders) {
            const sh = subHeaders.find(s => s.beforeQ === q.num);
            if (sh) {
                // Close box walls up to here, then draw sub-header
                if (cy + 14 > maxY) {
                    footerFn(doc, data);
                    cy = await newPageFn();
                    doc.setDrawColor(...GREY_LINE); doc.setLineWidth(LW_GRID);
                    doc.line(CM, cy, CM + cw, cy);
                }
                cy = drawSubHeader(doc, sh.title, cy, cw);
                // New top line after sub-header
                doc.setDrawColor(...GREY_LINE); doc.setLineWidth(LW_GRID);
                doc.line(CM, cy, CM + cw, cy);
            }
        }

        // Check if question fits on page
        const estH = measureQ(doc, `${q.num}. ${q.text}`, q.fields, cw, showEmpty);
        if (cy + estH > maxY) {
            // Draw side walls + number separator to bottom of content area before page break
            doc.setDrawColor(...GREY_LINE); doc.setLineWidth(LW_GRID);
            doc.line(CM, startY, CM, cy);
            doc.line(CM + INDENT, startY, CM + INDENT, cy);  // number separator
            doc.line(CM + cw, startY, CM + cw, cy);
            footerFn(doc, data);
            cy = await newPageFn();
            startY = cy;
            // Top line on new page
            doc.setDrawColor(...GREY_LINE); doc.setLineWidth(LW_GRID);
            doc.line(CM, cy, CM + cw, cy);
        }

        const boxTop = cy;
        cy = drawQ(doc, q.num, q.text, q.fields, boxTop, cw, showEmpty);

        // Draw bottom border of this question box
        doc.setDrawColor(...GREY_LINE); doc.setLineWidth(LW_GRID);
        doc.line(CM, cy, CM + cw, cy);
    }

    // Draw side walls + number separator for the entire section
    doc.setDrawColor(...GREY_LINE); doc.setLineWidth(LW_GRID);
    doc.line(CM, startY, CM, cy);
    doc.line(CM + INDENT, startY, CM + INDENT, cy);  // number separator
    doc.line(CM + cw, startY, CM + cw, cy);

    return cy;
};

// ═══════════════════════════════════════════════════════════════════
// Main PDF Generator
// ═══════════════════════════════════════════════════════════════════

export const generateIogcPdf = async (
    data: IogcLeaseAuditData,
    onStatus?: (msg: string) => void
): Promise<{ blob: Blob; filename: string }> => {
    onStatus?.('Generating PDF...');

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'letter' });
    const { pw, ph, cw, maxY } = getPageDims(doc);
    const c = data.cover;

    // Pre-load images
    onStatus?.('Loading images...');
    const [logoBase64, bisonBase64, thunderchildBase64] = await Promise.all([
        loadImageAsBase64('xterra-logo.jpg'),
        loadImageAsBase64('bison1.jpg'),
        loadImageAsBase64('thunderchild-logo.jpg'),
    ]);

    // Footer closure for non-cover pages (no logo, just info line)
    const drawFooter = (d: jsPDF, dd: IogcLeaseAuditData) => _drawFooterBase(d, dd);

    let sectionStartY = 0; // Track for side walls across pages

    const newPage = async (): Promise<number> => {
        doc.addPage();
        drawCompanyHeader(doc);
        return CM + 8;
    };

    const ensureSpace = async (needed: number, curY: number): Promise<number> => {
        if (curY + needed > maxY) {
            drawFooter(doc, data);
            return await newPage();
        }
        return curY;
    };

    // ══════════════════════════════════════════════════════════════
    // PAGE 1: TITLE PAGE
    // ══════════════════════════════════════════════════════════════
    onStatus?.('Drawing title page...');

    // Logo at top left
    if (logoBase64) {
        doc.addImage(logoBase64, 'JPEG', CM, CM, 45, 12);
    } else {
        drawCompanyHeader(doc);
    }

    let y = CM + 4;

    // "A THUNDERCHILD ENERGY SERVICES COMPANY" centered
    doc.setFontSize(7); doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
    doc.text('A THUNDERCHILD ENERGY SERVICES COMPANY', pw / 2, y, { align: 'center' });
    y += 8;

    // Title text — larger
    doc.setFontSize(16); doc.setFont('times', 'bold'); doc.setTextColor(...TEAL);
    doc.text('Indian Oil and Gas Canada (IOGC)', pw / 2, y, { align: 'center' }); y += 8;
    doc.text('Surface Lease Environmental Audit', pw / 2, y, { align: 'center' }); y += 12;
    doc.setTextColor(...BLACK);

    // Compliance summary — larger
    doc.setFontSize(12); doc.setFont('times', 'bold');
    doc.text(`LESSEE: ${c.complianceStatus === 'In Compliance' ? 'Is in compliance' : 'Is not in compliance'}`, pw / 2, y, { align: 'center' });
    y += 6;

    if (data.sectionE.q46Comments) {
        doc.setFontSize(10); doc.setFont('times', 'normal');
        const sl = doc.splitTextToSize(data.sectionE.q46Comments, cw - 20);
        doc.text(sl, pw / 2, y, { align: 'center' });
        y += doc.getTextDimensions(sl).h + 6;
    } else { y += 6; }

    // Info fields — larger font
    const titleFields: [string, string][] = [
        ['IOGC File #', c.iogcFileNumber],
        ['X-Terra File #', data.projectNumber],
        ['Reserve Name and Number', c.reserveNameNumber],
        ['Lessee Name', c.lesseeName],
        ['Surface Location', c.legalLocation || data.location],
        ['Spud Date', c.wellSpudDate],
        ['Audit Date', c.auditDate],
        ['Follow Up Date', data.followUpDate],
        ['Report Date', data.reportDate],
        ['Report Written By', data.reportWrittenBy],
        ['File Review and Report Professional Sign Off', data.professionalSignOff],
    ];
    for (const [lbl, val] of titleFields) {
        y += drawLV(doc, lbl, val, CM + 8, y, cw - 16, 11);
    }

    // Bison image — full width, edge-to-edge, anchored ABOVE footer
    // Sits below the info fields, extending to the edges, but stops before footer line
    if (bisonBase64) {
        const coverFooterTop = ph - BORDER - 18;  // where cover footer area starts
        const imgW = pw;                           // edge to edge
        const bisonStartY = Math.max(y + 4, ph * 0.55);
        const imgH = coverFooterTop - bisonStartY; // fill from start to footer
        if (imgH > 20) {
            doc.addImage(bisonBase64, 'JPEG', 0, bisonStartY, imgW, imgH);
        }
    }

    // Cover page footer: Thunderchild logo centered, company info on each side
    {
        const footerH = 18;                         // total footer height
        const footerTop = ph - BORDER - footerH;    // top of footer area
        const footerMidY = footerTop + footerH / 2; // vertical center

        // Thunderchild logo centered — maintain 1.91:1 aspect ratio
        if (thunderchildBase64) {
            const logoH = 16;
            const logoW = logoH * 1.91;  // ~30.5mm wide
            doc.addImage(thunderchildBase64, 'JPEG', (pw - logoW) / 2, footerMidY - logoH / 2, logoW, logoH);
        }

        // Left side: Saskatoon office — vertically centered in footer
        const lineH = 3;
        const textBlockH = lineH * 3;               // 3 lines
        const textStartY = footerMidY - textBlockH / 2 + lineH; // baseline of first line
        doc.setFontSize(7); doc.setFont('times', 'normal'); doc.setTextColor(80, 80, 80);
        doc.text('100 \u2013 303 Wheeler Place', CM, textStartY);
        doc.text('Saskatoon, SK  S7P 0A4', CM, textStartY + lineH);
        doc.text('Tel (306) 373-1110', CM, textStartY + lineH * 2);

        // Right side: Lloydminster office — vertically centered in footer
        doc.text('6208-48 Street', pw - CM, textStartY, { align: 'right' });
        doc.text('Lloydminster, AB  T9V 2G1', pw - CM, textStartY + lineH, { align: 'right' });
        doc.text('Tel (780) 875-1442', pw - CM, textStartY + lineH * 2, { align: 'right' });
        doc.setTextColor(...BLACK);
    }

    // ══════════════════════════════════════════════════════════════
    // PAGE 2: TABLE OF CONTENTS
    // ══════════════════════════════════════════════════════════════
    onStatus?.('Drawing table of contents...');
    y = await newPage(); y += 2;

    doc.setFontSize(12); doc.setFont('times', 'bold'); doc.setTextColor(...TEAL);
    const auditYear = c.auditDate ? new Date(c.auditDate).getFullYear() : new Date().getFullYear();
    doc.text(`${auditYear} AUDIT PACKAGE CONTENTS`, CM, y);
    doc.setTextColor(...BLACK); y += 10;

    const tocX1 = CM;        // main items
    const tocX2 = CM + 12;   // section letters
    const tocX3 = CM + 24;   // sub-items (dashes)
    const sANote = c.auditType === '1st Year' ? '' : ' \u2013 Not applicable';

    // 1.
    doc.setFontSize(10); doc.setFont('times', 'bold');
    doc.text('1.', tocX1, y);
    doc.text('IOGC SURFACE LEASE ENVIRONMENTAL AUDIT COVER SHEET', tocX1 + 8, y); y += 8;

    // 2.
    doc.text('2.', tocX1, y);
    doc.text('IOGC SURFACE LEASE ENVIRONMENTAL AUDIT', tocX1 + 8, y); y += 6;

    // Sections A-F
    doc.setFontSize(9);
    const tocSections: { letter: string; title: string; subs?: string[] }[] = [
        { letter: 'A', title: `FIRST YEAR (ONLY) ENVIRONMENTAL AUDIT REQUIREMENTS${sANote}` },
        { letter: 'B', title: 'VEGETATION MONITORING AND MANAGEMENT' },
        { letter: 'C', title: 'GENERAL HOUSE KEEPING', subs: ['General', 'Topography/Surface Drainage', 'Water Features/Waterbodies'] },
        { letter: 'D', title: 'ENVIRONMENTAL PROTECTION AND SAFETY', subs: ['Lease Access and Security', 'Chemical Storage and Containment', 'Spill Prevention, Response and Reporting', 'Emergency Response Plan (ERP) and Safety'] },
        { letter: 'E', title: 'OVERALL/SUMMARY ENVIRONMENTAL AUDIT' },
        { letter: 'F', title: 'ENVIRONMENTAL AUDIT ATTACHMENTS', subs: ['Copy of the IOGC Environmental Protection Terms Letter', 'Site Sketch and Survey', 'Site Photos', 'Follow Up Compliance Reporting \u2013 Photo Log'] },
    ];
    for (const sec of tocSections) {
        doc.setFont('times', 'bold');
        doc.text(`${sec.letter} \u2013 ${sec.title}`, tocX2, y);
        y += 5;
        if (sec.subs) {
            doc.setFont('times', 'normal');
            for (const sub of sec.subs) {
                doc.text(`-  ${sub}`, tocX3, y);
                y += 4.5;
            }
        }
    }
    y += 3;

    // 3.
    doc.setFont('times', 'bold'); doc.setFontSize(10);
    doc.text('3.', tocX1, y);
    doc.text('LIMITATIONS AND QUALIFICATIONS', tocX1 + 8, y);
    drawFooter(doc, data);

    // ══════════════════════════════════════════════════════════════
    // PAGE 3: COVER SHEET
    // ══════════════════════════════════════════════════════════════
    onStatus?.('Drawing cover sheet...');
    y = await newPage();

    doc.setFontSize(10); doc.setFont('times', 'bold'); doc.setTextColor(...TEAL);
    doc.text('1. INDIAN OIL AND GAS CANADA (IOGC) SURFACE LEASE ENVIRONMENTAL AUDIT COVER SHEET', CM, y, { maxWidth: cw });
    doc.setTextColor(...BLACK); y += 7;

    // ── Site Information ──
    {
        const { iy, ey } = drawCoverBox(doc, 'Site Information', CM, y, cw, 30);
        let fy = iy;
        const ix = CM + BOX_PAD + 1; const iw = cw - BOX_PAD * 2 - 2; const c3 = iw / 3;
        fy += drawLV(doc, 'IOGC File #', c.iogcFileNumber, ix, fy, c3, 8);
        // Same line for Legal Location and Province - draw at offset
        doc.setFontSize(8);
        drawLV(doc, 'Legal Location', c.legalLocation, ix + c3, iy, c3, 8);
        drawLV(doc, 'Province', c.province, ix + c3 * 2, iy, c3, 8);
        fy += drawLV(doc, 'Reserve Name and Number', c.reserveNameNumber, ix, fy, iw, 8);
        fy += drawLV(doc, 'Lessee Name', c.lesseeName, ix, fy, iw, 8);
        drawLV(doc, 'Well Spud Date', c.wellSpudDate, ix, fy, iw, 8);
        y = ey + 1;
    }

    // ── Site Status ──
    {
        const { iy, ey } = drawCoverBox(doc, 'Site Status', CM, y, cw, 7);
        drawRadio(doc, c.siteStatus, ['Active', 'Suspended', 'Abandoned', 'Active Reclamation', 'Not Built (Surveyed only)'], CM + BOX_PAD + 1, iy + 1);
        y = ey + 1;
    }

    // ── Type of Site ──
    {
        const { iy, ey } = drawCoverBox(doc, 'Type of Site', CM, y, cw, 16);
        let fy = iy;
        drawCheckbox(doc, c.siteTypes, ['Well Site', 'Access Road', 'Battery', 'Compressor', 'Produced Water Disposal'], CM + BOX_PAD + 1, fy); fy += 4.5;
        drawCheckbox(doc, c.siteTypes, ['Pipeline', 'Riser', 'Other'], CM + BOX_PAD + 1, fy); fy += 5;
        drawCheckbox(doc, c.gasFlags, ['Gas', 'Sour Gas', 'Oil', 'Sour Oil', 'Remote Sump', 'Tanks', 'UST'], CM + BOX_PAD + 1, fy);
        y = ey + 1;
    }

    // ── Date + Audit Type ──
    {
        const { iy, ey } = drawCoverBox(doc, 'Date of Environmental Audit Site Inspection', CM, y, cw, 12);
        let fy = iy;
        doc.setFont('times', 'normal'); doc.setFontSize(9);
        doc.text(c.auditDate || '', CM + BOX_PAD + 1, fy); fy += 4.5;
        doc.setFont('times', 'bold'); doc.setFontSize(8);
        doc.text('Audit Type:', CM + BOX_PAD + 1, fy);
        drawRadio(doc, c.auditType, ['1st Year', '2nd Year (Pipeline)', '3 Year', '5 Year', '10 Year (Pipeline)'], CM + BOX_PAD + 22, fy);
        y = ey + 1;
    }

    // ── Copy sent to FN ──
    {
        const { iy, ey } = drawCoverBox(doc, 'Copy of Environmental Audit sent to the First Nation', CM, y, cw, 6);
        drawRadio(doc, c.copySentToFirstNation, ['Yes', 'No'], CM + BOX_PAD + 1, iy + 1);
        y = ey + 1;
    }

    // ── Report Addresses ──
    y = await ensureSpace(50, y);
    {
        const rows: [string, string][] = [
            ['All lease facilities including access road, associated borrow pits, and/or sumps', c.reportAddressesFacilities],
            ['Vegetation Monitoring and Management (B)', c.reportAddressesVegetation],
            ['General Housekeeping (C)', c.reportAddressesHousekeeping],
            ['Environmental Protection and Safety (D)', c.reportAddressesProtection],
            ['Overall/Summary Environmental Audit Requirements (E)', c.reportAddressesSummary],
            ['Review of compliance with IOGC Environmental Protection Terms Letter', c.reportAddressesTermsReview],
        ];
        const rH = 4.5; const cH = rows.length * rH + BOX_PAD;
        const { iy, ey } = drawCoverBox(doc, 'Report Addresses the Following', CM, y, cw, cH);
        let fy = iy;
        for (let i = 0; i < rows.length; i++) {
            drawLabelRadioRight(doc, rows[i][0], rows[i][1], ['Included', 'Not Included'], CM + BOX_PAD + 1, fy, cw - BOX_PAD * 2 - 2);
            fy += rH;
            if (i < rows.length - 1) {
                doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.1);
                doc.line(CM + 1, fy - 2, CM + cw - 1, fy - 2);
            }
        }
        y = ey + 1;
    }

    // ── Attachments ──
    y = await ensureSpace(30, y);
    {
        const rows: [string, string][] = [
            ['Copy of IOGC Environmental Protection Terms Letter', c.attachTermsLetter],
            ['Site sketch and survey (includes all structures)', c.attachSiteSketch],
            ['Site Photos', c.attachSitePhotos],
            ['Follow Up Compliance Reporting \u2013 Photo Log', c.attachFollowUp],
        ];
        const rH = 4.5; const cH = rows.length * rH + BOX_PAD;
        const { iy, ey } = drawCoverBox(doc, 'Attachments', CM, y, cw, cH);
        let fy = iy;
        for (let i = 0; i < rows.length; i++) {
            drawLabelRadioRight(doc, rows[i][0], rows[i][1], ['Included', 'Not Included'], CM + BOX_PAD + 1, fy, cw - BOX_PAD * 2 - 2);
            fy += rH;
            if (i < rows.length - 1) {
                doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.1);
                doc.line(CM + 1, fy - 2, CM + cw - 1, fy - 2);
            }
        }
        y = ey + 1;
    }

    // ── Compliance ──
    y = await ensureSpace(28, y);
    {
        const { iy, ey } = drawCoverBox(doc, 'Compliance', CM, y, cw, 20);
        let fy = iy;
        drawRadio(doc, c.complianceStatus, ['In Compliance', 'Not in Compliance'], CM + BOX_PAD + 1, fy); fy += 4.5;
        doc.setFontSize(7); doc.setFont('times', 'normal');
        doc.text('\u2013 Summary of non-compliance issues included or N/A', CM + BOX_PAD + 55, fy - 1);
        doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.1);
        doc.line(CM + 1, fy, CM + cw - 1, fy); fy += 1;
        drawLabelRadioRight(doc, 'Recommendation(s) on how to bring site into compliance', c.recommendationsIncluded, ['included', 'N/A'], CM + BOX_PAD + 1, fy + 1, cw - BOX_PAD * 2 - 2); fy += 4.5;
        doc.line(CM + 1, fy, CM + cw - 1, fy); fy += 1;
        drawLabelRadioRight(doc, 'Description and documentation of how site has been brought into compliance', c.complianceDescriptionIncluded, ['included', 'not included', 'N/A'], CM + BOX_PAD + 1, fy + 1, cw - BOX_PAD * 2 - 2);
        y = ey + 1;
    }

    // ── Professional Declaration ──
    y = await ensureSpace(22, y);
    {
        const { iy, ey } = drawCoverBox(doc, 'Professional Declaration', CM, y, cw, 14);
        let fy = iy + 2;
        const sx = CM + BOX_PAD + 1; const sw = (cw - BOX_PAD * 2 - 2) / 3;
        doc.setDrawColor(...BLACK); doc.setLineWidth(0.2);
        doc.line(sx, fy, sx + sw - 3, fy);
        doc.line(sx + sw, fy, sx + sw * 2 - 3, fy);
        doc.line(sx + sw * 2, fy, sx + sw * 3, fy);
        fy += 3.5;
        doc.setFontSize(8); doc.setFont('times', 'normal');
        doc.text(c.declarationName || '', sx + sw + 2, fy);
        doc.text(c.declarationDate || '', sx + sw * 2 + 2, fy); fy += 3;
        doc.setFontSize(7); doc.setFont('times', 'italic'); doc.setTextColor(100, 100, 100);
        doc.text('Signature', sx + (sw - 3) / 2, fy, { align: 'center' });
        doc.text('Name and Professional Designation', sx + sw + (sw - 3) / 2, fy, { align: 'center' });
        doc.text('Date', sx + sw * 2 + sw / 2, fy, { align: 'center' });
        doc.setTextColor(...BLACK);
        y = ey;
    }
    drawFooter(doc, data);

    // ══════════════════════════════════════════════════════════════
    // SECTION PAGES — common header for audit sections
    // ══════════════════════════════════════════════════════════════

    const startSectionPage = async (): Promise<number> => {
        let sy = await newPage();
        doc.setFontSize(10); doc.setFont('times', 'bold'); doc.setTextColor(...TEAL);
        doc.text('2. INDIAN OIL AND GAS CANADA (IOGC) SURFACE LEASE ENVIRONMENTAL AUDIT', CM, sy, { maxWidth: cw });
        doc.setTextColor(...BLACK); sy += 7;

        // Site info line
        doc.setFontSize(8); doc.setFont('times', 'bold');
        doc.text('Site Information', CM, sy); sy += 3.5;
        const c3 = cw / 3;
        drawLV(doc, 'IOGC File #', c.iogcFileNumber, CM, sy, c3, 8);
        drawLV(doc, 'Legal Location', c.legalLocation, CM + c3, sy, c3, 8);
        drawLV(doc, 'Province', c.province, CM + c3 * 2, sy, c3, 8);
        sy += 4;
        drawLV(doc, 'Reserve Name and Number', c.reserveNameNumber, CM, sy, cw, 8);
        sy += 4;
        doc.setDrawColor(...TEAL); doc.setLineWidth(0.5);
        doc.line(CM, sy, CM + cw, sy); sy += 2;

        doc.setFontSize(7); doc.setFont('times', 'italic'); doc.setTextColor(100, 100, 100);
        doc.text('*First year environmental audits should include Sections A-F.', CM, sy); sy += 3;
        doc.text('*Subsequent year environmental audits should include Sections B-F.', CM, sy);
        doc.setTextColor(...BLACK); sy += 5;
        return sy;
    };

    const contPage = async (): Promise<number> => await newPage();

    // ══════════════════════════════════════════════════════════════
    // SECTION A — Always shown; populated for 1st Year, empty with
    //             note for other audit types
    // ══════════════════════════════════════════════════════════════
    onStatus?.('Drawing Section A...');
    y = await startSectionPage();

    {
        const is1stYear = data.cover.auditType === '1st Year';
        y = drawSectionBar(doc, 'A \u2013 FIRST YEAR (ONLY) ENVIRONMENTAL AUDIT REQUIREMENTS', y, cw);

        // Note for non-1st-year audits
        if (!is1stYear) {
            doc.setFontSize(8); doc.setFont('times', 'italic'); doc.setTextColor(100, 100, 100);
            doc.text('*Section A applies to First Year audits only.', CM + BOX_PAD, y + 3);
            doc.setTextColor(...BLACK);
            y += 6;
        }

        // Use real data for 1st Year, empty strings for others
        const sa = data.sectionA;
        const v = (val: string) => is1stYear ? val : '';
        const va = (arr: string[]) => is1stYear ? arr.join('||') : '';

        const qsA: { num: string; text: string; fields: QField[] }[] = [
            { num: '1', text: 'Environmental Monitor Required:', fields: [
                { label: 'Required', value: v(sa.q1EnvMonitorRequired), type: 'radio', options: ['Yes', 'No'] },
                { label: 'Name', value: v(sa.q1MonitorName) },
                { label: 'Company', value: v(sa.q1MonitorCompany) },
                { label: 'Start Construction Date', value: v(sa.q1StartConstructionDate) },
                { label: 'Lease Construction Methods', value: v(sa.q1ConstructionMethod), type: 'radio', options: ['Single lift', 'Two-lift', 'Minimal Disturbance', 'Other'] },
                { label: 'Other', value: v(sa.q1ConstructionMethodOther) },
                { label: 'Soil Handling Practices', value: v(sa.q1SoilHandling), type: 'radio', options: ['Satisfactory', 'Unsatisfactory'] },
                { label: 'Explain', value: v(sa.q1SoilHandlingExplain) },
                { label: 'Spud Date', value: v(sa.q1SpudDate) },
                { label: 'Setbacks and Timing Restrictions Maintained', value: v(sa.q1Setbacks) },
                { label: 'Federal Department Notification and Authorization', value: v(sa.q1FederalDept) },
                { label: 'Comments', value: v(sa.q1Comments) },
            ]},
            { num: '2', text: 'First Nations liaison/monitor:', fields: [
                { label: 'FN Liaison', value: v(sa.q2FnLiaison), type: 'radio', options: ['Yes', 'No'] },
                { label: 'Name', value: v(sa.q2LiaisonName) },
                { label: 'Cultural sites identified', value: v(sa.q2CulturalSites) },
                { label: 'Comments', value: v(sa.q2Comments) },
            ]},
            { num: '3', text: 'Wildlife/Vegetation survey completed:', fields: [
                { label: 'Survey', value: v(sa.q3WildlifeSurvey), type: 'radio', options: ['Yes', 'No'] },
                { label: 'Comments', value: v(sa.q3Comments) },
            ]},
            { num: '4', text: 'Additional mitigation measures required:', fields: [
                { label: 'Required', value: v(sa.q4AdditionalMitigation), type: 'radio', options: ['Yes', 'No'] },
                { label: 'Comments', value: v(sa.q4Comments) },
            ]},
            { num: '5', text: 'Fence Alterations:', fields: [
                { label: 'Alterations', value: v(sa.q5FenceAlterations), type: 'radio', options: ['Yes', 'No'] },
                { label: 'Comments', value: v(sa.q5Comments) },
            ]},
            { num: '6', text: 'Water well testing:', fields: [
                { label: 'Testing', value: v(sa.q6WaterWellTesting), type: 'radio', options: ['Yes', 'No'] },
                { label: 'Results included', value: v(sa.q6ResultsIncluded), type: 'radio', options: ['Yes', 'No'] },
                { label: 'Comments', value: v(sa.q6Comments) },
            ]},
            { num: '7', text: 'Drilling Waste Disposal:', fields: [
                { label: 'Location', value: v(sa.q7WasteLocation), type: 'radio', options: ['On-site', 'Off-site'] },
                { label: 'Reserve', value: v(sa.q7ReserveLocation), type: 'radio', options: ['On-Reserve', 'Off-Reserve'] },
                { label: 'Compliance with provincial regulations', value: v(sa.q7ComplianceWithRegs), type: 'radio', options: ['Yes', 'No'] },
                { label: 'Mud Type', value: v(sa.q7MudType) },
                { label: 'Sump Type', value: v(sa.q7SumpType) },
                { label: 'Disposal Method', value: va(sa.q7DisposalMethods), type: 'checkbox', options: ['Earth Pit', 'Sump', 'Remote Earth Pit', 'Landspray-While Drilling', 'Landspreading', 'Mix-Bury-Cover', 'Remote Sump', 'Other'] },
                { label: 'Remote Sump OS #', value: v(sa.q7RemoteSumpOS) },
                { label: 'Comments', value: v(sa.q7Comments) },
            ]},
            { num: '8', text: 'Landspray on Reserve:', fields: [
                { label: 'Landspray on Reserve', value: v(sa.q8LandsprayOnReserve), type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Report Attached', value: v(sa.q8ReportAttached), type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Meets Criteria', value: v(sa.q8MeetsCriteria), type: 'radio', options: ['Yes', 'No', 'N/A'] },
            ]},
            { num: '9', text: 'Timber Management:', fields: [
                { label: 'Methods', value: va(sa.q9TimberMethods), type: 'checkbox', options: ['Rollback', 'Burning', 'Distribution of salvage', 'Salvage or cut', 'Rolled back of leaning/scarred trees', 'Mulched', 'Other'] },
                { label: 'Notification of FN', value: v(sa.q9FnNotification), type: 'radio', options: ['Yes', 'No', 'N/A'] },
            ]},
            { num: '10', text: 'Progressive Reclamation/Interim Clean-up:', fields: [
                { label: 'Progressive Reclamation', value: v(sa.q10ProgressiveReclamation), type: 'radio', options: ['Yes', 'No'] },
                { label: 'Slopes Contoured to surrounding area', value: v(sa.q10SlopesContoured), type: 'radio', options: ['Yes', 'No'] },
                { label: 'Soils re-spread over non-use portion of Lease', value: v(sa.q10SoilsRespread), type: 'radio', options: ['Yes', 'No'] },
                { label: 'Method of vegetation establishment', value: v(sa.q10VegetationMethod) },
                { label: 'Certified Seed analysis obtained', value: v(sa.q10CertifiedSeed), type: 'radio', options: ['Yes', 'No'] },
                { label: 'Vegetation establishment', value: v(sa.q10VegetationEstablishment), type: 'rating', options: ['Excellent', 'Good', 'Fair', 'Poor'] },
                { label: 'Comments', value: v(sa.q10Comments) },
            ]},
            { num: '11', text: 'Construction related equipment, materials, and waste removed and site generally cleaned up:', fields: [
                { label: 'Cleaned up', value: v(sa.q11ConstructionCleanup), type: 'radio', options: ['Yes', 'No', 'N/A'] },
                { label: 'Comments', value: v(sa.q11Comments) },
            ]},
        ];
        // showEmpty=true so all field labels render even when values are blank
        y = await renderQs(doc, data, qsA, y, cw, maxY, contPage, drawFooter, undefined, !is1stYear);
    }
    drawFooter(doc, data);

    // ══════════════════════════════════════════════════════════════
    // SECTION B
    // ══════════════════════════════════════════════════════════════
    onStatus?.('Drawing Section B...');
    {
        y = await contPage();
        y = drawSectionBar(doc, 'B \u2013 VEGETATION MONITORING AND MANAGEMENT', y, cw);
        const sb = data.sectionB;

        y = await renderQs(doc, data, [
            { num: '12', text: 'Weed List:', fields: [
                { label: 'Weed List', value: sb.q12WeedList, primary: true },
                { label: 'Comments', value: sb.q12Comments },
            ]},
            { num: '13', text: 'Vegetation Status:', fields: [
                { label: 'Vegetation Status', value: sb.q13VegetationStatus, primary: true },
                { label: 'Stressed vegetation on-site or off-site', value: sb.q13StressedVegetation },
                { label: 'Bare spots on-site or off-site', value: sb.q13BareSpots },
                { label: 'Comments', value: sb.q13Comments },
            ]},
            { num: '14', text: 'Weed Monitoring Plan:', fields: [
                { label: 'Weed Monitoring Plan', value: sb.q14WeedMonitoringPlan, primary: true },
                { label: 'Weed control strategies', value: sb.q14WeedControlStrategies },
                { label: 'Ongoing inspections for weed species', value: sb.q14OngoingInspections },
                { label: 'Compliant with provincial regulations', value: sb.q14CompliantWithRegs },
                { label: 'Comments', value: sb.q14Comments },
            ]},
        ], y, cw, maxY, contPage, drawFooter);
        drawFooter(doc, data);
    }

    // ══════════════════════════════════════════════════════════════
    // SECTION C
    // ══════════════════════════════════════════════════════════════
    onStatus?.('Drawing Section C...');
    {
        y = await contPage();
        y = drawSectionBar(doc, 'C \u2013 GENERAL HOUSEKEEPING', y, cw);
        const sc = data.sectionC;

        y = await renderQs(doc, data, [
            { num: '15', text: 'Activity:', fields: [
                { label: 'Activity', value: sc.q15Activity, primary: true },
                { label: 'Comments', value: sc.q15Comments },
            ]},
            { num: '16', text: 'Landuse:', fields: [
                { label: 'Landuse', value: sc.q16Landuse, primary: true },
                { label: 'Comments', value: sc.q16Comments },
            ]},
            { num: '17', text: 'Access Road Conditions:', fields: [
                { label: 'Access Road Conditions', value: sc.q16AccessRoadConditions, primary: true },
                { label: 'Low spots/slumping', value: sc.q17LowSpotsSlumping },
                { label: 'Rutting', value: sc.q17Rutting },
                { label: 'Lease accessibility', value: sc.q17LeaseAccessibility },
                { label: 'Comments', value: sc.q17Comments },
            ]},
            { num: '18', text: 'Traffic:', fields: [
                { label: 'Traffic', value: sc.q18Traffic, primary: true },
                { label: 'Comments', value: sc.q18Comments },
            ]},
            { num: '19', text: 'Lease Berm Condition:', fields: [
                { label: 'Lease Berm Condition', value: sc.q19LeaseBermCondition, primary: true },
                { label: 'Comments', value: sc.q19Comments },
            ]},
            { num: '20', text: 'Flare Stack:', fields: [
                { label: 'Flare Stack', value: sc.q20FlareStack, primary: true },
                { label: 'Comments', value: sc.q20Comments },
            ]},
            { num: '21', text: 'Odour Detection:', fields: [
                { label: 'Odour Detection', value: sc.q21OdourDetection, primary: true },
                { label: 'Comments', value: sc.q21Comments },
            ]},
            { num: '22', text: 'Unused equipment, supplies removed:', fields: [
                { label: 'Unused equipment removed', value: sc.q22UnusedEquipmentRemoved, primary: true },
                { label: 'Felled trees/log decks removed', value: sc.q22FelledTreesRemoved },
                { label: 'Comments', value: sc.q22Comments },
            ]},
            { num: '23', text: 'Garbage/Debris Disposal and/or Control:', fields: [
                { label: 'Garbage/Debris', value: sc.q23GarbageDebris, primary: true },
                { label: 'Comments', value: sc.q23Comments },
            ]},
            { num: '24', text: 'Reported complaints:', fields: [
                { label: 'Reported complaints', value: sc.q24ReportedComplaints, primary: true },
                { label: 'Investigated and follow-up actions', value: sc.q24Investigated },
                { label: 'Comments', value: sc.q24Comments },
            ]},
            { num: '25', text: 'Drainage:', fields: [
                { label: 'Drainage', value: sc.q25Drainage, primary: true },
                { label: 'Ponding on-site', value: sc.q25Ponding },
                { label: 'Aquatic vegetation present on-site', value: sc.q25AquaticVegetation },
                { label: 'Comments', value: sc.q25Comments },
            ]},
            { num: '26', text: 'Pump-off of Excess Water:', fields: [
                { label: 'Pump-off', value: sc.q26PumpOff, primary: true },
                { label: 'Frequency', value: sc.q26Frequency },
                { label: 'Comments', value: sc.q26Comments },
            ]},
            { num: '27', text: 'Erosion:', fields: [
                { label: 'Erosion', value: sc.q26Erosion, primary: true },
                { label: 'Effectiveness of erosion control', value: sc.q27ErosionControl },
                { label: 'Comments', value: sc.q27Comments },
            ]},
            { num: '28', text: 'Waterbodies:', fields: [
                { label: 'Waterbodies', value: sc.q28Waterbodies, primary: true },
                { label: 'Distance from boundary of lease', value: sc.q28Distance },
                { label: 'Approximate area', value: sc.q28Area },
                { label: 'Buffer present', value: sc.q28Buffer },
                { label: 'Mitigation', value: sc.q28Mitigation },
                { label: 'Comments', value: sc.q28Comments },
            ]},
            { num: '29', text: 'Permits/Authorization:', fields: [
                { label: 'Permits/Authorization', value: sc.q29PermitsAuthorization, primary: true },
                { label: 'Any ongoing permits or authorizations received', value: sc.q29OngoingPermits },
                { label: 'Comments', value: sc.q29Comments },
            ]},
        ], y, cw, maxY, contPage, drawFooter, [
            { beforeQ: '15', title: 'General' },
            { beforeQ: '25', title: 'Topography/Surface Drainage' },
            { beforeQ: '28', title: 'Water Features/Waterbodies' },
        ]);
        drawFooter(doc, data);
    }

    // ══════════════════════════════════════════════════════════════
    // SECTION D
    // ══════════════════════════════════════════════════════════════
    onStatus?.('Drawing Section D...');
    {
        y = await contPage();
        y = drawSectionBar(doc, 'D \u2013 ENVIRONMENTAL PROTECTION AND SAFETY', y, cw);
        const sd = data.sectionD;

        y = await renderQs(doc, data, [
            { num: '30', text: 'Signage:', fields: [
                { label: 'Signage', value: sd.q30Signage, primary: true },
                { label: 'Visible', value: sd.q30Visible },
                { label: 'Legible', value: sd.q30Legible },
                { label: '1-800 #/24 Hour #', value: sd.q30Hotline },
                { label: 'Comments', value: sd.q30Comments },
            ]},
            { num: '31', text: 'Lease/Access Road Fencing:', fields: [
                { label: 'Fencing', value: sd.q31Fencing, primary: true },
                { label: 'Human restriction', value: sd.q31HumanRestriction },
                { label: 'Livestock restriction', value: sd.q31LivestockRestriction },
                { label: 'Properly maintained', value: sd.q31Maintained },
                { label: 'Condition of Texas gate', value: sd.q31TexasGateCondition },
                { label: 'Comments', value: sd.q31Comments },
            ]},
            { num: '32', text: 'Culverts:', fields: [
                { label: 'Culverts', value: sd.q32Culverts, primary: true },
                { label: 'Properly installed', value: sd.q32ProperlyInstalled },
                { label: 'Correct size', value: sd.q32CorrectSize },
                { label: 'Properly maintained/functioning', value: sd.q32ProperlyMaintained },
                { label: 'Comments', value: sd.q32Comments },
            ]},
            { num: '33', text: 'Surface Casing Vent:', fields: [
                { label: 'Surface Casing Vent', value: sd.q33SurfaceCasingVent, primary: true },
                { label: 'Open/Closed', value: sd.q33OpenClosed },
                { label: 'Proper above ground clearance', value: sd.q33Clearance },
                { label: 'Comments', value: sd.q33Comments },
            ]},
            { num: '34', text: 'Wellhead Valves:', fields: [
                { label: 'Wellhead Valves', value: sd.q34WellheadValves, primary: true },
                { label: 'Bull-Plugs present on outlets', value: sd.q34BullPlugs },
                { label: 'Comments', value: sd.q34Comments },
            ]},
            { num: '35', text: 'Chemicals Storage:', fields: [
                { label: 'Chemicals Storage', value: sd.q35ChemicalStorage, primary: true },
                { label: 'All chemical drums/tanks properly sealed', value: sd.q35Sealed },
                { label: 'All chemical drums/tanks have legible WHMIS label', value: sd.q35Whmis },
                { label: 'Stored according to MSDS', value: sd.q35Msds },
                { label: 'Comments', value: sd.q35Comments },
            ]},
            { num: '36', text: 'Tanks/Secondary Containment:', fields: [
                { label: 'Tanks', value: sd.q36Tanks, primary: true },
                { label: 'Tanks/Containment in good repair', value: sd.q36InGoodRepair },
                { label: 'Comments', value: sd.q36Comments },
            ]},
            { num: '37', text: 'Reportable spills:', fields: [
                { label: 'Reportable spills', value: sd.q37ReportableSpills, primary: true },
                { label: 'Date', value: sd.q37SpillDate },
                { label: 'Substance released', value: sd.q37Substance },
                { label: 'Volume released', value: sd.q37Volume },
                { label: 'First Nations and IOGC notified', value: sd.q37Notified },
                { label: 'Comments', value: sd.q37Comments },
            ]},
            { num: '38', text: 'Surface staining:', fields: [
                { label: 'Surface staining', value: sd.q38SurfaceStaining, primary: true },
                { label: 'On-site', value: sd.q38OnSite },
                { label: 'Off-site', value: sd.q38OffSite },
                { label: 'Comments', value: sd.q38Comments },
            ]},
            { num: '39', text: 'Emergency Response Plan (ERP):', fields: [
                { label: 'ERP', value: sd.q39Erp, primary: true },
                { label: 'ERP in place', value: sd.q39ErpInPlace },
                { label: 'Comments', value: sd.q39Comments },
            ]},
            { num: '40', text: 'ERP exercise last conducted (for H2S sites):', fields: [
                { label: 'Exercise', value: sd.q40ErpExercise, primary: true },
                { label: 'Date', value: sd.q40Date },
                { label: 'Comments', value: sd.q40Comments },
            ]},
            { num: '41', text: 'Excavation Hazards:', fields: [
                { label: 'Hazards', value: sd.q41ExcavationHazards, primary: true },
                { label: 'Comments', value: sd.q41Comments },
            ]},
        ], y, cw, maxY, contPage, drawFooter, [
            { beforeQ: '30', title: 'Lease Access and Security' },
            { beforeQ: '35', title: 'Chemical Storage and Containment' },
            { beforeQ: '37', title: 'Spill Prevention, Response and Reporting' },
            { beforeQ: '39', title: 'Emergency Response Plan (ERP) and Safety' },
        ]);
        drawFooter(doc, data);
    }

    // ══════════════════════════════════════════════════════════════
    // SECTION E
    // ══════════════════════════════════════════════════════════════
    onStatus?.('Drawing Section E...');
    {
        y = await contPage();
        y = drawSectionBar(doc, 'E \u2013 OVERALL/SUMMARY ENVIRONMENTAL AUDIT', y, cw);
        const se = data.sectionE;

        y = await renderQs(doc, data, [
            { num: '42', text: 'IOGC Terms:', fields: [
                { label: 'IOGC Terms', value: se.q42IogcTerms, primary: true },
                { label: 'Comments', value: se.q42Comments },
            ]},
            { num: '43', text: 'Other Regulations:', fields: [
                { label: 'Other Regulations', value: se.q43OtherRegulations, primary: true },
                { label: 'Comments', value: se.q43Comments },
            ]},
            { num: '44', text: 'Summary of lease non-compliance:', fields: [
                { label: 'Comments', value: se.q44SummaryNonCompliance },
            ]},
            { num: '45', text: 'Non-compliance follow-up:', fields: [
                { label: 'Comments', value: se.q45NonComplianceFollowUp },
            ]},
            { num: '46', text: 'Overall lease compliance:', fields: [
                { label: 'Overall compliance', value: se.q46OverallCompliance, primary: true },
                { label: 'Comments', value: se.q46Comments },
            ]},
        ], y, cw, maxY, contPage, drawFooter);
        drawFooter(doc, data);
    }

    // ══════════════════════════════════════════════════════════════
    // SECTION F
    // ══════════════════════════════════════════════════════════════
    onStatus?.('Drawing Section F...');
    {
        y = await contPage();
        y = drawSectionBar(doc, 'F \u2013 ENVIRONMENTAL AUDIT ATTACHMENTS', y, cw);

        const atts = [
            { num: '1', title: 'Copy of the IOGC Environmental Protection Terms Letter', desc: '' },
            { num: '2', title: 'Site Sketch and Survey', desc: 'Ensure the sketch or map includes the wellhead, sump, access road, surface facilities, tanks, berms, knockout tanks, secondary containment, topsoil piles, low areas, areas where surface water ponds, any equipment on lease, etc. Include distance scale, North orientation arrow, topological features, water features, vegetation including weeds, surrounding residences, or other features of importance.' },
            { num: '3', title: 'Site Photos', desc: 'The Audit must include captioned colour photographs. The location where the photographs were taken and the direction of the photographs should be included on a map or diagram. Ensure the following photos are included: wellhead, sump, access road, surface facilities, tanks, berms, knockout tanks, topsoil piles, low areas, areas where surface water ponds, any equipment on lease, etc.' },
            { num: '4', title: 'Follow-up Compliance Reporting', desc: 'For leases that had non-compliance issues, include photo documentation and description of corrective actions taken.' },
        ];

        // Draw as a bordered grid
        doc.setDrawColor(...GREY_LINE); doc.setLineWidth(LW_GRID);
        doc.line(CM, y, CM + cw, y); // top line

        for (const att of atts) {
            doc.setFontSize(8); doc.setFont('times', 'normal');
            const dl = att.desc ? doc.splitTextToSize(att.desc, cw - INDENT - BOX_PAD * 2) : [];
            const dH = att.desc ? doc.getTextDimensions(dl).h : 0;
            const blockH = 5 + dH + BOX_PAD * 2;
            y = await ensureSpace(blockH, y);

            const boxTop = y;
            y += BOX_PAD;
            doc.setFontSize(9); doc.setFont('times', 'bold'); doc.setTextColor(...BLACK);
            doc.text(`${att.num}. ${att.title}`, CM + BOX_PAD, y); y += 4;
            if (att.desc) {
                doc.setFont('times', 'normal'); doc.setFontSize(8);
                doc.text(dl, CM + BOX_PAD + INDENT, y);
                y += dH + 1;
            }
            y += BOX_PAD;

            // Box borders
            doc.setDrawColor(...GREY_LINE); doc.setLineWidth(LW_GRID);
            doc.line(CM, boxTop, CM, y);
            doc.line(CM + cw, boxTop, CM + cw, y);
            doc.line(CM, y, CM + cw, y);
        }
        drawFooter(doc, data);
    }

    // ══════════════════════════════════════════════════════════════
    // LIMITATIONS
    // ══════════════════════════════════════════════════════════════
    onStatus?.('Drawing Limitations...');
    {
        y = await contPage();
        doc.setFontSize(11); doc.setFont('times', 'bold'); doc.setTextColor(...TEAL);
        doc.text('3. LIMITATIONS AND QUALIFICATIONS', CM, y);
        doc.setTextColor(...BLACK); y += 8;

        doc.setFontSize(9); doc.setFont('times', 'normal');
        const txt = `This document is intended for the exclusive use of the company, organization, or individual for whom it has been prepared. X-Terra Environmental Services Ltd. (X-Terra) does not accept any responsibility to any third party for the use of information presented in this report, or decisions made or actions taken based on its content. Other than by the named client, copying or distribution of this report or use of or reliance on the information contained herein, in whole or in part, is not permitted without the expressed written permission of X-Terra. Nothing in this report is intended to constitute or provide a \u201Clegal opinion\u201D. In conducting the environmental audit, X-Terra has exercised reasonable skill, care, and diligence to assess the information acquired during the preparation of this report. No other representations, warranties or guarantees are made concerning the accuracy or completeness of the data or conclusions contained within this report, including no assurance that this assessment has uncovered all potential liabilities associated with the identified property. This report provides an assessment of environmental site conditions at the time of the environmental audit and was based on information obtained by and/or provided to X-Terra. Activities at the property subsequent to X-Terra\u2019s assessment may have significantly altered the property\u2019s condition. There is a potential for unknown, unidentified, or unforeseen surface and subsurface environmental conditions to be different than summarized within this report. There are no assurances regarding the accuracy and completeness of this information. All information received from the client or third parties in the preparation of this report has been assumed by X-Terra to be correct. X-Terra assumes no responsibility for any deficiency or inaccuracy in information received from others. Conclusions made within this report are a professional opinion at the time of the writing of this report, not a certification of the property\u2019s environmental condition. Any liability associated with the assessment is limited to the fees paid for the assessment and the final report.`;
        const tl = doc.splitTextToSize(txt, cw);
        doc.text(tl, CM, y);
        drawFooter(doc, data);
    }

    // ══════════════════════════════════════════════════════════════
    // PAGE NUMBERS
    // ══════════════════════════════════════════════════════════════
    const totalPages = (doc.internal as any).getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8); doc.setFont('times', 'normal'); doc.setTextColor(100, 100, 100);
        doc.text(`Page ${i} of ${totalPages}`, pw - BORDER, ph - BORDER + 6, { align: 'right' });
    }

    const sanitize = (n: string) => n.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
    const loc = c.legalLocation || data.location || '';
    const filename = `${sanitize(loc)}_${sanitize(c.iogcFileNumber) || 'audit'}_report.pdf`;
    return { blob: doc.output('blob'), filename };
};
