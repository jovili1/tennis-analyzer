import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
import json
import os
import sys
import csv
import sqlite3
import re
import traceback
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
import threading
from datetime import datetime
from collections import Counter, defaultdict
from pathlib import Path
import shutil

try:
    import openpyxl  # noqa: F401
    HAS_EXCEL = True
except ImportError:
    HAS_EXCEL = False


# ============================================================
# GLOBALE PFAD-BASIS
# ============================================================

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SPIELER_DIR = os.path.join(SCRIPT_DIR, "spieler")
DATENBANKEN_DIR = os.path.join(SCRIPT_DIR, "datenbanken")


# ============================================================
# LOGFILE (global, läuft ab Start)
# ============================================================

LOG_FILE = os.path.join(SCRIPT_DIR, "multitool.log")


def _log_to_file(msg):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass


def _log_traceback(prefix=""):
    buf = (prefix + "\n" + traceback.format_exc()) if prefix else traceback.format_exc()
    _log_to_file(buf)


_log_to_file("=" * 60)
_log_to_file("Tennis Multitool gestartet")
_log_to_file(f"Python: {sys.version.split()[0]}  |  Plattform: {sys.platform}")
_log_to_file(f"Skript-Ordner: {SCRIPT_DIR}")
_log_to_file("=" * 60)


# ============================================================
# THEME
# ============================================================

class Theme:
    BG          = "#0a0e17"
    BG_SIDEBAR  = "#0d121e"
    BG_CARD     = "#131a28"
    BG_INPUT    = "#0f1522"
    BG_HOVER    = "#1a2233"
    BORDER      = "#1f2a3d"
    BORDER_SOFT = "#18202f"

    TEXT        = "#e6edf7"
    TEXT_DIM    = "#8b9ab3"
    TEXT_MUTED  = "#4d5a72"

    GREEN       = "#2ecc71"
    GREEN_DARK  = "#1e8a4c"
    BLUE        = "#4a90e2"
    PURPLE      = "#9b59b6"
    ORANGE      = "#e67e22"
    RED         = "#e74c3c"
    YELLOW      = "#f1c40f"

    FONT        = "Segoe UI"
    FONT_MONO   = "Consolas"


# ============================================================
# FORMAT-DEFINITION
# ============================================================

FORMATS_INPUT  = ["CSV", "JSON", "Excel (.xlsx)", "SQLite (.db)"]
FORMATS_OUTPUT = ["SQLite (.db)", "CSV", "JSON", "Excel (.xlsx)", "Alle"]


def fmt_key(value: str) -> str:
    v = (value or "").lower()
    if v.startswith("csv"):    return "csv"
    if v.startswith("json"):   return "json"
    if v.startswith("excel"):  return "excel"
    if v.startswith("sqlite"): return "sqlite"
    if v.startswith("alle"):   return "alle"
    return v


# ============================================================
# NAME MAPPING (Ranking-Scraper)
# ============================================================

NAME_OVERRIDES = {
    "Zverev Alexander": "Alexander Zverev",
    "Djokovic Novak": "Novak Djokovic",
    "Alcaraz Carlos": "Carlos Alcaraz",
    "Sinner Jannik": "Jannik Sinner",
    "Medvedev Daniil": "Daniil Medvedev",
    "Auger Aliassime Felix": "Felix Auger Aliassime",
    "De Minaur Alex": "Alex De Minaur",
    "Tsitsipas Stefanos": "Stefanos Tsitsipas",
    "Rublev Andrey": "Andrey Rublev",
    "Ruud Casper": "Casper Ruud",
    "Fritz Taylor": "Taylor Fritz",
    "Rune Holger": "Holger Rune",
    "Hurkacz Hubert": "Hubert Hurkacz",
    "Dimitrov Grigor": "Grigor Dimitrov",
    "Paul Tommy": "Tommy Paul",
    "Shelton Ben": "Ben Shelton",
    "Tiafoe Frances": "Frances Tiafoe",
    "Musetti Lorenzo": "Lorenzo Musetti",
    "Cerundolo Francisco": "Francisco Cerundolo",
    "Baez Sebastian": "Sebastian Baez",
    "Bautista Agut Roberto": "Roberto Bautista Agut",
    "Carreno Busta Pablo": "Pablo Carreno Busta",
    "Del Potro Juan Martin": "Juan Martin Del Potro",
    "Seyboth Wild Thiago": "Thiago Seyboth Wild",
    "Van De Zandschulp Botic": "Botic Van De Zandschulp",
    "Davidovich Fokina Alejandro": "Alejandro Davidovich Fokina",
    "Popyrin Alexei": "Alexei Popyrin",
    "Korda Sebastian": "Sebastian Korda",
    "Eubanks Christopher": "Christopher Eubanks",
    "Griekspoor Tallon": "Tallon Griekspoor",
    "Lehecka Jiri": "Jiri Lehecka",
    "Machac Tomas": "Tomas Machac",
    "Struff Jan-Lennard": "Jan-Lennard Struff",
    "Koepfer Dominik": "Dominik Koepfer",
    "Hanfmann Yannick": "Yannick Hanfmann",
    "Altmaier Daniel": "Daniel Altmaier",
    "Marozsan Fabian": "Fabian Marozsan",
    "Fucsovics Marton": "Marton Fucsovics",
    "Nishioka Yoshihito": "Yoshihito Nishioka",
    "Daniel Taro": "Taro Daniel",
    "Nakashima Brandon": "Brandon Nakashima",
    "Michelsen Alex": "Alex Michelsen",
    "Fonseca Joao": "Joao Fonseca",
    "Mpetshi Perricard Giovanni": "Giovanni Mpetshi Perricard",
    "Muller Alexandre": "Alexandre Muller",
    "Halys Quentin": "Quentin Halys",
    "Rinderknech Arthur": "Arthur Rinderknech",
    "Moutet Corentin": "Corentin Moutet",
    "Gaston Hugo": "Hugo Gaston",
    "Cazaux Arthur": "Arthur Cazaux",
    "Van Assche Luca": "Luca Van Assche",
    "Barrere Gregoire": "Gregoire Barrere",
    "Sabalenka Aryna": "Aryna Sabalenka",
    "Swiatek Iga": "Iga Swiatek",
    "Gauff Coco": "Coco Gauff",
    "Rybakina Elena": "Elena Rybakina",
    "Pegula Jessica": "Jessica Pegula",
    "Zheng Qinwen": "Qinwen Zheng",
    "Vondrousova Marketa": "Marketa Vondrousova",
    "Muchova Karolina": "Karolina Muchova",
    "Jabeur Ons": "Ons Jabeur",
    "Krejcikova Barbora": "Barbora Krejcikova",
    "Svitolina Elina": "Elina Svitolina",
    "Andreeva Mirra": "Mirra Andreeva",
    "Noskova Linda": "Linda Noskova",
    "Anisimova Amanda": "Amanda Anisimova",
    "Kostyuk Marta": "Marta Kostyuk",
    "Badosa Paula": "Paula Badosa",
    "Kvitova Petra": "Petra Kvitova",
    "Osaka Naomi": "Naomi Osaka",
    "Azarenka Victoria": "Victoria Azarenka",
    "Keys Madison": "Madison Keys",
    "Collins Danielle": "Danielle Collins",
    "Navarro Emma": "Emma Navarro",
    "Kalinina Anhelina": "Anhelina Kalinina",
    "Boulter Katie": "Katie Boulter",
    "Raducanu Emma": "Emma Raducanu",
    "Fernandez Leylah": "Leylah Fernandez",
    "Shnaider Diana": "Diana Shnaider",
    "Samsonova Liudmila": "Liudmila Samsonova",
    "Alexandrova Ekaterina": "Ekaterina Alexandrova",
    "Kasatkina Daria": "Daria Kasatkina",
    "Pavlyuchenkova Anastasia": "Anastasia Pavlyuchenkova",
    "Potapova Anastasia": "Anastasia Potapova",
    "Siniakova Katerina": "Katerina Siniakova",
    "Vekic Donna": "Donna Vekic",
    "Linette Magda": "Magda Linette",
    "Frech Magdalena": "Magdalena Frech",
    "Garcia Caroline": "Caroline Garcia",
    "Haddad Maia Beatriz": "Beatriz Haddad Maia",
    "Stearns Peyton": "Peyton Stearns",
    "Parry Diane": "Diane Parry",
    "Gracheva Varvara": "Varvara Gracheva",
    "Burel Clara": "Clara Burel",
    "Mertens Elise": "Elise Mertens",
    "Sramkova Rebecca": "Rebecca Sramkova",
}


def map_player_name(raw_name: str) -> str:
    if not raw_name or not raw_name.strip():
        return raw_name
    name = raw_name.strip()
    if name in NAME_OVERRIDES:
        return NAME_OVERRIDES[name]
    parts = name.split()
    if len(parts) < 2:
        return name
    return f"{parts[-1]} {' '.join(parts[:-1])}"


# ============================================================
# PLAYER HELPERS
# ============================================================

REQUIRED_FIELDS_PLAYERS = ["player_id", "name_first", "name_last", "hand",
                           "dob", "ioc", "height", "wikidata_id"]


def parse_dob_parts(dob_str):
    dob_str = (dob_str or "").strip()
    if (len(dob_str) == 8 and dob_str.isdigit()
            and dob_str[4:6] != "00" and dob_str[6:8] != "00"):
        year = dob_str[0:4]
        month = int(dob_str[4:6])
        day = int(dob_str[6:8])
        return f"{day}.{month}.{year}", f"{year}-{month:02d}-{day:02d}"
    return None, None


