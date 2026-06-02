#!/usr/bin/env node
/**
 * TMS <-> Saga Agent
 * Rulează pe serverul contabilului (lângă Saga).
 * Scrie/citește direct în Firebird — fără fișiere intermediare.
 *
 * Flow:
 *  1. GET /api/saga/invoices/pending
 *       - syncAction "insert" → INSERT direct în Saga DB (dacă nu există deja)
 *       - syncAction "update" → UPDATE documentul existent (header + linii),
 *                                dacă NU e deja validat ('V') în Saga
 *  2. Polling Saga DB pentru facturi validate / plătite
 *  3. POST /api/saga/invoices/validated → trimite numărul + plata înapoi la TMS
 */

const fs = require("fs");
const path = require("path");
const odbc = require("odbc");
const crypto = require("crypto");

// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIG = {
  baseUrl: process.env.TMS_BASE_URL || "https://your-tms.example.com",
  apiKey: process.env.TMS_API_KEY || "",
  apiUsername: process.env.TMS_API_USERNAME || "saga-agent",
  apiSecret: process.env.TMS_API_SECRET || "",
  pollMs: Number(process.env.POLL_INTERVAL_MS || 60000),
  snapshotFile: path.join(__dirname, "saga_snapshot.json"),
};

const CONN_STRING =
  "DRIVER={Firebird/InterBase(r) driver};" +
  `DBNAME=127.0.0.1/3060:C:\\SAGA C.3.0\\0001\\cont_baza.fdb;` +
  "UID=SYSDBA;PWD=masterkey;CHARSET=UTF8;";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function tmsHeaders() {
  return {
    "Content-Type": "application/json",
    "x-api-key": CONFIG.apiKey,
    "x-api-username": CONFIG.apiUsername,
    "x-api-secret": CONFIG.apiSecret,
  };
}

function loadSnapshot() {
  if (fs.existsSync(CONFIG.snapshotFile)) {
    return JSON.parse(fs.readFileSync(CONFIG.snapshotFile, "utf8"));
  }
  return {};
}

function saveSnapshot(snapshot) {
  fs.writeFileSync(CONFIG.snapshotFile, JSON.stringify(snapshot, null, 2), "utf8");
}

function hashFactura(f) {
  const str = [
    f.NR_IESIRE?.trim(),
    f.COD?.trim(),
    f.TOTAL,
    f.VALIDAT?.trim(),
    f.BAZA_TVA,
    f.TVA,
    f.NEACHITAT,
  ].join("|");
  return crypto.createHash("md5").update(str).digest("hex");
}

function r2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// ─── Detecteaza tara din prefix CIF ──────────────────────────────────────────
const EU_COUNTRIES = [
  "AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI",
  "FR","GR","HR","HU","IE","IT","LT","LU","LV","MT",
  "NL","PL","PT","SE","SI","SK","GB","CH","NO","US",
];

function detectTara(cif) {
  if (!cif) return "RO";
  const prefix = cif.trim().substring(0, 2).toUpperCase();
  if (EU_COUNTRIES.includes(prefix)) return prefix;
  return "RO";
}

function isStrainCIF(cif) {
  if (!cif) return false;
  const prefix = cif.trim().substring(0, 2).toUpperCase();
  return EU_COUNTRIES.includes(prefix) && prefix !== "RO";
}

