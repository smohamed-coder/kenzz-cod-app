const XLSX = require("xlsx");

const norm = v => String(v == null ? "" : v).toLowerCase().replace(/[_\s]+/g, " ").trim();
const serialToDay = v => (typeof v === "number" && isFinite(v) && v > 20000 && v < 80000) ? Math.round(v) - 25569 : null;
const num = v => (typeof v === "number" && isFinite(v)) ? v : null;

function detectFileType(wb) {
  const keys = Object.keys(wb.Sheets);
  if (keys.some(k => norm(k) === "details")) return "legacy";
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[keys[0]], { header: 1, raw: true, defval: null });
  let hIdx = -1;
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    if ((rows[i] || []).some(c => norm(c).includes("tracking"))) { hIdx = i; break; }
  }
  if (hIdx < 0) return "unknown";
  const hdr = (rows[hIdx] || []).map(norm);
  const has = (...terms) => terms.some(t => hdr.some(h => h.includes(t)));
  if (has("delivery") && has("payment") && has("third party", "3pl", "logistics")) return "journal";
  if (has("collection date") && !has("delivery") && !has("source vendor")) return "collections";
  if (has("source vendor") && has("grand total") && !has("delivery")) return "expected";
  if (hdr.length <= 5 && has("collection")) return "collections";
  if (has("source vendor")) return "expected";
  if (has("grand total") && has("delivery")) return "journal";
  return "unknown";
}

function parseLegacy(wb) {
  const findSheet = (names) => {
    const keys = Object.keys(wb.Sheets);
    for (const want of names) { const k = keys.find(x => norm(x) === want); if (k) return k; }
    for (const want of names) { const k = keys.find(x => norm(x).includes(want)); if (k) return k; }
    return null;
  };
  const detName = findSheet(["details", "raw data"]);
  if (!detName) throw new Error("No 'Details' sheet found");
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[detName], { header: 1, raw: true, defval: null });
  let hIdx = -1;
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    if ((rows[i] || []).some(c => ["tracking_number", "tracking number"].includes(norm(c)))) { hIdx = i; break; }
  }
  if (hIdx < 0) throw new Error("No header row found in " + detName);
  const hdr = (rows[hIdx] || []).map(norm);
  const col = (...names) => { for (const n of names) { const i = hdr.indexOf(n); if (i >= 0) return i; } return -1; };
  const C = {
    tpl: col("third_party_logistics_partner", "3pl partner"),
    tn: col("tracking_number", "tracking number"),
    mp: col("mp stock", "mp stock (egp)"),
    retail: col("retail", "retail (egp)"),
    grand: col("grand total"),
    coll: col("collection (egp)", "collection"),
    varc: col("variance"),
    comment: col("comment"),
    cd: col("collection date"),
    dd: col("delivery date"),
    pd: col("payment date"),
    seller: col("seller", "source_vendor")
  };
  if (C.grand < 0 && C.retail >= 0) C.grand = C.retail + 1;

  const sellerMap = {};
  const selName = findSheet(["sellers"]);
  if (selName) {
    const srows = XLSX.utils.sheet_to_json(wb.Sheets[selName], { header: 1, raw: true, defval: null });
    let sh = -1;
    for (let i = 0; i < Math.min(8, srows.length); i++) {
      if ((srows[i] || []).some(c => norm(c) === "source_vendor")) { sh = i; break; }
    }
    if (sh >= 0) {
      const shdr = (srows[sh] || []).map(norm);
      const sv = shdr.indexOf("source_vendor"), st = shdr.findIndex(x => x === "tracking_number" || x === "tracking number");
      if (sv >= 0 && st >= 0) {
        for (let i = sh + 1; i < srows.length; i++) {
          const r = srows[i]; if (!r) continue;
          if (r[st] != null && r[sv] != null && norm(r[sv]) !== "grand total")
            sellerMap[String(r[st])] = String(r[sv]).trim();
        }
      }
    }
  }

  const records = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const tplRaw = C.tpl >= 0 ? r[C.tpl] : null, tnRaw = C.tn >= 0 ? r[C.tn] : null;
    if (!tplRaw || !tnRaw) continue;
    const tpl = String(tplRaw).trim();
    if (!tpl || norm(tpl) === "grand total") continue;
    let comment = String(r[C.comment] == null ? "" : r[C.comment]).trim();
    const cn = norm(comment);
    comment = cn === "collected" ? "Collected" : cn === "not collected" ? "Not Collected" : cn === "return" ? "Return" : comment;
    let seller = sellerMap[String(tnRaw)] || (C.seller >= 0 && r[C.seller] != null ? String(r[C.seller]).trim() : "");
    if (!seller || seller === "0") seller = "Unknown";
    records.push({
      tn: String(tnRaw).trim(), tpl, seller,
      mp: num(C.mp >= 0 ? r[C.mp] : null), retail: num(C.retail >= 0 ? r[C.retail] : null),
      grand: num(C.grand >= 0 ? r[C.grand] : null), coll: num(C.coll >= 0 ? r[C.coll] : null),
      varc: C.varc >= 0 ? num(r[C.varc]) : null, comment,
      cd: serialToDay(C.cd >= 0 ? r[C.cd] : null), dd: serialToDay(C.dd >= 0 ? r[C.dd] : null),
      pd: serialToDay(C.pd >= 0 ? r[C.pd] : null)
    });
  }
  return { records, info: { sheet: detName, sellerSheet: selName || "(none)", skipped: 0, noSeller: records.filter(r => r.seller === "Unknown").length } };
}

