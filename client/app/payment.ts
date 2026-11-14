export function buildMtnMomoPaymentPayload(total: number, merchantCode: string) {
  const amount = Math.round(total);
  const ussdCode = `*182*8*1*${merchantCode}*${amount}#`;
  return {
    amount,
    ussdCode,
    qrValue: `tel:${ussdCode.slice(0, -1)}%23`,
  };
}