// ─── Saga DB: resolve / create client ──────────────────────────────────────────
async function resolveClient(conn, factura) {
  let cod = factura.cod?.trim() || "";
  let clientNume = factura.clientNume?.trim() || "";
  let contCli = "";
  const tara = factura.clientTara || detectTara(factura.clientCIF);

  // 1. Cauta dupa COD_FISCAL (CIF) daca e trimis
  if (factura.clientCIF) {
    const cif = factura.clientCIF.trim();
    const r = await conn.query(
      `SELECT COD, DENUMIRE, ANALITIC FROM CLIENTI
        WHERE TRIM(COD_FISCAL) = ? OR TRIM(COD_FISCAL) = ?`,
      [cif, "RO" + cif],
    );
    if (r.length > 0) {
      cod = r[0].COD?.trim();
      clientNume = r[0].DENUMIRE?.trim();
      contCli = r[0].ANALITIC?.trim();
      log(`   👤 Client gasit dupa CIF: ${clientNume} (cod: ${cod}, tara: ${tara})`);
    }
  }

  // 2. Cauta dupa DENUMIRE daca nu s-a gasit dupa CIF
  if (!cod && clientNume) {
    const r = await conn.query(
      `SELECT COD, DENUMIRE, ANALITIC FROM CLIENTI
        WHERE TRIM(UPPER(DENUMIRE)) LIKE TRIM(UPPER(?))`,
      [`%${clientNume}%`],
    );
    if (r.length > 0) {
      cod = r[0].COD?.trim();
      clientNume = r[0].DENUMIRE?.trim();
      contCli = r[0].ANALITIC?.trim();
      log(`   👤 Client gasit dupa nume: ${clientNume} (cod: ${cod})`);
    }
  }

  // 3. Creeaza client nou daca nu exista
  if (!cod && clientNume) {
    const maxCodRes = await conn.query(
      `SELECT MAX(CAST(TRIM(COD) AS INTEGER)) AS MAX_COD FROM CLIENTI`,
    );
    const newCod = String((maxCodRes[0].MAX_COD || 0) + 1).padStart(5, "0");
    contCli = `4111.${newCod}`;

    await conn.query(
      `
        INSERT INTO CLIENTI (
        COD, DENUMIRE, COD_FISCAL, ANALITIC, TARA,
        ZS, DISCOUNT, IS_TVA, BLOCAT, CB_CARD,
        C_LIMIT, IS_EFACT, TIP_TERT
        ) VALUES (
        ?, ?, ?, ?, ?,
        0, 0, 0, 0, 0,
        0, 0, ' '
        )
        `,
      [
        newCod,
        clientNume.substring(0, 64),
        (factura.clientCIF || "").substring(0, 20),
        contCli,
        tara,
      ],
    );

    cod = newCod;
    log(`   ✅ Client nou creat: ${clientNume} | COD: ${newCod} | CIF: ${factura.clientCIF || "-"} | TARA: ${tara}`);
  }

  // 4. Fallback: construieste contClient din cod
  if (!contCli && cod) contCli = `4111.${cod}`;

  return { cod, clientNume, contCli, tara };
}

// ─── Saga DB: insert detail lines for a given header id ────────────────────────
async function insertLinii(conn, headerId, linii) {
  for (const linie of linii) {
    const idURes = await conn.query(`SELECT MAX(ID_U) + 1 AS NEW_ID_U FROM IES_DET`);
    const newIdU = idURes[0].NEW_ID_U;

    await conn.query(
      `
        INSERT INTO IES_DET (
        ID_U, ID_IESIRE,
        DENUMIRE, DEN_TIP, UM,
        CANTITATE, PRET_UNITAR, PU_TVA, VALOARE,
        TVA_ART, TVA_DED, TOTAL,
        CONT, ADAOS, DISCOUNT,
        GESTIUNE, DEN_GEST, COD, ID_SGR
        ) VALUES (
        ?, ?, ?, 'Nedefinit', ?,
        ?, ?, 0, ?,
        ?, ?, ?,
        ?, 0, 0,
        '    ', '                        ', '                ', 0
        )
        `,
      [
        newIdU,
        headerId,
        linie.descriere,
        linie.um || "BUC",
        linie.cantitate,
        linie.pret,
        linie.valoare,
        linie.procTVA,
        linie.tva,
        r2(linie.valoare + linie.tva),
        linie.cont || "704.1",
      ],
    );
  }
}

