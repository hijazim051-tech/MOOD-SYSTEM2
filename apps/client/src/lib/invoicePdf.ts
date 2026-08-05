import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import type { PrintableOrder } from "../components/printing/types";
import { buildCustomerInvoiceHtml } from "../components/printing/printHelpers";
import { loadSettings } from "./settings";

async function waitForImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    })
  );
}

export async function createInvoicePdfFile(order: PrintableOrder): Promise<File> {
  const settings = await loadSettings(order.branchId);
  const html = buildCustomerInvoiceHtml(order, settings, 1);
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const invoice = parsed.querySelector(".invoice-card") as HTMLElement | null;
  if (!invoice) throw new Error("تعذر تجهيز قالب الفاتورة");

  const host = document.createElement("div");
  host.dir = "rtl";
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = settings.invoice_paper_size === "A4" ? "794px" : "420px";
  host.style.padding = "0";
  host.style.margin = "0";
  host.style.background = "white";
  host.style.zIndex = "-1";

  for (const style of Array.from(parsed.querySelectorAll("style"))) {
    host.appendChild(style.cloneNode(true));
  }
  host.appendChild(document.importNode(invoice, true));
  document.body.appendChild(host);

  try {
    await document.fonts?.ready;
    await waitForImages(host);

    const canvas = await html2canvas(host, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      allowTaint: false,
      logging: false,
      windowWidth: host.scrollWidth,
      windowHeight: host.scrollHeight,
    });

    const orientation = settings.invoice_orientation === "landscape" ? "landscape" : "portrait";
    const format = settings.invoice_paper_size === "A4" ? "a4" : "a6";
    const pdf = new jsPDF({ orientation, unit: "mm", format, compress: true });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 4;
    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;
    const pxPerMm = canvas.width / printableWidth;
    const pageSliceHeightPx = Math.max(1, Math.floor(printableHeight * pxPerMm));

    let offsetY = 0;
    let pageIndex = 0;

    while (offsetY < canvas.height) {
      const sliceHeight = Math.min(pageSliceHeightPx, canvas.height - offsetY);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const context = slice.getContext("2d");
      if (!context) throw new Error("تعذر تجهيز صفحة الفاتورة");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, slice.width, slice.height);
      context.drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      if (pageIndex > 0) pdf.addPage(format, orientation);
      const renderedHeight = sliceHeight / pxPerMm;
      pdf.addImage(
        slice.toDataURL("image/jpeg", 0.94),
        "JPEG",
        margin,
        margin,
        printableWidth,
        renderedHeight,
        undefined,
        "FAST"
      );

      offsetY += sliceHeight;
      pageIndex += 1;
    }

    const blob = pdf.output("blob");
    const safeBrandName = String(settings.shop_name || "MOOD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "Invoice";

    return new File([blob], `${safeBrandName}-Invoice-${order.orderNumber}.pdf`, {
      type: "application/pdf",
    });
  } finally {
    host.remove();
  }
}
