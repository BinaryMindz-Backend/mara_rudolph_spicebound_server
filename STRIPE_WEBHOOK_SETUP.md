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

## 4. Test mode vs live mode

- **Test mode:** use the webhook endpoint (and secret) from the **Test** tab in Stripe.
- **Live mode:** add a separate endpoint (and secret) in the **Live** tab and set `STRIPE_WEBHOOK_SECRET` for the environment you run (test vs live).

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