// ─── Saga DB: INSERT linii valuta ─────────────────────────────────────────────
async function insertLiniiValuta(conn, headerId, linii, curs) {
  for (const linie of linii) {
    const idURes = await conn.query(`SELECT MAX(ID_U) + 1 AS NEW_ID_U FROM EXPORT_DET`);
    const newIdU = idURes[0].NEW_ID_U;

    const valRON  = r2(linie.valoare * curs);
    const tvaRON  = r2(linie.tva * curs);

    await conn.query(`
        INSERT INTO EXPORT_DET (
        ID_U, ID_IESIRE,
        DENUMIRE, DEN_TIP, UM,
        CANTITATE, PU_VAL, PRET_UNITAR, VAL_VAL, VALOARE,
        TVA_ART, TVA_DED, TVA_VAL, TOTAL,
        CONT, ADAOS,
        GESTIUNE, DEN_GEST, COD
        ) VALUES (
        ?, ?,
        ?, 'Nedefinit', ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, 0,
        ?, 0,
        '    ', '                        ', '                '
        )
    `, [
      newIdU, headerId,
      linie.descriere,
      linie.um       || "BUC",
      linie.cantitate,
      linie.pret,                    // PU_VAL  = pret in valuta
      r2(linie.pret * curs),         // PRET_UNITAR = pret in RON
      linie.valoare,                 // VAL_VAL = valoare in valuta
      valRON,                        // VALOARE = valoare in RON
      linie.procTVA,
      tvaRON,                        // TVA_DED in RON
      linie.tva,                     // TVA_VAL in valuta
      linie.cont || "704.1",
    ]);
  }
}

// ─── Saga DB: INSERT factura noua ──────────────────────────────────────────────
async function sagaInsertFactura(factura) {
  const conn = await odbc.connect(CONN_STRING);
  try {
    const { cod, clientNume, contCli, tara } = await resolveClient(conn, factura);

    // Auto-detecteaza valuta: explicit VALUTA, sau cursRef > 0, sau client strain
    const isValuta =
      factura.tip === "VALUTA" ||
      (factura.cursRef && factura.cursRef > 0) ||
      isStrainCIF(factura.clientCIF) ||
      (tara && tara !== "RO");

    if (isValuta) {
      log(`   💶 Factura VALUTA | tara: ${tara} | moneda: ${factura.moneda || "EUR"} | curs: ${factura.cursRef || "n/a"}`);
    }

    // Totaluri in valuta
    const bazaVal = factura.linii.reduce((s, l) => s + l.valoare, 0);
    const tvaVal  = factura.linii.reduce((s, l) => s + l.tva, 0);
    const curs    = factura.cursRef || 1;

    // Totaluri in RON (pentru EXPORT) sau direct (pentru IESIRI RON)
    const bazaTVA = isValuta ? r2(bazaVal * curs) : r2(bazaVal);
    const tva     = isValuta ? r2(tvaVal  * curs) : r2(tvaVal);
    const total   = r2(bazaTVA + tva);

    if (isValuta) {
      // ── INSERT in EXPORT (Iesiri valuta) ──
      const idRes = await conn.query(`SELECT MAX(ID_IESIRE) + 1 AS NEW_ID FROM EXPORT`);
      const newId = idRes[0].NEW_ID;

      const nrRes = await conn.query(`
          SELECT MAX(CAST(TRIM(NR_IESIRE) AS INTEGER)) AS LAST_NR
          FROM EXPORT WHERE NR_IESIRE IS NOT NULL AND TRIM(NR_IESIRE) <> ''
      `);
      const nextNr = String((nrRes[0].LAST_NR || 0) + 1).padStart(4, "0");

      // Saga: TOTAL=0 (calculat la validare), NEACHITAT=VAL_VAL (in valuta), TIP_O='007'
      const valTotal = r2(bazaVal + tvaVal); // total in valuta
      await conn.query(`
          INSERT INTO EXPORT (
          ID_IESIRE, NR_IESIRE,
          COD, DENUMIRE,
          DATA, SCADENT,
          COD_VALUTA, CURS, CURS_VECHI,
          VAL_VAL, BAZA_TVA, TVA, TVA_VAL, TOTAL, NEACHITAT,
          VALIDAT, TVAI, ADAOS, TIPARIT,
          CONT_CLI, INF_SUPLM, TIP_O,
          AGENT, DEN_AGENT, TIP,
          IS_EF, ID_ADRLIV
          ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, 0,
          ?, ?, ?, ?, 0, ?,
          ' ', 0, 0, 0,
          ?, ?, '007',
          '    ', '                                    ', ' ',
          0, 0
          )
      `, [
        newId, nextNr,
        cod, clientNume,
        factura.data, factura.scadenta || factura.data,
        factura.moneda || "EUR", curs,
        r2(bazaVal),   // VAL_VAL = total valuta fara TVA
        bazaTVA,       // BAZA_TVA in RON
        tva,           // TVA in RON
        r2(tvaVal),    // TVA_VAL in valuta
        valTotal,      // NEACHITAT = total in VALUTA
        contCli,
        factura.refTMS || factura.orderReference || "",
      ]);

      await insertLiniiValuta(conn, newId, factura.linii, curs);

      await conn.close();
      return { newId, nextNr, isValuta: true };

    } else {
      // ── INSERT in IESIRI (Factura RON) ──
      const idRes = await conn.query(`SELECT MAX(ID_IESIRE) + 1 AS NEW_ID FROM IESIRI`);
      const newId = idRes[0].NEW_ID;

      const nrRes = await conn.query(`
          SELECT MAX(CAST(TRIM(NR_IESIRE) AS INTEGER)) AS LAST_NR
          FROM IESIRI WHERE NR_IESIRE IS NOT NULL AND TRIM(NR_IESIRE) <> ''
      `);
      const nextNr = String((nrRes[0].LAST_NR || 0) + 1).padStart(4, "0");

      await conn.query(`
          INSERT INTO IESIRI (
          ID_IESIRE, NR_IESIRE,
          COD, DENUMIRE,
          DATA, SCADENT,
          BAZA_TVA, TVA, TOTAL, NEACHITAT,
          VALIDAT, TVAI, ADAOS, TIPARIT,
          CONT_CLI, INF_SUPLM, TIP_O,
          AGENT, DEN_AGENT, TIP,
          ACCIZE, CURS_REF, NR_BONURI, ID_ADRLIV, IS_EF
          ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ' ', 0, 0, 0,
          ?, ?, '007',
          '    ', '                                    ', ' ',
          0, 0, 0, 0, 0
          )
      `, [
        newId, nextNr,
        cod, clientNume,
        factura.data, factura.scadenta || factura.data,
        bazaTVA, tva, total, total,
        contCli,
        factura.refTMS || factura.orderReference || "",
      ]);

      await insertLinii(conn, newId, factura.linii);

      await conn.close();
      return { newId, nextNr, isValuta: false };
    }
  } catch (err) {
    await conn.close();
    throw err;
  }
}

