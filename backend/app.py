from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import os
import json
import re
import requests
app = Flask(__name__)
CORS(app)

# ============================================================
# PFADE
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = BASE_DIR
FRONTEND_DIR = os.path.join(BASE_DIR, '..', 'frontend')

# 🔥 Datenbanken-Ordner (nur für ELO)
DB_DIR = os.path.join(BASE_DIR, "datenbanken")

# 🔥 Match- und Player-DBs liegen unter backend/spieler/
SPIELER_DIR = os.path.join(BASE_DIR, "spieler")

# Match-Datenbanken (ATP + WTA)
DB_PATH = os.path.join(SPIELER_DIR, "atp_matches.db")
WTA_DB_PATH = os.path.join(SPIELER_DIR, "wta_matches.db")


# ============================================================
# NAMENSKORREKTUREN
# ============================================================

NAME_CORRECTIONS = {
    # ATP Spieler mit Zusätzen
    'Damm Martin (2003)': 'Martin Damm',
    'Cretu Cezar (2001)': 'Cezar Cretu',
    'Sharipov Marat (2002)': 'Marat Sharipov',
    'Alves Mateus (2001)': 'Mateus Alves',
    'Araujo Pedro (2002)': 'Pedro Araujo',
    'Alonso Julian (2005)': 'Julian Alonso',

    # Namen mit Bindestrichen
    'Ramos-Vinolas Albert': 'Albert Ramos-Vinolas',

    # Namen mit vertauschter Reihenfolge
    'Barrios Vera Marcelo Tomas': 'Marcelo Tomas Barrios Vera',
    'Meligeni Rodrigues Alves Felipe': 'Felipe Meligeni Rodrigues Alves',
    'Nakashima Bryce Nakashima': 'Bryce Nakashima',

    # Namen mit Sonderzeichen
    'Alexandrescou Yannick Theodor': 'Yannick Theodor Alexandrescou',
    'Price Pelaez Salvador': 'Salvador Price Pelaez',
    'Cid Subervi Roberto': 'Roberto Cid Subervi',
    'Alberca de las Casas Fantino': 'Fantino Alberca de las Casas',
    'Dominguez Collado Juan Sebastian': 'Juan Sebastian Dominguez Collado',
    'Souza Pinto De Camargo E Silva Andre': 'Andre Souza Pinto De Camargo E Silva',
}

# ============================================================
# DATENBANK VERBINDUNGEN
# ============================================================

def get_db_connection(ranking_type='atp'):
    """
    🔥 FIX: Beide Datenbanken (ATP + WTA) nutzen die Tabelle "matches".
    Vorher stand hier fälschlicherweise 'wta_matches' für WTA,
    was zu 500-Fehlern führte.
    """
    if ranking_type == 'wta':
        db_path = WTA_DB_PATH
    else:
        db_path = DB_PATH

    table_name = 'matches'  # ✅ Beide DBs nutzen "matches"

    if not os.path.exists(db_path):
        print(f"❌ {ranking_type.upper()}-Datenbank nicht gefunden: {db_path}")
        return None, None

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        return conn, table_name
    except Exception as e:
        print(f"❌ {ranking_type.upper()}-Datenbankfehler: {e}")
        return None, None

# ============================================================
# HILFSFUNKTIONEN
# ============================================================

def clean_player_name(name):
    if not name:
        return ""

    # 🔥 Zuerst: Prüfe auf Namenskorrektur
    if name in NAME_CORRECTIONS:
        print(f"📝 Korrigiere Namen: '{name}' → '{NAME_CORRECTIONS[name]}'")
        return NAME_CORRECTIONS[name]

    # Entferne "- profile" und ähnliche Suffixe
    name = re.sub(r'\s*-\s*profile.*$', '', name, flags=re.IGNORECASE).strip()
    # Entferne Klammern und Inhalt (z.B. (2003))
    name = re.sub(r'\([^)]*\)', '', name).strip()
    # Entferne überflüssige Leerzeichen
    name = re.sub(r'\s+', ' ', name).strip()

    # Entferne Jahreszahlen und andere Zusätze
    name = re.sub(r'\s*\(\d{4}\)\s*', ' ', name).strip()
    # Entferne "Jr.", "Sr.", "I", "II", "III" etc.
    name = re.sub(r'\s+(Jr\.|Sr\.|I{1,3})\s*$', '', name, flags=re.IGNORECASE).strip()
    # Entferne doppelte Leerzeichen
    name = re.sub(r'\s+', ' ', name).strip()

    return name

