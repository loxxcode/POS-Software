import mongoose from "mongoose";
import { createHash, randomUUID } from "node:crypto";
import AppSettings from "../models/AppSettings.js";
import Customer from "../models/Customer.js";
import Proforma from "../models/Proforma.js";
import ProformaHistory from "../models/ProformaHistory.js";
import Product from "../models/Product.js";
import Sale from "../models/Sale.js";
import SyncJob from "../models/SyncJob.js";
import { priceProformaItems } from "./proformaPricing.js";
import { serializeProforma } from "./proformaWorkflow.js";

function httpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
}

function itemValuesMatch(issued, current) {
  const currentById = new Map(current.items.map(item => [String(item.productId), item]));
  return issued.items.every(item => {
    const recalculated = currentById.get(String(item.productId));
    return recalculated &&
      item.quantity === recalculated.quantity &&
      item.unitPrice.toString() === recalculated.unitPrice &&
      item.discountAmount.toString() === recalculated.discountAmount &&
      item.taxRate === recalculated.taxRate &&
      item.taxAmount.toString() === recalculated.taxAmount &&
      item.lineTotal.toString() === recalculated.lineTotal;
  }) &&
    issued.subtotal.toString() === current.subtotal &&
    issued.discountTotal.toString() === current.discountTotal &&
    issued.taxTotal.toString() === current.taxTotal &&
    issued.grandTotal.toString() === current.grandTotal &&
    issued.taxTreatment === current.taxTreatment;
}

async function writeHistory(proforma, actor, session, action = "converted", reason = "") {
  await ProformaHistory.create(
    [{
      proformaId: proforma._id,
      proformaNumber: proforma.proformaNumber,
      action,
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      reason,
      revisionNumber: proforma.revisionNumber,
      snapshot: serializeProforma(proforma),
    }],
    { session }
  );
}