// ─── Saga DB: UPDATE factura existenta (header + linii) ─────────────────────────
// Pastreaza suma deja platita: neachitat_nou = max(0, total_nou - platit_vechi)
async function sagaUpdateFactura(factura, existing, payment) {
  const conn = await odbc.connect(CONN_STRING);
  try {
    const id = existing.ID_IESIRE;
    const isValuta = existing.TIP_FACTURA === "VALUTA";
    const curs = factura.cursRef || 1;

    // Totaluri in valuta (din linii)
    const bazaVal = factura.linii.reduce((s, l) => s + l.valoare, 0);
    const tvaVal = factura.linii.reduce((s, l) => s + l.tva, 0);
    const valTotal = r2(bazaVal + tvaVal); // total in valuta

    // Totaluri in RON (pentru EXPORT/IESIRI header)
    const bazaTVA = isValuta ? r2(bazaVal * curs) : r2(bazaVal);
    const tva = isValuta ? r2(tvaVal * curs) : r2(tvaVal);
    const total = r2(bazaTVA + tva);

    // neachitat: pentru valuta se exprima in VALUTA (ca la insert), pentru RON in RON
    const fallbackNeachitat = isValuta ? valTotal : total;

    // Pastreaza plata existenta
    const oldTotal = Number(existing.TOTAL) || 0;
    const oldNeachitat = Number(existing.NEACHITAT) != null ? Number(existing.NEACHITAT) : oldTotal;
    // Daca TMS a inregistrat o plata, TMS este sursa de adevar pentru neachitat.
    // Altfel pastram plata deja existenta in Saga.
    let neachitat;
    if (payment && typeof payment.remainingAmount === "number") {
      neachitat = payment.fullyPaid ? 0 : Math.max(0, r2(payment.remainingAmount));
      log(
        `   💰 Plata din TMS aplicata | platit: ${r2(payment.paidAmount)} | neachitat: ${neachitat}`,
      );
    } else {
      const platit = Math.max(0, r2(oldTotal - oldNeachitat));
      neachitat = Math.max(0, r2(fallbackNeachitat - platit));
    }

    if (isValuta) {
      // ── UPDATE document in valuta (EXPORT + EXPORT_DET) ──
      await conn.query(
        `
          UPDATE EXPORT SET
          DATA     = ?,
          SCADENT  = ?,
          CURS     = ?,
          VAL_VAL  = ?,
          BAZA_TVA = ?,
          TVA      = ?,
          TVA_VAL  = ?,
          NEACHITAT = ?
          WHERE ID_IESIRE = ?
          `,
        [
          factura.data,
          factura.scadenta || factura.data,
          curs,
          r2(bazaVal),
          bazaTVA,
          tva,
          r2(tvaVal),
          neachitat,
          id,
        ],
      );

      await conn.query(`DELETE FROM EXPORT_DET WHERE ID_IESIRE = ?`, [id]);
      await insertLiniiValuta(conn, id, factura.linii, curs);
    } else {
      // ── UPDATE header (NU schimbam clientul / NR_IESIRE / VALIDAT) ──
      await conn.query(
        `
          UPDATE IESIRI SET
          DATA     = ?,
          SCADENT  = ?,
          BAZA_TVA = ?,
          TVA      = ?,
          TOTAL    = ?,
          NEACHITAT = ?,
          CURS_REF = ?
          WHERE ID_IESIRE = ?
          `,
        [
          factura.data,
          factura.scadenta || factura.data,
          r2(bazaTVA),
          r2(tva),
          total,
          neachitat,
          factura.cursRef || 0,
          id,
        ],
      );

      // Inlocuieste liniile
      await conn.query(`DELETE FROM IES_DET WHERE ID_IESIRE = ?`, [id]);
      await insertLinii(conn, id, factura.linii);
    }

    await conn.close();
    return { id, nr: existing.NR_IESIRE?.trim(), neachitat };
  } catch (err) {
    await conn.close();
    throw err;
  }
}

