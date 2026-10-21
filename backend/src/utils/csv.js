// Cells starting with these characters are executed as formulas by Excel/Sheets
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function cell(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(columns, rows) {
  const header = columns.map((c) => cell(c.header)).join(',');
  const lines = rows.map((row) => columns.map((c) => cell(c.value(row))).join(','));
  return [header, ...lines].join('\n');
}

module.exports = { toCsv };