def parse_int(val):
    if val is None:
        return None
    s = str(val).strip()
    if s == "" or s.lower() in ("nan", "none"):
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def parse_float(val):
    if val is None:
        return None
    s = str(val).strip()
    if s == "" or s.lower() in ("nan", "none"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def normalize_hand(val):
    if val is None:
        return None
    v = str(val).strip().upper()
    if v in ("", "NAN", "NONE"):
        return None
    if v in ("L", "R", "U"):
        return v
    return "U"


def _clean_str(val):
    if val is None:
        return None
    s = str(val).strip()
    if s == "" or s.lower() in ("nan", "none"):
        return None
    return s


# ============================================================
# PLAYER READ / WRITE
# ============================================================

def read_players_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        missing = set(REQUIRED_FIELDS_PLAYERS) - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Fehlende Spalten in CSV: {', '.join(sorted(missing))}")
        return [dict(r) for r in reader]


def read_players_json(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("JSON muss eine Liste von Objekten sein")
    if not data:
        return []
    missing = set(REQUIRED_FIELDS_PLAYERS) - set(data[0].keys())
    if missing:
        raise ValueError(f"Fehlende Felder in JSON: {', '.join(sorted(missing))}")
    return data


def read_players_excel(path):
    if not HAS_EXCEL:
        raise RuntimeError("openpyxl nicht installiert – bitte 'pip install openpyxl'")
    df = pd.read_excel(path, dtype=str)
    df = df.where(pd.notnull(df), None)
    rows = df.to_dict(orient="records")
    if rows:
        missing = set(REQUIRED_FIELDS_PLAYERS) - set(rows[0].keys())
        if missing:
            raise ValueError(f"Fehlende Spalten in Excel: {', '.join(sorted(missing))}")
    return rows


def read_players_sqlite(path):
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    try:
        cur.execute("SELECT * FROM players")
    except sqlite3.OperationalError:
        con.close()
        raise ValueError("SQLite-Datei enthält keine Tabelle 'players'")
    rows = [dict(r) for r in cur.fetchall()]
    con.close()
    return rows


def read_players_any(path, fmt):
    key = fmt_key(fmt)
    if key == "csv":    return read_players_csv(path)
    if key == "json":   return read_players_json(path)
    if key == "excel":  return read_players_excel(path)
    if key == "sqlite": return read_players_sqlite(path)
    raise ValueError(f"Unbekanntes Eingabeformat: {fmt}")


def normalize_player_rows(raw_rows):
    normalized = []
    skipped_hand = 0
    for r in raw_rows:
        dob_disp, dob_iso = parse_dob_parts(r.get("dob"))
        raw_hand = r.get("hand")
        norm_hand = normalize_hand(raw_hand)
        if raw_hand and str(raw_hand).strip().upper() not in ("L", "R", "U", ""):
            skipped_hand += 1
        normalized.append({
            "player_id":   parse_int(r.get("player_id")),
            "name_first":  _clean_str(r.get("name_first")),
            "name_last":   _clean_str(r.get("name_last")),
            "hand":        norm_hand,
            "dob":         dob_disp,
            "dob_iso":     dob_iso,
            "ioc":         _clean_str(r.get("ioc")),
            "height":      parse_int(r.get("height")),
            "wikidata_id": _clean_str(r.get("wikidata_id")),
        })
    return normalized, skipped_hand


def write_players_sqlite(rows, path):
    if os.path.exists(path):
        os.remove(path)
    con = sqlite3.connect(path)
    cur = con.cursor()
    cur.execute("""
        CREATE TABLE players (
            player_id   INTEGER PRIMARY KEY,
            name_first  TEXT,
            name_last   TEXT,
            hand        TEXT CHECK (hand IN ('L','R','U') OR hand IS NULL),
            dob         TEXT,
            dob_iso     TEXT,
            ioc         TEXT,
            height      INTEGER,
            wikidata_id TEXT
        )
    """)
    cur.executemany("""
        INSERT INTO players
            (player_id, name_first, name_last, hand, dob, dob_iso, ioc, height, wikidata_id)
        VALUES (:player_id, :name_first, :name_last, :hand, :dob, :dob_iso, :ioc, :height, :wikidata_id)
    """, rows)
    cur.execute("CREATE INDEX idx_players_lastname ON players(name_last)")
    cur.execute("CREATE INDEX idx_players_ioc      ON players(ioc)")
    cur.execute("CREATE INDEX idx_players_dob_iso  ON players(dob_iso)")
    con.commit()
    cur.execute("SELECT COUNT(*) FROM players")
    count = cur.fetchone()[0]
    con.close()
    return count


def write_players_json(rows, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    return len(rows)


def write_players_csv(rows, path):
    if not rows:
        with open(path, "w", newline="", encoding="utf-8-sig"):
            pass
        return 0
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def write_players_excel(rows, path):
    if not HAS_EXCEL:
        raise RuntimeError("openpyxl nicht installiert – bitte 'pip install openpyxl'")
    pd.DataFrame(rows).to_excel(path, index=False)
    return len(rows)


def write_players_any(rows, path, fmt):
    key = fmt_key(fmt)
    if key == "sqlite": return write_players_sqlite(rows, path)
    if key == "json":   return write_players_json(rows, path)
    if key == "csv":    return write_players_csv(rows, path)
    if key == "excel":  return write_players_excel(rows, path)
    raise ValueError(f"Unbekanntes Ausgabeformat: {fmt}")


# ============================================================
# MATCH HELPERS (Singles + Doppel)
# ============================================================

MATCH_COLUMNS = [
    "tourney_id", "tourney_name", "surface", "draw_size", "tourney_level",
    "tourney_date", "match_num",
    "winner_id", "winner_seed", "winner_entry", "winner_name", "winner_hand",
    "winner_ht", "winner_ioc", "winner_age",
    "loser_id", "loser_seed", "loser_entry", "loser_name", "loser_hand",
    "loser_ht", "loser_ioc", "loser_age",
    "score", "best_of", "round", "minutes",
    "w_ace", "w_df", "w_svpt", "w_1stIn", "w_1stWon", "w_2ndWon",
    "w_SvGms", "w_bpSaved", "w_bpFaced",
    "l_ace", "l_df", "l_svpt", "l_1stIn", "l_1stWon", "l_2ndWon",
    "l_SvGms", "l_bpSaved", "l_bpFaced",
    "winner_rank", "winner_rank_points", "loser_rank", "loser_rank_points",
]

MATCH_INT_COLS = {
    "draw_size", "tourney_date", "match_num",
    "winner_id", "winner_ht",
    "loser_id", "loser_ht",
    "best_of", "minutes",
    "w_ace", "w_df", "w_svpt", "w_1stIn", "w_1stWon", "w_2ndWon",
    "w_SvGms", "w_bpSaved", "w_bpFaced",
    "l_ace", "l_df", "l_svpt", "l_1stIn", "l_1stWon", "l_2ndWon",
    "l_SvGms", "l_bpSaved", "l_bpFaced",
    "winner_rank", "winner_rank_points",
    "loser_rank", "loser_rank_points",
}

MATCH_REAL_COLS = {"winner_age", "loser_age"}


DOUBLES_COLUMNS = [
    "tourney_id", "tourney_name", "surface", "draw_size", "tourney_level",
    "tourney_date", "match_num",
    "winner1_id", "winner2_id", "winner_seed", "winner_entry",
    "loser1_id", "loser2_id", "loser_seed", "loser_entry",
    "score", "best_of", "round",
    "winner1_name", "winner1_hand", "winner1_ht", "winner1_ioc", "winner1_age",
    "winner2_name", "winner2_hand", "winner2_ht", "winner2_ioc", "winner2_age",
    "loser1_name", "loser1_hand", "loser1_ht", "loser1_ioc", "loser1_age",
    "loser2_name", "loser2_hand", "loser2_ht", "loser2_ioc", "loser2_age",
    "winner1_rank", "winner1_rank_points",
    "winner2_rank", "winner2_rank_points",
    "loser1_rank", "loser1_rank_points",
    "loser2_rank", "loser2_rank_points",
    "minutes",
    "w_ace", "w_df", "w_svpt", "w_1stIn", "w_1stWon", "w_2ndWon",
    "w_SvGms", "w_bpSaved", "w_bpFaced",
    "l_ace", "l_df", "l_svpt", "l_1stIn", "l_1stWon", "l_2ndWon",
    "l_SvGms", "l_bpSaved", "l_bpFaced",
]

DOUBLES_INT_COLS = {
    "draw_size", "tourney_date", "match_num",
    "winner1_id", "winner2_id", "loser1_id", "loser2_id",
    "winner1_ht", "winner2_ht", "loser1_ht", "loser2_ht",
    "winner1_rank", "winner2_rank", "loser1_rank", "loser2_rank",
    "winner1_rank_points", "winner2_rank_points",
    "loser1_rank_points", "loser2_rank_points",
    "best_of", "minutes",
    "w_ace", "w_df", "w_svpt", "w_1stIn", "w_1stWon", "w_2ndWon",
    "w_SvGms", "w_bpSaved", "w_bpFaced",
    "l_ace", "l_df", "l_svpt", "l_1stIn", "l_1stWon", "l_2ndWon",
    "l_SvGms", "l_bpSaved", "l_bpFaced",
}

DOUBLES_REAL_COLS = {
    "winner1_age", "winner2_age", "loser1_age", "loser2_age",
}


def detect_match_schema(fieldnames):
    if not fieldnames:
        return None
    fn = set(fieldnames)
    if "winner1_name" in fn and "loser1_name" in fn:
        return "doubles"
    if "winner_name" in fn and "loser_name" in fn:
        return "singles"
    return None


def read_matches_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        schema = detect_match_schema(fieldnames)
        if schema is None:
            raise ValueError(
                f"Spalten passen weder zu Singles noch Doppel. "
                f"Vorhandene Spalten: {fieldnames[:8]}..."
            )

        if schema == "singles":
            expected = MATCH_COLUMNS
        else:
            expected = DOUBLES_COLUMNS

        missing = [c for c in expected if c not in fieldnames]
        if missing:
            print(f"INFO: {os.path.basename(path)}: {len(missing)} optionale "
                  f"Spalten fehlen und werden leer gelassen: {missing[:6]}"
                  + ("..." if len(missing) > 6 else ""))

        rows = []
        for r in reader:
            full = {c: r.get(c) for c in expected}
            rows.append(full)
        return rows, schema


def read_matches_json(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("JSON muss eine Liste von Objekten sein")
    if not data:
        return [], "singles"
    schema = detect_match_schema(data[0].keys())
    if schema is None:
        raise ValueError("JSON-Schema nicht erkannt (weder Singles noch Doppel)")
    return data, schema


def read_matches_excel(path):
    if not HAS_EXCEL:
        raise RuntimeError("openpyxl nicht installiert – bitte 'pip install openpyxl'")
    df = pd.read_excel(path, dtype=str)
    df = df.where(pd.notnull(df), None)
    rows = df.to_dict(orient="records")
    schema = detect_match_schema(rows[0].keys()) if rows else "singles"
    if schema is None:
        raise ValueError("Excel-Schema nicht erkannt (weder Singles noch Doppel)")
    return rows, schema


def read_matches_sqlite(path):
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    cur = con.cursor()
    tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    result = []
    if "matches" in tables:
        result.append(([dict(r) for r in cur.execute("SELECT * FROM matches")], "singles"))
    if "doubles" in tables:
        result.append(([dict(r) for r in cur.execute("SELECT * FROM doubles")], "doubles"))
    con.close()
    if not result:
        raise ValueError("Keine matches-/doubles-Tabelle in der SQLite-Datei")
    return result


def normalize_match_rows_singles(raw_rows):
    normalized = []
    for r in raw_rows:
        row = {}
        for col in MATCH_COLUMNS:
            val = r.get(col)
            if col in MATCH_INT_COLS:
                row[col] = parse_int(val)
            elif col in MATCH_REAL_COLS:
                row[col] = parse_float(val)
            else:
                row[col] = _clean_str(val)
        normalized.append(row)
    return normalized


def normalize_match_rows_doubles(raw_rows):
    normalized = []
    for r in raw_rows:
        row = {}
        for col in DOUBLES_COLUMNS:
            val = r.get(col)
            if col in DOUBLES_INT_COLS:
                row[col] = parse_int(val)
            elif col in DOUBLES_REAL_COLS:
                row[col] = parse_float(val)
            else:
                row[col] = _clean_str(val)
        normalized.append(row)
    return normalized


MATCHES_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS matches (
    tourney_id TEXT,
    tourney_name TEXT,
    surface TEXT,
    draw_size INTEGER,
    tourney_level TEXT,
    tourney_date INTEGER,
    match_num INTEGER,
    winner_id INTEGER,
    winner_seed TEXT,
    winner_entry TEXT,
    winner_name TEXT,
    winner_hand TEXT,
    winner_ht INTEGER,
    winner_ioc TEXT,
    winner_age REAL,
    loser_id INTEGER,
    loser_seed TEXT,
    loser_entry TEXT,
    loser_name TEXT,
    loser_hand TEXT,
    loser_ht INTEGER,
    loser_ioc TEXT,
    loser_age REAL,
    score TEXT,
    best_of INTEGER,
    round TEXT,
    minutes INTEGER,
    w_ace INTEGER,
    w_df INTEGER,
    w_svpt INTEGER,
    w_1stIn INTEGER,
    w_1stWon INTEGER,
    w_2ndWon INTEGER,
    w_SvGms INTEGER,
    w_bpSaved INTEGER,
    w_bpFaced INTEGER,
    l_ace INTEGER,
    l_df INTEGER,
    l_svpt INTEGER,
    l_1stIn INTEGER,
    l_1stWon INTEGER,
    l_2ndWon INTEGER,
    l_SvGms INTEGER,
    l_bpSaved INTEGER,
    l_bpFaced INTEGER,
    winner_rank INTEGER,
    winner_rank_points INTEGER,
    loser_rank INTEGER,
    loser_rank_points INTEGER
)
"""

DOUBLES_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS doubles (
    tourney_id TEXT,
    tourney_name TEXT,
    surface TEXT,
    draw_size INTEGER,
    tourney_level TEXT,
    tourney_date INTEGER,
    match_num INTEGER,
    winner1_id INTEGER,
    winner2_id INTEGER,
    winner_seed TEXT,
    winner_entry TEXT,
    loser1_id INTEGER,
    loser2_id INTEGER,
    loser_seed TEXT,
    loser_entry TEXT,
    score TEXT,
    best_of INTEGER,
    round TEXT,
    winner1_name TEXT,
    winner1_hand TEXT,
    winner1_ht INTEGER,
    winner1_ioc TEXT,
    winner1_age REAL,
    winner2_name TEXT,
    winner2_hand TEXT,
    winner2_ht INTEGER,
    winner2_ioc TEXT,
    winner2_age REAL,
    loser1_name TEXT,
    loser1_hand TEXT,
    loser1_ht INTEGER,
    loser1_ioc TEXT,
    loser1_age REAL,
    loser2_name TEXT,
    loser2_hand TEXT,
    loser2_ht INTEGER,
    loser2_ioc TEXT,
    loser2_age REAL,
    winner1_rank INTEGER,
    winner1_rank_points INTEGER,
    winner2_rank INTEGER,
    winner2_rank_points INTEGER,
    loser1_rank INTEGER,
    loser1_rank_points INTEGER,
    loser2_rank INTEGER,
    loser2_rank_points INTEGER,
    minutes INTEGER,
    w_ace INTEGER,
    w_df INTEGER,
    w_svpt INTEGER,
    w_1stIn INTEGER,
    w_1stWon INTEGER,
    w_2ndWon INTEGER,
    w_SvGms INTEGER,
    w_bpSaved INTEGER,
    w_bpFaced INTEGER,
    l_ace INTEGER,
    l_df INTEGER,
    l_svpt INTEGER,
    l_1stIn INTEGER,
    l_1stWon INTEGER,
    l_2ndWon INTEGER,
    l_SvGms INTEGER,
    l_bpSaved INTEGER,
    l_bpFaced INTEGER
)
"""

MATCHES_NORMAL_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_matches_lookup
ON matches(tourney_id, match_num)
"""

MATCHES_UNIQUE_INDEX_SQL = """
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_unique
ON matches(tourney_id, match_num)
"""

DOUBLES_NORMAL_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS idx_doubles_lookup
ON doubles(tourney_id, match_num)
"""

DOUBLES_UNIQUE_INDEX_SQL = """
CREATE UNIQUE INDEX IF NOT EXISTS idx_doubles_unique
ON doubles(tourney_id, match_num, winner1_name, loser1_name)
"""


def write_matches_sqlite_singles(rows, path, mode="overwrite"):
    if mode == "overwrite" and os.path.exists(path):
        os.remove(path)
    con = sqlite3.connect(path)
    cur = con.cursor()
    cur.execute(MATCHES_CREATE_SQL)
    cur.execute(DOUBLES_CREATE_SQL)

    cols = MATCH_COLUMNS
    placeholders = ", ".join("?" for _ in cols)
    col_list = ", ".join(cols)

    if mode == "append":
        cur.execute(MATCHES_UNIQUE_INDEX_SQL)
        sql = f"INSERT OR IGNORE INTO matches ({col_list}) VALUES ({placeholders})"
    else:
        cur.execute(MATCHES_NORMAL_INDEX_SQL)
        sql = f"INSERT INTO matches ({col_list}) VALUES ({placeholders})"

    data = [tuple(row.get(c) for c in cols) for row in rows]
    cur.executemany(sql, data)
    con.commit()
    cur.execute("SELECT COUNT(*) FROM matches")
    total = cur.fetchone()[0]
    con.close()
    return total


def write_matches_sqlite_doubles(rows, path, mode="overwrite"):
    if mode == "overwrite" and not os.path.exists(path):
        con = sqlite3.connect(path)
        cur = con.cursor()
        cur.execute(MATCHES_CREATE_SQL)
        cur.execute(DOUBLES_CREATE_SQL)
        con.commit()
        con.close()

    con = sqlite3.connect(path)
    cur = con.cursor()
    cur.execute(DOUBLES_CREATE_SQL)

    cols = DOUBLES_COLUMNS
    placeholders = ", ".join("?" for _ in cols)
    col_list = ", ".join(cols)

    if mode == "append":
        cur.execute(DOUBLES_UNIQUE_INDEX_SQL)
        sql = f"INSERT OR IGNORE INTO doubles ({col_list}) VALUES ({placeholders})"
    else:
        cur.execute("DELETE FROM doubles")
        cur.execute(DOUBLES_NORMAL_INDEX_SQL)
        sql = f"INSERT INTO doubles ({col_list}) VALUES ({placeholders})"

    data = [tuple(row.get(c) for c in cols) for row in rows]
    cur.executemany(sql, data)
    con.commit()
    cur.execute("SELECT COUNT(*) FROM doubles")
    total = cur.fetchone()[0]
    con.close()
    return total


def get_table_counts(db_path):
    if not os.path.exists(db_path):
        return 0, 0
    try:
        con = sqlite3.connect(db_path)
        cur = con.cursor()
        tables = [r[0] for r in cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table'")]
        m = 0
        d = 0
        if "matches" in tables:
            m = cur.execute("SELECT COUNT(*) FROM matches").fetchone()[0]
        if "doubles" in tables:
            d = cur.execute("SELECT COUNT(*) FROM doubles").fetchone()[0]
        con.close()
        return m, d
    except Exception:
        _log_traceback("Fehler in get_table_counts")
        return 0, 0


def write_matches_json(rows, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    return len(rows)


def write_matches_csv(rows, path, columns):
    if not rows:
        with open(path, "w", newline="", encoding="utf-8-sig"):
            pass
        return 0
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def write_matches_excel(rows, path, columns):
    if not HAS_EXCEL:
        raise RuntimeError("openpyxl nicht installiert – bitte 'pip install openpyxl'")
    pd.DataFrame(rows, columns=columns).to_excel(path, index=False)
    return len(rows)


# ============================================================
# UI-BAUSTEINE
# ============================================================

def make_card(parent, title=None, icon=""):
    outer = tk.Frame(parent, bg=Theme.BG_CARD,
                     highlightbackground=Theme.BORDER,
                     highlightthickness=1, bd=0)
    if title is not None:
        header = tk.Frame(outer, bg=Theme.BG_CARD)
        header.pack(fill=tk.X, padx=18, pady=(14, 6))
        tk.Label(header, text=f"{icon}  {title}".strip(),
                 font=(Theme.FONT, 11, "bold"),
                 fg=Theme.TEXT, bg=Theme.BG_CARD).pack(anchor='w')
    body = tk.Frame(outer, bg=Theme.BG_CARD)
    body.pack(fill=tk.BOTH, expand=True, padx=18, pady=(4, 14))
    return outer, body


def make_button(parent, text, command, kind="primary", icon=""):
    colors = {
        "primary":   (Theme.GREEN, Theme.GREEN_DARK),
        "secondary": (Theme.BG_HOVER, Theme.BG_INPUT),
        "danger":    (Theme.RED, "#b93c2f"),
        "ghost":     (Theme.BG_CARD, Theme.BG_HOVER),
    }
    bg, hover = colors.get(kind, colors["primary"])
    fg = "#ffffff" if kind in ("primary", "danger") else Theme.TEXT
    btn = tk.Button(
        parent, text=f"{icon}  {text}".strip() if icon else text,
        command=command,
        font=(Theme.FONT, 10, "bold"),
        bg=bg, fg=fg,
        activebackground=hover, activeforeground=fg,
        relief=tk.FLAT, bd=0, cursor='hand2',
        padx=18, pady=10)
    btn.bind("<Enter>", lambda e: btn.config(bg=hover))
    btn.bind("<Leave>", lambda e: btn.config(bg=bg))
    return btn


def make_entry(parent, textvariable, readonly=False, width=None):
    e = tk.Entry(
        parent, textvariable=textvariable,
        font=(Theme.FONT_MONO, 10),
        bg=Theme.BG_INPUT, fg=Theme.TEXT,
        insertbackground=Theme.GREEN,
        relief=tk.FLAT, bd=0,
        highlightthickness=1,
        highlightbackground=Theme.BORDER,
        highlightcolor=Theme.GREEN,
        disabledbackground=Theme.BG_INPUT,
        disabledforeground=Theme.TEXT_DIM)
    if readonly:
        e.config(state='readonly', readonlybackground=Theme.BG_INPUT)
    if width:
        e.config(width=width)
    return e


def make_combobox(parent, textvariable, values, width=16):
    style = ttk.Style()
    style.theme_use('clam')
    style.configure("Modern.TCombobox",
                    fieldbackground=Theme.BG_INPUT,
                    background=Theme.BG_INPUT,
                    foreground=Theme.TEXT,
                    arrowcolor=Theme.TEXT_DIM,
                    borderwidth=0)
    style.map("Modern.TCombobox",
              fieldbackground=[('readonly', Theme.BG_INPUT)],
              foreground=[('readonly', Theme.TEXT)],
              selectbackground=[('readonly', Theme.BG_INPUT)],
              selectforeground=[('readonly', Theme.TEXT)])
    return ttk.Combobox(parent, textvariable=textvariable,
                        values=values, width=width,
                        state='readonly', style="Modern.TCombobox",
                        font=(Theme.FONT, 10))


def make_log(parent, height=10):
    return scrolledtext.ScrolledText(
        parent, bg=Theme.BG_INPUT, fg=Theme.TEXT,
        font=(Theme.FONT_MONO, 9),
        relief=tk.FLAT, bd=0,
        highlightthickness=1,
        highlightbackground=Theme.BORDER,
        insertbackground=Theme.GREEN,
        height=height, wrap=tk.WORD)


def make_scrollable(parent):
    outer = tk.Frame(parent, bg=Theme.BG)
    outer.pack(fill=tk.BOTH, expand=True)

    canvas = tk.Canvas(outer, bg=Theme.BG, highlightthickness=0)
    scroll = tk.Scrollbar(outer, orient=tk.VERTICAL, command=canvas.yview)
    canvas.configure(yscrollcommand=scroll.set)

    canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
    scroll.pack(side=tk.RIGHT, fill=tk.Y)

    inner = tk.Frame(canvas, bg=Theme.BG)
    window = canvas.create_window((0, 0), window=inner, anchor='nw')

    def _on_inner_conf(event):
        canvas.configure(scrollregion=canvas.bbox("all"))

    def _on_canvas_conf(event):
        canvas.itemconfigure(window, width=event.width)

    inner.bind("<Configure>", _on_inner_conf)
    canvas.bind("<Configure>", _on_canvas_conf)

    def _on_mousewheel(event):
        canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

    def _bind_mousewheel(_):
        canvas.bind_all("<MouseWheel>", _on_mousewheel)

    def _unbind_mousewheel(_):
        canvas.unbind_all("<MouseWheel>")

    canvas.bind("<Enter>", _bind_mousewheel)
    canvas.bind("<Leave>", _unbind_mousewheel)

    return inner


# ============================================================
# MODUL 1: RANKING SCRAPER
# ============================================================

class RankingModule:
    def __init__(self, parent, app):
        self.parent = parent
        self.app = app
        self.is_running = False
        self.players = []
        self.scraped_count = 0
        self._build_ui()

    def _build_ui(self):
        root = tk.Frame(self.parent, bg=Theme.BG)
        root.pack(fill=tk.BOTH, expand=True, padx=30, pady=25)

        header = tk.Frame(root, bg=Theme.BG)
        header.pack(fill=tk.X, pady=(0, 20))
        tk.Label(header, text="🏆  Ranking Scraper",
                 font=(Theme.FONT, 22, "bold"),
                 fg=Theme.TEXT, bg=Theme.BG).pack(anchor='w')
        tk.Label(header, text="Aktuelle ATP- und WTA-Ranglisten von TennisExplorer.com",
                 font=(Theme.FONT, 11),
                 fg=Theme.TEXT_DIM, bg=Theme.BG).pack(anchor='w', pady=(2, 0))

        c1, b1 = make_card(root, title="Ranking auswählen", icon="🎯")
        c1.pack(fill=tk.X, pady=(0, 12))
        self.ranking_type = tk.StringVar(value="atp")
        tk.Radiobutton(b1, text="🎾  ATP – Herren", variable=self.ranking_type,
                       value="atp", font=(Theme.FONT, 11),
                       fg=Theme.TEXT, bg=Theme.BG_CARD, selectcolor=Theme.BG_INPUT,
                       activebackground=Theme.BG_CARD, activeforeground=Theme.GREEN,
                       cursor='hand2').pack(side=tk.LEFT, padx=(0, 30))
        tk.Radiobutton(b1, text="👑  WTA – Damen", variable=self.ranking_type,
                       value="wta", font=(Theme.FONT, 11),
                       fg=Theme.TEXT, bg=Theme.BG_CARD, selectcolor=Theme.BG_INPUT,
                       activebackground=Theme.BG_CARD, activeforeground=Theme.PURPLE,
                       cursor='hand2').pack(side=tk.LEFT)

        c2, b2 = make_card(root, title="Speicherort", icon="📁")
        c2.pack(fill=tk.X, pady=(0, 12))
        self.save_path_var = tk.StringVar(value=os.path.join(os.path.expanduser("~"), "Desktop"))
        make_entry(b2, self.save_path_var).pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=8, padx=(0, 10))
        make_button(b2, "Ordner wählen", self.select_folder, kind="secondary", icon="📂").pack(side=tk.LEFT)

        c3, b3 = make_card(root, title="Dateiname & Ausgabeformat", icon="📄")
        c3.pack(fill=tk.X, pady=(0, 12))
        tk.Label(b3, text="Name:", font=(Theme.FONT, 10),
                 fg=Theme.TEXT_DIM, bg=Theme.BG_CARD).pack(side=tk.LEFT, padx=(0, 8))
        self.filename_var = tk.StringVar(value="atp_ranking")
        make_entry(b3, self.filename_var, width=22).pack(side=tk.LEFT, ipady=6, padx=(0, 20))
        tk.Label(b3, text="Format:", font=(Theme.FONT, 10),
                 fg=Theme.TEXT_DIM, bg=Theme.BG_CARD).pack(side=tk.LEFT, padx=(0, 8))
        self.format_var = tk.StringVar(value="CSV")
        make_combobox(b3, self.format_var, FORMATS_OUTPUT, width=16).pack(side=tk.LEFT)

        c4, b4 = make_card(root, title="Aktionen", icon="⚡")
        c4.pack(fill=tk.X, pady=(0, 12))
        self.btn_start = make_button(b4, "Scraping starten", self.start_scraping,
                                     kind="primary", icon="🚀")
        self.btn_start.pack(side=tk.LEFT, padx=(0, 10))
        self.btn_stop = make_button(b4, "Stop", self.stop_scraping, kind="danger", icon="⏹")
        self.btn_stop.pack(side=tk.LEFT, padx=(0, 10))
        self.btn_stop.config(state='disabled')
        make_button(b4, "Ordner öffnen", self.open_folder, kind="secondary", icon="📂").pack(side=tk.LEFT)

        c5, b5 = make_card(root, title="Fortschritt", icon="📊")
        c5.pack(fill=tk.X, pady=(0, 12))
        self.progress_bar = ttk.Progressbar(b5, orient=tk.HORIZONTAL, mode='determinate',
                                            style="Modern.Horizontal.TProgressbar")
        self.progress_bar.pack(fill=tk.X, pady=(0, 8))
        self.progress_label = tk.Label(b5, text="Bereit zum Starten",
                                       font=(Theme.FONT, 10),
                                       fg=Theme.TEXT_DIM, bg=Theme.BG_CARD)
        self.progress_label.pack(anchor='w')

        c6, b6 = make_card(root, title="Log", icon="📋")
        c6.pack(fill=tk.BOTH, expand=True)
        self.log_text = make_log(b6, height=10)
        self.log_text.pack(fill=tk.BOTH, expand=True)
        self.log_text.insert(tk.END, "✅ Bereit zum Starten\n")
        self.log_text.config(state=tk.DISABLED)

    def log(self, msg):
        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, msg + "\n")
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)
        _log_to_file(f"[Ranking] {msg}")
        self.parent.update()

    def select_folder(self):
        p = filedialog.askdirectory(title="Speicherordner auswählen")
        if p:
            self.save_path_var.set(p)
            self.log(f"📁 Speicherort: {p}")

    def open_folder(self):
        p = self.save_path_var.get()
        if os.path.exists(p):
            os.startfile(p)
        else:
            messagebox.showerror("Fehler", "Ordner existiert nicht")

    def set_progress(self, val, text=None):
        self.progress_bar['value'] = val
        if text:
            self.progress_label.config(text=text)
        self.parent.update()

    def stop_scraping(self):
        self.is_running = False
        self.log("⏹ Stop angefordert...")

    def start_scraping(self):
        if self.is_running:
            return
        save_path = self.save_path_var.get()
        if not save_path:
            messagebox.showerror("Fehler", "Bitte Speicherort wählen")
            return
        os.makedirs(save_path, exist_ok=True)
        self.is_running = True
        self.btn_start.config(state='disabled')
        self.btn_stop.config(state='normal')
        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete(1.0, tk.END)
        self.log_text.config(state=tk.DISABLED)
        self.progress_bar['value'] = 0
        threading.Thread(target=self._worker, daemon=True).start()

    def _worker(self):
        try:
            self.scrape()
        except Exception as e:
            self.log(f"❌ Fehler: {e}")
            _log_traceback("[Ranking] Fehler in _worker")
            messagebox.showerror("Fehler", str(e))
        finally:
            self.is_running = False
            self.btn_start.config(state='normal')
            self.btn_stop.config(state='disabled')

    def scrape(self):
        rt = self.ranking_type.get()
        if rt == "atp":
            base_url = "https://www.tennisexplorer.com/ranking/atp-men/"
            label = "ATP"
            default_filename = "atp_ranking"
        else:
            base_url = "https://www.tennisexplorer.com/ranking/wta-women/"
            label = "WTA"
            default_filename = "wta_ranking"

        cur_name = self.filename_var.get()
        if cur_name in ["atp_ranking", "wta_ranking", "ranking_complete", ""]:
            self.filename_var.set(default_filename)

        all_players = []
        page = 1
        has_more = True

        self.log("=" * 56)
        self.log(f"🚀 {label}-Ranking Scraper gestartet")
        self.log("=" * 56)

        while has_more and self.is_running:
            url = base_url if page == 1 else f"{base_url}?page={page}"
            self.log(f"📄 Lade Seite {page}...")
            self.set_progress(0, f"Seite {page}...")
            try:
                headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                         "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36"}
                resp = requests.get(url, headers=headers, timeout=15)
                if resp.status_code != 200:
                    self.log(f"⚠️ HTTP {resp.status_code}")
                    break
                soup = BeautifulSoup(resp.text, "html.parser")
                table = None
                for t in soup.find_all("table"):
                    txt = t.get_text(" ", strip=True)
                    if "Rank" in txt and "Player name" in txt and "Points" in txt:
                        table = t
                        break
                if table is None:
                    for t in soup.find_all("table"):
                        if len(t.find_all("tr")) > 10:
                            table = t
                            break
                if table is None:
                    self.log("❌ Tabelle nicht gefunden.")
                    break
                rows = table.find_all("tr")
                cnt = 0
                for row in rows[1:]:
                    if not self.is_running:
                        self.log("⏹ Abgebrochen")
                        return
                    cells = row.find_all("td")
                    if len(cells) < 5:
                        continue
                    rank_text = cells[0].get_text(strip=True)
                    if not rank_text:
                        continue
                    rank = rank_text.replace(".", "").strip()
                    if not rank.isdigit():
                        continue

                    # 🔥 FIX: Move mit Richtung auslesen (oup = up, odown = down)
                    move_cell = cells[1]
                    div = move_cell.find("div")
                    if div:
                        div_class = div.get("class") or []
                        if isinstance(div_class, str):
                            div_class = [div_class]
                        div_text = div.get_text(strip=True)
                        if "oup" in div_class:
                            move = f"+{div_text}"
                        elif "odown" in div_class:
                            move = f"-{div_text}"
                        else:
                            move = "-"
                    else:
                        move = "-"

                    raw_name = cells[2].get_text(strip=True)
                    name = map_player_name(raw_name)
                    country = cells[3].get_text(strip=True)
                    pts = cells[4].get_text(strip=True).replace(" ", "").replace(".", "")
                    try:
                        pts = int(pts)
                    except Exception:
                        pts = 0
                    all_players.append({"rank": int(rank), "move": move,
                                        "name": name, "country": country, "points": pts})
                    cnt += 1
                self.log(f"✅ Seite {page}: {cnt} Spieler")
                self.scraped_count += cnt
                next_link = soup.find("a", rel="next")
                if not next_link:
                    for link in soup.find_all("a", href=True):
                        if link.get_text(strip=True) in ["Next", "→", "»", "Weiter"]:
                            next_link = link
                            break
                if next_link and cnt > 0 and self.is_running:
                    page += 1
                    time.sleep(1.5)
                else:
                    has_more = False
                    self.log("🏁 Letzte Seite erreicht.")
            except Exception as e:
                self.log(f"❌ Fehler: {e}")
                _log_traceback("[Ranking] Fehler in Schleife")
                has_more = False

        self.log("")
        self.log(f"📊 Gesamt: {len(all_players)} Spieler")
        if not all_players:
            return

        save_path = self.save_path_var.get()
        base_name = self.filename_var.get() or default_filename
        key = fmt_key(self.format_var.get())

        targets = []
        if key in ("csv", "alle"):
            targets.append(("csv", os.path.join(save_path, f"{base_name}.csv")))
        if key in ("json", "alle"):
            targets.append(("json", os.path.join(save_path, f"{base_name}.json")))
        if key in ("excel", "alle"):
            targets.append(("excel", os.path.join(save_path, f"{base_name}.xlsx")))
        if key in ("sqlite", "alle"):
            targets.append(("sqlite", os.path.join(save_path, f"{base_name}.db")))

        df = pd.DataFrame(all_players)
        for t, path in targets:
            try:
                if t == "csv":
                    df.to_csv(path, index=False, encoding="utf-8-sig")
                elif t == "json":
                    with open(path, "w", encoding="utf-8") as f:
                        json.dump(all_players, f, ensure_ascii=False, indent=2)
                elif t == "excel":
                    if not HAS_EXCEL:
                        self.log("⚠️ Excel übersprungen (openpyxl fehlt)")
                        continue
                    df.to_excel(path, index=False)
                elif t == "sqlite":
                    if os.path.exists(path):
                        os.remove(path)
                    con = sqlite3.connect(path)
                    df.to_sql("ranking", con, index=False, if_exists="replace")
                    con.close()
                self.log(f"✅ {t.upper()}: {os.path.basename(path)}")
            except Exception as e:
                self.log(f"❌ {t.upper()}: {e}")
                _log_traceback(f"[Ranking] Fehler beim Schreiben {t}")

        self.set_progress(100, f"✅ Fertig: {len(all_players)} Spieler")
        messagebox.showinfo("Fertig",
                            f"{label}-Ranking erfolgreich gescraped!\n\n"
                            f"Spieler: {len(all_players)}")


# ============================================================
# MODUL 2: PLAYERS KONVERTER
# ============================================================

class PlayersModule:
    def __init__(self, parent, app):
        self.parent = parent
        self.app = app
        self.is_running = False
        self.input_path = None
        self._build_ui()

    def _build_ui(self):
        root = tk.Frame(self.parent, bg=Theme.BG)
        root.pack(fill=tk.BOTH, expand=True, padx=30, pady=25)

        header = tk.Frame(root, bg=Theme.BG)
        header.pack(fill=tk.X, pady=(0, 20))
        tk.Label(header, text="👥  Players Konverter",
                 font=(Theme.FONT, 22, "bold"),
                 fg=Theme.TEXT, bg=Theme.BG).pack(anchor='w')
        tk.Label(header, text="Player-Daten zwischen CSV, JSON, Excel und SQLite konvertieren",
                 font=(Theme.FONT, 11),
                 fg=Theme.TEXT_DIM, bg=Theme.BG).pack(anchor='w', pady=(2, 0))

        c1, b1 = make_card(root, title="Eingabe", icon="📂")
        c1.pack(fill=tk.X, pady=(0, 12))
        row1 = tk.Frame(b1, bg=Theme.BG_CARD)
        row1.pack(fill=tk.X)
        tk.Label(row1, text="Format:", font=(Theme.FONT, 10),
                 fg=Theme.TEXT_DIM, bg=Theme.BG_CARD).pack(side=tk.LEFT, padx=(0, 8))
        self.in_format_var = tk.StringVar(value="CSV")
        cb1 = make_combobox(row1, self.in_format_var, FORMATS_INPUT, width=14)
        cb1.pack(side=tk.LEFT, padx=(0, 12))
        cb1.bind("<<ComboboxSelected>>", lambda e: self._on_input_format_change())

        self.input_path_var = tk.StringVar(value="(noch keine Datei gewählt)")
        make_entry(row1, self.input_path_var, readonly=True).pack(
            side=tk.LEFT, fill=tk.X, expand=True, ipady=8, padx=(0, 10))
        make_button(row1, "Datei wählen", self.select_input_file,
                    kind="secondary", icon="📄").pack(side=tk.LEFT)

        c2, b2 = make_card(root, title="Ausgabe", icon="💾")
        c2.pack(fill=tk.X, pady=(0, 12))
        row2 = tk.Frame(b2, bg=Theme.BG_CARD)
        row2.pack(fill=tk.X)
        tk.Label(row2, text="Format:", font=(Theme.FONT, 10),
                 fg=Theme.TEXT_DIM, bg=Theme.BG_CARD).pack(side=tk.LEFT, padx=(0, 8))
        self.out_format_var = tk.StringVar(value="SQLite (.db)")
        cb2 = make_combobox(row2, self.out_format_var, FORMATS_OUTPUT, width=14)
        cb2.pack(side=tk.LEFT, padx=(0, 12))
        cb2.bind("<<ComboboxSelected>>", lambda e: self._on_output_format_change())

        self.out_path_var = tk.StringVar(
            value=os.path.join(os.path.expanduser("~"), "Desktop", "players.db"))
        make_entry(row2, self.out_path_var).pack(
            side=tk.LEFT, fill=tk.X, expand=True, ipady=8, padx=(0, 10))
        make_button(row2, "Ordner", self.select_out_folder,
                    kind="secondary", icon="📂").pack(side=tk.LEFT, padx=(0, 6))
        make_button(row2, "Ziel wählen", self.select_out_file,
                    kind="secondary", icon="💾").pack(side=tk.LEFT)

        c3, b3 = make_card(root, title="Vorschau (erste Zeilen)", icon="👀")
        c3.pack(fill=tk.X, pady=(0, 12))
        self.preview_text = make_log(b3, height=6)
        self.preview_text.pack(fill=tk.X)
        self.preview_text.insert(tk.END, "Noch keine Datei geladen.\n")
        self.preview_text.config(state=tk.DISABLED)

        c4, b4 = make_card(root, title="Aktionen", icon="⚡")
        c4.pack(fill=tk.X, pady=(0, 12))
        row4 = tk.Frame(b4, bg=Theme.BG_CARD)
        row4.pack(fill=tk.X, pady=(0, 10))
        self.btn_build = make_button(row4, "Konvertieren", self.start_build,
                                     kind="primary", icon="🚀")
        self.btn_build.pack(side=tk.LEFT, padx=(0, 10))
        self.btn_build.config(state='disabled')
        make_button(row4, "Ordner öffnen", self.open_out_folder,
                    kind="secondary", icon="📂").pack(side=tk.LEFT)

        self.progress_bar = ttk.Progressbar(b4, orient=tk.HORIZONTAL, mode='determinate',
                                            style="Modern.Horizontal.TProgressbar")
        self.progress_bar.pack(fill=tk.X, pady=(6, 6))
        self.progress_label = tk.Label(b4, text="Bereit",
                                       font=(Theme.FONT, 10),
                                       fg=Theme.TEXT_DIM, bg=Theme.BG_CARD)
        self.progress_label.pack(anchor='w')

        c5, b5 = make_card(root, title="Log", icon="📋")
        c5.pack(fill=tk.BOTH, expand=True)
        self.log_text = make_log(b5, height=10)
        self.log_text.pack(fill=tk.BOTH, expand=True)
        self.log_text.insert(tk.END, "✅ Bereit – bitte Eingabedatei wählen\n")
        self.log_text.config(state=tk.DISABLED)

    def log(self, msg):
        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, msg + "\n")
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)
        _log_to_file(f"[Players] {msg}")
        self.parent.update()

    def _input_ext(self):
        key = fmt_key(self.in_format_var.get())
        return {"csv": (".csv",), "json": (".json",),
                "excel": (".xlsx", ".xls"),
                "sqlite": (".db", ".sqlite", ".sqlite3")}.get(key, ("*.*",))

    def _output_ext(self):
        key = fmt_key(self.out_format_var.get())
        return {"sqlite": ".db", "json": ".json",
                "csv": ".csv", "excel": ".xlsx"}.get(key, "")

    def _on_input_format_change(self):
        self.input_path = None
        self.input_path_var.set("(noch keine Datei gewählt)")
        self.btn_build.config(state='disabled')

    def _on_output_format_change(self):
        cur = self.out_path_var.get()
        base = os.path.splitext(cur)[0] or os.path.join(os.path.expanduser("~"), "Desktop", "players")
        ext = self._output_ext()
        if ext:
            self.out_path_var.set(base + ext)

    def select_input_file(self):
        exts = self._input_ext()
        path = filedialog.askopenfilename(
            title="Eingabedatei auswählen",
            filetypes=[("Passende Dateien", " ".join(f"*{e}" for e in exts)),
                       ("Alle Dateien", "*.*")])
        if not path:
            return
        self.input_path = path
        self.input_path_var.set(path)
        self.log(f"📄 Eingabe: {path}")
        try:
            key = fmt_key(self.in_format_var.get())
            if key == "csv":
                with open(path, newline="", encoding="utf-8-sig") as f:
                    lines = []
                    for i, row in enumerate(csv.reader(f)):
                        if i >= 6:
                            break
                        lines.append(" | ".join(row))
                preview = "\n".join(lines)
            elif key == "json":
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
                preview = json.dumps(data[:5], ensure_ascii=False, indent=2)
            elif key == "excel":
                df = pd.read_excel(path, nrows=5)
                preview = df.to_string(index=False)
            elif key == "sqlite":
                con = sqlite3.connect(path)
                df = pd.read_sql_query("SELECT * FROM players LIMIT 5", con)
                con.close()
                preview = df.to_string(index=False)
            else:
                preview = "(keine Vorschau)"
            self.preview_text.config(state=tk.NORMAL)
            self.preview_text.delete(1.0, tk.END)
            self.preview_text.insert(tk.END, preview)
            self.preview_text.config(state=tk.DISABLED)
        except Exception as e:
            self.log(f"⚠️ Vorschau: {e}")

        fname = os.path.basename(path).lower()
        cur_out = self.out_path_var.get()
        ext = self._output_ext()
        folder = os.path.dirname(cur_out) or os.path.join(os.path.expanduser("~"), "Desktop")
        base = ("atp_players" if "atp" in fname
                else "wta_players" if "wta" in fname
                else "players")
        if ext:
            self.out_path_var.set(os.path.join(folder, base + ext))

        self.btn_build.config(state='normal')
        self.log("✅ Bereit – jetzt Konvertieren klicken")

    def select_out_folder(self):
        p = filedialog.askdirectory(title="Ziel-Ordner wählen")
        if p:
            cur = os.path.basename(self.out_path_var.get()) or "players.db"
            self.out_path_var.set(os.path.join(p, cur))
            self.log(f"📁 Zielordner: {p}")

    def select_out_file(self):
        ext = self._output_ext()
        p = filedialog.asksaveasfilename(
            title="Ziel-Datei festlegen",
            defaultextension=ext,
            initialfile=os.path.basename(self.out_path_var.get()) or f"players{ext}",
            filetypes=[("Passende Dateien", f"*{ext}" if ext else "*.*"),
                       ("Alle Dateien", "*.*")])
        if p:
            self.out_path_var.set(p)
            self.log(f"💾 Ziel: {p}")

    def open_out_folder(self):
        folder = os.path.dirname(self.out_path_var.get())
        if os.path.exists(folder):
            os.startfile(folder)
        else:
            messagebox.showerror("Fehler", "Ordner existiert nicht")

    def start_build(self):
        if self.is_running:
            return
        if not self.input_path or not os.path.exists(self.input_path):
            messagebox.showerror("Fehler", "Bitte Eingabedatei wählen")
            return
        out_path = self.out_path_var.get().strip()
        if not out_path:
            messagebox.showerror("Fehler", "Bitte Zielpfad angeben")
            return
        out_dir = os.path.dirname(out_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        in_key = fmt_key(self.in_format_var.get())
        out_key = fmt_key(self.out_format_var.get())

        self.is_running = True
        self.btn_build.config(state='disabled')
        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete(1.0, tk.END)
        self.log_text.config(state=tk.DISABLED)
        self.progress_bar['value'] = 0
        threading.Thread(target=self._worker,
                         args=(self.input_path, in_key, out_path, out_key),
                         daemon=True).start()

    def _worker(self, in_path, in_key, out_path, out_key):
        try:
            self.log("=" * 56)
            self.log("🚀 Konvertierung gestartet")
            self.log("=" * 56)
            self.log(f"📄 Eingabe: {in_path}  ({in_key})")
            self.log(f"💾 Ausgabe: {out_path}  ({out_key})")
            self.progress_bar['value'] = 20
            self.progress_label.config(text="📖 Lese Eingabe...")
            self.parent.update()

            raw = read_players_any(in_path, in_key)
            self.log(f"📥 {len(raw)} Rohdatensätze")

            self.progress_bar['value'] = 45
            self.progress_label.config(text="🧼 Normalisiere...")
            self.parent.update()

            norm, skipped = normalize_player_rows(raw)
            if skipped:
                self.log(f"ℹ️ {skipped} Sonderwerte 'hand' → 'U' normalisiert")

            self.progress_bar['value'] = 70
            self.progress_label.config(text="💾 Schreibe Ausgabe...")
            self.parent.update()

            if out_key == "alle":
                base = os.path.splitext(out_path)[0]
                targets = [("sqlite", base + ".db"),
                           ("json",   base + ".json"),
                           ("csv",    base + ".csv"),
                           ("excel",  base + ".xlsx")]
            else:
                targets = [(out_key, out_path)]

            count = 0
            for t, p in targets:
                try:
                    count = write_players_any(norm, p, t)
                    self.log(f"✅ {t.upper()}: {os.path.basename(p)} ({count})")
                except Exception as e:
                    self.log(f"❌ {t.upper()}: {e}")
                    _log_traceback(f"[Players] Fehler beim Schreiben {t}")

            self.progress_bar['value'] = 100
            self.progress_label.config(text=f"✅ Fertig: {count} Spieler")
            self.log("")
            self.log(f"✅ Konvertierung abgeschlossen: {count} Spieler")
            messagebox.showinfo("Fertig",
                                f"Konvertierung erfolgreich!\n\nSpieler: {count}")
        except Exception as e:
            self.log(f"❌ Fehler: {e}")
            _log_traceback("[Players] Fehler in _worker")
            messagebox.showerror("Fehler", str(e))
        finally:
            self.is_running = False
            self.btn_build.config(state='normal')


# ============================================================
# MODUL 3: ELO UPDATE
# ============================================================

class EloModule:
    USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/91.0.4472.124 Safari/537.36")

    URLS = {
        'atp': 'https://tennisabstract.com/reports/atp_elo_ratings.html',
        'wta': 'https://tennisabstract.com/reports/wta_elo_ratings.html',
    }

    def __init__(self, parent, app):
        self.parent = parent
        self.app = app
        self.is_running = False

        default_elo = os.path.join(DATENBANKEN_DIR, "elo_ratings.db")
        default_atp = os.path.join(SPIELER_DIR, "atp_matches.db")
        default_wta = os.path.join(SPIELER_DIR, "wta_matches.db")

        self.elo_path_var = tk.StringVar(value=default_elo)
        self.atp_path_var = tk.StringVar(value=default_atp)
        self.wta_path_var = tk.StringVar(value=default_wta)

        self._build_ui()
        self._refresh_path_status()

    def _build_ui(self):
        root = tk.Frame(self.parent, bg=Theme.BG)
        root.pack(fill=tk.BOTH, expand=True, padx=30, pady=25)

        header = tk.Frame(root, bg=Theme.BG)
        header.pack(fill=tk.X, pady=(0, 20))
        tk.Label(header, text="⚡  ELO Update",
                 font=(Theme.FONT, 22, "bold"),
                 fg=Theme.TEXT, bg=Theme.BG).pack(anchor='w')
        tk.Label(header, text="Holt ATP- und WTA-ELO-Werte von tennisabstract.com "
                              "und schreibt sie in die ELO-Datenbank.",
                 font=(Theme.FONT, 11),
                 fg=Theme.TEXT_DIM, bg=Theme.BG).pack(anchor='w', pady=(2, 0))

        tk.Label(root, text=f"📌 Basis-Ordner: {SCRIPT_DIR}",
                 font=(Theme.FONT_MONO, 9),
                 fg=Theme.TEXT_MUTED, bg=Theme.BG, anchor='w').pack(fill=tk.X, pady=(0, 12))

        c1, b1 = make_card(root, title="ELO-Datenbank (Ziel)", icon="💾")
        c1.pack(fill=tk.X, pady=(0, 12))
        row1 = tk.Frame(b1, bg=Theme.BG_CARD)
        row1.pack(fill=tk.X)
        make_entry(row1, self.elo_path_var).pack(
            side=tk.LEFT, fill=tk.X, expand=True, ipady=8, padx=(0, 10))
        make_button(row1, "Ordner", self.select_elo_folder,
                    kind="secondary", icon="📂").pack(side=tk.LEFT, padx=(0, 6))
        make_button(row1, "Datei wählen", self.select_elo_file,
                    kind="secondary", icon="💾").pack(side=tk.LEFT)
        self.elo_status = tk.Label(b1, text="", font=(Theme.FONT, 9),
                                   fg=Theme.TEXT_MUTED, bg=Theme.BG_CARD, anchor='w')
        self.elo_status.pack(fill=tk.X, pady=(6, 0))

        c2, b2 = make_card(root, title="Match-Datenbanken (optional)", icon="📂")
        c2.pack(fill=tk.X, pady=(0, 12))
        tk.Label(b2, text="Nur nötig, wenn Match-Zahlen (matches_played, wins, losses) "
                          "in die ELO-DB eingetragen werden sollen.",
                 font=(Theme.FONT, 9, "italic"),
                 fg=Theme.TEXT_MUTED, bg=Theme.BG_CARD, anchor='w').pack(fill=tk.X, pady=(0, 8))

        row2a = tk.Frame(b2, bg=Theme.BG_CARD)
        row2a.pack(fill=tk.X, pady=(0, 6))
        tk.Label(row2a, text="🎾 ATP:", font=(Theme.FONT, 10, "bold"),
                 fg=Theme.TEXT_DIM, bg=Theme.BG_CARD, width=8, anchor='w').pack(side=tk.LEFT)
        make_entry(row2a, self.atp_path_var).pack(
            side=tk.LEFT, fill=tk.X, expand=True, ipady=8, padx=(0, 10))
        make_button(row2a, "Wählen", lambda: self.select_match_file('atp'),
                    kind="secondary", icon="📂").pack(side=tk.LEFT)
        self.atp_status = tk.Label(b2, text="", font=(Theme.FONT, 9),
                                   fg=Theme.TEXT_MUTED, bg=Theme.BG_CARD, anchor='w')
        self.atp_status.pack(fill=tk.X, pady=(0, 10))

        row2b = tk.Frame(b2, bg=Theme.BG_CARD)
        row2b.pack(fill=tk.X, pady=(0, 6))
        tk.Label(row2b, text="👑 WTA:", font=(Theme.FONT, 10, "bold"),
                 fg=Theme.TEXT_DIM, bg=Theme.BG_CARD, width=8, anchor='w').pack(side=tk.LEFT)
        make_entry(row2b, self.wta_path_var).pack(
            side=tk.LEFT, fill=tk.X, expand=True, ipady=8, padx=(0, 10))
        make_button(row2b, "Wählen", lambda: self.select_match_file('wta'),
                    kind="secondary", icon="📂").pack(side=tk.LEFT)
        self.wta_status = tk.Label(b2, text="", font=(Theme.FONT, 9),
                                   fg=Theme.TEXT_MUTED, bg=Theme.BG_CARD, anchor='w')
        self.wta_status.pack(fill=tk.X)

        c3, b3 = make_card(root, title="Aktionen", icon="🚀")
        c3.pack(fill=tk.X, pady=(0, 12))
        self.btn_start = make_button(b3, "ELO Update starten", self.start_update,
                                     kind="primary", icon="⚡")
        self.btn_start.pack(side=tk.LEFT, padx=(0, 10))
        self.btn_stop = make_button(b3, "Stop", self.stop_update,
                                    kind="danger", icon="⏹")
        self.btn_stop.pack(side=tk.LEFT)
        self.btn_stop.config(state='disabled')

        c4, b4 = make_card(root, title="Fortschritt", icon="📊")
        c4.pack(fill=tk.X, pady=(0, 12))
        self.progress_bar = ttk.Progressbar(b4, orient=tk.HORIZONTAL,
                                            mode='determinate',
                                            style="Modern.Horizontal.TProgressbar")
        self.progress_bar.pack(fill=tk.X, pady=(0, 8))
        self.progress_label = tk.Label(b4, text="Bereit",
                                       font=(Theme.FONT, 10),
                                       fg=Theme.TEXT_DIM, bg=Theme.BG_CARD)
        self.progress_label.pack(anchor='w')

        c5, b5 = make_card(root, title="Log", icon="📋")
        c5.pack(fill=tk.BOTH, expand=True)
        self.log_text = make_log(b5, height=14)
        self.log_text.pack(fill=tk.BOTH, expand=True)
        self.log_text.insert(tk.END, "✅ Bereit – 'ELO Update starten' klicken\n")
        self.log_text.config(state=tk.DISABLED)

    def _refresh_path_status(self):
        def status_for(path, is_target=False):
            if not path:
                return "❌ kein Pfad gesetzt"
            if os.path.exists(path):
                size = os.path.getsize(path)
                return f"✅ vorhanden ({size/1024:.0f} KB)"
            parent_dir = os.path.dirname(path)
            if os.path.isdir(parent_dir):
                if is_target:
                    return f"🆕 wird neu erstellt in: {parent_dir}"
                return "❌ Datei existiert nicht (Ordner vorhanden)"
            return f"❌ Ordner existiert nicht: {parent_dir}"

        self.elo_status.config(text=status_for(self.elo_path_var.get(), is_target=True))
        self.atp_status.config(text=status_for(self.atp_path_var.get()))
        self.wta_status.config(text=status_for(self.wta_path_var.get()))

    def select_elo_folder(self):
        p = filedialog.askdirectory(title="Ziel-Ordner für elo_ratings.db wählen")
        if p:
            self.elo_path_var.set(os.path.join(p, "elo_ratings.db"))
            self._refresh_path_status()

    def select_elo_file(self):
        p = filedialog.asksaveasfilename(
            title="Ziel-Datei für elo_ratings.db festlegen",
            defaultextension=".db",
            initialfile="elo_ratings.db",
            filetypes=[("SQLite-Datenbank", "*.db"), ("Alle Dateien", "*.*")])
        if p:
            self.elo_path_var.set(p)
            self._refresh_path_status()

    def select_match_file(self, tour):
        title = "ATP-Match-DB wählen" if tour == "atp" else "WTA-Match-DB wählen"
        p = filedialog.askopenfilename(
            title=title,
            filetypes=[("SQLite-Datenbank", "*.db"), ("Alle Dateien", "*.*")])
        if p:
            if tour == "atp":
                self.atp_path_var.set(p)
            else:
                self.wta_path_var.set(p)
            self._refresh_path_status()

    def log(self, msg):
        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, msg + "\n")
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)
        _log_to_file(f"[Elo] {msg}")
        self.parent.update()

    def set_progress(self, val, text=None):
        self.progress_bar['value'] = val
        if text:
            self.progress_label.config(text=text)
        self.parent.update()

    def stop_update(self):
        self.is_running = False
        self.log("⏹ Stop angefordert...")

    @staticmethod
    def clean_player_name(name):
        if not name:
            return name
        return name.replace('\xa0', ' ').strip()

    @staticmethod
    def clean_elo_value(value):
        if not value or value == 'None' or value == '':
            return 1500
        cleaned = re.sub(r'[^\d.]', '', str(value).strip())
        if not cleaned:
            return 1500
        try:
            return int(float(cleaned))
        except ValueError:
            return 1500

    def get_match_stats_from_db(self, player_name, tour):
        db = self.atp_path_var.get() if tour == 'atp' else self.wta_path_var.get()
        if not db or not os.path.exists(db):
            return (0, 0, 0)
        try:
            conn = sqlite3.connect(db)
            cur = conn.cursor()
            cur.execute("""
                SELECT COUNT(*), SUM(CASE WHEN winner_name = ? THEN 1 ELSE 0 END)
                FROM matches WHERE winner_name = ? OR loser_name = ?
            """, (player_name, player_name, player_name))
            total, wins = cur.fetchone()
            total = total or 0
            wins = wins or 0
            if total == 0:
                pattern = f"%{player_name}%"
                cur.execute("""
                    SELECT COUNT(*), SUM(CASE WHEN LOWER(winner_name)=LOWER(?) THEN 1 ELSE 0 END)
                    FROM matches WHERE winner_name LIKE ? OR loser_name LIKE ?
                """, (player_name, pattern, pattern))
                total, wins = cur.fetchone()
                total = total or 0
                wins = wins or 0
            conn.close()
            return (total, wins, max(0, total - wins))
        except Exception as e:
            self.log(f"   ⚠️ Match-Stats '{player_name}': {e}")
            _log_traceback(f"[Elo] Fehler Match-Stats {player_name}")
            return (0, 0, 0)

    def init_database(self, db_path):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        if os.path.exists(db_path):
            os.remove(db_path)
            self.log("🗑️  Alte ELO-DB gelöscht")
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE elo_ratings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_name TEXT NOT NULL,
                elo INTEGER NOT NULL,
                surface TEXT NOT NULL,
                date TEXT NOT NULL,
                matches_played INTEGER DEFAULT 0,
                wins INTEGER DEFAULT 0,
                losses INTEGER DEFAULT 0,
                weight_factor REAL DEFAULT 1.0,
                matches_hard INTEGER DEFAULT 0,
                matches_clay INTEGER DEFAULT 0,
                matches_grass INTEGER DEFAULT 0,
                wins_hard INTEGER DEFAULT 0,
                wins_clay INTEGER DEFAULT 0,
                wins_grass INTEGER DEFAULT 0,
                recent_form INTEGER DEFAULT 50,
                recent_form_status TEXT DEFAULT '⚖️ Neutral',
                momentum_streak INTEGER DEFAULT 0,
                momentum_status TEXT DEFAULT '⚖️ Neutral',
                elo_hard INTEGER DEFAULT 1500,
                elo_clay INTEGER DEFAULT 1500,
                elo_grass INTEGER DEFAULT 1500,
                form_factor REAL DEFAULT 1.0,
                fatigue_factor REAL DEFAULT 1.0,
                serve_factor REAL DEFAULT 1.0,
                experience_factor REAL DEFAULT 1.0,
                UNIQUE(player_name, surface, date)
            )
        ''')
        cur.execute('CREATE INDEX idx_elo_player  ON elo_ratings(player_name)')
        cur.execute('CREATE INDEX idx_elo_surface ON elo_ratings(surface)')
        cur.execute('CREATE INDEX idx_elo_date    ON elo_ratings(date)')
        conn.commit()
        conn.close()
        self.log(f"✅ DB initialisiert: {db_path}")

    def parse_tennis_abstract(self, gender, url):
        self.log(f"\n🌐 Lade {gender.upper()} von {url} ...")
        try:
            r = requests.get(url, headers={'User-Agent': self.USER_AGENT}, timeout=30)
            r.raise_for_status()
            self.log(f"   ✅ Seite geladen ({len(r.text):,} Zeichen)")
        except Exception as e:
            self.log(f"   ❌ {e}")
            _log_traceback("[Elo] Fehler beim Laden")
            return []
        soup = BeautifulSoup(r.text, 'html.parser')
        table = soup.find('table', {'id': 'reportable'})
        if not table:
            self.log("   ❌ Tabelle 'reportable' nicht gefunden")
            return []
        rows = table.find_all('tr')
        self.log(f"   📄 {len(rows)} Zeilen gefunden")
        players = []
        errors = 0
        for i, row in enumerate(rows[1:], 1):
            if not self.is_running:
                self.log("   ⏹ Abgebrochen")
                return players
            cells = row.find_all('td')
            if len(cells) < 11:
                continue
            try:
                link = cells[1].find('a')
                name = (self.clean_player_name(link.get_text(strip=True))
                        if link else
                        self.clean_player_name(cells[1].get_text(strip=True)))
                if not name or name in ('Player', 'Age'):
                    continue
                elo       = self.clean_elo_value(cells[3].get_text(strip=True))
                elo_hard  = self.clean_elo_value(cells[6].get_text(strip=True))
                elo_clay  = self.clean_elo_value(cells[8].get_text(strip=True))
                elo_grass = self.clean_elo_value(cells[10].get_text(strip=True))
                if elo < 1000 or elo > 3000:
                    continue
                players.append({
                    'player_name': name, 'elo': elo,
                    'elo_hard': elo_hard, 'elo_clay': elo_clay, 'elo_grass': elo_grass,
                })
                if i % 100 == 0:
                    self.log(f"   {i} Spieler geparst ...")
            except Exception as e:
                errors += 1
                if errors < 5:
                    self.log(f"   ⚠️ Fehler Zeile {i}: {e}")
        self.log(f"   ✅ {len(players)} Spieler geparst ({gender.upper()})")
        if errors:
            self.log(f"   ⚠️ {errors} Zeilen übersprungen")
        return players

    def save_to_database(self, db_path, players_atp, players_wta, current_date):
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        records = []
        for gender, players in (('ATP', players_atp), ('WTA', players_wta)):
            if not players:
                continue
            self.log(f"\n💾 Verarbeite {gender}-Spieler ({len(players)}) ...")
            for idx, p in enumerate(players, 1):
                total, wins, losses = self.get_match_stats_from_db(
                    p['player_name'], 'atp' if gender == 'ATP' else 'wta')
                if idx % 50 == 0:
                    self.log(f"   {idx}/{len(players)} {gender} verarbeitet ...")
                for surface, elo in [
                    ('Rolling_Gesamt', p['elo']),
                    ('Rolling_Hard',   p['elo_hard']),
                    ('Rolling_Clay',   p['elo_clay']),
                    ('Rolling_Grass',  p['elo_grass']),
                ]:
                    records.append((
                        p['player_name'], elo, surface, current_date,
                        total, wins, losses, 1.0,
                        0, 0, 0, 0, 0, 0,
                        50, '⚖️ Neutral', 0, '⚖️ Neutral',
                        p['elo_hard'], p['elo_clay'], p['elo_grass'],
                        1.0, 1.0, 1.0, 1.0,
                    ))
        cur.executemany('''
            INSERT OR REPLACE INTO elo_ratings (
                player_name, elo, surface, date, matches_played, wins, losses,
                weight_factor, matches_hard, matches_clay, matches_grass,
                wins_hard, wins_clay, wins_grass, recent_form, recent_form_status,
                momentum_streak, momentum_status, elo_hard, elo_clay, elo_grass,
                form_factor, fatigue_factor, serve_factor, experience_factor
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', records)
        conn.commit()
        conn.close()
        self.log(f"\n✅ {len(records):,} Einträge gespeichert")

    def test_database(self, db_path):
        self.log("\n" + "=" * 56)
        self.log("📊 Test: Top 10 (Gesamt-ELO)")
        self.log("=" * 56)
        if not os.path.exists(db_path):
            self.log("❌ DB nicht gefunden")
            return
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute('''
            SELECT player_name, elo, matches_played, wins, losses
            FROM elo_ratings WHERE surface='Rolling_Gesamt'
            ORDER BY elo DESC LIMIT 10
        ''')
        self.log(f"   {'#':>2}  {'Name':<30} {'ELO':>6}  {'M':>5}  {'W':>5}  {'L':>5}")
        for i, (name, elo, m, w, l) in enumerate(cur.fetchall(), 1):
            self.log(f"   {i:2}. {name[:30]:30} {elo:>6}  {m:>5}  {w:>5}  {l:>5}")
        for name in ['Jannik Sinner', 'Iga Swiatek', 'Coco Gauff', 'Alexander Zverev']:
            cur.execute('''SELECT surface, elo, matches_played, wins, losses
                           FROM elo_ratings WHERE player_name LIKE ?''',
                        (f'%{name}%',))
            res = cur.fetchall()
            if res:
                self.log(f"\n{name}:")
                for surface, elo, m, w, l in res:
                    self.log(f"   {surface:20} ELO={elo:>5}  Matches={m}  W/L={w}/{l}")
        cur.execute('SELECT COUNT(*) FROM elo_ratings')
        self.log(f"\n📦 Gesamt: {cur.fetchone()[0]:,} Einträge")
        conn.close()

    def start_update(self):
        if self.is_running:
            return
        elo_path = self.elo_path_var.get().strip()
        if not elo_path:
            messagebox.showerror("Fehler", "Bitte Ziel-Pfad für elo_ratings.db wählen")
            return
        out_dir = os.path.dirname(elo_path)
        if out_dir:
            try:
                os.makedirs(out_dir, exist_ok=True)
            except Exception as e:
                messagebox.showerror("Fehler", f"Konnte Ordner nicht erstellen: {e}")
                return
        self.is_running = True
        self.btn_start.config(state='disabled')
        self.btn_stop.config(state='normal')
        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete(1.0, tk.END)
        self.log_text.config(state=tk.DISABLED)
        self.progress_bar['value'] = 0
        threading.Thread(target=self._worker, daemon=True).start()

    def _worker(self):
        try:
            self.run_update()
        except Exception as e:
            self.log(f"❌ Fehler: {e}")
            _log_traceback("[Elo] Fehler in _worker")
            messagebox.showerror("Fehler", str(e))
        finally:
            self.is_running = False
            self.btn_start.config(state='normal')
            self.btn_stop.config(state='disabled')
            self._refresh_path_status()

    def run_update(self):
        db_path = self.elo_path_var.get().strip()
        self.log("=" * 56)
        self.log("⚡ TENNIS ELO SCRAPER – Update")
        self.log("=" * 56)
        self.log(f"💾 Ziel-DB:  {db_path}")
        self.log(f"🎾 ATP-DB:   {self.atp_path_var.get()}")
        self.log(f"👑 WTA-DB:   {self.wta_path_var.get()}")

        current_date = datetime.now().strftime('%Y%m%d')
        self.log(f"📅 Speicherdatum: {current_date}")

        self.set_progress(5, "Initialisiere DB...")
        self.init_database(db_path)

        players_atp, players_wta = [], []
        for gender, url in self.URLS.items():
            if not self.is_running:
                self.log("⏹ Abgebrochen.")
                return
            players = self.parse_tennis_abstract(gender, url)
            if gender == 'atp':
                players_atp = players
                self.log(f"✅ ATP: {len(players)} Spieler")
            else:
                players_wta = players
                self.log(f"✅ WTA: {len(players)} Spieler")

        self.set_progress(60, "Speichere ELOs...")
        if players_atp or players_wta:
            self.save_to_database(db_path, players_atp, players_wta, current_date)
            self.set_progress(95, "Teste DB...")
            self.test_database(db_path)
        else:
            self.log("❌ Keine Daten verarbeitet.")

        self.set_progress(100, "✅ Fertig")
        self.log("\n" + "=" * 56)
        self.log("✅ Scraper abgeschlossen!")
        self.log(f"💾 DB: {db_path}")
        self.log("=" * 56)
        messagebox.showinfo("Fertig", "ELO-Update abgeschlossen!")


# ============================================================
# MODUL 4: MATCHES KONVERTER (Singles + Doppel)
# ============================================================

class MatchesModule:
    def __init__(self, parent, app):
        self.parent = parent
        self.app = app
        self.is_running = False
        self.input_paths = []
        self._build_ui()
        self._refresh_db_counts()

    def _build_ui(self):
        root = tk.Frame(self.parent, bg=Theme.BG)
        root.pack(fill=tk.BOTH, expand=True, padx=30, pady=25)

        header = tk.Frame(root, bg=Theme.BG)
        header.pack(fill=tk.X, pady=(0, 20))
        tk.Label(header, text="🎾  Matches Konverter",
                 font=(Theme.FONT, 22, "bold"),
                 fg=Theme.TEXT, bg=Theme.BG).pack(anchor='w')
        tk.Label(header, text="Mehrere Match-Dateien zu einer Match-DB zusammenführen "
                              "(Singles → matches, Doppel → doubles, automatisch erkannt)",
                 font=(Theme.FONT, 11),
                 fg=Theme.TEXT_DIM, bg=Theme.BG).pack(anchor='w', pady=(2, 0))

        c1, b1 = make_card(root, title="Eingabe-Dateien (Mehrfachauswahl)", icon="📂")
        c1.pack(fill=tk.X, pady=(0, 12))

        row1 = tk.Frame(b1, bg=Theme.BG_CARD)
        row1.pack(fill=tk.X, pady=(0, 8))
        tk.Label(row1, text="Format:", font=(Theme.FONT, 10),
                 fg=Theme.TEXT_DIM, bg=Theme.BG_CARD).pack(side=tk.LEFT, padx=(0, 8))
        self.in_format_var = tk.StringVar(value="CSV")
        cb1 = make_combobox(row1, self.in_format_var, FORMATS_INPUT, width=14)
        cb1.pack(side=tk.LEFT, padx=(0, 12))
        cb1.bind("<<ComboboxSelected>>", lambda e: self._on_input_format_change())

        make_button(row1, "Dateien wählen", self.select_input_files,
                    kind="secondary", icon="📄").pack(side=tk.LEFT, padx=(0, 6))
        make_button(row1, "Alle entfernen", self.clear_files,
                    kind="secondary", icon="🗑️").pack(side=tk.LEFT)

        list_frame = tk.Frame(b1, bg=Theme.BG_CARD)
        list_frame.pack(fill=tk.X, pady=(4, 0))
        self.file_listbox = tk.Listbox(
            list_frame, bg=Theme.BG_INPUT, fg=Theme.TEXT,
            font=(Theme.FONT_MONO, 9),
            selectbackground=Theme.GREEN_DARK, selectforeground="#ffffff",
            relief=tk.FLAT, bd=0,
            highlightthickness=1,
            highlightbackground=Theme.BORDER,
            height=6, activestyle='none')
        self.file_listbox.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=4)
        scroll = tk.Scrollbar(list_frame, orient=tk.VERTICAL,
                              command=self.file_listbox.yview)
        scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.file_listbox.config(yscrollcommand=scroll.set)

        self.file_count_label = tk.Label(b1, text="Keine Dateien gewählt",
                                         font=(Theme.FONT, 9),
                                         fg=Theme.TEXT_MUTED, bg=Theme.BG_CARD, anchor='w')
        self.file_count_label.pack(fill=tk.X, pady=(6, 0))

        c2, b2 = make_card(root, title="Ausgabe", icon="💾")
        c2.pack(fill=tk.X, pady=(0, 12))

        row2 = tk.Frame(b2, bg=Theme.BG_CARD)
        row2.pack(fill=tk.X, pady=(0, 8))
        tk.Label(row2, text="Format:", font=(Theme.FONT, 10),
                 fg=Theme.TEXT_DIM, bg=Theme.BG_CARD).pack(side=tk.LEFT, padx=(0, 8))
        self.out_format_var = tk.StringVar(value="SQLite (.db)")
        cb2 = make_combobox(row2, self.out_format_var, FORMATS_OUTPUT, width=14)
        cb2.pack(side=tk.LEFT, padx=(0, 12))
        cb2.bind("<<ComboboxSelected>>", lambda e: self._on_output_format_change())

        self.out_path_var = tk.StringVar(
            value=os.path.join(SPIELER_DIR, "atp_matches.db"))
        make_entry(row2, self.out_path_var).pack(
            side=tk.LEFT, fill=tk.X, expand=True, ipady=8, padx=(0, 10))
        make_button(row2, "Ordner", self.select_out_folder,
                    kind="secondary", icon="📂").pack(side=tk.LEFT, padx=(0, 6))
        make_button(row2, "Ziel wählen", self.select_out_file,
                    kind="secondary", icon="💾").pack(side=tk.LEFT)

        row3 = tk.Frame(b2, bg=Theme.BG_CARD)
        row3.pack(fill=tk.X, pady=(8, 0))
        tk.Label(row3, text="Modus:", font=(Theme.FONT, 10, "bold"),
                 fg=Theme.TEXT_DIM, bg=Theme.BG_CARD).pack(side=tk.LEFT, padx=(0, 8))
        self.mode_var = tk.StringVar(value="overwrite")
        tk.Radiobutton(row3, text="🔨 Überschreiben (DB neu erstellen)",
                       variable=self.mode_var, value="overwrite",
                       font=(Theme.FONT, 10),
                       fg=Theme.TEXT, bg=Theme.BG_CARD, selectcolor=Theme.BG_INPUT,
                       activebackground=Theme.BG_CARD, activeforeground=Theme.GREEN,
                       cursor='hand2').pack(side=tk.LEFT, padx=(0, 20))
        tk.Radiobutton(row3, text="➕ Ergänzen (Duplikate werden ignoriert)",
                       variable=self.mode_var, value="append",
                       font=(Theme.FONT, 10),
                       fg=Theme.TEXT, bg=Theme.BG_CARD, selectcolor=Theme.BG_INPUT,
                       activebackground=Theme.BG_CARD, activeforeground=Theme.GREEN,
                       cursor='hand2').pack(side=tk.LEFT)

        c_info, b_info = make_card(root, title="Aktuelle Zieldatei", icon="📊")
        c_info.pack(fill=tk.X, pady=(0, 12))
        info_row = tk.Frame(b_info, bg=Theme.BG_CARD)
        info_row.pack(fill=tk.X)
        self.db_info_label = tk.Label(info_row, text="—",
                                      font=(Theme.FONT_MONO, 10),
                                      fg=Theme.TEXT_DIM, bg=Theme.BG_CARD, anchor='w')
        self.db_info_label.pack(side=tk.LEFT, fill=tk.X, expand=True)
        make_button(info_row, "Aktualisieren", self._refresh_db_counts,
                    kind="secondary", icon="🔄").pack(side=tk.RIGHT)

        c4, b4 = make_card(root, title="Aktionen", icon="⚡")
        c4.pack(fill=tk.X, pady=(0, 12))
        row4 = tk.Frame(b4, bg=Theme.BG_CARD)
        row4.pack(fill=tk.X, pady=(0, 10))
        self.btn_build = make_button(row4, "Konvertieren", self.start_build,
                                     kind="primary", icon="🚀")
        self.btn_build.pack(side=tk.LEFT, padx=(0, 10))
        self.btn_build.config(state='disabled')
        make_button(row4, "Ordner öffnen", self.open_out_folder,
                    kind="secondary", icon="📂").pack(side=tk.LEFT)

        self.progress_bar = ttk.Progressbar(b4, orient=tk.HORIZONTAL, mode='determinate',
                                            style="Modern.Horizontal.TProgressbar")
        self.progress_bar.pack(fill=tk.X, pady=(6, 6))
        self.progress_label = tk.Label(b4, text="Bereit",
                                       font=(Theme.FONT, 10),
                                       fg=Theme.TEXT_DIM, bg=Theme.BG_CARD)
        self.progress_label.pack(anchor='w')

        c5, b5 = make_card(root, title="Log", icon="📋")
        c5.pack(fill=tk.BOTH, expand=True)
        self.log_text = make_log(b5, height=12)
        self.log_text.pack(fill=tk.BOTH, expand=True)
        self.log_text.insert(tk.END, "✅ Bereit – Dateien wählen\n")
        self.log_text.config(state=tk.DISABLED)

    def log(self, msg):
        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, msg + "\n")
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)
        _log_to_file(f"[Matches] {msg}")
        self.parent.update()

    def _refresh_db_counts(self):
        try:
            path = self.out_path_var.get().strip()
            m, d = get_table_counts(path)
            if not os.path.exists(path):
                self.db_info_label.config(
                    text=f"❌ Datei existiert noch nicht: {path}",
                    fg=Theme.TEXT_MUTED)
            else:
                size = os.path.getsize(path) / 1024 / 1024
                total = m + d
                self.db_info_label.config(
                    text=f"📁 {os.path.basename(path)}  ({size:.1f} MB)  |  "
                         f"matches: {m:,}  |  doubles: {d:,}  |  Gesamt: {total:,}",
                    fg=Theme.TEXT)
        except Exception as e:
            _log_traceback("[Matches] Fehler in _refresh_db_counts")
            self.db_info_label.config(text=f"❌ Fehler: {e}", fg=Theme.RED)

    def _input_ext(self):
        key = fmt_key(self.in_format_var.get())
        return {"csv": (".csv",), "json": (".json",),
                "excel": (".xlsx", ".xls"),
                "sqlite": (".db", ".sqlite", ".sqlite3")}.get(key, ("*.*",))

    def _output_ext(self):
        key = fmt_key(self.out_format_var.get())
        return {"sqlite": ".db", "json": ".json",
                "csv": ".csv", "excel": ".xlsx"}.get(key, "")

    def _on_input_format_change(self):
        self.clear_files()

    def _on_output_format_change(self):
        cur = self.out_path_var.get()
        base = os.path.splitext(cur)[0] or os.path.join(SPIELER_DIR, "matches")
        ext = self._output_ext()
        if ext:
            self.out_path_var.set(base + ext)
        self._refresh_db_counts()

    def _refresh_file_list(self):
        self.file_listbox.delete(0, tk.END)
        for p in self.input_paths:
            self.file_listbox.insert(tk.END, p)
        n = len(self.input_paths)
        self.file_count_label.config(
            text=f"{n} Datei(en) gewählt" if n else "Keine Dateien gewählt")
        self.btn_build.config(state='normal' if n else 'disabled')

    def select_input_files(self):
        exts = self._input_ext()
        paths = filedialog.askopenfilenames(
            title="Match-Dateien auswählen (Mehrfachauswahl möglich)",
            filetypes=[("Passende Dateien", " ".join(f"*{e}" for e in exts)),
                       ("Alle Dateien", "*.*")])
        if not paths:
            return
        added = 0
        for p in paths:
            if p not in self.input_paths:
                self.input_paths.append(p)
                added += 1
        self._refresh_file_list()
        self.log(f"📄 {added} neue Datei(en) hinzugefügt (gesamt: {len(self.input_paths)})")

    def clear_files(self):
        self.input_paths = []
        self._refresh_file_list()
        self.log("🗑️ Dateiliste geleert")

    def select_out_folder(self):
        p = filedialog.askdirectory(title="Ziel-Ordner wählen")
        if p:
            cur = os.path.basename(self.out_path_var.get()) or "matches.db"
            self.out_path_var.set(os.path.join(p, cur))
            self.log(f"📁 Zielordner: {p}")
            self._refresh_db_counts()

    def select_out_file(self):
        ext = self._output_ext()
        p = filedialog.asksaveasfilename(
            title="Ziel-Datei festlegen",
            defaultextension=ext,
            initialfile=os.path.basename(self.out_path_var.get()) or f"matches{ext}",
            filetypes=[("Passende Dateien", f"*{ext}" if ext else "*.*"),
                       ("Alle Dateien", "*.*")])
        if p:
            self.out_path_var.set(p)
            self.log(f"💾 Ziel: {p}")
            self._refresh_db_counts()

    def open_out_folder(self):
        folder = os.path.dirname(self.out_path_var.get())
        if os.path.exists(folder):
            os.startfile(folder)
        else:
            messagebox.showerror("Fehler", "Ordner existiert nicht")

    def start_build(self):
        if self.is_running:
            return
        if not self.input_paths:
            messagebox.showerror("Fehler", "Bitte mindestens eine Eingabedatei wählen")
            return
        out_path = self.out_path_var.get().strip()
        if not out_path:
            messagebox.showerror("Fehler", "Bitte Zielpfad angeben")
            return
        out_dir = os.path.dirname(out_path)
        if out_dir:
            os.makedirs(out_dir, exist_ok=True)

        in_key = fmt_key(self.in_format_var.get())
        out_key = fmt_key(self.out_format_var.get())
        mode = self.mode_var.get()

        self.is_running = True
        self.btn_build.config(state='disabled')
        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete(1.0, tk.END)
        self.log_text.config(state=tk.DISABLED)
        self.progress_bar['value'] = 0
        threading.Thread(target=self._worker,
                         args=(list(self.input_paths), in_key, out_path, out_key, mode),
                         daemon=True).start()

    def _worker(self, in_paths, in_key, out_path, out_key, mode):
        try:
            self.log("=" * 56)
            self.log("🚀 Match-Konvertierung gestartet")
            self.log("=" * 56)
            self.log(f"📄 Eingabe:  {len(in_paths)} Datei(en)  ({in_key})")
            self.log(f"💾 Ausgabe:  {out_path}  ({out_key})")
            self.log(f"🔀 Modus:    {mode}")

            singles_rows = []
            doubles_rows = []
            total_files = len(in_paths)
            error_files = []

            for i, p in enumerate(in_paths, 1):
                if not self.is_running:
                    self.log("⏹ Abgebrochen.")
                    return
                pct = int((i - 1) / total_files * 60)
                self.progress_bar['value'] = pct
                self.progress_label.config(text=f"📖 Lese {i}/{total_files}: {os.path.basename(p)}")
                self.parent.update()

                try:
                    key = fmt_key(self.in_format_var.get())
                    if key == "csv":
                        raw, schema = read_matches_csv(p)
                    elif key == "json":
                        raw, schema = read_matches_json(p)
                    elif key == "excel":
                        raw, schema = read_matches_excel(p)
                    elif key == "sqlite":
                        pairs = read_matches_sqlite(p)
                        for rws, sc in pairs:
                            if sc == "singles":
                                singles_rows.extend(normalize_match_rows_singles(rws))
                            else:
                                doubles_rows.extend(normalize_match_rows_doubles(rws))
                            self.log(f"   📥 {os.path.basename(p)} ({sc}) → {len(rws):,} Zeilen")
                        continue
                    else:
                        raise ValueError(f"Unbekanntes Format: {key}")

                    if schema == "singles":
                        norm = normalize_match_rows_singles(raw)
                        singles_rows.extend(norm)
                        self.log(f"   📥 {os.path.basename(p)} (Singles) → {len(raw):,} Zeilen")
                    else:
                        norm = normalize_match_rows_doubles(raw)
                        doubles_rows.extend(norm)
                        self.log(f"   📥 {os.path.basename(p)} (Doppel)  → {len(raw):,} Zeilen")

                except Exception as e:
                    self.log(f"   ❌ {os.path.basename(p)}: {e}")
                    _log_traceback(f"[Matches] Fehler beim Lesen {p}")
                    error_files.append(os.path.basename(p))

            if not singles_rows and not doubles_rows:
                self.log("❌ Keine Daten gelesen – Abbruch.")
                return

            self.progress_bar['value'] = 70
            self.progress_label.config(text="💾 Schreibe Ausgabe...")
            self.parent.update()

            base_db = out_path
            if fmt_key(out_key) != "sqlite":
                base_db = os.path.splitext(out_path)[0] + ".db"

            if singles_rows:
                total_singles = write_matches_sqlite_singles(singles_rows, base_db, mode=mode)
                self.log(f"✅ matches: {total_singles:,} Zeilen in DB")
            else:
                if not os.path.exists(base_db):
                    con = sqlite3.connect(base_db)
                    cur = con.cursor()
                    cur.execute(MATCHES_CREATE_SQL)
                    cur.execute(DOUBLES_CREATE_SQL)
                    con.commit()
                    con.close()
                    self.log("ℹ️  Leere DB mit beiden Tabellen angelegt")

            if doubles_rows:
                total_doubles = write_matches_sqlite_doubles(doubles_rows, base_db, mode=mode)
                self.log(f"✅ doubles: {total_doubles:,} Zeilen in DB")

            key_out = fmt_key(out_key)
            if key_out != "sqlite":
                base = os.path.splitext(out_path)[0]
                if key_out in ("csv", "alle") and singles_rows:
                    write_matches_csv(singles_rows, base + "_matches.csv", MATCH_COLUMNS)
                    self.log(f"✅ CSV: {os.path.basename(base)}_matches.csv")
                if key_out in ("csv", "alle") and doubles_rows:
                    write_matches_csv(doubles_rows, base + "_doubles.csv", DOUBLES_COLUMNS)
                    self.log(f"✅ CSV: {os.path.basename(base)}_doubles.csv")
                if key_out in ("json", "alle") and singles_rows:
                    write_matches_json(singles_rows, base + "_matches.json")
                    self.log(f"✅ JSON: {os.path.basename(base)}_matches.json")
                if key_out in ("json", "alle") and doubles_rows:
                    write_matches_json(doubles_rows, base + "_doubles.json")
                    self.log(f"✅ JSON: {os.path.basename(base)}_doubles.json")
                if key_out in ("excel", "alle") and singles_rows:
                    write_matches_excel(singles_rows, base + "_matches.xlsx", MATCH_COLUMNS)
                    self.log(f"✅ Excel: {os.path.basename(base)}_matches.xlsx")
                if key_out in ("excel", "alle") and doubles_rows:
                    write_matches_excel(doubles_rows, base + "_doubles.xlsx", DOUBLES_COLUMNS)
                    self.log(f"✅ Excel: {os.path.basename(base)}_doubles.xlsx")

            m_count, d_count = get_table_counts(base_db)
            self.progress_bar['value'] = 100
            self.progress_label.config(text=f"✅ Fertig: {m_count + d_count:,} Zeilen gesamt")

            self.log("")
            self.log("=" * 56)
            self.log("📊 IMPORT-ZUSAMMENFASSUNG")
            self.log("=" * 56)
            self.log(f"   matches:  {m_count:>12,} Zeilen")
            self.log(f"   doubles:  {d_count:>12,} Zeilen")
            self.log(f"   ─────────────────────────")
            self.log(f"   Gesamt:   {m_count + d_count:>12,} Zeilen")
            self.log("=" * 56)
            if error_files:
                self.log(f"⚠️ {len(error_files)} Datei(en) fehlerhaft:")
                for f in error_files[:10]:
                    self.log(f"   - {f}")
            self._refresh_db_counts()

            messagebox.showinfo("Fertig",
                                f"Konvertierung abgeschlossen!\n\n"
                                f"matches: {m_count:,}\n"
                                f"doubles: {d_count:,}\n"
                                f"Gesamt:  {m_count + d_count:,}")
        except Exception as e:
            self.log(f"❌ Fehler: {e}")
            _log_traceback("[Matches] Fehler in _worker")
            messagebox.showerror("Fehler", str(e))
        finally:
            self.is_running = False
            self.btn_build.config(state='normal')