// ─── Saga DB: inregistreaza DOAR plata (NEACHITAT) ──────────────────────────────
// Folosit cand factura e deja VALIDATA: continutul (linii/totaluri) e blocat,
// dar plata se poate inregistra. Actualizeaza exclusiv NEACHITAT.
async function sagaUpdatePayment(existing, payment) {
  const conn = await odbc.connect(CONN_STRING);
  try {
    const id = existing.ID_IESIRE;
    const total = Number(existing.TOTAL) || 0;
    const neachitat = payment.fullyPaid
      ? 0
      : Math.max(0, r2(payment.remainingAmount != null ? payment.remainingAmount : total));

    // Facturile in valuta traiesc in EXPORT, nu in IESIRI. Scrierea NEACHITAT
    // in tabela gresita lasa EXPORT.NEACHITAT neschimbat → pushValidated nu
    // detecteaza plata si TMS ramane blocat pe "needs update". Alegem tabela
    // dupa tipul documentului returnat de sagaFindByTmsId.
    const table = existing.TIP_FACTURA === "VALUTA" ? "EXPORT" : "IESIRI";
    await conn.query(`UPDATE ${table} SET NEACHITAT = ? WHERE ID_IESIRE = ?`, [neachitat, id]);

    await conn.close();
    return { id, nr: existing.NR_IESIRE?.trim(), neachitat };
  } catch (err) {
    await conn.close();
    throw err;
  }
}

