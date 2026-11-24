import mongoose from "mongoose";
import AppSettings from "../models/AppSettings.js";
import Customer from "../models/Customer.js";
import Proforma from "../models/Proforma.js";
import ProformaCounter from "../models/ProformaCounter.js";
import ProformaHistory from "../models/ProformaHistory.js";
import { priceProformaItems } from "./proformaPricing.js";

function httpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
}

function serializeValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (value?._bsontype === "Decimal128") return value.toString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, serializeValue(child)])
    );
  }
  return value;
}

export function serializeProforma(proforma) {
  return serializeValue(proforma?.toObject ? proforma.toObject() : proforma);
}

async function getSettings(session) {
  let settings = await AppSettings.findById("pos").session(session || null).lean();
  if (!settings) {
    settings = await AppSettings.findOneAndUpdate(
      { _id: "pos" },
      { $setOnInsert: { shopName: "CARITAS HQ SHOP", lowStockThreshold: 5 } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true, session }
    ).lean();
  }
  return {
    shopName: "CARITAS HQ SHOP",
    proformaNumberPrefix: "PF",
    proformaValidityDays: 30,
    taxTreatment: "unconfigured",
    proformaApprovalsEnabled: false,
    approvalValueThreshold: null,
    approvalDiscountPercent: null,
    ...settings,
  };
}

