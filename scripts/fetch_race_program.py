#!/usr/bin/env python3
"""Fetch the published JRA race-program tables for the upcoming Saturday/Sunday.

This is a schedule-only feed. It does not fetch entries, odds, results, or predictions.
The JRA pages describe the program as provisional; confirm final details in the official
race card before using them.
"""
from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

JST = ZoneInfo("Asia/Tokyo")
VENUES = ("札幌", "函館", "福島", "新潟", "東京", "中山", "中京", "京都", "阪神", "小倉")
VENUE_RE = re.compile(r"\d+回(" + "|".join(VENUES) + r")\d+日")
RACE_RE = re.compile(r"(\d+)\s*レース")
TIME_RE = re.compile(r"(\d{1,2})時(\d{1,2})分")


def upcoming_weekend(today: date) -> list[date]:
    days_to_sat = (5 - today.weekday()) % 7
    saturday = today + timedelta(days=days_to_sat)
    return [saturday, saturday + timedelta(days=1)]


def page_url(day: date) -> str:
    return (
        f"https://jra.jp/keiba/calendar{day.year}/{day.year}/"
        f"{day.month:02d}/{day.month:02d}{day.day:02d}.html"
    )


def parse_program(day: date) -> list[dict]:
    url = page_url(day)
    response = requests.get(
        url,
        timeout=25,
        headers={"User-Agent": "UMA-AI-personal-schedule-check/1.0"},
    )
    response.raise_for_status()
    soup = BeautifulSoup(response.content, "html.parser")
    races: list[dict] = []

    for table in soup.find_all("table"):
        heading = table.find_previous(string=VENUE_RE)
        if not heading:
            continue
        match_venue = VENUE_RE.search(str(heading))
        if not match_venue:
            continue
        venue = match_venue.group(1)

        for row in table.find_all("tr"):
            cells = row.find_all(["th", "td"])
            if len(cells) < 3:
                continue
            first = " ".join(cells[0].stripped_strings)
            race_match = RACE_RE.search(first)
            if not race_match:
                continue
            race_no = int(race_match.group(1))
            race_name = " ".join(cells[1].stripped_strings)
            time_text = " ".join(cells[2].stripped_strings)
            time_match = TIME_RE.search(time_text)
            start_time = (
                f"{int(time_match.group(1)):02d}:{int(time_match.group(2)):02d}"
                if time_match else None
            )
            races.append({
                "date": day.isoformat(),
                "venue": venue,
                "race_no": race_no,
                "race_name": race_name,
                "start_time": start_time,
                "program_status": "provisional",
                "source_url": url,
            })

    # A valid JRA program day normally has 3 venues x 12 races.
    venues_found = {race["venue"] for race in races}
    if len(races) < 24 or not venues_found:
        raise RuntimeError(
            f"Could not confidently parse the published program for {day}: "
            f"{len(races)} races across {len(venues_found)} venues"
        )
    return races


def main() -> None:
    today = datetime.now(JST).date()
    dates = upcoming_weekend(today)
    all_races: list[dict] = []
    errors: list[str] = []

    for day in dates:
        try:
            all_races.extend(parse_program(day))
        except Exception as exc:
            errors.append(f"{day.isoformat()}: {exc}")

    payload = {
        "generated_at": datetime.now(JST).isoformat(),
        "source": "JRA official published race program",
        "data_scope": "race schedule only; no entries, odds, or predictions",
        "status": "partial" if errors else "provisional_program",
        "notice": (
            "JRA's published program is provisional. Race order, course, distance, "
            "start time, cancellation, or postponement may change. Check the official "
            "race card for final information."
        ),
        "errors": errors,
        "races": all_races,
    }
    Path("data").mkdir(exist_ok=True)
    Path("data/weekend.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if errors or not all_races:
        raise SystemExit("Schedule fetch was incomplete; see data/weekend.json")


if __name__ == "__main__":
    main()
