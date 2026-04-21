import duckdb
import pandas as pd
from pathlib import Path

SUPPORTED_FORMATS = {'csv', 'json', 'parquet'}


def get_connection() -> duckdb.DuckDBPyConnection:
    """Create and return an in-memory DuckDB connection."""
    return duckdb.connect()


def register_dataframe(conn: duckdb.DuckDBPyConnection, df: pd.DataFrame, table_name: str) -> None:
    """Register a pandas DataFrame as a virtual table in DuckDB."""
    conn.register(table_name, df)


def query_data(conn: duckdb.DuckDBPyConnection, sql: str) -> pd.DataFrame:
    """Execute a SQL query against the DuckDB connection and return results as a DataFrame."""
    return conn.execute(sql).df()


def export_data(conn: duckdb.DuckDBPyConnection, sql: str, output_path: str, fmt: str = 'csv') -> None:
    """
    Export the results of a SQL query to a file.

    Args:
        conn:        Active DuckDB connection.
        sql:         SELECT query whose results will be exported.
        output_path: Destination file path.
        fmt:         Output format — 'csv', 'json', or 'parquet'.

    Raises:
        ValueError: If fmt is not one of the supported formats.
    """
    fmt = fmt.lower()
    if fmt not in SUPPORTED_FORMATS:
        raise ValueError(f"Unsupported format '{fmt}'. Choose from: {', '.join(sorted(SUPPORTED_FORMATS))}")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    format_map = {
        'csv':     f"COPY ({sql}) TO '{output_path}' (FORMAT CSV, HEADER TRUE)",
        'json':    f"COPY ({sql}) TO '{output_path}' (FORMAT JSON)",
        'parquet': f"COPY ({sql}) TO '{output_path}' (FORMAT PARQUET)",
    }
    conn.execute(format_map[fmt])
