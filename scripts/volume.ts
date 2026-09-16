import { readJsonArray } from "../src/anchor/json-store.js";
import { readNumber, readString } from "../src/json.js";
import { readLedger } from "../src/ledger/store.js";

const settlements = readLedger().filter((row) => row.status === "completed");
const inbound = readJsonArray("sep31-inbound.json");
const usdc = settlements.reduce((sum, row) => sum + Number(row.amount_usdc), 0);
const xofInbound = inbound.reduce((sum, row) => {
  const amount =
    readNumber(row, "amount") ?? Number(readString(row, "amount") ?? 0);
  return sum + amount;
}, 0);

process.stdout.write(
  JSON.stringify(
    {
      completed_hops: settlements.length,
      amount_usdc: usdc,
      sep31_inbound: inbound.length,
      sep31_amount_xof: xofInbound,
    },
    null,
    2,
  ) + "\n",
);
