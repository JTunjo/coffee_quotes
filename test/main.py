import json
from pathlib import Path

import pandas as pd

from etl.cleaner import clean_budget, clean_text, clean_year
from etl.db import export_data, get_connection, query_data, register_dataframe

DATA_DIR = Path(__file__).parent / 'source'
OUTPUT_DIR = Path(__file__).parent / 'output'

WINNERS_QUERY = """
    SELECT
        film,
        year,
        wikipedia_url,
        original_budget,
        budget_usd
    FROM movies
    WHERE winner = true
      AND year > 1955
      AND budget_usd >= 15000000
    ORDER BY year, film
"""


def load_ndjson(path: Path) -> list[dict]:
    """Load a newline-delimited JSON file into a list of dicts."""
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def build_dataset() -> pd.DataFrame:
    """
    Load, join, and clean the two source files.
    Returns a DataFrame ready to be registered in DuckDB.
    """
    df_movies = pd.DataFrame(load_ndjson(DATA_DIR / 'movies.json'))
    df_details = pd.DataFrame(load_ndjson(DATA_DIR / 'movie-detail.json'))

    df = (
        df_movies.merge(df_details, on='detail_url', how='left')
        .rename(columns={'wiki_url': 'wikipedia_url'})
        .assign(
            film=lambda d: d['film'].apply(clean_text),
            year=lambda d: d['release_dates'].apply(clean_year),
            original_budget=lambda d: d['budget'].fillna('').astype(str),
            budget_usd=lambda d: d['budget'].apply(clean_budget),
        )
    )

    return df


def run() -> None:
    df = build_dataset()

    conn = get_connection()
    register_dataframe(conn, df, 'movies')

    output_path = str(OUTPUT_DIR / 'oscar_winners.csv')
    export_data(conn, WINNERS_QUERY.strip(), output_path, fmt='csv')

    result = query_data(conn, WINNERS_QUERY)
    print(f"Exported {len(result)} records → {output_path}")
    print(result.to_string(index=False))


if __name__ == '__main__':
    run()
