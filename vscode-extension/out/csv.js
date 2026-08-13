"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCsv = parseCsv;
exports.parseCsvContent = parseCsvContent;
const fs = require("fs");
// Splits one row respecting quoted fields, mirroring CSVParser.cs's column logic.
function splitRow(row) {
    const cols = [''];
    let i = 0;
    let quotes = 0;
    for (const c of row) {
        if (quotes % 2 === 0 && c === ',') {
            quotes = 0;
            cols.push('');
            i++;
            continue;
        }
        if (c === '"') {
            quotes++;
            if (quotes % 2 === 1 && quotes > 1)
                cols[i] += c;
            continue;
        }
        cols[i] += c;
    }
    return cols;
}
function parseCsv(path) {
    return parseCsvContent(fs.readFileSync(path, 'utf-8'));
}
function parseCsvContent(content) {
    const rows = content.split(/\r?\n/);
    const entries = [];
    for (const row of rows) {
        if (!row || row.startsWith('#') || row.startsWith('"#') || row.split('').every(c => c === ',' || c === '"')) {
            continue;
        }
        const cols = splitRow(row);
        const triggers = cols[1].split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
        const chain = [];
        for (let i = 2; i < cols.length - 1; i += 2) {
            const text = cols[i].trim();
            if (text)
                chain.push({ text, face: cols[i + 1].trim() || 'a' });
        }
        if (chain.length)
            entries.push({ triggers, chain });
    }
    return entries;
}
//# sourceMappingURL=csv.js.map