# ============================================================
# API-ROUTEN
# ============================================================

@app.route("/api/player/matches", methods=["GET"])
def get_player_matches():
    player_name = request.args.get("name", "").strip()
    limit = request.args.get("limit", 10, type=int)
    ranking_type = request.args.get("ranking", "atp").lower()

    if not player_name:
        return jsonify({"error": "Bitte Spielername angeben"}), 400

    print(f"📡 Matches Anfrage: '{player_name}' ({ranking_type.upper()})")

    player_name = clean_player_name(player_name)
    limit = max(1, min(limit, 200))

    conn, table = get_db_connection(ranking_type)
    if not conn:
        return jsonify({"error": f"{ranking_type.upper()}-Datenbank nicht verfügbar"}), 500

    try:
        cursor = conn.cursor()

        # 🔥 NUR EXAKTE NAMEN
        name_parts = player_name.split()
        search_names = [player_name]
        if len(name_parts) == 2:
            search_names.append(f"{name_parts[1]} {name_parts[0]}")
        search_names = list(set(search_names))
        print(f"🔍 Suche nach exakten Namen: {search_names}")

        where_conditions = []
        params = []
        for name in search_names:
            where_conditions.append("winner_name = ?")
            params.append(name)
            where_conditions.append("loser_name = ?")
            params.append(name)

        if not where_conditions:
            return jsonify([])

        # 🔥 ALLE Matches
        query = f"""
            SELECT
                tourney_id,
                tourney_date,
                tourney_name,
                surface,
                round,
                winner_name,
                loser_name,
                score,
                minutes,
                w_ace,
                w_df,
                l_ace,
                l_df,
                winner_rank,
                loser_rank
            FROM {table}
            WHERE {' OR '.join(where_conditions)}
            ORDER BY tourney_date DESC
            LIMIT ?
        """
        cursor.execute(query, params + [limit])
        rows = cursor.fetchall()

        matches = []
        for row in rows:
            matches.append({
                "tourney_id": row["tourney_id"],
                "tourney_date": row["tourney_date"],
                "tourney_name": row["tourney_name"],
                "surface": row["surface"],
                "round": row["round"],
                "winner_name": row["winner_name"],
                "loser_name": row["loser_name"],
                "score": row["score"],
                "minutes": row["minutes"],
                "w_ace": row["w_ace"],
                "w_df": row["w_df"],
                "l_ace": row["l_ace"],
                "l_df": row["l_df"],
                "winner_rank": row["winner_rank"],
                "loser_rank": row["loser_rank"]
            })

        conn.close()
        print(f"✅ {len(matches)} Matches für '{player_name}' in {ranking_type.upper()} gefunden")
        return jsonify(matches)

    except Exception as e:
        conn.close()
        print(f"❌ Fehler beim Laden der Matches: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/player/stats", methods=["GET"])
