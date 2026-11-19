import { createHash } from "node:crypto";

function normalizedKey(value) {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US")
    : "";
}

function addIndexValue(index, value, entry) {
  const key = normalizedKey(value);
  if (!key) return;
  const entries = index.get(key) || new Map();
  entries.set(entry.listId, entry);
  index.set(key, entries);
}

function createMatch(record, entry, kind, matchBy) {
  return {
    kind,
    posId: String(record._id),
    posName: record.name,
    ...(kind === "product" ? { posSku: record.sku, posPrice: record.sellingPrice } : {
      posEmail: record.email || "",
      posPhone: record.phone || "",
      posAddress: record.address || "",
    }),
    quickBooksListId: entry.listId,
    quickBooksName: entry.fullName || entry.name,
    matchBy,
    alreadyLinked: record.quickBooksItemListId === entry.listId ||
      record.quickBooksListId === entry.listId,
    previousListId: kind === "product" ? record.quickBooksItemListId || null : record.quickBooksListId || null,
  };
}

function buildListPlan(records, entries, kind, truncated) {
  const mappingField = kind === "product" ? "quickBooksItemListId" : "quickBooksListId";
  const eligible = records.filter(record => record.active !== false);
  const entriesById = new Map(entries.map(entry => [entry.listId, entry]));
  const mappedOwners = new Map();
  for (const record of records) {
    const listId = record[mappingField];
    if (!listId) continue;
    const owners = mappedOwners.get(listId) || [];
    owners.push(record);
    mappedOwners.set(listId, owners);
  }

  const matches = [];
  const ambiguous = [];
  const unmatched = [];
  const conflicts = [];
  const unavailable = [];
  const reservedListIds = new Set(mappedOwners.keys());

  for (const record of eligible.filter(item => item[mappingField])) {
    const listId = record[mappingField];
    const owners = mappedOwners.get(listId);
    if (owners.length > 1) {
      conflicts.push({ posName: record.name, reason: "QuickBooks record is already linked to multiple POS records." });
      continue;
    }
    const entry = entriesById.get(listId);
    if (!entry) {
      unavailable.push({ posName: record.name, reason: "Linked QuickBooks record is not in the active catalog." });
      continue;
    }
    matches.push(createMatch(record, entry, kind, "existing link"));
  }

  if (truncated) {
    for (const record of eligible.filter(item => !item[mappingField])) {
      unavailable.push({ posName: record.name, reason: "QuickBooks catalog is truncated; exact matching is incomplete." });
    }
    return { matches, ambiguous, unmatched, conflicts, unavailable };
  }

  const nameIndex = new Map();
  for (const entry of entries) {
    addIndexValue(nameIndex, entry.name, entry);
    addIndexValue(nameIndex, entry.fullName, entry);
  }

  const candidatesByListId = new Map();
  for (const record of eligible.filter(item => !item[mappingField])) {
    const sourceKeys = kind === "product"
      ? [
        ["SKU", normalizedKey(record.sku)],
        ["name", normalizedKey(record.name)],
      ]
      : [["name", normalizedKey(record.name)]];
    const matchedEntries = new Map();
    const matchSources = new Map();
    for (const [source, key] of sourceKeys) {
      if (!key) continue;
      for (const [listId, entry] of nameIndex.get(key) || []) {
        matchedEntries.set(listId, entry);
        const sources = matchSources.get(listId) || [];
        sources.push(source);
        matchSources.set(listId, sources);
      }
    }

    if (matchedEntries.size === 0) {
      unmatched.push({ posName: record.name, reason: "No exact QuickBooks name match." });
      continue;
    }
    if (matchedEntries.size > 1) {
      ambiguous.push({ posName: record.name, reason: "Exact name/SKU matches more than one QuickBooks record." });
      continue;
    }
    const [listId, entry] = matchedEntries.entries().next().value;
    if (reservedListIds.has(listId)) {
      conflicts.push({ posName: record.name, reason: "Exact QuickBooks record is already linked to another POS record." });
      continue;
    }
    const candidates = candidatesByListId.get(listId) || [];
    candidates.push({ record, entry, matchBy: [...new Set(matchSources.get(listId))].join(" and ") });
    candidatesByListId.set(listId, candidates);
  }

  for (const [listId, candidates] of candidatesByListId) {
    if (candidates.length > 1) {
      for (const { record } of candidates) {
        conflicts.push({ posName: record.name, reason: "Multiple POS records exactly match the same QuickBooks record." });
      }
      continue;
    }
    const [{ record, entry, matchBy }] = candidates;
    reservedListIds.add(listId);
    matches.push(createMatch(record, entry, kind, matchBy));
  }

  return { matches, ambiguous, unmatched, conflicts, unavailable };
}

function summarize(plan) {
  return {
    matched: plan.matches.length,
    ambiguous: plan.ambiguous.length,
    unmatched: plan.unmatched.length,
    conflicts: plan.conflicts.length,
    unavailable: plan.unavailable.length,
  };
}

function createToken(matches) {
  const snapshots = matches.map(match => ({
    kind: match.kind,
    posId: match.posId,
    quickBooksListId: match.quickBooksListId,
    posName: match.posName,
    ...(match.kind === "product"
      ? { posSku: match.posSku, posPrice: match.posPrice }
      : { posEmail: match.posEmail, posPhone: match.posPhone, posAddress: match.posAddress }),
    previousListId: match.previousListId,
    alreadyLinked: match.alreadyLinked,
  })).sort((left, right) =>
    left.kind.localeCompare(right.kind) || left.posId.localeCompare(right.posId)
  );
  return createHash("sha256").update(JSON.stringify(snapshots)).digest("hex");
}

export function buildQuickBooksAutoMatchPlan({ products, customers, catalogs }) {
  const supportedItems = catalogs.items.filter(item =>
    item.isSalesItem && (item.type === "inventory" || item.type === "inventory_assembly")
  );
  const productPlan = buildListPlan(products, supportedItems, "product", catalogs.truncated.items);
  const customerPlan = buildListPlan(customers, catalogs.customers, "customer", catalogs.truncated.customers);
  const matches = [...productPlan.matches, ...customerPlan.matches];

  return {
    token: createToken(matches),
    products: summarize(productPlan),
    customers: summarize(customerPlan),
    matches,
    truncated: {
      items: catalogs.truncated.items,
      customers: catalogs.truncated.customers,
    },
  };
}
