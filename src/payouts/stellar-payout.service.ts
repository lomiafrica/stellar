import { randomUUID } from "node:crypto";
import {
  explorerAccount,
  explorerTx,
} from "../config.js";
import {
  claimPayout,
  findByPayoutId,
  readLedger,
  type StellarSettlementRecord,
  upsertSettlement,
} from "../ledger/store.js";
import { PayoutCapError, PayoutInFlightError } from "./errors.js";
import {
  getBridgeAdapter,
  type BridgeAdapter,
  type BridgeTransfer,
} from "../bridge/adapter.js";
import { mockMobileMoneyOfframp } from "../mock/offramp.js";
import {
  assertReadyToSettle,
  type ReadyState,
} from "../operator/ready.js";
import { loadSigner, type TransactionSigner } from "../stellar/signer.js";
import { stellarMemoFromPayoutId } from "../stellar/memo.js";
import {
  buildUsdcPayment,
  defaultPaymentNetwork,
  PaymentNetworkError,
  submitUsdcPayment,
  type BuiltUsdcPayment,
  type PaymentNetwork,
  type UsdcPaymentResult,
} from "../stellar/payment.js";
import { writeTestnetProof } from "../testnet-proof.js";
import type {
  CreateStellarPayoutInput,
  CreateStellarPayoutResponse,
} from "./types.js";
import { DEFAULT_DEMO_ORGANIZATION_ID } from "./types.js";

export interface SettleDemoInput {
  amount?: string;
  payoutId?: string;
  phone?: string;
  organization_id?: string;
  destination?: "self" | "beneficiary";
  last_mile_rail?: "wave" | "mtn" | "spi" | "bank";
  currency_code?: string;
  amount_number?: number;
  bridge_transfer_id?: string;
}

export interface SettleDemoResult {
  payoutId: string;
  amountUsdc: string;
  stellarTxHash: string;
  explorerAccountOmnibus: string;
  explorerAccountMerchant: string;
  explorerTx: string;
  bridgeTransferId: string;
  mockOfframp: ReturnType<typeof mockMobileMoneyOfframp>;
  settlement: StellarSettlementRecord;
  idempotentReplay: boolean;
}

export interface SettlementRuntime {
  assertReady: (minUsdc: number) => Promise<ReadyState>;
  loadOmnibusSigner: () => TransactionSigner;
  merchantPublicKey: () => string;
  network: PaymentNetwork;
  bridge: BridgeAdapter;
  now: () => number;
}

const TIMEBOUNDS_SECONDS = 180;

export async function defaultSettlementRuntime(): Promise<SettlementRuntime> {
  const network = await defaultPaymentNetwork();
  return {
    assertReady: assertReadyToSettle,
    loadOmnibusSigner: () => loadSigner("omnibus"),
    merchantPublicKey: () => loadSigner("merchant").publicKey(),
    network,
    bridge: getBridgeAdapter(),
    now: () => Date.now(),
  };
}

function usdcToday(now: number): number {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const from = start.getTime();
  return readLedger()
    .filter((row) => {
      if (row.status !== "completed" && row.status !== "processing") return false;
      const created = Date.parse(row.created_at);
      return Number.isFinite(created) && created >= from;
    })
    .reduce((sum, row) => sum + (Number(row.amount_usdc) || 0), 0);
}

export function assertUsdcCaps(amountUsdc: number, now = Date.now()): void {
  const per = Number(process.env.LAB_MAX_USDC_PER_PAYOUT ?? "100");
  const daily = Number(process.env.LAB_MAX_USDC_PER_DAY ?? "500");
  if (Number.isFinite(per) && per > 0 && amountUsdc > per) {
    throw new PayoutCapError(
      "per_payout",
      `amount ${amountUsdc} USDC exceeds LAB_MAX_USDC_PER_PAYOUT ${per}`,
    );
  }
  if (Number.isFinite(daily) && daily > 0) {
    const spent = usdcToday(now);
    if (spent + amountUsdc > daily) {
      throw new PayoutCapError(
        "daily",
        `amount ${amountUsdc} USDC plus ${spent} already sent today exceeds LAB_MAX_USDC_PER_DAY ${daily}`,
      );
    }
  }
}

function usdcAmountFromInput(input: SettleDemoInput): string {
  if (input.amount) return input.amount;
  if (input.currency_code === "USD" && input.amount_number) {
    return String(input.amount_number);
  }
  return "10";
}

function merchantAmount(input: SettleDemoInput): number {
  if (input.amount_number !== undefined) return input.amount_number;
  return Number(usdcAmountFromInput(input));
}

