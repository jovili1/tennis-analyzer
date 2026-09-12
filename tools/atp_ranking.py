import requests
from bs4 import BeautifulSoup
import pandas as pd
import time
import json
import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
import threading
from datetime import datetime

# ============================================================
# NAME MAPPING (wird benötigt)
# ============================================================

def map_player_name(raw_name: str) -> str:
    """Map Spielernamen (einfache Version)"""
    # Hier deine Mapping-Logik einfügen
    # Fallback: Nimm den Namen wie er ist
    return raw_name


# ============================================================
# SCRAPER KERN
# ============================================================

class TennisExplorerScraperGUI:
    """Grafische Oberfläche für den TennisExplorer Scraper"""
    
    def __init__(self, root):
        self.root = root
        self.root.title("🎾 TennisExplorer Scraper")
        self.root.geometry("900x700")
        self.root.configure(bg='#0a0f1a')
        
        # Status
        self.is_running = False
        self.output_path = None
        self.players = []
        self.scraped_count = 0
        self.total_pages = 0
        
        self.setup_ui()
    
    def setup_ui(self):
        """Erstellt die Benutzeroberfläche"""
        main_frame = tk.Frame(self.root, bg='#0a0f1a')
        main_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)
        
        # Header
        header = tk.Label(
            main_frame,
            text="🎾 TennisExplorer Scraper",
            font=('Segoe UI', 24, 'bold'),
            fg='#2ecc71',
            bg='#0a0f1a'
        )
        header.pack(anchor='w', pady=(0, 5))
        
        sub = tk.Label(
            main_frame,
            text="Scraped die aktuelle ATP-Rangliste von TennisExplorer.com",
            font=('Segoe UI', 11),
            fg='#7a8aa3',
            bg='#0a0f1a'
        )
        sub.pack(anchor='w', pady=(0, 20))
        
        # ============================================================
        # SPEICHERORT
        # ============================================================
        save_frame = tk.LabelFrame(
            main_frame,
            text="📁 1. Speicherort auswählen",
            bg='#0a0f1a',
            fg='#7a8aa3',
            font=('Segoe UI', 11, 'bold')
        )
        save_frame.pack(fill=tk.X, pady=(0, 10))
        
        save_inner = tk.Frame(save_frame, bg='#0a0f1a')
        save_inner.pack(fill=tk.X, padx=10, pady=10)
        
        self.save_path_var = tk.StringVar()
        self.save_path_var.set(os.path.join(os.path.expanduser("~"), "Desktop"))
        
        ttk.Entry(save_inner, textvariable=self.save_path_var, width=50).pack(side=tk.LEFT, padx=(0, 10))
        ttk.Button(save_inner, text="📂 Ordner auswählen", command=self.select_folder).pack(side=tk.LEFT)
        
        # ============================================================
        # DATEINAME
        # ============================================================
        name_frame = tk.LabelFrame(
            main_frame,
            text="📄 2. Dateiname",
            bg='#0a0f1a',
            fg='#7a8aa3',
            font=('Segoe UI', 11, 'bold')
        )
        name_frame.pack(fill=tk.X, pady=(0, 10))
        
        name_inner = tk.Frame(name_frame, bg='#0a0f1a')
        name_inner.pack(fill=tk.X, padx=10, pady=10)
        
        tk.Label(name_inner, text="Basis-Name:", font=('Segoe UI', 10), fg='#e0e6f0', bg='#0a0f1a').pack(side=tk.LEFT, padx=(0, 10))
        self.filename_var = tk.StringVar()
        self.filename_var.set("ranking_complete")
        ttk.Entry(name_inner, textvariable=self.filename_var, width=30).pack(side=tk.LEFT, padx=(0, 10))
        
        tk.Label(name_inner, text="Format:", font=('Segoe UI', 10), fg='#e0e6f0', bg='#0a0f1a').pack(side=tk.LEFT, padx=(0, 10))
        self.format_var = tk.StringVar(value="json")
        ttk.Combobox(name_inner, textvariable=self.format_var, values=["json", "csv", "beide"], width=10).pack(side=tk.LEFT)
        
        # ============================================================
        # AKTIONEN
        # ============================================================
        btn_frame = tk.Frame(main_frame, bg='#0a0f1a')
        btn_frame.pack(fill=tk.X, pady=10)
        
        self.btn_start = ttk.Button(
            btn_frame,
            text="🚀 Scraping starten",
            command=self.start_scraping,
            width=20
        )
        self.btn_start.pack(side=tk.LEFT, padx=(0, 10))
        
        self.btn_stop = ttk.Button(
            btn_frame,
            text="⏹ Stop",
            command=self.stop_scraping,
            width=15,
            state='disabled'
        )
        self.btn_stop.pack(side=tk.LEFT, padx=(0, 10))
        
        self.btn_open = ttk.Button(
            btn_frame,
            text="📂 Ordner öffnen",
            command=self.open_folder,
            width=15
        )
        self.btn_open.pack(side=tk.LEFT)
        
        # ============================================================
        # FORTSCHRITT
        # ============================================================
        progress_frame = tk.LabelFrame(
            main_frame,
            text="📊 3. Fortschritt",
            bg='#0a0f1a',
            fg='#7a8aa3',
            font=('Segoe UI', 11, 'bold')
        )
        progress_frame.pack(fill=tk.X, pady=(0, 10))
        
        progress_inner = tk.Frame(progress_frame, bg='#0a0f1a')
        progress_inner.pack(fill=tk.X, padx=10, pady=10)
        
        self.progress_bar = ttk.Progressbar(progress_inner, orient=tk.HORIZONTAL, length=400, mode='determinate')
        self.progress_bar.pack(fill=tk.X)
        
        self.progress_label = tk.Label(
            progress_inner,
            text="⏳ Bereit",
            font=('Segoe UI', 10),
            fg='#7a8aa3',
            bg='#0a0f1a'
        )
        self.progress_label.pack(anchor='w', pady=(5, 0))
        
        self.status_label = tk.Label(
            progress_inner,
            text="✅ Bereit zum Starten",
            font=('Segoe UI', 10),
            fg='#4a5a77',
            bg='#0a0f1a'
        )
        self.status_label.pack(anchor='w')
        
        # ============================================================
        # LOG / AUSGABE
        # ============================================================
        log_frame = tk.LabelFrame(
            main_frame,
            text="📋 4. Log",
            bg='#0a0f1a',
            fg='#7a8aa3',
            font=('Segoe UI', 11, 'bold')
        )
        log_frame.pack(fill=tk.BOTH, expand=True)
        
        self.log_text = scrolledtext.ScrolledText(
            log_frame,
            bg='#141b2b',
            fg='#e0e6f0',
            font=('Consolas', 9),
            relief=tk.FLAT,
            highlightthickness=0,
            height=10
        )
        self.log_text.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        self.log_text.insert(tk.END, "✅ Bereit zum Starten\n")
        self.log_text.config(state=tk.DISABLED)
    
    def log(self, message, color='#e0e6f0'):
        """Fügt eine Nachricht zum Log hinzu"""
        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, message + "\n")
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)
        self.root.update()
    
    def select_folder(self):
        """Wählt den Speicherordner aus"""
        path = filedialog.askdirectory(title="Speicherordner auswählen")
        if path:
            self.save_path_var.set(path)
            self.log(f"📁 Speicherort: {path}")
    
    def open_folder(self):
        """Öffnet den Speicherordner"""
        path = self.save_path_var.get()
        if os.path.exists(path):
            os.startfile(path)
        else:
            messagebox.showerror("Fehler", "Ordner existiert nicht")
    
    def update_progress(self, current, total, label):
        """Aktualisiert den Fortschrittsbalken"""
        if total > 0:
            percent = int((current / total) * 100)
            self.progress_bar['value'] = percent
        self.progress_label.config(text=label)
        self.root.update()
    
    def set_status(self, msg, color='#4a5a77'):
        self.status_label.config(text=msg, fg=color)
        self.root.update()
    
    def stop_scraping(self):
        """Stoppt das Scraping"""
        self.is_running = False
        self.log("⏹ Stop angefordert...", '#f1c40f')
    
    def start_scraping(self):
        """Startet das Scraping in einem Thread"""
        if self.is_running:
            return
        
        # Prüfe Speicherort
        save_path = self.save_path_var.get()
        if not save_path:
            messagebox.showerror("Fehler", "Bitte wähle einen Speicherort aus")
            return
        
        if not os.path.exists(save_path):
            try:
                os.makedirs(save_path)
            except:
                messagebox.showerror("Fehler", "Konnte Ordner nicht erstellen")
                return
        
        self.is_running = True
        self.btn_start.config(state='disabled')
        self.btn_stop.config(state='normal')
        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete(1.0, tk.END)
        self.log_text.config(state=tk.DISABLED)
        self.progress_bar['value'] = 0
        
        threading.Thread(target=self.scraping_thread, daemon=True).start()
    
    def scraping_thread(self):
        """Scraping-Thread"""
        try:
            self.scrape_tennis_explorer()
        except Exception as e:
            self.log(f"❌ Fehler: {str(e)}", '#e74c3c')
            messagebox.showerror("Fehler", str(e))
        finally:
            self.is_running = False
            self.btn_start.config(state='normal')
            self.btn_stop.config(state='disabled')
            self.set_status("✅ Fertig", '#2ecc71')
            self.log("✅ Scraping abgeschlossen!", '#2ecc71')
    
    def scrape_tennis_explorer(self):
        """Haupt-Scraping Funktion"""
        base_url = "https://www.tennisexplorer.com/ranking/atp-men/"
        all_players = []
        current_page = 1
        has_more = True
        
        self.log("🚀 Starte Scraping aller TennisExplorer-Seiten...", '#2ecc71')
        self.set_status("⏳ Scraping läuft...", '#f1c40f')
        
        while has_more and self.is_running:
            url = base_url if current_page == 1 else f"{base_url}?page={current_page}"
            
            self.log(f"📄 Lade Seite {current_page}: {url}", '#3498db')
            self.update_progress(current_page, 0, f"Seite {current_page}...")
            
            try:
                headers = {
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/138.0 Safari/537.36"
                    )
                }
                
                response = requests.get(url, headers=headers, timeout=15)
                
                if response.status_code != 200:
                    self.log(f"⚠️ HTTP {response.status_code}", '#f1c40f')
                    break
                
                soup = BeautifulSoup(response.text, "html.parser")
                
                # Tabelle finden
                table = None
                tables = soup.find_all("table")
                
                for t in tables:
                    text = t.get_text(" ", strip=True)
                    if "Rank" in text and "Player name" in text and "Points" in text:
                        table = t
                        break
                
                if table is None:
                    for t in tables:
                        rows = t.find_all("tr")
                        if len(rows) > 10:
                            table = t
                            break
                
                if table is None:
                    self.log("❌ Ranking-Tabelle nicht gefunden.", '#e74c3c')
                    break
                
                rows = table.find_all("tr")
                players_on_page = 0
                
                for row in rows[1:]:
                    if not self.is_running:
                        self.log("⏹ Abgebrochen", '#f1c40f')
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
                    
                    move = cells[1].get_text(strip=True)
                    raw_name = cells[2].get_text(strip=True)
                    official_name = map_player_name(raw_name)
                    
                    if raw_name != official_name:
                        self.log(f"🔄 {raw_name} → {official_name}", '#f1c40f')
                    
                    country = cells[3].get_text(strip=True)
                    points_text = cells[4].get_text(strip=True).replace(" ", "").replace(".", "")
                    
                    try:
                        points = int(points_text)
                    except:
                        points = 0
                    
                    all_players.append({
                        "rank": int(rank),
                        "move": move,
                        "name": official_name,
                        "country": country,
                        "points": points,
                    })
                    
                    players_on_page += 1
                
                self.log(f"✅ Seite {current_page}: {players_on_page} Spieler gefunden", '#2ecc71')
                self.scraped_count += players_on_page
                
                # Nächste Seite suchen
                next_link = soup.find("a", rel="next")
                
                if next_link is None:
                    for link in soup.find_all("a", href=True):
                        text = link.get_text(strip=True)
                        if text in ["Next", "→", "»", "Weiter"]:
                            next_link = link
                            break
                
                if next_link and players_on_page > 0 and self.is_running:
                    current_page += 1
                    time.sleep(1.5)
                else:
                    has_more = False
                    self.log("🏁 Letzte Seite erreicht.", '#2ecc71')
                    
            except Exception as e:
                self.log(f"❌ Fehler auf Seite {current_page}: {e}", '#e74c3c')
                has_more = False
        
        # ============================================================
        # SPEICHERN
        # ============================================================
        self.log("\n" + "=" * 60)
        self.log(f"📊 Gesamt: {len(all_players)} Spieler exportiert")
        self.log("=" * 60)
        
        if not self.is_running:
            self.log("⏹ Scraping wurde abgebrochen", '#f1c40f')
            return
        
        if not all_players:
            self.log("⚠️ Keine Spieler gefunden!", '#f1c40f')
            return
        
        # Speichern
        save_path = self.save_path_var.get()
        base_name = self.filename_var.get()
        format_choice = self.format_var.get()
        
        self.log(f"\n💾 Speichere nach: {save_path}")
        
        # JSON
        if format_choice in ["json", "beide"]:
            json_path = os.path.join(save_path, f"{base_name}.json")
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(all_players, f, ensure_ascii=False, indent=2)
            self.log(f"✅ JSON: {json_path}")
        
        # CSV
        if format_choice in ["csv", "beide"]:
            df = pd.DataFrame(all_players)
            csv_path = os.path.join(save_path, f"{base_name}.csv")
            df.to_csv(csv_path, index=False, encoding="utf-8-sig")
            self.log(f"✅ CSV: {csv_path}")
        
        self.players = all_players
        
        # Zeitstempel
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        if format_choice in ["json", "beide"]:
            backup_path = os.path.join(save_path, f"{base_name}_{timestamp}.json")
            with open(backup_path, "w", encoding="utf-8") as f:
                json.dump(all_players, f, ensure_ascii=False, indent=2)
            self.log(f"✅ Backup: {backup_path}")
        
        self.log("\n" + "=" * 60)
        self.log("🎾 SCRAPING ABGESCHLOSSEN")
        self.log("=" * 60)
        self.log(f"Spieler gespeichert: {len(all_players)}")
        self.set_status(f"✅ Fertig: {len(all_players)} Spieler", '#2ecc71')
        self.progress_bar['value'] = 100
        self.progress_label.config(text=f"✅ Fertig: {len(all_players)} Spieler")


# ============================================================
# AUSFÜHRUNG
# ============================================================

if __name__ == "__main__":
    root = tk.Tk()
    app = TennisExplorerScraperGUI(root)
    root.mainloop()