# UMA AI data source policy

## Goal
Build a free-first pipeline for all JRA central races (graded, special, and ordinary races). Do not publish guessed runner, jockey, odds, or prediction data.

## Current state
- GitHub Actions scheduler is working.
- The app reads `data/status.json` and optionally `data/weekend.json`.
- `data/weekend.schema.json` defines the normalized race-data format.
- No live JRA race feed is connected yet. `predictions_available` must remain false until verified input data and a valid scoring pipeline exist.

## Official public references
- JRA race calendar: https://www.jra.go.jp/keiba/calendar/
- JRA race menu (entries, odds, results, track information): https://www.jra.go.jp/keiba/
- JRA entry publication timing FAQ: https://www.jra.go.jp/faq/pop02/2_2.html
- JRA usage information: https://own.jra.jp/use/index.html

JRA states that entry lists are normally first published Thursday after 16:00 without horse/frame numbers, then finalized with numbers from around 10:00 on the day before the race (some graded races differ). Therefore Friday's scheduled run is better timed to check finalized entries, while Saturday's run can refresh late changes.

## Rights and reliability guardrails
- A page being publicly viewable does not automatically grant permission to bulk copy, republish, or scrape its data.
- Do not use undocumented endpoints, reverse-engineered APIs, login-only content, or sources whose terms do not permit automated reuse.
- The JRA public site provides official information pages, but this project has not yet confirmed a free public API/license that permits automated bulk ingestion and republication of all runner and odds data.
- Until a provider and its terms are verified, show official links and availability status rather than copying the data into the app.
- Record source URL and checked timestamp for each imported record.
- Unknown values stay null. Do not infer odds, popularity, horse number, jockey, or race details.
- Never create a prediction when required inputs are missing; show "data incomplete" instead.

## Candidate next steps
1. Confirm a permitted free source for the race calendar and basic race list.
2. Implement only that source, with conservative request frequency and clear attribution.
3. Add entries and historical form only from a provider whose license permits this use.
4. Add odds last, since they change frequently and may have separate reuse restrictions.
