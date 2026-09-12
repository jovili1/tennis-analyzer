import requests
from bs4 import BeautifulSoup
import json
import time
import re
from urllib.parse import urljoin

def scrape_wta_player_details(player_url):
    """Extrahiert ALLE Details von der WTA-Profilseite eines Spielers."""
    print(f'  👤 Besuche: {player_url}')
    
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        response = requests.get(player_url, headers=headers, timeout=15)
        
        if response.status_code != 200:
            print(f'    ⚠️ Fehler: Status {response.status_code}')
            return None
            
        soup = BeautifulSoup(response.text, 'html.parser')
        page_text = soup.get_text()
        
        # Name
        name = None
        if soup.find('h1'):
            name = soup.find('h1').get_text(strip=True)
        
        player_data = {
            'name': name,
            'country': None,
            'height_weight': None,
            'age': None,
            'current_highest_singles': None,
            'current_highest_doubles': None,
            'sex': 'Weiblich',
            'plays': None,
        }
        
        # Details extrahieren
        country_match = re.search(r'Country:\s*([^\n]+)', page_text, re.IGNORECASE)
        if country_match:
            player_data['country'] = country_match.group(1).strip()
        
        hw_match = re.search(r'Height / Weight:\s*([^\n]+?)(?=\s*Age:|$)', page_text, re.IGNORECASE)
        if hw_match:
            player_data['height_weight'] = hw_match.group(1).strip()
        
        age_match = re.search(r'Age:\s*([^\n]+)', page_text, re.IGNORECASE)
        if age_match:
            player_data['age'] = age_match.group(1).strip()
        
        singles_match = re.search(r'Current/Highest rank - singles:\s*([^\n]+)', page_text, re.IGNORECASE)
        if singles_match:
            player_data['current_highest_singles'] = singles_match.group(1).strip()
        
        doubles_match = re.search(r'Current/Highest rank - doubles:\s*([^\n]+)', page_text, re.IGNORECASE)
        if doubles_match:
            player_data['current_highest_doubles'] = doubles_match.group(1).strip()
        
        plays_match = re.search(r'Plays:\s*([^\n]+)', page_text, re.IGNORECASE)
        if plays_match:
            player_data['plays'] = plays_match.group(1).strip()
        
        return player_data
        
    except Exception as e:
        print(f'    ❌ Fehler: {e}')
        return None

def get_all_wta_player_links():
    """Holt ALLE WTA-Spieler-Links von ALLEN Ranglisten-Seiten."""
    player_links = []
    base_url = 'https://www.tennisexplorer.com/ranking/wta-women/'
    current_page = 1
    has_more = True
    
    print('📊 Sammle WTA-Links von allen Ranglisten-Seiten...')
    
    while has_more:
        url = base_url if current_page == 1 else base_url + f'?page={current_page}'
        print(f'📄 Lade Ranglisten-Seite {current_page}...')
        
        try:
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            response = requests.get(url, headers=headers, timeout=15)
            
            if response.status_code != 200:
                print(f'⚠️ Fehler: Status {response.status_code}')
                break
                
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Alle Tabellen durchsuchen
            all_tables = soup.find_all('table')
            table = None
            
            for t in all_tables:
                links = t.find_all('a', href=True)
                for link in links:
                    href = link['href']
                    if re.match(r'^/player/.*-\w+/$', href) or re.match(r'^/player/\w+/$', href):
                        table = t
                        break
                if table:
                    break
            
            if not table:
                print('⚠️ Keine Tabelle mit Spieler-Links gefunden.')
                break
            
            # Links aus der Tabelle extrahieren
            for link in table.find_all('a', href=True):
                href = link['href']
                if re.match(r'^/player/.*-\w+/$', href) or re.match(r'^/player/\w+/$', href):
                    full_url = urljoin('https://www.tennisexplorer.com', href)
                    if full_url not in player_links:
                        player_links.append(full_url)
            
            # Prüfe auf "Weiter"-Link
            next_link = None
            
            # Methode 1: rel="next"
            next_link = soup.find('a', rel='next')
            
            # Methode 2: Suche nach Links mit "→" oder "Next"
            if not next_link:
                for link in soup.find_all('a', href=True):
                    text = link.get_text().strip()
                    if text in ['→', '»', 'Next', 'Weiter', 'next']:
                        next_link = link
                        break
            
            # Methode 3: Suche nach "?page=" im href
            if not next_link:
                for link in soup.find_all('a', href=True):
                    href = link.get('href', '')
                    if '?page=' in href and 'page=' + str(current_page + 1) in href:
                        next_link = link
                        break
            
            if next_link:
                current_page += 1
                time.sleep(0.5)
                print(f'➡️ Nächste Seite gefunden! (Seite {current_page})')
            else:
                has_more = False
                print(f'🏁 Letzte Seite erreicht! ({current_page} Seiten)')
                
        except Exception as e:
            print(f'❌ Fehler: {e}')
            has_more = False
    
    print(f'✅ {len(player_links)} WTA-Links gefunden.')
    return player_links

def main():
    print('='*60)
    print('🎾 WTA DETAIL-SCRAPER FÜR ALLE SPIELERINNEN')
    print('='*60)
    print()
    
    # Alle WTA-Links holen
    player_links = get_all_wta_player_links()
    if not player_links:
        print('❌ Keine Links gefunden.')
        return
    
    print(f'\n📊 Bearbeite {len(player_links)} WTA-Spielerinnen...\n')
    
    # Details scrapen
    all_players_data = []
    for i, link in enumerate(player_links):
        print(f'[{i+1}/{len(player_links)}]', end=' ')
        player_data = scrape_wta_player_details(link)
        if player_data:
            all_players_data.append(player_data)
            print(f'    ✅ {player_data["name"]} gespeichert.')
        else:
            print('    ❌ Übersprungen.')
        time.sleep(0.8)
    
    # Speichern
    with open('wta_players_detailed.json', 'w', encoding='utf-8') as f:
        json.dump(all_players_data, f, ensure_ascii=False, indent=2)
    
    import os
    os.makedirs('../frontend/data', exist_ok=True)
    with open('../frontend/data/wta_players_detailed.json', 'w', encoding='utf-8') as f:
        json.dump(all_players_data, f, ensure_ascii=False, indent=2)
    
    print(f'\n✅ FERTIG! {len(all_players_data)} WTA-Spielerinnen in wta_players_detailed.json gespeichert.')
    print(f'📁 Datei: frontend/data/wta_players_detailed.json')

if __name__ == "__main__":
    main()