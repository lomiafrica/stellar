export type WalletPayment = {
  hash: string;
  amount: string;
  from: string;
  to: string;
  memo: string;
  assetCode: string;
  direction: "in" | "out";
};

export type HorizonPaymentInput = {
  type: string;
  transactionHash: string;
  from: string;
  to: string;
  amount: string;
  assetCode: string;
  assetIssuer: string;
  memo: string;
};

export function usdcPaymentsFromRecords(
  accountPublicKey: string,
  issuer: string,
  records: readonly HorizonPaymentInput[],
): WalletPayment[] {
  const payments: WalletPayment[] = [];
  for (const record of records) {
    if (record.type !== "payment") continue;
    if (record.assetCode !== "USDC" || record.assetIssuer !== issuer) continue;
    if (!record.transactionHash || !record.amount) continue;
    const inbound = record.to === accountPublicKey;
    const outbound = record.from === accountPublicKey;
    if (!inbound && !outbound) continue;
    payments.push({
      hash: record.transactionHash,
      amount: record.amount,
      from: record.from,
      to: record.to,
      memo: record.memo,
      assetCode: "USDC",
      direction: inbound ? "in" : "out",
    });
  }
  return payments;
}