def get_player_stats():
    player_name = request.args.get("name", "").strip()
    ranking_type = request.args.get("ranking", "atp").lower()

    if not player_name:
        return jsonify({"error": "Bitte Spielername angeben"}), 400

    player_name = clean_player_name(player_name)

    conn, table = get_db_connection(ranking_type)
    if not conn:
        return jsonify({"error": f"{ranking_type.upper()}-Datenbank nicht verfügbar"}), 500

    try:
        cursor = conn.cursor()

        name_parts = player_name.split()
        search_names = [player_name]
        if len(name_parts) == 2:
            search_names.append(f"{name_parts[1]} {name_parts[0]}")
        search_names = list(set(search_names))

        where_conditions = []
        params = []
        for name in search_names:
            where_conditions.append("winner_name = ?")
            params.append(name)
            where_conditions.append("loser_name = ?")
            params.append(name)

        if not where_conditions:
            return jsonify({"total_matches": 0, "wins": 0, "avg_duration": 0, "avg_aces": 0, "avg_df": 0, "avg_rank": 0})

        winner_conditions = []
        for name in search_names:
            winner_conditions.append("winner_name = ?")

        all_params = []
        for name in search_names:
            all_params.append(name)
        for name in search_names:
            all_params.append(name)
        for name in search_names:
            all_params.append(name)
        for name in search_names:
            all_params.append(name)
        for name in search_names:
            all_params.append(name)
            all_params.append(name)

        query = f"""
            SELECT
                COUNT(*) AS total_matches,
                SUM(CASE WHEN {' OR '.join(winner_conditions)} THEN 1 ELSE 0 END) AS wins,
                AVG(minutes) AS avg_duration,
                AVG(CASE WHEN {' OR '.join(winner_conditions)} THEN w_ace ELSE l_ace END) AS avg_aces,
                AVG(CASE WHEN {' OR '.join(winner_conditions)} THEN w_df ELSE l_df END) AS avg_df,
                AVG(CASE WHEN {' OR '.join(winner_conditions)} THEN winner_rank ELSE loser_rank END) AS avg_rank
            FROM {table}
            WHERE {' OR '.join(where_conditions)}
        """

        cursor.execute(query, all_params)
        row = cursor.fetchone()
        conn.close()

        if row:
            return jsonify({
                "total_matches": int(row["total_matches"] or 0),
                "wins": int(row["wins"] or 0),
                "avg_duration": round(row["avg_duration"] or 0, 1),
                "avg_aces": round(row["avg_aces"] or 0, 1),
                "avg_df": round(row["avg_df"] or 0, 1),
                "avg_rank": round(row["avg_rank"] or 0, 1)
            })

        return jsonify({
            "total_matches": 0,
            "wins": 0,
            "avg_duration": 0,
            "avg_aces": 0,
            "avg_df": 0,
            "avg_rank": 0
        })

    except Exception as e:
        conn.close()
        print(f"❌ Fehler beim Laden der Stats: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/player/search", methods=["GET"])
def search_player():
    search_term = request.args.get("q", "").strip()
    ranking_type = request.args.get("ranking", "atp").lower()
    limit = request.args.get("limit", 20, type=int)

    if len(search_term) < 2:
        return jsonify([])

    conn, table = get_db_connection(ranking_type)
    if not conn:
        return jsonify([])

    try:
        cursor = conn.cursor()
        pattern = f"%{search_term}%"

        query = f"""
            SELECT name, COUNT(*) AS match_count FROM (
                SELECT winner_name AS name FROM {table}
                WHERE winner_name IS NOT NULL AND winner_name LIKE ? COLLATE NOCASE
                UNION ALL
                SELECT loser_name AS name FROM {table}
                WHERE loser_name IS NOT NULL AND loser_name LIKE ? COLLATE NOCASE
            ) AS player_names
            GROUP BY name
            ORDER BY match_count DESC, name ASC
            LIMIT ?
        """

        cursor.execute(query, (pattern, pattern, limit))
        rows = cursor.fetchall()
        conn.close()

        results = [row["name"] for row in rows]
        return jsonify(results)

    except Exception as e:
        conn.close()
        return jsonify([])

