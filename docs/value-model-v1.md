# UMA AI Value Model v1

## Product policy

- Target: every JRA central-racing race (graded, special and ordinary).
- Objective: value betting, not simply finding the biggest longshot.
- Candidate policy: show only horses with explainable historical evidence; if evidence or market data is missing, show "判定不可" rather than guessing.
- Data policy: no paid API is assumed. Use only data whose collection and reuse conditions have been checked.

## Current historical CSV input

The PDF converter's intended one-horse-per-row columns are:

`日付,競馬場,レース番号,レース名,芝ダート,距離,馬場,着順,枠番,馬番,馬名,性齢,騎手`

The engine groups rows by date + venue + race number. The number of rows in a race is used as the field size. Non-finishers remain in the field-size count but do not receive a finish-performance score. Withdrawals/entries absent from the source cannot be inferred.

## Ability / suitability score (0-100)

| Component | Weight | Evidence |
|---|---:|---|
| Recent form | 30 | Up to last five prior starts; recent starts weighted more heavily |
| Course | 15 | Prior starts at the same venue |
| Surface | 15 | Prior starts on turf or dirt |
| Distance | 15 | Same surface and within 200m of today's distance |
| Going | 10 | Same going label and surface |
| Jockey | 10 | Historical jockey performance, shrunk toward 50 for small samples |
| Experience / sample confidence | 5 | Number of prior starts, capped at eight |

Only available components contribute to the weighted average. Coverage is reported separately; missing data is not silently filled. A horse with no usable past performance cannot be scored.

Finish performance is converted to a within-race percentile using field size:
`((field size - finish position + 0.5) / field size) * 100`.
This is a transparent baseline, not a speed figure. The current PDF column set does not include margins, sectional times, race class, or pace; those are not fabricated.

## Value assessment (separate from ability)

The historical result PDF columns do **not** contain today's odds. The value layer therefore requires a separately sourced, timestamped pre-race odds snapshot for each entrant. Without odds, the app may show ability/suitability only and must not label a horse a value bet.

Win probabilities must be calibrated from historical predictions that were generated without using the race's result (chronological / walk-forward validation). The v1 helper refuses calibration below 200 runner samples and shrinks each 5-point score bucket toward the overall win rate with a 30-runner prior.

Within a race, market implied probabilities are normalized from the available win odds. A value candidate must initially meet all of these configurable safeguards:
- score >= 60
- score coverage >= 60%
- at least 3 prior starts
- win odds >= 5.0
- calibrated probability exceeds normalized market probability by at least 10 percentage points
- estimated gross return (calibrated win probability × decimal odds) >= 1.10

These are conservative starting thresholds for testing, not proven profitable settings. They must be validated on out-of-sample races and revised only from measured results.

## Leakage and reliability rules

1. Only records strictly earlier than the target race date may be used to score a runner.
2. Never train/calibrate on the same race whose prediction is being evaluated.
3. Split evaluation by time, not random row, to avoid future information leaking into past predictions.
4. Report sample counts and coverage with every score.
5. If odds, course conditions, jockey, or historical records are missing, mark the affected factor unavailable.
6. Do not claim positive expected value until the calibration has enough out-of-sample data.

## Implementation status

- `value-model.js` contains the first independent, dependency-free scoring/calibration helper.
- It is not yet connected to the production page or PDF-to-CSV workflow. Existing screens remain unchanged.
- Next engineering step: validate the converter's actual CSV headers and rows, run unit tests against a small known sample, then connect the engine to the CSV import UI without changing the current manual workflow.
