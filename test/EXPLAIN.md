# Approach & Assumptions

## Pipeline overview

The pipeline joins two NDJSON source files on `detail_url`, applies cleaning functions to the `budget` and `release_dates` fields, registers the result as a DuckDB table, then exports a filtered CSV.

## Budget cleaning

The raw `budget` field is a free-text string scraped from Wikipedia. Patterns found and how each is handled:

| Pattern | Example | Handling |
|---|---|---|
| Null | `null` | → `0` |
| Plain USD | `$1,433,000` | Strip `$`, remove commas, parse as int |
| "X million" | `$1.3 million` | Strip noise, multiply by 1,000,000 |
| Prefixed USD | `US$ 2 million`, `USD$ 1.5 million` | Strip prefix, parse as above |
| Footnote references | `$15 million [ 3 ] [ 4 ]` | Strip `[...]` blocks before parsing |
| Estimate annotations | `$439,000 (est.)`, `(estimated)` | Stripped before parsing |
| European number format | `$10.500.000` | Multiple dots → all treated as thousands separators |
| Range with dash/en-dash | `$6–7 million`, `$150-170 million` | Both sides parsed; greater value kept |
| "or" alternatives | `$2.2 million or $1.8 million` | Both sides parsed; greater value kept |
| Non-breaking space | `$14.4 million` (`\xa0`) | Replaced with regular space before parsing |
| Non-USD with USD in parens | `£9.8 million ($15 million)` | USD value extracted from parentheses |
| Pure non-USD, no equivalent | `£65,000` | → `0` (all such entries are well below the $15M threshold) |
| Re-release annotation | `$237 million $9 million+ (re-release)` | `(re-release)` stripped; first amount taken |

## Year cleaning

The `release_dates` field contains messy multi-line strings with city names, footnotes, and repeated dates. The first 4-digit year matching `1800–2099` is extracted with a single regex. This reliably returns the earliest release year for all 516 detail records.

## Join

`movies.json` (520 records) is left-joined to `movie-detail.json` (516 records) on `detail_url`. The 4 unmatched movies get `budget_usd = 0` and `year = 0`, so they are naturally excluded by the output filter.

## Output filter

The query selects rows where `winner = true`, `year > 1955`, and `budget_usd >= 15000000`. This produces 32 records.
