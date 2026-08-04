export type ExportCell = string | number | null | undefined;

function escapeHtml(value: ExportCell) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function downloadExcelHtml(options: {
  filename: string;
  title: string;
  headers: string[];
  rows: ExportCell[][];
  summaryRows?: ExportCell[][];
}) {
  const summary = options.summaryRows?.length
    ? `<br/><table>${options.summaryRows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
        .join("")}</table>`
    : "";

  const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"/></head><body>
    <h2>${escapeHtml(options.title)}</h2>
    <table border="1">
      <thead><tr>${options.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${options.rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody>
    </table>${summary}
  </body></html>`;

  const blob = new Blob(["\uFEFF", html], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = options.filename.endsWith(".xls") ? options.filename : `${options.filename}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

export function printHtmlReport(options: {
  title: string;
  subtitle?: string;
  bodyHtml: string;
}) {
  const popup = window.open("", "_blank", "width=1100,height=800");
  if (!popup) {
    window.print();
    return;
  }

  popup.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"/>
    <title>${escapeHtml(options.title)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family: Arial, Tahoma, sans-serif; color:#111827; direction:rtl; }
      h1 { margin:0 0 5px; font-size:24px; }
      .subtitle { color:#6b7280; margin-bottom:20px; }
      table { width:100%; border-collapse:collapse; font-size:11px; }
      th,td { border:1px solid #d1d5db; padding:7px; text-align:right; }
      th { background:#f3f4f6; }
      .summary { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:18px 0; }
      .card { border:1px solid #d1d5db; border-radius:8px; padding:10px; }
      .card strong { display:block; font-size:16px; margin-top:4px; }
      @media print { button { display:none!important; } }
    </style></head><body>
    <h1>${escapeHtml(options.title)}</h1>
    ${options.subtitle ? `<div class="subtitle">${escapeHtml(options.subtitle)}</div>` : ""}
    ${options.bodyHtml}
    <script>window.onload=()=>{window.print();};<\/script>
  </body></html>`);
  popup.document.close();
}
