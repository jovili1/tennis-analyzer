#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
TENNIS ELO CALCULATOR V3.0 - MAXIMUM PERFORMANCE (KORRIGIERT)
"""

import sqlite3
import os
from datetime import datetime, timedelta

# ===== KONFIGURATION =====
START_ELO_BASE = 1600.0

# Surface-Specific K-Faktoren
K_FACTORS = {
    'Hard': 32.0,
    'Clay': 30.0,
    'Grass': 34.0,
    'ATP': 32.0,
    'WTA': 36.0
}

# ===== PFADE =====
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(BASE_DIR, 'spieler')
ELO_DB_PATH = os.path.join(BASE_DIR, 'datenbanken', 'elo_ratings.db')


def init_elo_database():
    """Erstellt die ELO-Datenbank - KORRIGIERTE VERSION"""
    elo_dir = os.path.dirname(ELO_DB_PATH)
    if not os.path.exists(elo_dir):
        os.makedirs(elo_dir)
        print(f"📁 Ordner erstellt: {elo_dir}")
    
    if os.path.exists(ELO_DB_PATH):
        os.remove(ELO_DB_PATH)
        print(f"🗑️ Alte DB gelöscht")
    
    conn = sqlite3.connect(ELO_DB_PATH)
    cursor = conn.cursor()
    
    # 🔥 VEREINFACHTE TABELLE - nur das Nötigste
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
            
            -- 🔥 NEU: Belag-Statistiken
            matches_hard INTEGER DEFAULT 0,
            matches_clay INTEGER DEFAULT 0,
            matches_grass INTEGER DEFAULT 0,
            wins_hard INTEGER DEFAULT 0,
            wins_clay INTEGER DEFAULT 0,
            wins_grass INTEGER DEFAULT 0,
            
            -- 🔥 NEU: Recent Form
            recent_form INTEGER DEFAULT 50,
            recent_form_status TEXT DEFAULT '⚖️ Neutral',
            
            -- 🔥 NEU: Momentum
            momentum_streak INTEGER DEFAULT 0,
            momentum_status TEXT DEFAULT '⚖️ Neutral',
            
            -- 🔥 NEU: Surface-spezifische ELOs
            elo_hard INTEGER DEFAULT 1500,
            elo_clay INTEGER DEFAULT 1500,
            elo_grass INTEGER DEFAULT 1500,
            
            UNIQUE(player_name, surface, date)
        )
    ''')
    
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_elo_player ON elo_ratings(player_name)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_elo_surface ON elo_ratings(surface)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_elo_date ON elo_ratings(date)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_elo_player_surface ON elo_ratings(player_name, surface)')
    
    conn.commit()
    conn.close()
    print(f"✅ ELO-Datenbank initialisiert")


def get_age_weight(tourney_date):
    """2 Jahre 100%, dann jedes Jahr 10% weniger"""
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
    """Progressive Start-ELOs basierend auf START_ELO_BASE"""
    if not first_match_year or first_match_year < 1980:
        return START_ELO_BASE - 200.0
    
    # Je nach Jahr wird der Start-ELO angepasst
    if first_match_year >= 2020:
        return START_ELO_BASE
    elif first_match_year >= 2010:
        return START_ELO_BASE - 50.0
    elif first_match_year >= 2000:
        return START_ELO_BASE - 100.0
    elif first_match_year >= 1990:
        return START_ELO_BASE - 150.0
    else:
        return START_ELO_BASE - 200.0


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


def get_tournament_weight_from_name(tourney_name, round_name):
    """Ermittelt die Gewichtung basierend auf Turnier-Name"""
    if not tourney_name:
        return 1.0
    
    name = tourney_name.lower()
    
    # Grand Slams
    grand_slams = ['australian open', 'french open', 'roland garros', 'wimbledon', 'us open']
    for gs in grand_slams:
        if gs in name:
            weight = 1.4
            break
    else:
        # Masters 1000
        masters = ['indian wells', 'miami', 'monte carlo', 'madrid', 'rome', 
                   'canada', 'cincinnati', 'shanghai', 'paris']
        for m in masters:
            if m in name:
                weight = 1.2
                break
        else:
            if 'finals' in name or 'tour finals' in name:
                weight = 1.3
            elif '500' in name:
                weight = 1.0
            elif '250' in name:
                weight = 0.8
            elif 'challenger' in name:
                weight = 0.6
            elif 'itf' in name:
                weight = 0.4
            else:
                weight = 0.5
    
    # Runden-Gewichtung
    round_weights = {
        'F': 1.3,
        'SF': 1.2,
        'QF': 1.1,
        'R16': 1.0,
        'R32': 0.9,
        'R64': 0.8,
        'R128': 0.7
    }
    round_weight = round_weights.get(round_name, 1.0)
    
    return round(weight * round_weight, 2)


# 🔥 NEU: Gegner-Stärke
def get_opponent_strength_bonus(winner_elo, loser_elo):
    """Berechnet Bonus basierend auf Gegner-Stärke"""
    elo_diff = loser_elo - winner_elo
    
    if elo_diff > 200:
        return 1.3
    elif elo_diff > 100:
        return 1.15
    elif elo_diff > 50:
        return 1.05
    elif elo_diff < -200:
        return 0.7
    elif elo_diff < -100:
        return 0.85
    elif elo_diff < -50:
        return 0.95
    else:
        return 1.0


# 🔥 NEU: Surface-Switch Penalty
def get_surface_switch_penalty(last_surface, current_surface, days_since_last_match):
    """Berechnet Malus für Belagwechsel"""
    if not last_surface or not current_surface:
        return 1.0
    
    if last_surface == current_surface:
        return 1.0
    
    if days_since_last_match < 14:
        if (last_surface == 'Clay' and current_surface == 'Grass') or \
           (last_surface == 'Grass' and current_surface == 'Clay'):
            return 0.85
        elif (last_surface == 'Hard' and current_surface == 'Clay') or \
             (last_surface == 'Clay' and current_surface == 'Hard'):
            return 0.90
        elif (last_surface == 'Hard' and current_surface == 'Grass') or \
             (last_surface == 'Grass' and current_surface == 'Hard'):
            return 0.88
        else:
            return 0.95
    elif days_since_last_match < 30:
        if (last_surface == 'Clay' and current_surface == 'Grass') or \
           (last_surface == 'Grass' and current_surface == 'Clay'):
            return 0.90
        else:
            return 0.95
    else:
        return 1.0


# 🔥 NEU: Tournament Surface History
def get_tournament_surface_bonus(tourney_name, surface):
    """Berechnet Bonus für spezifische Turniere"""
    if not tourney_name:
        return 1.0
    
    name = tourney_name.lower()
    
    if 'wimbledon' in name and surface == 'Grass':
        return 1.05
    elif ('roland garros' in name or 'french open' in name) and surface == 'Clay':
        return 1.05
    elif 'australian open' in name and surface == 'Hard':
        return 1.03
    elif 'us open' in name and surface == 'Hard':
        return 1.03
    
    return 1.0


def calculate_recent_form(matches, player_name, limit=5):
    """Berechnet die aktuelle Form"""
    if not matches or len(matches) == 0:
        return 50, '⚖️ Neutral'
    
    recent = matches[:limit]
    if len(recent) == 0:
        return 50, '⚖️ Neutral'
    
    total_weight = 0
    weighted_wins = 0
    
    for i, match in enumerate(recent):
        is_win = match['winner_name'] == player_name
        weight = 1.0 - (i * 0.1)
        final_weight = max(0.1, weight)
        total_weight += final_weight
        if is_win:
            weighted_wins += final_weight
    
    score = int((weighted_wins / total_weight) * 100) if total_weight > 0 else 50
    
    if score >= 80:
        status = '🔥 Heiße Form'
    elif score >= 65:
        status = '📈 Gute Form'
    elif score >= 45:
        status = '⚖️ Durchschnitt'
    elif score >= 30:
        status = '📉 Schwache Form'
    else:
        status = '❌ Talfahrt'
    
    return score, status


def calculate_momentum(matches, player_name, limit=10):
    """Berechnet den Momentum-Index"""
    if not matches or len(matches) == 0:
        return 0, '⚖️ Neutral'
    
    recent = matches[:limit]
    current_streak = 0
    
    for match in recent:
        is_win = match['winner_name'] == player_name
        if is_win:
            current_streak = current_streak + 1 if current_streak >= 0 else 1
        else:
            current_streak = current_streak - 1 if current_streak <= 0 else -1
    
    if current_streak >= 5:
        status = '🚀 Heißer Lauf'
    elif current_streak >= 3:
        status = '📈 Guter Lauf'
    elif current_streak >= 1:
        status = '↗️ Leichter Aufwind'
    elif current_streak == 0:
        status = '⚖️ Ausgeglichen'
    elif current_streak >= -2:
        status = '↘️ Leichter Abwind'
    elif current_streak >= -4:
        status = '📉 Schlechter Lauf'
    else:
        status = '💀 Talfahrt'
    
    return current_streak, status


def calculate_tennis_abstract_elo(ranking_type='atp'):
    """Berechnet ELO mit allen Features"""
    k_factor = K_FACTORS['WTA'] if ranking_type == 'wta' else K_FACTORS['ATP']
    
    print(f"\n🔄 Starte ELO-Berechnung für {ranking_type.upper()}...")
    print(f"⚙️  K-Faktor: {k_factor}")
    print(f"📅 2 Jahre 100%, dann 90% → 80% → ... → 10%")
    
    match_db_path = os.path.join(DB_DIR, f'{ranking_type}_matches.db')
    if not os.path.exists(match_db_path):
        print(f"❌ Match-DB nicht gefunden: {match_db_path}")
        return
    
    conn = sqlite3.connect(match_db_path)
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT winner_name, loser_name, tourney_date, surface, tourney_name, round
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
        
        elo_ratings = {}
        db_records = []
        player_first_year = {}
        all_matches_by_player = {}
        last_surface_by_player = {}
        last_match_date_by_player = {}
        
        total_matches = len(matches)
        last_progress = 0
        
        print(f"🔄 Verarbeite {total_matches:,} Matches...")
        
        for i, (winner, loser, date, surface, tourney_name, round_name) in enumerate(matches):
            progress = int((i / total_matches) * 100)
            if progress >= last_progress + 5:
                print(f"   Fortschritt: {progress}% ({i:,}/{total_matches:,})")
                last_progress = progress
            
            surface = get_surface_from_match(surface)
            match_weight = get_tournament_weight_from_name(tourney_name, round_name)
            
            # Spieler initialisieren
            for player in [winner, loser]:
                if player not in elo_ratings:
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
                        'first_year': player_first_year[player],
                        'matches_hard': 0,
                        'matches_clay': 0,
                        'matches_grass': 0,
                        'wins_hard': 0,
                        'wins_clay': 0,
                        'wins_grass': 0
                    }
                
                if player not in all_matches_by_player:
                    all_matches_by_player[player] = []
                all_matches_by_player[player].append({
                    'winner_name': winner,
                    'loser_name': loser,
                    'tourney_date': date,
                    'surface': surface,
                    'tourney_name': tourney_name,
                    'round': round_name
                })
            
            # 🔥 Surface-Switch Penalty
            current_date = datetime.strptime(str(date)[:8], '%Y%m%d')
            days_since_last_match = 999
            
            if winner in last_match_date_by_player:
                days_since_last_match = (current_date - last_match_date_by_player[winner]).days
            
            surface_penalty = get_surface_switch_penalty(
                last_surface_by_player.get(winner, None),
                surface,
                days_since_last_match
            )
            
            # 🔥 Surface-Specific K
            surface_k = K_FACTORS.get(surface, 32.0)
            if ranking_type == 'wta':
                surface_k = min(surface_k + 4, 40.0)
            
            # 🔥 Tournament Surface Bonus
            tourney_bonus = get_tournament_surface_bonus(tourney_name, surface)
            
            # 🔥 Gegner-Stärke
            opponent_bonus = get_opponent_strength_bonus(
                elo_ratings[winner]['gesamt'],
                elo_ratings[loser]['gesamt']
            )
            
            # Kombinierter K-Faktor
            base_k = surface_k * surface_penalty * tourney_bonus
            final_k = base_k * opponent_bonus
            
            # Gewichtung
            age_weight = get_age_weight(date)
            match_k = final_k * age_weight * match_weight
            
            # 50/50 Misch-Rating
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
            
            if surface == 'Hard':
                elo_ratings[winner]['matches_hard'] += 1
                elo_ratings[winner]['wins_hard'] += 1
            elif surface == 'Clay':
                elo_ratings[winner]['matches_clay'] += 1
                elo_ratings[winner]['wins_clay'] += 1
            elif surface == 'Grass':
                elo_ratings[winner]['matches_grass'] += 1
                elo_ratings[winner]['wins_grass'] += 1
            
            # Update Loser
            elo_ratings[loser]['gesamt'] -= split_delta
            elo_ratings[loser][surface] -= split_delta
            elo_ratings[loser]['matches'] += 1
            elo_ratings[loser]['losses'] += 1
            
            if surface == 'Hard':
                elo_ratings[loser]['matches_hard'] += 1
            elif surface == 'Clay':
                elo_ratings[loser]['matches_clay'] += 1
            elif surface == 'Grass':
                elo_ratings[loser]['matches_grass'] += 1
            
            # Update letzter Belag
            for player in [winner, loser]:
                last_surface_by_player[player] = surface
                last_match_date_by_player[player] = current_date
            
            # Alle 100 Matches speichern
            if i % 100 == 0 and i > 0:
                date_str = str(date) if date else datetime.now().strftime('%Y%m%d')
                for player in [winner, loser]:
                    p_data = elo_ratings[player]
                    
                    recent = all_matches_by_player.get(player, [])[:5]
                    
                    # Recent Form
                    form_score, form_status = calculate_recent_form(recent, player, 5)
                    
                    # Momentum
                    momentum_streak, momentum_status = calculate_momentum(recent, player, 10)
                    
                    for surface_name, key in [
                        ('Rolling_Gesamt', 'gesamt'),
                        ('Rolling_Hard', 'Hard'),
                        ('Rolling_Clay', 'Clay'),
                        ('Rolling_Grass', 'Grass')
                    ]:
                        db_records.append((
                            player,
                            int(round(p_data[key])),
                            surface_name,
                            date_str,
                            p_data['matches'],
                            p_data['wins'],
                            p_data['losses'],
                            age_weight,
                            p_data['matches_hard'],
                            p_data['matches_clay'],
                            p_data['matches_grass'],
                            p_data['wins_hard'],
                            p_data['wins_clay'],
                            p_data['wins_grass'],
                            form_score,
                            form_status,
                            momentum_streak,
                            momentum_status,
                            int(round(p_data['Hard'])),
                            int(round(p_data['Clay'])),
                            int(round(p_data['Grass']))
                        ))
        
        # FINALE ELOs speichern
        print(f"\n   📝 Speichere FINALE ELOs für {len(elo_ratings):,} Spieler...")
        current_date = datetime.now().strftime('%Y%m%d')
        
        for player, p_data in elo_ratings.items():
            recent = all_matches_by_player.get(player, [])[:5]
            
            form_score, form_status = calculate_recent_form(recent, player, 5)
            momentum_streak, momentum_status = calculate_momentum(recent, player, 10)
            
            for surface_name, key in [
                ('Rolling_Gesamt', 'gesamt'),
                ('Rolling_Hard', 'Hard'),
                ('Rolling_Clay', 'Clay'),
                ('Rolling_Grass', 'Grass')
            ]:
                db_records.append((
                    player,
                    int(round(p_data[key])),
                    surface_name,
                    current_date,
                    p_data['matches'],
                    p_data['wins'],
                    p_data['losses'],
                    1.0,
                    p_data['matches_hard'],
                    p_data['matches_clay'],
                    p_data['matches_grass'],
                    p_data['wins_hard'],
                    p_data['wins_clay'],
                    p_data['wins_grass'],
                    form_score,
                    form_status,
                    momentum_streak,
                    momentum_status,
                    int(round(p_data['Hard'])),
                    int(round(p_data['Clay'])),
                    int(round(p_data['Grass']))
                ))
        
        # In Datenbank schreiben
        print(f"   💾 Schreibe {len(db_records):,} Einträge in die Datenbank...")
        elo_conn = sqlite3.connect(ELO_DB_PATH)
        elo_cursor = elo_conn.cursor()
        
        elo_cursor.execute('BEGIN TRANSACTION')
        
        elo_cursor.executemany('''
            INSERT OR REPLACE INTO elo_ratings (
                player_name, elo, surface, date, matches_played, wins, losses,
                weight_factor,
                matches_hard, matches_clay, matches_grass, wins_hard, wins_clay, wins_grass,
                recent_form, recent_form_status,
                momentum_streak, momentum_status,
                elo_hard, elo_clay, elo_grass
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', db_records)
        
        elo_conn.commit()
        elo_conn.close()
        conn.close()
        
        print(f"✅ ELO-Berechnung für {ranking_type.upper()} abgeschlossen!")
        print(f"   📊 {len(db_records):,} Einträge gespeichert")
        
        # Top 10
        top10 = sorted(
            [p for p in elo_ratings if elo_ratings[p]['matches'] >= 3],
            key=lambda x: elo_ratings[x]['gesamt'],
            reverse=True
        )[:10]
        
        print(f"\n📊 TOP 10 {ranking_type.upper()}:")
        print(f"   {'#':2} {'Spieler':25} {'ELO':6} {'Hard':6} {'Clay':6} {'Grass':6} {'M':4}")
        print(f"   {'-'*65}")
        for i, player in enumerate(top10, 1):
            p_data = elo_ratings[player]
            print(f"   {i:2}. {player[:25]:25} {int(p_data['gesamt']):5} {int(p_data['Hard']):5} {int(p_data['Clay']):5} {int(p_data['Grass']):5} {p_data['matches']:4}")
        
    except Exception as e:
        print(f"❌ Fehler: {e}")
        import traceback
        traceback.print_exc()
        conn.close()


def get_current_elo_for_app(player_name):
    """Hilfsfunktion für die App"""
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
    print("=" * 70)
    print("🎾 TENNIS ELO CALCULATOR V3.0")
    print("=" * 70)
    print("⚙️  K-Faktoren: Hard:32 | Clay:30 | Grass:34")
    print("📅 2 Jahre 100% → 90% → 80% → ... → 10%")
    print("🔥 Surface-Specific K-Faktoren")
    print("🔥 Gegner-Stärke (Strength of Schedule)")
    print("🔥 Surface-Switch Penalty")
    print("🔥 Tournament Surface History")
    print("💾 Speichert FINALE ELOs für App-Vorhersagen")
    print("=" * 70)
    
    init_elo_database()
    calculate_tennis_abstract_elo('atp')
    calculate_tennis_abstract_elo('wta')
    
    print("\n" + "=" * 70)
    print("✅ ALLE ELOs berechnet!")
    print(f"📁 DB: {ELO_DB_PATH}")
    print("=" * 70)


if __name__ == "__main__":
    run_calculator()