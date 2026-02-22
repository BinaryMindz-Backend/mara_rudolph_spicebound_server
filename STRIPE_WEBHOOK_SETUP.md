# Stripe webhook setup (mara-server / production)

If payment completes in Stripe but the **subscription plan does not update** in the app, Stripe webhooks are almost certainly **not reaching your server**. The app only upgrades the user when it receives webhook events from Stripe.

## 1. Webhook URL for mara-server (readspicebound.com)

Use this exact URL in the Stripe Dashboard:

```
https://api.readspicebound.com/stripe/webhook
```

## 2. Configure in Stripe Dashboard

1. Open **[Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)**.
2. Click **Add endpoint** (or edit the existing one used for production).
3. **Endpoint URL:** `https://api.readspicebound.com/stripe/webhook`
4. **Events to send:** enable at least:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `invoice.payment_succeeded`
   - `customer.subscription.deleted`
5. Click **Add endpoint** / **Update**.
6. Open the endpoint and reveal **Signing secret** (starts with `whsec_`).
7. Put that value in **mara-server** `.env` as:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
   ```
8. Restart the API container on mara-server so it picks up the new secret.

**Important:** The signing secret is **per endpoint URL**. If the URL is different (e.g. localhost or saikat-server), the secret is different. mara-server must use the secret for `https://api.readspicebound.com/stripe/webhook`.

## 3. Verify the URL is reachable

From your machine or the server:

```bash
curl -s https://api.readspicebound.com/stripe/webhook
```

You should get JSON with `webhookUrl` and `message`. That confirms the route is reachable; Stripe will use **POST** to the same URL.

## 4. Test mode vs live mode (important)

- **Event deliveries: Total 0** in the dashboard means Stripe has **never** sent an event to this URL. Fix this first (see below).
- **Test mode** (test cards): You must add the same endpoint URL in Stripe’s **Test** mode and use that endpoint’s signing secret in `.env` on mara-server. If your destination is only in **Live** mode, test payments will not trigger it.
- **Live mode**: For real payments, add the same URL in **Live** mode and use that signing secret when you go live.
- In **Developers → Webhooks** (or **Event destinations**), switch the toggle to **Test** and ensure there is an endpoint `https://api.readspicebound.com/stripe/webhook` with its own signing secret. Use that secret in `.env` while testing.

## 5. After changing the endpoint or secret

1. Update `STRIPE_WEBHOOK_SECRET` in mara-server `.env`.
2. Restart the API:

   ```bash
   docker compose --profile prod restart server
   ```

3. Run a test payment and check API logs:

   ```bash
   docker logs spicebound_server_api 2>&1 | grep -E 'WEBHOOK|invoice|SubscriptionId|PREMIUM'
   ```

   You should see lines like `[WEBHOOK] POST /stripe/webhook received` and `Invoice paid → User ... upgraded to PREMIUM`. If those never appear, Stripe is still not sending events to `https://api.readspicebound.com/stripe/webhook` (wrong URL or wrong Stripe account/mode).

---

## 6. Still not working? Check these

### A. Confirm the endpoint URL in Stripe

1. Go to **[Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)**.
2. Make sure you are in **Test mode** (toggle in the sidebar) if you use test cards.
3. Look at the list of endpoints. **Click the endpoint** you use for this app.
4. The **Endpoint URL** must be **exactly**:
   ```
   https://api.readspicebound.com/stripe/webhook
   ```
   If it shows `http://...`, `localhost`, or another domain, Stripe is sending events to the wrong place. Edit the endpoint and set the URL above, then copy the **new** Signing secret and update `STRIPE_WEBHOOK_SECRET` on mara-server.

### B. Check Recent deliveries

1. In the same Webhooks page, open your endpoint.
2. Open the **Recent deliveries** (or **Logs**) tab.
3. After a test payment, do you see **any** delivery attempts to `api.readspicebound.com`?
   - **No attempts:** the endpoint URL in Stripe is not `https://api.readspicebound.com/stripe/webhook`. Add or edit the endpoint as in step 6A.
   - **Attempts with 4xx/5xx:** click one to see the error; fix the server (e.g. wrong `STRIPE_WEBHOOK_SECRET`, or body/parsing issue).
   - **Attempts with 2xx:** webhooks are reaching the server; if the plan still doesn’t update, check app logs for errors after the webhook line.

### C. Confirm POST requests reach the server

After deploying the latest code, the app logs **every** request to `/stripe/webhook` with a line like:

```text
[STRIPE WEBHOOK] POST /stripe/webhook at 2026-02-22T...
```

- **If you see that line** when you run a test payment → Stripe is reaching your server; the problem is later (e.g. signature or body).
- **If you never see that line** when paying → Stripe is not sending events to `https://api.readspicebound.com/stripe/webhook`. Fix the endpoint URL in Stripe Dashboard (step 6A).

You can also send a fake POST from your machine; the server will respond 400 (missing signature) but the log line should appear:

```bash
curl -X POST https://api.readspicebound.com/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{}'
```

Then check: `docker logs spicebound_server_api 2>&1 | grep "STRIPE WEBHOOK"`. You should see one `POST` line.

### D. Prove the app with Stripe CLI (optional)

If you have [Stripe CLI](https://stripe.com/docs/stripe-cli) installed, you can send test events to your server and confirm the app responds:

```bash
stripe listen --forward-to https://api.readspicebound.com/stripe/webhook
```

The CLI will print a **Signing secret** (e.g. `whsec_...`). Temporarily set that in mara-server `.env` as `STRIPE_WEBHOOK_SECRET`, restart the API, then run:

```bash
stripe trigger checkout.session.completed
```

Check mara-server logs for `[WEBHOOK] POST /stripe/webhook received`. If you see it, the app and URL are fine and the issue is only the Dashboard endpoint URL or secret for live/test mode.
