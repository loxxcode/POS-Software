import { Router } from "express";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import CustomerPayment from "../models/CustomerPayment.js";
import Sale from "../models/Sale.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const data = await Customer.find().sort({ name: 1 }).limit(500).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  const { name, email = "", phone = "", tin = "", credit = 0, address = "" } = req.body || {};
  if (
    typeof name !== "string" || !name.trim() || name.trim().length > 120 ||
    typeof email !== "string" || email.length > 254 ||
    (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) ||
    typeof phone !== "string" || phone.length > 30 ||
    typeof tin !== "string" || tin.length > 50 ||
    !Number.isFinite(credit) || credit < 0 ||
    typeof address !== "string" || address.length > 300
  ) {
    return res.status(400).json({ success: false, message: "Enter valid customer details." });
  }

  try {
    const data = await Customer.create({ name, email, phone, tin, credit, address });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/payments", async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid customer ID." });
  }

  try {
    const data = await CustomerPayment.find({ customerId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/payments", async (req, res, next) => {
  const { clientRequestId, amount, paymentMethod } = req.body || {};
  if (
    !mongoose.isValidObjectId(req.params.id) ||
    typeof clientRequestId !== "string" ||
    clientRequestId.length < 8 ||
    clientRequestId.length > 100 ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-8 ||
    !["cash", "card", "mobile_money", "other"].includes(paymentMethod)
  ) {
    return res.status(400).json({ success: false, message: "Enter a valid payment amount and method." });
  }

  let existingPayment;
  try {
    existingPayment = await CustomerPayment.findOne({ clientRequestId }).lean();
  } catch (error) {
    return next(error);
  }
  if (existingPayment) {
    if (String(existingPayment.customerId) !== req.params.id) {
      return res.status(409).json({ success: false, message: "This payment request ID has already been used." });
    }
    try {
      const customer = await Customer.findById(req.params.id).lean();
      const updatedSales = existingPayment.allocations.length
        ? await Sale.find({ _id: { $in: existingPayment.allocations.map(item => item.saleId) } }).lean()
        : [];
      return res.json({
        success: true,
        duplicate: true,
        data: { payment: existingPayment, customer, updatedSales },
      });
    } catch (error) {
      return next(error);
    }
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const customer = await Customer.findById(req.params.id).session(session);
      if (!customer) {
        throw Object.assign(new Error("Customer not found."), { status: 404 });
      }

      const paymentAmount = Number(amount.toFixed(2));
      const balanceBefore = Number(customer.credit.toFixed(2));
      if (paymentAmount > balanceBefore) {
        throw Object.assign(new Error("Payment cannot exceed the customer's outstanding credit."), { status: 400 });
      }

      customer.credit = Number((balanceBefore - paymentAmount).toFixed(2));
      await customer.save({ session });

      let remaining = paymentAmount;
      const allocations = [];
      const outstandingSales = await Sale.find({
        customerId: customer._id,
        balanceDue: { $gt: 0 },
        paymentStatus: { $in: ["unpaid", "partial"] },
      }).sort({ createdAt: 1 }).session(session);

      for (const sale of outstandingSales) {
        if (remaining <= 0) break;
        const allocationAmount = Number(Math.min(remaining, sale.balanceDue).toFixed(2));
        sale.amountPaid = Number((sale.amountPaid + allocationAmount).toFixed(2));
        sale.balanceDue = Number((sale.balanceDue - allocationAmount).toFixed(2));
        sale.paymentStatus = sale.balanceDue === 0 ? "paid" : "partial";
        await sale.save({ session });
        allocations.push({
          saleId: sale._id,
          receiptNumber: sale.receiptNumber,
          amount: allocationAmount,
        });
        remaining = Number((remaining - allocationAmount).toFixed(2));
      }

      const [payment] = await CustomerPayment.create(
        [{
          clientRequestId,
          customerId: customer._id,
          customerName: customer.name,
          amount: paymentAmount,
          paymentMethod,
          balanceBefore,
          balanceAfter: customer.credit,
          receivedBy: req.user.email,
          allocations,
        }],
        { session }
      );
      result = {
        payment,
        customer,
        updatedSales: outstandingSales.filter(sale =>
          allocations.some(item => String(item.saleId) === String(sale._id))
        ),
      };
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    if (error.code === 11000) {
      const payment = await CustomerPayment.findOne({ clientRequestId }).lean();
      if (payment && String(payment.customerId) === req.params.id) {
        const customer = await Customer.findById(req.params.id).lean();
        const updatedSales = payment.allocations.length
          ? await Sale.find({ _id: { $in: payment.allocations.map(item => item.saleId) } }).lean()
          : [];
        return res.json({ success: true, duplicate: true, data: { payment, customer, updatedSales } });
      }
    }
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    next(error);
  } finally {
    await session.endSession();
  }
});

router.patch("/:id", async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid customer ID." });
  }

  const { name, email = "", phone = "", tin = "", credit = 0, address = "" } = req.body || {};
  if (
    typeof name !== "string" || !name.trim() || name.trim().length > 120 ||
    typeof email !== "string" || email.length > 254 ||
    (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) ||
    typeof phone !== "string" || phone.length > 30 ||
    typeof tin !== "string" || tin.length > 50 ||
    !Number.isFinite(credit) || credit < 0 ||
    typeof address !== "string" || address.length > 300
  ) {
    return res.status(400).json({ success: false, message: "Enter valid customer details." });
  }

  try {
    const data = await Customer.findByIdAndUpdate(
      req.params.id,
      { name, email, phone, tin, credit, address },
      { new: true, runValidators: true }
    );
    if (!data) return res.status(404).json({ success: false, message: "Customer not found." });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid customer ID." });
  }

  try {
    const data = await Customer.findById(req.params.id);
    if (!data) return res.status(404).json({ success: false, message: "Customer not found." });
    if (data.credit > 0) {
      return res.status(409).json({
        success: false,
        message: "Customers with an outstanding credit balance cannot be removed.",
      });
    }
    const [hasSales, hasPayments] = await Promise.all([
      Sale.exists({ customerId: data._id }),
      CustomerPayment.exists({ customerId: data._id }),
    ]);
    if (hasSales || hasPayments) {
      return res.status(409).json({
        success: false,
        message: "Customers with sales or payment history cannot be removed.",
      });
    }
    await data.deleteOne();
    res.json({ success: true, message: "Customer removed." });
  } catch (error) {
    next(error);
  }
});

export default router;