function parseJournal(wb) {
  const keys = Object.keys(wb.Sheets);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[keys[0]], { header: 1, raw: true, defval: null });
  let hIdx = -1;
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    if ((rows[i] || []).some(c => norm(c).includes("tracking"))) { hIdx = i; break; }
  }
  if (hIdx < 0) throw new Error("Journal: no header row found");
  const hdr = (rows[hIdx] || []).map(norm);
  const col = (...names) => { for (const n of names) { const i = hdr.findIndex(h => h.includes(n)); if (i >= 0) return i; } return -1; };
  const C = { tpl: col("third party", "3pl", "logistics"), tn: col("tracking number", "tracking"), mp: col("mp stock"), retail: col("retail"), grand: col("grand total"), dd: col("delivery date", "delivery"), pd: col("payment date") };
  const pd2candidates = hdr.reduce((a, h, i) => { if (h.includes("payment") && h.includes("2") && i !== C.pd) a.push(i); return a; }, []);
  const pd2Idx = pd2candidates.length ? pd2candidates[0] : -1;
  const records = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const tplRaw = C.tpl >= 0 ? r[C.tpl] : null, tnRaw = C.tn >= 0 ? r[C.tn] : null;
    if (!tplRaw || !tnRaw) continue;
    const tpl = String(tplRaw).trim();
    if (!tpl || norm(tpl) === "grand total") continue;
    records.push({
      tn: String(tnRaw).trim(), tpl, seller: "",
      mp: num(C.mp >= 0 ? r[C.mp] : null), retail: num(C.retail >= 0 ? r[C.retail] : null),
      grand: num(C.grand >= 0 ? r[C.grand] : null), coll: null, varc: null,
      comment: "Not Collected", cd: null,
      dd: serialToDay(C.dd >= 0 ? r[C.dd] : null), pd: serialToDay(C.pd >= 0 ? r[C.pd] : null),
      pd2raw: serialToDay(pd2Idx >= 0 ? r[pd2Idx] : null)
    });
  }
  return records;
}

function parseCollections(wb) {
  const keys = Object.keys(wb.Sheets);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[keys[0]], { header: 1, raw: true, defval: null });
  let hIdx = -1;
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    if ((rows[i] || []).some(c => norm(c).includes("tracking"))) { hIdx = i; break; }
  }
  if (hIdx < 0) throw new Error("Collections: no header row found");
  const hdr = (rows[hIdx] || []).map(norm);
  const col = (...names) => { for (const n of names) { const i = hdr.findIndex(h => h.includes(n)); if (i >= 0) return i; } return -1; };
  const tnIdx = col("tracking number", "tracking");
  const cdIdx = col("collection date", "collection", "payment date");
  const map = {};
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const tn = r[tnIdx]; if (tn == null) continue;
    const cd = serialToDay(cdIdx >= 0 ? r[cdIdx] : null);
    if (cd != null) map[String(tn).trim()] = { cd };
  }
  return map;
}

function parseExpected(wb) {
  const keys = Object.keys(wb.Sheets);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[keys[0]], { header: 1, raw: true, defval: null });
  let hIdx = -1;
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    if ((rows[i] || []).some(c => norm(c).includes("tracking"))) { hIdx = i; break; }
  }
  if (hIdx < 0) throw new Error("Sellers: no header row found");
  const hdr = (rows[hIdx] || []).map(norm);
  const col = (...names) => { for (const n of names) { const i = hdr.findIndex(h => h.includes(n)); if (i >= 0) return i; } return -1; };
  const tnIdx = col("tracking number", "tracking");
  const sellerIdx = col("source vendor", "vendor", "seller");
  const map = {};
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const tn = r[tnIdx]; if (tn == null) continue;
    const seller = sellerIdx >= 0 && r[sellerIdx] ? String(r[sellerIdx]).trim() : "Unknown";
    if (norm(seller) !== "grand total") map[String(tn).trim()] = seller;
  }
  return map;
}

function parseUploadedFiles(files) {
  const parsed = { journal: null, collections: null, expected: null, legacy: null };
  const names = {};

  for (const f of files) {
    const wb = XLSX.read(f.buffer, { type: "buffer", dense: true, cellDates: false });
    const type = detectFileType(wb);
    names[type] = f.originalname;
    if (type === "legacy") return parseLegacy(wb);
    if (type === "journal") parsed.journal = parseJournal(wb);
    else if (type === "collections") parsed.collections = parseCollections(wb);
    else if (type === "expected") parsed.expected = parseExpected(wb);
  }

  if (!parsed.journal) throw new Error("No Journal file detected. Ensure one file has: third_party_logistics_partner, tracking_number, Delivery Date, Payment Date, Grand Total.");

  const records = parsed.journal;
  const collections = parsed.collections || {};
  const expected = parsed.expected || {};
  let matched = 0;

  for (const rec of records) {
    const c = collections[rec.tn];
    if (c) { rec.comment = "Collected"; rec.cd = c.cd; rec.coll = rec.grand; matched++; }
    const seller = expected[rec.tn];
    if (seller) rec.seller = seller;
  }

  return {
    records,
    info: {
      sheet: "Journal" + (parsed.collections ? " + Collections" : "") + (parsed.expected ? " + Sellers" : ""),
      sellerSheet: names.expected || "(none)",
      matched, unmatched: records.length - matched,
      noSeller: records.filter(r => !r.seller || r.seller === "Unknown").length
    }
  };
}

module.exports = { parseUploadedFiles };
