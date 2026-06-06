const { Pool } = require("pg");

let pool = null;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no configurado");
  }
  pool = new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
    max: 3,
    connectionTimeoutMillis: 8000,
    query_timeout: 15000,
    idleTimeoutMillis: 30000,
  });
  return pool;
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeTruck(value) {
  return cleanString(value).toUpperCase().replace(/\s+/g, "");
}

function parseTruck(value) {
  const normalized = normalizeTruck(value);
  const match = normalized.match(/^(\d+)([A-Z]*)$/);
  return {
    full: normalized,
    base: match?.[1] || normalized,
    suffix: match?.[2] || "",
  };
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(cleanString(value));
}

function parseTruckList(value) {
  return cleanString(value)
    .split(",")
    .map(normalizeTruck)
    .filter(Boolean)
    .filter((truck, index, arr) => arr.indexOf(truck) === index);
}

function asRecords(row) {
  return Array.isArray(row?.detail_json) ? row.detail_json : [];
}

function buildLoadSummary(rows, requestedTrucks) {
  const byTruck = new Map(requestedTrucks.map((truck) => [truck, {
    truck,
    truckBase: parseTruck(truck).base,
    found: false,
    loads: [],
    loadCount: 0,
    ticketCount: 0,
    palletCapacity: null,
    palletDifference: null,
    source: "",
    sucursal: "",
  }]));

  for (const row of rows) {
    for (const record of asRecords(row)) {
      const trip = normalizeTruck(record?.camViaje);
      if (!trip || !byTruck.has(trip)) continue;
      const current = byTruck.get(trip);
      const carga = cleanString(record?.carga);
      if (!carga) continue;
      if (current.loads.some((load) => load.carga === carga)) continue;
      const tickets = Number(record?.tickets) || 0;
      current.loads.push({ carga, tickets });
      current.ticketCount += tickets;
      current.found = true;
      current.source = current.source || cleanString(row.fuente);
      current.sucursal = current.sucursal || cleanString(row.sucursal_codigo);
    }
  }

  for (const item of byTruck.values()) {
    item.loadCount = item.loads.length;
  }
  return byTruck;
}

async function applyPalletCapacities(client, byTruck, sucursalCode) {
  const truckKeys = Array.from(byTruck.values()).flatMap((item) => [item.truck, item.truckBase]);
  const uniqueKeys = truckKeys.filter(Boolean).filter((key, index, arr) => arr.indexOf(key) === index);
  if (!uniqueKeys.length) return;

  const params = [uniqueKeys];
  let sucursalFilter = "";
  if (sucursalCode) {
    params.push(sucursalCode);
    sucursalFilter = `AND s.codigo = $${params.length}`;
  }

  const result = await client.query(
    `SELECT
       s.codigo AS sucursal_codigo,
       UPPER(REPLACE(c.numero_camion, ' ', '')) AS numero_camion,
       c.capacidad_pallets
     FROM camiones c
     JOIN sucursales s ON s.id = c.sucursal_id
     WHERE c.activo = TRUE
       AND UPPER(REPLACE(c.numero_camion, ' ', '')) = ANY($1)
       ${sucursalFilter}`,
    params
  );

  for (const item of byTruck.values()) {
    const exact = result.rows.find((row) => cleanString(row.numero_camion) === item.truck && (!item.sucursal || row.sucursal_codigo === item.sucursal));
    const base = result.rows.find((row) => cleanString(row.numero_camion) === item.truckBase && (!item.sucursal || row.sucursal_codigo === item.sucursal));
    const found = exact || base || result.rows.find((row) => cleanString(row.numero_camion) === item.truckBase || cleanString(row.numero_camion) === item.truck);
    const capacity = found?.capacidad_pallets;
    if (capacity !== null && capacity !== undefined && capacity !== "") {
      item.palletCapacity = Number(capacity);
      item.palletDifference = Math.max(0, item.ticketCount - item.palletCapacity);
    }
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, error: "Metodo no permitido" });
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const fecha = cleanString(url.searchParams.get("fecha"));
    const trucks = parseTruckList(url.searchParams.get("trucks"));
    const sucursal = cleanString(url.searchParams.get("sucursal") || process.env.SELLOGUIA_SUCURSAL || "CE00").toUpperCase();

    if (!isIsoDate(fecha)) return sendJson(res, 400, { ok: false, error: "fecha debe venir como YYYY-MM-DD" });
    if (!trucks.length) return sendJson(res, 400, { ok: false, error: "trucks debe incluir al menos un camion" });

    const client = await getPool().connect();
    try {
      const params = [fecha];
      let sucursalFilter = "";
      if (sucursal) {
        params.push(sucursal);
        sucursalFilter = `AND s.codigo = $${params.length}`;
      }

      const result = await client.query(
        `SELECT
           s.codigo AS sucursal_codigo,
           f.fuente,
           f.detail_json
         FROM preventa_beta_fuentes f
         JOIN sucursales s ON s.id = f.sucursal_id
         WHERE f.fecha_preventa = $1::DATE
           AND f.deleted_at IS NULL
           ${sucursalFilter}
         ORDER BY f.fuente`,
        params
      );

      const byTruck = buildLoadSummary(result.rows, trucks);
      await applyPalletCapacities(client, byTruck, sucursal);

      return sendJson(res, 200, {
        ok: true,
        fecha,
        sucursal,
        trucks: Array.from(byTruck.values()),
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("dispatch-data error", err);
    return sendJson(res, 500, { ok: false, error: "No se pudo consultar la preventa" });
  }
};
