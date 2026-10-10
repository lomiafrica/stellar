import "../src/env.js";
import { bridgeClientFromEnv, readBridgeId } from "../src/bridge/client.js";
import { readString } from "../src/json.js";

const OMNIBUS =
  process.env.OMNIBUS_PUBLIC_KEY?.trim() ||
  "GD6PH2FAK5DQFFFALZVAT337R7NDGSPWT4R6UBGA5GYLL7N5U4C4GI7I";

async function main(): Promise<void> {
  if (!process.env.BRIDGE_API_KEY?.trim()) {
    throw new Error("BRIDGE_API_KEY unset. Sandbox keys come from Bridge support.");
  }
  const client = bridgeClientFromEnv();
  const base = (process.env.PUBLIC_BASE_URL ?? "https://lab-production-5fac.up.railway.app").replace(
    /\/$/,
    "",
  );
  let customerId = process.env.BRIDGE_CUSTOMER_ID?.trim() ?? "";
  if (!customerId) {
    const created = await client.createCustomer({
      email: process.env.BRIDGE_CUSTOMER_EMAIL?.trim() || "babacar@lomi.africa",
      firstName: "Babacar",
      lastName: "Diop",
    });
    customerId = readBridgeId(created);
    await client.simulateKycApproval(customerId);
  }
  let virtualAccountId = process.env.BRIDGE_VIRTUAL_ACCOUNT_ID?.trim() ?? "";
  if (!virtualAccountId) {
    const account = await client.createVirtualAccount({
      customerId,
      address: OMNIBUS,
      blockchainMemo: "lomi-treasury",
    });
    virtualAccountId = readBridgeId(account);
  }
  let webhookId = process.env.BRIDGE_WEBHOOK_ID?.trim() ?? "";
  let publicKey = "";
  if (!webhookId) {
    const hook = await client.createWebhook({
      url: `${base}/bridge/webhook`,
      eventCategories: ["virtual_account.activity", "transfer"],
    });
    webhookId = readBridgeId(hook);
    publicKey = readString(hook, "public_key") ?? "";
    await client.enableWebhook(webhookId);
  }
  console.log(
    JSON.stringify(
      {
        BRIDGE_CUSTOMER_ID: customerId,
        BRIDGE_VIRTUAL_ACCOUNT_ID: virtualAccountId,
        BRIDGE_WEBHOOK_ID: webhookId,
        BRIDGE_WEBHOOK_PUBLIC_KEY: publicKey,
        omnibus: OMNIBUS,
        webhook_url: `${base}/bridge/webhook`,
      },
      null,
      2,
    ),
  );
  console.log(
    "Paste BRIDGE_API_KEY, the ids, and the PEM into the lab service. Do not commit them.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
