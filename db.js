const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "kenzz.db");

// ensure data dir exists
const fs = require("fs");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------- Schema ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    tn TEXT PRIMARY KEY,
    tpl TEXT,
    seller TEXT,
    mp REAL,
    retail REAL,
    grand_total REAL,
    coll REAL,
    varc REAL,
    comment TEXT,
    cd INTEGER,
    dd INTEGER,
    pd INTEGER,
    pd2raw INTEGER
  );

  CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    at INTEGER,
    rows INTEGER,
    months TEXT,
    info TEXT
  );

  CREATE TABLE IF NOT EXISTS returns (
    tn TEXT PRIMARY KEY,
    at INTEGER
  );

  CREATE TABLE IF NOT EXISTS settings (
    k TEXT PRIMARY KEY,
    v TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_orders_dd ON orders(dd);
  CREATE INDEX IF NOT EXISTS idx_orders_tpl ON orders(tpl);
`);

// ---------- Prepared statements ----------
const upsertOrder = db.prepare(`
  INSERT OR REPLACE INTO orders (tn,tpl,seller,mp,retail,grand_total,coll,varc,comment,cd,dd,pd,pd2raw)
  VALUES (@tn,@tpl,@seller,@mp,@retail,@grand_total,@coll,@varc,@comment,@cd,@dd,@pd,@pd2raw)
`);

const upsertMany = db.transaction((records) => {
  for (const r of records) {
    upsertOrder.run({
      tn: r.tn, tpl: r.tpl || "", seller: r.seller || "",
      mp: r.mp ?? null, retail: r.retail ?? null,
      grand_total: r.grand ?? null, coll: r.coll ?? null, varc: r.varc ?? null,
      comment: r.comment || "Not Collected",
      cd: r.cd ?? null, dd: r.dd ?? null, pd: r.pd ?? null, pd2raw: r.pd2raw ?? null
    });
  }
});

const getAllOrders = () => db.prepare("SELECT * FROM orders").all().map(r => ({
  tn: r.tn, tpl: r.tpl, seller: r.seller,
  mp: r.mp, retail: r.retail, grand: r.grand_total, coll: r.coll, varc: r.varc,
  comment: r.comment, cd: r.cd, dd: r.dd, pd: r.pd, pd2raw: r.pd2raw
}));

const addImport = db.prepare("INSERT INTO imports (name,at,rows,months,info) VALUES (?,?,?,?,?)");
const getAllImports = () => db.prepare("SELECT * FROM imports ORDER BY id DESC").all();

const addReturn = db.prepare("INSERT OR REPLACE INTO returns (tn,at) VALUES (?,?)");
const removeReturn = db.prepare("DELETE FROM returns WHERE tn=?");
const clearReturns = () => db.exec("DELETE FROM returns");
const getAllReturns = () => db.prepare("SELECT tn FROM returns").all().map(r => r.tn);

const getSetting = (k) => { const r = db.prepare("SELECT v FROM settings WHERE k=?").get(k); return r ? JSON.parse(r.v) : null; };
const putSetting = (k, v) => db.prepare("INSERT OR REPLACE INTO settings (k,v) VALUES (?,?)").run(k, JSON.stringify(v));

const clearAll = () => { db.exec("DELETE FROM orders; DELETE FROM imports;"); };

module.exports = {
  upsertMany, getAllOrders, addImport, getAllImports,
  addReturn, removeReturn, clearReturns, getAllReturns,
  getSetting, putSetting, clearAll
};
