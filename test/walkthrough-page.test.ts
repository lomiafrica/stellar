import assert from "node:assert/strict";
import test from "node:test";
import { renderWalkthroughPage } from "../src/http/walkthrough-page.js";

test("the lab home leads with Tranche 1 and keeps later work apart", () => {
  const html = renderWalkthroughPage();
  const tranche = html.indexOf("This tranche");
  const later = html.indexOf("Also on this lab");
  assert.ok(tranche >= 0 && later > tranche);
  assert.match(html, /href="\/deposit"/);
  assert.match(html, /href="\/anchor\/sep24\/flow"/);
  assert.match(
    html,
    /stellar\.expert\/explorer\/testnet\/tx\/d407b564fcf113f22711bbaa2738e4077e78b443aa9204e4566ab85f76d9eb0a/,
  );
  assert.match(html, /sandbox credit/);
  assert.match(html, /Quotes and programmatic transfer/);
  assert.doesNotMatch(html, /Airwallex|BCEAO|\$19,000/);
});