function endOfDate(value) {
  const text = typeof value === "string" ? value : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw httpError(400, "Enter a valid validity date.");
  }
  const date = new Date(`${text}T23:59:59.999Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw httpError(400, "Enter a valid validity date.");
  }
  return date;
}

function defaultValidUntil(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function validateValidityDate(value, days) {
  const date = value ? endOfDate(value) : defaultValidUntil(days);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const maximum = new Date();
  maximum.setUTCDate(maximum.getUTCDate() + days);
  maximum.setUTCHours(23, 59, 59, 999);
  if (date < today || date > maximum) {
    throw httpError(400, `The validity date must be between today and ${days} days from today.`);
  }
  return date;
}

function validateNotes(value, field) {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > 2000) {
    throw httpError(400, `${field} must be no more than 2,000 characters.`);
  }
  return value.trim();
}

function customerSnapshotFrom(customer) {
  return {
    name: customer.name,
    address: customer.address || "",
    email: customer.email || "",
    phone: customer.phone || "",
    tin: customer.tin || "",
  };
}

function validateManualCustomer(value) {
  const customer = value && typeof value === "object" ? value : {};
  const snapshot = {
    name: typeof customer.name === "string" ? customer.name.trim() : "",
    address: typeof customer.address === "string" ? customer.address.trim() : "",
    email: typeof customer.email === "string" ? customer.email.trim() : "",
    phone: typeof customer.phone === "string" ? customer.phone.trim() : "",
    tin: typeof customer.tin === "string" ? customer.tin.trim() : "",
  };
  if (!snapshot.name || snapshot.name.length > 120 || snapshot.address.length > 300 ||
    snapshot.email.length > 254 || snapshot.phone.length > 30 || snapshot.tin.length > 50 ||
    (snapshot.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(snapshot.email)) ||
    (snapshot.phone && !/^[+()\d\s-]{7,30}$/.test(snapshot.phone))) {
    throw httpError(400, "Enter valid customer name, address, email, phone and TIN details.");
  }
  return snapshot;
}

async function resolveCustomer(customerId, customerDetails, session) {
  if (customerId) {
    if (!mongoose.isValidObjectId(customerId)) {
      throw httpError(400, "Select a valid customer.");
    }
    const customer = await Customer.findById(customerId).session(session);
    if (!customer) throw httpError(404, "Customer not found.");
    return { customer: customer._id, customerSnapshot: customerSnapshotFrom(customer) };
  }
  return { customer: null, customerSnapshot: validateManualCustomer(customerDetails) };
}

function actorFields(actor) {
  if (actor.role === "system") {
    return { actorId: null, actorEmail: actor.email, actorRole: actor.role };
  }
  if (!mongoose.isValidObjectId(actor.id)) throw httpError(401, "The authenticated user is invalid.");
  return {
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
  };
}

async function recordHistory(proforma, action, actor, reason, session) {
  await ProformaHistory.create(
    [{
      proformaId: proforma._id,
      proformaNumber: proforma.proformaNumber,
      action,
      ...actorFields(actor),
      reason: reason || "",
      revisionNumber: proforma.revisionNumber,
      snapshot: serializeProforma(proforma),
    }],
    { session }
  );
}

async function allocateProformaNumber(session, settings) {
  const year = new Date().getUTCFullYear();
  const counter = await ProformaCounter.findOneAndUpdate(
    { year },
    { $inc: { value: 1 }, $setOnInsert: { year } },
    { new: true, upsert: true, setDefaultsOnInsert: true, session }
  );
  return `${settings.proformaNumberPrefix}-${year}-${String(counter.value).padStart(6, "0")}`;
}

function validateRequestId(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 100) {
    throw httpError(400, "A unique clientRequestId is required.");
  }
}

function assertCanEdit(proforma, actor, canEditAny = false) {
  if (canEditAny) return;
  if (String(proforma.createdBy) !== String(actor.id)) {
    throw httpError(403, "You can only change drafts that you created.");
  }
}

function proformaData(actor, settings, customer, pricing, values, fields = {}) {
  return {
    ...fields,
    proformaNumber: fields.proformaNumber,
    customer: customer.customer,
    customerSnapshot: customer.customerSnapshot,
    items: pricing.items,
    subtotal: pricing.subtotal,
    discountTotal: pricing.discountTotal,
    manualDiscountPercent: pricing.manualDiscountPercent,
    taxTotal: pricing.taxTotal,
    otherCharges: pricing.otherCharges,
    grandTotal: pricing.grandTotal,
    taxTreatment: pricing.taxTreatment,
    currency: "RWF",
    validUntil: validateValidityDate(values.validUntil, settings.proformaValidityDays),
    notes: validateNotes(values.notes, "Notes"),
    terms: validateNotes(values.terms, "Terms"),
    createdBy: actor.id,
    createdByEmail: actor.email,
  };
}

export async function createProformaDraft(values, actor) {
  validateRequestId(values.clientRequestId);
  const prior = await Proforma.findOne({ clientRequestId: values.clientRequestId });
  if (prior) {
    if (String(prior.createdBy) !== String(actor.id)) {
      throw httpError(409, "This request ID has already been used.");
    }
    return { proforma: prior, duplicate: true };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      let created;
      await session.withTransaction(async () => {
        const settings = await getSettings(session);
        const customer = await resolveCustomer(values.customerId, values.customer, session);
        if (values.otherCharges !== undefined &&
          Number(values.otherCharges) !== 0 &&
          actor.role !== "administration") {
          throw httpError(403, "Only an administrator can add other charges.");
        }
        const pricing = await priceProformaItems({
          items: values.items,
          customerId: customer.customer,
          discountId: values.discountId,
          manualDiscountPercent: values.manualDiscountPercent ?? 0,
          taxTreatment: "unconfigured",
          ignoreProductTaxRates: true,
          otherCharges: values.otherCharges || 0,
          session,
        });
        const proformaNumber = await allocateProformaNumber(session, settings);
        const [proforma] = await Proforma.create(
          [{
            ...proformaData(actor, settings, customer, pricing, values, { proformaNumber }),
            clientRequestId: values.clientRequestId,
            status: "draft",
            revisionNumber: 1,
          }],
          { session }
        );
        await recordHistory(proforma, "draft_created", actor, "", session);
        created = proforma;
      });
      return { proforma: created, duplicate: false };
    } catch (error) {
      if (error.code === 11000 && attempt < 2) {
        const duplicate = await Proforma.findOne({ clientRequestId: values.clientRequestId });
        if (duplicate) {
          if (String(duplicate.createdBy) !== String(actor.id)) {
            throw httpError(409, "This request ID has already been used.");
          }
          return { proforma: duplicate, duplicate: true };
        }
        continue;
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
  throw httpError(409, "Unable to allocate a unique proforma number. Please retry.");
}

export async function updateProformaDraft(id, values, actor, canEditAny = false) {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Invalid proforma ID.");
  const session = await mongoose.startSession();
  try {
    let updated;
    await session.withTransaction(async () => {
      const proforma = await Proforma.findOne({ _id: id, latestRevision: true }).session(session);
      if (!proforma) throw httpError(404, "Proforma not found.");
      if (proforma.status !== "draft") throw httpError(409, "Only drafts can be edited.");
      assertCanEdit(proforma, actor, canEditAny);
      const settings = await getSettings(session);
      const customer = await resolveCustomer(values.customerId, values.customer, session);
      if (values.otherCharges !== undefined && actor.role !== "administration") {
        throw httpError(403, "Only an administrator can change other charges.");
      }
      const pricing = await priceProformaItems({
        items: values.items,
        customerId: customer.customer,
        discountId: values.discountId,
        manualDiscountPercent: values.manualDiscountPercent ?? Number(proforma.manualDiscountPercent || 0),
        taxTreatment: "unconfigured",
        ignoreProductTaxRates: true,
        otherCharges: values.otherCharges ?? Number(proforma.otherCharges.toString()),
        session,
      });
      const next = proformaData(actor, settings, customer, pricing, values, {
        proformaNumber: proforma.proformaNumber,
        revisionNumber: proforma.revisionNumber,
        clientRequestId: proforma.clientRequestId,
        latestRevision: true,
        status: "draft",
      });
      next.createdBy = proforma.createdBy;
      next.createdByEmail = proforma.createdByEmail;
      Object.assign(proforma, next, {
        approvalRequired: false,
        approvalStatus: "not_required",
        approvedBy: null,
        approvedByEmail: "",
      });
      await proforma.save({ session });
      await recordHistory(proforma, "draft_updated", actor, values.reason || "", session);
      updated = proforma;
    });
    return updated;
  } finally {
    await session.endSession();
  }
}

function pricingChanges(beforeItems, afterItems, oldTreatment, newTreatment) {
  const oldItems = new Map(beforeItems.map(item => [String(item.productId), item]));
  const changes = afterItems.flatMap(item => {
    const old = oldItems.get(String(item.productId));
    if (!old) return [];
    const taxesMatter = oldTreatment !== "unconfigured" || newTreatment !== "unconfigured";
    const changed = old.unitPrice.toString() !== item.unitPrice ||
      (taxesMatter && old.taxRate !== item.taxRate) ||
      old.discountPercent !== item.discountPercent;
    if (!changed) return [];
    return [{
      productId: String(item.productId),
      name: item.name,
      previousUnitPrice: old.unitPrice.toString(),
      currentUnitPrice: item.unitPrice,
      previousTaxRate: old.taxRate,
      currentTaxRate: item.taxRate,
      previousDiscountPercent: old.discountPercent,
      currentDiscountPercent: item.discountPercent,
    }];
  });
  if (oldTreatment !== newTreatment) {
    changes.push({ field: "taxTreatment", previous: oldTreatment, current: newTreatment });
  }
  return changes;
}

function needsApproval(pricing, settings) {
  if (!settings.proformaApprovalsEnabled) return false;
  const valueThreshold = settings.approvalValueThreshold;
  const discountThreshold = settings.approvalDiscountPercent;
  if (valueThreshold === null || discountThreshold === null) {
    throw httpError(409, "Approval thresholds are enabled but not fully configured.");
  }
  const highestDiscount = Math.max(0, ...pricing.items.map(item => item.discountPercent || 0));
  return Number(pricing.grandTotal) > valueThreshold || highestDiscount > discountThreshold;
}

export async function issueProforma(id, values, actor, canIssueAny = false) {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Invalid proforma ID.");
  const session = await mongoose.startSession();
  try {
    let issued;
    await session.withTransaction(async () => {
      const proforma = await Proforma.findOne({ _id: id, latestRevision: true }).session(session);
      if (!proforma) throw httpError(404, "Proforma not found.");
      if (proforma.status !== "draft") throw httpError(409, "Only drafts can be issued.");
      assertCanEdit(proforma, actor, canIssueAny);
      const settings = await getSettings(session);
      const pricing = await priceProformaItems({
        items: proforma.items.map(item => ({ productId: item.productId, quantity: item.quantity })),
        customerId: proforma.customer,
        discountId: proforma.items.find(item => item.discountId)?.discountId,
        manualDiscountPercent: Number(proforma.manualDiscountPercent || 0),
        taxTreatment: "unconfigured",
        ignoreProductTaxRates: true,
        otherCharges: proforma.otherCharges.toString(),
        session,
      });
      const changes = pricingChanges(proforma.items, pricing.items, proforma.taxTreatment, pricing.taxTreatment);
      if (changes.length && values.confirmPriceChanges !== true) {
        throw httpError(409, "Product prices changed since this draft was prepared. Review and confirm the revised prices.", { priceChanges: changes });
      }
      proforma.items = pricing.items;
      proforma.subtotal = pricing.subtotal;
      proforma.discountTotal = pricing.discountTotal;
      proforma.manualDiscountPercent = pricing.manualDiscountPercent;
      proforma.taxTotal = pricing.taxTotal;
      proforma.otherCharges = pricing.otherCharges;
      proforma.grandTotal = pricing.grandTotal;
      proforma.taxTreatment = pricing.taxTreatment;
      proforma.validUntil = validateValidityDate(
        values.validUntil || proforma.validUntil.toISOString().slice(0, 10),
        settings.proformaValidityDays
      );
      proforma.approvalRequired = needsApproval(pricing, settings);
      if (!proforma.approvalRequired) {
        proforma.approvalStatus = "not_required";
      } else if (changes.length && proforma.approvalStatus === "approved") {
        proforma.approvalStatus = "not_required";
      }
      if (proforma.approvalRequired && proforma.approvalStatus !== "approved") {
        proforma.approvalStatus = "pending";
        await proforma.save({ session });
        await recordHistory(proforma, "approval_requested", actor, "Approval required before issue.", session);
        issued = { proforma, awaitingApproval: true };
        return;
      }
      proforma.status = "issued";
      proforma.issueDate = new Date();
      proforma.issuedBy = actor.id;
      proforma.issuedByEmail = actor.email;
      await proforma.save({ session });
      await recordHistory(proforma, "issued", actor, "", session);
      issued = { proforma, awaitingApproval: false };
    });
    return issued;
  } finally {
    await session.endSession();
  }
}

export async function approveProforma(id, actor, reason = "") {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Invalid proforma ID.");
  const session = await mongoose.startSession();
  try {
    let approved;
    await session.withTransaction(async () => {
      const proforma = await Proforma.findOne({ _id: id, latestRevision: true }).session(session);
      if (!proforma) throw httpError(404, "Proforma not found.");
      if (proforma.status !== "draft" || proforma.approvalStatus !== "pending") {
        throw httpError(409, "This proforma is not waiting for approval.");
      }
      proforma.approvalStatus = "approved";
      proforma.approvedBy = actor.id;
      proforma.approvedByEmail = actor.email;
      await proforma.save({ session });
      await recordHistory(proforma, "approved", actor, reason, session);
      approved = proforma;
    });
    return approved;
  } finally {
    await session.endSession();
  }
}

export async function rejectProformaApproval(id, actor, reason = "") {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Invalid proforma ID.");
  if (typeof reason !== "string" || !reason.trim()) {
    throw httpError(400, "Enter a reason for rejecting this approval request.");
  }
  const session = await mongoose.startSession();
  try {
    let rejected;
    await session.withTransaction(async () => {
      const proforma = await Proforma.findOne({ _id: id, latestRevision: true }).session(session);
      if (!proforma) throw httpError(404, "Proforma not found.");
      if (proforma.status !== "draft" || proforma.approvalStatus !== "pending") {
        throw httpError(409, "This proforma is not waiting for approval.");
      }
      proforma.approvalStatus = "rejected";
      proforma.approvedBy = actor.id;
      proforma.approvedByEmail = actor.email;
      await proforma.save({ session });
      await recordHistory(proforma, "approval_rejected", actor, reason, session);
      rejected = proforma;
    });
    return rejected;
  } finally {
    await session.endSession();
  }
}

export async function decideCustomerProforma(id, decision, actor, reason = "") {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Invalid proforma ID.");
  const session = await mongoose.startSession();
  try {
    let decided;
    let expired = false;
    await session.withTransaction(async () => {
      const proforma = await Proforma.findOne({ _id: id, latestRevision: true }).session(session);
      if (!proforma) throw httpError(404, "Proforma not found.");
      if (proforma.status !== "issued") throw httpError(409, "Only issued proformas can be accepted or rejected.");
      if (proforma.validUntil < new Date()) {
        proforma.status = "expired";
        await proforma.save({ session });
        await recordHistory(proforma, "expired", actor, "Validity period elapsed.", session);
        expired = true;
        return;
      }
      proforma.status = decision;
      if (decision === "accepted") proforma.acceptedByEmail = actor.email;
      if (decision === "rejected") proforma.rejectedByEmail = actor.email;
      await proforma.save({ session });
      await recordHistory(proforma, decision, actor, reason, session);
      decided = proforma;
    });
    if (expired) throw httpError(409, "This proforma has expired.");
    return decided;
  } finally {
    await session.endSession();
  }
}

async function createNextRevision(proforma, actor, settings, session, action, values = {}) {
  const customer = proforma.customer
    ? { customer: proforma.customer, customerSnapshot: proforma.customerSnapshot.toObject() }
    : { customer: null, customerSnapshot: proforma.customerSnapshot.toObject() };
  const pricing = await priceProformaItems({
    items: values.items || proforma.items.map(item => ({ productId: item.productId, quantity: item.quantity })),
    customerId: customer.customer,
    discountId: values.discountId ?? proforma.items.find(item => item.discountId)?.discountId,
    manualDiscountPercent: values.manualDiscountPercent ?? Number(proforma.manualDiscountPercent || 0),
    taxTreatment: "unconfigured",
    ignoreProductTaxRates: true,
    otherCharges: values.otherCharges ?? proforma.otherCharges.toString(),
    session,
  });
  const previous = serializeProforma(proforma);
  proforma.status = action === "renewed" ? "expired" : "revised";
  proforma.latestRevision = false;
  await proforma.save({ session });
  await recordHistory(proforma, action, actor, values.reason || "", session);

  const valuesToCopy = proforma.toObject();
  delete valuesToCopy._id;
  delete valuesToCopy.__v;
  delete valuesToCopy.createdAt;
  delete valuesToCopy.updatedAt;
  Object.assign(valuesToCopy, {
    proformaNumber: proforma.proformaNumber,
    revisionNumber: proforma.revisionNumber + 1,
    latestRevision: true,
    revisedFrom: action === "revised" ? proforma._id : null,
    renewedFrom: action === "renewed" ? proforma._id : null,
    customer: customer.customer,
    customerSnapshot: customer.customerSnapshot,
    items: pricing.items,
    subtotal: pricing.subtotal,
    discountTotal: pricing.discountTotal,
    manualDiscountPercent: pricing.manualDiscountPercent,
    taxTotal: pricing.taxTotal,
    otherCharges: pricing.otherCharges,
    grandTotal: pricing.grandTotal,
    taxTreatment: pricing.taxTreatment,
    validUntil: validateValidityDate(values.validUntil, settings.proformaValidityDays),
    notes: values.notes ?? proforma.notes,
    terms: values.terms ?? proforma.terms,
    status: "draft",
    approvalStatus: "not_required",
    approvalRequired: false,
    issueDate: null,
    issuedBy: null,
    issuedByEmail: "",
    approvedBy: null,
    approvedByEmail: "",
    acceptedByEmail: "",
    rejectedByEmail: "",
    cancelledByEmail: "",
    convertedSaleId: null,
    clientRequestId: undefined,
    createdBy: actor.id,
    createdByEmail: actor.email,
  });
  const [created] = await Proforma.create([valuesToCopy], { session });
  await recordHistory(created, action === "renewed" ? "renewed" : "draft_created", actor, values.reason || "", session);
  return { proforma: created, previous };
}

export async function reviseProforma(id, values, actor, canReviseAny = false) {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Invalid proforma ID.");
  if (typeof values.reason !== "string" || !values.reason.trim()) {
    throw httpError(400, "Enter a reason for the revision.");
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const proforma = await Proforma.findOne({ _id: id, latestRevision: true }).session(session);
      if (!proforma) throw httpError(404, "Proforma not found.");
      if (!["issued", "accepted"].includes(proforma.status)) {
        throw httpError(409, "Only issued or accepted proformas can be revised.");
      }
      assertCanEdit(proforma, actor, canReviseAny);
      const settings = await getSettings(session);
      result = await createNextRevision(proforma, actor, settings, session, "revised", values);
    });
    return result.proforma;
  } finally {
    await session.endSession();
  }
}

export async function renewProforma(id, values, actor, canRenewAny = false) {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Invalid proforma ID.");
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const proforma = await Proforma.findOne({ _id: id, latestRevision: true }).session(session);
      if (!proforma) throw httpError(404, "Proforma not found.");
      if (proforma.status !== "expired") throw httpError(409, "Only expired proformas can be renewed.");
      assertCanEdit(proforma, actor, canRenewAny);
      const settings = await getSettings(session);
      result = await createNextRevision(proforma, actor, settings, session, "renewed", values);
    });
    return result.proforma;
  } finally {
    await session.endSession();
  }
}

export async function cancelProforma(id, actor, reason = "", canCancelAny = false) {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Invalid proforma ID.");
  const session = await mongoose.startSession();
  try {
    let cancelled;
    await session.withTransaction(async () => {
      const proforma = await Proforma.findOne({ _id: id, latestRevision: true }).session(session);
      if (!proforma) throw httpError(404, "Proforma not found.");
      if (!canCancelAny && proforma.status === "draft") assertCanEdit(proforma, actor);
      if (!canCancelAny && proforma.status !== "draft") {
        throw httpError(403, "Only an administrator or DAF may cancel an issued or accepted proforma.");
      }
      if (!["draft", "issued", "accepted"].includes(proforma.status)) {
        throw httpError(409, "This proforma cannot be cancelled.");
      }
      proforma.status = "cancelled";
      proforma.cancelledByEmail = actor.email;
      await proforma.save({ session });
      await recordHistory(proforma, "cancelled", actor, reason, session);
      cancelled = proforma;
    });
    return cancelled;
  } finally {
    await session.endSession();
  }
}

export async function expireDueProformas() {
  const due = await Proforma.find({
    status: "issued",
    latestRevision: true,
    validUntil: { $lt: new Date() },
  }).limit(200).lean();
  for (const candidate of due) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const proforma = await Proforma.findOneAndUpdate(
          {
            _id: candidate._id,
            status: "issued",
            latestRevision: true,
            validUntil: { $lt: new Date() },
          },
          { $set: { status: "expired" } },
          { new: true, session }
        );
        if (!proforma) return;
        const systemActor = {
          id: null,
          email: "system:expiry",
          role: "system",
        };
        await recordHistory(proforma, "expired", systemActor, "Validity period elapsed.", session);
      });
    } finally {
      await session.endSession();
    }
  }
  return due.length;
}