function recordToDemoResult(
  record: StellarSettlementRecord,
  offramp: ReturnType<typeof mockMobileMoneyOfframp>,
  idempotentReplay: boolean,
): SettleDemoResult {
  const hash = record.stellar_tx_hash ?? "";
  return {
    payoutId: record.payout_id,
    amountUsdc: record.amount_usdc,
    stellarTxHash: hash,
    explorerAccountOmnibus: record.stellar_from
      ? explorerAccount(record.stellar_from)
      : "",
    explorerAccountMerchant: record.stellar_to
      ? explorerAccount(record.stellar_to)
      : "",
    explorerTx: hash ? explorerTx(hash) : "",
    bridgeTransferId: record.bridge_transfer_id ?? "",
    mockOfframp: offramp,
    settlement: record,
    idempotentReplay,
  };
}

function buildOfframpFromRecord(
  record: StellarSettlementRecord,
): ReturnType<typeof mockMobileMoneyOfframp> {
  return {
    rail: "wave",
    amountXof: String(Math.round(Number(record.amount_usdc) * 576)),
    phone: record.mock_offramp?.phone ?? "+2250700000000",
    status: "credited",
    message: "Replay from ledger (idempotent).",
    createdAt: record.updated_at,
  };
}

function completeFromPayment(
  record: StellarSettlementRecord,
  payment: UsdcPaymentResult,
  phone?: string,
): StellarSettlementRecord {
  const offramp = mockMobileMoneyOfframp(record.amount_usdc, phone);
  return upsertSettlement({
    ...record,
    status: "completed",
    stellar_tx_hash: payment.hash,
    stellar_from: payment.from,
    stellar_to: payment.to,
    memo: payment.memo,
    mock_offramp: {
      rail: offramp.rail,
      phone: offramp.phone,
      status: offramp.status,
    },
  });
}

async function recoverProcessing(
  record: StellarSettlementRecord,
  runtime: SettlementRuntime,
  phone?: string,
): Promise<SettleDemoResult | undefined> {
  const hash = record.stellar_tx_hash;
  if (!hash) {
    upsertSettlement({ ...record, status: "failed" });
    return undefined;
  }
  const found = await runtime.network.getTransaction(hash);
  if (found.status === "SUCCESS") {
    const payment: UsdcPaymentResult = {
      hash,
      payoutId: record.payout_id,
      amount: record.amount_usdc,
      from: record.stellar_from ?? runtime.loadOmnibusSigner().publicKey(),
      to: record.stellar_to ?? runtime.merchantPublicKey(),
      memo: record.memo,
    };
    const completed = completeFromPayment(record, payment, phone);
    return recordToDemoResult(
      completed,
      buildOfframpFromRecord(completed),
      true,
    );
  }
  if (found.status === "NOT_FOUND") {
    const created = Date.parse(record.updated_at || record.created_at);
    const expired =
      Number.isFinite(created) &&
      runtime.now() / 1000 > created / 1000 + TIMEBOUNDS_SECONDS;
    if (expired) {
      upsertSettlement({ ...record, status: "failed" });
      return undefined;
    }
    throw new Error(
      `payment ${hash} is still pending; retry after timebounds`,
    );
  }
  upsertSettlement({ ...record, status: "failed" });
  throw new Error(`payment not successful: ${found.status}`);
}

async function resolveBridge(
  input: SettleDemoInput,
  amountUsdc: string,
  runtime: SettlementRuntime,
): Promise<BridgeTransfer> {
  if (input.bridge_transfer_id) {
    const existing = await runtime.bridge.getTransfer(input.bridge_transfer_id);
    if (existing) return existing;
    return {
      id: input.bridge_transfer_id,
      usdAmount: amountUsdc,
      usdcAmount: amountUsdc,
      stellarNetwork: "testnet",
      status: "completed",
      createdAt: new Date(runtime.now()).toISOString(),
    };
  }
  return runtime.bridge.createTransfer({ usdAmount: amountUsdc });
}

