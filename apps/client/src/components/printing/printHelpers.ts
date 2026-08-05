import type { Settings } from "../../lib/settings";
import type {
  PrintableOrder,
  PrintableOrderItem,
} from "./types";

export function openPrintDocument(
  html: string,
  title: string,
  preview: boolean
) {
  const printWindow = window.open("", "_blank", "width=850,height=1000");

  if (!printWindow) {
    throw new Error("المتصفح منع فتح نافذة الطباعة");
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.document.title = title;

  if (!preview) {
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  }
}

export function buildCustomerInvoiceHtml(
  order: PrintableOrder,
  settings: Settings,
  copies: number
) {
  const invoice = createCustomerInvoice(order, settings);
  const pages = Array.from(
    { length: Math.max(1, copies) },
    () => `<section class="print-page">${invoice}</section>`
  ).join("");

  return wrapPrintDocument(
    `فاتورة ${escapeHtml(order.orderNumber)}`,
    pages,
    settings.invoice_orientation || "portrait",
    settings
  );
}

export function buildProductionSheetHtml(
  order: PrintableOrder,
  settings: Settings,
  copies: number
) {
  const sheet = createProductionSheet(order, settings);
  const pages = Array.from(
    { length: Math.max(1, copies) },
    () => `<section class="print-page">${sheet}</section>`
  ).join("");

  return wrapPrintDocument(
    `ورقة إنتاج ${escapeHtml(order.orderNumber)}`,
    pages,
    settings.invoice_orientation || "portrait",
    settings
  );
}

export function buildBothDocumentsHtml(
  order: PrintableOrder,
  settings: Settings,
  copies: number
) {
  const pages: string[] = [];

  for (let index = 0; index < Math.max(1, copies); index += 1) {
    pages.push(
      `<section class="print-page">${createCustomerInvoice(
        order,
        settings
      )}</section>`
    );
    pages.push(
      `<section class="print-page">${createProductionSheet(
        order,
        settings
      )}</section>`
    );
  }

  return wrapPrintDocument(
    `طباعة الطلب ${escapeHtml(order.orderNumber)}`,
    pages.join(""),
    settings.invoice_orientation || "portrait",
    settings
  );
}

function createCustomerInvoice(
  order: PrintableOrder,
  settings: Settings
) {
  const itemsHtml = order.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.title)}</td>
          <td class="qty">1</td>
          <td class="money">${formatMoney(item.sellPrice, settings.currency)}</td>
        </tr>
      `
    )
    .join("");

  const paymentLabel = getPaymentMethodLabel(order.paymentMethod);

  return `
    <article class="invoice-card" dir="rtl">
      <header class="brand-header">
        ${
          settings.invoice_show_logo && settings.logo_url
            ? `<img class="logo" src="${escapeAttribute(
                settings.logo_url
              )}" alt="شعار المحل" />`
            : ""
        }
        <div class="brand-name">${escapeHtml(
          settings.shop_name || "MOOD"
        )}</div>
        <div class="brand-line">${escapeHtml(
          settings.branch_code === "alpha"
            ? "Gifts • Flowers • Special Moments"
            : "Flowers & Gift Wrapping"
        )}</div>
      </header>

      <div class="invoice-title">
        <span>${escapeHtml(
          settings.invoice_title || "فاتورة مبيعات"
        )}</span>
        <strong>${escapeHtml(
          `${settings.invoice_prefix || "INV"}-${order.orderNumber}`
        )}</strong>
      </div>

      <section class="meta-grid">
        <div><span>التاريخ</span><strong>${formatDate(order.createdAt)}</strong></div>
        <div><span>الوقت</span><strong>${formatTime(order.createdAt)}</strong></div>
        <div><span>العميل</span><strong>${escapeHtml(
          order.customerName || "غير مسجل"
        )}</strong></div>
        ${
          settings.invoice_show_customer_phone
            ? `<div><span>الهاتف</span><strong>${escapeHtml(
                order.customerPhone || "-"
              )}</strong></div>`
            : ""
        }
      </section>

      <table class="items-table">
        <thead>
          <tr>
            <th>المنتج</th>
            <th class="qty">الكمية</th>
            <th class="money">السعر</th>
          </tr>
        </thead>
        <tbody>
          ${
            itemsHtml ||
            `<tr><td colspan="3" class="empty">لا توجد عناصر محفوظة</td></tr>`
          }
        </tbody>
      </table>

      <section class="totals">
        <div><span>إجمالي المنتجات</span><strong>${formatMoney(
          order.productsTotal,
          settings.currency
        )}</strong></div>
        <div><span>التوصيل</span><strong>${formatMoney(
          order.deliveryFee,
          settings.currency
        )}</strong></div>
        <div><span>الخصم</span><strong>${formatMoney(
          order.discount,
          settings.currency
        )}</strong></div>
        <div class="grand-total"><span>الإجمالي</span><strong>${formatMoney(
          order.total,
          settings.currency
        )}</strong></div>
        <div><span>المدفوع</span><strong>${formatMoney(
          order.paidAmount,
          settings.currency
        )}</strong></div>
        <div><span>المتبقي</span><strong>${formatMoney(
          order.remainingAmount,
          settings.currency
        )}</strong></div>
      </section>

      ${
        settings.invoice_show_payment_method
          ? `<section class="payment-box"><span>طريقة الدفع</span><strong>${escapeHtml(
              paymentLabel
            )}</strong></section>`
          : ""
      }

      ${
        settings.invoice_show_notes && order.notes
          ? `<section class="notes-box"><strong>ملاحظات:</strong> ${escapeHtml(
              order.notes
            )}</section>`
          : ""
      }

      <footer class="invoice-footer">
        <div>${escapeHtml(
          settings.invoice_footer || "شكرًا لاختياركم MOOD"
        )}</div>
        ${
          settings.invoice_show_phone && settings.phone
            ? `<span>هاتف: ${escapeHtml(settings.phone)}</span>`
            : ""
        }
        ${
          settings.invoice_show_address && settings.address
            ? `<span>${escapeHtml(settings.address)}</span>`
            : ""
        }
        ${
          settings.whatsapp
            ? `<span>WhatsApp: ${escapeHtml(settings.whatsapp)}</span>`
            : ""
        }
      </footer>
    </article>
  `;
}

function createProductionSheet(
  order: PrintableOrder,
  settings: Settings
) {
  const itemsHtml = order.items
    .map((item, index) => createProductionItem(item, index))
    .join("");

  return `
    <article class="production-card" dir="rtl">
      <header class="production-header">
        <div>
          <div class="brand-name">${escapeHtml(
            settings.shop_name || "MOOD"
          )}</div>
          <div class="brand-line">ورقة تنفيذ الطلب</div>
        </div>
        <div class="order-number">
          <span>طلب رقم</span>
          <strong>${escapeHtml(order.orderNumber)}</strong>
        </div>
      </header>

      <section class="production-meta">
        <div><span>العميل</span><strong>${escapeHtml(
          order.customerName || "-"
        )}</strong></div>
        <div><span>الهاتف</span><strong>${escapeHtml(
          order.customerPhone || "-"
        )}</strong></div>
        <div><span>موعد التسليم</span><strong>${escapeHtml(
          [order.deliveryDate, order.deliveryTime]
            .filter(Boolean)
            .join(" — ") || "-"
        )}</strong></div>
        <div><span>المناسبة</span><strong>${escapeHtml(
          order.occasion || "-"
        )}</strong></div>
      </section>

      <section class="production-items">
        ${
          itemsHtml ||
          `<div class="empty">لا توجد عناصر محفوظة لهذا الطلب.</div>`
        }
      </section>

      ${
        order.notes
          ? `<section class="notes-box"><strong>ملاحظات الطلب:</strong> ${escapeHtml(
              order.notes
            )}</section>`
          : ""
      }

      ${
        order.deliveryAddress
          ? `<section class="delivery-box">
              <strong>عنوان التوصيل</strong>
              <span>${escapeHtml(order.deliveryAddress)}</span>
            </section>`
          : ""
      }

      <footer class="checks">
        <span>☐ تم التنفيذ</span>
        <span>☐ تمت المراجعة</span>
        <span>اسم المنفذ: ____________________</span>
      </footer>
    </article>
  `;
}

function createProductionItem(
  item: PrintableOrderItem,
  index: number
) {
  const components = item.components
    .map(
      (component) => `
        <div class="component-row">
          <span>☐ ${escapeHtml(component.name)}</span>
          <strong>× ${component.quantity}</strong>
        </div>
      `
    )
    .join("");

  return `
    <section class="production-item">
      <h2>${index + 1}. ${escapeHtml(item.title)}</h2>
      ${components || `<div class="empty">لا توجد مكونات محفوظة.</div>`}
      ${
        item.notes
          ? `<div class="item-note"><strong>ملاحظة:</strong> ${escapeHtml(
              item.notes
            )}</div>`
          : ""
      }
    </section>
  `;
}

function wrapPrintDocument(
  title: string,
  pages: string,
  orientation: string,
  settings: Settings
) {
  const isLandscape = orientation === "landscape";
  const primary = sanitizeCssColor(
    settings.primary_color || "#184b34",
    "#184b34"
  );
  const secondary = sanitizeCssColor(
    settings.secondary_color || "#eef5f0",
    "#eef5f0"
  );
  const isAlpha = settings.branch_code === "alpha";

  return `
    <!DOCTYPE html>
    <html lang="ar">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <style>
          @page {
            size: A6 ${isLandscape ? "landscape" : "portrait"};
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          html, body {
            margin: 0;
            padding: 0;
            background: #eef1ef;
            font-family: Arial, Tahoma, sans-serif;
            color: ${isAlpha ? "#0f172a" : "#18211c"};
          }

          .print-page {
            width: ${isLandscape ? "148mm" : "105mm"};
            min-height: ${isLandscape ? "105mm" : "148mm"};
            margin: 8mm auto;
            padding: 7mm;
            background: white;
            page-break-after: always;
            overflow: hidden;
          }

          .print-page:last-child {
            page-break-after: auto;
          }

          .brand-header {
            position: relative;
            text-align: center;
            border-bottom: 1.2px solid ${primary};
            padding-bottom: 4mm;
          }

          .brand-header::before {
            content: "";
            display: block;
            width: ${isAlpha ? "22mm" : "14mm"};
            height: 1.2mm;
            margin: 0 auto 3mm;
            border-radius: 999px;
            background: ${primary};
          }

          .logo {
            display: block;
            height: 16mm;
            max-width: 35mm;
            margin: 0 auto 2mm;
            object-fit: contain;
          }

          .brand-name {
            font-size: 22px;
            font-weight: 900;
            letter-spacing: 2px;
            color: ${primary};
          }

          .brand-line {
            margin-top: 1mm;
            font-size: 8px;
            color: #6d766f;
          }

          .invoice-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 4mm;
            padding: 4mm 0;
            font-size: 10px;
          }

          .invoice-title strong {
            direction: ltr;
            font-size: 11px;
          }

          .meta-grid,
          .production-meta {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2mm 4mm;
            padding: 3mm;
            border: 1px solid #dce3de;
            border-radius: 3mm;
            background: #fafcfb;
            font-size: 8.5px;
          }

          .meta-grid div,
          .production-meta div {
            display: flex;
            flex-direction: column;
            gap: 0.8mm;
          }

          .meta-grid span,
          .production-meta span {
            color: #78817b;
            font-size: 7px;
          }

          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 4mm;
            font-size: 8.5px;
          }

          .items-table th {
            padding: 2.4mm 1.5mm;
            background: ${secondary};
            color: ${primary};
            border-bottom: 1px solid #bfcac2;
            text-align: right;
          }

          .items-table td {
            padding: 2.5mm 1.5mm;
            border-bottom: 1px solid #e5e9e6;
            vertical-align: top;
          }

          .qty {
            width: 15mm;
            text-align: center !important;
          }

          .money {
            width: 24mm;
            text-align: left !important;
            direction: rtl;
            white-space: nowrap;
          }

          .totals {
            margin-top: 4mm;
            font-size: 8.5px;
          }

          .totals > div {
            display: flex;
            justify-content: space-between;
            gap: 4mm;
            padding: 1.4mm 0;
          }

          .grand-total {
            margin: 2mm 0;
            padding: 2.5mm 3mm !important;
            border-radius: 2.5mm;
            background: ${primary};
            color: white;
            font-size: 11px;
          }

          .payment-box,
          .delivery-box {
            display: flex;
            justify-content: space-between;
            gap: 4mm;
            margin-top: 3mm;
            padding: 2.5mm 3mm;
            border-radius: 2.5mm;
            background: #f2f6f3;
            font-size: 8.5px;
          }

          .notes-box {
            margin-top: 3mm;
            padding: 2.5mm 3mm;
            border: 1px dashed #aab7ae;
            border-radius: 2.5mm;
            font-size: 8px;
            line-height: 1.5;
          }

          .invoice-footer {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 1.5mm 4mm;
            margin-top: 4mm;
            padding-top: 3mm;
            border-top: 1px solid #dce3de;
            text-align: center;
            color: #68716b;
            font-size: 7.5px;
          }

          .invoice-footer div {
            width: 100%;
            color: ${primary};
            font-weight: 700;
            font-size: 9px;
          }

          .production-card {
            font-size: 8.5px;
          }

          .production-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 5mm;
            padding-bottom: 3mm;
            border-bottom: 1.2px solid ${primary};
          }

          .order-number {
            min-width: 28mm;
            padding: 2.5mm;
            border-radius: 3mm;
            background: ${primary};
            color: white;
            text-align: center;
          }

          .order-number span {
            display: block;
            font-size: 7px;
          }

          .order-number strong {
            display: block;
            margin-top: 1mm;
            font-size: 14px;
          }

          .production-meta {
            margin-top: 4mm;
          }

          .production-items {
            margin-top: 4mm;
          }

          .production-item {
            margin-bottom: 3mm;
            padding: 3mm;
            border: 1px solid #cdd7d0;
            border-radius: 3mm;
            page-break-inside: avoid;
          }

          .production-item h2 {
            margin: 0 0 2.5mm;
            padding-bottom: 2mm;
            border-bottom: 1px solid #e1e7e3;
            color: ${primary};
            font-size: 11px;
          }

          .component-row {
            display: flex;
            justify-content: space-between;
            gap: 3mm;
            padding: 1.3mm 0;
          }

          .item-note {
            margin-top: 2mm;
            padding: 2mm;
            border-radius: 2mm;
            background: #f4f5f4;
            line-height: 1.5;
          }

          .checks {
            display: flex;
            flex-direction: column;
            gap: 2.5mm;
            margin-top: 4mm;
            padding-top: 3mm;
            border-top: 1px dashed #9eaaa2;
            font-size: 8.5px;
          }

          .empty {
            padding: 4mm;
            text-align: center;
            color: #7a837d;
          }

          @media print {
            html, body {
              background: white;
            }

            .print-page {
              margin: 0;
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>${pages}</body>
    </html>
  `;
}

function getPaymentMethodLabel(method: string) {
  const labels: Record<string, string> = {
    cash: "نقدي",
    card: "بطاقة مصرفية",
    bank: "خدمات مصرفية",
    transfer: "تحويل مصرفي",
    deposit: "عربون",
    mixed: "دفع مختلط",
  };

  return labels[method] || method || "-";
}

function formatMoney(value: number, currency: string) {
  return `${Number(value || 0).toFixed(2)} ${currency || "د.ل"}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ar-LY");
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("ar-LY", {
    hour: "2-digit",
    minute: "2-digit",
  });
}


function sanitizeCssColor(value: string, fallback: string) {
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}