@app.route("/api/player/find", methods=["GET"])
def find_player():
    player_name = request.args.get("name", "").strip()
    ranking_type = request.args.get("ranking", "atp").lower()

    if not player_name:
        return jsonify({"found": False, "name": None}), 400

    player_name = clean_player_name(player_name)
    if not player_name:
        return jsonify({"found": False, "name": None}), 400

    print(f"📡 Find Anfrage: '{player_name}' ({ranking_type.upper()})")

    conn, table = get_db_connection(ranking_type)
    if not conn:
        return jsonify({"found": False, "name": None}), 500

    try:
        cursor = conn.cursor()

        name_parts = player_name.split()
        search_names = [player_name]
        if len(name_parts) == 2:
            search_names.append(f"{name_parts[1]} {name_parts[0]}")
        search_names = list(set(search_names))
        print(f"🔍 Suche nach exakten Namen: {search_names}")

        for search_name in search_names:
            query = f"""
                SELECT winner_name AS name FROM {table}
                WHERE winner_name = ?
                UNION
                SELECT loser_name AS name FROM {table}
                WHERE loser_name = ?
                LIMIT 10
            """
            cursor.execute(query, (search_name, search_name))
            rows = cursor.fetchall()

            if rows:
                found_name = rows[0]["name"]
                print(f"✅ Exakte Übereinstimmung: '{found_name}'")
                conn.close()
                return jsonify({"found": True, "name": found_name})

        conn.close()
        print(f"❌ Keine exakte Übereinstimmung für '{player_name}'")
        return jsonify({"found": False, "name": None})

    except Exception as e:
        conn.close()
        print(f"❌ Fehler bei find_player: {e}")
        return jsonify({"found": False, "name": None}), 500

# ============================================================
# WTA ROUTEN (Aliase für /api/player/*)
# ============================================================

@app.route("/api/wta/player/matches", methods=["GET"])
def get_wta_player_matches():
    return get_player_matches()

@app.route("/api/wta/player/stats", methods=["GET"])
def get_wta_player_stats():
    return get_player_stats()

@app.route("/api/wta/player/search", methods=["GET"])
def get_wta_player_search():
    return search_player()

@app.route("/api/wta/player/find", methods=["GET"])
def get_wta_player_find():
    return find_player()

# ============================================================
# ROUTEN FÜR players.js
# ============================================================

@app.route("/backend/spieler/<path:filename>", methods=["GET"])
def get_spieler_file(filename):
    spieler_dir = os.path.join(BACKEND_DIR, 'spieler')
    if not os.path.exists(spieler_dir):
        os.makedirs(spieler_dir)
    return send_from_directory(spieler_dir, filename)

@app.route("/backend/ranglisten/<path:filename>", methods=["GET"])
def get_ranking_file(filename):
    ranking_dir = os.path.join(BACKEND_DIR, 'ranglisten')
    if not os.path.exists(ranking_dir):
        os.makedirs(ranking_dir)
    return send_from_directory(ranking_dir, filename)

# ============================================================
# HEALTH CHECKS
# ============================================================

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "atp_database_exists": os.path.exists(DB_PATH),
        "wta_database_exists": os.path.exists(WTA_DB_PATH)
    })

@app.route("/api/test", methods=["GET"])
def test():
    return jsonify({
        "message": "API läuft!",
        "status": "ok",
        "paths": {
            "atp_db": DB_PATH,
            "wta_db": WTA_DB_PATH
        }
    })

# ============================================================
# FRONTEND SERVEN
# ============================================================

@app.route('/')
def serve_frontend():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(FRONTEND_DIR, path)

# ============================================================
# ELO ROUTEN
# ============================================================

