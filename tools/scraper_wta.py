import requests
from bs4 import BeautifulSoup
import json
import os
import time

def scrape_wta():
    """Scrapt die WTA-Rangliste von TennisExplorer"""
    base_url = 'https://www.tennisexplorer.com/ranking/wta-women/'
    all_players = []
    current_page = 1
    has_more = True
    
    print('🚀 Starte WTA-Scraper...')
    
    while has_more:
        url = base_url if current_page == 1 else base_url + f'?page={current_page}'
        print(f'📄 Lade WTA Seite {current_page}...')
        
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code != 200:
                print(f'⚠️ Fehler: Status {response.status_code}')
                break
                
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Tabellensuche
            table = None
            all_tables = soup.find_all('table')
            
            for t in all_tables:
                header_text = t.get_text()
                if 'Rank' in header_text and 'Player name' in header_text and 'Points' in header_text:
                    table = t
                    break
            
            if not table:
                for t in all_tables:
                    rows = t.find_all('tr')
                    if len(rows) > 5:
                        table = t
                        break
            
            if not table:
                print('⚠️ Keine WTA-Tabelle gefunden')
                break
            
            rows = table.find_all('tr')
            players_on_page = 0
            
            for row in rows[1:]:
                cells = row.find_all('td')
                if len(cells) < 4:
                    continue
                
                rank_text = cells[0].get_text(strip=True)
                if not rank_text or rank_text == '':
                    continue
                
                rank = rank_text.replace('.', '').strip()
                if not rank.isdigit():
                    continue
                
                move = cells[1].get_text(strip=True) if len(cells) > 1 else ''
                name = cells[2].get_text(strip=True) if len(cells) > 2 else ''
                country = cells[3].get_text(strip=True) if len(cells) > 3 else ''
                
                points_text = cells[4].get_text(strip=True) if len(cells) > 4 else '0'
                points_text = points_text.replace(' ', '').replace('.', '').strip()
                points = int(points_text) if points_text.isdigit() else 0
                
                all_players.append({
                    'rank': int(rank),
                    'move': move,
                    'name': name,
                    'country': country,
                    'points': points
                })
                players_on_page += 1
            
            print(f'✅ WTA Seite {current_page}: {players_on_page} Spieler gefunden')
            
            # Prüfe auf nächste Seite
            next_link = soup.find('a', rel='next')
            if not next_link:
                for link in soup.find_all('a'):
                    if link.get_text().strip() in ['Next', '→', '»', 'Weiter']:
                        next_link = link
                        break
            
            if next_link and players_on_page > 0:
                current_page += 1
                time.sleep(0.5)
            else:
                has_more = False
                print(f'🏁 Letzte WTA-Seite erreicht! ({current_page} Seiten)')
                
        except Exception as e:
            print(f'❌ Fehler auf WTA Seite {current_page}: {e}')
            has_more = False
    
    print(f'📊 WTA: {len(all_players)} Spieler exportiert!')
    
    # Daten speichern
    os.makedirs('data', exist_ok=True)
    
    with open('data/wta_ranking.json', 'w', encoding='utf-8') as f:
        json.dump(all_players, f, ensure_ascii=False, indent=2)
    
    # Kopie für Frontend
    frontend_path = '../frontend/data/wta_ranking.json'
    os.makedirs(os.path.dirname(frontend_path), exist_ok=True)
    with open(frontend_path, 'w', encoding='utf-8') as f:
        json.dump(all_players, f, ensure_ascii=False, indent=2)
    print(f'📁 WTA-Kopie nach {frontend_path} erstellt')
    
    return all_players

if __name__ == "__main__":
    scrape_wta()