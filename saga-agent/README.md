# Saga Agent

Node.js agent that runs on the accountant's Saga server and keeps invoices in
sync between the TMS and Saga. Saga has no public API, so the TMS exposes its
own secured API and this agent talks **directly to Saga's Firebird database**
(via ODBC) — no intermediate files.

## Flow

```
TMS  --(1. GET pending)-->  Agent  --(INSERT / UPDATE via ODBC)-->  Saga Firebird DB
TMS  <--(3. POST validated)-- Agent <--(2. poll IESIRI for VALIDAT='V')-- Saga Firebird DB
```

1. Agent polls `GET /api/saga/invoices/pending`. Each item carries a
   `syncAction`:
   - `insert` → new invoice. Agent inserts a new document into `IESIRI` /
     `IES_DET` (skips if it already exists, matched on `INF_SUPLM` containing
     the `tmsInvoiceId`).
   - `update` → the invoice was edited in the TMS after it was first synced.
     Agent **updates** the existing Saga document (header totals, dates and
     detail lines), preserving any amount already paid. If the Saga document is
     already validated (`VALIDAT = 'V'`) it is left untouched and a warning is
     logged, because validated documents must not be modified.
2. Agent polls the `IESIRI` table. When a document becomes validated
   (`VALIDAT = 'V'`) or its totals / `NEACHITAT` change, it is flagged for
   reporting (change detection via an MD5 snapshot in `saga_snapshot.json`).
3. Agent posts the validated/paid document to
   `POST /api/saga/invoices/validated`, sending `sagaNumber`, totals and
   `neachitat` (unpaid remainder). The TMS uses `neachitat` to set payment
   state: `0` → paid (locked from further re-sync), partial → partially paid,
   full → unpaid.

## Requirements

- Node.js 18+ (uses global `fetch`).
- The [`odbc`](https://www.npmjs.com/package/odbc) package: `npm install odbc`.
- A Firebird/InterBase ODBC driver installed on the machine, pointing at the
  Saga company database (`cont_baza.fdb`). Adjust `CONN_STRING` in `agent.js`
  to match your Saga path / credentials.

## Authentication

Every request sends three headers (created in TMS → Settings → Integrations →
**Saga & API** → New API key). The secret is shown only once.

```
x-api-key:       tms_xxxxxxxxxxxx
x-api-username:  saga-agent
x-api-secret:    <secret>
```

Required scopes:

- `saga:read`  — pull pending invoices
- `saga:write` — post validated invoices

## Setup

```bash
npm install odbc
cp .env.example .env       # fill in your TMS URL + credentials
# verify CONN_STRING in agent.js matches your Saga DB path
node --env-file=.env agent.js
```

## Payment / validation post-back

When the agent detects a validated document it posts:

```json
{
  "tmsInvoiceId": "uuid-from-the-pending-payload (from INF_SUPLM)",
  "sagaNumber": "0123",
  "sagaId": 4567,
  "cod": "00002",
  "clientNume": "NOARLOG TRANS SRL",
  "data": "2026-05-29",
  "total": 1190.0,
  "tva": 190.0,
  "bazaTva": 1000.0,
  "neachitat": 0,
  "cursRef": 0
}
```

- `tmsInvoiceId` and `sagaNumber` are required.
- `neachitat = 0` marks the invoice **paid** in the TMS and locks it from
  further re-sync. `0 < neachitat < total` → partially paid. `neachitat >=
  total` → unpaid.

## Endpoints

| Method | Path                            | Scope        | Purpose                              |
| ------ | ------------------------------- | ------------ | ------------------------------------ |
| GET    | `/api/saga/ping`                | `saga:read`  | Credential / connectivity check      |
| GET    | `/api/saga/invoices/pending`    | `saga:read`  | Invoices to insert/update in Saga    |
| POST   | `/api/saga/invoices/validated`  | `saga:write` | Write back validated number + payment|
