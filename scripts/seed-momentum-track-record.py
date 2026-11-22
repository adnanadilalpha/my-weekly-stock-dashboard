#!/usr/bin/env python3
"""One-shot seed: Excel Track record → momentum_track_weeks (recompute cumulatives).

Usage:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \\
    python3 scripts/seed-momentum-track-record.py [--excel PATH] [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from datetime import date, datetime
from pathlib import Path

# Some macOS Python builds lack local CA certs; allow override via env.
_SSL_CTX = ssl.create_default_context()
if os.environ.get("SEED_INSECURE_SSL", "1") == "1":
    _SSL_CTX.check_hostname = False
    _SSL_CTX.verify_mode = ssl.CERT_NONE

try:
    import openpyxl
except ImportError:
    print("openpyxl required: pip3 install openpyxl", file=sys.stderr)
    sys.exit(1)

DEFAULT_EXCEL = Path("/Users/adnanadil/Downloads/New designs 23.11.2026.xlsx")


def to_ratio(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def to_dir(v):
    if v is None:
        return None
    s = str(v).strip().lower()
    if s in ("long", "short"):
        return s
    return None


def to_date(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = str(v).strip()
    # M/D/YYYY
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def compound(prev, weekly):
    if weekly is None:
        return prev
    if prev is None:
        return weekly
    return (1 + prev) * (1 + weekly) - 1


def load_rows(excel_path: Path):
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    ws = wb["Track record"]
    rows = []
    for row in ws.iter_rows(min_row=6, values_only=True):
        year, week = row[1], row[2]
        if year is None or week is None:
            break
        week_start = to_date(row[3])
        if not week_start:
            continue
        pick1_r5 = to_ratio(row[6])
        pick1_rs = to_ratio(row[7])
        pick2_r5 = to_ratio(row[10])
        pick2_rs = to_ratio(row[11])
        pick3_r5 = to_ratio(row[14])
        pick3_rs = to_ratio(row[15])
        # Prefer hard weekly avgs from sheet when present; else average
        weekly_avg_5d = to_ratio(row[16])
        weekly_avg_stop = to_ratio(row[18])
        if weekly_avg_5d is None:
            vals = [x for x in (pick1_r5, pick2_r5, pick3_r5) if x is not None]
            weekly_avg_5d = sum(vals) / len(vals) if vals else None
        if weekly_avg_stop is None:
            vals = [x for x in (pick1_rs, pick2_rs, pick3_rs) if x is not None]
            weekly_avg_stop = sum(vals) / len(vals) if vals else None

        rows.append(
            {
                "year": int(year),
                "week": int(week),
                "week_start": week_start,
                "pick1_ticker": (str(row[4]).strip().upper() if row[4] else None),
                "pick1_direction": to_dir(row[5]),
                "pick1_return_5d": pick1_r5,
                "pick1_return_stop_loss": pick1_rs,
                "pick2_ticker": (str(row[8]).strip().upper() if row[8] else None),
                "pick2_direction": to_dir(row[9]),
                "pick2_return_5d": pick2_r5,
                "pick2_return_stop_loss": pick2_rs,
                "pick3_ticker": (str(row[12]).strip().upper() if row[12] else None),
                "pick3_direction": to_dir(row[13]),
                "pick3_return_5d": pick3_r5,
                "pick3_return_stop_loss": pick3_rs,
                "weekly_avg_5d": weekly_avg_5d,
                "weekly_avg_stop_loss": weekly_avg_stop,
            }
        )
    return rows


def recompute(rows_newest_first):
    oldest = sorted(rows_newest_first, key=lambda r: (r["year"], r["week"]))
    cum5 = None
    cum_stop = None
    out = []
    for r in oldest:
        cum5 = compound(cum5, r["weekly_avg_5d"])
        cum_stop = compound(cum_stop, r["weekly_avg_stop_loss"])
        out.append({**r, "cumulative_5d": cum5, "cumulative_stop_loss": cum_stop})
    # return newest-first for upsert display
    out.sort(key=lambda r: (r["year"], r["week"]), reverse=True)
    return out


def rest_request(method, url, key, body=None, prefer=None):
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, context=_SSL_CTX) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8")
        raise SystemExit(f"HTTP {e.code}: {err}") from e


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--excel", type=Path, default=DEFAULT_EXCEL)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--batch-size", type=int, default=100)
    args = parser.parse_args()

    url = (os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL_PROD") or "").rstrip(
        "/"
    )
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY_PROD")
    if not url or not key:
        print("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        sys.exit(1)
    if not args.excel.exists():
        print(f"Excel not found: {args.excel}", file=sys.stderr)
        sys.exit(1)

    raw = load_rows(args.excel)
    rows = recompute(raw)
    print(f"Loaded {len(rows)} track weeks from {args.excel.name}")
    if rows:
        newest = rows[0]
        print(
            f"Newest: {newest['year']} W{newest['week']} cum_stop={newest['cumulative_stop_loss']:.6f} "
            f"(~{newest['cumulative_stop_loss']*100:.1f}%)"
        )
        oldest = rows[-1]
        print(f"Oldest: {oldest['year']} W{oldest['week']}")

    if args.dry_run:
        print("Dry run — no writes.")
        return

    # Clear existing seed rows then insert (idempotent re-seed)
    rest_request(
        "DELETE",
        f"{url}/rest/v1/momentum_track_weeks?year=gte.2019",
        key,
        prefer="return=minimal",
    )
    print("Cleared existing momentum_track_weeks rows (year>=2019).")

    endpoint = f"{url}/rest/v1/momentum_track_weeks"
    for i in range(0, len(rows), args.batch_size):
        batch = rows[i : i + args.batch_size]
        rest_request(
            "POST",
            endpoint,
            key,
            body=batch,
            prefer="resolution=merge-duplicates,return=minimal",
        )
        print(f"Upserted {i + len(batch)}/{len(rows)}")

    # Seed open Current Week shell if missing
    status, existing = rest_request(
        "GET",
        f"{url}/rest/v1/momentum_week_current?id=eq.1&select=id",
        key,
        prefer="return=representation",
    )
    if not existing:
        # Next week after newest track row
        y, w = rows[0]["year"], rows[0]["week"]
        ws = rows[0]["week_start"]
        from datetime import timedelta

        d = datetime.strptime(ws, "%Y-%m-%d").date() + timedelta(days=7)
        next_year = d.year if d.year > y else y
        next_week = 1 if d.year > y else w + 1
        rest_request(
            "POST",
            f"{url}/rest/v1/momentum_week_current",
            key,
            body={
                "id": 1,
                "year": next_year,
                "week": next_week,
                "week_start": d.isoformat(),
                "status": "open",
            },
            prefer="resolution=merge-duplicates,return=minimal",
        )
        picks = [
            {"week_id": 1, "strategy": "dow", "sort_order": 0},
            {"week_id": 1, "strategy": "large_cap", "sort_order": 1},
            {"week_id": 1, "strategy": "nasdaq", "sort_order": 2},
        ]
        rest_request(
            "POST",
            f"{url}/rest/v1/momentum_week_current_picks",
            key,
            body=picks,
            prefer="resolution=merge-duplicates,return=minimal",
        )
        print(f"Seeded open Current Week {next_year} W{next_week} ({d.isoformat()})")
    else:
        print("Current week singleton already present — left unchanged.")

    print("Done.")


if __name__ == "__main__":
    main()
