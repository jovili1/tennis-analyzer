#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
TENNIS ELO CALCULATOR OPTIMIERT
- Progressive Start-ELOs basierend auf erster Saison
- 2 Jahre 100%, dann jedes Jahr 10% weniger
- Korrigierte ELO-Werte (nicht mehr zu hoch)
"""

import sqlite3
import os
from datetime import datetime, timedelta

# ===== KONFIGURATION =====
START_ELO_BASE = 1400.0  # Reduziert von 1500 auf 1400
K_FACTOR_ATP = 32.0
K_FACTOR_WTA = 36.0

# ===== PFADE =====
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(BASE_DIR, 'spieler')
ELO_DB_PATH = os.path.join(BASE_DIR, 'datenbanken', 'elo_ratings.db')


def init_elo_database():
    """Erstellt die ELO-Datenbank mit Rolling_* Surfaces für die App"""
    elo_dir = os.path.dirname(ELO_DB_PATH)
    if not os.path.exists(elo_dir):
        os.makedirs(elo_dir)
        print(f"📁 Ordner erstellt: {elo_dir}")
    
    if os.path.exists(ELO_DB_PATH):
        os.remove(ELO_DB_PATH)
        print(f"🗑️ Alte DB gelöscht")
    
    conn = sqlite3.connect(ELO_DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS elo_ratings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT NOT NULL,
            elo INTEGER NOT NULL,
            surface TEXT NOT NULL,
            date TEXT NOT NULL,
            matches_played INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            weight_factor REAL DEFAULT 1.0,
            UNIQUE(player_name, surface, date)
        )
    ''')
    
    # Performance-Indizes
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_elo_player ON elo_ratings(player_name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_elo_surface ON elo_ratings(surface)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_elo_date ON elo_ratings(date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_elo_player_surface ON elo_ratings(player_name, surface)')
    
    conn.commit()
    conn.close()
    print(f"✅ ELO-Datenbank initialisiert: {ELO_DB_PATH}")


def get_age_weight(tourney_date):
    """
    2 Jahre 100%, dann jedes Jahr 10% weniger
    """
    if not tourney_date:
        return 0.5
    
    try:
        date_str = str(tourney_date)
        year = int(date_str[:4])
        month = int(date_str[4:6])
        day = int(date_str[6:8])
        match_date = datetime(year, month, day)
        
        current = datetime.now()
        age_days = (current - match_date).days
        age_years = age_days / 365.25
        
        # 2 Jahre 100%, dann 10% pro Jahr
        if age_years <= 2:
            return 1.0
        else:
            weight = 1.0 - ((age_years - 2) * 0.1)
            return max(0.1, round(weight, 2))
        
    except:
        return 0.5


def get_surface_from_match(surface):
    """Normalisiert den Belag"""
    if not surface:
        return 'Hard'
    
    surface_map = {
        'Hard': 'Hard',
        'Clay': 'Clay',
        'Grass': 'Grass',
        'Carpet': 'Hard',
        'Acrylic': 'Hard',
        'Indoor Hard': 'Hard',
        'Outdoor Hard': 'Hard'
    }
    
    for key, value in surface_map.items():
        if key.lower() in surface.lower():
            return value
    
    return 'Hard'


def get_start_elo_by_year(first_match_year):
    """
    Progressive Start-ELOs basierend auf erster Saison
    Ältere Spieler starten niedriger, weil das Feld stärker war
    """
    if not first_match_year or first_match_year < 1980:
        return 1200.0
    
    if first_match_year >= 2020:
        return 1400.0
    elif first_match_year >= 2010:
        return 1350.0
    elif first_match_year >= 2000:
        return 1300.0
    elif first_match_year >= 1990:
        return 1250.0
    else:
        return 1200.0


def get_first_match_year(cursor, player_name):
    """Ermittelt das erste Match-Jahr eines Spielers"""
    try:
        cursor.execute('''
            SELECT MIN(SUBSTR(tourney_date, 1, 4)) 
            FROM matches 
            WHERE winner_name = ? OR loser_name = ?
        ''', (player_name, player_name))
        
        result = cursor.fetchone()
        if result and result[0]:
            try:
                return int(result[0])
            except:
                return 2020
    except:
        pass
    return 2020


def calculate_tennis_abstract_elo(ranking_type='atp'):
    """
    Berechnet ELO mit progressiven Start-ELOs
    """
    k_factor = K_FACTOR_WTA if ranking_type == 'wta' else K_FACTOR_ATP
    
    print(f"\n🔄 Starte ELO-Berechnung für {ranking_type.upper()}...")
    print(f"⚙️  K-Faktor: {k_factor} | Progressive Start-ELOs (1400 → 1200)")
    print(f"📅 2 Jahre 100%, dann 90% → 80% → ... → 10%")
    
    match_db_path = os.path.join(DB_DIR, f'{ranking_type}_matches.db')
    if not os.path.exists(match_db_path):
        print(f"❌ {ranking_type.upper()} Match-DB nicht gefunden: {match_db_path}")
        return
    
    conn = sqlite3.connect(match_db_path)
    cursor = conn.cursor()
    
    try:
        # Alle Matches laden
        cursor.execute('''
            SELECT winner_name, loser_name, tourney_date, surface
            FROM matches
            WHERE winner_name IS NOT NULL 
              AND loser_name IS NOT NULL
              AND winner_name != ''
              AND loser_name != ''
              AND tourney_date NOT IN ('', '0', 'None')
            ORDER BY tourney_date ASC, tourney_id ASC, match_num ASC
        ''')
        
        matches = cursor.fetchall()
        print(f"📊 {len(matches):,} Matches geladen.")
        
        if not matches:
            print("⚠️ Keine Matches gefunden")
            conn.close()
            return
        
        # ELO-Dictionary
        elo_ratings = {}
        db_records = []
        player_first_year = {}  # Cache für erste Saison
        
        total_matches = len(matches)
        last_progress = 0
        
        for i, (winner, loser, date, surface) in enumerate(matches):
            # Progress anzeigen
            progress = int((i / total_matches) * 100)
            if progress >= last_progress + 5:
                print(f"   Fortschritt: {progress}% ({i:,}/{total_matches:,})")
                last_progress = progress
            
            surface = get_surface_from_match(surface)
            
            # Spieler mit progressivem Start-ELO initialisieren
            for player in [winner, loser]:
                if player not in elo_ratings:
                    # Erstes Match-Jahr ermitteln
                    if player not in player_first_year:
                        year = get_first_match_year(cursor, player)
                        player_first_year[player] = year
                    
                    start_elo = get_start_elo_by_year(player_first_year[player])
                    
                    elo_ratings[player] = {
                        'gesamt': float(start_elo),
                        'Hard': float(start_elo),
                        'Clay': float(start_elo),
                        'Grass': float(start_elo),
                        'matches': 0,
                        'wins': 0,
                        'losses': 0,
                        'first_year': player_first_year[player]
                    }
            
            # Gewichtung: 2 Jahre 100%, dann 10% pro Jahr weniger
            age_weight = get_age_weight(date)
            match_k = k_factor * age_weight
            
            # 50/50 Misch-Rating für das Match
            winner_match_rating = (elo_ratings[winner]['gesamt'] + elo_ratings[winner][surface]) / 2.0
            loser_match_rating = (elo_ratings[loser]['gesamt'] + elo_ratings[loser][surface]) / 2.0
            
            # ELO-Berechnung
            expected_winner = 1.0 / (1.0 + 10.0 ** ((loser_match_rating - winner_match_rating) / 400.0))
            total_delta = match_k * (1.0 - expected_winner)
            split_delta = total_delta / 2.0
            
            # Update Winner
            elo_ratings[winner]['gesamt'] += split_delta
            elo_ratings[winner][surface] += split_delta
            elo_ratings[winner]['matches'] += 1
            elo_ratings[winner]['wins'] += 1
            
            # Update Loser
            elo_ratings[loser]['gesamt'] -= split_delta
            elo_ratings[loser][surface] -= split_delta
            elo_ratings[loser]['matches'] += 1
            elo_ratings[loser]['losses'] += 1
            
            # Historische Daten speichern (alle 100 Matches)
            if i % 100 == 0 and i > 0:
                date_str = str(date) if date else datetime.now().strftime('%Y%m%d')
                for player in [winner, loser]:
                    for surface_name, key in [
                        ('Rolling_Gesamt', 'gesamt'),
                        ('Rolling_Hard', 'Hard'),
                        ('Rolling_Clay', 'Clay'),
                        ('Rolling_Grass', 'Grass')
                    ]:
                        db_records.append((
                            player,
                            int(round(elo_ratings[player][key])),
                            surface_name,
                            date_str,
                            elo_ratings[player]['matches'],
                            elo_ratings[player]['wins'],
                            elo_ratings[player]['losses'],
                            age_weight
                        ))
        
        # FINALE ELOs speichern (für die App!)
        print(f"\n   📝 Speichere FINALE ELOs für {len(elo_ratings):,} Spieler...")
        current_date = datetime.now().strftime('%Y%m%d')
        
        for player, data in elo_ratings.items():
            for surface_name, key in [
                ('Rolling_Gesamt', 'gesamt'),
                ('Rolling_Hard', 'Hard'),
                ('Rolling_Clay', 'Clay'),
                ('Rolling_Grass', 'Grass')
            ]:
                db_records.append((
                    player,
                    int(round(data[key])),
                    surface_name,
                    current_date,  # Heutiges Datum für finale ELOs
                    data['matches'],
                    data['wins'],
                    data['losses'],
                    1.0  # Finale ELOs haben volle Gewichtung
                ))
        
        # In Datenbank schreiben
        print(f"   💾 Schreibe {len(db_records):,} Einträge in die Datenbank...")
        elo_conn = sqlite3.connect(ELO_DB_PATH)
        elo_cursor = elo_conn.cursor()
        
        # Transaktion für Performance
        elo_cursor.execute('BEGIN TRANSACTION')
        
        elo_cursor.executemany('''
            INSERT OR REPLACE INTO elo_ratings
            (player_name, elo, surface, date, matches_played, wins, losses, weight_factor)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', db_records)
        
        elo_conn.commit()
        elo_conn.close()
        conn.close()
        
        print(f"✅ ELO-Berechnung für {ranking_type.upper()} abgeschlossen!")
        print(f"   📊 {len(db_records):,} Einträge gespeichert")
        
        # Top 10 anzeigen (nur Spieler mit mind. 3 Matches)
        top10 = sorted(
            [p for p in elo_ratings if elo_ratings[p]['matches'] >= 3],
            key=lambda x: elo_ratings[x]['gesamt'],
            reverse=True
        )[:10]
        
        print(f"\n📊 TOP 10 {ranking_type.upper()} (korrigierte ELOs):")
        print(f"   📅 {len(matches):,} Matches verarbeitet")
        print(f"   {'#':2} {'Spieler':25} {'ELO':5} {'Start':5} {'M':4} {'Jahr'}")
        print(f"   {'-'*50}")
        for i, player in enumerate(top10, 1):
            p_data = elo_ratings[player]
            start_elo = get_start_elo_by_year(p_data['first_year'])
            print(f"   {i:2}. {player[:25]:25} {int(p_data['gesamt']):5} {int(start_elo):5} {p_data['matches']:4} {p_data['first_year']}")
        
        # 🔍 Speziell Sabalenka checken
        sabalenka = elo_ratings.get('Aryna Sabalenka')
        if sabalenka:
            print(f"\n🔍 Aryna Sabalenka: {int(sabalenka['gesamt'])} (Start: {int(get_start_elo_by_year(sabalenka['first_year']))})")
            
    except Exception as e:
        print(f"❌ Fehler: {e}")
        import traceback
        traceback.print_exc()
        conn.close()


def get_current_elo_for_app(player_name):
    """
    Hilfsfunktion für die App: Holt aktuelle ELOs eines Spielers
    """
    conn = sqlite3.connect(ELO_DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT surface, elo, matches_played, wins, losses
        FROM elo_ratings
        WHERE player_name = ?
        ORDER BY date DESC, surface
    ''', (player_name,))
    
    results = cursor.fetchall()
    conn.close()
    
    elo_dict = {}
    for surface, elo, matches, wins, losses in results:
        elo_dict[surface] = {
            'elo': elo,
            'matches': matches,
            'wins': wins,
            'losses': losses
        }
    
    return elo_dict


def run_calculator():
    print("=" * 60)
    print("🎾 TENNIS ELO CALCULATOR OPTIMIERT")
    print("=" * 60)
    print("⚙️  K-Faktor ATP: 32 | WTA: 36")
    print("📅 2 Jahre 100% → 90% → 80% → ... → 10%")
    print("🎯 Progressive Start-ELOs (1400 → 1200)")
    print("💾 Speichert FINALE ELOs für App-Vorhersagen")
    print("=" * 60)
    
    # Datenbank initialisieren
    init_elo_database()
    
    # Berechnungen durchführen
    calculate_tennis_abstract_elo('atp')
    calculate_tennis_abstract_elo('wta')
    
    print("\n" + "=" * 60)
    print("✅ ALLE ELOs berechnet!")
    print(f"📁 DB: {ELO_DB_PATH}")
    print("=" * 60)
    
    # Test-Abfrage für die App
    print("\n🔍 Teste App-Abfrage für Novak Djokovic:")
    djokovic_elo = get_current_elo_for_app('Novak Djokovic')
    if djokovic_elo:
        for surface, data in djokovic_elo.items():
            print(f"   {surface}: {data['elo']} ({data['matches']} Matches)")
    else:
        print("   ❌ Spieler nicht gefunden")
    
    print("\n🔍 Teste App-Abfrage für Aryna Sabalenka:")
    sabalenka_elo = get_current_elo_for_app('Aryna Sabalenka')
    if sabalenka_elo:
        for surface, data in sabalenka_elo.items():
            print(f"   {surface}: {data['elo']} ({data['matches']} Matches)")
    else:
        print("   ❌ Spieler nicht gefunden")


if __name__ == "__main__":
    run_calculator()