
import { Router } from "express";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import Customer from "../models/Customer.js";
import Product from "../models/Product.js";
import Sale from "../models/Sale.js";
import SyncJob from "../models/SyncJob.js";
import AppSettings from "../models/AppSettings.js";
import { priceProformaItems } from "../services/proformaPricing.js";

const router = Router();

router.post("/", async (req, res, next) => {
  const { clientRequestId, items, paymentMethod } = req.body || {};
  const saleType = req.body?.saleType || "paid";
  const customerId = req.body?.customerId ?? null;
  const discountId = req.body?.discountId ?? null;
  const customerName = req.body?.customerName ?? "Walk-in customer";
  const customerPhone = req.body?.customerPhone ?? "";

  if (
    typeof clientRequestId !== "string" ||
    clientRequestId.length < 8 ||
    clientRequestId.length > 100
  ) {
    return res.status(400).json({
      success: false,
      message: "A unique clientRequestId is required",
    });
  }

  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Provide between 1 and 100 sale items",
    });
  }

  if (
    !["cash", "card", "mobile_money", "other", "credit"].includes(paymentMethod) ||
    !["paid", "credit"].includes(saleType) ||
    (saleType === "credit") !== (paymentMethod === "credit")
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid sale type or payment method",
    });
  }

  if (
    (customerId !== null && !mongoose.isValidObjectId(customerId)) ||
    (saleType === "credit" && customerId === null) ||
    (discountId !== null && !mongoose.isValidObjectId(discountId))
  ) {
    return res.status(400).json({
      success: false,
      message: "Credit sales require a valid customer and discounts must be valid.",
    });
  }

  if (
    (saleType !== "credit" && (typeof customerName !== "string" || !customerName.trim() || customerName.trim().length > 120)) ||
    typeof customerPhone !== "string" ||
    customerPhone.trim().length > 30 ||
    (customerPhone.trim() && !/^[+()\d\s-]{7,30}$/.test(customerPhone.trim()))
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid customer name and phone number.",
    });
  }

  for (const item of items) {
    if (
      !mongoose.isValidObjectId(item.productId) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Each item needs a valid productId and positive whole quantity",
      });
    }
  }

  let existing;
  try {
    existing = await Sale.findOne({ clientRequestId });
  } catch (error) {
    return next(error);
  }
  if (existing) {
    return res.json({ success: true, duplicate: true, data: existing });
  }

  const session = await mongoose.startSession();

  try {
    let createdSale;

    await session.withTransaction(async () => {
      const customer = customerId
        ? await Customer.findById(customerId).session(session)
        : null;

      if (customerId && !customer) {
        throw Object.assign(new Error("Customer not found."), { status: 404 });
      }
      if (saleType === "credit" && !customer) {
        throw Object.assign(new Error("Select an existing customer for a credit sale."), { status: 400 });
      }

      for (const item of items) {
        const product = await Product.findOneAndUpdate(
          {
            _id: item.productId,
            active: true,
            stockQty: { $gte: item.quantity },
          },
          { $inc: { stockQty: -item.quantity } },
          { new: true, session }
        );

        if (!product) {
          throw Object.assign(
            new Error(
              `Product ${item.productId} not found, inactive, or insufficient stock`
            ),
            { status: 400 }
          );
        }
      }

      const settings = await AppSettings.findById("pos").session(session).lean();
      const pricing = await priceProformaItems({
        items,
        customerId: customer?._id || null,
        discountId,
        taxTreatment: settings?.taxTreatment || "unconfigured",
        session,
      });
      const subtotal = Number(pricing.subtotal);
      const discountTotal = Number(pricing.discountTotal);
      const taxTotal = Number(pricing.taxTotal);
      const total = Number(pricing.grandTotal);
      const saleItems = pricing.items.map(item => {
        const unitPrice = Number(item.unitPrice);
        return {
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unitPrice,
          lineTotal: Number((unitPrice * item.quantity).toFixed(2)),
          discountAmount: Number(item.discountAmount),
          taxRate: item.taxRate ?? 0,
          taxAmount: Number(item.taxAmount),
        };
      });
      const amountPaid = saleType === "credit" ? 0 : total;
      const balanceDue = saleType === "credit" ? total : 0;
      if (customer && saleType === "credit") {
        customer.credit = Number((customer.credit + balanceDue).toFixed(2));
        await customer.save({ session });
      }

      const [sale] = await Sale.create(
        [{
          receiptNumber: `LIB-${Date.now()}-${randomUUID().slice(0, 8)}`,
          clientRequestId,
          customerId: customer?._id || null,
          customerName: customer?.name || customerName.trim(),
          customerPhone: customer?.phone || customerPhone.trim(),
          items: saleItems,
          subtotal,
          discountTotal,
          taxTotal,
          total,
          amountPaid,
          balanceDue,
          paymentStatus: saleType === "credit" ? "unpaid" : "paid",
          appliedDiscounts: pricing.discount
            ? [{
                discountId: pricing.discount.id,
                title: pricing.discount.title,
                percent: pricing.discount.percent,
                amount: discountTotal,
              }]
            : [],
          paymentMethod,
          currency: "RWF",
        }],
        { session }
      );

      const quickBooksRequestId = `pos-sale:${sale._id}`;
      sale.quickBooksRequestId = quickBooksRequestId;
      await sale.save({ session });
      await SyncJob.create(
        [{ saleId: sale._id, idempotencyKey: quickBooksRequestId, status: "pending" }],
        { session }
      );

      createdSale = sale;
    });

    res.status(201).json({
      success: true,
      message: saleType === "credit"
        ? "Credit sale recorded; customer balance updated and QuickBooks sync is pending"
        : "Sale recorded; QuickBooks sync is pending",
      data: createdSale,
    });
  } catch (error) {
    // Handle concurrent retries of the same checkout request.
    if (error.code === 11000) {
      const existingSale = await Sale.findOne({ clientRequestId });
      if (existingSale) {
        return res.json({
          success: true,
          duplicate: true,
          data: existingSale,
        });
      }
    }

    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
});

// GET /api/sales
router.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
      100
    );

    const data = await Sale.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
});

// GET /api/sales/:id
router.get("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sale ID",
      });
    }

    const data = await Sale.findById(req.params.id).lean();

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Sale not found",
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
