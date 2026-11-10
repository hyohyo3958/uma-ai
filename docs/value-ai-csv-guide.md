# Value AI CSV integration guide

The published app now includes a separate "Value AI・過去成績から穴馬を発掘" panel.

## Inputs

### 1. Historical results CSV

Use one or more JRA annual-results CSV files combined into one CSV. The intended converter output columns are:

`日付,競馬場,レース番号,レース名,芝ダート,距離,馬場,着順,枠番,馬番,馬名,性齢,騎手`

One row per horse per race. Keep non-finishers in the file; their rows contribute to field size but do not get a finishing-performance score. Cancelled/withdrawn horses absent from the source cannot be inferred.

### 2. Current entries CSV

Use the in-app "出走表CSVテンプレートを保存" button. Fill one row per declared runner. Required columns:

- `日付`: race date (YYYY-MM-DD recommended)
- `競馬場`
- `レース番号`
- `馬名`

Recommended columns:

- `レース名`
- `芝ダート`: 芝 or ダート
- `距離`: metres, e.g. 1600
- `馬場`: 良 / 稍重 / 重 / 不良
- `馬番`
- `騎手`
- `単勝オッズ`: decimal odds snapshot for the same time across all runners in the race

The race key is date + venue + race number. Every runner in a race must be present for a reliable market-probability comparison. Every runner must have a valid decimal win-odds value greater than 1.0; otherwise the app suppresses the value decision for that race.

## Analysis

The browser loads `value-model.js`, builds horse history from the historical CSV, scores current entries using only records strictly before the target date, then creates walk-forward historical score samples for probability calibration. At least 200 eligible historical runner samples are required before a calibrated win probability is displayed.

Ability score components:
- Recent performance: 30%
- Same venue: 15%
- Same surface: 15%
- Similar distance (within 200m): 15%
- Same going: 10%
- Jockey history: 10%
- Experience: 5%

Only available components contribute; the coverage percentage is displayed. No missing values are fabricated.

A preliminary Value candidate additionally requires score >= 60, coverage >= 60%, at least 3 prior starts, odds >= 5.0, calibrated win probability at least 10 percentage points above normalized market probability, and estimated gross return >= 1.10.

## Important limitations

- This is an initial experimental model, not a proven profitable betting system.
- The JRA historical CSV columns do not include margins, sectional times, pace, race class, or odds. The score is a within-race finishing percentile, not a speed figure.
- Current entries and current odds are not fetched automatically. Enter only data obtained from sources whose terms allow this use.
- Use a consistent pre-race odds timestamp; odds movement can materially change value.
- Calibration uses historical walk-forward scores but still needs a strictly later holdout period for honest performance measurement.
- A score or Value candidate is not a guarantee. The app must display "判定不可" when required data is missing.