@app.route("/api/elo", methods=["GET"])
def get_elo():
    """Holt aktuelle ELO für einen Spieler (gibt immer 200 zurück)"""
    player_name = request.args.get("name", "").strip()
    surface = request.args.get("surface", "Rolling_Gesamt").strip()

    if not player_name:
        return jsonify({"error": "Bitte Spielername angeben"}), 400

    elo_db_path = os.path.join(DB_DIR, 'elo_ratings.db')

    if not os.path.exists(elo_db_path):
        return jsonify({
            "player_name": player_name,
            "elo": None,
            "surface": surface,
            "date": None,
            "matches_played": 0,
            "wins": 0,
            "losses": 0,
            "message": "Keine ELO-Datenbank vorhanden"
        })

    try:
        conn = sqlite3.connect(elo_db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT player_name, elo, surface, date, matches_played, wins, losses
            FROM elo_ratings
            WHERE player_name = ? AND surface = ?
            ORDER BY date DESC
            LIMIT 1
        ''', (player_name, surface))

        row = cursor.fetchone()
        conn.close()

        if row:
            return jsonify({
                "player_name": row["player_name"],
                "elo": row["elo"],
                "surface": row["surface"],
                "date": row["date"],
                "matches_played": row["matches_played"],
                "wins": row["wins"],
                "losses": row["losses"]
            })
        else:
            return jsonify({
                "player_name": player_name,
                "elo": None,
                "surface": surface,
                "date": None,
                "matches_played": 0,
                "wins": 0,
                "losses": 0,
                "message": f"Keine ELO-Daten für {player_name}"
            })

    except Exception as e:
        print(f"⚠️ ELO-Fehler: {e}")
        return jsonify({
            "player_name": player_name,
            "elo": None,
            "surface": surface,
            "date": None,
            "matches_played": 0,
            "wins": 0,
            "losses": 0,
            "error": str(e)
        })


@app.route("/api/elo/top", methods=["GET"])
def get_elo_top():
    """Holt Top 10 ELO für einen Ranking-Typ (gibt immer 200 zurück)"""
    surface = request.args.get("surface", "Rolling_Gesamt").strip()
    limit = request.args.get("limit", 10, type=int)

    elo_db_path = os.path.join(DB_DIR, 'elo_ratings.db')

    if not os.path.exists(elo_db_path):
        return jsonify([])

    try:
        conn = sqlite3.connect(elo_db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT player_name, elo, surface, matches_played, wins, losses
            FROM elo_ratings
            WHERE surface = ?
            GROUP BY player_name
            HAVING date = MAX(date)
            ORDER BY elo DESC
            LIMIT ?
        ''', (surface, limit))

        rows = cursor.fetchall()
        conn.close()

        result = []
        for row in rows:
            result.append({
                "player_name": row["player_name"],
                "elo": row["elo"],
                "surface": row["surface"],
                "matches_played": row["matches_played"],
                "wins": row["wins"],
                "losses": row["losses"]
            })

        return jsonify(result)

    except Exception as e:
        print(f"⚠️ ELO-Top-Fehler: {e}")
        return jsonify([])


# =============================================
# 🔄 ELO UPDATE ENDPOINT
# =============================================

@app.route('/api/update-elo', methods=['POST'])
def update_elo():
    import subprocess
    try:
        script = os.path.join(os.path.dirname(__file__), 'elo_rolling_calculator.py')
        result = subprocess.run(['python', script], capture_output=True, text=True)
        if result.returncode == 0:
            return {'success': True, 'message': 'ELOs aktualisiert!'}
        else:
            return {'success': False, 'message': result.stderr}, 500
    except Exception as e:
        return {'success': False, 'message': str(e)}, 500


@app.route('/api/elo/last-update', methods=['GET'])
def get_last_update():
    db_path = os.path.join(DB_DIR, 'elo_ratings.db')

    if not os.path.exists(db_path):
        return jsonify({'date': None, 'exists': False})

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT MAX(date) FROM elo_ratings")
        result = cursor.fetchone()
        conn.close()

        if result and result[0]:
            date_str = result[0]
            formatted = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
            return jsonify({'date': formatted, 'exists': True})
        else:
            return jsonify({'date': None, 'exists': True})
    except Exception as e:
        print(f"[FEHLER] get_last_update: {e}")
        return jsonify({'date': None, 'exists': False})

# ============================================================
# TURNIER-PROXY (für Dashboard)
# ============================================================

