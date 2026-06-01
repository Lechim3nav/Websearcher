/* ============================================================================
 * Danske Bank PSD2 proxy  —  Berlin Group NextGenPSD2 (XS2A) Account Information
 * ----------------------------------------------------------------------------
 * Why a backend proxy?
 *   A real PSD2 call cannot be made from browser JS: the token exchange needs a
 *   client_secret, PSD2 mandates mTLS with an eIDAS QWAC certificate, and bank
 *   APIs send no CORS headers. This Node service holds the credentials + client
 *   certificate and performs the flow, exposing simple JSON to the dashboard.
 *
 * Flow implemented (Berlin Group v1.3.x, OAuth2 "pre-step" / redirect SCA):
 *   1. POST /v1/consents               -> create an AIS consent (consentId)
 *   2. redirect PSU to authorize URL    -> SCA, scope "AIS:<consentId>", PKCE
 *   3. GET  /api/danske/callback        -> exchange auth code for access token
 *   4. GET  /v1/accounts?withBalance=true and /v1/accounts/{id}/transactions
 *
 * Endpoints exposed to the dashboard:
 *   GET /api/danske/status        -> { configured, connected }
 *   GET /api/danske/connect       -> 302 redirect into the bank SCA flow
 *   GET /api/danske/callback      -> handles the redirect back, stores token
 *   GET /api/danske/accounts      -> normalized accounts + balances
 *   GET /api/danske/transactions?accountId=...
 *
 * All hosts/paths are configurable via .env because the exact sandbox host is
 * issued per TPP on the developer portal. Defaults follow the Berlin Group spec.
 * ==========================================================================*/

'use strict';

require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');

const {
  PORT = 8787,
  DASHBOARD_ORIGIN = 'http://localhost:5500',
  DANSKE_API_BASE,
  DANSKE_AUTH_URL,
  DANSKE_TOKEN_URL,
  DANSKE_CLIENT_ID,
  DANSKE_CLIENT_SECRET,
  DANSKE_REDIRECT_URI,
  DANSKE_IBM_CLIENT_ID,
  DANSKE_IBM_CLIENT_SECRET,
  DANSKE_TLS_CERT_PATH,
  DANSKE_TLS_KEY_PATH,
  PSU_IP_ADDRESS = '127.0.0.1',
} = process.env;

const isConfigured = Boolean(
  DANSKE_API_BASE && DANSKE_AUTH_URL && DANSKE_TOKEN_URL &&
  DANSKE_CLIENT_ID && DANSKE_CLIENT_SECRET && DANSKE_REDIRECT_URI
);

/* --- Optional mTLS (eIDAS QWAC) dispatcher --------------------------------- */
let dispatcher; // undici Agent presenting the client certificate, if provided
if (DANSKE_TLS_CERT_PATH && DANSKE_TLS_KEY_PATH) {
  const { Agent } = require('undici');
  dispatcher = new Agent({
    connect: {
      cert: fs.readFileSync(DANSKE_TLS_CERT_PATH),
      key: fs.readFileSync(DANSKE_TLS_KEY_PATH),
    },
  });
  console.log('[danske] mTLS client certificate loaded');
}

const doFetch = (url, opts = {}) =>
  fetch(url, dispatcher ? { ...opts, dispatcher } : opts);

/* --- In-memory session store (single dev user; swap for real session store) */
const session = {
  consentId: null,
  accessToken: null,
  refreshToken: null,
  tokenExpiry: 0,
  pkceVerifier: null,
  oauthState: null,
};

const newRequestId = () => crypto.randomUUID();
const base64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function gatewayHeaders(extra = {}) {
  const h = { 'X-Request-ID': newRequestId(), Accept: 'application/json', ...extra };
  if (DANSKE_IBM_CLIENT_ID) h['X-IBM-Client-Id'] = DANSKE_IBM_CLIENT_ID;
  if (DANSKE_IBM_CLIENT_SECRET) h['X-IBM-Client-Secret'] = DANSKE_IBM_CLIENT_SECRET;
  return h;
}

