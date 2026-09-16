import { Keypair } from "@stellar/stellar-sdk";

const pair = Keypair.random();
process.stdout.write(
  `SEP10_SIGNING_PUBLIC_KEY=${pair.publicKey()}\nSEP10_SIGNING_SEED=${pair.secret()}\n`,
);