@app.route('/api/tournaments', methods=['GET'])
def get_tournaments():
    """Holt aktuelle Turniere von TennisExplorer (Backend-Proxy)"""

    try:
        print("📡 Lade Turniere von TennisExplorer...")

        response = requests.get(
            'https://www.tennisexplorer.com/',
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'},
            timeout=10
        )

        if response.status_code != 200:
            print(f"❌ TennisExplorer antwortet mit {response.status_code}")
            return jsonify([])

        html = response.text
        tournaments = []

        # 🔥 ATP Turniere (half-l Bereich)
        atp_match = re.search(r'<div class="half-l">(.*?)</div>\s*<div class="half-r">', html, re.DOTALL)
        if atp_match:
            atp_html = atp_match.group(1)
            rows = re.findall(r'<tr[^>]*>(.*?)</tr>', atp_html, re.DOTALL)

            for row in rows:
                if 'class="head"' in row:
                    continue

                name_match = re.search(r'<a[^>]*>(?:<span[^>]*>[^<]*</span>\s*)?([^<]+)</a>', row)
                if not name_match:
                    continue

                name = name_match.group(1).strip()
                if not name or len(name) < 3:
                    continue
                if 'UTR Pro' in name or 'Series' in name:
                    continue

                if '...' in name or len(name) < 5:
                    title_match = re.search(r'title="([^"]+)"[^>]*onmouseover', row)
                    if title_match:
                        full_name = title_match.group(1).strip()
                        if full_name and len(full_name) > len(name):
                            name = full_name

                flag_match = re.search(r'fl-([a-z]{2})', row)
                country = flag_match.group(1).upper() if flag_match else 'unknown'

                surface_match = re.search(r'<span title="([^"]+)"[^>]*style="background-color:', row)
                surface = surface_match.group(1) if surface_match else '—'

                prize_match = re.search(r'Prize money ([\d,]+)\s*\$', row)
                prize = f"${prize_match.group(1)}" if prize_match else '—'

                matches_match = re.search(r'<td[^>]*class="[^"]*nxGame[^"]*"[^>]*>(\d+)</td>', row)
                matches = int(matches_match.group(1)) if matches_match else 0

                print(f"  📌 ATP: {name} ({country})")

                tournaments.append({
                    'name': name,
                    'country': country,
                    'surface': surface,
                    'prize': prize,
                    'status': 'Live' if matches > 0 else 'Aktiv',
                    'matches': matches,
                    'tour': 'ATP'
                })

        # 🔥 WTA Turniere (half-r Bereich)
        wta_match = re.search(r'<div class="half-r">(.*?)</div>\s*<div class="clr', html, re.DOTALL)
        if wta_match:
            wta_html = wta_match.group(1)
            rows = re.findall(r'<tr[^>]*>(.*?)</tr>', wta_html, re.DOTALL)

            for row in rows:
                if 'class="head"' in row:
                    continue

                name_match = re.search(r'<a[^>]*>(?:<span[^>]*>[^<]*</span>\s*)?([^<]+)</a>', row)
                if not name_match:
                    continue

                name = name_match.group(1).strip()
                if not name or len(name) < 3:
                    continue
                if 'UTR Pro' in name or 'Series' in name:
                    continue

                if '...' in name or len(name) < 5:
                    title_match = re.search(r'title="([^"]+)"[^>]*onmouseover', row)
                    if title_match:
                        full_name = title_match.group(1).strip()
                        if full_name and len(full_name) > len(name):
                            name = full_name

                if any(t['name'] == name for t in tournaments):
                    continue

                flag_match = re.search(r'fl-([a-z]{2})', row)
                country = flag_match.group(1).upper() if flag_match else 'unknown'

                surface_match = re.search(r'<span title="([^"]+)"[^>]*style="background-color:', row)
                surface = surface_match.group(1) if surface_match else '—'

                prize_match = re.search(r'Prize money ([\d,]+)\s*\$', row)
                prize = f"${prize_match.group(1)}" if prize_match else '—'

                matches_match = re.search(r'<td[^>]*class="[^"]*nxGame[^"]*"[^>]*>(\d+)</td>', row)
                matches = int(matches_match.group(1)) if matches_match else 0

                print(f"  📌 WTA: {name} ({country})")

                tournaments.append({
                    'name': name,
                    'country': country,
                    'surface': surface,
                    'prize': prize,
                    'status': 'Live' if matches > 0 else 'Aktiv',
                    'matches': matches,
                    'tour': 'WTA'
                })

        tournaments.sort(key=lambda x: (
            0 if 'Open' in x['name'] or 'Masters' in x['name'] or 'Wimbledon' in x['name'] else 1,
            -x.get('matches', 0)
        ))

        result = tournaments[:10]
        print(f"✅ {len(result)} Turniere geladen")
        return jsonify(result)

    except Exception as e:
        print(f"❌ Fehler beim Laden der Turniere: {e}")
        return jsonify([])

