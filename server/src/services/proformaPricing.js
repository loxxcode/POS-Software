import mongoose from "mongoose";
import Discount from "../models/Discount.js";
import Product from "../models/Product.js";
import {
  calculateTaxMinorUnits,
  decimalStringFromMinorUnits,
  percentageToBasisPoints,
  roundedRatio,
  toMinorUnits,
} from "../utils/money.js";

function isDiscountActive(discount, date) {
  const dateValue = date.toISOString().slice(0, 10);
  return dateValue >= discount.start && dateValue <= discount.end;
}

function productMatchesDiscount(discount, product) {
  const target = discount.product.trim().toLowerCase();
  return target === "all products" ||
    target === product.sku.toLowerCase() ||
    target === product.name.toLowerCase();
}

export async function priceProformaItems({
  items,
  customerId,
  discountId,
  manualDiscountPercent = 0,
  taxTreatment,
  otherCharges = 0,
  date = new Date(),
  session,
}) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    throw Object.assign(new Error("Provide between 1 and 100 proforma items."), { status: 400 });
  }
  if (!["unconfigured", "exclusive", "inclusive"].includes(taxTreatment)) {
    throw Object.assign(new Error("Tax treatment is not configured."), { status: 409 });
  }
  if (
    !Number.isFinite(manualDiscountPercent) ||
    manualDiscountPercent < 0 ||
    manualDiscountPercent > 100 ||
    Math.abs(manualDiscountPercent * 100 - Math.round(manualDiscountPercent * 100)) > 1e-7
  ) {
    throw Object.assign(new Error("One-off discount must be between 0 and 100 with at most two decimal places."), { status: 400 });
  }
  if (discountId && manualDiscountPercent > 0) {
    throw Object.assign(new Error("Choose either a saved discount or a one-off discount, not both."), { status: 400 });
  }

  const ids = [];
  for (const item of items) {
    if (
      !item ||
      !mongoose.isValidObjectId(item.productId) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      ids.includes(String(item.productId))
    ) {
      throw Object.assign(
        new Error("Each product must be unique and have a valid product ID and positive whole quantity."),
        { status: 400 }
      );
    }
    ids.push(String(item.productId));
  }

  const products = await Product.find({ _id: { $in: ids }, active: true })
    .session(session || null)
    .lean();
  const productById = new Map(products.map(product => [String(product._id), product]));
  if (products.length !== ids.length) {
    throw Object.assign(new Error("A selected product is missing or inactive."), { status: 400 });
  }

  let discount = null;
  if (discountId) {
    if (!mongoose.isValidObjectId(discountId)) {
      throw Object.assign(new Error("Select a valid discount."), { status: 400 });
    }
    discount = await Discount.findById(discountId).session(session || null).lean();
    if (!discount || !isDiscountActive(discount, date)) {
      throw Object.assign(new Error("The selected discount is unavailable or inactive."), { status: 400 });
    }
    if (discount.customerId && String(discount.customerId) !== String(customerId || "")) {
      throw Object.assign(new Error("The selected discount is not available for this customer."), { status: 400 });
    }
  }

  const otherChargesMinor = toMinorUnits(otherCharges, "Other charges");
  let subtotalMinor = 0n;
  let discountTotalMinor = 0n;
  let taxTotalMinor = 0n;
  let matchedDiscount = false;
  const pricedItems = [];

  for (const requestedItem of items) {
    const product = productById.get(String(requestedItem.productId));
    const unitPriceMinor = toMinorUnits(product.sellingPrice, `Price for ${product.name}`);
    const grossMinor = unitPriceMinor * BigInt(requestedItem.quantity);
    if (grossMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw Object.assign(new Error(`The line total for ${product.name} is too large.`), { status: 400 });
    }

    const matchesSavedDiscount = Boolean(discount && productMatchesDiscount(discount, product));
    const matchesDiscount = manualDiscountPercent > 0 || matchesSavedDiscount;
    if (matchesSavedDiscount) matchedDiscount = true;
    const discountPercent = manualDiscountPercent > 0
      ? manualDiscountPercent
      : matchesSavedDiscount ? discount.percent : 0;
    const discountBps = percentageToBasisPoints(discountPercent, "Discount percentage");
    const lineDiscountMinor = roundedRatio(grossMinor * discountBps, 10000n);
    const taxableMinor = grossMinor - lineDiscountMinor;
    const taxRate = product.taxRate === undefined ? null : product.taxRate;

    if (taxTreatment !== "unconfigured" && taxRate === null) {
      throw Object.assign(
        new Error(`Tax rate is not configured for ${product.name}. Set a product tax rate before issuing this proforma.`),
        { status: 409 }
      );
    }

    const lineTaxMinor = taxTreatment === "unconfigured"
      ? 0n
      : calculateTaxMinorUnits(taxableMinor, taxRate, taxTreatment);
    const lineTotalMinor = taxTreatment === "exclusive"
      ? taxableMinor + lineTaxMinor
      : taxableMinor;

    subtotalMinor += grossMinor;
    discountTotalMinor += lineDiscountMinor;
    taxTotalMinor += lineTaxMinor;
    pricedItems.push({
      productId: product._id,
      sku: product.sku,
      barcode: product.barcode || "",
      name: product.name,
      unit: product.unit || "unit",
      quantity: requestedItem.quantity,
      unitPrice: decimalStringFromMinorUnits(unitPriceMinor),
      discountId: matchesSavedDiscount ? discount._id : null,
      discountPercent,
      discountAmount: decimalStringFromMinorUnits(lineDiscountMinor),
      taxRate,
      taxAmount: decimalStringFromMinorUnits(lineTaxMinor),
      lineTotal: decimalStringFromMinorUnits(lineTotalMinor),
      stockQtyAtQuote: product.stockQty,
    });
  }

  if (discount && !matchedDiscount) {
    throw Object.assign(new Error("The selected discount does not apply to any product in this proforma."), { status: 400 });
  }

  const grandTotalMinor = taxTreatment === "exclusive"
    ? subtotalMinor - discountTotalMinor + taxTotalMinor + otherChargesMinor
    : subtotalMinor - discountTotalMinor + otherChargesMinor;

  return {
    items: pricedItems,
    subtotal: decimalStringFromMinorUnits(subtotalMinor),
    discountTotal: decimalStringFromMinorUnits(discountTotalMinor),
    manualDiscountPercent,
    taxTotal: decimalStringFromMinorUnits(taxTotalMinor),
    otherCharges: decimalStringFromMinorUnits(otherChargesMinor),
    grandTotal: decimalStringFromMinorUnits(grandTotalMinor),
    taxTreatment,
    discount: discount ? {
      id: String(discount._id),
      title: discount.title || discount.reason || `Discount ${discount.percent}%`,
      percent: discount.percent,
    } : null,
    products: products.map(product => ({
      id: String(product._id),
      stockQty: product.stockQty,
      sellingPrice: product.sellingPrice,
    })),
  };
}