# ============================================================
# MODUL 5: TML-CONVERTER
# ============================================================

_DEBUG_ACTIVE = False

_DEBUG_TARGET_KEYS = [
    ('2026-339', '20260104', 'R32', 'Frances Tiafoe', 'Aleksandar Vukic'),
    ('2026-0339', '20260104', 'R32', 'Frances Tiafoe', 'Aleksandar Vukic'),
    ('2026-580', '20260118', 'R128', 'Carlos Alcaraz', 'Adam Walton'),
    ('2026-0580', '20260118', 'R128', 'Carlos Alcaraz', 'Adam Walton'),
]

TML_LOG_FILE = os.path.join(SCRIPT_DIR, "mylife_converter.log")
TML_EXCEPTIONS_FILE = os.path.join(SCRIPT_DIR, "bindestrich_ausnahmen.json")

TML_DEFAULT_ATP_DB = os.path.join(SPIELER_DIR, "atp_matches.db")
TML_DEFAULT_WTA_DB = os.path.join(SPIELER_DIR, "wta_matches.db")
TML_DEFAULT_ATP_PLAYERS_DB = os.path.join(SPIELER_DIR, "atp_players.db")
TML_DEFAULT_WTA_PLAYERS_DB = os.path.join(SPIELER_DIR, "wta_players.db")


