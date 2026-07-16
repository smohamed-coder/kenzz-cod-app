const express = require("express");
const multer = require("multer");
const path = require("path");
const db = require("./db");
const { parseUploadedFiles } = require("./parser");

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

app.use(express.json({ limit: "100mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- API Routes ----------

// Get all orders
app.get("/api/orders", (req, res) => {
  try { res.json(db.getAllOrders()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Get imports history
app.get("/api/imports", (req, res) => {
  try { res.json(db.getAllImports()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Get returns
app.get("/api/returns", (req, res) => {
  try { res.json(db.getAllReturns()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Get setting
app.get("/api/settings/:key", (req, res) => {
  try { res.json({ value: db.getSetting(req.params.key) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Put setting
app.post("/api/settings/:key", (req, res) => {
  try { db.putSetting(req.params.key, req.body.value); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Upload files (1-3 files: journal, collections, sellers or legacy)
app.post("/api/upload", upload.array("files", 3), async (req, res) => {
  try {
    const files = req.files;
    if (!files || !files.length) return res.status(400).json({ error: "No files uploaded" });

    const result = parseUploadedFiles(files);
    db.upsertMany(result.records);

    const months = [...new Set(result.records.filter(r => r.dd != null).map(r => {
      const d = new Date(r.dd * 86400000);
      return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1;
    }))].sort();
    const monthLabels = months.map(mk => {
      const d = new Date(Date.UTC(Math.floor(mk/100), mk%100-1, 1));
      return d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    }).join(", ");

    db.addImport.run(
      files.map(f => f.originalname).join(" + "),
      Date.now(),
      result.records.length,
      monthLabels,
      JSON.stringify(result.info)
    );

    res.json({ ok: true, records: result.records.length, info: result.info });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add returns
app.post("/api/returns", (req, res) => {
  try {
    const { tns } = req.body;
    if (!Array.isArray(tns)) return res.status(400).json({ error: "tns must be an array" });
    const now = Date.now();
    for (const tn of tns) db.addReturn.run(tn, now);
    res.json({ ok: true, count: tns.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Remove return
app.delete("/api/returns/:tn", (req, res) => {
  try { db.removeReturn.run(req.params.tn); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Clear all returns
app.delete("/api/returns", (req, res) => {
  try { db.clearReturns(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Clear all data
app.post("/api/clear", (req, res) => {
  try { db.clearAll(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Export database as JSON
app.get("/api/export", (req, res) => {
  try {
    const orders = db.getAllOrders();
    const imports = db.getAllImports();
    const returns = db.getAllReturns();
    const terms = db.getSetting("terms");
    const keys = ["tn","tpl","seller","mp","retail","grand","coll","varc","comment","cd","dd","pd","pd2raw"];
    const data = orders.map(o => keys.map(k => o[k] ?? null));
    res.json({ v: 2, keys, data, imports, returns, terms: terms || {}, at: Date.now() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Import database from JSON
app.post("/api/import-db", (req, res) => {
  try {
    const payload = req.body;
    let records;
    if (payload.v === 2 && payload.keys && payload.data) {
      records = payload.data.map(row => {
        const o = {};
        payload.keys.forEach((k, i) => o[k] = row[i]);
        return o;
      });
    } else if (payload.orders) {
      records = payload.orders;
    } else {
      return res.status(400).json({ error: "Unrecognized format" });
    }
    db.upsertMany(records);
    if (payload.imports) for (const imp of payload.imports) {
      db.addImport.run(imp.name || "", imp.at || Date.now(), imp.rows || 0, imp.months || "", JSON.stringify(imp.info || {}));
    }
    if (payload.returns && payload.returns.length) {
      const now = Date.now();
      for (const tn of payload.returns) db.addReturn.run(tn, now);
    }
    if (payload.terms) db.putSetting("terms", payload.terms);
    res.json({ ok: true, records: records.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SPA fallback
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`Kenzz COD Cash Cycle running on http://localhost:${PORT}`));
