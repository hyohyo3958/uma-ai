# Value AI CSV integration guide

## Historical results: bulk import and local storage

The Value AI panel supports selecting multiple CSV files at once. You can also choose the PDF converter's output folder in browsers that support directory selection.

Recommended workflow:
1. Run the JRA PDF-to-CSV converter on all available historical PDFs.
2. In the app, choose output/all_results.csv (the easiest option), or select the whole output folder / multiple per-PDF CSVs.
3. Press 選択した履歴CSVを追加・保存.
4. Choose the current entries CSV and press Value AIで分析する.

The importer stores history in this browser's IndexedDB. It is local to this browser and site origin; it is not uploaded to GitHub or synchronized to another device/browser. Reopening the app does not require re-importing the same files.

If both all_results.csv and per-PDF CSV files are selected, duplicate horse/race rows are merged using date + venue + race number + horse number (horse name is the fallback key). Re-importing the same files updates existing records rather than multiplying them. Keep your original CSV files as a backup.

## Current entries CSV

Use the in-app 出走表CSVテンプレートを保存 button. Fill one row per declared runner. Required columns:
- 日付: race date (YYYY-MM-DD recommended)
- 競馬場
- レース番号
- 馬名

Recommended columns:
- レース名
- 芝ダート: 芝 or ダート
- 距離: metres, e.g. 1600
- 馬場: 良 / 稍重 / 重 / 不良
- 馬番
- 騎手
- 単勝オッズ: decimal odds snapshot for the same time across all runners in the race

The race key is date + venue + race number. Every active runner in a race must be present for a reliable market-probability comparison. Every active runner must have a valid decimal win-odds value greater than 1.0; otherwise the app suppresses the value decision for that race. Runners marked 競走除外, 出走取消, or 取消 are excluded from scoring and the all-runner odds check.

## Analysis

The browser loads the saved historical results, removes duplicate horse/race rows, scores current entries using only records strictly before the target date, then creates walk-forward historical score samples for probability calibration. At least 200 eligible historical runner samples are required before a calibrated win probability is displayed.

Ability score components:
- Recent performance: 30%
- Same venue: 15%
- Same surface: 15%
- Similar distance (within 200m): 15%
- Same going: 10%
- Jockey history: 10%
- Experience: 5%

Only available components contribute; the coverage percentage is displayed. Non-runners are retained as records but excluded from starter field size, horse/jockey performance averages, and current-runner odds completeness. Missing values are not fabricated.

A preliminary Value candidate additionally requires score >= 60, coverage >= 60%, at least 3 prior starts, odds >= 5.0, calibrated win probability at least 10 percentage points above normalized market probability, and estimated gross return >= 1.10.

## Important limitations

- This is an initial experimental model, not a proven profitable betting system.
- The JRA historical CSV columns do not include margins, sectional times, pace, race class, or historical odds. The score is a within-race finishing percentile, not a speed figure.
- Current entries and current odds are not fetched automatically. Enter only data obtained from sources whose terms allow this use.
- Use a consistent pre-race odds timestamp; odds movement can materially change value.
- Calibration uses historical walk-forward scores but still needs a strictly later holdout period for honest performance measurement.
- A score or Value candidate is not a guarantee. The app must display 判定不可 when required data is missing.
