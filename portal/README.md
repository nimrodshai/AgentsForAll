# Agent guidance studio

This folder holds the client-facing workspace for reviewing assigned features, opening a feature studio, editing reply settings, and previewing agent responses.

It is intentionally separate from the reusable spec and client config layers.

## What lives here

- `index.html` for the tabbed app shell
- `styles.css` for the interface
- `app.js` for the OTP sign-in flow, tab state, account menu, and preview behavior

## Workspace layout

- `Features` for the client account and its assigned capabilities. Click one to open its studio.
- `Preview` for testing a reply before it is used
- `Settings` opens as a modal overlay for account details and workspace preferences
- The top-right menu opens account, settings, and log out actions

## Sign-in flow

- Clients sign in with email and a one-time code.
- This version uses a local demo OTP so the flow works without a backend.
- Replace the demo OTP with a real email delivery and verification service before production.

## Local usage

Serve the folder with a simple static server.

Example:

```bash
cd portal
python3 -m http.server 8000
```

Then visit `http://localhost:8000/`.