def tml_log_to_file(msg):
    try:
        with open(TML_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass


def tml_clean_name(name, remove_dash=True, remove_double_space=True,
                   exceptions=None):
    if not name:
        return name
    s = name.strip()

    if exceptions:
        normalized_check = re.sub(r'\s+', ' ', s.lower().replace('-', ' ')).strip()
        for exc in exceptions:
            exc_norm = re.sub(r'\s+', ' ', exc.lower().replace('-', ' ')).strip()
            if normalized_check == exc_norm:
                return s

    if remove_dash:
        s = s.replace('-', ' ')
    if remove_double_space:
        s = re.sub(r'\s+', ' ', s)
    return s.strip()


TML_MATCH_COLUMNS = [
    "tourney_id", "tourney_name", "surface", "draw_size", "tourney_level",
    "tourney_date", "match_num",
    "winner_id", "winner_seed", "winner_entry", "winner_name", "winner_hand",
    "winner_ht", "winner_ioc", "winner_age",
    "loser_id", "loser_seed", "loser_entry", "loser_name", "loser_hand",
    "loser_ht", "loser_ioc", "loser_age",
    "score", "best_of", "round", "minutes",
    "w_ace", "w_df", "w_svpt", "w_1stIn", "w_1stWon", "w_2ndWon",
    "w_SvGms", "w_bpSaved", "w_bpFaced",
    "l_ace", "l_df", "l_svpt", "l_1stIn", "l_1stWon", "l_2ndWon",
    "l_SvGms", "l_bpSaved", "l_bpFaced",
    "winner_rank", "winner_rank_points",
    "loser_rank", "loser_rank_points",
]

TML_MATCH_INT_COLS = {
    "draw_size", "tourney_date", "match_num",
    "winner_id", "winner_ht", "winner_rank", "winner_rank_points",
    "loser_id", "loser_ht", "loser_rank", "loser_rank_points",
    "best_of", "minutes",
    "w_ace", "w_df", "w_svpt", "w_1stIn", "w_1stWon", "w_2ndWon",
    "w_SvGms", "w_bpSaved", "w_bpFaced",
    "l_ace", "l_df", "l_svpt", "l_1stIn", "l_1stWon", "l_2ndWon",
    "l_SvGms", "l_bpSaved", "l_bpFaced",
}

TML_MATCH_REAL_COLS = {"winner_age", "loser_age"}


def tml_parse_int(val):
    if val is None:
        return None
    s = str(val).strip()
    if s == "" or s.lower() in ("nan", "none"):
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def tml_parse_float(val):
    if val is None:
        return None
    s = str(val).strip()
    if s == "" or s.lower() in ("nan", "none"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def tml_clean_str(val):
    if val is None:
        return None
    s = str(val).strip()
    if s == "" or s.lower() in ("nan", "none"):
        return None
    return s


def read_tml_csv(path):
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        for r in reader:
            rows.append(r)
    return rows, fieldnames


def normalize_tml_row(raw, remove_dash=True, remove_double_space=True,
                      exceptions=None):
    out = {}
    for col in TML_MATCH_COLUMNS:
        if col in TML_MATCH_INT_COLS:
            out[col] = tml_parse_int(raw.get(col))
        elif col in TML_MATCH_REAL_COLS:
            out[col] = tml_parse_float(raw.get(col))
        else:
            v = tml_clean_str(raw.get(col))
            if col in ("winner_name", "loser_name") and v:
                v = tml_clean_name(v,
                                   remove_dash=remove_dash,
                                   remove_double_space=remove_double_space,
                                   exceptions=exceptions)
            out[col] = v
    return out


def tml_normalize_tid(tid):
    if tid is None:
        return None
    s = str(tid).strip()
    m = re.match(r'^(\d{4})-(\d+)$', s)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):04d}"
    return s


def tml_tid_variants(tid):
    if tid is None:
        return set()
    s = str(tid).strip()
    m = re.match(r'^(\d{4})-(\d+)$', s)
    if not m:
        return {s}
    year = m.group(1)
    num = int(m.group(2))
    return {
        s,
        f"{year}-{num:04d}",
        f"{year}-{num}",
    }


TML_KEY_MODE_PRIMARY  = "primary"
TML_KEY_MODE_FALLBACK = "fallback"
TML_KEY_MODE_LEGACY   = "legacy"


def _tml_s(v):
    if v is None:
        return None
    s = str(v).strip()
    return s if s != "" else None


def tml_make_match_keys(row):
    keys = []
    tid_set = tml_tid_variants(row.get("tourney_id"))
    wn  = _tml_s(row.get("winner_name"))
    ln  = _tml_s(row.get("loser_name"))
    td  = _tml_s(row.get("tourney_date"))
    rnd = _tml_s(row.get("round"))

    if td is not None and rnd is not None and wn is not None and ln is not None:
        for tid in tid_set:
            keys.append((TML_KEY_MODE_PRIMARY, (tid, td, rnd, wn, ln)))
    if td is not None and rnd is not None and wn is not None and ln is not None:
        keys.append((TML_KEY_MODE_FALLBACK, (td, rnd, wn, ln)))
    if td is not None and wn is not None and ln is not None:
        keys.append((TML_KEY_MODE_LEGACY, (td, wn, ln)))
    return keys


def tml_row_matches_any_key(row, existing_sets, logger=None):
    keys = tml_make_match_keys(row)

    if _DEBUG_ACTIVE and logger:
        for mode, key in keys:
            if key in _DEBUG_TARGET_KEYS:
                logger(f"      🔎 DEBUG: TARGET-Match gefunden in CSV:")
                logger(f"         Mode: {mode}")
                logger(f"         Key:  {key}")
                logger(f"         Im Set? {key in existing_sets[mode]}")
                logger(f"         Set-Größe: {len(existing_sets[mode]):,}")

    for mode, key in keys:
        if key in existing_sets[mode]:
            return True, mode
    return False, None


def tml_register_row_in_sets(row, existing_sets, logger=None):
    keys = tml_make_match_keys(row)
    for mode, key in keys:
        existing_sets[mode].add(key)
        if _DEBUG_ACTIVE and logger and key in _DEBUG_TARGET_KEYS:
            logger(f"      🔎 DEBUG: TARGET-Key registriert ({mode}):")
            logger(f"         {key}")


def tml_detect_tour_from_content(rows, atp_players_db, wta_players_db, log_func=None):
    def _log(msg):
        if log_func:
            log_func(msg)

    tourney_ids = [str(r.get("tourney_id", "")).strip() for r in rows if r.get("tourney_id")]
    tourney_ids = [t for t in tourney_ids if t]

    if tourney_ids:
        atp_votes = 0
        wta_votes = 0
        for tid in tourney_ids[:100]:
            m = re.search(r'-(\d+)$', tid)
            if not m:
                continue
            num = m.group(1)
            if len(num) >= 3:
                first = num.lstrip('0')[:1] if num.lstrip('0') else '0'
                if first == '1':
                    wta_votes += 1
                elif first in ('4', '5', '6'):
                    atp_votes += 1
        if atp_votes + wta_votes >= 3:
            _log(f"   🎯 Tourney-ID-Votes: ATP={atp_votes}, WTA={wta_votes}")
            if atp_votes > wta_votes * 2:
                return 'atp'
            if wta_votes > atp_votes * 2:
                return 'wta'

    _log(f"   🔍 Prüfe Spielernamen gegen Players-DBs ...")

    names_to_check = set()
    for r in rows[:200]:
        for col in ("winner_name", "loser_name"):
            n = r.get(col)
            if n:
                names_to_check.add(n.strip())
        if len(names_to_check) >= 50:
            break

    if not names_to_check:
        _log(f"   ⚠️ Keine Namen zum Prüfen gefunden")
        return 'unknown'

    def load_player_names(db_path):
        names = set()
        if not db_path or not os.path.exists(db_path):
            return names
        try:
            db = sqlite3.connect(db_path)
            cur = db.cursor()
            for row in cur.execute("SELECT name_first, name_last FROM players"):
                if row[0] and row[1]:
                    names.add(f"{row[0]} {row[1]}")
            db.close()
        except Exception:
            pass
        return names

    atp_names = load_player_names(atp_players_db)
    wta_names = load_player_names(wta_players_db)

    _log(f"   📚 ATP-Players: {len(atp_names):,} | WTA-Players: {len(wta_names):,}")

    atp_hits = 0
    wta_hits = 0
    atp_only_hits = []
    wta_only_hits = []

    for name in names_to_check:
        in_atp = name in atp_names
        in_wta = name in wta_names
        if in_atp:
            atp_hits += 1
        if in_wta:
            wta_hits += 1
        if in_atp and not in_wta:
            atp_only_hits.append(name)
        if in_wta and not in_atp:
            wta_only_hits.append(name)

    _log(f"   🎾 Spieler-Treffer: ATP={atp_hits}, WTA={wta_hits}")

    if atp_hits >= 3 and atp_hits > wta_hits * 1.5:
        if atp_only_hits:
            _log(f"      Beispiele nur-ATP: {atp_only_hits[:3]}")
        return 'atp'
    if wta_hits >= 3 and wta_hits > atp_hits * 1.5:
        if wta_only_hits:
            _log(f"      Beispiele nur-WTA: {wta_only_hits[:3]}")
        return 'wta'

    if atp_hits > 0 and wta_hits > 0:
        ratio = atp_hits / max(wta_hits, 1)
        if ratio > 2:
            return 'atp'
        if ratio < 0.5:
            return 'wta'
        return 'mixed'

    _log(f"   ⚠️ Keine klare Zuordnung möglich")
    return 'unknown'


def tml_get_table_columns(db_path, table="matches"):
    if not db_path or not os.path.exists(db_path):
        return set()
    try:
        db = sqlite3.connect(db_path)
        cur = db.cursor()
        cols = {row[1] for row in cur.execute(f"PRAGMA table_info({table})")}
        db.close()
        return cols
    except Exception:
        return set()


