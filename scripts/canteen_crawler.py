#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Automatischer wöchentlicher Speiseplan-Crawler für GitHub Actions & Hintergrund-Dienste.
Lädt den aktuellen Speiseplan der Mensa LWL-Von-Vincke-Schule & BBW Soest herunter,
parst die Excel-Dateien (.xlsx) und aktualisiert canteen_seed.json.
"""

import io
import os
import re
import json
import zipfile
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, date, timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED_FILE = os.path.join(BASE_DIR, "canteen_seed.json")

SOURCES = [
    ("LWL-Von-Vincke-Schule Soest", "https://www.lwl-von-vincke-schule.de/de/aktuelles/speiseplaene/"),
    ("LWL-Berufsbildungswerk Soest", "https://www.lwl-bbw-soest.de/speiseplaene/"),
]

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BarrierefreierStundenplanLWL-Crawler/2.0"


def get_iso_week(d=None):
    if d is None:
        d = date.today()
    return d.isocalendar()[1]


def get_monday_of_week(year, kw):
    first_day = date(year, 1, 4)
    first_mon = first_day - timedelta(days=first_day.isoweekday() - 1)
    return first_mon + timedelta(weeks=kw - 1)


def parse_xlsx_bytes_to_week(file_bytes, xlsx_url=""):
    try:
        shared_strings = []
        sheet_data = {}

        with zipfile.ZipFile(io.BytesIO(file_bytes), "r") as zf:
            if "xl/sharedStrings.xml" in zf.namelist():
                sst_xml = zf.read("xl/sharedStrings.xml")
                sst_root = ET.fromstring(sst_xml)
                for si in sst_root.iter():
                    if si.tag.endswith("}si") or si.tag == "si":
                        texts = []
                        for t in si.iter():
                            if (t.tag.endswith("}t") or t.tag == "t") and t.text:
                                texts.append(t.text)
                        shared_strings.append("".join(texts).strip())

            sheet_name = None
            if "xl/worksheets/sheet1.xml" in zf.namelist():
                sheet_name = "xl/worksheets/sheet1.xml"
            else:
                for name in zf.namelist():
                    if name.lower().startswith("xl/worksheets/sheet") and name.lower().endswith(".xml"):
                        sheet_name = name
                        break

            if not sheet_name:
                return None

            sheet_xml = zf.read(sheet_name)
            sheet_root = ET.fromstring(sheet_xml)

            for row_el in sheet_root.iter():
                if row_el.tag.endswith("}row") or row_el.tag == "row":
                    r_attr = row_el.attrib.get("r", "0")
                    row_num = int(r_attr) if r_attr.isdigit() else 0
                    for c_el in row_el:
                        if c_el.tag.endswith("}c") or c_el.tag == "c":
                            c_ref = c_el.attrib.get("r", "")
                            c_type = c_el.attrib.get("t", "")
                            val_str = ""
                            for child in c_el:
                                if child.tag.endswith("}v") or child.tag == "v" or child.tag.endswith("}t") or child.tag == "t":
                                    if child.text:
                                        val_str += child.text
                            if c_ref and val_str:
                                col_m = re.match(r"^([A-Za-z]+)(\d+)$", c_ref)
                                if col_m:
                                    col_letter = col_m.group(1).upper()
                                    r_idx = int(col_m.group(2))
                                else:
                                    col_letter = re.sub(r"\d+", "", c_ref).upper()
                                    r_idx = row_num

                                final_str = val_str
                                if c_type == "s" and val_str.isdigit():
                                    s_idx = int(val_str)
                                    if 0 <= s_idx < len(shared_strings):
                                        final_str = shared_strings[s_idx]

                                final_str = final_str.strip()
                                if final_str:
                                    sheet_data.setdefault(r_idx, {})[col_letter] = final_str

        if not sheet_data:
            return None

        day_to_col = {}
        header_row = -1
        for r_idx in sorted(sheet_data.keys()):
            for col_key, val in sheet_data[r_idx].items():
                low = val.lower()
                if "montag" in low:
                    day_to_col["Montag"] = col_key
                    header_row = r_idx
                elif "dienstag" in low:
                    day_to_col["Dienstag"] = col_key
                elif "mittwoch" in low:
                    day_to_col["Mittwoch"] = col_key
                elif "donnerstag" in low:
                    day_to_col["Donnerstag"] = col_key
                elif "freitag" in low:
                    day_to_col["Freitag"] = col_key
            if len(day_to_col) >= 3:
                break

        if not day_to_col:
            return None

        day_names = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"]
        day_menus = {
            d: {"breakfast": "", "menu1": "", "menu2": "", "menu3": "", "extra": "", "dinner": ""}
            for d in day_names
        }

        current_cat = "menu1"
        for r_idx in sorted(sheet_data.keys()):
            if r_idx <= header_row:
                continue
            row_cells = sheet_data[r_idx]
            row_summary = " ".join(v.lower() for v in row_cells.values())

            if any(k in row_summary for k in ("menü 1", "menue 1", "vollkost")):
                current_cat = "menu1"
            elif any(k in row_summary for k in ("menü 2", "menue 2", "muslimisch", "geflügel", "ohne schwein")):
                current_cat = "menu2"
            elif any(k in row_summary for k in ("menü 3", "menue 3", "vegetarisch")):
                current_cat = "menu3"
            elif "frühstück" in row_summary:
                current_cat = "breakfast"
            elif "abend" in row_summary or "internat" in row_summary:
                current_cat = "dinner"
            elif any(k in row_summary for k in ("salat", "suppe", "dessert", "tagessuppe")):
                current_cat = "extra"

            for d_name, col_key in day_to_col.items():
                dish = row_cells.get(col_key, "").strip()
                if dish and dish.lower() != d_name.lower():
                    if not day_menus[d_name][current_cat]:
                        day_menus[d_name][current_cat] = dish
                    else:
                        day_menus[d_name][current_cat] += "\n" + dish

        valid_days = sum(
            1 for d in day_names
            if day_menus[d]["menu1"] or day_menus[d]["menu2"] or day_menus[d]["menu3"]
        )
        if valid_days < 2:
            return None

        cur_kw = get_iso_week()
        target_kw = 0
        target_year = date.today().isocalendar()[0]

        header_text = xlsx_url or ""
        for r_idx in sorted(sheet_data.keys()):
            if r_idx <= header_row + 2:
                header_text += " " + " ".join(sheet_data[r_idx].values())

        kw_m = re.search(r"(?:KW|Kalenderwoche|Woche)[\s_\-]*(\d{1,2})\b", header_text, re.IGNORECASE)
        if kw_m:
            parsed_kw = int(kw_m.group(1))
            if 1 <= parsed_kw <= 53:
                target_kw = parsed_kw

        if target_kw == 0:
            date_m = re.search(r"\b(\d{1,2})\.(\d{1,2})\.(20\d{2}|\d{2})\b", header_text)
            if date_m:
                dd, mm, yy = int(date_m.group(1)), int(date_m.group(2)), int(date_m.group(3))
                if yy < 100:
                    yy += 2000
                try:
                    dt = date(yy, mm, dd)
                    target_kw = get_iso_week(dt)
                    target_year = dt.isocalendar()[0]
                except ValueError:
                    pass

        if target_kw <= 0:
            target_kw = cur_kw

        monday = get_monday_of_week(target_year, target_kw)
        friday = monday + timedelta(days=4)
        is_current = (target_kw == cur_kw)

        days_list = []
        for i, d_name in enumerate(day_names):
            cur_date = (monday + timedelta(days=i)).strftime("%d.%m.%Y")
            m = day_menus[d_name]
            days_list.append({
                "day": d_name,
                "date": cur_date,
                "breakfast": m["breakfast"],
                "menu1": m["menu1"],
                "menu2": m["menu2"],
                "menu3": m["menu3"],
                "extra": m["extra"],
                "dinner": m["dinner"],
            })

        return {
            "weekId": f"kw{target_kw}",
            "kw": target_kw,
            "label": f"{'Diese Woche: ' if is_current else ''}KW {target_kw} ({monday.strftime('%d.%m.')} – {friday.strftime('%d.%m.%Y')})",
            "dateRange": f"{monday.strftime('%d.%m.%Y')} bis {friday.strftime('%d.%m.%Y')}",
            "isCurrent": is_current,
            "days": days_list,
        }
    except Exception as e:
        print(f"Warnung beim Parsen der XLSX-Datei: {e}")
        return None


def crawl_and_update():
    print(f"[{datetime.now()}] Starte automatischen Speiseplan-Crawl...")
    cur_kw = get_iso_week()
    cur_year = date.today().isocalendar()[0]
    monday = get_monday_of_week(cur_year, cur_kw)
    friday = monday + timedelta(days=4)

    print(f"Aktuelle Kalenderwoche: KW {cur_kw} ({monday.strftime('%d.%m.%Y')} bis {friday.strftime('%d.%m.%Y')})")

    existing_data = {"source": "LWL-Von-Vincke-Schule Soest & BBW Soest", "weeks": []}
    if os.path.isfile(SEED_FILE):
        try:
            with open(SEED_FILE, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
        except Exception as e:
            print(f"Warnung beim Lesen von canteen_seed.json: {e}")

    download_links = []
    active_source = None
    active_source_url = None

    for source_name, url in SOURCES:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=10) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
            matches = re.findall(r'href=["\']([^"\']*(?:filer/canonical|\.xlsx)[^"\']*)["\']', html, re.IGNORECASE)
            links = []
            for href in matches:
                full_url = urllib.parse.urljoin(url, href)
                if full_url not in links:
                    links.append(full_url)
            if links:
                active_source = source_name
                active_source_url = url
                download_links = links
                print(f"{len(links)} XLSX-Links gefunden auf {source_name}")
                break
        except Exception as e:
            print(f"Hinweis beim Abrufen von {url}: {e}")

    parsed_count = 0
    for xlsx_url in download_links:
        try:
            req = urllib.request.Request(xlsx_url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=15) as resp:
                file_bytes = resp.read()
            if file_bytes and len(file_bytes) > 1000:
                wk_obj = parse_xlsx_bytes_to_week(file_bytes, xlsx_url)
                if wk_obj:
                    weeks = existing_data.setdefault("weeks", [])
                    replaced = False
                    for idx, existing_wk in enumerate(weeks):
                        if existing_wk.get("weekId") == wk_obj["weekId"] or existing_wk.get("kw") == wk_obj["kw"]:
                            weeks[idx] = wk_obj
                            replaced = True
                            break
                    if not replaced:
                        weeks.insert(0, wk_obj)
                    parsed_count += 1
                    print(f"Woche KW {wk_obj['kw']} erfolgreich aus XLSX geparst.")
        except Exception as e:
            print(f"Fehler beim Laden von {xlsx_url}: {e}")

    # Markiere aktuelle Kalenderwoche als isCurrent = True
    for wk in existing_data.get("weeks", []):
        wk["isCurrent"] = (wk.get("kw") == cur_kw)

    if active_source:
        existing_data["source"] = active_source
        existing_data["sourceUrl"] = active_source_url
    existing_data["lastUpdated"] = datetime.now().strftime("%d.%m.%Y, %H:%M Uhr")

    with open(SEED_FILE, "w", encoding="utf-8") as f:
        json.dump(existing_data, f, ensure_ascii=False, indent=2)

    print(f"canteen_seed.json erfolgreich aktualisiert ({parsed_count} XLSX-Wochen verarbeitet).")


if __name__ == "__main__":
    crawl_and_update()
