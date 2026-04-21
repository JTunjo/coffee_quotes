# Changelog

## FAQ

**Q: Why are the source files in NDJSON format instead of standard JSON arrays?**
The files contain one JSON object per line (newline-delimited JSON). This is common for data exports because it allows streaming — you can process one record at a time without loading the entire file into memory. Standard `json.load()` fails on these files, so we read them line by line with `json.loads()`.

**Q: Why use a left join instead of an inner join when merging the two files?**
`movies.json` has 520 records but `movie-detail.json` only has 516. A left join keeps all movies and fills missing detail fields with NaN. An inner join would silently drop 4 movies. Since those 4 get `budget_usd = 0` and `year = 0`, they are naturally excluded by the output filter without any special handling.

**Q: Why does `clean_budget` return 0 for pure non-USD entries like `£65,000` instead of converting them?**
All 15 pure GBP entries in the dataset belong to old films (1930s–1950s) with budgets well under $1M. Since the output filter requires a minimum of $15M USD, they would be excluded regardless. Returning 0 is the safe, honest choice — it avoids inventing exchange rates that were not part of the requirements.

**Q: Why does the range rule take the greater value instead of the average or the lower value?**
The assignment explicitly states this: "Any budget that is a range, we should use the greater of the two." We follow the spec exactly.

**Q: Why use DuckDB instead of just filtering the pandas DataFrame directly?**
The assignment requires DuckDB integration as a core deliverable — a query function and an export function. DuckDB also lets you express the filter logic as plain SQL, which is readable and easy to audit. The `COPY ... TO` syntax handles CSV, JSON, and Parquet export natively without extra dependencies.

**Q: Why is the year extracted from `release_dates` in `movie-detail.json` rather than from the film title or `detail_url`?**
The `detail_url` often contains the year in parentheses (e.g. `Wings_(1927_film)`) but not always. The `release_dates` field always contains a full date string and reliably yields the first 4-digit year for all 516 detail records. It is also semantically the correct field.

**Q: Why is `original_budget` kept as a string in the output CSV?**
The assignment asks for both the original budget and the converted USD value. Keeping the raw string lets the reader verify the conversion without having to go back to the source data.

**Q: Why are there 32 records in the output instead of more?**
The filter applies three conditions together: the film must have won an Oscar (`winner = true`), the release year must be after 1955 (`year > 1955`), and the cleaned budget must be at least $15,000,000 (`budget_usd >= 15000000`). Many winners from that period have null or sub-$15M budgets in the dataset, so they are excluded.

---

| Timestamp | Label | Detail |
|-----------|-------|--------|
| 2026-04-21 | Step 1 — Project structure | Created `etl/__init__.py`, `etl/cleaner.py`, `etl/db.py`, `main.py`, `requirements.txt`, `output/` directory, and `README.md` inside `test/` |
| 2026-04-21 | Step 2 — Data exploration | Inspected `movies.json` (520 records) and `movie-detail.json` (516 records); identified budget patterns (nulls, "X million", ranges, footnotes, pure GBP entries), year extraction strategy, and join coverage (4 unmatched movies); updated `README.md` with data notes |
| 2026-04-21 | Step 2 — README update | Added Data notes section documenting source file structure, join key, budget messiness, and year extraction approach |
| 2026-04-21 | Step 3 — cleaner.py | Implemented `clean_budget`, `clean_year`, `clean_text` in `etl/cleaner.py`; all 28 test cases pass covering nulls, footnotes, "X million", European format, ranges, "or" alternatives, non-USD with USD in parens, and pure non-USD strings |
| 2026-04-21 | Step 3 — README update | Added Cleaning functions table documenting inputs, outputs, and behaviour of each function |
| 2026-04-21 | Step 4 — db.py | Implemented `get_connection`, `register_dataframe`, `query_data`, `export_data` in `etl/db.py`; smoke-tested CSV, JSON, and Parquet export plus invalid-format error |
| 2026-04-21 | Step 4 — README update | Added DuckDB functions table to README |
| 2026-04-21 | Step 5 — main.py | Implemented full pipeline: load both NDJSON files, left-join on `detail_url`, apply cleaners, register in DuckDB, query Oscar winners (year > 1955, budget_usd >= 15M), export to `output/oscar_winners.csv`; 32 records exported |
| 2026-04-21 | Step 5 — cleaner.py patch | Added `math.isnan` guard to `clean_budget` to handle pandas NaN values from unmatched join rows |
| 2026-04-21 | Step 5 — README update | Added Usage section with run instructions and output column descriptions |
| 2026-04-21 | Step 6 — EXPLAIN.md | Created EXPLAIN.md documenting pipeline approach, all budget cleaning patterns with examples, year extraction strategy, join behaviour, and output filter logic |
| 2026-04-21 | Step 7 — README fixes | Removed duplicate venv setup block from Usage section; corrected `clean_budget` return type description from "USD cents" to "USD dollars" |
| 2026-04-21 | Step 7 — Final review | Clean end-to-end run confirmed: 32 records exported to `output/oscar_winners.csv`; all deliverables present |