class TmlConverterModule:
    def __init__(self, parent, app):
        self.parent = parent
        self.app = app

        self.files = []
        self.is_running = False
        self.dry_run = tk.BooleanVar(value=True)

        self.opt_remove_dash = tk.BooleanVar(value=True)
        self.opt_remove_dbl = tk.BooleanVar(value=True)
        self.opt_auto_tour = tk.BooleanVar(value=True)

        self.atp_db = tk.StringVar(value=TML_DEFAULT_ATP_DB)
        self.wta_db = tk.StringVar(value=TML_DEFAULT_WTA_DB)
        self.atp_players = tk.StringVar(value=TML_DEFAULT_ATP_PLAYERS_DB)
        self.wta_players = tk.StringVar(value=TML_DEFAULT_WTA_PLAYERS_DB)

        self.exceptions = set()
        self._load_exceptions()

        self.live_current_file = tk.StringVar(value="—")
        self.live_status = tk.StringVar(value="Bereit")
        self.live_rows = tk.StringVar(value="—")
        self.live_new = tk.StringVar(value="—")
        self.live_dupes = tk.StringVar(value="—")
        self.live_renamed = tk.StringVar(value="—")
        self.live_tour = tk.StringVar(value="—")
        self.live_progress = tk.StringVar(value="Bereit")

        self._build_ui()
        self._refresh_file_list()
        self._refresh_db_info()

    def _build_ui(self):
        root = tk.Frame(self.parent, bg=Theme.BG)
        root.pack(fill=tk.BOTH, expand=True, padx=30, pady=25)

        header = tk.Frame(root, bg=Theme.BG)
        header.pack(fill=tk.X, pady=(0, 20))
        tk.Label(header, text="🎾  TennisMyLife Konverter",
                 font=(Theme.FONT, 22, "bold"),
                 fg=Theme.TEXT, bg=Theme.BG).pack(anchor='w')
        tk.Label(header,
                 text="Konvertiert TennisMyLife-CSVs ins Sackmann-Format",
                 font=(Theme.FONT, 11),
                 fg=Theme.TEXT_DIM, bg=Theme.BG).pack(anchor='w', pady=(2, 0))

        body = tk.Frame(root, bg=Theme.BG)
        body.pack(fill=tk.BOTH, expand=True)

        main = tk.Frame(body, bg=Theme.BG)
        main.pack(fill=tk.BOTH, expand=True)

        left_outer = tk.Frame(main, bg=Theme.BG)
        left_outer.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 12))

        left_canvas = tk.Canvas(left_outer, bg=Theme.BG, highlightthickness=0)
        left_scroll = tk.Scrollbar(left_outer, orient=tk.VERTICAL,
                                   command=left_canvas.yview)
        left_canvas.configure(yscrollcommand=left_scroll.set)

        left_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        left_scroll.pack(side=tk.RIGHT, fill=tk.Y)

        left = tk.Frame(left_canvas, bg=Theme.BG)
        left_window = left_canvas.create_window((0, 0), window=left, anchor='nw')

        def _on_left_conf(event):
            left_canvas.configure(scrollregion=left_canvas.bbox("all"))
        left.bind("<Configure>", _on_left_conf)

        def _on_canvas_conf(event):
            left_canvas.itemconfigure(left_window, width=event.width)
        left_canvas.bind("<Configure>", _on_canvas_conf)

        def _on_mousewheel(event):
            left_canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

        def _bind_mousewheel(_):
            left_canvas.bind_all("<MouseWheel>", _on_mousewheel)

        def _unbind_mousewheel(_):
            left_canvas.unbind_all("<MouseWheel>")

        left_canvas.bind("<Enter>", _bind_mousewheel)
        left_canvas.bind("<Leave>", _unbind_mousewheel)

        right = tk.Frame(main, bg=Theme.BG, width=440)
        right.pack(side=tk.RIGHT, fill=tk.BOTH)
        right.pack_propagate(False)

        c1, b1 = make_card(left, "1. Eingabedateien", icon="📂")
        c1.pack(fill=tk.X, pady=(0, 10))

        row1 = tk.Frame(b1, bg=Theme.BG_CARD)
        row1.pack(fill=tk.X, pady=(0, 8))
        make_button(row1, "Dateien wählen", self.select_files,
                    kind="secondary", icon="📄").pack(side=tk.LEFT, padx=(0, 6))
        make_button(row1, "Ordner scannen", self.select_folder,
                    kind="secondary", icon="📁").pack(side=tk.LEFT, padx=(0, 6))
        make_button(row1, "Auto-Scan", self.auto_scan,
                    kind="secondary", icon="🔍").pack(side=tk.LEFT, padx=(0, 6))
        make_button(row1, "Leeren", self.clear_files,
                    kind="secondary", icon="🗑️").pack(side=tk.LEFT)

        list_frame = tk.Frame(b1, bg=Theme.BG_CARD)
        list_frame.pack(fill=tk.X, pady=(4, 0))
        self.file_listbox = tk.Listbox(
            list_frame, bg=Theme.BG_INPUT, fg=Theme.TEXT,
            font=(Theme.FONT_MONO, 9),
            selectbackground=Theme.GREEN_DARK, selectforeground="#ffffff",
            relief=tk.FLAT, bd=0,
            highlightthickness=1,
            highlightbackground=Theme.BORDER,
            height=5, activestyle='none')
        self.file_listbox.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=4)
        scroll = tk.Scrollbar(list_frame, orient=tk.VERTICAL,
                              command=self.file_listbox.yview)
        scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.file_listbox.config(yscrollcommand=scroll.set)

        self.file_count_label = tk.Label(b1, text="Keine Dateien gewählt",
                                         font=(Theme.FONT, 9),
                                         fg=Theme.TEXT_MUTED, bg=Theme.BG_CARD, anchor='w')
        self.file_count_label.pack(fill=tk.X, pady=(6, 0))

        c2, b2 = make_card(left, "2. Ziel-Datenbanken", icon="🎯")
        c2.pack(fill=tk.X, pady=(0, 10))

        for label, var, which in [
            ("🎾 ATP-Match:", self.atp_db, 'atp'),
            ("👑 WTA-Match:", self.wta_db, 'wta'),
            ("🎾 ATP-Players:", self.atp_players, 'atp_players'),
            ("👑 WTA-Players:", self.wta_players, 'wta_players'),
        ]:
            row = tk.Frame(b2, bg=Theme.BG_CARD)
            row.pack(fill=tk.X, pady=(0, 4))
            tk.Label(row, text=label, font=(Theme.FONT, 10, "bold"),
                     fg=Theme.TEXT_DIM, bg=Theme.BG_CARD, width=15, anchor='w').pack(side=tk.LEFT)
            make_entry(row, var).pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=6, padx=(0, 6))
            make_button(row, "…", lambda w=which: self.pick_db(w),
                        kind="secondary").pack(side=tk.LEFT)

        c3, b3 = make_card(left, "3. Optionen", icon="⚙️")
        c3.pack(fill=tk.X, pady=(0, 10))

        tk.Checkbutton(b3, text="🔍 Auto-Tour-Erkennung (ATP/WTA anhand des Inhalts)",
                       variable=self.opt_auto_tour,
                       font=(Theme.FONT, 10, "bold"),
                       fg=Theme.BLUE, bg=Theme.BG_CARD,
                       selectcolor=Theme.BG_INPUT,
                       activebackground=Theme.BG_CARD, activeforeground=Theme.BLUE,
                       cursor='hand2').pack(anchor='w')

        tk.Checkbutton(b3, text="Bindestriche entfernen (Jo-Wilfried → Jo Wilfried)",
                       variable=self.opt_remove_dash,
                       font=(Theme.FONT, 10),
                       fg=Theme.TEXT, bg=Theme.BG_CARD,
                       selectcolor=Theme.BG_INPUT,
                       activebackground=Theme.BG_CARD, activeforeground=Theme.GREEN,
                       cursor='hand2').pack(anchor='w', pady=(4, 0))

        tk.Checkbutton(b3, text="Doppelte Leerzeichen entfernen",
                       variable=self.opt_remove_dbl,
                       font=(Theme.FONT, 10),
                       fg=Theme.TEXT, bg=Theme.BG_CARD,
                       selectcolor=Theme.BG_INPUT,
                       activebackground=Theme.BG_CARD, activeforeground=Theme.GREEN,
                       cursor='hand2').pack(anchor='w', pady=(4, 0))

        row_exc = tk.Frame(b3, bg=Theme.BG_CARD)
        row_exc.pack(fill=tk.X, pady=(6, 0))
        make_button(row_exc, "Ausnahmen", self.open_exceptions,
                    kind="secondary", icon="⚠️").pack(side=tk.LEFT)
        self.exc_label = tk.Label(row_exc, text="",
                                  font=(Theme.FONT, 9),
                                  fg=Theme.TEXT_MUTED, bg=Theme.BG_CARD, anchor='w')
        self.exc_label.pack(side=tk.LEFT, padx=(10, 0))
        self._refresh_exception_label()

        c4, b4 = make_card(left, "4. Modus & Aktionen", icon="⚡")
        c4.pack(fill=tk.X, pady=(0, 10))

        row_mod = tk.Frame(b4, bg=Theme.BG_CARD)
        row_mod.pack(fill=tk.X, pady=(0, 8))
        tk.Radiobutton(row_mod, text="🔍 Test-Modus (nur Vorschau)",
                       variable=self.dry_run, value=True,
                       font=(Theme.FONT, 10, "bold"),
                       fg=Theme.GREEN, bg=Theme.BG_CARD, selectcolor=Theme.BG_INPUT,
                       activebackground=Theme.BG_CARD, activeforeground=Theme.GREEN,
                       cursor='hand2').pack(side=tk.LEFT, padx=(0, 20))
        tk.Radiobutton(row_mod, text="⚡ ECHT-Modus (schreibt)",
                       variable=self.dry_run, value=False,
                       font=(Theme.FONT, 10, "bold"),
                       fg=Theme.RED, bg=Theme.BG_CARD, selectcolor=Theme.BG_INPUT,
                       activebackground=Theme.BG_CARD, activeforeground=Theme.RED,
                       cursor='hand2').pack(side=tk.LEFT)

        row_act = tk.Frame(b4, bg=Theme.BG_CARD)
        row_act.pack(fill=tk.X, pady=(6, 0))
        self.btn_start = make_button(row_act, "Konvertieren starten",
                                     self.start_convert, kind="primary", icon="🚀")
        self.btn_start.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 10))
        self.btn_start.config(state='disabled')
        make_button(row_act, "DB-Info", self._refresh_db_info,
                    kind="secondary", icon="🔄").pack(side=tk.LEFT)

        self.progress = ttk.Progressbar(b4, orient=tk.HORIZONTAL, mode='determinate',
                                        style="Modern.Horizontal.TProgressbar")
        self.progress.pack(fill=tk.X, pady=(10, 4))
        self.progress_label = tk.Label(b4, textvariable=self.live_progress,
                                       font=(Theme.FONT_MONO, 9),
                                       fg=Theme.TEXT_DIM, bg=Theme.BG_CARD, anchor='w')
        self.progress_label.pack(fill=tk.X)

        c_live, b_live = make_card(right, "Live-Status", icon="📺")
        c_live.pack(fill=tk.X, pady=(0, 10))

        def live_row(parent, label, var, color=Theme.TEXT, bold=False):
            row = tk.Frame(parent, bg=Theme.BG_CARD)
            row.pack(fill=tk.X, pady=2)
            tk.Label(row, text=label, font=(Theme.FONT, 10),
                     fg=Theme.TEXT_DIM, bg=Theme.BG_CARD, width=14, anchor='w').pack(side=tk.LEFT)
            tk.Label(row, textvariable=var,
                     font=(Theme.FONT, 11, "bold" if bold else "normal"),
                     fg=color, bg=Theme.BG_CARD, anchor='w').pack(side=tk.LEFT, fill=tk.X, expand=True)

        live_row(b_live, "Datei:", self.live_current_file, Theme.TEXT)
        live_row(b_live, "Tour:", self.live_tour, Theme.YELLOW)
        live_row(b_live, "Status:", self.live_status, Theme.GREEN, bold=True)
        live_row(b_live, "Zeilen gelesen:", self.live_rows, Theme.TEXT)
        live_row(b_live, "Neu:", self.live_new, Theme.GREEN, bold=True)
        live_row(b_live, "Duplikate:", self.live_dupes, Theme.TEXT_DIM)
        live_row(b_live, "Namen geändert:", self.live_renamed, Theme.BLUE)

        notebook = ttk.Notebook(right)
        notebook.pack(fill=tk.BOTH, expand=True)
        self.notebook = notebook

        tab_details = tk.Frame(notebook, bg=Theme.BG)
        notebook.add(tab_details, text="  📋 Details  ")

        cols = ("file", "tour", "rows", "new", "dupes", "renamed")
        self.detail_tree = ttk.Treeview(tab_details, columns=cols,
                                        show="headings", height=15)
        for c, w, anchor in [
            ("file", 120, 'w'),
            ("tour", 45, 'center'),
            ("rows", 60, 'e'),
            ("new", 55, 'e'),
            ("dupes", 55, 'e'),
            ("renamed", 65, 'e'),
        ]:
            self.detail_tree.heading(c, text=c.capitalize())
            self.detail_tree.column(c, width=w, anchor=anchor)
        self.detail_tree.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

        tab_summary = tk.Frame(notebook, bg=Theme.BG)
        notebook.add(tab_summary, text="  📊 Übersicht  ")
        self.summary_text = tk.Text(tab_summary, bg=Theme.BG_INPUT, fg=Theme.TEXT,
                                    font=(Theme.FONT_MONO, 9),
                                    relief=tk.FLAT, bd=0,
                                    highlightthickness=1,
                                    highlightbackground=Theme.BORDER,
                                    wrap=tk.WORD, padx=10, pady=10)
        self.summary_text.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)
        self.summary_text.insert(tk.END, "Noch kein Lauf durchgeführt.")
        self.summary_text.config(state=tk.DISABLED)

        tab_log = tk.Frame(notebook, bg=Theme.BG)
        notebook.add(tab_log, text="  📋 Log  ")
        self.log_text = make_log(tab_log, height=15)
        self.log_text.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)
        self.log_text.insert(tk.END, "✅ Bereit.\n")
        self.log_text.config(state=tk.DISABLED)

    def log(self, msg=""):
        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, msg + "\n")
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)
        tml_log_to_file(msg)
        self.parent.update_idletasks()

    def set_progress(self, val, text=None):
        self.progress['value'] = val
        if text:
            self.live_progress.set(text)
        self.parent.update_idletasks()

    def set_live(self, **kwargs):
        if "file" in kwargs: self.live_current_file.set(kwargs["file"])
        if "tour" in kwargs: self.live_tour.set(kwargs["tour"])
        if "status" in kwargs: self.live_status.set(kwargs["status"])
        if "rows" in kwargs: self.live_rows.set(kwargs["rows"])
        if "new" in kwargs: self.live_new.set(kwargs["new"])
        if "dupes" in kwargs: self.live_dupes.set(kwargs["dupes"])
        if "renamed" in kwargs: self.live_renamed.set(kwargs["renamed"])
        self.parent.update_idletasks()

    def _load_exceptions(self):
        if os.path.exists(TML_EXCEPTIONS_FILE):
            try:
                with open(TML_EXCEPTIONS_FILE, encoding="utf-8") as f:
                    data = json.load(f)
                self.exceptions = set(data.get("names", []))
            except Exception:
                self.exceptions = set()

    def _save_exceptions(self):
        try:
            with open(TML_EXCEPTIONS_FILE, "w", encoding="utf-8") as f:
                json.dump({"names": sorted(self.exceptions)}, f,
                          ensure_ascii=False, indent=2)
        except Exception:
            pass

    def _refresh_exception_label(self):
        if self.exceptions:
            self.exc_label.config(text=f"{len(self.exceptions)} Ausnahmen",
                                  fg=Theme.YELLOW)
        else:
            self.exc_label.config(text="Keine Ausnahmen", fg=Theme.TEXT_MUTED)

    def open_exceptions(self):
        win = tk.Toplevel(self.parent)
        win.title("Bindestrich-Ausnahmen")
        win.geometry("500x500")
        win.configure(bg=Theme.BG)

        tk.Label(win, text="Diese Namen behalten ihren Bindestrich:",
                 font=(Theme.FONT, 11, "bold"),
                 fg=Theme.TEXT, bg=Theme.BG).pack(anchor='w', padx=20, pady=(20, 10))
        tk.Label(win, text="(Eine pro Zeile. Beispiel: Jo-Wilfried Tsonga)",
                 font=(Theme.FONT, 9),
                 fg=Theme.TEXT_DIM, bg=Theme.BG).pack(anchor='w', padx=20, pady=(0, 10))

        txt = tk.Text(win, bg=Theme.BG_INPUT, fg=Theme.TEXT,
                      font=(Theme.FONT_MONO, 10),
                      relief=tk.FLAT, bd=0,
                      highlightthickness=1,
                      highlightbackground=Theme.BORDER,
                      padx=10, pady=10, height=15)
        txt.pack(fill=tk.BOTH, expand=True, padx=20, pady=(0, 10))
        txt.insert(tk.END, "\n".join(sorted(self.exceptions)))

        def save():
            lines = txt.get("1.0", tk.END).splitlines()
            names = set()
            for ln in lines:
                n = ln.strip()
                if n:
                    names.add(n)
            self.exceptions = names
            self._save_exceptions()
            self._refresh_exception_label()
            self.log(f"⚠️ Ausnahmen gespeichert: {len(names)} Namen")
            win.destroy()

        row = tk.Frame(win, bg=Theme.BG)
        row.pack(fill=tk.X, padx=20, pady=(0, 20))
        make_button(row, "Speichern", save, kind="primary", icon="💾").pack(side=tk.RIGHT, padx=(10, 0))
        make_button(row, "Abbrechen", win.destroy, kind="secondary", icon="✕").pack(side=tk.RIGHT)

    def _refresh_file_list(self):
        self.file_listbox.delete(0, tk.END)
        for p in self.files:
            self.file_listbox.insert(tk.END, p)
        n = len(self.files)
        self.file_count_label.config(
            text=f"{n} Datei(en) gewählt" if n else "Keine Dateien gewählt")
        self.btn_start.config(state='normal' if n else 'disabled')

    def _is_tennismylife_csv(self, path):
        try:
            with open(path, newline="", encoding="utf-8-sig") as f:
                reader = csv.reader(f)
                header = next(reader, [])
            h = set(x.strip() for x in header)
            return "indoor" in h and "tourney_level" in h and "winner_name" in h
        except Exception:
            return False

    def select_files(self):
        paths = filedialog.askopenfilenames(
            title="TennisMyLife-CSV(s) auswählen",
            filetypes=[("CSV", "*.csv"), ("Alle Dateien", "*.*")])
        if not paths:
            return
        added = 0
        for p in paths:
            if p not in self.files:
                self.files.append(p)
                added += 1
        self._refresh_file_list()
        self.log(f"📄 {added} Datei(en) hinzugefügt (gesamt: {len(self.files)})")

    def select_folder(self):
        folder = filedialog.askdirectory(title="Ordner mit TennisMyLife-CSVs wählen")
        if not folder:
            return
        found = 0
        for root, _, names in os.walk(folder):
            for n in names:
                if n.lower().endswith(".csv"):
                    p = os.path.join(root, n)
                    if p not in self.files and self._is_tennismylife_csv(p):
                        self.files.append(p)
                        found += 1
        self._refresh_file_list()
        self.log(f"📁 Ordner gescannt: {found} TennisMyLife-Datei(en) gefunden")

    def auto_scan(self):
        candidates = [
            os.path.join(os.path.expanduser("~"), "Downloads"),
            os.path.join(os.path.expanduser("~"), "Downloads", "tml"),
            os.path.join(os.path.expanduser("~"), "Downloads", "tml-data"),
        ]
        found = 0
        for folder in candidates:
            if not os.path.isdir(folder):
                continue
            for root, _, names in os.walk(folder):
                for n in names:
                    if n.lower().endswith(".csv"):
                        p = os.path.join(root, n)
                        if p not in self.files and self._is_tennismylife_csv(p):
                            self.files.append(p)
                            found += 1
        self._refresh_file_list()
        self.log(f"🔍 Auto-Scan: {found} Datei(en) gefunden")

    def clear_files(self):
        self.files = []
        self._refresh_file_list()
        self.log("🗑️ Dateiliste geleert")

    def pick_db(self, which):
        p = filedialog.askopenfilename(
            title="Datei wählen",
            filetypes=[("SQLite", "*.db"), ("Alle Dateien", "*.*")])
        if not p:
            return
        mapping = {
            'atp': self.atp_db,
            'wta': self.wta_db,
            'atp_players': self.atp_players,
            'wta_players': self.wta_players,
        }
        if which in mapping:
            mapping[which].set(p)
        self._refresh_db_info()

    def _refresh_db_info(self):
        for label, path, table in [
            ("ATP-Match", self.atp_db.get(), "matches"),
            ("WTA-Match", self.wta_db.get(), "matches"),
            ("ATP-Players", self.atp_players.get(), "players"),
            ("WTA-Players", self.wta_players.get(), "players"),
        ]:
            if os.path.exists(path):
                size = os.path.getsize(path) / 1024 / 1024
                try:
                    db = sqlite3.connect(path)
                    n = db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                    db.close()
                    self.log(f"📊 {label}: {n:,} Zeilen / {size:.1f} MB")
                except Exception as e:
                    self.log(f"⚠️ {label} Fehler: {e}")
            else:
                self.log(f"❌ {label} fehlt: {path}")

    def _classify_tour(self, path, rows):
        p = path.lower().replace("\\", "/")
        fname = os.path.basename(p)

        if "/wta/" in p or "/wta_" in p or fname.startswith("wta") or "_wta" in fname:
            return "wta", "Pfad/Name"
        if "/atp/" in p or "/atp_" in p or fname.startswith("atp") or "_atp" in fname:
            return "atp", "Pfad/Name"

        if self.opt_auto_tour.get():
            tour = tml_detect_tour_from_content(
                rows,
                self.atp_players.get(),
                self.wta_players.get(),
                log_func=self.log
            )
            if tour in ("atp", "wta"):
                return tour, "Inhalt"
            elif tour == "mixed":
                return "mixed", "Inhalt (gemischt)"

        return "unknown", "unklar"

    def start_convert(self):
        if self.is_running:
            return
        if not self.files:
            messagebox.showerror("Fehler", "Keine Dateien gewählt")
            return
        self.is_running = True
        self.btn_start.config(state='disabled')
        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete(1.0, tk.END)
        self.log_text.config(state=tk.DISABLED)
        self.progress['value'] = 0
        self.detail_tree.delete(*self.detail_tree.get_children())

        self.set_live(file="—", tour="—", status="Starte...",
                      rows="—", new="—", dupes="—", renamed="—")
        self.set_progress(0, "Starte...")

        self.notebook.select(0)

        threading.Thread(target=self._worker, daemon=True).start()

    def _worker(self):
        try:
            self.run_convert()
        except Exception as e:
            self.log(f"❌ Fehler: {e}")
            tml_log_to_file(traceback.format_exc())
            self.set_live(status=f"❌ Fehler: {e}")
            messagebox.showerror("Fehler", f"{e}\n\nDetails im Logfile")
        finally:
            self.is_running = False
            self.btn_start.config(state='normal')

    def _load_db_index(self, db_path, log_prefix="   "):
        existing_sets = {
            TML_KEY_MODE_PRIMARY:  set(),
            TML_KEY_MODE_FALLBACK: set(),
            TML_KEY_MODE_LEGACY:   set(),
        }

        stats = {
            "total": 0,
            "tid_3stellig": 0,
            "tid_4stellig": 0,
            "tid_sonstig": 0,
            "no_round": 0,
            "no_date": 0,
            "target_keys_found": 0,
        }

        if not os.path.exists(db_path):
            self.log(f"{log_prefix}⚠️ DB nicht gefunden: {db_path}")
            return existing_sets, 0, stats

        available_cols = tml_get_table_columns(db_path, "matches")
        wanted_cols = [
            "tourney_id", "tourney_date", "round",
            "winner_name", "loser_name",
        ]
        usable_cols = [c for c in wanted_cols if c in available_cols]

        if not usable_cols:
            self.log(f"{log_prefix}⚠️ Keine passenden Spalten in matches-Tabelle gefunden")
            return existing_sets, 0, stats

        select_sql = f"SELECT {', '.join(usable_cols)} FROM matches"

        try:
            db = sqlite3.connect(db_path)
            cur = db.cursor()
            for row in cur.execute(select_sql):
                rec = dict(zip(usable_cols, row))
                stats["total"] += 1

                tid_raw = _tml_s(rec.get("tourney_id"))
                td  = _tml_s(rec.get("tourney_date"))
                rnd = _tml_s(rec.get("round"))
                wn  = _tml_s(rec.get("winner_name"))
                ln  = _tml_s(rec.get("loser_name"))

                if tid_raw is not None:
                    if re.match(r'^\d{4}-\d{4}$', tid_raw):
                        stats["tid_4stellig"] += 1
                    elif re.match(r'^\d{4}-\d{1,3}$', tid_raw):
                        stats["tid_3stellig"] += 1
                    else:
                        stats["tid_sonstig"] += 1

                if rnd is None:
                    stats["no_round"] += 1
                if td is None:
                    stats["no_date"] += 1

                if td is not None and rnd is not None and wn is not None and ln is not None:
                    for tid_v in tml_tid_variants(tid_raw):
                        key = (tid_v, td, rnd, wn, ln)
                        existing_sets[TML_KEY_MODE_PRIMARY].add(key)
                        if _DEBUG_ACTIVE and key in _DEBUG_TARGET_KEYS:
                            stats["target_keys_found"] += 1
                            self.log(f"{log_prefix}🔎 DEBUG: TARGET-Key in DB ({TML_KEY_MODE_PRIMARY}):")
                            self.log(f"{log_prefix}   {key}")

                if td is not None and rnd is not None and wn is not None and ln is not None:
                    existing_sets[TML_KEY_MODE_FALLBACK].add((td, rnd, wn, ln))

                if td is not None and wn is not None and ln is not None:
                    existing_sets[TML_KEY_MODE_LEGACY].add((td, wn, ln))

            db.close()
        except Exception as e:
            self.log(f"{log_prefix}⚠️ Fehler beim Indexieren von {db_path}: {e}")
            return existing_sets, 0, stats

        return existing_sets, stats["total"], stats

    def run_convert(self):
        dry = self.dry_run.get()
        mode_label = "🔍 TEST-MODUS" if dry else "⚡ ECHT-MODUS"

        self.log("=" * 60)
        self.log(f"TennisMyLife → Match-DB Konvertierung")
        self.log(f"Modus: {mode_label}")
        self.log(f"Bindestriche entfernen: {'AN' if self.opt_remove_dash.get() else 'AUS'}")
        self.log(f"Doppelte Leerzeichen entfernen: {'AN' if self.opt_remove_dbl.get() else 'AUS'}")
        self.log(f"Auto-Tour-Erkennung: {'AN' if self.opt_auto_tour.get() else 'AUS'}")
        self.log(f"Duplikat-Key: (tourney_id, tourney_date, round, winner, loser)")
        self.log(f"DEBUG-Modus: {'AN' if _DEBUG_ACTIVE else 'AUS'}")
        self.log("=" * 60)
        self.log("")

        total_files = len(self.files)
        grand_total_rows = 0
        grand_total_new = 0
        grand_total_dupes = 0
        grand_total_renamed = 0
        errors = []
        ok_count = 0
        used_key_modes = Counter()

        needed_dbs = set()
        for path in self.files:
            try:
                rows_raw, _ = read_tml_csv(path)
            except Exception as e:
                self.log(f"⚠️ Datei nicht lesbar ({os.path.basename(path)}): {e}")
                continue
            tour = self._classify_tour(path, rows_raw)[0]
            if tour == "atp":
                needed_dbs.add(self.atp_db.get())
            elif tour == "wta":
                needed_dbs.add(self.wta_db.get())

        self.log(f"📚 Lade DB-Index für {len(needed_dbs)} Datenbank(en) ...")

        global_sets = {
            TML_KEY_MODE_PRIMARY:  set(),
            TML_KEY_MODE_FALLBACK: set(),
            TML_KEY_MODE_LEGACY:   set(),
        }

        for db_path in needed_dbs:
            if not os.path.exists(db_path):
                self.log(f"   ❌ DB fehlt: {db_path}")
                continue
            sets, total, stats = self._load_db_index(db_path, log_prefix="   ")
            for mode in global_sets:
                global_sets[mode] |= sets[mode]

            self.log(f"   📚 {os.path.basename(db_path)}: {total:,} Matches indexiert")
            self.log(f"      Tourney-IDs in DB:")
            self.log(f"         • 3-stellig:              {stats['tid_3stellig']:,}")
            self.log(f"         • 4-stellig:              {stats['tid_4stellig']:,}")
            if stats['tid_sonstig']:
                self.log(f"         • sonstige:               {stats['tid_sonstig']:,}")
            if stats['no_round']:
                self.log(f"         • ohne Runde:             {stats['no_round']:,}")
            if stats['no_date']:
                self.log(f"         • ohne Datum:             {stats['no_date']:,}")
            self.log(f"      Index-Größen:")
            self.log(f"         • Primary-Keys:           {len(sets[TML_KEY_MODE_PRIMARY]):,}")
            self.log(f"         • Fallback-Keys:          {len(sets[TML_KEY_MODE_FALLBACK]):,}")
            self.log(f"         • Legacy-Keys:            {len(sets[TML_KEY_MODE_LEGACY]):,}")

        self.log("")
        self.log(f"📚 Gesamt-Index: Primary={len(global_sets[TML_KEY_MODE_PRIMARY]):,} | "
                 f"Fallback={len(global_sets[TML_KEY_MODE_FALLBACK]):,} | "
                 f"Legacy={len(global_sets[TML_KEY_MODE_LEGACY]):,}")
        self.log("")

        if _DEBUG_ACTIVE:
            self.log("🔎 DEBUG: Prüfe TARGET-Keys im Index ...")
            for target in _DEBUG_TARGET_KEYS:
                found = target in global_sets[TML_KEY_MODE_PRIMARY]
                self.log(f"   {target}")
                self.log(f"      im Index? {found}")
            self.log("")

        for i, path in enumerate(self.files, 1):
            if not self.is_running:
                self.log("⏹ Abgebrochen.")
                self.set_live(status="⏹ Abgebrochen")
                return

            pct = int((i - 1) / total_files * 100)
            self.set_progress(pct, f"Datei {i}/{total_files}: {os.path.basename(path)}")
            self.set_live(file=os.path.basename(path),
                          status=f"Verarbeite ({i}/{total_files})...",
                          tour="—", rows="—", new="—", dupes="—", renamed="—")

            self.log("-" * 60)
            self.log(f"[{i}/{total_files}] {os.path.basename(path)}")

            try:
                rows_raw, fieldnames = read_tml_csv(path)
                self.log(f"   📥 {len(rows_raw)} Rohzeilen gelesen")
                self.set_live(rows=f"{len(rows_raw):,}")

                tour, source = self._classify_tour(path, rows_raw)
                self.log(f"   🎯 Tour: {tour.upper()}  (Quelle: {source})")
                self.set_live(tour=tour.upper())

                if tour == "unknown":
                    self.log(f"   ⚠️ Tour nicht erkannt – übersprungen")
                    errors.append((path, "Tour nicht erkannt"))
                    self.set_live(status="⚠️ Tour nicht erkannt")
                    continue

                if tour == "mixed":
                    self.log(f"   ⚠️ Gemischte Daten (ATP+WTA) – übersprungen")
                    errors.append((path, "Mixed (ATP+WTA)"))
                    self.set_live(status="⚠️ Gemischte Daten")
                    continue

                if tour == "atp":
                    db_path = self.atp_db.get()
                    tour_label = "ATP"
                else:
                    db_path = self.wta_db.get()
                    tour_label = "WTA"

                self.log(f"   Ziel: {os.path.basename(db_path)}")

                levels = Counter(r.get("tourney_level") for r in rows_raw)
                level_str = ", ".join(f"{k}:{v}" for k, v in levels.most_common(8))
                self.log(f"   📊 Level: {level_str}")

                self.set_live(status="Normalisiere...")
                rows_norm = []
                renamed = 0
                for r in rows_raw:
                    row = normalize_tml_row(
                        r,
                        remove_dash=self.opt_remove_dash.get(),
                        remove_double_space=self.opt_remove_dbl.get(),
                        exceptions=self.exceptions)
                    if r.get("winner_name") and row.get("winner_name") != r["winner_name"]:
                        renamed += 1
                    if r.get("loser_name") and row.get("loser_name") != r["loser_name"]:
                        renamed += 1
                    rows_norm.append(row)

                self.log(f"   🧼 {len(rows_norm)} Zeilen normalisiert, {renamed} Namen geändert")
                self.set_live(renamed=f"{renamed:,}")

                for row in rows_norm:
                    if row.get("tourney_id"):
                        row["tourney_id"] = str(row["tourney_id"]).strip()

                self.set_live(status="Prüfe Duplikate...")

                rows_to_insert = []
                duplicates_count = 0
                file_key_modes = Counter()

                for row in rows_norm:
                    is_dup, mode = tml_row_matches_any_key(row, global_sets, logger=self.log)
                    if is_dup:
                        duplicates_count += 1
                        file_key_modes[f"dup_{mode}"] += 1
                        continue
                    rows_to_insert.append(row)

                for row in rows_to_insert:
                    for mode, _key in tml_make_match_keys(row):
                        file_key_modes[f"new_{mode}"] += 1
                        break

                to_insert = len(rows_to_insert)

                self.log(f"   🔍 Duplikate in DB: {duplicates_count}")
                self.log(f"   ✅ Neu einzufügen: {to_insert}")

                if duplicates_count:
                    d_prim = file_key_modes.get(f"dup_{TML_KEY_MODE_PRIMARY}", 0)
                    d_fb   = file_key_modes.get(f"dup_{TML_KEY_MODE_FALLBACK}", 0)
                    d_leg  = file_key_modes.get(f"dup_{TML_KEY_MODE_LEGACY}", 0)
                    self.log(f"      erkannt via Primary: {d_prim}")
                    self.log(f"      erkannt via Fallback: {d_fb}")
                    self.log(f"      erkannt via Legacy:  {d_leg}")

                if to_insert:
                    n_prim = file_key_modes.get(f"new_{TML_KEY_MODE_PRIMARY}", 0)
                    n_fb   = file_key_modes.get(f"new_{TML_KEY_MODE_FALLBACK}", 0)
                    n_leg  = file_key_modes.get(f"new_{TML_KEY_MODE_LEGACY}", 0)
                    self.log(f"      neue Matches mit Primary-Key:  {n_prim}")
                    self.log(f"      neue Matches mit Fallback-Key: {n_fb}")
                    self.log(f"      neue Matches mit Legacy-Key:   {n_leg}")
                    if n_prim: used_key_modes[TML_KEY_MODE_PRIMARY] += n_prim
                    if n_fb:   used_key_modes[TML_KEY_MODE_FALLBACK] += n_fb
                    if n_leg:  used_key_modes[TML_KEY_MODE_LEGACY] += n_leg

                self.set_live(dupes=f"{duplicates_count:,}",
                              new=f"{to_insert:,}")

                self.detail_tree.insert("", tk.END, values=(
                    os.path.basename(path)[:20],
                    tour_label,
                    f"{len(rows_norm):,}",
                    f"{to_insert:,}",
                    f"{duplicates_count:,}",
                    f"{renamed:,}",
                ))

                if dry:
                    self.log(f"   🔍 TEST: Keine DB-Änderung")
                    self.set_live(status="🔍 TEST (keine Änderung)")
                    grand_total_new += to_insert
                    grand_total_dupes += duplicates_count
                    grand_total_renamed += renamed
                    for row in rows_to_insert:
                        tml_register_row_in_sets(row, global_sets, logger=self.log)
                else:
                    self.set_live(status="Schreibe in DB...")

                    if to_insert == 0:
                        self.log(f"   ⏭️ Keine neuen Matches – alle bereits in DB")
                        self.set_live(status="✅ Keine neuen Matches")
                        grand_total_dupes += duplicates_count
                        grand_total_renamed += renamed
                    else:
                        available_cols = tml_get_table_columns(db_path, "matches")
                        insert_cols = [c for c in TML_MATCH_COLUMNS if c in available_cols]

                        if not insert_cols:
                            raise RuntimeError("Keine passenden Spalten in matches-Tabelle")

                        missing = [c for c in TML_MATCH_COLUMNS if c not in available_cols]
                        if missing:
                            self.log(f"   ⚠️ {len(missing)} Spalten fehlen in DB, werden übersprungen")
                            self.log(f"      z. B. {missing[:5]}")

                        db = sqlite3.connect(db_path)
                        cur = db.cursor()
                        placeholders = ", ".join("?" for _ in insert_cols)
                        col_list = ", ".join(insert_cols)
                        sql = f"INSERT INTO matches ({col_list}) VALUES ({placeholders})"

                        before = cur.execute("SELECT COUNT(*) FROM matches").fetchone()[0]
                        data = [tuple(row.get(c) for c in insert_cols) for row in rows_to_insert]
                        cur.executemany(sql, data)
                        db.commit()
                        after = cur.execute("SELECT COUNT(*) FROM matches").fetchone()[0]
                        db.close()

                        inserted = after - before
                        self.log(f"   💾 Eingefügt: {inserted} | Gesamt in DB: {after:,}")
                        self.set_live(status=f"✅ Fertig: +{inserted} Matches")
                        grand_total_new += inserted
                        grand_total_dupes += duplicates_count
                        grand_total_renamed += renamed

                        for row in rows_to_insert:
                            tml_register_row_in_sets(row, global_sets, logger=self.log)

                grand_total_rows += len(rows_norm)
                ok_count += 1

            except Exception as e:
                self.log(f"   ❌ Fehler: {e}")
                tml_log_to_file(traceback.format_exc())
                errors.append((path, str(e)))
                self.set_live(status=f"❌ Fehler: {e}")

        self.set_progress(100, f"✅ Fertig: {ok_count}/{total_files} Dateien ok")

        summary_lines = []
        summary_lines.append("=" * 55)
        summary_lines.append("KONVERTIERUNGS-ERGEBNIS")
        summary_lines.append("=" * 55)
        summary_lines.append(f"Zeit: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        summary_lines.append(f"Modus: {mode_label}")
        summary_lines.append("")
        summary_lines.append(f"Dateien verarbeitet:  {total_files}")
        summary_lines.append(f"  davon erfolgreich:  {ok_count}")
        summary_lines.append(f"  davon Fehler:       {len(errors)}")
        summary_lines.append("")
        summary_lines.append(f"Zeilen gelesen:       {grand_total_rows:,}")
        summary_lines.append(f"Neu eingefügt:        {grand_total_new:,}")
        summary_lines.append(f"Duplikate:            {grand_total_dupes:,}")
        summary_lines.append(f"Namen geändert:       {grand_total_renamed:,}")
        summary_lines.append("")
        summary_lines.append("Verwendete Key-Modi bei neuen Matches:")
        summary_lines.append(f"  Primary:  {used_key_modes.get(TML_KEY_MODE_PRIMARY, 0):,}")
        summary_lines.append(f"  Fallback: {used_key_modes.get(TML_KEY_MODE_FALLBACK, 0):,}")
        summary_lines.append(f"  Legacy:   {used_key_modes.get(TML_KEY_MODE_LEGACY, 0):,}")
        if errors:
            summary_lines.append("")
            summary_lines.append("Fehlerhafte Dateien:")
            for p, e in errors[:10]:
                summary_lines.append(f"  - {os.path.basename(p)}: {e}")
        summary_lines.append("")
        if dry:
            summary_lines.append("🔍 TEST-MODUS: nichts geschrieben.")
        else:
            summary_lines.append("⚡ ECHT-MODUS: Änderungen gespeichert.")

        self.summary_text.config(state=tk.NORMAL)
        self.summary_text.delete(1.0, tk.END)
        self.summary_text.insert(tk.END, "\n".join(summary_lines))
        self.summary_text.config(state=tk.DISABLED)

        self.log("")
        for ln in summary_lines:
            self.log(ln)

        self.notebook.select(1)

        if dry:
            self.set_live(status=f"🔍 TEST fertig: {grand_total_new:,} neu, {len(errors)} Fehler")
        else:
            self.set_live(status=f"⚡ ECHT fertig: +{grand_total_new:,} Matches")

        if dry:
            messagebox.showinfo(
                "Testlauf fertig",
                f"Testlauf abgeschlossen.\n\n"
                f"Dateien: {total_files} (Erfolg: {ok_count}, Fehler: {len(errors)})\n"
                f"Zeilen gelesen: {grand_total_rows:,}\n"
                f"Würden neu eingefügt: {grand_total_new:,}\n"
                f"Duplikate: {grand_total_dupes:,}\n"
                f"Namen geändert: {grand_total_renamed:,}\n\n"
                f"Zum Schreiben: ECHT-Modus wählen und erneut starten.")
        else:
            messagebox.showinfo(
                "Import fertig",
                f"Import abgeschlossen.\n\n"
                f"Dateien: {total_files} (Erfolg: {ok_count}, Fehler: {len(errors)})\n"
                f"Neu eingefügt: {grand_total_new:,}\n"
                f"Duplikate: {grand_total_dupes:,}\n"
                f"Namen geändert: {grand_total_renamed:,}")


# ============================================================
# MODUL 6: CHECK-TOOL (DB / CSV Check) – NEU
# ============================================================
KEY_COLS_CHECK = ["tourney_id", "tourney_date", "round", "winner_name", "loser_name"]

CHECK_SURFACES_VALID = {"hard", "clay", "grass", "carpet"}
CHECK_LEVELS_VALID = {
    # === Turnier-Kategorien (Sackmann-Standard) ===
    "a", "m", "g", "d", "f", "c", "s", "o", "e",

    # === ATP-spezifisch ===
    "250", "500", "1000",
    "atp250", "atp500", "atp1000",

    # === WTA-Kategorien (modern) ===
    "w",           # WTA 125 / Challenger
    "p",           # Premier (WTA 500/700 alt)
    "pm",          # Premier Mandatory (WTA 1000 alt)
    "pp",          # Premier 5
    "i",           # International (WTA 250 alt)

    # === WTA-Tier-System (alt, vor 2009) ===
    "t1", "t2", "t3", "t4", "t5",

    # === Preisgeld-basierte ITF-Kategorien ===
    "10", "15", "20", "25", "35", "40",
    "50", "60", "70", "75", "80", "90", "100", "125",

    # === Sonderfälle ===
    "j",           # Junior
    "cc",          # WTA-Sondercode
    "50+h", "35+h", "25+h", "15+h",   # ITF mit Hospitality

    # === Ausgeschriebene Varianten ===
    "wta250", "wta500", "wta1000",
}
CHECK_BEST_OF_VALID = {3, 5}
CHECK_ROUNDS_VALID = {
    # Standard-Hauptrunden
    "R128", "R64", "R32", "R16", "QF", "SF", "F",
    # Qualifikation
    "Q1", "Q2", "Q3", "Q4",
    # Round-Robin-Turniere
    "RR", "BR",
    # Olympia & Davis Cup
    "OLY", "DC",
    # Historisch / selten
    "ER", "CR", "CQ", "PR",
}
CHECK_SCORE_OK_RE = re.compile(r"^\d+-\d+(\(\d+\))?(\s+\d+-\d+(\(\d+\))?)*")
CHECK_SCORE_SPECIAL = ("RET", "W/O", "WALKOVER", "DEF", "ABN", "UNK", "PLAYED")


def _check_norm_cols(df):
    df.columns = [str(c).strip() for c in df.columns]
    return df


def check_load_source(path):
    p = Path(path)
    ext = p.suffix.lower()

    if ext in (".db", ".sqlite"):
        con = sqlite3.connect(str(p), timeout=30.0)
        tables = [r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )]
        table = "matches" if "matches" in tables else (tables[0] if tables else None)
        if table is None:
            con.close()
            raise ValueError("Keine Tabellen in der DB gefunden")
        df = pd.read_sql_query(f"SELECT * FROM {table}", con)
        con.close()
        return _check_norm_cols(df), f"SQLite: {p.name} / Tabelle '{table}'", table

    if ext == ".csv":
        df = pd.read_csv(p, encoding="utf-8-sig")
        return _check_norm_cols(df), f"CSV: {p.name}", None

    if ext in (".xlsx", ".xls"):
        df = pd.read_excel(p)
        return _check_norm_cols(df), f"Excel: {p.name}", None

    if ext == ".json":
        df = pd.read_json(p)
        return _check_norm_cols(df), f"JSON: {p.name}", None

    raise ValueError(f"Dateityp nicht unterstützt: {ext}")