async function sagaReadAll() {
  const conn = await odbc.connect(CONN_STRING);

  // Citeste din ambele tabele: IESIRI (RON) si EXPORT (valuta)
  const ron = await conn.query(`
      SELECT ID_IESIRE, NR_IESIRE, COD, DENUMIRE,
      DATA, BAZA_TVA, TVA, TOTAL, NEACHITAT,
      VALIDAT, INF_SUPLM, CURS_REF,
      'RON' AS TIP_FACTURA
      FROM IESIRI ORDER BY ID_IESIRE ASC
  `);

  const val = await conn.query(`
      SELECT ID_IESIRE, NR_IESIRE, COD, DENUMIRE,
      DATA, BAZA_TVA, TVA, TOTAL, NEACHITAT,
      VALIDAT, INF_SUPLM, CURS AS CURS_REF,
      'VALUTA' AS TIP_FACTURA
      FROM EXPORT ORDER BY ID_IESIRE ASC
  `);

  await conn.close();
  return [...ron, ...val];
}

// Verifica daca tmsInvoiceId exista deja in IESIRI sau EXPORT
async function sagaFindByTmsId(tmsInvoiceId) {
  const conn = await odbc.connect(CONN_STRING);

  const r1 = await conn.query(
    `SELECT ID_IESIRE, NR_IESIRE, TOTAL, NEACHITAT, VALIDAT, 'RON' AS TIP_FACTURA
     FROM IESIRI WHERE INF_SUPLM CONTAINING ?`, [tmsInvoiceId]
  );
  if (r1.length > 0) { await conn.close(); return r1[0]; }

  const r2 = await conn.query(
    `SELECT ID_IESIRE, NR_IESIRE, TOTAL, NEACHITAT, VALIDAT, 'VALUTA' AS TIP_FACTURA
     FROM EXPORT WHERE INF_SUPLM CONTAINING ?`, [tmsInvoiceId]
  );
  await conn.close();
  return r2[0] || null;
}