export async function runSettlementDemo(
  input: SettleDemoInput = {},
  runtime?: SettlementRuntime,
): Promise<SettleDemoResult> {
  const resolved = runtime ?? (await defaultSettlementRuntime());
  const payoutId = input.payoutId ?? randomUUID();
  const existing = findByPayoutId(payoutId);

  if (existing?.stellar_tx_hash && existing.status === "completed") {
    return recordToDemoResult(
      existing,
      buildOfframpFromRecord(existing),
      true,
    );
  }

  if (existing?.status === "processing") {
    const recovered = await recoverProcessing(existing, resolved, input.phone);
    if (recovered) return recovered;
  }

  const amountUsdc = usdcAmountFromInput(input);
  const organizationId = input.organization_id ?? DEFAULT_DEMO_ORGANIZATION_ID;
  const destination = input.destination ?? "self";
  const lastMileRail = input.last_mile_rail ?? "wave";
  const currencyCode = input.currency_code ?? "USD";
  const now = new Date(resolved.now()).toISOString();
  const memo = stellarMemoFromPayoutId(payoutId);

  await resolved.assertReady(Number(amountUsdc) || 10);
  assertUsdcCaps(Number(amountUsdc) || 0, resolved.now());

  const draft: StellarSettlementRecord = {
    id: existing?.id ?? randomUUID(),
    organization_id: organizationId,
    environment: "test",
    payout_id: payoutId,
    destination,
    last_mile_rail: lastMileRail,
    amount: merchantAmount(input),
    currency_code: currencyCode,
    amount_usdc: amountUsdc,
    memo,
    status: "pending",
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  const claim = claimPayout(draft);
  if (claim.kind === "replay") {
    return recordToDemoResult(
      claim.record,
      buildOfframpFromRecord(claim.record),
      true,
    );
  }
  if (claim.kind === "recover") {
    const recovered = await recoverProcessing(
      claim.record,
      resolved,
      input.phone,
    );
    if (recovered) return recovered;
  }
  if (claim.kind === "busy") {
    throw new PayoutInFlightError(payoutId);
  }

  let record = claim.record;

  const omnibus = resolved.loadOmnibusSigner();
  const merchantPk = resolved.merchantPublicKey();
  const bridge = await resolveBridge(input, amountUsdc, resolved);

  const built: BuiltUsdcPayment = await buildUsdcPayment(
    omnibus,
    merchantPk,
    amountUsdc,
    payoutId,
    resolved.network,
  );

  record = upsertSettlement({
    ...record,
    status: "processing",
    bridge_transfer_id: bridge.id,
    stellar_tx_hash: built.hash,
    stellar_from: built.from,
    stellar_to: built.to,
    memo: built.memo,
  });

  try {
    const payment = await submitUsdcPayment(built, resolved.network);
    const completed = completeFromPayment(record, payment, input.phone);
    writeTestnetProof({
      omnibusPublicKey: omnibus.publicKey(),
      merchantPublicKey: merchantPk,
      settlementTx: payment.hash,
    });
    return {
      payoutId,
      amountUsdc,
      stellarTxHash: payment.hash,
      explorerAccountOmnibus: explorerAccount(omnibus.publicKey()),
      explorerAccountMerchant: explorerAccount(merchantPk),
      explorerTx: explorerTx(payment.hash),
      bridgeTransferId: bridge.id,
      mockOfframp: mockMobileMoneyOfframp(amountUsdc, input.phone),
      settlement: completed,
      idempotentReplay: false,
    };
  } catch (err) {
    if (err instanceof PaymentNetworkError && err.kind === "send_error") {
      upsertSettlement({
        ...record,
        status: "failed",
      });
    }
    throw err;
  }
}

export async function createStellarPayout(
  input: CreateStellarPayoutInput,
  runtime?: SettlementRuntime,
): Promise<CreateStellarPayoutResponse> {
  const payoutId = input.payout_id ?? randomUUID();
  const amountUsdc =
    input.amount_usdc ??
    (input.currency_code === "USD"
      ? String(input.amount)
      : String(Math.max(1, Math.round(input.amount / 576))));

  const demo = await runSettlementDemo(
    {
      payoutId,
      amount: amountUsdc,
      amount_number: input.amount,
      currency_code: input.currency_code,
      organization_id: input.organization_id,
      destination: input.destination,
      last_mile_rail: input.last_mile_rail ?? "wave",
      phone: input.recipient?.phone,
      bridge_transfer_id: input.bridge_transfer_id,
    },
    runtime,
  );

  const kind: "withdrawal" | "beneficiary" =
    input.destination === "beneficiary" ? "beneficiary" : "withdrawal";

  return {
    success: demo.settlement.status === "completed",
    payout_id: demo.payoutId,
    kind,
    status: demo.settlement.status,
    message: demo.idempotentReplay
      ? "Idempotent replay: existing stellar settlement."
      : "Stellar USDC hop completed (testnet demo).",
    stellar_tx_hash: demo.stellarTxHash || undefined,
    explorer_tx: demo.explorerTx || undefined,
    explorer_account_omnibus: demo.explorerAccountOmnibus || undefined,
    explorer_account_merchant: demo.explorerAccountMerchant || undefined,
    bridge_transfer_id: demo.bridgeTransferId || undefined,
    settlement: demo.settlement,
  };
}

export function notReadyBody(err: {
  message: string;
  reason: string;
  hint: { faucet?: string; publicKey?: string; next?: string };
}): {
  success: false;
  message: string;
  reason: string;
  hint: { faucet?: string; publicKey?: string; next?: string };
} {
  return {
    success: false,
    message: err.message,
    reason: err.reason,
    hint: err.hint,
  };
}
