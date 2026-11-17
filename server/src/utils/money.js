export function toMinorUnits(value, fieldName = "Amount") {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${fieldName} must be a non-negative monetary amount.`);
  }
  const minorUnits = Math.round(amount * 100);
  if (
    !Number.isSafeInteger(minorUnits) ||
    Math.abs(amount * 100 - minorUnits) > 1e-7
  ) {
    throw new Error(`${fieldName} must be a valid amount with at most two decimal places.`);
  }
  return BigInt(minorUnits);
}

export function decimalStringFromMinorUnits(value) {
  const minorUnits = typeof value === "bigint" ? value : BigInt(value);
  const sign = minorUnits < 0n ? "-" : "";
  const absolute = minorUnits < 0n ? -minorUnits : minorUnits;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

export function percentageToBasisPoints(value, fieldName = "Percentage") {
  const percentage = Number(value);
  if (
    !Number.isFinite(percentage) ||
    percentage < 0 ||
    percentage > 100 ||
    Math.abs(percentage * 100 - Math.round(percentage * 100)) > 1e-7
  ) {
    throw new Error(`${fieldName} must be between 0 and 100 with at most two decimal places.`);
  }
  return BigInt(Math.round(percentage * 100));
}

export function roundedRatio(numerator, denominator) {
  if (denominator <= 0n) throw new Error("A positive divisor is required.");
  return (numerator + denominator / 2n) / denominator;
}

export function calculateTaxMinorUnits(taxableMinorUnits, ratePercent, treatment) {
  if (!["exclusive", "inclusive"].includes(treatment)) {
    throw new Error("Tax treatment is not configured.");
  }
  const rateBasisPoints = percentageToBasisPoints(ratePercent, "Tax rate");
  if (treatment === "inclusive") {
    return roundedRatio(taxableMinorUnits * rateBasisPoints, 10000n + rateBasisPoints);
  }
  return roundedRatio(taxableMinorUnits * rateBasisPoints, 10000n);
}