def check_db_connect(path):
    con = sqlite3.connect(path, timeout=30.0)
    try:
        con.execute("PRAGMA busy_timeout = 30000")
        con.execute("PRAGMA journal_mode = WAL")
        con.execute("PRAGMA synchronous = NORMAL")
    except sqlite3.OperationalError:
        pass
    return con


def check_name_has_dash(n):
    return isinstance(n, str) and "-" in n


def check_name_has_double_space(n):
    if not isinstance(n, str):
        return False
    return bool(re.search(r"\s{2,}", n)) or n != n.strip()


def check_score_format(s):
    if not isinstance(s, str):
        return False
    su = s.strip().upper()
    if su in CHECK_SCORE_SPECIAL:
        return True
    if "RET" in su or "W/O" in su or "DEF" in su:
        return True
    return bool(CHECK_SCORE_OK_RE.match(su))


def check_analyse(df, checks, progress=None):
    res = {}
    cols = set(df.columns)
    total = len(df)

    def tick(pct, msg):
        if progress:
            progress(pct, msg)

    tick(3, "Basis-Info")
    res["total_rows"] = total
    res["columns"] = list(df.columns)

    name_cols = [c for c in ("winner_name", "loser_name") if c in cols]

    if "dash" in checks:
        tick(10, "Suche Bindestriche")
        found = []
        for c in name_cols:
            for idx, n in df[c].items():
                if check_name_has_dash(n):
                    found.append((n, c, int(idx)))
        res["dash_names"] = found
        res["dash_names_unique"] = sorted({f[0] for f in found})
    else:
        res["dash_names"] = []
        res["dash_names_unique"] = []

    if "space" in checks:
        tick(16, "Suche doppelte Leerzeichen")
        found = []
        for c in name_cols:
            for idx, n in df[c].items():
                if check_name_has_double_space(n):
                    found.append((n, c, int(idx)))
        res["space_names"] = found
        res["space_names_unique"] = sorted({f[0] for f in found})
    else:
        res["space_names"] = []
        res["space_names_unique"] = []

    if "dash_collision" in checks:
        tick(22, "Prüfe Kollisionen mit/ohne Bindestrich")
        plain = set()
        for c in name_cols:
            for n in df[c].dropna().unique():
                if isinstance(n, str) and "-" not in n:
                    plain.add(n)
        koll = []
        for d in res.get("dash_names_unique", []):
            ohne = re.sub(r"\s+", " ", d.replace("-", " ")).strip()
            if ohne in plain:
                rows = []
                for c in name_cols:
                    for idx, n in df[c].items():
                        if n == d:
                            rows.append((c, int(idx)))
                koll.append((d, ohne, rows))
        res["dash_kollisionen"] = koll
    else:
        res["dash_kollisionen"] = []

    if "exact_dup" in checks:
        tick(30, "Suche exakte Zeilen-Duplikate")
        try:
            dup_mask = df.duplicated(keep=False)
            res["exact_dup_rows"] = df[dup_mask]
            res["exact_dup_idx"] = [int(i) for i in df.index[dup_mask].tolist()]
            res["exact_dup_count"] = len(res["exact_dup_idx"])

            grp = df.groupby(list(df.columns), sort=False).apply(
                lambda g: list(g.index))
            to_delete = []
            for _, idxs in grp.items():
                if len(idxs) > 1:
                    for i in idxs[1:]:
                        to_delete.append(int(i))
            res["exact_dup_delete_idx"] = to_delete
        except Exception:
            res["exact_dup_rows"] = df.iloc[0:0]
            res["exact_dup_idx"] = []
            res["exact_dup_count"] = 0
            res["exact_dup_delete_idx"] = []
    else:
        res["exact_dup_rows"] = df.iloc[0:0]
        res["exact_dup_idx"] = []
        res["exact_dup_count"] = 0
        res["exact_dup_delete_idx"] = []

    if "key_dup" in checks:
        tick(40, "Suche Match-Key-Duplikate")
        key_dupes = []
        if all(c in cols for c in KEY_COLS_CHECK):
            sub = df[KEY_COLS_CHECK].copy()
            sub["__idx__"] = sub.index
            grp = sub.groupby(KEY_COLS_CHECK, sort=False)["__idx__"].apply(list)
            for key, idxs in grp.items():
                if len(idxs) > 1:
                    if not isinstance(key, tuple):
                        key = (key,)
                    rec = dict(zip(KEY_COLS_CHECK, key))
                    key_dupes.append((len(idxs), rec, [int(i) for i in idxs]))
            key_dupes.sort(key=lambda x: -x[0])
        res["key_dupes"] = key_dupes
    else:
        res["key_dupes"] = []

    if "missing" in checks:
        tick(50, "Prüfe fehlende Werte")
        kritisch = ["tourney_id", "tourney_date", "round",
                    "winner_name", "loser_name", "score"]
        fehlend = {}
        for c in kritisch:
            if c not in cols:
                fehlend[c] = (None, None, [])
                continue
            mask = df[c].isna() | (df[c].astype(str).str.strip() == "")
            idxs = [int(i) for i in df.index[mask].tolist()]
            n_null = len(idxs)
            pct = (n_null / total * 100) if total else 0
            fehlend[c] = (n_null, pct, idxs)
        res["fehlend"] = fehlend
    else:
        res["fehlend"] = {}

    if "score_format" in checks:
        tick(58, "Prüfe Score-Format")
        bad = []
        if "score" in cols:
            for idx, s in df["score"].items():
                if pd.isna(s):
                    continue
                if not check_score_format(s):
                    bad.append((s, int(idx)))
        res["score_bad"] = bad
    else:
        res["score_bad"] = []

    if "date_format" in checks:
        tick(65, "Prüfe Datum-Format")
        bad = []
        if "tourney_date" in cols:
            for idx, d in df["tourney_date"].items():
                if pd.isna(d):
                    continue
                ds = str(d).strip()
                if not re.match(r"^\d{8}$", ds):
                    bad.append((ds, int(idx)))
        res["date_bad"] = bad
    else:
        res["date_bad"] = []

    if "rounds" in checks:
        tick(70, "Prüfe Runden-Werte")
        c = Counter()
        unknown = []
        if "round" in cols:
            for idx, r in df["round"].items():
                if pd.isna(r):
                    continue
                c[str(r)] += 1
                if str(r) not in CHECK_ROUNDS_VALID:
                    unknown.append((str(r), int(idx)))
        res["rounds_count"] = c
        res["rounds_unknown"] = unknown
    else:
        res["rounds_count"] = Counter()
        res["rounds_unknown"] = []

    if "best_of" in checks:
        tick(75, "Prüfe best_of")
        bad = []
        if "best_of" in cols:
            for idx, v in df["best_of"].items():
                try:
                    iv = int(float(v))
                except Exception:
                    continue
                if iv not in CHECK_BEST_OF_VALID:
                    bad.append((iv, int(idx)))
        res["best_of_bad"] = bad
    else:
        res["best_of_bad"] = []

    if "surface" in checks:
        tick(80, "Prüfe Surface")
        bad = []
        if "surface" in cols:
            for idx, s in df["surface"].items():
                if pd.isna(s):
                    continue
                if str(s).strip().lower() not in CHECK_SURFACES_VALID:
                    bad.append((str(s), int(idx)))
        res["surface_bad"] = bad
    else:
        res["surface_bad"] = []

    if "level" in checks:
        tick(83, "Prüfe Tourney-Level")
        bad = []
        if "tourney_level" in cols:
            for idx, l in df["tourney_level"].items():
                if pd.isna(l):
                    continue
                if str(l).strip().lower() not in CHECK_LEVELS_VALID:
                    bad.append((str(l), int(idx)))
        res["level_bad"] = bad
    else:
        res["level_bad"] = []

    if "same_player" in checks:
        tick(86, "Prüfe Winner = Loser")
        hits = []
        if "winner_name" in cols and "loser_name" in cols:
            mask = df["winner_name"] == df["loser_name"]
            hits = [int(i) for i in df.index[mask].tolist()]
        res["same_player_idx"] = hits
    else:
        res["same_player_idx"] = []

    if "age" in checks:
        tick(89, "Prüfe Alter")
        bad_w = []
        bad_l = []
        for col, out in (("winner_age", bad_w), ("loser_age", bad_l)):
            if col in cols:
                for idx, v in df[col].items():
                    try:
                        fv = float(v)
                    except Exception:
                        continue
                    if fv < 14 or fv > 55:
                        out.append((fv, int(idx)))
        res["age_bad_winner"] = bad_w
        res["age_bad_loser"] = bad_l
    else:
        res["age_bad_winner"] = []
        res["age_bad_loser"] = []

    if "match_num_dup" in checks:
        tick(92, "Prüfe match_num pro Turnier und Runde")
        dup_groups = []
        if "tourney_id" in cols and "match_num" in cols:
            # Gruppiere nach tourney_id + match_num + round (+ tourney_date)
            group_cols = ["tourney_id", "match_num"]
            if "round" in cols:
                sub = df[["tourney_id", "match_num", "round"]].copy()
                group_cols.append("round")
            else:
                sub = df[["tourney_id", "match_num"]].copy()

            sub["__idx__"] = sub.index
            grp = sub.groupby(group_cols, sort=False)["__idx__"].apply(list)

            for key, idxs in grp.items():
                if len(idxs) > 1:
                    if not isinstance(key, tuple):
                        key = (key,)
                    # Key auf 2 oder 3 Werte reduzieren für die Anzeige
                    if len(key) == 3:
                        tid, mnum, rnd = key
                        anzeige = (tid, mnum, rnd)
                    else:
                        tid, mnum = key
                        anzeige = (tid, mnum)
                    dup_groups.append((len(idxs), anzeige, [int(i) for i in idxs]))
            dup_groups.sort(key=lambda x: -x[0])
        res["match_num_dupes"] = dup_groups
    else:
        res["match_num_dupes"] = []

    if "id_name" in checks:
        tick(95, "Prüfe Spieler-ID ↔ Name")
        collisions = []
        for id_col, name_col in (("winner_id", "winner_name"),
                                 ("loser_id", "loser_name")):
            if id_col not in cols or name_col not in cols:
                continue
            sub = df[[id_col, name_col]].dropna()
            grp = sub.groupby(id_col)[name_col].nunique()
            bad_ids = grp[grp > 1].index.tolist()
            for bid in bad_ids[:50]:
                mask = df[id_col] == bid
                names = sorted(set(df[mask][name_col].dropna().tolist()))
                idxs = [int(i) for i in df.index[mask].tolist()]
                collisions.append((id_col, bid, names, idxs))
        res["id_name_collisions"] = collisions
    else:
        res["id_name_collisions"] = []

    tick(100, "Fertig")
    return res


def check_compare_dfs(df_a, df_b, label_a="A", label_b="B"):
    res = {}
    for name, df in ((label_a, df_a), (label_b, df_b)):
        missing = [c for c in KEY_COLS_CHECK if c not in df.columns]
        if missing:
            res[name] = {"error": f"Fehlende Spalten: {missing}"}
            continue
        keys = set(map(tuple,
                       df[KEY_COLS_CHECK].astype(str).fillna("").values.tolist()))
        res[name] = {"keys": keys, "count": len(keys)}

    a = res.get(label_a, {})
    b = res.get(label_b, {})
    if "keys" in a and "keys" in b:
        res["only_a"] = a["keys"] - b["keys"]
        res["only_b"] = b["keys"] - a["keys"]
        res["common"] = a["keys"] & b["keys"]
    return res


# Originale Sackmann-Spaltenreihenfolge, damit die Struktur erhalten bleibt
_CHECK_CSV_FULL_COLUMNS = [
    "tourney_id", "tourney_name", "surface", "draw_size", "tourney_level",
    "tourney_date", "match_num",
    "winner_id", "winner_seed", "winner_entry", "winner_name", "winner_hand",
    "winner_ht", "winner_ioc", "winner_age",
    "loser_id", "loser_seed", "loser_entry", "loser_name", "loser_hand",
    "loser_ht", "loser_ioc", "loser_age",
    "score", "best_of", "round", "minutes",
    "w_ace", "w_df", "w_svpt", "w_1stIn", "w_1stWon", "w_2ndWon",
    "w_SvGms", "w_bpSaved", "w_bpFaced",
    "l_ace", "l_df", "l_svpt", "l_1stIn", "l_1stWon", "l_2ndWon",
    "l_SvGms", "l_bpSaved", "l_bpFaced",
    "winner_rank", "winner_rank_points",
    "loser_rank", "loser_rank_points",
]


def check_save_dataframe_to_file(path, df):
    p = Path(path)
    ext = p.suffix.lower()

    if ext == ".csv":
        df_to_write = df.copy()

        # 1. Spalten, die im Original vorhanden sind, aber in df fehlen (weil pandas
        #    sie wegen durchgehender Leerheit rausgeworfen hat), wieder ergänzen.
        #    Nur bei Match-Dateien (Erkennung: tourney_id + winner_name vorhanden).
        is_match_file = (
            "tourney_id" in df_to_write.columns
            and "winner_name" in df_to_write.columns
            and "loser_name" in df_to_write.columns
        )
        if is_match_file:
            for col in _CHECK_CSV_FULL_COLUMNS:
                if col not in df_to_write.columns:
                    df_to_write[col] = None
            # Spalten in Sackmann-Reihenfolge sortieren
            ordered = [c for c in _CHECK_CSV_FULL_COLUMNS
                       if c in df_to_write.columns]
            extra = [c for c in df_to_write.columns if c not in ordered]
            df_to_write = df_to_write[ordered + extra]

        # 2. Alles als Strings schreiben, damit aus tourney_date nicht "2.02e+07"
        #    und aus leeren Zellen nicht "nan" wird.
        for col in df_to_write.columns:
            df_to_write[col] = df_to_write[col].apply(
                lambda v: "" if (v is None or (isinstance(v, float) and v != v)
                                 or str(v).strip() == "nan") else str(v)
            )

        df_to_write.to_csv(p, index=False, encoding="utf-8-sig")

    elif ext in (".xlsx", ".xls"):
        df.to_excel(p, index=False)
    elif ext == ".json":
        df.to_json(p, orient="records", indent=2, force_ascii=False)
    else:
        raise ValueError(f"Schreiben in {ext} nicht unterstützt.")


def check_open_with_default_app(path):
    try:
        if os.name == "nt":
            os.startfile(path)
        elif hasattr(os, "uname") and os.uname().sysname == "Darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
    except Exception as e:
        messagebox.showerror("Fehler", f"Konnte Datei nicht öffnen:\n{e}")


def check_find_sqlite_browser():
    candidates = [
        r"C:\Program Files\DB Browser for SQLite\DB Browser for SQLite.exe",
        r"C:\Program Files (x86)\DB Browser for SQLite\DB Browser for SQLite.exe",
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    for exe in ("sqlitebrowser", "sqlitebrowser.exe"):
        w = shutil.which(exe)
        if w:
            return w
    return None


def _chk_card(parent, title=None, icon=""):
    outer = tk.Frame(parent, bg=Theme.BG_CARD,
                     highlightbackground=Theme.BORDER,
                     highlightthickness=1, bd=0)
    if title is not None:
        h = tk.Frame(outer, bg=Theme.BG_CARD)
        h.pack(fill=tk.X, padx=14, pady=(8, 4))
        tk.Label(h, text=f"{icon}  {title}".strip(),
                 font=(Theme.FONT, 10, "bold"),
                 fg=Theme.TEXT, bg=Theme.BG_CARD).pack(anchor='w')
    body = tk.Frame(outer, bg=Theme.BG_CARD)
    body.pack(fill=tk.BOTH, expand=True, padx=14, pady=(4, 10))
    return outer, body


def _chk_button(parent, text, cmd, kind="primary", icon=""):
    colors = {
        "primary":   (Theme.GREEN, Theme.GREEN_DARK),
        "secondary": (Theme.BG_HOVER, Theme.BG_INPUT),
        "danger":    (Theme.RED, "#b93c2f"),
    }
    bg, hover = colors.get(kind, colors["primary"])
    fg = "#ffffff" if kind in ("primary", "danger") else Theme.TEXT
    b = tk.Button(parent, text=f"{icon}  {text}".strip() if icon else text,
                  command=cmd, font=(Theme.FONT, 10, "bold"),
                  bg=bg, fg=fg, activebackground=hover, activeforeground=fg,
                  relief=tk.FLAT, bd=0, cursor='hand2', padx=14, pady=8)
    b.bind("<Enter>", lambda e: b.config(bg=hover))
    b.bind("<Leave>", lambda e: b.config(bg=bg))
    return b


def _chk_entry(parent, var):
    return tk.Entry(parent, textvariable=var,
                    font=(Theme.FONT_MONO, 10),
                    bg=Theme.BG_INPUT, fg=Theme.TEXT,
                    insertbackground=Theme.GREEN,
                    relief=tk.FLAT, bd=0,
                    highlightthickness=1,
                    highlightbackground=Theme.BORDER,
                    highlightcolor=Theme.GREEN)


class CheckRowEditWindow(tk.Toplevel):
    def __init__(self, master, app_module, df, row_idx, source_path, which,
                 title="Zeile bearbeiten"):
        super().__init__(master)
        self.app_module = app_module
        self.df = df
        self.row_idx = row_idx
        self.source_path = source_path
        self.which = which
        self.entries = {}
        self.original = {}

        self.title(f"✏️ {title} – Zeile {row_idx}")
        self.configure(bg=Theme.BG)

        try:
            self.state("zoomed")
        except tk.TclError:
            try:
                self.attributes("-zoomed", True)
            except tk.TclError:
                sw = self.winfo_screenwidth()
                sh = self.winfo_screenheight()
                self.geometry(f"{sw}x{sh}+0+0")

        self.minsize(1100, 700)
        self.transient(master)
        self.lift()
        self.focus_force()

        if row_idx not in df.index:
            tk.Label(self, text=f"Zeile {row_idx} nicht gefunden.",
                     font=(Theme.FONT, 14, "bold"),
                     fg=Theme.RED, bg=Theme.BG).pack(pady=60)
            return

        row = df.loc[row_idx]

        head = tk.Frame(self, bg=Theme.BG_CARD)
        head.pack(fill=tk.X, side=tk.TOP)
        inner_head = tk.Frame(head, bg=Theme.BG_CARD)
        inner_head.pack(fill=tk.X, padx=30, pady=(18, 14))
        tk.Label(inner_head,
                 text=f"✏️  Zeile {row_idx}",
                 font=(Theme.FONT, 20, "bold"),
                 fg=Theme.TEXT, bg=Theme.BG_CARD).pack(side=tk.LEFT)
        tk.Label(inner_head,
                 text=f"   ·   {os.path.basename(source_path)}",
                 font=(Theme.FONT, 13),
                 fg=Theme.TEXT_DIM, bg=Theme.BG_CARD).pack(side=tk.LEFT)

        info = tk.Frame(self, bg=Theme.BG)
        info.pack(fill=tk.X, padx=30, pady=(10, 0))
        tk.Label(info,
                 text="Alle Felder direkt bearbeiten. Danach „💾 Speichern“ klicken. "
                      "„🗑 Löschen“ entfernt die Zeile aus der Quelle.",
                 font=(Theme.FONT, 11),
                 fg=Theme.TEXT_DIM, bg=Theme.BG).pack(anchor='w')

        container = tk.Frame(self, bg=Theme.BG)
        container.pack(fill=tk.BOTH, expand=True, padx=30, pady=(15, 10))

        canvas = tk.Canvas(container, bg=Theme.BG, highlightthickness=0)
        vsb = tk.Scrollbar(container, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=vsb.set)
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)

        inner = tk.Frame(canvas, bg=Theme.BG)
        canvas.create_window((0, 0), window=inner, anchor='nw')

        def on_conf(event):
            canvas.configure(scrollregion=canvas.bbox("all"))
        inner.bind("<Configure>", on_conf)

        def _on_mousewheel(event):
            canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
        canvas.bind_all("<MouseWheel>", _on_mousewheel)
        self.bind("<Destroy>", lambda e: canvas.unbind_all("<MouseWheel>"))

        groups = [
            ("🎾 Match", [
                "tourney_id", "tourney_name", "tourney_date",
                "surface", "draw_size", "tourney_level",
                "match_num", "round", "best_of", "score", "minutes",
            ]),
            ("🏆 Winner", [
                "winner_name", "winner_id", "winner_seed", "winner_entry",
                "winner_hand", "winner_ht", "winner_ioc",
                "winner_age", "winner_rank", "winner_rank_points",
            ]),
            ("🏆 Loser", [
                "loser_name", "loser_id", "loser_seed", "loser_entry",
                "loser_hand", "loser_ht", "loser_ioc",
                "loser_age", "loser_rank", "loser_rank_points",
            ]),
            ("📊 Winner-Statistik", [
                "w_ace", "w_df", "w_svpt", "w_1stIn", "w_1stWon",
                "w_2ndWon", "w_SvGms", "w_bpSaved", "w_bpFaced",
            ]),
            ("📊 Loser-Statistik", [
                "l_ace", "l_df", "l_svpt", "l_1stIn", "l_1stWon",
                "l_2ndWon", "l_SvGms", "l_bpSaved", "l_bpFaced",
            ]),
        ]

        for group_title, fields in groups:
            g = tk.Frame(inner, bg=Theme.BG_CARD,
                         highlightbackground=Theme.BORDER,
                         highlightthickness=1)
            g.pack(fill=tk.X, pady=(12, 8), padx=2)

            tk.Label(g, text=group_title,
                     font=(Theme.FONT, 12, "bold"),
                     fg=Theme.YELLOW, bg=Theme.BG_CARD,
                     anchor='w').pack(fill=tk.X, padx=14, pady=(10, 6))

            grid = tk.Frame(g, bg=Theme.BG_CARD)
            grid.pack(fill=tk.X, padx=14, pady=(0, 12))

            cols_per_row = 3
            for i, col in enumerate(fields):
                r = i // cols_per_row
                c = i % cols_per_row
                cell = tk.Frame(grid, bg=Theme.BG_CARD)
                cell.grid(row=r, column=c, sticky='ew', padx=8, pady=5)
                grid.columnconfigure(c, weight=1)

                tk.Label(cell, text=col,
                         font=(Theme.FONT, 10, "bold"),
                         fg=Theme.TEXT_DIM, bg=Theme.BG_CARD,
                         width=20, anchor='w').pack(side=tk.LEFT)

                val = row[col] if col in row.index else ""
                try:
                    leer = pd.isna(val)
                except Exception:
                    leer = False
                initial = "" if leer else str(val)

                var = tk.StringVar(value=initial)
                self.original[col] = initial
                e = tk.Entry(cell, textvariable=var,
                             font=(Theme.FONT_MONO, 11),
                             bg=Theme.BG_HOVER, fg=Theme.TEXT,
                             insertbackground=Theme.GREEN,
                             relief=tk.FLAT, bd=0,
                             highlightthickness=1,
                             highlightbackground=Theme.BORDER,
                             highlightcolor=Theme.GREEN)
                e.pack(side=tk.LEFT, fill=tk.X, expand=True,
                       ipady=6, padx=(6, 0))
                self.entries[col] = var

        bar = tk.Frame(self, bg=Theme.BG)
        bar.pack(fill=tk.X, padx=30, pady=(10, 20))

        _chk_button(bar, "💾 Speichern", self.save,
                    kind="primary").pack(side=tk.LEFT, padx=(0, 8))
        _chk_button(bar, "↺ Zurücksetzen", self.reset,
                    kind="secondary").pack(side=tk.LEFT, padx=(0, 8))
        _chk_button(bar, "🗑 Zeile löschen", self.delete_row,
                    kind="danger").pack(side=tk.LEFT, padx=(0, 8))

        extt = Path(source_path).suffix.lower()
        _chk_button(bar, "📂 Datei öffnen",
                    lambda: check_open_with_default_app(source_path),
                    kind="secondary").pack(side=tk.LEFT, padx=(0, 8))
        if extt in (".db", ".sqlite"):
            _chk_button(bar, "🧭 DB-Browser",
                        self.open_in_browser,
                        kind="secondary").pack(side=tk.LEFT, padx=(0, 8))

        self.status = tk.Label(bar, text="",
                               font=(Theme.FONT, 11),
                               fg=Theme.TEXT_DIM, bg=Theme.BG)
        self.status.pack(side=tk.LEFT, padx=(20, 0))

        _chk_button(bar, "✕ Schließen", self.destroy,
                    kind="secondary").pack(side=tk.RIGHT)

    def reset(self):
        for col, var in self.entries.items():
            var.set(self.original[col])
        self.status.config(text="Zurückgesetzt.", fg=Theme.TEXT_DIM)

    def save(self):
        changes = {}
        for col, var in self.entries.items():
            new_val = var.get()
            if new_val != self.original[col]:
                changes[col] = new_val

        if not changes:
            self.status.config(text="Keine Änderungen.", fg=Theme.TEXT_DIM)
            return

        txt = "\n".join(f"  {c}: {self.original[c]!r} → {v!r}"
                        for c, v in list(changes.items())[:20])
        if len(changes) > 20:
            txt += f"\n  … und {len(changes)-20} weitere"

        ok = messagebox.askyesno(
            "Änderungen speichern?",
            f"{len(changes)} Feld(er) geändert in Zeile {self.row_idx}:\n\n"
            f"{txt}\n\nJetzt schreiben?")
        if not ok:
            return

        try:
            self.app_module.apply_row_changes(self.which, self.row_idx, changes)
        except Exception as e:
            traceback.print_exc()
            messagebox.showerror("Fehler beim Speichern",
                                 f"{e}\n\n{traceback.format_exc()}")
            return

        for c, v in changes.items():
            self.original[c] = v
        self.status.config(
            text=f"✅ {len(changes)} Feld(er) gespeichert. "
                 f"Zum Aktualisieren „🔄 Neu analysieren“ klicken.",
            fg=Theme.GREEN)

    def delete_row(self):
        ok = messagebox.askyesno(
            "Zeile löschen?",
            f"Zeile {self.row_idx} wird dauerhaft aus der Quelle entfernt.\n\n"
            f"{os.path.basename(self.source_path)}\n\nFortfahren?")
        if not ok:
            return
        try:
            self.app_module.delete_rows(self.which, [self.row_idx])
        except Exception as e:
            traceback.print_exc()
            messagebox.showerror("Fehler beim Löschen",
                                 f"{e}\n\n{traceback.format_exc()}")
            return
        messagebox.showinfo("Gelöscht",
                            f"Zeile {self.row_idx} wurde gelöscht.\n"
                            f"Zum Aktualisieren „🔄 Neu analysieren“ klicken.")
        self.destroy()

    def open_in_browser(self):
        browser = check_find_sqlite_browser()
        if not browser:
            messagebox.showinfo(
                "DB-Browser nicht gefunden",
                "DB Browser for SQLite wurde nicht gefunden.\n\n"
                "Download: https://sqlitebrowser.org/dl/")
            return
        try:
            subprocess.Popen([browser, self.source_path])
        except Exception as e:
            messagebox.showerror("Fehler",
                                 f"Konnte DB-Browser nicht starten:\n{e}")