# ============================================================
# MATCHES VON SPORTSCORE API (Backend-Proxy)
# ============================================================

@app.route('/api/live-matches', methods=['GET'])
def get_live_matches():
    """Holt Live-Matches von TennisExplorer (funktioniert auch von Render)"""

    try:
        print("📡 Lade Live-Matches von TennisExplorer...")

        url = 'https://www.tennisexplorer.com/live/'

        response = requests.get(
            url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
            },
            timeout=15
        )

        if response.status_code != 200:
            print(f"❌ TennisExplorer antwortet mit {response.status_code}")
            return jsonify([])

        html = response.text

        # Tabellen-Zeilen finden
        rows = re.findall(r'<tr[^>]*class="[^"]*"[^>]*>(.*?)</tr>', html, re.DOTALL)

        matches = []

        for row in rows:
            # Spieler-Links finden
            player_links = re.findall(
                r'<td[^>]*class="[^"]*player[^"]*"[^>]*>.*?<a[^>]*>([^<]+)</a>',
                row, re.DOTALL
            )

            # Fallback: Alle Links finden
            if len(player_links) < 2:
                all_links = re.findall(r'<a[^>]*href="[^"]*player[^"]*"[^>]*>([^<]+)</a>', row)
                if len(all_links) >= 2:
                    player_links = all_links[:2]

            if len(player_links) < 2:
                continue

            player1 = player_links[0].strip()
            player2 = player_links[1].strip()

            if not player1 or not player2 or len(player1) < 3 or len(player2) < 3:
                continue

            # Score extrahieren
            score_match = re.search(
                r'<td[^>]*class="[^"]*score[^"]*"[^>]*>(.*?)</td>',
                row, re.DOTALL
            )
            if not score_match:
                # Fallback: Alle Zellen durchsuchen
                cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
                score = '—'
                for cell in cells:
                    cell_clean = re.sub(r'<[^>]+>', '', cell).strip()
                    if re.match(r'^[\d\s\-\:\(\)]+$', cell_clean) and len(cell_clean) > 2:
                        score = cell_clean
                        break
            else:
                score = re.sub(r'<[^>]+>', '', score_match.group(1)).strip()

            if not score:
                score = '—'

            # Turnier extrahieren
            tourney_match = re.search(
                r'<td[^>]*class="[^"]*tourney[^"]*"[^>]*>.*?<a[^>]*>([^<]+)</a>',
                row, re.DOTALL
            )
            if tourney_match:
                tourney = tourney_match.group(1).strip()
            else:
                # Fallback: aus dem href
                tourney_link = re.search(r'href="(/results/\?t=[^"]+)"', row)
                tourney = 'Live'

            # Status bestimmen (falls Spiel läuft vs beendet)
            row_lower = row.lower()
            if 'finished' in row_lower or 'ended' in row_lower:
                status = 'finished'
                status_display = '✅ Beendet'
            else:
                status = 'live'
                status_display = '🟢 Live'

            matches.append({
                'player1': player1,
                'player2': player2,
                'score': score,
                'status': status_display,
                'raw_status': status,
                'time': None,
                'tourney': tourney
            })

        # 🔥 Falls keine echten Live-Matches: Fallback mit den letzten Ergebnissen
        if len(matches) == 0:
            print("⚠️ Keine Live-Matches, versuche Ergebnisse-Seite...")
            # Alternativ: /results/ Seite
            alt_response = requests.get(
                'https://www.tennisexplorer.com/results/',
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'},
                timeout=15
            )

            if alt_response.status_code == 200:
                alt_rows = re.findall(r'<tr[^>]*>(.*?)</tr>', alt_response.text, re.DOTALL)
                for row in alt_rows[:30]:
                    links = re.findall(r'<a[^>]*href="[^"]*player[^"]*"[^>]*>([^<]+)</a>', row)
                    if len(links) < 2:
                        continue
                    p1 = links[0].strip()
                    p2 = links[1].strip()
                    if not p1 or not p2:
                        continue

                    cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
                    score = '—'
                    for cell in cells:
                        cell_clean = re.sub(r'<[^>]+>', '', cell).strip()
                        if re.match(r'^[\d\s\-\:\(\)]+$', cell_clean) and len(cell_clean) > 2:
                            score = cell_clean
                            break

                    matches.append({
                        'player1': p1,
                        'player2': p2,
                        'score': score,
                        'status': '✅ Beendet',
                        'raw_status': 'finished',
                        'time': None,
                        'tourney': 'Ergebnis'
                    })

        # Limitiere auf 12 Matches
        result = matches[:12]

        print(f"✅ {len(result)} Matches geladen von TennisExplorer")
        return jsonify(result)

    except Exception as e:
        print(f"❌ Fehler beim Laden der Matches: {e}")
        return jsonify([])