export async function convertProformaToSale(id, values, actor) {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Invalid proforma ID.");
  if (
    typeof values.clientRequestId !== "string" ||
    values.clientRequestId.length < 8 ||
    values.clientRequestId.length > 100
  ) {
    throw httpError(400, "A unique clientRequestId is required.");
  }
  const paymentMethod = values.paymentMethod;
  if (!["cash", "card", "mobile_money", "other", "credit"].includes(paymentMethod)) {
    throw httpError(400, "Choose a valid payment method.");
  }
  if (paymentMethod === "mobile_money") {
    throw httpError(409, "Mobile money payment confirmation is not connected to the server. Complete payment confirmation before converting this proforma.");
  }
  if (paymentMethod === "credit" && values.paymentConfirmed === true) {
    throw httpError(400, "Credit conversions cannot be marked as paid.");
  }
  if (paymentMethod !== "credit" && values.paymentConfirmed !== true) {
    throw httpError(400, "Confirm that payment was received before converting this proforma as paid.");
  }

  const existing = await Sale.findOne({
    $or: [{ proformaId: id }, { clientRequestId: values.clientRequestId }],
  });
  if (existing) {
    if (String(existing.proformaId) !== String(id)) {
      throw httpError(409, "This checkout request was already used for another sale.");
    }
    return { sale: existing, duplicate: true };
  }

  const session = await mongoose.startSession();
  try {
    let result;
    let expired = false;
    await session.withTransaction(async () => {
      const proforma = await Proforma.findOne({ _id: id, latestRevision: true }).session(session);
      if (!proforma) throw httpError(404, "Proforma not found.");
      if (proforma.status !== "accepted") {
        throw httpError(409, "Only accepted proformas can be converted to a sale.");
      }
      if (proforma.validUntil < new Date()) {
        proforma.status = "expired";
        await proforma.save({ session });
        await writeHistory(proforma, actor, session, "expired", "Validity period elapsed.");
        expired = true;
        return;
      }
      if (proforma.convertedSaleId) {
        const sale = await Sale.findById(proforma.convertedSaleId).session(session);
        if (sale) {
          result = { sale, duplicate: true };
          return;
        }
        throw httpError(409, "The proforma has a conversion reference but its sale is unavailable.");
      }
      if (paymentMethod === "credit" && !proforma.customer) {
        throw httpError(400, "Credit conversion requires a saved customer.");
      }

      const settings = await AppSettings.findById("pos").session(session).lean();
      if (!settings || settings.taxTreatment === "unconfigured") {
        throw httpError(409, "Tax treatment is not configured for proforma conversion.");
      }
      const currentPricing = await priceProformaItems({
        items: proforma.items.map(item => ({ productId: item.productId, quantity: item.quantity })),
        customerId: proforma.customer,
        discountId: proforma.items.find(item => item.discountId)?.discountId,
        manualDiscountPercent: Number(proforma.manualDiscountPercent || 0),
        taxTreatment: settings.taxTreatment,
        otherCharges: proforma.otherCharges.toString(),
        session,
      });
      if (!itemValuesMatch(proforma, currentPricing)) {
        throw httpError(409, "Prices, discounts, or tax rules changed after acceptance. Revise and reissue the proforma for customer approval.");
      }

      const customer = proforma.customer
        ? await Customer.findById(proforma.customer).session(session)
        : null;
      if (proforma.customer && !customer) {
        throw httpError(409, "The proforma customer no longer exists.");
      }

      const saleItems = [];
      for (const item of proforma.items) {
        const unitPrice = Number(item.unitPrice.toString());
        const product = await Product.findOneAndUpdate(
          {
            _id: item.productId,
            active: true,
            stockQty: { $gte: item.quantity },
            sellingPrice: unitPrice,
            taxRate: item.taxRate,
          },
          { $inc: { stockQty: -item.quantity } },
          { new: true, session }
        );
        if (!product) {
          throw httpError(409, `Stock or pricing changed for ${item.name}. Revise or renew this proforma before conversion.`);
        }
        const gross = Number((unitPrice * item.quantity).toFixed(2));
        saleItems.push({
          productId: product._id,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unitPrice,
          lineTotal: gross,
          discountAmount: Number(item.discountAmount.toString()),
          taxRate: item.taxRate,
          taxAmount: Number(item.taxAmount.toString()),
        });
      }

      const total = Number(proforma.grandTotal.toString());
      const amountPaid = paymentMethod === "credit" ? 0 : total;
      const balanceDue = paymentMethod === "credit" ? total : 0;
      if (customer && paymentMethod === "credit") {
        customer.credit = Number((customer.credit + balanceDue).toFixed(2));
        await customer.save({ session });
      }

      const [sale] = await Sale.create(
        [{
          receiptNumber: `LIB-${Date.now()}-${randomUUID().slice(0, 8)}`,
          clientRequestId: values.clientRequestId,
          proformaId: proforma._id,
          proformaNumber: proforma.proformaNumber,
          proformaRevision: proforma.revisionNumber,
          customerId: customer?._id || null,
          customerName: proforma.customerSnapshot.name,
          customerPhone: proforma.customerSnapshot.phone || "",
          items: saleItems,
          subtotal: Number(proforma.subtotal.toString()),
          discountTotal: Number(proforma.discountTotal.toString()),
          taxTotal: Number(proforma.taxTotal.toString()),
          total,
          amountPaid,
          balanceDue,
          paymentStatus: paymentMethod === "credit" ? "unpaid" : "paid",
          appliedDiscounts: currentPricing.discount
            ? [{
                discountId: currentPricing.discount.id,
                title: currentPricing.discount.title,
                percent: currentPricing.discount.percent,
                amount: Number(proforma.discountTotal.toString()),
              }]
            : [],
          paymentMethod,
          currency: proforma.currency,
        }],
        { session }
      );
      const quickBooksRequestId = `pos-sale:${sale._id}`;
      sale.quickBooksRequestId = quickBooksRequestId;
      await sale.save({ session });
      await SyncJob.create(
        [{
          saleId: sale._id,
          internalJobId: randomUUID(),
          operationType: "createSalesReceipt",
          entityType: "sale",
          entityId: sale._id,
          direction: "posToQuickBooks",
          payloadReference: quickBooksRequestId,
          requestHash: createHash("sha256").update(quickBooksRequestId).digest("hex"),
          idempotencyKey: quickBooksRequestId,
          status: "pending",
        }],
        { session }
      );
      proforma.status = "converted";
      proforma.convertedSaleId = sale._id;
      await proforma.save({ session });
      await writeHistory(proforma, actor, session);
      result = { sale, duplicate: false };
    });
    if (expired) throw httpError(409, "This proforma has expired.");
    return result;
  } catch (error) {
    if (error.code === 11000) {
      const sale = await Sale.findOne({ proformaId: id });
      if (sale) return { sale, duplicate: true };
      const requestSale = await Sale.findOne({ clientRequestId: values.clientRequestId });
      if (requestSale) throw httpError(409, "This checkout request was already used for another sale.");
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
