# Changelog

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
