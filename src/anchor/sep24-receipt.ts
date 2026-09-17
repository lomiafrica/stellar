import type { LastMileResult } from "./last-mile.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** HTML receipt after a sandbox Wave / MTN / SPI last mile. */
export function renderSep24CreditReceipt(credit: LastMileResult): string {
  const rail = escapeHtml(credit.rail);
  const amount = escapeHtml(credit.amountXof);
  const phone = escapeHtml(credit.phone);
  const id = escapeHtml(credit.payoutId);
  const kind = escapeHtml(credit.kind);
  const message = escapeHtml(credit.message);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sandbox ${kind} credit</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 28rem; margin: 2rem auto; padding: 0 1rem; color: #111; }
    p { color: #555; font-size: 0.95rem; }
    dl { margin: 1.25rem 0; }
    dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: #777; }
    dd { margin: 0 0 0.85rem; }
  </style>
</head>
<body>
  <h1>Sandbox ${rail} credit</h1>
  <p>Testnet SEP-24. This is a sandbox last-mile receipt. No live mobile money.</p>
  <dl>
    <dt>Status</dt>
    <dd>${escapeHtml(credit.status)}</dd>
    <dt>Amount (XOF)</dt>
    <dd>${amount}</dd>
    <dt>Phone</dt>
    <dd>${phone}</dd>
    <dt>Transaction</dt>
    <dd>${id}</dd>
  </dl>
  <p>${message}</p>
</body>
</html>`;
}