@app.route('/api/debug-enetscores', methods=['GET'])
def debug_enetscores():
    """Analysiert die enetscores Widget-Datei"""
    results = {}
    
    # 1. Widget-JavaScript laden und nach URLs durchsuchen
    try:
        widget_url = 'https://widget.enetscores.com/FW6137D1984DA35ACE'
        response = requests.get(
            widget_url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.tennisexplorer.com/'
            },
            timeout=10
        )
        
        js = response.text
        
        # URLs aus dem JavaScript extrahieren
        urls = re.findall(r'https?://[^\s\'"<>]+', js)
        api_urls = [u for u in urls if 'api' in u.lower() or 'enetscores' in u.lower()]
        
        results['widget_urls'] = api_urls[:20]
        results['widget_full_js'] = js  # Kompletter Code
        
    except Exception as e:
        results['widget_error'] = str(e)
    
    # 2. Hauptseite scrapen
    try:
        main_url = 'https://www.enetscores.com/live-scores'
        response = requests.get(
            main_url,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout=10
        )
        
        html = response.text
        
        # Suche nach JavaScript-URLs und API-Endpoints
        scripts = re.findall(r'<script[^>]*src="([^"]+)"', html)
        results['main_scripts'] = scripts[:20]
        
        # Suche nach iframes
        iframes = re.findall(r'<iframe[^>]*src="([^"]+)"', html)
        results['main_iframes'] = iframes[:10]
        
        # Suche nach API-URLs im HTML
        api_urls = re.findall(r'https?://[^\s\'"<>]*(?:api|json|data)[^\s\'"<>]*', html)
        results['main_api_urls'] = list(set(api_urls))[:20]
        
    except Exception as e:
        results['main_error'] = str(e)
    
    return jsonify(results)


# ============================================================
# START
# ============================================================

if __name__ == "__main__":
    ATP_REAL = os.path.join(SPIELER_DIR, "atp_matches.db")
    WTA_REAL = os.path.join(SPIELER_DIR, "wta_matches.db")
    ATP_PLAYERS = os.path.join(SPIELER_DIR, "atp_players.db")
    WTA_PLAYERS = os.path.join(SPIELER_DIR, "wta_players.db")

    # 🔥 Render-kompatibel: Port aus Umgebungsvariable
    port = int(os.environ.get("PORT", 5000))

    print("=" * 60)
    print("🎾 TENNIS API v3.3")
    print("=" * 60)
    print(f"📁 ATP Match-DB:    {'✅' if os.path.exists(ATP_REAL) else '❌'}  {ATP_REAL}")
    print(f"📁 WTA Match-DB:    {'✅' if os.path.exists(WTA_REAL) else '❌'}  {WTA_REAL}")
    print(f"📁 ATP Player-DB:   {'✅' if os.path.exists(ATP_PLAYERS) else '❌'}  {ATP_PLAYERS}")
    print(f"📁 WTA Player-DB:   {'✅' if os.path.exists(WTA_PLAYERS) else '❌'}  {WTA_PLAYERS}")
    print()
    print(f"🔗 http://localhost:{port}")
    print("=" * 60)
    print()

    app.run(host="0.0.0.0", port=port, debug=False)