/* --- Step 1: create an AIS consent ----------------------------------------- */
async function createConsent() {
  const validUntil = new Date(Date.now() + 89 * 864e5).toISOString().slice(0, 10);
  const body = {
    access: { availableAccounts: 'allAccounts' }, // bank-offered consent; PSU picks accounts at SCA
    recurringIndicator: true,
    validUntil,
    frequencyPerDay: 4,
    combinedServiceIndicator: false,
  };
  const res = await doFetch(`${DANSKE_API_BASE}/consents`, {
    method: 'POST',
    headers: gatewayHeaders({
      'Content-Type': 'application/json',
      'PSU-IP-Address': PSU_IP_ADDRESS,
      'TPP-Redirect-Preferred': 'true',
      'TPP-Redirect-URI': DANSKE_REDIRECT_URI,
    }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`consent creation failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  session.consentId = data.consentId;
  return data.consentId;
}

/* --- Step 2: build the SCA authorization URL (OAuth2 pre-step + PKCE) ------- */
function buildAuthorizeUrl(consentId) {
  session.pkceVerifier = base64url(crypto.randomBytes(32));
  session.oauthState = base64url(crypto.randomBytes(16));
  const challenge = base64url(
    crypto.createHash('sha256').update(session.pkceVerifier).digest()
  );
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: DANSKE_CLIENT_ID,
    redirect_uri: DANSKE_REDIRECT_URI,
    scope: `AIS:${consentId}`,
    state: session.oauthState,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${DANSKE_AUTH_URL}?${q.toString()}`;
}

/* --- Step 3: exchange authorization code for an access token --------------- */
async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: DANSKE_REDIRECT_URI,
    client_id: DANSKE_CLIENT_ID,
    client_secret: DANSKE_CLIENT_SECRET,
    code_verifier: session.pkceVerifier,
  });
  const res = await doFetch(DANSKE_TOKEN_URL, {
    method: 'POST',
    headers: gatewayHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    body,
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  const t = await res.json();
  session.accessToken = t.access_token;
  session.refreshToken = t.refresh_token || null;
  session.tokenExpiry = Date.now() + (t.expires_in || 3600) * 1000;
}

/* --- Authenticated AIS GET helper ------------------------------------------ */
async function aisGet(path) {
  if (!session.accessToken || Date.now() > session.tokenExpiry) {
    const e = new Error('not_connected');
    e.code = 'NOT_CONNECTED';
    throw e;
  }
  const res = await doFetch(`${DANSKE_API_BASE}${path}`, {
    headers: gatewayHeaders({
      Authorization: `Bearer ${session.accessToken}`,
      'Consent-ID': session.consentId,
      'PSU-IP-Address': PSU_IP_ADDRESS,
    }),
  });
  if (!res.ok) throw new Error(`AIS GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/* --- Map Berlin Group shapes -> the dashboard's account/tx shape ----------- */
function pickBalance(balances = [], types) {
  const b = balances.find((x) => types.includes(x.balanceType));
  return b ? Number(b.balanceAmount.amount) : null;
}
function normalizeAccount(acc) {
  const booked = pickBalance(acc.balances, ['closingBooked', 'booked', 'expected']);
  const available = pickBalance(acc.balances, ['interimAvailable', 'available', 'expected']);
  return {
    id: acc.resourceId,
    name: acc.name || acc.product || 'Danske account',
    iban: acc.iban || acc.bban || acc.maskedPan || '',
    type: acc.cashAccountType || acc.product || 'Current',
    ccy: acc.currency,
    booked: booked ?? available ?? 0,
    available: available ?? booked ?? 0,
  };
}
function normalizeTx(t) {
  const amt = Number(t.transactionAmount.amount);
  return {
    date: t.bookingDate || t.valueDate || '',
    desc: t.remittanceInformationUnstructured || t.creditorName || t.debtorName || 'Transaction',
    ref: t.endToEndId || t.transactionId || t.entryReference || '',
    status: t.status === 'pending' ? 'pending' : 'booked',
    amount: amt,
  };
}

/* ============================== ROUTES ==================================== */
const app = express();
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', DASHBOARD_ORIGIN);
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/danske/status', (_req, res) => {
  res.json({
    configured: isConfigured,
    connected: Boolean(session.accessToken && Date.now() < session.tokenExpiry),
    mtls: Boolean(dispatcher),
  });
});

// Kick off the consent + SCA redirect.
app.get('/api/danske/connect', async (_req, res) => {
  if (!isConfigured) return res.status(503).json({ error: 'proxy not configured; see .env.example' });
  try {
    const consentId = await createConsent();
    res.redirect(buildAuthorizeUrl(consentId));
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

// SCA redirect target: exchange the code, then bounce back to the dashboard.
app.get('/api/danske/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.status(400).send(`Authorization failed: ${error}`);
  if (!code || state !== session.oauthState) return res.status(400).send('Invalid callback (state mismatch).');
  try {
    await exchangeCode(code);
    res.redirect(`${DASHBOARD_ORIGIN}/dashboard.html?danske=connected`);
  } catch (err) {
    res.status(502).send(`Token exchange failed: ${err.message}`);
  }
});

// Normalized accounts + balances.
app.get('/api/danske/accounts', async (_req, res) => {
  try {
    const data = await aisGet('/accounts?withBalance=true');
    res.json({ accounts: (data.accounts || []).map(normalizeAccount) });
  } catch (err) {
    if (err.code === 'NOT_CONNECTED') return res.status(401).json({ error: 'not_connected' });
    res.status(502).json({ error: String(err.message || err) });
  }
});

// Normalized transactions for one account.
app.get('/api/danske/transactions', async (req, res) => {
  const { accountId } = req.query;
  if (!accountId) return res.status(400).json({ error: 'accountId required' });
  try {
    const data = await aisGet(`/accounts/${encodeURIComponent(accountId)}/transactions?bookingStatus=both`);
    const booked = data.transactions?.booked || [];
    const pending = (data.transactions?.pending || []).map((t) => ({ ...t, status: 'pending' }));
    res.json({ transactions: [...pending, ...booked].map(normalizeTx) });
  } catch (err) {
    if (err.code === 'NOT_CONNECTED') return res.status(401).json({ error: 'not_connected' });
    res.status(502).json({ error: String(err.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`[danske] proxy listening on http://localhost:${PORT}`);
  console.log(`[danske] configured: ${isConfigured}  mTLS: ${Boolean(dispatcher)}`);
  if (!isConfigured) console.log('[danske] running unconfigured — copy .env.example to .env and fill in portal credentials');
});
