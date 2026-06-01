# Danske Bank PSD2 proxy

Backend service that performs the **real** Danske Bank Open Banking flow
(Berlin Group NextGenPSD2 / XS2A, Account Information Service) and exposes simple
JSON to `dashboard.html`. Nordea and SEB in the dashboard remain mock data; this
wires up Danske Bank for real sandbox calls.

## Why a backend is required

A genuine PSD2 call cannot be made from browser JavaScript:

- the OAuth token exchange needs a **client secret** (must never ship to a browser);
- PSD2 mandates **mTLS with an eIDAS QWAC certificate** — browsers can't present a client cert to an arbitrary API;
- bank APIs return **no CORS headers**, so cross-origin browser calls are blocked.

This proxy holds the credentials + certificate and runs the flow server-side.

## Flow (Berlin Group v1.3.x, OAuth2 pre-step + redirect SCA)

1. `POST /v1/consents` → create an AIS consent, get a `consentId`
2. redirect the user (PSU) to the bank's `authorize` endpoint with `scope=AIS:<consentId>` (PKCE)
3. bank redirects back to `/api/danske/callback` with an authorization `code`
4. exchange the code at the `token` endpoint for an access token
5. `GET /v1/accounts?withBalance=true` and `GET /v1/accounts/{id}/transactions`

## Setup

1. Register a TPP app on <https://developers.danskebank.com> (Regulatory APIs → PSD2),
   note the client id/secret, set the redirect URI to `http://localhost:8787/api/danske/callback`,
   and download/confirm the sandbox host names + your eIDAS test certificate.
2. Configure and run:

   ```bash
   cd server
   cp .env.example .env      # fill in client id/secret, hosts, cert paths
   npm install
   npm start                 # -> http://localhost:8787
   ```

3. Open the dashboard, go to **Settings → Danske Bank — live sandbox connection**,
   confirm the proxy URL, click **Connect Danske (live)** to run the one-time SCA
   authorization, then **Load live data**. The Danske card flips from `MOCK` to `LIVE`.

> Hosts/paths in `.env.example` follow the Berlin Group spec but the exact sandbox
> host is issued per TPP — confirm yours on the portal before going live.

## Endpoints

| Route | Purpose |
|-------|---------|
| `GET /api/danske/status`        | `{ configured, connected, mtls }` |
| `GET /api/danske/connect`       | 302 into the bank SCA flow |
| `GET /api/danske/callback`      | OAuth redirect target; exchanges code for token |
| `GET /api/danske/accounts`      | normalized accounts + balances |
| `GET /api/danske/transactions?accountId=…` | normalized transactions |

If the proxy is unreachable or not yet connected, the dashboard keeps showing
Danske mock data, so it always renders.