class CheckProblemView(tk.Frame):
    def __init__(self, parent, which, on_row_click, on_row_right_click):
        super().__init__(parent, bg=Theme.BG)
        self.which = which
        self.on_row_click = on_row_click
        self.on_row_right_click = on_row_right_click

        self.tag_to_row = {}
        self._tag_counter = 0

        tk.Label(self,
                 text="⚠  Rot hinterlegte Zeile anklicken → Datensatz bearbeiten  "
                      "(Rechtsklick = Menü)",
                 font=(Theme.FONT, 11, "bold"), fg=Theme.YELLOW, bg=Theme.BG,
                 anchor='w').pack(fill=tk.X, padx=12, pady=(10, 4))

        wrap = tk.Frame(self, bg=Theme.BG)
        wrap.pack(fill=tk.BOTH, expand=True, padx=12, pady=(0, 10))

        self.text = tk.Text(wrap,
                            bg=Theme.BG_INPUT, fg=Theme.TEXT,
                            font=(Theme.FONT_MONO, 11),
                            relief=tk.FLAT, bd=0,
                            highlightthickness=1,
                            highlightbackground=Theme.BORDER,
                            wrap="none",
                            cursor="arrow",
                            padx=14, pady=12,
                            spacing1=1, spacing3=3)
        self.text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        vsb = tk.Scrollbar(wrap, orient="vertical", command=self.text.yview)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)
        self.text.configure(yscrollcommand=vsb.set)

        hsb = tk.Scrollbar(self, orient="horizontal", command=self.text.xview)
        hsb.pack(fill=tk.X, padx=12)
        self.text.configure(xscrollcommand=hsb.set)

        self.text.tag_configure("header",
                                foreground=Theme.YELLOW,
                                font=(Theme.FONT_MONO, 12, "bold"),
                                spacing1=12, spacing3=5)
        self.text.tag_configure("sep",
                                foreground=Theme.TEXT_MUTED,
                                spacing1=4, spacing3=4)
        self.text.tag_configure("info",
                                foreground=Theme.TEXT,
                                spacing1=1, spacing3=1)
        self.text.tag_configure("dim",
                                foreground=Theme.TEXT_DIM)

        self.text.configure(state=tk.DISABLED)

        self.text.bind("<ButtonRelease-1>", self._on_click)
        self.text.bind("<Button-3>", self._on_right_click)
        self.text.bind("<Motion>", self._on_motion)

    def clear(self):
        self.text.configure(state=tk.NORMAL)
        self.text.delete("1.0", tk.END)
        self.tag_to_row.clear()
        self._tag_counter = 0
        self.text.configure(state=tk.DISABLED)

    def add_info(self, key, value):
        self.text.configure(state=tk.NORMAL)
        self.text.insert(tk.END, f"   {key:<35} {value}\n", "info")
        self.text.configure(state=tk.DISABLED)

    def add_header(self, title, count=None):
        self.text.configure(state=tk.NORMAL)
        label = title if count is None else f"{title}  ({count})"
        self.text.insert(tk.END, f"\n▶ {label}\n", "header")
        self.text.configure(state=tk.DISABLED)

    def add_sep(self):
        self.text.configure(state=tk.NORMAL)
        self.text.insert(tk.END, "─" * 120 + "\n", "sep")
        self.text.configure(state=tk.DISABLED)

    def add_problem(self, key, value, row_idx):
        self._tag_counter += 1
        tag_name = f"problem_{self._tag_counter}"
        self.tag_to_row[tag_name] = row_idx

        self.text.tag_configure(tag_name,
                                background="#3a1515",
                                foreground="#ffd9d9",
                                font=(Theme.FONT_MONO, 11, "bold"),
                                spacing1=2, spacing3=2)

        self.text.configure(state=tk.NORMAL)
        line = f" ⚠  {key:<35} {value}\n"
        self.text.insert(tk.END, line, (tag_name,))
        self.text.configure(state=tk.DISABLED)

    def _row_at(self, event):
        idx = self.text.index(f"@{event.x},{event.y}")
        tags = self.text.tag_names(idx)
        for t in tags:
            if t in self.tag_to_row:
                return self.tag_to_row[t]
        return None

    def _on_click(self, event):
        row = self._row_at(event)
        if row is None:
            return
        try:
            self.on_row_click(self.which, row)
        except Exception:
            traceback.print_exc()

    def _on_right_click(self, event):
        row = self._row_at(event)
        if row is None:
            return
        try:
            self.on_row_right_click(event, self.which, row)
        except Exception:
            traceback.print_exc()

    def _on_motion(self, event):
        row = self._row_at(event)
        if row is None:
            self.text.configure(cursor="arrow")
        else:
            self.text.configure(cursor="hand2")


ALL_CHECKS = [
    ("dash",           "Bindestriche in Namen"),
    ("space",          "Doppelte / außenliegende Leerzeichen"),
    ("dash_collision", "Kollision mit/ohne Bindestrich"),
    ("exact_dup",      "Exakte Zeilen-Duplikate"),
    ("key_dup",        "Match-Key-Duplikate"),
    ("missing",        "Fehlende Werte"),
    ("score_format",   "Score-Format"),
    ("date_format",    "Datum-Format (YYYYMMDD)"),
    ("rounds",         "Runden-Werte"),
    ("best_of",        "best_of (3 / 5)"),
    ("surface",        "Surface-Werte"),
    ("level",          "Tourney-Level"),
    ("same_player",    "Winner = Loser"),
    ("age",            "Unrealistisches Alter"),
    ("match_num_dup",  "match_num doppelt pro Turnier"),
    ("id_name",        "Spieler-ID ↔ Name inkonsistent"),
]


