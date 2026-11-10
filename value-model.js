/* UMA AI - Value Hunting Engine v1
 * Browser-safe, dependency-free scoring helpers.
 * Input history: one row per horse per race from the JRA annual-results CSV.
 * This file is intentionally independent of the current UI until data validation is complete.
 */
(function (root) {
  "use strict";

  const WEIGHTS = {
    recent: 30,
    course: 15,
    surface: 15,
    distance: 15,
    going: 10,
    jockey: 10,
    experience: 5
  };

  const text = (v) => String(v == null ? "" : v).trim();
  const number = (v) => {
    if (v == null || text(v) === "") return null;
    const n = Number(String(v).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const surfaceKey = (v) => {
    const s = text(v).toLowerCase();
    if (/芝|turf/.test(s)) return "turf";
    if (/ダ| dirt|dirt|ダート/.test(s)) return "dirt";
    return "";
  };
  const goingKey = (v) => {
    const s = text(v);
    if (!s) return "";
    if (/良/.test(s)) return "良";
    if (/稍/.test(s)) return "稍重";
    if (/重/.test(s)) return "重";
    if (/不/.test(s)) return "不良";
    return s;
  };
  const dateKey = (v) => {
    const s = text(v).replace(/[年月]/g, "-").replace(/日/g, "");
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  };
  const finishNumber = (v) => {
    const n = number(v);
    return n != null && n > 0 ? n : null; // 取消・除外・中止等は順位評価から除外
  };

  function normalizeResult(row) {
    const get = (...keys) => {
      for (const k of keys) if (row && row[k] != null && text(row[k]) !== "") return row[k];
      return "";
    };
    return {
      date: dateKey(get("日付", "date")),
      venue: text(get("競馬場", "開催", "venue")),
      raceNo: number(get("レース番号", "R", "race_no")),
      raceName: text(get("レース名", "race_name")),
      surface: surfaceKey(get("芝ダート", "芝・ダート", "surface")),
      distance: number(get("距離", "distance")),
      going: goingKey(get("馬場", "馬場状態", "going")),
      finish: finishNumber(get("着順", "順位", "finish")),
      gate: number(get("枠番", "枠", "gate")),
      horseNo: number(get("馬番", "horse_no")),
      horse: text(get("馬名", "horse")),
      sexAge: text(get("性齢", "性別年齢", "sex_age")),
      jockey: text(get("騎手", "騎手名", "jockey"))
    };
  }

  function raceKey(r) {
    return [r.date, r.venue, r.raceNo].join("|");
  }

  function prepareHistory(rawRows) {
    const rows = (rawRows || []).map(normalizeResult).filter(r =>
      r.date && r.venue && r.raceNo != null && r.horse
    );
    const races = new Map();
    rows.forEach(r => {
      const key = raceKey(r);
      if (!races.has(key)) races.set(key, []);
      races.get(key).push(r);
    });
    for (const group of races.values()) {
      const fieldSize = group.length;
      group.forEach(r => {
        r.fieldSize = fieldSize;
        r.performance = fieldSize > 1 && r.finish != null
          ? ((fieldSize - r.finish + 0.5) / fieldSize) * 100
          : null;
      });
    }
    const byHorse = new Map();
    const byJockey = new Map();
    rows.forEach(r => {
      if (!byHorse.has(r.horse)) byHorse.set(r.horse, []);
      byHorse.get(r.horse).push(r);
      if (r.jockey) {
        if (!byJockey.has(r.jockey)) byJockey.set(r.jockey, []);
        byJockey.get(r.jockey).push(r);
      }
    });
    for (const list of byHorse.values()) list.sort((a, b) => b.date.localeCompare(a.date));
    for (const list of byJockey.values()) list.sort((a, b) => b.date.localeCompare(a.date));
    return { rows, byHorse, byJockey, raceCount: races.size };
  }

  function weightedMean(items, valueOf) {
    let sum = 0, weight = 0;
    items.forEach((item, i) => {
      const v = valueOf(item);
      if (v == null || !Number.isFinite(v)) return;
      const w = Math.exp(-i / 3); // 直近を重視
      sum += v * w;
      weight += w;
    });
    return weight ? sum / weight : null;
  }

  function scoreHorse(entrant, history, targetDate) {
    const horse = text(entrant.horse || entrant["馬名"]);
    const cutoff = dateKey(targetDate || entrant.date || entrant["日付"]);
    const past = (history.byHorse.get(horse) || []).filter(r => !cutoff || r.date < cutoff);
    const surface = surfaceKey(entrant.surface || entrant["芝ダート"]);
    const venue = text(entrant.venue || entrant["競馬場"]);
    const distance = number(entrant.distance || entrant["距離"]);
    const going = goingKey(entrant.going || entrant["馬場"]);
    const jockey = text(entrant.jockey || entrant["騎手"]);

    const recent = weightedMean(past.slice(0, 5), r => r.performance);
    const sameCourse = past.filter(r => r.venue === venue);
    const course = weightedMean(sameCourse.slice(0, 8), r => r.performance);
    const sameSurface = past.filter(r => r.surface && r.surface === surface);
    const surfaceScore = weightedMean(sameSurface.slice(0, 8), r => r.performance);
    const sameDistance = past.filter(r =>
      r.distance != null && distance != null &&
      (!surface || r.surface === surface) && Math.abs(r.distance - distance) <= 200
    );
    const distanceScore = weightedMean(sameDistance.slice(0, 8), r => r.performance);
    const sameGoing = past.filter(r =>
      r.going && going && r.going === going &&
      (!surface || r.surface === surface)
    );
    const goingScore = weightedMean(sameGoing.slice(0, 8), r => r.performance);

    const jockeyRows = (history.byJockey.get(jockey) || []).filter(r => !cutoff || r.date < cutoff);
    const jockeyRaw = weightedMean(jockeyRows.slice(0, 30), r => r.performance);
    const jockeyScore = jockeyRaw == null ? null :
      (jockeyRaw * jockeyRows.length + 50 * 10) / (jockeyRows.length + 10); // 少数騎乗は平均へ縮約

    const experience = past.length ? Math.min(100, (past.length / 8) * 100) : null;
    const components = {
      recent, course, surface: surfaceScore, distance: distanceScore,
      going: goingScore, jockey: jockeyScore, experience
    };
    let weighted = 0, available = 0;
    Object.entries(WEIGHTS).forEach(([key, weight]) => {
      const value = components[key];
      if (value != null && Number.isFinite(value)) {
        weighted += value * weight;
        available += weight;
      }
    });
    const coverage = available;
    return {
      horse,
      score: available ? Math.round(weighted / available) : null,
      coverage,
      starts: past.length,
      components,
      evidence: {
        recentStarts: Math.min(5, past.length),
        courseStarts: sameCourse.length,
        surfaceStarts: sameSurface.length,
        distanceStarts: sameDistance.length,
        goingStarts: sameGoing.length,
        jockeyStarts: jockeyRows.length
      }
    };
  }

  function calibrateWinProbability(samples, minSamples) {
    const valid = (samples || []).filter(s =>
      Number.isFinite(Number(s.score)) && Number(s.score) >= 0 &&
      Number(s.score) <= 100 && Number(s.finish) > 0
    );
    const minimum = minSamples == null ? 200 : minSamples;
    if (valid.length < minimum) {
      return { ready: false, sampleCount: valid.length, reason: "校正用の過去検証データが不足しています。" };
    }
    const globalRate = valid.filter(s => Number(s.finish) === 1).length / valid.length;
    const bins = Array.from({ length: 20 }, (_, i) => ({ low: i * 5, high: i * 5 + 4.999, n: 0, wins: 0 }));
    valid.forEach(s => {
      const index = Math.min(19, Math.floor(Number(s.score) / 5));
      bins[index].n++;
      if (Number(s.finish) === 1) bins[index].wins++;
    });
    bins.forEach(b => {
      const prior = 30; // 小標本の極端な勝率を抑制
      b.probability = (b.wins + globalRate * prior) / (b.n + prior);
    });
    return { ready: true, sampleCount: valid.length, globalRate, bins };
  }

  function buildWalkForwardCalibration(history, options) {
    const opts = Object.assign({ minStarts: 3, minSamples: 200 }, options || {});
    const samples = [];
    (history.rows || []).forEach(row => {
      if (row.finish == null) return;
      const scored = scoreHorse({
        horse: row.horse,
        venue: row.venue,
        surface: row.surface,
        distance: row.distance,
        going: row.going,
        jockey: row.jockey
      }, history, row.date);
      if (scored.score == null || scored.starts < opts.minStarts) return;
      samples.push({ score: scored.score, finish: row.finish, date: row.date, horse: row.horse });
    });
    const calibration = calibrateWinProbability(samples, opts.minSamples);
    calibration.method = "walk-forward";
    calibration.minStarts = opts.minStarts;
    return calibration;
  }

  function evaluateRaceValue(scoredEntrants, calibration, options) {
    const opts = Object.assign({ minScore: 60, minCoverage: 60, minStarts: 3, minOdds: 5, minEdge: 0.10 }, options || {});
    const rows = (scoredEntrants || []).map(h => {
      const odds = number(h.odds || h["単勝オッズ"]);
      return Object.assign({}, h, { odds });
    });
    const oddsComplete = rows.length >= 2 && rows.every(h => h.odds != null && h.odds > 1);
    const inverseSum = rows.reduce((sum, h) => sum + (h.odds && h.odds > 1 ? 1 / h.odds : 0), 0);
    return rows.map(h => {
      if (!calibration || !calibration.ready || !oddsComplete || h.score == null || !h.odds || h.odds <= 1 || !inverseSum) {
        return Object.assign({}, h, { valueAvailable: false, valueCandidate: false, valueReason: !oddsComplete ? "全出走馬のオッズが揃っていません。" : "校正済み確率または必要データが不足しています。" });
      }
      const bin = calibration.bins[Math.min(19, Math.floor(h.score / 5))];
      const marketProbability = (1 / h.odds) / inverseSum;
      const edge = bin.probability - marketProbability;
      const expectedReturn = bin.probability * h.odds;
      const eligible = h.score >= opts.minScore && h.coverage >= opts.minCoverage &&
        h.starts >= opts.minStarts && h.odds >= opts.minOdds;
      return Object.assign({}, h, {
        valueAvailable: true,
        estimatedWinProbability: bin.probability,
        marketProbability,
        valueEdge: edge,
        expectedReturn,
        valueCandidate: eligible && edge >= opts.minEdge && expectedReturn >= 1.10
      });
    }).sort((a, b) =>
      (Number(b.valueCandidate) - Number(a.valueCandidate)) ||
      ((b.valueEdge || -1) - (a.valueEdge || -1)) ||
      ((b.score || -1) - (a.score || -1))
    );
  }

  root.UMAIValueModel = {
    version: "1.0.0",
    weights: WEIGHTS,
    normalizeResult,
    prepareHistory,
    scoreHorse,
    calibrateWinProbability,
    buildWalkForwardCalibration,
    evaluateRaceValue
  };
})(typeof window !== "undefined" ? window : globalThis);
