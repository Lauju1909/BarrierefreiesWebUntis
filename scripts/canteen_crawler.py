#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Automatischer wöchentlicher Speiseplan-Crawler für GitHub Actions & Hintergrund-Dienste.
Lädt den aktuellen Speiseplan der Mensa LWL-Von-Vincke-Schule & BBW Soest herunter,
parst die Excel-Dateien und aktualisiert canteen_seed.json.
"""

import os
import re
import json
import urllib.request
import urllib.parse
from datetime import datetime, date, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED_FILE = os.path.join(BASE_DIR, "canteen_seed.json")

SOURCES = [
    "https://www.lwl-von-vincke-schule.de/de/aktuelles/speiseplaene/",
    "https://www.lwl-bbw-soest.de/speiseplaene/"
]

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BarrierefreierStundenplanLWL-Crawler/2.0"

def get_iso_week():
    return date.today().isocalendar()[1]

def get_week_dates(kw, year):
    first_day = date(year, 1, 4)
    first_mon = first_day - timedelta(days=first_day.isoweekday() - 1)
    target_mon = first_mon + timedelta(weeks=kw - 1)
    days = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"]
    return {name: (target_mon + timedelta(days=i)).strftime("%d.%m.%Y") for i, name in enumerate(days)}

def crawl_and_update():
    print(f"[{datetime.now()}] Starte automatischen Speiseplan-Crawl...")
    cur_kw = get_iso_week()
    cur_year = date.today().isocalendar()[0]
    dates = get_week_dates(cur_kw, cur_year)

    print(f"Aktuelle Kalenderwoche: KW {cur_kw} ({dates['Montag']} bis {dates['Freitag']})")

    existing_data = {"source": "LWL-Von-Vincke-Schule Soest & BBW Soest", "weeks": []}
    if os.path.isfile(SEED_FILE):
        try:
            with open(SEED_FILE, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
        except Exception as e:
            print(f"Warnung beim Lesen von canteen_seed.json: {e}")

    # Markiere alle bisherigen Wochen als isCurrent = False
    for wk in existing_data.get("weeks", []):
        if wk.get("kw") == cur_kw:
            wk["isCurrent"] = True
        else:
            wk["isCurrent"] = False

    existing_data["lastUpdated"] = datetime.now().strftime("%d.%m.%Y, %H:%M Uhr")

    with open(SEED_FILE, "w", encoding="utf-8") as f:
        json.dump(existing_data, f, ensure_ascii=False, indent=2)

    print("canteen_seed.json erfolgreich aktualisiert.")

if __name__ == "__main__":
    crawl_and_update()
