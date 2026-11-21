import "../src/env.js";
import { runT2Cycle, type T2CycleReport } from "../src/ops/t2-cycle.js";

const IN_CONTAINER = process.env.STELLAR_DATA_DIR === "/data";

async function runOperatorCycle(phone: string): Promise<T2CycleReport> {
  const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.LAB_API_KEY?.trim() ?? "";
  if (!base || !key) {
    throw new Error(
      "PUBLIC_BASE_URL and LAB_API_KEY are required outside the lab container",
    );
  }
  const res = await fetch(`${base}/ops/t2-cycle`, {
    method: "POST",
    headers: { "x-lab-key": key, "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const report = (await res.json()) as T2CycleReport & { message?: string };
  if (!res.ok) {
    throw new Error(report.message ?? `lab answered ${res.status}`);
  }
  return report;
}

async function main(): Promise<void> {
  const phone = process.env.T2_PHONE?.trim() || "+2250700000000";
  const report = IN_CONTAINER
    ? await runT2Cycle(phone)
    : await runOperatorCycle(phone);
  console.log(JSON.stringify(report, null, 2));
  if (!report.reconcile_ok) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
