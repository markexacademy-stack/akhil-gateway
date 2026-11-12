# MARKEX card payments

The public checkout remains `index.html`. UPI still builds an `upi://pay` QR for `8137864105@superyes` in the browser. Card and debit-card payments are a separate path. They open Razorpay Checkout, and this site never asks for a card number or CVV.

There is no Supabase project in this repository today, and no payment-provider account is connected. Until the credentials below are set, `POST /api/payments/create-order` returns HTTP 503. It does not mark a payment successful.

## What was found

- The live Netlify site publishes this repository root. `netlify.toml` only published the static page.
- The YouPI Node gateway (SQLite, ports 6100/7000/6001) does not run on Netlify and is not the customer page.
- No Supabase schema, auth, or Edge Functions existed.
- No PayU, Cashfree, Stripe, or Razorpay account was configured. A first card button called Razorpay from the browser and treated the popup callback as payment received. That callback is no longer treated as success.

## Provider

Razorpay is the configured adapter (`PAYMENT_PROVIDER=razorpay`). Orders are created with the secret key on the server. The browser receives only the public Key ID and the order id, then loads `https://checkout.razorpay.com/v1/checkout.js`.

Credit card and debit card both use that card window. Razorpay reports the instrument. The customer’s choice is stored as `credit_card` or `debit_card`.

A captured payment is `SUCCESS` with `settlement_status` `PENDING`. Capture is not the same as money already in the Federal Bank account. Razorpay pays the merchant bank account on its settlement cycle.

## Environment variables

Set these in the Netlify site (Site configuration → Environment variables) and in the Supabase project only where noted. Do not put the secret values in `index.html` or in any `VITE_` variable.

| Name | Where | Purpose |
| --- | --- | --- |
| `PAYMENT_PROVIDER` | Netlify function env | `razorpay` |
| `PAYMENT_PROVIDER_PUBLIC_KEY` | Netlify function env | Razorpay Key ID, `rzp_test_...` or `rzp_live_...` |
| `PAYMENT_PROVIDER_SECRET_KEY` | Netlify function env | Razorpay Key Secret. Server only. |
| `PAYMENT_WEBHOOK_SECRET` | Netlify function env | Webhook secret from the Razorpay dashboard. |
| `SUPABASE_URL` | Netlify function env | `https://<project>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Netlify function env | Service role key. Server only. Bypasses row-level security. |
| `ADMIN_ACCESS_TOKEN` | Netlify function env | Bearer token for `admin.html` and refunds. |

The Supabase anon key is not used. Do not place the service role key in the browser.

## Database

Run `supabase/migrations/20261019_payment_transactions.sql` in the Supabase SQL editor. It creates `payment_transactions` and `payment_webhook_events`, enables row-level security, and revokes access from the public `anon` and `authenticated` roles. The service role used by the function is the only writer. This script does not delete existing data.

Amounts are stored as integer paise.

## Routes

- `POST /api/payments/create-order`
- `POST /api/payments/verify`
- `POST /api/payments/cancel`
- `GET /api/payments/status/:transactionReference`
- `POST /api/payments/webhook`
- `GET /api/payments/transactions` (admin token)
- `POST /api/payments/refund` (admin token)

`/success` and `/failure` both show `payment-result.html`, which reads the saved status. Opening the success address does not mark a payment captured.

## Razorpay dashboard

1. Finish merchant approval. Test mode can be used before approval, and test payments are not bank settlements.
2. Turn on cards for the account.
3. Add the webhook `https://markex-gateway.netlify.app/api/payments/webhook`.
4. Subscribe to `payment.authorized`, `payment.captured`, `payment.failed`, `refund.processed`, and `refund.failed`.
5. Put the same webhook secret in `PAYMENT_WEBHOOK_SECRET`.
6. The settlement account is the bank account approved inside Razorpay, not a value stored in this site.

## Admin

Open `/admin.html`, enter `ADMIN_ACCESS_TOKEN`, and search the latest 50 card attempts. Refunds are requested with `POST /api/payments/refund` and the same bearer token. A refund stays incomplete until Razorpay reports `processed`.

## UPI

The QR, amount buttons, and UPI link are unchanged. UPI is still confirmed only inside the customer’s UPI app. Generating a QR does not mean the rupees arrived. Card status is not applied to UPI.

## Rollback

Remove the Netlify environment variables to make card routes return 503 again. The UPI page keeps working. Dropping the new Supabase tables is optional and should be done only if they contain nothing you need; the migration itself does not drop them.
