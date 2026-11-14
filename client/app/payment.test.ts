import { describe, expect, it } from "vitest";
import { buildMtnMomoPaymentPayload } from "./payment";

describe("buildMtnMomoPaymentPayload", () => {
  it("creates a dialable QR URI that decodes to the complete USSD code including #", () => {
    const payload = buildMtnMomoPaymentPayload(23760.4, "1616913");
    expect(payload).toEqual({
      amount: 23760,
      ussdCode: "*182*8*1*1616913*23760#",
      qrValue: "tel:*182*8*1*1616913*23760%23",
    });
    expect(decodeURIComponent(payload.qrValue.slice("tel:".length))).toBe(payload.ussdCode);
  });
});
