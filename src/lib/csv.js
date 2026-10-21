// CSV compatible con Excel: BOM, separador punto y coma y protección contra fórmulas.
export function downloadCsv(filename, headers, rows) {
  const cell = value => {
    let text = String(value ?? '');
    if (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const content = '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(';')).join('\r\n');
  downloadBlob(filename, new Blob([content], { type: 'text/csv;charset=utf-8' }));
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
