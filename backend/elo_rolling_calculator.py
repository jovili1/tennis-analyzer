#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
TENNIS ELO SCRAPER V11 - ATP + WTA
Holt ELO-Werte von tennisabstract.com und speichert sie in eine DB.
Zusätzlich: Match-Zahlen (matches_played, wins, losses) werden aus den
Match-Datenbanken (atp_matches.db / wta_matches.db) gelesen und eingetragen,
damit das Frontend (Match Predictor) echte Confidence-Werte berechnen kann.

WICHTIG: Es findet KEINE Berechnung der ELO-Werte statt.
Die Werte von TennisAbstract werden 1:1 übernommen.
"""

import sqlite3
import os
import sys
import requests
from bs4 import BeautifulSoup
from datetime import datetime
import re

# ===== PFADE (relativ zum Skript-Standort) =====
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ELO_DB_PATH = os.path.join(BASE_DIR, 'datenbanken', 'elo_ratings.db')
ATP_MATCHES_DB = os.path.join(BASE_DIR, 'spieler', 'atp_matches.db')
WTA_MATCHES_DB = os.path.join(BASE_DIR, 'spieler', 'wta_matches.db')

# ===== FALLBACK: Prüfe ob Ordner existieren =====
if not os.path.exists(os.path.dirname(ELO_DB_PATH)):
    print(f"[FEHLER] Datenbank-Ordner nicht gefunden!")
    print(f"   Gesucht: {os.path.dirname(ELO_DB_PATH)}")
    sys.exit(1)

print(f"[INFO] Verwende ELO-DB: {ELO_DB_PATH}")

# ===== KONFIGURATION =====
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"

# ===== ATP UND WTA URLS =====
URLS = {
    'atp': 'https://tennisabstract.com/reports/atp_elo_ratings.html',
    'wta': 'https://tennisabstract.com/reports/wta_elo_ratings.html'
}


def clean_player_name(name):
    """Bereinigt Spielernamen."""
    if not name:
        return name
    return name.replace('\xa0', ' ').strip()


def clean_elo_value(value):
    """Bereinigt ELO-Werte und konvertiert zu Integer."""
    if not value or value == 'None' or value == '':
        return 1500
    cleaned = re.sub(r'[^\d.]', '', str(value).strip())
    if not cleaned:
        return 1500
    try:
        return int(float(cleaned))
    except ValueError:
        return 1500


# ============================================================
# 🔥 NEU: Match-Stats aus Match-DBs laden
# ============================================================
def get_match_stats_from_db(player_name, tour):
    """
    Liest für einen Spieler aus der ATP- oder WTA-Match-DB:
    - total matches
    - wins
    - losses

    Suche ist robust: exakt (beide Reihenfolgen) + LIKE-Fallback.
    Gibt (matches, wins, losses) zurück oder (0, 0, 0) falls nichts gefunden.
    """
    if tour == 'atp':
        match_db_path = ATP_MATCHES_DB
        table_name = 'matches'
    else:
        match_db_path = WTA_MATCHES_DB
        table_name = 'matches'

    if not os.path.exists(match_db_path):
        return (0, 0, 0)

    try:
        conn = sqlite3.connect(match_db_path)
        cursor = conn.cursor()

        # 🔥 1. Exakte Suche in beiden Reihenfolgen
        cursor.execute(f"""
            SELECT COUNT(*),
                   SUM(CASE WHEN winner_name = ? THEN 1 ELSE 0 END)
            FROM {table_name}
            WHERE winner_name = ? OR loser_name = ?
        """, (player_name, player_name, player_name))

        row = cursor.fetchone()
        total = row[0] or 0
        wins = row[1] or 0

        # 🔥 2. Falls leer → LIKE-Fallback
        if total == 0:
            pattern = f"%{player_name}%"
            cursor.execute(f"""
                SELECT COUNT(*),
                       SUM(CASE WHEN LOWER(winner_name) = LOWER(?) THEN 1 ELSE 0 END)
                FROM {table_name}
                WHERE winner_name LIKE ? OR loser_name LIKE ?
            """, (player_name, pattern, pattern))

            row = cursor.fetchone()
            total = row[0] or 0
            wins = row[1] or 0

        conn.close()

        losses = max(0, total - wins)
        return (total, wins, losses)

    except Exception as e:
        print(f"   [WARNUNG] Match-Stats für '{player_name}' konnten nicht geladen werden: {e}")
        return (0, 0, 0)


def init_database():
    """Erstellt eine frische ELO-Datenbank."""
    elo_dir = os.path.dirname(ELO_DB_PATH)
    os.makedirs(elo_dir, exist_ok=True)
    print(f"[OK] Ordner: {elo_dir}")

    if os.path.exists(ELO_DB_PATH):
        os.remove(ELO_DB_PATH)
        print("[OK] Alte DB geloescht")

    conn = sqlite3.connect(ELO_DB_PATH)
    cursor = conn.cursor()

    cursor.execute('''
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

    cursor.execute('CREATE INDEX idx_elo_player ON elo_ratings(player_name)')
    cursor.execute('CREATE INDEX idx_elo_surface ON elo_ratings(surface)')
    cursor.execute('CREATE INDEX idx_elo_date ON elo_ratings(date)')

    conn.commit()
    conn.close()
    print(f"[OK] Datenbank initialisiert: {ELO_DB_PATH}")


def parse_tennis_abstract(gender, url):
    """Parst ATP oder WTA von tennisabstract.com."""
    print(f"\n[INFO] Lade {gender.upper()} von {url}...")

    headers = {'User-Agent': USER_AGENT}
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        print(f"[OK] Seite geladen ({len(response.text):,} Zeichen)")
    except Exception as e:
        print(f"[FEHLER] {e}")
        return []

    soup = BeautifulSoup(response.text, 'html.parser')
    table = soup.find('table', {'id': 'reportable'})

    if not table:
        print("[FEHLER] Tabelle nicht gefunden")
        return []

    rows = table.find_all('tr')
    print(f"[INFO] {len(rows)} Zeilen gefunden")

    players = []
    errors = 0

    for i, row in enumerate(rows[1:], 1):
        cells = row.find_all('td')
        if len(cells) < 11:
            continue

        try:
            # Spielername
            link = cells[1].find('a')
            if link:
                name = clean_player_name(link.get_text(strip=True))
            else:
                name = clean_player_name(cells[1].get_text(strip=True))

            if not name or name in ['Player', 'Age']:
                continue

            # ELOs (Spalten-Indizes wie im Original)
            elo = clean_elo_value(cells[3].get_text(strip=True))
            elo_hard = clean_elo_value(cells[6].get_text(strip=True))
            elo_clay = clean_elo_value(cells[8].get_text(strip=True))
            elo_grass = clean_elo_value(cells[10].get_text(strip=True))

            if elo < 1000 or elo > 3000:
                continue

            players.append({
                'player_name': name,
                'elo': elo,
                'elo_hard': elo_hard,
                'elo_clay': elo_clay,
                'elo_grass': elo_grass
            })

            if i % 100 == 0:
                print(f"   {i} Spieler geparst...")

        except Exception as e:
            errors += 1
            if errors < 5:
                print(f"WARNUNG: Fehler in Zeile {i}: {e}")
            continue

    print(f"[OK] {len(players)} Spieler geparst ({gender.upper()})")
    if errors > 0:
        print(f"WARNUNG: {errors} Zeilen uebersprungen")

    return players


def save_to_database(players_atp, players_wta, current_date):
    """Speichert alle Spieler in der Datenbank."""
    if not players_atp and not players_wta:
        print("[FEHLER] Keine Daten zum Speichern.")
        return

    conn = sqlite3.connect(ELO_DB_PATH)
    cursor = conn.cursor()

    records = []

    # 🔥 ATP-Spieler verarbeiten
    print(f"\n[INFO] Verarbeite ATP-Spieler ({len(players_atp)})...")
    for idx, player in enumerate(players_atp, 1):
        # Match-Stats aus atp_matches.db holen
        total, wins, losses = get_match_stats_from_db(player['player_name'], 'atp')

        if idx % 50 == 0:
            print(f"   {idx}/{len(players_atp)} ATP-Spieler verarbeitet...")

        for surface, elo in [
            ('Rolling_Gesamt', player['elo']),
            ('Rolling_Hard', player['elo_hard']),
            ('Rolling_Clay', player['elo_clay']),
            ('Rolling_Grass', player['elo_grass'])
        ]:
            records.append((
                player['player_name'],
                elo,
                surface,
                current_date,
                total, wins, losses,
                1.0,
                0, 0, 0, 0, 0, 0,
                50, '⚖️ Neutral', 0, '⚖️ Neutral',
                player['elo_hard'],
                player['elo_clay'],
                player['elo_grass'],
                1.0, 1.0, 1.0, 1.0
            ))

    # 🔥 WTA-Spieler verarbeiten
    print(f"\n[INFO] Verarbeite WTA-Spieler ({len(players_wta)})...")
    for idx, player in enumerate(players_wta, 1):
        # Match-Stats aus wta_matches.db holen
        total, wins, losses = get_match_stats_from_db(player['player_name'], 'wta')

        if idx % 50 == 0:
            print(f"   {idx}/{len(players_wta)} WTA-Spieler verarbeitet...")

        for surface, elo in [
            ('Rolling_Gesamt', player['elo']),
            ('Rolling_Hard', player['elo_hard']),
            ('Rolling_Clay', player['elo_clay']),
            ('Rolling_Grass', player['elo_grass'])
        ]:
            records.append((
                player['player_name'],
                elo,
                surface,
                current_date,
                total, wins, losses,
                1.0,
                0, 0, 0, 0, 0, 0,
                50, '⚖️ Neutral', 0, '⚖️ Neutral',
                player['elo_hard'],
                player['elo_clay'],
                player['elo_grass'],
                1.0, 1.0, 1.0, 1.0
            ))

    cursor.executemany('''
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
    print(f"\n[OK] {len(records):,} Eintraege gespeichert")


def test_database():
    """Testet die Datenbank."""
    print("\n" + "=" * 70)
    print("TEST: DATENBANK")
    print("=" * 70)

    if not os.path.exists(ELO_DB_PATH):
        print(f"[FEHLER] Datenbank nicht gefunden: {ELO_DB_PATH}")
        return

    conn = sqlite3.connect(ELO_DB_PATH)
    cursor = conn.cursor()

    cursor.execute('''
        SELECT player_name, elo, matches_played, wins, losses
        FROM elo_ratings
        WHERE surface = 'Rolling_Gesamt'
        ORDER BY elo DESC
        LIMIT 10
    ''')

    print("\nTop 10 (Gesamt-ELO):")
    print(f"   {'#':>2}  {'Name':<30} {'ELO':>6}  {'M':>5}  {'W':>5}  {'L':>5}")
    for i, row in enumerate(cursor.fetchall(), 1):
        name, elo, matches, wins, losses = row
        print(f"   {i:2}. {name[:30]:30} {elo:>6}  {matches:>5}  {wins:>5}  {losses:>5}")

    for name in ['Jannik Sinner', 'Iga Swiatek', 'Coco Gauff', 'Alexander Zverev']:
        cursor.execute('''
            SELECT surface, elo, matches_played, wins, losses FROM elo_ratings
            WHERE player_name LIKE ?
        ''', (f'%{name}%',))
        results = cursor.fetchall()
        if results:
            print(f"\n{name}:")
            for surface, elo, matches, wins, losses in results:
                print(f"   {surface:20} ELO={elo:>5}  Matches={matches}  W/L={wins}/{losses}")
        else:
            print(f"\n{name} nicht in der DB")

    cursor.execute('SELECT COUNT(*) FROM elo_ratings')
    count = cursor.fetchone()[0]
    print(f"\nGesamt: {count:,} Eintraege")

    conn.close()
    print("\n" + "=" * 70)


def run():
    print("=" * 70)
    print("TENNIS ELO SCRAPER V11 - ATP + WTA")
    print("=" * 70)
    print("Holt ELOs von tennisabstract.com")
    print("Speichert in elo_ratings.db")
    print("Match-Zahlen aus atp_matches.db / wta_matches.db werden eingetragen")
    print("=" * 70)

    # Prüfe ob der Datenbank-Ordner existiert
    os.makedirs(os.path.dirname(ELO_DB_PATH), exist_ok=True)

    current_date = datetime.now().strftime('%Y%m%d')
    print(f"Speicherdatum: {current_date}")

    init_database()

    players_atp = []
    players_wta = []

    for gender, url in URLS.items():
        players = parse_tennis_abstract(gender, url)
        if players:
            if gender == 'atp':
                players_atp = players
            else:
                players_wta = players
            print(f"[OK] {gender.upper()}: {len(players)} Spieler")
        else:
            print(f"[FEHLER] {gender.upper()}: Keine Daten")

    if players_atp or players_wta:
        save_to_database(players_atp, players_wta, current_date)
        test_database()
    else:
        print("[FEHLER] Keine Daten verarbeitet.")

    print("\n" + "=" * 70)
    print("[OK] Scraper abgeschlossen!")
    print(f"DB: {ELO_DB_PATH}")
    print("=" * 70)


if __name__ == "__main__":
    run()