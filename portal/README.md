# Assistyca Portal

This folder holds the client-facing portal for reviewing assigned features, opening a feature studio, editing reply settings, and previewing agent responses.

It is intentionally separate from the reusable spec and client config layers.

## What lives here

- `index.html` for the tabbed app shell
- `styles.css` for the interface
- `app.js` for the OTP sign-in flow, tab state, account menu, and preview behavior

## Portal layout

- `Features` for the client account and its assigned capabilities. Click one to open its studio.
- `Preview` for testing a reply before it is used
- `Simulator` for queuing browser-local WhatsApp mock messages, drafting a reply, and simulating send/edit actions without a backend
- `Settings` opens as a modal overlay for account details and portal preferences
- The top-right menu opens account, settings, and log out actions
- The simulator's Edit button opens [`../approval.html`](../approval.html), a reusable local approval page that accepts prefilled sender, message, and draft values.

## Sign-in flow

- Clients sign in with email and a one-time code.
- The code is now issued by `scripts/run_portal_server.py` and verified by the server instead of being mocked in the browser.
- Set either the SMTP variables or the Resend variables so the server can actually email the code.
- The simulator is still browser-local, so it can be tested before any WhatsApp webhook or approval server exists.

## Recommended test hosting

For a free, non-24/7 test server, deploy the repo to Render as a free web service and use Resend for OTP delivery.

Why this setup works:

- Render free web services can host the Python portal backend and static portal together.
- Render free services block outbound SMTP ports, so an HTTPS email API is the safer choice.
- Resend has a free tier and sends over HTTPS, which fits the free Render plan.

When you are ready for always-on hosting, you can upgrade the Render service to a paid plan and keep the same code.

Required environment variables on Render:

- `PORTAL_MAIL_PROVIDER=resend`
- `PORTAL_RESEND_API_KEY`
- `PORTAL_RESEND_FROM_EMAIL` for a verified sender like `sign-in@yourdomain.com` or `Assistyca <sign-in@yourdomain.com>`
- `PORTAL_RESEND_FROM_NAME` for the sender label shown in the inbox
- `PORTAL_PRODUCT_NAME` for the sign-in email subject and product branding inside the email

The `PORTAL_RESEND_API_KEY` and `PORTAL_RESEND_FROM_EMAIL` values should be added as secrets in the Render dashboard.

## Local usage

Run the combined portal server so the UI and OTP API share the same origin.

Example:

```bash
PORTAL_SMTP_HOST=smtp.example.com \
PORTAL_SMTP_FROM_EMAIL=sign-in@example.com \
python3 scripts/run_portal_server.py --port 8000
```

Then visit `http://localhost:8000/portal/`.

If you open the static portal from GitHub Pages, the UI falls back to `http://127.0.0.1:8000`
unless you provide a different API base with `window.PORTAL_API_BASE`, the
`portal-api-base` meta tag, or `?apiBase=...` in the URL.