class CheckModule:
    def __init__(self, parent, app):
        self.parent = parent
        self.app = app

        self.dry_run = tk.BooleanVar(value=True)
        self.check_vars = {k: tk.BooleanVar(value=True) for k, _ in ALL_CHECKS}
        self.sources = []

        self.progress_var = tk.StringVar(value="Bereit")
        self.progress_val = tk.IntVar(value=0)

        self._build_ui()

    def _build_ui(self):
        body = tk.Frame(self.parent, bg=Theme.BG)
        body.pack(fill=tk.BOTH, expand=True, padx=16, pady=(0, 16))

        top_row = tk.Frame(body, bg=Theme.BG)
        top_row.pack(fill=tk.X)

        c_src, b_src = _chk_card(top_row, "Quellen (mehrere möglich)", icon="📂")
        c_src.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 10))

        btns = tk.Frame(b_src, bg=Theme.BG_CARD)
        btns.pack(fill=tk.X, pady=(0, 6))
        _chk_button(btns, "Dateien hinzufügen", self.add_files,
                    kind="secondary", icon="📄").pack(side=tk.LEFT, padx=(0, 6))
        _chk_button(btns, "Datei entfernen", self.remove_selected,
                    kind="secondary", icon="🗑️").pack(side=tk.LEFT, padx=(0, 6))
        _chk_button(btns, "Alle entfernen", self.remove_all,
                    kind="secondary", icon="🗑️").pack(side=tk.LEFT)

        list_frame = tk.Frame(b_src, bg=Theme.BG_CARD)
        list_frame.pack(fill=tk.BOTH, expand=True)

        self.src_listbox = tk.Listbox(list_frame,
                                      bg=Theme.BG_INPUT, fg=Theme.TEXT,
                                      font=(Theme.FONT_MONO, 10),
                                      selectbackground=Theme.GREEN_DARK,
                                      selectforeground="#ffffff",
                                      selectmode=tk.EXTENDED,
                                      relief=tk.FLAT, bd=0,
                                      highlightthickness=1,
                                      highlightbackground=Theme.BORDER,
                                      height=5, activestyle='none')
        self.src_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, ipady=4)

        scr = tk.Scrollbar(list_frame, orient=tk.VERTICAL,
                           command=self.src_listbox.yview)
        scr.pack(side=tk.RIGHT, fill=tk.Y)
        self.src_listbox.config(yscrollcommand=scr.set)

        c_mod, b_mod = _chk_card(top_row, "Modus", icon="⚡")
        c_mod.pack(side=tk.LEFT, fill=tk.BOTH, padx=(0, 10))

        tk.Radiobutton(b_mod, text="🔍 Test",
                       variable=self.dry_run, value=True,
                       font=(Theme.FONT, 10, "bold"),
                       fg=Theme.GREEN, bg=Theme.BG_CARD, selectcolor=Theme.BG_INPUT,
                       activebackground=Theme.BG_CARD,
                       activeforeground=Theme.GREEN,
                       cursor='hand2').pack(anchor='w', pady=2)
        tk.Radiobutton(b_mod, text="⚡ Echt",
                       variable=self.dry_run, value=False,
                       font=(Theme.FONT, 10, "bold"),
                       fg=Theme.RED, bg=Theme.BG_CARD, selectcolor=Theme.BG_INPUT,
                       activebackground=Theme.BG_CARD,
                       activeforeground=Theme.RED,
                       cursor='hand2').pack(anchor='w', pady=2)

        c_prog, b_prog = _chk_card(top_row, "Fortschritt", icon="📶")
        c_prog.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self.progress = ttk.Progressbar(b_prog, orient=tk.HORIZONTAL,
                                        mode='determinate', maximum=100,
                                        variable=self.progress_val,
                                        style="Modern.Horizontal.TProgressbar")
        self.progress.pack(fill=tk.X, pady=(6, 4))
        tk.Label(b_prog, textvariable=self.progress_var,
                 font=(Theme.FONT_MONO, 9),
                 fg=Theme.TEXT_DIM, bg=Theme.BG_CARD,
                 anchor='w').pack(fill=tk.X)

        act = tk.Frame(body, bg=Theme.BG)
        act.pack(fill=tk.X, pady=(10, 0))

        _chk_button(act, "Analysieren (alle)",
                    lambda: self.start("analyse_all"),
                    kind="primary", icon="🔍").pack(side=tk.LEFT, padx=(0, 6))
        _chk_button(act, "Analysieren (markiert)",
                    lambda: self.start_analyse_selected(),
                    kind="primary", icon="🔍").pack(side=tk.LEFT, padx=(0, 6))
        _chk_button(act, "A ↔ B vergleichen (erste 2)",
                    lambda: self.start("compare"),
                    kind="primary", icon="🔀").pack(side=tk.LEFT, padx=(0, 6))
        _chk_button(act, "Fix: Bindestriche (Quelle 1)",
                    lambda: self.start("apply_fix"),
                    kind="danger", icon="✏️").pack(side=tk.LEFT, padx=(0, 6))
        _chk_button(act, "Fix: Leerzeichen (Quelle 1)",
                    lambda: self.start("apply_space_fix"),
                    kind="danger", icon="✏️").pack(side=tk.LEFT, padx=(0, 6))
        _chk_button(act, "🔄 Neu analysieren (alle)",
                    lambda: self.start("analyse_all"),
                    kind="secondary").pack(side=tk.LEFT)

        c_chk, b_chk = _chk_card(body, "Prüfungen auswählen", icon="✅")
        c_chk.pack(fill=tk.X, pady=(10, 0))

        grid = tk.Frame(b_chk, bg=Theme.BG_CARD)
        grid.pack(fill=tk.X)
        cols = 4
        for i, (key, label) in enumerate(ALL_CHECKS):
            r = i // cols
            c = i % cols
            tk.Checkbutton(grid, text=label,
                           variable=self.check_vars[key],
                           font=(Theme.FONT, 10),
                           fg=Theme.TEXT, bg=Theme.BG_CARD,
                           selectcolor=Theme.BG_INPUT,
                           activebackground=Theme.BG_CARD,
                           activeforeground=Theme.GREEN,
                           anchor='w', cursor='hand2'
                           ).grid(row=r, column=c, sticky='w',
                                  padx=4, pady=2)

        row_chk = tk.Frame(b_chk, bg=Theme.BG_CARD)
        row_chk.pack(fill=tk.X, pady=(6, 0))
        _chk_button(row_chk, "Alle", self.check_all,
                    kind="secondary", icon="✅").pack(side=tk.LEFT, padx=(0, 6))
        _chk_button(row_chk, "Keine", self.check_none,
                    kind="secondary", icon="⬜").pack(side=tk.LEFT, padx=(0, 6))
        _chk_button(row_chk, "Standard", self.check_default,
                    kind="secondary", icon="🎯").pack(side=tk.LEFT, padx=(0, 12))

        tk.Label(row_chk, text="  |  Duplikate (Quelle 1):",
                 font=(Theme.FONT, 10, "bold"),
                 fg=Theme.TEXT_DIM, bg=Theme.BG_CARD).pack(side=tk.LEFT, padx=(0, 6))
        _chk_button(row_chk, "🗑 Exakte Zeilen-Duplikate löschen",
                    self.delete_exact_duplicates,
                    kind="danger").pack(side=tk.LEFT, padx=(0, 6))
        _chk_button(row_chk, "🗑 Match-Key-Duplikate löschen",
                    self.delete_key_duplicates,
                    kind="danger").pack(side=tk.LEFT)

        self.nb = ttk.Notebook(body)
        self.nb.pack(fill=tk.BOTH, expand=True, pady=(10, 0))

        self.tab_cmp = self._make_compare_tab(self.nb)
        self.tab_fix = self._make_fix_tab(self.nb)

    def _make_compare_tab(self, nb):
        frame = tk.Frame(nb, bg=Theme.BG)
        nb.add(frame, text="  🔀 Vergleich  ")
        top = tk.Frame(frame, bg=Theme.BG)
        top.pack(fill=tk.X)
        self.cmp_label = tk.Label(top, text="Noch kein Vergleich",
                                  font=(Theme.FONT, 10, "bold"),
                                  fg=Theme.TEXT_DIM, bg=Theme.BG, anchor='w')
        self.cmp_label.pack(fill=tk.X, padx=8, pady=6)

        wrap = tk.Frame(frame, bg=Theme.BG)
        wrap.pack(fill=tk.BOTH, expand=True)
        self.cmp_text = tk.Text(wrap, bg=Theme.BG_INPUT, fg=Theme.TEXT,
                                font=(Theme.FONT_MONO, 11),
                                relief=tk.FLAT, bd=0,
                                highlightthickness=1,
                                highlightbackground=Theme.BORDER,
                                wrap="none",
                                padx=12, pady=10)
        self.cmp_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        vsb = tk.Scrollbar(wrap, orient=tk.VERTICAL, command=self.cmp_text.yview)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)
        self.cmp_text.configure(yscrollcommand=vsb.set)
        return frame

    def _make_fix_tab(self, nb):
        frame = tk.Frame(nb, bg=Theme.BG)
        nb.add(frame, text="  ✏️ Fix  ")
        tk.Label(frame,
                 text="Vorschau: Namen-Fixes (Quelle 1)",
                 font=(Theme.FONT, 11, "bold"),
                 fg=Theme.TEXT, bg=Theme.BG).pack(anchor='w', padx=10, pady=(10, 4))
        wrap = tk.Frame(frame, bg=Theme.BG)
        wrap.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))
        self.fix_text = tk.Text(wrap, bg=Theme.BG_INPUT, fg=Theme.TEXT,
                                font=(Theme.FONT_MONO, 11),
                                relief=tk.FLAT, bd=0,
                                highlightthickness=1,
                                highlightbackground=Theme.BORDER,
                                padx=12, pady=10)
        self.fix_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        vsb = tk.Scrollbar(wrap, orient=tk.VERTICAL, command=self.fix_text.yview)
        vsb.pack(side=tk.RIGHT, fill=tk.Y)
        self.fix_text.configure(yscrollcommand=vsb.set)
        return frame

    # ---------- Multi-Datei-Verwaltung ----------
    def add_files(self):
        paths = filedialog.askopenfilenames(
            title="Eine oder mehrere Dateien wählen",
            filetypes=[
                ("Alle unterstützten", "*.db *.sqlite *.csv *.xlsx *.xls *.json"),
                ("SQLite", "*.db *.sqlite"),
                ("CSV", "*.csv"),
                ("Excel", "*.xlsx *.xls"),
                ("JSON", "*.json"),
                ("Alle Dateien", "*.*"),
            ])
        if not paths:
            return
        added = 0
        for p in paths:
            if any(s["path"] == p for s in self.sources):
                continue
            self.sources.append({
                "path": p,
                "df": None,
                "res": None,
                "table": None,
                "view": None,
                "tab": None,
            })
            added += 1
        self._refresh_source_list()
        if added:
            self.set_progress(0, f"{added} Datei(en) hinzugefügt")

    def remove_selected(self):
        sel = list(self.src_listbox.curselection())
        if not sel:
            return
        for idx in sorted(sel, reverse=True):
            src = self.sources[idx]
            if src.get("tab") is not None:
                try:
                    self.nb.forget(src["tab"])
                except Exception:
                    pass
            del self.sources[idx]
        self._refresh_source_list()

    def remove_all(self):
        for src in self.sources:
            if src.get("tab") is not None:
                try:
                    self.nb.forget(src["tab"])
                except Exception:
                    pass
        self.sources.clear()
        self._refresh_source_list()

    def _refresh_source_list(self):
        self.src_listbox.delete(0, tk.END)
        for s in self.sources:
            self.src_listbox.insert(tk.END, s["path"])

    def _ensure_tab(self, idx):
        src = self.sources[idx]
        if src.get("tab") is not None:
            return src["tab"]

        view = CheckProblemView(self.nb, idx,
                                self._open_row,
                                self._show_row_menu)
        name = os.path.basename(src["path"])
        label = f"  📊 {name[:22]}  "
        self.nb.add(view, text=label)
        src["view"] = view
        src["tab"] = view
        return view

    # ---------- Analyse-Start ----------
    def start_analyse_selected(self):
        if not self.sources:
            messagebox.showwarning("Hinweis", "Keine Dateien ausgewählt.")
            return
        sel = list(self.src_listbox.curselection())
        if not sel:
            self.start("analyse_all")
            return
        self.start("analyse_selected", indices=sel)

    def start(self, action, **kwargs):
        threading.Thread(target=self._run, args=(action,),
                         kwargs=kwargs, daemon=True).start()

    def _run(self, action, **kwargs):
        try:
            if action == "analyse_all":
                self._analyse_indices(list(range(len(self.sources))))
            elif action == "analyse_selected":
                self._analyse_indices(kwargs.get("indices", []))
            elif action == "compare":
                self._compare()
            elif action == "apply_fix":
                self._apply_fix()
            elif action == "apply_space_fix":
                self._apply_space_fix()
        except Exception as e:
            traceback.print_exc()
            messagebox.showerror("Fehler", f"{e}\n\n{traceback.format_exc()}")
        finally:
            self.set_progress(0, "Bereit")

    # ---------- Analyse aller markierten Quellen ----------
    def _analyse_indices(self, indices):
        if not indices:
            return
        checks = self.active_checks()
        total = len(indices)

        batch_results = []
        for n, idx in enumerate(indices, 1):
            src = self.sources[idx]
            path = src["path"]
            name = os.path.basename(path)
            self.set_progress(int((n - 1) / max(total, 1) * 100),
                              f"[{n}/{total}] Analysiere {name} ...")

            def prog(pct, msg, _n=n, _total=total, _name=name):
                overall = int(((_n - 1) + pct / 100) / max(_total, 1) * 100)
                self.set_progress(overall, f"[{_n}/{_total}] {_name}: {msg}")

            try:
                df, info, table = check_load_source(path)
                res = check_analyse(df, checks, progress=prog)
            except Exception as e:
                traceback.print_exc()
                batch_results.append((idx, None, None, None, str(e)))
                continue

            src["df"] = df
            src["res"] = res
            src["table"] = table
            batch_results.append((idx, info, df, res, None))

        self.set_progress(95, "Befülle Ansichten ...")
        for idx, info, df, res, err in batch_results:
            if err is not None:
                continue
            view = self._ensure_tab(idx)
            self._fill_problem_view(view, info, df, res, checks, idx)

        self._show_batch_popup(batch_results, checks)

        self.set_progress(100, f"Fertig: {total} Datei(en) analysiert")

    def _show_batch_popup(self, batch_results, checks):
        lines = []
        total_files = len(batch_results)
        ok_files = 0
        err_files = 0

        check_labels = {
            "dash":           "Bindestriche",
            "space":          "Doppelte/außenlieg. Leerzeichen",
            "dash_collision": "Kollision mit/ohne Bindestrich",
            "exact_dup":      "Exakte Zeilen-Duplikate",
            "key_dup":        "Match-Key-Duplikate",
            "missing":        "Felder mit fehlenden Werten",
            "score_format":   "Ungültige Scores",
            "date_format":    "Ungültige Datum-Formate",
            "rounds":         "Unbekannte Runden",
            "best_of":        "Ungültige best_of",
            "surface":        "Ungültige Surface",
            "level":          "Ungültige Tourney-Level",
            "same_player":    "Winner = Loser",
            "age":            "Unrealistisches Alter",
            "match_num_dup":  "match_num doppelt",
            "id_name":        "Spieler-ID ↔ Name",
        }

        for idx, info, df, res, err in batch_results:
            name = os.path.basename(self.sources[idx]["path"])
            lines.append(f"── {idx + 1}. {name} ──")
            if err is not None:
                err_files += 1
                lines.append(f"   ❌ Fehler: {err}")
                lines.append("")
                continue

            ok_files += 1
            lines.append(f"   Zeilen: {res['total_rows']:,}")

            def count(label, n):
                marker = "⚠️" if n else "✅"
                lines.append(f"   {marker} {label}: {n}")

            if "dash" in checks:
                count(check_labels["dash"], len(res.get("dash_names", [])))
            if "space" in checks:
                count(check_labels["space"], len(res.get("space_names", [])))
            if "dash_collision" in checks:
                count(check_labels["dash_collision"],
                      len(res.get("dash_kollisionen", [])))
            if "exact_dup" in checks:
                count(check_labels["exact_dup"],
                      len(res.get("exact_dup_idx", [])))
            if "key_dup" in checks:
                count(check_labels["key_dup"],
                      len(res.get("key_dupes", [])))
            if "missing" in checks:
                n_miss = sum(1 for _, (n, _p, _i)
                             in res.get("fehlend", {}).items() if n)
                count(check_labels["missing"], n_miss)
            if "score_format" in checks:
                count(check_labels["score_format"],
                      len(res.get("score_bad", [])))
            if "date_format" in checks:
                count(check_labels["date_format"],
                      len(res.get("date_bad", [])))
            if "rounds" in checks:
                count(check_labels["rounds"],
                      len(res.get("rounds_unknown", [])))
            if "best_of" in checks:
                count(check_labels["best_of"],
                      len(res.get("best_of_bad", [])))
            if "surface" in checks:
                count(check_labels["surface"],
                      len(res.get("surface_bad", [])))
            if "level" in checks:
                count(check_labels["level"],
                      len(res.get("level_bad", [])))
            if "same_player" in checks:
                count(check_labels["same_player"],
                      len(res.get("same_player_idx", [])))
            if "age" in checks:
                n_age = len(res.get("age_bad_winner", [])) + \
                        len(res.get("age_bad_loser", []))
                count(check_labels["age"], n_age)
            if "match_num_dup" in checks:
                count(check_labels["match_num_dup"],
                      len(res.get("match_num_dupes", [])))
            if "id_name" in checks:
                count(check_labels["id_name"],
                      len(res.get("id_name_collisions", [])))

            lines.append("")

        header = [f"Analyse abgeschlossen",
                  f"Dateien: {total_files}  (OK: {ok_files}, "
                  f"Fehler: {err_files})",
                  ""]

        content = "\n".join(header + lines)

        if total_files <= 3:
            messagebox.showinfo("Analyse abgeschlossen", content)
        else:
            win = tk.Toplevel(self.parent)
            win.title("Analyse abgeschlossen")
            win.configure(bg=Theme.BG)
            try:
                win.state("zoomed")
            except tk.TclError:
                try:
                    win.attributes("-zoomed", True)
                except tk.TclError:
                    win.geometry("1000x800")
            win.minsize(700, 500)

            txt = tk.Text(win, bg=Theme.BG_INPUT, fg=Theme.TEXT,
                          font=(Theme.FONT_MONO, 11),
                          relief=tk.FLAT, bd=0,
                          highlightthickness=1,
                          highlightbackground=Theme.BORDER,
                          padx=16, pady=14, wrap="word")
            txt.pack(fill=tk.BOTH, expand=True, padx=20, pady=(20, 10))
            txt.insert(tk.END, content)
            txt.configure(state=tk.DISABLED)

            bar = tk.Frame(win, bg=Theme.BG)
            bar.pack(fill=tk.X, padx=20, pady=(0, 20))
            _chk_button(bar, "Schließen", win.destroy,
                        kind="primary").pack(side=tk.RIGHT)

    def _fill_problem_view(self, view, info, df, res, checks, idx):
        view.clear()

        view.add_info("Quelle", info)
        view.add_info("Zeilen gesamt", f"{res['total_rows']:,}")
        view.add_info("Spalten", ", ".join(res['columns']))

        if "dash" in checks:
            view.add_sep()
            items = res.get("dash_names", [])
            view.add_header("Namen mit Bindestrich",
                            f"{len(items)} Vorkommen / "
                            f"{len(res.get('dash_names_unique', []))} eindeutig")
            for (name, col, ridx) in items[:500]:
                view.add_problem(f"{col}: {name}",
                                 f"→ Zeile {ridx}  (anklicken)", ridx)

        if "space" in checks:
            view.add_sep()
            items = res.get("space_names", [])
            view.add_header("Doppelte / außenliegende Leerzeichen", len(items))
            for (name, col, ridx) in items[:500]:
                sichtbar = name.replace(" ", "·")
                view.add_problem(f"{col}: {sichtbar}",
                                 f"→ Zeile {ridx}  (anklicken)", ridx)

        if "dash_collision" in checks:
            view.add_sep()
            koll = res.get("dash_kollisionen", [])
            view.add_header("Kollision mit/ohne Bindestrich", len(koll))
            for d, ohne, rows in koll:
                for col, ridx in rows[:50]:
                    view.add_problem(f"{col}: {d}",
                                     f"↔ {ohne}   → Zeile {ridx}", ridx)

        if "exact_dup" in checks:
            view.add_sep()
            ridxs = res.get("exact_dup_idx", [])
            view.add_header("Exakte Zeilen-Duplikate", len(ridxs))
            for ridx in ridxs[:500]:
                try:
                    r = df.loc[ridx]
                    view.add_problem(
                        "Duplikat",
                        f"Zeile {ridx}: {r.get('tourney_id')} | "
                        f"{r.get('round')} | "
                        f"{r.get('winner_name')} vs {r.get('loser_name')}",
                        ridx)
                except Exception:
                    pass

        if "key_dup" in checks:
            view.add_sep()
            kd = res.get("key_dupes", [])
            view.add_header("Match-Key-Duplikate", len(kd))
            for n, rec, ridxs in kd[:200]:
                for ridx in ridxs:
                    view.add_problem(
                        f"{n}x",
                        f"{rec['tourney_id']} | {rec['tourney_date']} | "
                        f"{rec['round']} | {rec['winner_name']} vs "
                        f"{rec['loser_name']}   → Zeile {ridx}",
                        ridx)

        if "missing" in checks:
            view.add_sep()
            view.add_header("Fehlende Werte")
            for c, (n, pct, ridxs) in res.get("fehlend", {}).items():
                if n is None:
                    view.add_info(c, "Spalte fehlt")
                else:
                    view.add_info(c, f"{n:,}  ({pct:.2f} %)")
                    for ridx in ridxs[:100]:
                        view.add_problem(f"{c} leer", f"→ Zeile {ridx}", ridx)

        if "score_format" in checks:
            view.add_sep()
            items = res.get("score_bad", [])
            view.add_header("Ungültige Score-Formate", len(items))
            for s, ridx in items[:500]:
                view.add_problem("Score", f"{s}   → Zeile {ridx}", ridx)

        if "date_format" in checks:
            view.add_sep()
            items = res.get("date_bad", [])
            view.add_header("Ungültige Datum-Formate", len(items))
            for d, ridx in items[:500]:
                view.add_problem("Datum", f"{d}   → Zeile {ridx}", ridx)

        if "rounds" in checks:
            view.add_sep()
            view.add_header("Runden-Verteilung")
            for r, n in res.get("rounds_count", Counter()).most_common():
                view.add_info(r, f"{n:,}")
            unk = res.get("rounds_unknown", [])
            if unk:
                view.add_header("Unbekannte Runden", len(unk))
                for r, ridx in unk[:200]:
                    view.add_problem("Runde", f"{r}   → Zeile {ridx}", ridx)

        if "best_of" in checks:
            view.add_sep()
            items = res.get("best_of_bad", [])
            view.add_header("Ungültige best_of-Werte", len(items))
            for v, ridx in items[:500]:
                view.add_problem("best_of", f"{v}   → Zeile {ridx}", ridx)

        if "surface" in checks:
            view.add_sep()
            items = res.get("surface_bad", [])
            view.add_header("Ungültige Surface-Werte", len(items))
            for v, ridx in items[:500]:
                view.add_problem("Surface", f"{v}   → Zeile {ridx}", ridx)

        if "level" in checks:
            view.add_sep()
            items = res.get("level_bad", [])
            view.add_header("Ungültige Tourney-Level", len(items))
            for v, ridx in items[:500]:
                view.add_problem("Level", f"{v}   → Zeile {ridx}", ridx)

        if "same_player" in checks:
            view.add_sep()
            ridxs = res.get("same_player_idx", [])
            view.add_header("Winner = Loser", len(ridxs))
            for ridx in ridxs[:500]:
                view.add_problem("gleicher Spieler", f"→ Zeile {ridx}", ridx)

        if "age" in checks:
            view.add_sep()
            for label, items in (("Winner", res.get("age_bad_winner", [])),
                                 ("Loser",  res.get("age_bad_loser", []))):
                view.add_header(f"Unrealistisches Alter ({label})", len(items))
                for v, ridx in items[:500]:
                    view.add_problem(f"{label} Alter", f"{v}   → Zeile {ridx}", ridx)

        if "match_num_dup" in checks:
            view.add_sep()
            mnd = res.get("match_num_dupes", [])
            view.add_header("match_num doppelt pro Turnier+Runde", len(mnd))
            for n, key, ridxs in mnd[:200]:
                # key ist (tid, mnum) oder (tid, mnum, rnd)
                if len(key) == 3:
                    tid, mnum, rnd = key
                    label = f"{tid} | {rnd} | match_num={mnum}"
                else:
                    tid, mnum = key
                    label = f"{tid} | match_num={mnum}"
                for ridx in ridxs:
                    view.add_problem(f"{n}x", f"{label}   → Zeile {ridx}", ridx)

        if "id_name" in checks:
            view.add_sep()
            coll = res.get("id_name_collisions", [])
            view.add_header("Spieler-ID ↔ Name inkonsistent", len(coll))
            for id_col, bid, names, ridxs in coll[:200]:
                for ridx in ridxs:
                    view.add_problem(f"{id_col}={bid}",
                                     " | ".join(names) + f"   → Zeile {ridx}",
                                     ridx)

    # ---------- Klick-Handler ----------
    def _open_row(self, src_idx, row_idx):
        try:
            src = self.sources[src_idx] if isinstance(src_idx, int) else None
            if src is None:
                return
            df = src["df"]
            path = src["path"]
            if df is None or not path:
                return
            if row_idx not in df.index:
                messagebox.showwarning("Hinweis",
                                       f"Zeile {row_idx} nicht im DataFrame.")
                return
            CheckRowEditWindow(self.parent, self, df, row_idx, path, src_idx,
                               title=f"Quelle {src_idx + 1}")
        except Exception:
            traceback.print_exc()
            messagebox.showerror("Fehler beim Öffnen",
                                 traceback.format_exc())

    def _show_row_menu(self, event, src_idx, row_idx):
        src = self.sources[src_idx] if isinstance(src_idx, int) else None
        if src is None:
            return
        menu = tk.Menu(self.parent, tearoff=0,
                       bg=Theme.BG_CARD, fg=Theme.TEXT,
                       activebackground=Theme.GREEN_DARK,
                       activeforeground="#ffffff",
                       bd=0)
        menu.add_command(label="✏️ Zeile bearbeiten",
                         command=lambda: self._open_row(src_idx, row_idx))
        menu.add_command(label="🗑 Zeile löschen",
                         command=lambda: self._delete_single(src_idx, row_idx))
        menu.add_command(label="📋 Zeilennummer kopieren",
                         command=lambda: self.parent.clipboard_append(str(row_idx)))
        menu.add_command(label="📂 Quelldatei öffnen",
                         command=lambda: check_open_with_default_app(src["path"]))
        menu.tk_popup(event.x_root, event.y_root)

    def _delete_single(self, src_idx, row_idx):
        src = self.sources[src_idx]
        ok = messagebox.askyesno(
            "Zeile löschen?",
            f"Zeile {row_idx} wird dauerhaft aus der Quelle entfernt.\n\n"
            f"{src['path']}\n\nFortfahren?")
        if not ok:
            return
        try:
            self.delete_rows(src_idx, [row_idx])
        except Exception as e:
            traceback.print_exc()
            messagebox.showerror("Fehler beim Löschen",
                                 f"{e}\n\n{traceback.format_exc()}")
            return
        messagebox.showinfo(
            "Gelöscht",
            f"Zeile {row_idx} wurde entfernt.\n\n"
            f"Zum Aktualisieren „🔄 Neu analysieren“ klicken.")

    # ---------- Duplikate löschen ----------
    def delete_exact_duplicates(self):
        self._delete_duplicates(kind="exact", src_idx=0)

    def delete_key_duplicates(self):
        self._delete_duplicates(kind="key", src_idx=0)

    def _delete_duplicates(self, kind, src_idx):
        if not self.sources:
            messagebox.showwarning("Hinweis", "Keine Quelle geladen.")
            return
        src = self.sources[src_idx]
        res = src["res"]
        df = src["df"]
        path = src["path"]
        if res is None or df is None or not path:
            messagebox.showwarning("Hinweis",
                                   "Bitte zuerst diese Quelle analysieren.")
            return

        if kind == "exact":
            to_delete = res.get("exact_dup_delete_idx", [])
            label = "exakte Zeilen-Duplikate"
        else:
            to_delete = []
            for _n, _rec, idxs in res.get("key_dupes", []):
                for i in idxs[1:]:
                    to_delete.append(int(i))
            label = "Match-Key-Duplikate"

        if not to_delete:
            messagebox.showinfo("Löschen",
                                f"Keine {label} zum Löschen gefunden.")
            return

        ok = messagebox.askyesno(
            "Duplikate löschen?",
            f"Es werden {len(to_delete)} Zeilen aus der Quelle entfernt.\n\n"
            f"Art: {label}\n"
            f"Datei: {os.path.basename(path)}\n\n"
            f"Pro Gruppe wird jeweils die ERSTE Zeile behalten.\n\n"
            f"Fortfahren?")
        if not ok:
            return

        try:
            self.delete_rows(src_idx, to_delete)
        except Exception as e:
            traceback.print_exc()
            messagebox.showerror("Fehler beim Löschen",
                                 f"{e}\n\n{traceback.format_exc()}")
            return
        messagebox.showinfo(
            "Gelöscht",
            f"{len(to_delete)} Zeilen wurden entfernt.\n\n"
            f"Zum Aktualisieren „🔄 Neu analysieren“ klicken.")

    # ========================================================
    # DB-SCHREIBEN: Löschen
    # ========================================================
    def delete_rows(self, src_idx, row_idxs):
        src = self.sources[src_idx]
        path = src["path"]
        df = src["df"]
        table = src["table"]
        if df is None or not path:
            raise RuntimeError("Keine Quelle geladen")

        ext = Path(path).suffix.lower()
        row_idxs = sorted(set(int(i) for i in row_idxs), reverse=True)

        if ext in (".db", ".sqlite"):
            tbl = table or "matches"
            con = check_db_connect(path)
            try:
                cur = con.cursor()
                for idx in row_idxs:
                    if idx not in df.index:
                        continue
                    rowid = idx + 1
                    cur.execute(f"SELECT rowid FROM {tbl} WHERE rowid = ?",
                                (rowid,))
                    hit = cur.fetchone()
                    if hit is None:
                        key_vals = {}
                        for kc in ("tourney_id", "tourney_date", "round",
                                   "winner_name", "loser_name"):
                            if kc in df.columns:
                                key_vals[kc] = df.at[idx, kc]
                        if not key_vals:
                            continue
                        where = " AND ".join(f"{k} = ?" for k in key_vals)
                        cur.execute(f"DELETE FROM {tbl} WHERE {where}",
                                    list(key_vals.values()))
                    else:
                        cur.execute(f"DELETE FROM {tbl} WHERE rowid = ?",
                                    (rowid,))
                con.commit()
            except Exception:
                try:
                    con.rollback()
                except Exception:
                    pass
                raise
            finally:
                con.close()

        else:
            df_new = df.drop(index=row_idxs, errors="ignore")
            check_save_dataframe_to_file(path, df_new)

        src["df"] = df.drop(index=row_idxs, errors="ignore").reset_index(drop=True)

    # ========================================================
    # DB-SCHREIBEN: Zeile bearbeiten
    # ========================================================
    def apply_row_changes(self, src_idx, row_idx, changes):
        src = self.sources[src_idx]
        path = src["path"]
        df = src["df"]
        table = src["table"]
        if df is None or not path:
            raise RuntimeError("Keine Quelle geladen")

        ext = Path(path).suffix.lower()

        if ext in (".db", ".sqlite"):
            tbl = table or "matches"
            con = check_db_connect(path)
            try:
                cur = con.cursor()

                set_sql = ", ".join(f"{c} = ?" for c in changes.keys())
                vals    = list(changes.values())
                target_rowid = row_idx + 1

                cur.execute(f"SELECT rowid FROM {tbl} WHERE rowid = ?",
                            (target_rowid,))
                hit = cur.fetchone()

                if hit is None:
                    key_vals = {}
                    for kc in ("tourney_id", "tourney_date", "round",
                               "winner_name", "loser_name"):
                        if kc in df.columns:
                            key_vals[kc] = df.at[row_idx, kc]

                    if not key_vals:
                        raise RuntimeError(
                            "Kein Schlüssel zum Auffinden der Zeile in der DB.")

                    where = " AND ".join(f"{k} = ?" for k in key_vals)
                    sql = f"UPDATE {tbl} SET {set_sql} WHERE {where}"
                    cur.execute(sql, vals + list(key_vals.values()))
                    if cur.rowcount == 0:
                        raise RuntimeError(
                            "Kein Treffer in der DB – Zeile nicht gefunden.")
                else:
                    sql = f"UPDATE {tbl} SET {set_sql} WHERE rowid = ?"
                    cur.execute(sql, vals + [target_rowid])

                con.commit()
            except Exception:
                try:
                    con.rollback()
                except Exception:
                    pass
                raise
            finally:
                con.close()

            for c, v in changes.items():
                df.at[row_idx, c] = v

        else:
            for c, v in changes.items():
                df.at[row_idx, c] = v
            check_save_dataframe_to_file(path, df)

    # ---------- Vergleich ----------
    def _compare(self):
        if len(self.sources) < 2:
            messagebox.showwarning("Hinweis",
                                   "Für den Vergleich mindestens 2 Dateien laden.")
            return
        src_a = self.sources[0]
        src_b = self.sources[1]
        if src_a["df"] is None or src_b["df"] is None:
            messagebox.showwarning("Hinweis",
                                   "Bitte zuerst die ersten beiden Quellen analysieren.")
            return
        self.set_progress(20, "Vergleiche ...")
        r = check_compare_dfs(src_a["df"], src_b["df"], "A", "B")
        if "only_a" not in r:
            messagebox.showerror("Fehler",
                                 "Vergleich nicht möglich – fehlende Schlüsselspalten")
            self.set_progress(0, "Bereit")
            return

        name_a = os.path.basename(src_a["path"])
        name_b = os.path.basename(src_b["path"])
        self.cmp_label.config(
            text=f"A={name_a}   |   B={name_b}   |   "
                 f"Nur in A: {len(r['only_a']):,}   |   "
                 f"Nur in B: {len(r['only_b']):,}   |   "
                 f"Gemeinsam: {len(r['common']):,}")

        t = self.cmp_text
        t.configure(state=tk.NORMAL)
        t.delete("1.0", tk.END)
        t.insert(tk.END, f"A = {name_a}\nB = {name_b}\n\n")
        t.insert(tk.END, f"─── Nur in A ({len(r['only_a'])}) ───\n")
        for k in sorted(r["only_a"])[:500]:
            t.insert(tk.END, "  " + " | ".join(k) + "\n")
        t.insert(tk.END, f"\n─── Nur in B ({len(r['only_b'])}) ───\n")
        for k in sorted(r["only_b"])[:500]:
            t.insert(tk.END, "  " + " | ".join(k) + "\n")
        t.configure(state=tk.DISABLED)

        self.set_progress(100, "Vergleich fertig")
        messagebox.showinfo(
            "Vergleich fertig",
            f"Nur in A: {len(r['only_a']):,}\n"
            f"Nur in B: {len(r['only_b']):,}\n"
            f"Gemeinsam: {len(r['common']):,}")

    # ---------- Fix Bindestriche (Quelle 1) ----------
    def _apply_fix(self):
        if not self.sources:
            messagebox.showwarning("Hinweis", "Keine Quelle geladen.")
            return
        src = self.sources[0]
        if src["df"] is None or src["res"] is None:
            messagebox.showwarning("Hinweis",
                                   "Bitte zuerst Quelle 1 analysieren.")
            return
        path = src["path"]
        res = src["res"]
        fix_map = {}
        for d, ohne, _rows in res.get("dash_kollisionen", []):
            fix_map[d] = ohne
        for d in res.get("dash_names_unique", []):
            if d in fix_map:
                continue
            ohne = re.sub(r"\s+", " ", d.replace("-", " ")).strip()
            fix_map[d] = ohne

        t = self.fix_text
        t.configure(state=tk.NORMAL)
        t.delete("1.0", tk.END)
        t.insert(tk.END, "Vorschau: Bindestrich-Fix (Quelle 1)\n")
        t.insert(tk.END, "─" * 60 + "\n\n")
        if not fix_map:
            t.insert(tk.END, "Keine Namen mit Bindestrich.\n")
        else:
            for alt, neu in sorted(fix_map.items()):
                t.insert(tk.END, f"{alt:<40} → {neu}\n")
        t.configure(state=tk.DISABLED)
        self.nb.select(self.tab_fix)

        if not fix_map:
            messagebox.showinfo("Fix: Bindestriche",
                                "Keine Namen mit Bindestrich zu ändern.")
            return

        if self.dry_run.get():
            self.set_progress(100, "Testmodus – nichts geschrieben")
            messagebox.showinfo(
                "Testmodus",
                f"Testmodus aktiv – es wird nichts geschrieben.\n\n"
                f"{len(fix_map)} Namen würden geändert:\n" +
                "\n".join(f"  {k} → {v}"
                          for k, v in list(fix_map.items())[:20]))
            return

        self.set_progress(20, "Schreibe Änderungen ...")
        try:
            changed = self._apply_name_fix_to_source(src, fix_map)
        except Exception as e:
            self.set_progress(0, "Bereit")
            traceback.print_exc()
            messagebox.showerror("Fehler beim Schreiben",
                                 f"{e}\n\n{traceback.format_exc()}")
            return

        if changed == 0:
            self.set_progress(0, "Bereit")
            messagebox.showinfo("Fix: Bindestriche",
                                "Keine Änderungen nötig.")
            return

        messagebox.showinfo(
            "Fix: Bindestriche gespeichert",
            f"{changed} Zellen geändert.\nDatei: {path}\n\n"
            f"Zum Aktualisieren „🔄 Neu analysieren“ klicken.")

    # ---------- Fix Leerzeichen (Quelle 1) ----------
    def _apply_space_fix(self):
        if not self.sources:
            messagebox.showwarning("Hinweis", "Keine Quelle geladen.")
            return
        src = self.sources[0]
        if src["df"] is None or src["res"] is None:
            messagebox.showwarning("Hinweis",
                                   "Bitte zuerst Quelle 1 analysieren.")
            return
        path = src["path"]
        df = src["df"]

        fix_map = {}
        for c in ("winner_name", "loser_name"):
            if c not in df.columns:
                continue
            for n in df[c].dropna().unique():
                if not isinstance(n, str):
                    continue
                cleaned = re.sub(r"\s+", " ", n).strip()
                if cleaned != n:
                    fix_map[n] = cleaned

        t = self.fix_text
        t.configure(state=tk.NORMAL)
        t.delete("1.0", tk.END)
        t.insert(tk.END, "Vorschau: Leerzeichen-Fix (Quelle 1)\n")
        t.insert(tk.END, "─" * 60 + "\n\n")
        if not fix_map:
            t.insert(tk.END, "Keine Namen mit Leerzeichen-Problemen.\n")
        else:
            for alt, neu in sorted(fix_map.items()):
                sichtbar_alt = alt.replace(" ", "·")
                sichtbar_neu = neu.replace(" ", "·")
                t.insert(tk.END,
                         f"{sichtbar_alt:<50} → {sichtbar_neu}\n")
        t.configure(state=tk.DISABLED)
        self.nb.select(self.tab_fix)

        if not fix_map:
            messagebox.showinfo("Fix: Leerzeichen",
                                "Keine Namen mit Leerzeichen-Problemen.")
            return

        if self.dry_run.get():
            self.set_progress(100, "Testmodus – nichts geschrieben")
            messagebox.showinfo(
                "Testmodus",
                f"Testmodus aktiv – es wird nichts geschrieben.\n\n"
                f"{len(fix_map)} Namen würden bereinigt:\n" +
                "\n".join(f"  {a!r} → {b!r}"
                          for a, b in list(fix_map.items())[:20]))
            return

        self.set_progress(20, "Schreibe Änderungen ...")
        try:
            changed = self._apply_name_fix_to_source(src, fix_map)
        except Exception as e:
            self.set_progress(0, "Bereit")
            traceback.print_exc()
            messagebox.showerror("Fehler beim Schreiben",
                                 f"{e}\n\n{traceback.format_exc()}")
            return

        if changed == 0:
            self.set_progress(0, "Bereit")
            messagebox.showinfo("Fix: Leerzeichen",
                                "Keine Änderungen nötig.")
            return

        messagebox.showinfo(
            "Fix: Leerzeichen gespeichert",
            f"{changed} Zellen bereinigt.\nDatei: {path}\n\n"
            f"Zum Aktualisieren „🔄 Neu analysieren“ klicken.")

    # ========================================================
    # Namens-Mapping auf Quelle anwenden (DB + Datei)
    # ========================================================
    def _apply_name_fix_to_source(self, src, fix_map):
        path = src["path"]
        df = src["df"]
        table = src["table"]
        ext = Path(path).suffix.lower()

        if ext in (".db", ".sqlite"):
            tbl = table or "matches"
            con = check_db_connect(path)
            try:
                cur = con.cursor()
                total_changed = 0
                for alt, neu in fix_map.items():
                    for col in ("winner_name", "loser_name"):
                        cur.execute(
                            f"UPDATE {tbl} SET {col} = ? WHERE {col} = ?",
                            (neu, alt))
                        total_changed += cur.rowcount
                con.commit()
            except Exception:
                try:
                    con.rollback()
                except Exception:
                    pass
                raise
            finally:
                con.close()

            df.replace(fix_map, inplace=True)
            src["df"] = df
            return total_changed

        df_new = df.copy()
        changed = 0
        for col in ("winner_name", "loser_name"):
            if col not in df_new.columns:
                continue
            before = df_new[col].copy()
            df_new[col] = df_new[col].replace(fix_map)
            changed += int((before != df_new[col]).sum())

        check_save_dataframe_to_file(path, df_new)
        src["df"] = df_new
        return changed

    # ---------- Hilfen ----------
    def check_all(self):
        for v in self.check_vars.values():
            v.set(True)

    def check_none(self):
        for v in self.check_vars.values():
            v.set(False)

    def check_default(self):
        for v in self.check_vars.values():
            v.set(True)

    def active_checks(self):
        return {k for k, v in self.check_vars.items() if v.get()}

    def set_progress(self, pct, msg):
        try:
            self.progress_val.set(int(pct))
            self.progress_var.set(msg)
            self.parent.update_idletasks()
        except Exception:
            pass


# ============================================================
# HAUPT-APP
# ============================================================

class TennisMultiTool:
    def __init__(self, root):
        self.root = root
        self.root.title("🎾 Tennis Multitool")
        self.root.geometry("1200x920")
        self.root.minsize(1000, 720)
        self.root.configure(bg=Theme.BG)
        self._setup_style()
        self._build_layout()
        self.switch("matches")

    def _setup_style(self):
        style = ttk.Style()
        style.theme_use('clam')
        style.configure("Modern.Horizontal.TProgressbar",
                        troughcolor=Theme.BG_INPUT,
                        background=Theme.GREEN,
                        darkcolor=Theme.GREEN_DARK,
                        lightcolor=Theme.GREEN,
                        bordercolor=Theme.BG_INPUT,
                        thickness=8)

    def _build_layout(self):
        topbar = tk.Frame(self.root, bg=Theme.BG_SIDEBAR, height=56)
        topbar.pack(fill=tk.X, side=tk.TOP)
        topbar.pack_propagate(False)
        tk.Label(topbar, text="🎾  Tennis Multitool",
                 font=(Theme.FONT, 13, "bold"),
                 fg=Theme.TEXT, bg=Theme.BG_SIDEBAR).pack(side=tk.LEFT, padx=20)
        tk.Label(topbar, text="v1.3",
                 font=(Theme.FONT, 9),
                 fg=Theme.TEXT_MUTED, bg=Theme.BG_SIDEBAR).pack(side=tk.LEFT, padx=(0, 20))

        log_btn = tk.Button(topbar, text="📋 Log öffnen",
                            command=self.open_logfile,
                            font=(Theme.FONT, 9, "bold"),
                            bg=Theme.BG_HOVER, fg=Theme.TEXT,
                            activebackground=Theme.BG_INPUT, activeforeground=Theme.TEXT,
                            relief=tk.FLAT, bd=0, cursor='hand2',
                            padx=12, pady=6)
        log_btn.pack(side=tk.RIGHT, padx=(10, 20))

        date_str = datetime.now().strftime("%d.%m.%Y")
        tk.Label(topbar, text=f"📅  {date_str}",
                 font=(Theme.FONT, 10),
                 fg=Theme.TEXT_DIM, bg=Theme.BG_SIDEBAR).pack(side=tk.RIGHT, padx=20)

        body = tk.Frame(self.root, bg=Theme.BG)
        body.pack(fill=tk.BOTH, expand=True)

        sidebar = tk.Frame(body, bg=Theme.BG_SIDEBAR, width=220)
        sidebar.pack(side=tk.LEFT, fill=tk.Y)
        sidebar.pack_propagate(False)

        self.content = tk.Frame(body, bg=Theme.BG)
        self.content.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        tk.Label(sidebar, text="MODULE",
                 font=(Theme.FONT, 9, "bold"),
                 fg=Theme.TEXT_MUTED, bg=Theme.BG_SIDEBAR
                 ).pack(anchor='w', padx=20, pady=(24, 8))

        self.nav_buttons = {}
        self._add_nav_button(sidebar, "matches", "🎾", "Matches", Theme.ORANGE)
        self._add_nav_button(sidebar, "ranking", "🏆", "Ranking", Theme.GREEN)
        self._add_nav_button(sidebar, "players", "👥", "Players", Theme.BLUE)
        self._add_nav_button(sidebar, "elo",     "⚡", "Elo",     Theme.PURPLE)
        self._add_nav_button(sidebar, "tml",     "📥", "TML",     Theme.RED)
        self._add_nav_button(sidebar, "check",   "🔎", "Check",   Theme.YELLOW)

        footer = tk.Frame(sidebar, bg=Theme.BG_SIDEBAR)
        footer.pack(side=tk.BOTTOM, fill=tk.X, pady=20)
        tk.Label(footer, text="💚 Made with Python",
                 font=(Theme.FONT, 9),
                 fg=Theme.TEXT_MUTED, bg=Theme.BG_SIDEBAR).pack(anchor='w', padx=20)
        tk.Label(footer, text="Logfile: multitool.log",
                 font=(Theme.FONT_MONO, 8),
                 fg=Theme.TEXT_MUTED, bg=Theme.BG_SIDEBAR).pack(anchor='w', padx=20, pady=(4, 0))

        self.modules = {}
        self.current_key = None

    def _add_nav_button(self, parent, key, icon, label, accent):
        f = tk.Frame(parent, bg=Theme.BG_SIDEBAR, cursor='hand2')
        f.pack(fill=tk.X, padx=12, pady=2)
        inner = tk.Frame(f, bg=Theme.BG_SIDEBAR)
        inner.pack(fill=tk.X)
        stripe = tk.Frame(inner, bg=accent, width=3)
        stripe.pack(side=tk.LEFT, fill=tk.Y)
        lbl = tk.Label(inner, text=f"   {icon}   {label}",
                       font=(Theme.FONT, 11, "bold"),
                       fg=Theme.TEXT_DIM, bg=Theme.BG_SIDEBAR,
                       anchor='w', padx=14, pady=12)
        lbl.pack(side=tk.LEFT, fill=tk.X, expand=True)

        def on_enter(e):
            if self.current_key != key:
                inner.config(bg=Theme.BG_HOVER)
                lbl.config(bg=Theme.BG_HOVER, fg=Theme.TEXT)
        def on_leave(e):
            if self.current_key != key:
                inner.config(bg=Theme.BG_SIDEBAR)
                lbl.config(bg=Theme.BG_SIDEBAR, fg=Theme.TEXT_DIM)
        def on_click(e):
            self.switch(key)
        for w in (f, inner, lbl, stripe):
            w.bind("<Enter>", on_enter)
            w.bind("<Leave>", on_leave)
            w.bind("<Button-1>", on_click)

        self.nav_buttons[key] = (f, inner, lbl, stripe, accent)

    def _set_active_nav(self, key):
        for k, (f, inner, lbl, stripe, accent) in self.nav_buttons.items():
            if k == key:
                inner.config(bg=Theme.BG_HOVER)
                lbl.config(bg=Theme.BG_HOVER, fg=Theme.TEXT)
                stripe.config(bg=accent)
            else:
                inner.config(bg=Theme.BG_SIDEBAR)
                lbl.config(bg=Theme.BG_SIDEBAR, fg=Theme.TEXT_DIM)

    def switch(self, key):
        if key == self.current_key:
            return
        for w in self.content.winfo_children():
            w.destroy()
        self.current_key = key
        self._set_active_nav(key)
        if key == "ranking":
            RankingModule(self.content, self)
        elif key == "players":
            PlayersModule(self.content, self)
        elif key == "elo":
            EloModule(self.content, self)
        elif key == "matches":
            MatchesModule(self.content, self)
        elif key == "tml":
            TmlConverterModule(self.content, self)
        elif key == "check":
            CheckModule(self.content, self)

    def open_logfile(self):
        try:
            if os.path.exists(LOG_FILE):
                os.startfile(LOG_FILE)
            else:
                messagebox.showinfo("Logfile", f"Noch keine Datei vorhanden.\n\nPfad: {LOG_FILE}")
        except Exception as e:
            _log_traceback("Fehler beim Öffnen des Logfiles")
            messagebox.showerror("Fehler", str(e))


# ============================================================
# START
# ============================================================

if __name__ == "__main__":
    if not HAS_EXCEL:
        print("ℹ️  openpyxl nicht installiert – Excel-Support deaktiviert.")
        print("   Nachinstallieren mit:  pip install openpyxl\n")

    try:
        root = tk.Tk()
        app = TennisMultiTool(root)
        root.mainloop()
    except Exception:
        _log_traceback("Fataler Fehler beim Start")
        raise
    finally:
        _log_to_file("Tennis Multitool beendet")