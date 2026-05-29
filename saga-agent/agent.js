#!/usr/bin/env node
/**
 * TMS <-> Saga reference agent.
 *
 * Runs on the accountant's server (next to Saga). It:
 *   1. Polls the TMS for invoices that need validation
 *      (GET /api/saga/invoices/pending)
 *   2. Writes each SagaFactura to disk as JSON for the accountant to import
 *      into Saga (the "outbox").
 *   3. Watches an "inbox" folder. When the accountant exports a validated
 *      invoice back as JSON, the agent posts it to the TMS
 *      (POST /api/saga/invoices/validated).
 *
 * This is a dependency-free reference (Node 18+ for global fetch). Adapt the
 * Saga read/write steps to however your Saga installation imports/exports JSON.
 *
 * Configure via environment variables (see .env.example) or a config.json.
 */

const fs = require("fs")
const path = require("path")

const CONFIG = {
  baseUrl: process.env.TMS_BASE_URL || "https://your-tms.example.com",
  apiKey: process.env.TMS_API_KEY || "",
  apiUsername: process.env.TMS_API_USERNAME || "saga-agent",
  apiSecret: process.env.TMS_API_SECRET || "",
  pollMs: Number(process.env.POLL_INTERVAL_MS || 60000),
  outboxDir: process.env.OUTBOX_DIR || path.join(__dirname, "outbox"),
  inboxDir: process.env.INBOX_DIR || path.join(__dirname, "inbox"),
  processedDir: process.env.PROCESSED_DIR || path.join(__dirname, "processed"),
}

function headers() {
  return {
    "Content-Type": "application/json",
    "x-api-key": CONFIG.apiKey,
    "x-api-username": CONFIG.apiUsername,
    "x-api-secret": CONFIG.apiSecret,
  }
}

function ensureDirs() {
  for (const dir of [CONFIG.outboxDir, CONFIG.inboxDir, CONFIG.processedDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function log(...args) {
  console.log(new Date().toISOString(), ...args)
}

/** Step 0: verify credentials before doing anything. */
async function ping() {
  const res = await fetch(`${CONFIG.baseUrl}/api/saga/ping`, { headers: headers() })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Ping failed (${res.status}): ${body}`)
  }
  const data = await res.json()
  log("Connected to TMS. Tenant:", data.adminId, "Scopes:", data.scopes.join(", "))
}

/** Step 1+2: pull pending invoices and drop them in the outbox. */
async function pullPending() {
  const res = await fetch(`${CONFIG.baseUrl}/api/saga/invoices/pending?limit=100`, { headers: headers() })
  if (!res.ok) {
    log("Pull failed:", res.status, await res.text())
    return
  }
  const data = await res.json()
  if (!data.count) {
    log("No pending invoices.")
    return
  }
  for (const item of data.invoices) {
    const file = path.join(CONFIG.outboxDir, `${item.tmsInvoiceId}.json`)
    fs.writeFileSync(file, JSON.stringify(item, null, 2))
    log("Wrote pending invoice to outbox:", file, "(ref:", item.orderReference, ")")
    // TODO: import item.factura into Saga here (or let the accountant import the file).
  }
  log(`Pulled ${data.count} invoice(s) into outbox.`)
}

/** Step 3: post validated invoices found in the inbox back to the TMS. */
async function pushValidated() {
  const files = fs.readdirSync(CONFIG.inboxDir).filter((f) => f.endsWith(".json"))
  for (const f of files) {
    const full = path.join(CONFIG.inboxDir, f)
    let payload
    try {
      payload = JSON.parse(fs.readFileSync(full, "utf8"))
    } catch (err) {
      log("Skipping invalid JSON:", f, err.message)
      continue
    }

    // Expected shape (produced by the accountant / Saga export):
    // { tmsInvoiceId, sagaNumber, cod?, contClient?, factura? }
    if (!payload.tmsInvoiceId || !payload.sagaNumber) {
      log("Skipping (missing tmsInvoiceId/sagaNumber):", f)
      continue
    }

    const res = await fetch(`${CONFIG.baseUrl}/api/saga/invoices/validated`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      const dest = path.join(CONFIG.processedDir, f)
      fs.renameSync(full, dest)
      log("Posted validated invoice:", payload.tmsInvoiceId, "->", payload.sagaNumber)
    } else {
      log("Validate post failed:", res.status, await res.text(), "file:", f)
    }
  }
}

async function tick() {
  try {
    await pullPending()
    await pushValidated()
  } catch (err) {
    log("Tick error:", err.message)
  }
}

async function main() {
  ensureDirs()
  await ping()
  await tick()
  setInterval(tick, CONFIG.pollMs)
  log(`Agent running. Polling every ${CONFIG.pollMs}ms.`)
}

main().catch((err) => {
  log("Fatal:", err.message)
  process.exit(1)
})
