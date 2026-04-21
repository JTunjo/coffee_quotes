import re


def _strip_noise(s: str) -> str:
    """Remove footnotes, estimate annotations, and non-breaking spaces."""
    s = s.replace('\xa0', ' ')
    s = re.sub(r'\[.*?\]', '', s)
    s = re.sub(r'\((?:est\.?|estimated|approx[^)]*|re-release)\)', '', s, flags=re.IGNORECASE)
    return s.strip()


def _parse_usd_amount(s: str) -> int:
    """
    Parse a single USD amount string into an integer.
    Handles: '$1.3 million', 'US$426,000', 'USD$ 1.5 million', '$10.500.000'.
    Returns 0 if unparseable.
    """
    s = s.strip()
    has_million = bool(re.search(r'million', s, re.IGNORECASE))
    s = re.sub(r'(?:USD?\$?|US\$|\$)', '', s, flags=re.IGNORECASE)
    s = re.sub(r'million', '', s, flags=re.IGNORECASE)
    s = s.replace('+', '').strip()
    # European thousands format: $10.500.000 (multiple dots → all are separators)
    if s.count('.') > 1:
        s = s.replace('.', '')
    # Extract the first valid number only (ignores trailing page refs like ":71–72")
    match = re.search(r'[\d,]+(?:\.\d+)?', s)
    if not match:
        return 0
    num_str = match.group().replace(',', '')
    try:
        return int(float(num_str) * (1_000_000 if has_million else 1))
    except ValueError:
        return 0


def clean_budget(value) -> int:
    """
    Clean a raw budget string and return an integer USD amount.

    Rules applied in order:
    - None or empty → 0
    - Non-USD currency (£, €) with a USD equivalent in parentheses → extract USD value
    - Non-USD with no USD equivalent → 0
    - Mixed string (e.g. '$1 million or £467,000') → take the USD portion
    - Range (e.g. '$10m–$20m', '$6–7 million') → take the greater value
    - 'or' alternatives (e.g. '$2.2m or $1.8m') → take the greater value
    - Single USD amount → parse directly
    """
    if value is None or str(value).strip() == '':
        return 0

    s = _strip_noise(str(value))

    has_usd = bool(re.search(r'(?:USD?\$?|US\$|\$)', s))
    has_non_usd = bool(re.search(r'[£₤€]', s))

    if has_non_usd and not has_usd:
        # Purely non-USD: check for a USD equivalent in parens, e.g. "£9.8m ($15m)"
        usd_in_parens = re.search(
            r'\((?:or\s+)?(?:US\$?|USD\$?|\$)\s*([\d.,]+(?:\s*million)?)\)',
            s, re.IGNORECASE
        )
        if usd_in_parens:
            return _parse_usd_amount('$' + usd_in_parens.group(1))
        return 0

    if has_non_usd and has_usd:
        # Mixed: extract the first USD amount found, e.g. "$1 million or £467,000"
        usd_match = re.search(
            r'(?:USD?\$?|US\$|\$)\s*[\d.,]+(?:\s*million)?',
            s, re.IGNORECASE
        )
        return _parse_usd_amount(usd_match.group()) if usd_match else 0

    # Pure USD string — check for range first
    range_match = re.search(
        r'\$\s*([\d.,]+)\s*(?:million\s*)?[–\-]\s*\$?\s*([\d.,]+)\s*(million)?',
        s, re.IGNORECASE
    )
    if range_match:
        has_million = bool(re.search(r'million', s, re.IGNORECASE))
        multiplier = 1_000_000 if has_million else 1

        def _safe_float(n: str) -> float:
            n = n.replace(',', '')
            if n.count('.') > 1:
                n = n.replace('.', '')
            try:
                return float(n)
            except ValueError:
                return 0.0

        return int(max(_safe_float(range_match.group(1)), _safe_float(range_match.group(2))) * multiplier)

    # 'or' alternatives
    if re.search(r'\bor\b', s, re.IGNORECASE):
        parts = re.split(r'\s+or\s+', s, flags=re.IGNORECASE)
        amounts = [_parse_usd_amount(p) for p in parts if re.search(r'[\$]|US\$|USD', p)]
        return max(amounts) if amounts else 0

    return _parse_usd_amount(s)


def clean_year(release_dates) -> int:
    """Extract the first 4-digit year (1800s–2000s) from a release_dates string. Returns 0 if not found."""
    if not release_dates:
        return 0
    match = re.search(r'\b(1[89]\d{2}|20\d{2})\b', str(release_dates))
    return int(match.group()) if match else 0


def clean_text(value) -> str:
    """Normalize a string field: strip leading/trailing whitespace and collapse internal spaces."""
    if value is None:
        return ''
    return re.sub(r'\s+', ' ', str(value)).strip()
