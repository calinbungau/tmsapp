# Saga Agent

Reference Node.js agent that runs on the accountant's Saga server and syncs
invoices between the TMS and Saga. Saga has no public API, so the TMS exposes
its own secured API and this agent bridges it to Saga via JSON files.

## Flow

```
TMS  --(1. GET pending)-->  Agent  --(2. write JSON)-->  outbox/  -->  Saga (accountant imports + validates)
TMS  <--(4. POST validated)-- Agent <--(3. read JSON)--  inbox/   <--  Saga (accountant exports validated invoice)
```

1. Agent polls `GET /api/saga/invoices/pending` and writes each `SagaFactura`
   to `outbox/<tmsInvoiceId>.json`.
2. The accountant imports those into Saga and validates them.
3. After validation, the accountant exports the result to `inbox/<anything>.json`
   in the shape below.
4. Agent posts each inbox file to `POST /api/saga/invoices/validated` and moves
   it to `processed/`.

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
- `saga:import` — Phase 2 reconciliation (optional)

## Setup

Requires Node.js 18+ (uses global `fetch`).

```bash
cp .env.example .env       # fill in your TMS URL + credentials
# load env vars however you prefer, then:
node --env-file=.env agent.js
```

## Validated invoice file format (inbox)

```json
{
  "tmsInvoiceId": "uuid-from-the-pending-payload",
  "sagaNumber": "FACT-2026-00123",
  "cod": "00002",
  "contClient": "4111.00002",
  "factura": {
    "tip": "RON",
    "cod": "00002",
    "clientNume": "NOARLOG TRANS SRL",
    "data": "2026-05-29",
    "scadenta": "2026-06-29",
    "refTMS": "INT-2026-314332",
    "contClient": "4111.00002",
    "tipO": "007",
    "linii": [
      {
        "descriere": "TRANSPORT MARFA",
        "um": "BUC",
        "cantitate": 1.0,
        "pret": 1000.0,
        "valoare": 1000.0,
        "procTVA": 19,
        "tva": 190.0,
        "cont": "704.1"
      }
    ]
  }
}
```

- `tmsInvoiceId` and `sagaNumber` are required.
- Include `factura` only if the accountant changed something — the TMS will
  recompute totals and line items from it.
- `cod` / `contClient` are remembered per customer for future invoices.

## Endpoints

| Method | Path                            | Scope        | Purpose                              |
| ------ | ------------------------------- | ------------ | ------------------------------------ |
| GET    | `/api/saga/ping`                | `saga:read`  | Credential / connectivity check      |
| GET    | `/api/saga/invoices/pending`    | `saga:read`  | Invoices awaiting Saga validation    |
| POST   | `/api/saga/invoices/validated`  | `saga:write` | Write back the validated invoice     |
| POST   | `/api/saga/invoices/import`     | `saga:import`| Phase 2 reconciliation (preview now) |
