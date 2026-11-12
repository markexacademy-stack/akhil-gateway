import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cleanText, toPaise } from "./lib/money.js";
import { checkoutSignatureValid, sign, webhookSignatureValid } from "./lib/razorpay.js";
import { applyStatus, statusFromProvider } from "./lib/status.js";
import { handler } from "./payments.js";

test("accepts rupee amounts inside the existing checkout range", () => {
  assert.equal(toPaise("5000"), 500000);
  assert.equal(toPaise("10.5"), 1050);
  assert.equal(toPaise("1.00"), 100);
  assert.equal(toPaise("100000"), 10000000);
});

test("rejects invalid amounts and currencies shapes", () => {
  assert.equal(toPaise("0.50"), null);
  assert.equal(toPaise("100000.01"), null);
  assert.equal(toPaise("-5"), null);
  assert.equal(toPaise("10.555"), null);
  assert.equal(toPaise("INR"), null);
  assert.equal(cleanText("  Ada   Lovelace  ", 80), "Ada Lovelace");
  assert.equal(cleanText("x".repeat(81), 80), undefined);
});

test("checkout and webhook signatures must match the secret", () => {
  const secret = "test_secret";
  const signature = sign(secret, "order_1|pay_1");
  assert.equal(checkoutSignatureValid(secret, "order_1", "pay_1", signature), true);
  assert.equal(checkoutSignatureValid(secret, "order_1", "pay_1", "deadbeef"), false);
  const body = JSON.stringify({ event: "payment.captured" });
  assert.equal(webhookSignatureValid(secret, body, sign(secret, body)), true);
  assert.equal(webhookSignatureValid(secret, body, sign("other", body)), false);
});

test("status changes do not turn a captured payment back into a pending one", () => {
  assert.equal(applyStatus("SUCCESS", "PROCESSING"), "SUCCESS");
  assert.equal(applyStatus("SUCCESS", "FAILED"), "SUCCESS");
  assert.equal(applyStatus("SUCCESS", "REFUNDED"), "REFUNDED");
  assert.equal(applyStatus("PENDING", "FAILED"), "FAILED");
  assert.equal(applyStatus("CANCELLED", "SUCCESS"), "SUCCESS");
  assert.equal(applyStatus("PROCESSING", "SUCCESS"), "SUCCESS");
  assert.deepEqual(statusFromProvider("captured"), { paymentStatus: "SUCCESS", settlementStatus: "PENDING" });
  assert.deepEqual(statusFromProvider("authorized"), { paymentStatus: "PROCESSING", settlementStatus: "PENDING" });
});

test("card routes stay closed when the gateway is not configured", async () => {
  const previous = { ...process.env };
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.PAYMENT_PROVIDER_PUBLIC_KEY;
  delete process.env.PAYMENT_PROVIDER_SECRET_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await handler({
    httpMethod: "POST",
    path: "/api/payments/create-order",
    body: JSON.stringify({ amount: "5000", currency: "USD", payment_method: "credit_card" })
  });
  assert.equal(response.statusCode, 503);
  assert.match(response.body, /not live yet/);
  process.env = previous;
});

test("the UPI page still builds the QR and does not collect card numbers", () => {
  const page = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  assert.match(page, /8137864105@superyes/);
  assert.doesNotMatch(page, /akhilshijo5@oksbi/);
  assert.match(page, /upi:\/\/pay/);
  assert.match(page, /qrcode\(0, "M"\)/);
  assert.doesNotMatch(page, /cc-number|cardnumber|cvv/i);
  assert.match(page, /create-order/);
  assert.match(page, /payment-result\.html/);
});