// ─── Step 0: Ping ─────────────────────────────────────────────────────────────
async function ping() {
  const res = await fetch(`${CONFIG.baseUrl}/api/saga/ping`, { headers: tmsHeaders() });
  if (!res.ok) throw new Error(`Ping failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  log("✅ Conectat la TMS. Tenant:", data.adminId, "| Scopes:", data.scopes?.join(", "));
}

// ─── Step 1: Pull pending → INSERT / UPDATE in Saga ──────────────────────────
async function pullPending() {
  const res = await fetch(`${CONFIG.baseUrl}/api/saga/invoices/pending?limit=100`, {
    headers: tmsHeaders(),
  });
  if (!res.ok) {
    log("⚠️  Pull failed:", res.status, await res.text());
    return;
  }

  const data = await res.json();
  if (!data.count) {
    log("📭 Nicio factura pending.");
    return;
  }

  for (const item of data.invoices) {
    const action = item.syncAction || "insert";
    log(`📄 Procesez factura TMS ID: ${item.tmsInvoiceId} | actiune: ${action}`);

    // ── LOG detaliat TVA per linie (debug) ──
    (item.factura?.linii || []).forEach((l, i) => {
      log(`   📊 Linie ${i + 1}: procTVA=${l.procTVA} | valoare=${l.valoare} | tva=${l.tva} | descriere="${l.descriere}"`);
    });

    // Salveaza tmsInvoiceId in refTMS ca sa putem deduplica
    item.factura.refTMS = item.tmsInvoiceId;

    // Cauta documentul existent in IESIRI sau EXPORT
    const existing = await sagaFindByTmsId(item.tmsInvoiceId);

    try {
      if (action === "update") {
        // ── UPDATE: factura modificata in TMS ──
        if (!existing) {
          // Nu exista in Saga inca → o inseram ca noua
          const { newId, nextNr } = await sagaInsertFactura(item.factura);
          log(
            `✅ (update→insert) Inserat in Saga | TMS ID: ${item.tmsInvoiceId} | Saga ID: ${newId} | NR: ${nextNr}`,
          );
        } else if (existing.VALIDAT?.trim() === "V") {
          // Document deja validat in Saga → continutul e blocat.
          // Dar daca exista o plata de inregistrat, actualizam DOAR NEACHITAT.
          if (item.payment) {
            const { id, nr, neachitat } = await sagaUpdatePayment(existing, item.payment);
            log(
              `💰 Plata inregistrata pe factura VALIDATA | TMS ID: ${item.tmsInvoiceId} | Saga ID: ${id} | NR: ${nr} | neachitat: ${neachitat}`,
            );
          } else {
            log(
              `⚠️  Skip UPDATE — factura deja VALIDATA in Saga (ID: ${existing.ID_IESIRE}, NR: ${existing.NR_IESIRE?.trim()}). Modificarea continutului e interzisa.`,
            );
          }
        } else {
          const { id, nr, neachitat } = await sagaUpdateFactura(
            item.factura,
            existing,
            item.payment,
          );
          log(
            `✅ Actualizat in Saga | TMS ID: ${item.tmsInvoiceId} | Saga ID: ${id} | NR: ${nr} | neachitat: ${neachitat}`,
          );
        }
      } else {
        // ── INSERT: factura noua ──
        if (existing) {
          log(
            `⏭️  Skip INSERT — deja inserata in Saga (ID: ${existing.ID_IESIRE}, NR: ${existing.NR_IESIRE?.trim()})`,
          );
          continue;
        }
        const { newId, nextNr } = await sagaInsertFactura(item.factura);
        log(
          `✅ Inserat in Saga | TMS ID: ${item.tmsInvoiceId} | Saga ID: ${newId} | NR: ${nextNr}`,
        );
      }
    } catch (err) {
      log(`❌ ${action} esuat pentru ${item.tmsInvoiceId}:`, err.message);
    }
  }
  log(`📥 Procesate ${data.count} facturi pending.`);
}

// ─── Step 2: Detecteaza validate / plati → POST la TMS ───────────────────────
async function pushValidated() {
  const snapshot = loadSnapshot();
  const facturi = await sagaReadAll();
  const newSnapshot = {};
  const deRaportat = [];

  for (const f of facturi) {
    const hash = hashFactura(f);
    newSnapshot[f.ID_IESIRE] = { hash, validat: f.VALIDAT?.trim() };

    const prev = snapshot[f.ID_IESIRE];

    // Factura validata (nou validata sau modificata/platita dupa validare)
    if (f.VALIDAT?.trim() === "V") {
      const nrCurat = f.NR_IESIRE?.trim();
      const refTMS = f.INF_SUPLM?.trim();

      // Raporteaza doar daca: e noua in snapshot SAU hash s-a schimbat
      if (!prev || prev.hash !== hash) {
        deRaportat.push({
          tmsInvoiceId: refTMS || `saga-${f.ID_IESIRE}`,
          sagaNumber: nrCurat,
          sagaId: f.ID_IESIRE,
          cod: f.COD?.trim(),
          clientNume: f.DENUMIRE?.trim(),
          data: f.DATA,
          total: f.TOTAL,
          tva: f.TVA,
          bazaTva: f.BAZA_TVA,
          neachitat: f.NEACHITAT,
          cursRef: f.CURS_REF,
        });
      }
    }
  }

  saveSnapshot(newSnapshot);

  if (deRaportat.length === 0) {
    log("✅ Nicio factura noua validata.");
    return;
  }

  for (const payload of deRaportat) {
    const res = await fetch(`${CONFIG.baseUrl}/api/saga/invoices/validated`, {
      method: "POST",
      headers: tmsHeaders(),
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const platInfo = payload.neachitat != null ? ` | neachitat: ${payload.neachitat}` : "";
      log(
        `✅ Validata trimisa la TMS | NR: ${payload.sagaNumber} | Ref: ${payload.tmsInvoiceId}${platInfo}`,
      );
    } else {
      log(`❌ Post validata esuat (${res.status}):`, await res.text());
    }
  }
}

// ─── Tick ─────────────────────────────────────────────────────────────────────
async function tick() {
  try {
    await pullPending();
    await pushValidated();
  } catch (err) {
    log("❌ Tick error:", err.message);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  log("🚀 Saga Agent pornit");
  log(`   TMS:      ${CONFIG.baseUrl}`);
  log(`   Interval: ${CONFIG.pollMs / 1000}s`);

  await ping();
  await tick();
  setInterval(tick, CONFIG.pollMs);
}

main().catch((err) => {
  log("💥 Fatal:", err.message);
  process.exit(1);
});
