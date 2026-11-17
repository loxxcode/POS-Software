import PDFDocument from "pdfkit";

export function createProformaPdf(proforma, settings) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      size: "A4",
      margin: 48,
      info: { Title: `Proforma ${proforma.proformaNumber}` },
    });
    const chunks = [];
    document.on("data", chunk => chunks.push(chunk));
    document.once("error", reject);
    document.once("end", () => resolve(Buffer.concat(chunks)));

    const money = value => `RWF ${Number(value?.toString() || 0).toFixed(2)}`;
    const date = value => value ? new Date(value).toLocaleDateString("en-GB") : "—";

    document.font("Helvetica-Bold").fontSize(18).text(settings?.shopName || "POS");
    document.font("Helvetica").fontSize(9);
    if (settings?.shopAddress) document.text(settings.shopAddress);
    document.text([
      settings?.shopPhone && `Phone: ${settings.shopPhone}`,
      settings?.shopEmail && `Email: ${settings.shopEmail}`,
      settings?.shopTin && `TIN: ${settings.shopTin}`,
    ].filter(Boolean).join("  · "));
    document.moveDown(0.5);
    document.fontSize(15).text("PROFORMA INVOICE — NOT A PAYMENT RECEIPT", { align: "center" });
    document.moveDown(0.7);
    document.font("Helvetica").fontSize(10);
    document.text(`Proforma number: ${proforma.proformaNumber}  ·  Revision: ${proforma.revisionNumber}`);
    document.text(`Status: ${proforma.status.toUpperCase()}  ·  Issued: ${date(proforma.issueDate)}  ·  Valid until: ${date(proforma.validUntil)}`);
    document.moveDown(0.7);
    document.font("Helvetica-Bold").text("Customer");
    document.font("Helvetica").text(proforma.customerSnapshot.name);
    if (proforma.customerSnapshot.address) document.text(proforma.customerSnapshot.address);
    document.text(`Phone: ${proforma.customerSnapshot.phone || "—"}  ·  Email: ${proforma.customerSnapshot.email || "—"}`);
    document.text(`TIN: ${proforma.customerSnapshot.tin || "—"}`);
    document.moveDown();

    const columns = [48, 263, 315, 360, 425, 495];
    const drawTableHeader = () => {
      const y = document.y;
      document.font("Helvetica-Bold").fontSize(8);
      document.text("ITEM / SKU", columns[0], y, { width: 205 });
      document.text("QTY", columns[1], y, { width: 42, align: "right" });
      document.text("UNIT", columns[2], y, { width: 35, align: "right" });
      document.text("PRICE", columns[3], y, { width: 55, align: "right" });
      document.text("DISCOUNT", columns[4], y, { width: 60, align: "right" });
      document.text("TOTAL", columns[5], y, { width: 52, align: "right" });
      document.moveDown(0.6);
      document.moveTo(48, document.y).lineTo(547, document.y).strokeColor("#b8c0ce").stroke();
      document.moveDown(0.35);
      document.font("Helvetica").fontSize(8);
    };
    drawTableHeader();
    for (const item of proforma.items) {
      if (document.y > 700) {
        document.addPage();
        drawTableHeader();
      }
      const y = document.y;
      document.font("Helvetica-Bold").text(item.name, columns[0], y, { width: 205 });
      document.font("Helvetica").text(item.sku, columns[0], y + 11, { width: 205 });
      document.text(String(item.quantity), columns[1], y, { width: 42, align: "right" });
      document.text(item.unit || "unit", columns[2], y, { width: 35, align: "right" });
      document.text(money(item.unitPrice), columns[3], y, { width: 55, align: "right" });
      document.text(`${item.discountPercent || 0}%`, columns[4], y, { width: 60, align: "right" });
      document.text(money(item.lineTotal), columns[5], y, { width: 52, align: "right" });
      document.y = y + 28;
    }
    document.moveDown(0.4);
    document.moveTo(330, document.y).lineTo(547, document.y).strokeColor("#b8c0ce").stroke();
    document.moveDown(0.5);
    const totalLine = (label, value, bold = false) => {
      document.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10);
      document.text(label, 330, document.y, { width: 105 });
      document.text(money(value), 435, document.y, { width: 112, align: "right" });
      document.moveDown(0.55);
    };
    totalLine("Subtotal", proforma.subtotal);
    totalLine("Discounts", proforma.discountTotal);
    totalLine(proforma.taxTreatment === "unconfigured" ? "Tax (not configured)" : "Tax", proforma.taxTotal);
    totalLine("Other charges", proforma.otherCharges);
    totalLine("Total payable", proforma.grandTotal, true);
    document.moveDown();
    document.font("Helvetica-Bold").fontSize(10).text("Payment terms");
    document.font("Helvetica").fontSize(9).text(proforma.terms || "Payment is due according to the agreed terms.");
    if (proforma.notes) {
      document.moveDown(0.4);
      document.font("Helvetica-Bold").text("Notes");
      document.font("Helvetica").text(proforma.notes);
    }
    document.moveDown();
    document.font("Helvetica-Bold").fontSize(9).text("This document is a quotation only. It is not proof of payment or a completed sale.");
    document.end();
  });
}
