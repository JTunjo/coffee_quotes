# YipitData ETL — Oscar Movies Pipeline

Python ETL toolkit for cleaning and analyzing Oscar-nominated movies (1927–2014).

## Project structure

```
test/
├── documentation/
│   ├── CHANGELOG.md
│   ├── EXPLAIN.md
│   └── ETL_Take_Home_Assignment_-_Data_Engineer_III.pdf
├── etl/
│   ├── __init__.py
│   ├── cleaner.py       # Budget and year cleaning functions
│   └── db.py            # DuckDB query and export utilities
├── output/              # Generated output files land here
├── source/
│   ├── movies.json      # Oscar nominations
│   └── movie-detail.json  # Movie details (budget, release dates, etc.)
├── main.py              # Pipeline entry point
├── README.md
└── requirements.txt
```

## Requirements

- Python 3.9+

## Installation

```bash
cd test
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Dependencies

| Package | Version |
|---------|---------|
| duckdb  | 1.2.2   |
| pandas  | 2.2.3   |

## Data notes

- `source/movies.json` — 520 records (NDJSON), join key: `detail_url`
- `source/movie-detail.json` — 516 records (NDJSON), 4 movies have no detail entry
- Budget column is messy: nulls, footnote references, "X million" strings, ranges, and a small number of pure GBP entries with no USD equivalent
- Year is extracted from the `release_dates` field using the first 4-digit year found

## Usage

After completing installation above:

```bash
python3 main.py
```

Output is written to `output/oscar_winners.csv`.

### Exported columns

| Column | Description |
|---|---|
| `film` | Movie title |
| `year` | Release year |
| `wikipedia_url` | Wikipedia page URL |
| `original_budget` | Raw budget string from source data |
| `budget_usd` | Cleaned budget as integer USD |

## DuckDB functions (`etl/db.py`)

| Function | Purpose |
|---|---|
| `get_connection()` | Creates an in-memory DuckDB connection |
| `register_dataframe(conn, df, table_name)` | Registers a pandas DataFrame as a virtual table |
| `query_data(conn, sql)` | Runs a SQL query, returns a DataFrame |
| `export_data(conn, sql, output_path, fmt)` | Exports query results to CSV, JSON, or Parquet |

## Cleaning functions (`etl/cleaner.py`)

| Function | Input | Output | Notes |
|---|---|---|---|
| `clean_budget(value)` | raw budget string or None | `int` (USD dollars) | Handles nulls, footnotes, "X million", ranges (takes max), pure non-USD → 0, non-USD with USD in parens → extracts USD |
| `clean_year(release_dates)` | raw release dates string | `int` | Extracts first 4-digit year; 0 if not found |
| `clean_text(value)` | any string | `str` | Strips and collapses whitespace |
