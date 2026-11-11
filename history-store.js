/* UMA AI - local historical-results store.
 * CSVs are kept in this browser's IndexedDB; they are not uploaded to GitHub.
 */
(function (root) {
  "use strict";

  const DB_NAME = "uma-ai-history";
  const DB_VERSION = 1;
  const STORE = "results";

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) {
        reject(new Error("このブラウザではローカル履歴保存（IndexedDB）が使えません。"));
        return;
      }
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("履歴データベースを開けません。"));
    });
  }

  function parseCSV(raw) {
    const source = String(raw || "").replace(/^\uFEFF/, "");
    const grid = [];
    let row = [], cell = "", quoted = false;

    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (quoted) {
        if (ch === '"' && source[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        if (row.some(v => String(v).trim() !== "")) grid.push(row);
        row = [];
        cell = "";
      } else if (ch === "\r") {
        row.push(cell);
        if (row.some(v => String(v).trim() !== "")) grid.push(row);
        row = [];
        cell = "";
        if (source[i + 1] === "\n") i++;
      } else {
        cell += ch;
      }
    }
    if (row.length || cell !== "") {
      row.push(cell);
      if (row.some(v => String(v).trim() !== "")) grid.push(row);
    }
    if (grid.length < 2) throw new Error("CSVにデータ行がありません。");

    const headers = grid[0].map(v => String(v || "").trim());
    return grid.slice(1).map(cells => {
      const item = {};
      headers.forEach((header, i) => {
        if (header) item[header] = String(cells[i] == null ? "" : cells[i]).trim();
      });
      return item;
    }).filter(item => Object.values(item).some(v => v !== ""));
  }

  const pick = (row, ...keys) => {
    for (const key of keys) {
      if (row && row[key] != null && String(row[key]).trim() !== "") return String(row[key]).trim();
    }
    return "";
  };

  function dateKey(value) {
    const s = String(value || "").trim();
    const m = s.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
    if (!m) return s;
    return m[1] + "-" + String(Number(m[2])).padStart(2, "0") + "-" + String(Number(m[3])).padStart(2, "0");
  }

  function recordId(row) {
    const date = dateKey(pick(row, "日付", "date"));
    const venue = pick(row, "競馬場", "開催", "venue");
    const raceNo = pick(row, "レース番号", "R", "race_no").replace(/[^\d]/g, "");
    const horseNo = pick(row, "馬番", "馬番号", "horse_no").replace(/[^\d]/g, "");
    const horse = pick(row, "馬名", "horse");
    if (!date || !venue || !raceNo || !horse) return "";
    return [date, venue, raceNo, horseNo || horse].join("|");
  }

  function mergeRows(oldRow, newRow) {
    const merged = Object.assign({}, oldRow || {});
    Object.keys(newRow || {}).forEach(key => {
      if (String(newRow[key] == null ? "" : newRow[key]).trim() !== "" ||
          String(merged[key] == null ? "" : merged[key]).trim() === "") {
        merged[key] = newRow[key];
      }
    });
    return merged;
  }

  async function getRows() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error("保存済み履歴を読み込めません。"));
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("保存済み履歴の読み込みに失敗しました。"));
      };
    });
  }

  async function getStats() {
    const rows = await getRows();
    const races = new Set(rows.map(row => [
      row["日付"] || row.date,
      row["競馬場"] || row.venue,
      row["レース番号"] || row.race_no
    ].join("|")));
    return { rowCount: rows.length, raceCount: races.size };
  }

  async function importFiles(fileList) {
    const files = Array.from(fileList || []).filter(file => /\.csv$/i.test(file.name || ""));
    if (!files.length) throw new Error("CSVファイルを選択してください。");

    const incoming = new Map();
    let sourceRows = 0;

    for (const file of files) {
      const parsed = parseCSV(await file.text());
      for (const row of parsed) {
        const id = recordId(row);
        if (!id) continue;
        sourceRows++;
        row.id = id;
        row.sourceFile = file.name || "選択CSV";
        incoming.set(id, mergeRows(incoming.get(id), row));
      }
    }
    if (!incoming.size) {
      throw new Error("日付・競馬場・レース番号・馬名を含む成績行が見つかりません。");
    }

    const existing = await getRows();
    const existingMap = new Map(existing.map(row => [row.id || recordId(row), row]));
    let added = 0;
    const toSave = [];
    incoming.forEach((row, id) => {
      const previous = existingMap.get(id);
      if (!previous) added++;
      const merged = mergeRows(previous, row);
      merged.id = id;
      toSave.push(merged);
    });

    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      toSave.forEach(row => store.put(row));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("履歴の保存に失敗しました。"));
      tx.onabort = () => reject(tx.error || new Error("履歴の保存が中断されました。"));
    }).finally(() => db.close());

    try {
      if (root.navigator && root.navigator.storage && root.navigator.storage.persist) {
        await root.navigator.storage.persist();
      }
    } catch (_) {}

    const stats = await getStats();
    return {
      fileCount: files.length,
      sourceRows,
      uniqueRows: incoming.size,
      duplicates: Math.max(0, sourceRows - incoming.size),
      added,
      totalRows: stats.rowCount,
      raceCount: stats.raceCount
    };
  }

  root.UMAIHistoryStore = {
    parseCSV,
    importFiles,
    getRows,
    getStats
  };
})(typeof window !== "undefined" ? window : globalThis);
