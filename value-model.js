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
      jockey: text(get("騎手", "騎手名", "jockey")),
      status: text(get("備考", "状態", "status"))
    };
  }

  const isNonRunner = (row) =>
    /競走除外|出走取消|取消/.test(text(row && (row.status || row["備考"] || row.note)));

  function raceKey(r) {
    return [r.date, r.venue, r.raceNo].join("|");
  }

  function prepareHistory(rawRows) {
    // 複数CSV・all_results.csv・個別CSVの重複をレース内の馬番で除外する。
    const unique = new Map();
    (rawRows || []).map(normalizeResult).filter(r =>
      r.date && r.venue && r.raceNo != null && r.horse
    ).forEach(r => {
      const key = [raceKey(r), r.horseNo != null ? r.horseNo : r.horse].join("|");
      const old = unique.get(key);
      if (!old) unique.set(key, r);
      else unique.set(key, Object.assign({}, old, Object.fromEntries(
        Object.entries(r).filter(([k, v]) => v !== "" && v != null)
      )));
    });
    const rows = Array.from(unique.values());
    const races = new Map();
    rows.forEach(r => {
      const key = raceKey(r);
      if (!races.has(key)) races.set(key, []);
      races.get(key).push(r);
    });
    for (const group of races.values()) {
      const starters = group.filter(r => !isNonRunner(r));
      const fieldSize = starters.length;
      group.forEach(r => {
        r.fieldSize = fieldSize;
        r.performance = !isNonRunner(r) && fieldSize > 1 && r.finish != null
          ? ((fieldSize - r.finish + 0.5) / fieldSize) * 100
          : null;
      });
    }
    const byHorse = new Map();
    const byJockey = new Map();
    rows.forEach(r => {
      if (isNonRunner(r)) return;
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
      const odds = number(h.odds != null ? h.odds : h["単勝オッズ"]);
      return Object.assign({}, h, { odds });
    });
    const starters = rows.filter(h => !isNonRunner(h));
    // 競走除外・取消馬は全頭オッズの充足判定から除外する。
    const oddsComplete = starters.length >= 2 && starters.every(h => h.odds != null && h.odds > 1);
    const inverseSum = starters.reduce((sum, h) => sum + (h.odds && h.odds > 1 ? 1 / h.odds : 0), 0);
    return rows.map(h => {
      if (isNonRunner(h)) {
        return Object.assign({}, h, {
          valueAvailable: false, valueCandidate: false,
          valueReason: "競走除外・取消のため予想対象外です。"
        });
      }
      if (!calibration || !calibration.ready || !oddsComplete || h.score == null || !h.odds || h.odds <= 1 || !inverseSum) {
        return Object.assign({}, h, {
          valueAvailable: false, valueCandidate: false,
          valueReason: !oddsComplete ? "出走馬のオッズが揃っていません。" : "校正済み確率または必要データが不足しています。"
        });
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

  // Chronological holdout backtest: train calibration only on earlier race dates.
  function runChronologicalBacktest(history, options) {
    const opts = Object.assign({ trainFraction: 0.6, minStarts: 3, minSamples: 200 }, options || {});
    const validRows = (history.rows || []).filter(r => r.date && r.finish != null && !isNonRunner(r));
    const dates = Array.from(new Set(validRows.map(r => r.date))).sort();
    if (dates.length < 10) {
      return { ready: false, reason: "時系列検証には少なくとも10開催日分のデータが必要です。", dateCount: dates.length };
    }
    const splitIndex = Math.max(1, Math.min(dates.length - 1, Math.floor(dates.length * opts.trainFraction)));
    const trainEnd = dates[splitIndex - 1];
    const testStart = dates[splitIndex];
    const trainRows = validRows.filter(r => r.date <= trainEnd);
    const testRows = validRows.filter(r => r.date >= testStart);
    const samples = [];
    trainRows.forEach(row => {
      const pastScore = scoreHorse({
        horse: row.horse, venue: row.venue, surface: row.surface,
        distance: row.distance, going: row.going, jockey: row.jockey
      }, history, row.date);
      if (pastScore.score != null && pastScore.starts >= opts.minStarts) {
        samples.push({ score: pastScore.score, finish: row.finish });
      }
    });
    const calibration = calibrateWinProbability(samples, opts.minSamples);
    if (!calibration.ready) {
      return {
        ready: false, reason: calibration.reason, sampleCount: calibration.sampleCount,
        trainStart: dates[0], trainEnd, testStart, testEnd: dates[dates.length - 1],
        trainRaces: new Set(trainRows.map(raceKey)).size,
        testRaces: new Set(testRows.map(raceKey)).size
      };
    }

    const races = new Map();
    testRows.forEach(row => {
      const key = raceKey(row);
      if (!races.has(key)) races.set(key, []);
      races.get(key).push(row);
    });
    let evaluatedRaces = 0, top1Hits = 0, top3Hits = 0;
    let scoredHorses = 0, skippedHorses = 0, brierSum = 0, brierN = 0;
    let randomChanceSum = 0, randomTop3ChanceSum = 0;
    for (const group of races.values()) {
      const scored = group.map(row => {
        const result = scoreHorse({
          horse: row.horse, venue: row.venue, surface: row.surface,
          distance: row.distance, going: row.going, jockey: row.jockey
        }, history, row.date);
        return Object.assign({}, row, result);
      });
      const usable = scored.filter(h => h.score != null && h.starts >= opts.minStarts);
      skippedHorses += scored.length - usable.length;
      scoredHorses += usable.length;
      if (usable.length < 2) continue;
      evaluatedRaces++;
      randomChanceSum += 1 / usable.length;
      randomTop3ChanceSum += Math.min(3, usable.length) / usable.length;
      const ranked = usable.slice().sort((a, b) => b.score - a.score);
      const topScore = ranked[0].score;
      const topGroup = ranked.filter(h => h.score === topScore);
      if (topGroup.some(h => h.finish === 1)) top1Hits++;
      const thirdScore = ranked[Math.min(2, ranked.length - 1)].score;
      if (ranked.filter(h => h.score >= thirdScore).some(h => h.finish === 1)) top3Hits++;
      usable.forEach(h => {
        const bin = calibration.bins[Math.min(19, Math.floor(h.score / 5))];
        const actual = h.finish === 1 ? 1 : 0;
        brierSum += Math.pow(bin.probability - actual, 2);
        brierN++;
      });
    }
    if (!evaluatedRaces) {
      return { ready: false, reason: "検証期間に採点可能なレースがありません。", sampleCount: calibration.sampleCount, trainEnd, testStart };
    }
    return {
      ready: true, method: "chronological-holdout", trainStart: dates[0], trainEnd,
      testStart, testEnd: dates[dates.length - 1], trainRaces: new Set(trainRows.map(raceKey)).size,
      testRaces: races.size, evaluatedRaces, scoredHorses, skippedHorses,
      calibrationSamples: calibration.sampleCount, top1Hits, top3Hits,
      top1Rate: top1Hits / evaluatedRaces, top3Rate: top3Hits / evaluatedRaces,
      randomTop1Baseline: randomChanceSum / evaluatedRaces,
      randomTop3Baseline: randomTop3ChanceSum / evaluatedRaces,
      brierScore: brierN ? brierSum / brierN : null
    };
  }


  // Diagnose exact horse-name misses without changing production matching or scores.
  function diagnoseNoHistoryNames(history) {
    const rows = (history.rows || []).filter(r => r.date && r.finish != null && !isNonRunner(r));
    const normalizeHorseName = value => text(value).normalize("NFKC").replace(/[\\s\\u3000]+/g, "").toLowerCase();
    const byNormalizedName = new Map();
    rows.forEach(row => {
      const key = normalizeHorseName(row.horse);
      if (!key) return;
      if (!byNormalizedName.has(key)) byNormalizedName.set(key, []);
      byNormalizedName.get(key).push(row);
    });
    const years = Array.from(new Set(rows.map(r => r.date.slice(0, 4)))).sort();
    return years.map(year => {
      const testRows = rows.filter(r => r.date.slice(0, 4) === year);
      const result = { year, noHistory: 0, normalizedPriorMatch: 0, onlyLaterHistory: 0, noNameMatchInImportedData: 0, age2: 0, age3: 0, age4Plus: 0, ageUnknown: 0, examples: [] };
      testRows.forEach(row => {
        const exactPrior = (history.byHorse.get(row.horse) || []).some(past => past.date < row.date);
        if (exactPrior) return;
        result.noHistory++;
        const ageMatch = text(row.sexAge).match(/(\d{1,2})/);
        const age = ageMatch ? Number(ageMatch[1]) : null;
        if (age === 2) result.age2++;
        else if (age === 3) result.age3++;
        else if (age != null && age >= 4) result.age4Plus++;
        else result.ageUnknown++;
        const key = normalizeHorseName(row.horse);
        const variants = byNormalizedName.get(key) || [];
        const priorVariants = variants.filter(past => past.date < row.date);
        if (priorVariants.length) {
          result.normalizedPriorMatch++;
          const differentName = priorVariants.find(past => past.horse !== row.horse);
          if (differentName && result.examples.length < 8) {
            result.examples.push({ entrant: row.horse, priorName: differentName.horse });
          }
        } else if (variants.length) {
          result.onlyLaterHistory++;
        } else {
          result.noNameMatchInImportedData++;
        }
      });
      return result;
    }).filter(r => r.noHistory > 0);
  }

  // Diagnose horses with one or two prior starts; this is read-only and does not alter scoring.
  function diagnoseLowHistoryStarts(history) {
    const rows = (history.rows || []).filter(r => r.date && r.finish != null && !isNonRunner(r));
    const years = Array.from(new Set(rows.map(r => r.date.slice(0, 4)))).sort();
    const ageBucket = age => age === 2 ? "age2" : age === 3 ? "age3" : age != null && age >= 4 ? "age4Plus" : "ageUnknown";
    return years.map(year => {
      const result = {
        year, oneStart: 0, twoStarts: 0, total: 0,
        age2: 0, age3: 0, age4Plus: 0, ageUnknown: 0,
        oneStartAge: { age2: 0, age3: 0, age4Plus: 0, ageUnknown: 0 },
        twoStartAge: { age2: 0, age3: 0, age4Plus: 0, ageUnknown: 0 }
      };
      rows.filter(r => r.date.slice(0, 4) === year).forEach(row => {
        const past = (history.byHorse.get(row.horse) || []).filter(p => p.date < row.date);
        if (past.length !== 1 && past.length !== 2) return;
        const match = text(row.sexAge).match(/(\d{1,2})/);
        const age = match ? Number(match[1]) : null;
        const bucket = ageBucket(age);
        result.total++;
        if (past.length === 1) {
          result.oneStart++;
          result.oneStartAge[bucket]++;
        } else {
          result.twoStarts++;
          result.twoStartAge[bucket]++;
        }
        result[bucket]++;
      });
      return result;
    }).filter(r => r.total > 0);
  }

  // Year-by-year walk-forward report: each test year is calibrated only with
  // finished races strictly before that calendar year.
  function runYearlyBacktests(history, options) {
    const opts = Object.assign({ minStarts: 3, minSamples: 200 }, options || {});
    const validRows = (history.rows || []).filter(r => r.date && r.finish != null && !isNonRunner(r));
    const years = Array.from(new Set(validRows.map(r => r.date.slice(0, 4)))).sort();
    const reports = [];
    for (const year of years) {
      const testRows = validRows.filter(r => r.date.slice(0, 4) === year);
      const trainRows = validRows.filter(r => r.date.slice(0, 4) < year);
      if (!trainRows.length || !testRows.length) continue;
      const samples = [];
      trainRows.forEach(row => {
        const scored = scoreHorse({
          horse: row.horse, venue: row.venue, surface: row.surface,
          distance: row.distance, going: row.going, jockey: row.jockey
        }, history, row.date);
        if (scored.score != null && scored.starts >= opts.minStarts) {
          samples.push({ score: scored.score, finish: row.finish });
        }
      });
      const calibration = calibrateWinProbability(samples, opts.minSamples);
      if (!calibration.ready) {
        reports.push({ year, ready: false, reason: calibration.reason, calibrationSamples: calibration.sampleCount });
        continue;
      }
      const races = new Map();
      testRows.forEach(row => {
        const key = raceKey(row);
        if (!races.has(key)) races.set(key, []);
        races.get(key).push(row);
      });
      let evaluatedRaces = 0, top1Hits = 0, top3Hits = 0;
      let scoredHorses = 0, skippedHorses = 0, brierSum = 0, brierN = 0;
      let randomTop1 = 0, randomTop3 = 0;
      const exclusions = { noHistory: 0, oneOrTwoStarts: 0, noScoreWithEnoughStarts: 0, scoredButBelowMinimumStarts: 0 };
      const componentMissing = { recent: 0, course: 0, surface: 0, distance: 0, going: 0, jockey: 0, experience: 0 };
      for (const group of races.values()) {
        const scored = group.map(row => Object.assign({}, row, scoreHorse({
          horse: row.horse, venue: row.venue, surface: row.surface,
          distance: row.distance, going: row.going, jockey: row.jockey
        }, history, row.date)));
        const usable = scored.filter(h => h.score != null && h.starts >= opts.minStarts);
        scoredHorses += usable.length;
        skippedHorses += scored.length - usable.length;
        scored.forEach(h => {
          if (h.starts === 0) exclusions.noHistory++;
          else if (h.starts < opts.minStarts) {
            exclusions.oneOrTwoStarts++;
            if (h.score != null) exclusions.scoredButBelowMinimumStarts++;
          } else if (h.score == null) {
            exclusions.noScoreWithEnoughStarts++;
            Object.keys(componentMissing).forEach(key => {
              if (h.components && h.components[key] == null) componentMissing[key]++;
            });
          }
        });
        if (usable.length < 2) continue;
        evaluatedRaces++;
        randomTop1 += 1 / usable.length;
        randomTop3 += Math.min(3, usable.length) / usable.length;
        const ranked = usable.slice().sort((a, b) => b.score - a.score);
        const topScore = ranked[0].score;
        if (ranked.filter(h => h.score === topScore).some(h => h.finish === 1)) top1Hits++;
        const thirdScore = ranked[Math.min(2, ranked.length - 1)].score;
        if (ranked.filter(h => h.score >= thirdScore).some(h => h.finish === 1)) top3Hits++;
        usable.forEach(h => {
          const bin = calibration.bins[Math.min(19, Math.floor(h.score / 5))];
          brierSum += Math.pow(bin.probability - (h.finish === 1 ? 1 : 0), 2);
          brierN++;
        });
      }
      reports.push({
        year, ready: evaluatedRaces > 0,
        reason: evaluatedRaces ? "" : "採点可能なレースがありません。",
        trainStart: trainRows.reduce((m, r) => !m || r.date < m ? r.date : m, ""),
        trainEnd: trainRows.reduce((m, r) => !m || r.date > m ? r.date : m, ""),
        testStart: testRows.reduce((m, r) => !m || r.date < m ? r.date : m, ""),
        testEnd: testRows.reduce((m, r) => !m || r.date > m ? r.date : m, ""),
        trainRaces: new Set(trainRows.map(raceKey)).size,
        testRaces: races.size, evaluatedRaces, scoredHorses, skippedHorses,
        exclusionDiagnostics: exclusions, missingComponentsWhenUnscored: componentMissing,
        calibrationSamples: calibration.sampleCount,
        top1Hits, top3Hits, top1Rate: evaluatedRaces ? top1Hits / evaluatedRaces : null,
        top3Rate: evaluatedRaces ? top3Hits / evaluatedRaces : null,
        randomTop1Baseline: evaluatedRaces ? randomTop1 / evaluatedRaces : null,
        randomTop3Baseline: evaluatedRaces ? randomTop3 / evaluatedRaces : null,
        brierScore: brierN ? brierSum / brierN : null
      });
    }
    return reports;
  }

  root.UMAIValueModel = {
    version: "1.0.0",
    weights: WEIGHTS,
    normalizeResult,
    prepareHistory,
    scoreHorse,
    calibrateWinProbability,
    buildWalkForwardCalibration,
    runChronologicalBacktest,
    runYearlyBacktests,
    diagnoseNoHistoryNames,
    diagnoseLowHistoryStarts,
    evaluateRaceValue
  };
})(typeof window !== "undefined" ? window : globalThis);
