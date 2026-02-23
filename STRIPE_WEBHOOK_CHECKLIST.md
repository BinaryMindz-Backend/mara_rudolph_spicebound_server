# Stripe webhook – fix “plan stays FREE” (mara-server)

Your logs show **checkout created** but **no webhook received**. So Stripe is not calling your server. Follow this exactly.

---

## Step 1: Open Stripe in **Test mode**

1. Go to https://dashboard.stripe.com
2. In the top-left or sidebar, find the **Test mode** toggle.
3. Turn it **ON** (you must see “Test mode” / orange badge). All steps below are in Test mode.

---

## Step 2: Add a **Webhook** endpoint (Test mode)

1. Go to **Developers → Webhooks**:  
   https://dashboard.stripe.com/test/webhooks
2. Click **“Add an endpoint”** (or “Add endpoint”).
3. **Endpoint URL:** type exactly (no space, no trailing slash):
   ```
   https://api.readspicebound.com/stripe/webhook
   ```
4. **Listen to:** choose “Events on your account”.
5. Click **“Select events”** and enable at least:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `invoice.payment_succeeded`
   - `customer.subscription.deleted`
6. Click **“Add endpoint”**.

---

## Step 3: Copy the **signing secret** for this endpoint

1. On the Webhooks page you should see your new endpoint.
2. Click on it.
3. Under **“Signing secret”**, click **“Reveal”** or **“Click to reveal”**.
4. Copy the value (starts with `whsec_`). This is the secret **for this Test endpoint**.

---

## Step 4: Set the secret on mara-server

1. SSH to mara-server.
2. Edit `.env` in your app directory (e.g. `~/server/.env`):
   ```bash
   nano ~/server/.env
   ```
3. Set (or update) this line with the secret you just copied:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. Save and exit.

---

## Step 5: Restart the API

On mara-server:

```bash
cd ~/server
docker compose --profile prod restart server
```

Wait until the container is up (e.g. “Nest application successfully started” in logs).

---

## Step 6: Do one test payment

1. Open https://readspicebound.com (or your frontend).
2. Log in as a test user.
3. Go to subscription/checkout and start a payment.
4. Use Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC.
5. Complete the payment (submit the checkout).

---

## Step 7: Verify in Stripe

1. Go to **Developers → Webhooks** (Test mode):  
   https://dashboard.stripe.com/test/webhooks
2. Click your endpoint `https://api.readspicebound.com/stripe/webhook`.
3. Open **“Recent deliveries”** or **“Logs”**.
4. You should see **at least one** delivery attempt (success or failure) for the time you just paid.

- **If you see attempts:** Stripe is sending; check step 8.
- **If you still see 0 attempts:** The endpoint is wrong or not in Test mode. Repeat from step 1 and make sure you are on **Test** webhooks and the URL is exactly as above.

---

## Step 8: Verify on mara-server

On the server run:

```bash
docker logs spicebound_server_api 2>&1 | grep -E "STRIPE WEBHOOK|WEBHOOK.*received|PREMIUM|invoice"
```

You should see lines like:

- `[STRIPE WEBHOOK] POST /stripe/webhook at ...`
- `[WEBHOOK] POST /stripe/webhook received`
- `Invoice paid → User ... upgraded to PREMIUM` or similar

Then call **GET /subscriptions** (or refresh the subscription page); the plan should be **PREMIUM**.

---

## If you use “Event destinations” instead of “Webhooks”

- If you only added an endpoint under **Event destinations**, add one under **Developers → Webhooks** as above.
- For **test** payments, the endpoint must be in **Test** mode and its signing secret must be in `STRIPE_WEBHOOK_SECRET` on mara-server.
- “Live” destinations do **not** receive test-mode events.

---

## Quick recap

| What you see | Meaning |
|--------------|--------|
| No `[STRIPE WEBHOOK] POST` in logs | Stripe is not sending to your URL. Fix endpoint URL and Test mode. |
| `[STRIPE WEBHOOK] POST` but 400 / signature error | Wrong or missing `STRIPE_WEBHOOK_SECRET` for this endpoint. |
| `[STRIPE WEBHOOK] POST` and “Webhook processed successfully” but plan still FREE | Logic bug (e.g. user not found, wrong event). Share those log lines. |
