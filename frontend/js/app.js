// ==========================================
// HAUPT-APP
// ==========================================

console.log('🔥 app.js wird geladen...');

// ===== GLOBALE DATENBANKEN (eine Quelle der Wahrheit: window.*) =====
window.globalDbATP = null;
window.globalDbWTA = null;
window.currentRankingType = 'atp';

// ===== ZIP-QUELLE (GitHub Releases) =====
const DB_RELEASE_URL = 'https://api.allorigins.win/raw?url=https%3A%2F%2Fgithub.com%2Fjovili1%2Ftennis-analyzer%2Freleases%2Fdownload%2Fv1.0.0';

// ===== ZIP-ENTPACKUNG (aus GitHub Releases) =====
async function loadZippedDatabase(zipUrl) {
    const response = await fetch(zipUrl);
    if (!response.ok) throw new Error(`ZIP nicht gefunden: ${zipUrl}`);
    const zipBuffer = await response.arrayBuffer();
    const unzipped = fflate.unzipSync(new Uint8Array(zipBuffer));
    const filename = Object.keys(unzipped)[0];
    console.log(`📦 ZIP entpackt: ${filename}`);
    return unzipped[filename];
}

// ===== DATENBANK SCHLIESSEN =====
function closeDatabase(type) {
    if (type === 'atp' && window.globalDbATP) {
        try {
            window.globalDbATP.close();
            console.log('✅ ATP-DB geschlossen');
            window.globalDbATP = null;
        } catch(e) {
            console.warn('⚠️ Fehler beim Schließen der ATP-DB:', e);
        }
    } else if (type === 'wta' && window.globalDbWTA) {
        try {
            window.globalDbWTA.close();
            console.log('✅ WTA-DB geschlossen');
            window.globalDbWTA = null;
        } catch(e) {
            console.warn('⚠️ Fehler beim Schließen der WTA-DB:', e);
        }
    }
}

// ===== DATENBANK LADEN (EINZIGER LADEPFAD) =====
async function loadDatabase(type) {
    // Prüfen ob schon geladen und nicht geschlossen
    const existing = type === 'atp' ? window.globalDbATP : window.globalDbWTA;
    if (existing) {
        try {
            existing.exec('SELECT 1');
            console.log(`✅ ${type.toUpperCase()}-DB bereits geladen`);
            return existing;
        } catch(e) {
            console.log(`⚠️ ${type.toUpperCase()}-DB ist geschlossen, lade neu...`);
            if (type === 'atp') window.globalDbATP = null;
            else window.globalDbWTA = null;
        }
    }

    console.log(`📦 Lade ${type.toUpperCase()}-DB...`);
    try {
        const SQL = await initSqlJs({ locateFile: f => `https://sql.js.org/dist/${f}` });

        // 🔥 Lokal: direkt aus ../backend/spieler/
        // 🔥 Online: ZIP aus GitHub Releases entpacken
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        let dbBytes;

        if (isLocal) {
            const filename = type === 'atp' ? 'atp_matches.db' : 'wta_matches.db';
            const res = await fetch(`../backend/spieler/${filename}`);
            if (!res.ok) throw new Error(`${filename} nicht gefunden`);
            dbBytes = new Uint8Array(await res.arrayBuffer());
        } else {
            const zipName = type === 'atp' ? 'atp_matches.zip' : 'wta_matches.zip';
            const zipUrl = `${DB_RELEASE_URL}/${zipName}`;
            console.log(`📦 Lade ZIP von GitHub Releases: ${zipName}`);
            dbBytes = await loadZippedDatabase(zipUrl);
        }

        const db = new SQL.Database(dbBytes);
        db._type = type;

        if (type === 'atp') window.globalDbATP = db;
        else window.globalDbWTA = db;

        window.currentRankingType = type;
        console.log(`✅ ${type.toUpperCase()}-DB geladen (${(dbBytes.byteLength/1024/1024).toFixed(1)} MB)`);
        return db;
    } catch (error) {
        console.error(`❌ Fehler beim Laden der ${type.toUpperCase()}-DB:`, error);
        return null;
    }
}

// ===== DATENBANK HOLEN (SYNCHRON) =====
function getDatabase(type) {
    let db = type === 'atp' ? window.globalDbATP : window.globalDbWTA;

    if (!db) {
        console.warn(`⚠️ ${type.toUpperCase()}-DB nicht geladen`);
        return null;
    }

    try {
        db.exec('SELECT 1');
        return db;
    } catch(e) {
        console.warn(`⚠️ ${type.toUpperCase()}-DB ist geschlossen`);
        if (type === 'atp') window.globalDbATP = null;
        else window.globalDbWTA = null;
        return null;
    }
}

// ===== GLOBAL VERFÜGBAR MACHEN =====
window.getDatabase = getDatabase;
window.loadDatabase = loadDatabase;
window.closeDatabase = closeDatabase;

// ===== NAVIGATION =====
function navigateTo(page, ranking) {
    console.log(`📌 Navigiere zu: ${page}${ranking ? ' (' + ranking + ')' : ''}`);

    if (ranking) {
        window.currentRankingType = ranking;
    }

    const titles = {
        'dashboard': '📊 <span class="highlight">Dashboard</span>',
        'ranking': `🎾 ${ranking === 'atp' ? 'ATP' : 'WTA'} <span class="highlight">Weltrangliste</span>`,
        'players': `👤 ${ranking === 'atp' ? 'ATP' : 'WTA'} <span class="highlight">Spieler</span>`,
        'analyse': '📊 <span class="highlight">Spieler/Match Analyse</span>',
        'h2h': '⚔️ <span class="highlight">Head to Head</span>',
        'matchPredictor': '🔮 <span class="highlight">Match Vorhersage</span>'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.innerHTML = titles[page] || '🏠 Tennis Analyzer';

    const content = document.getElementById('pageContent');
    if (content) content.innerHTML = '<div class="loading">⏳ Lade ...</div>';

    switch(page) {
        case 'dashboard':
            if (typeof window.loadDashboard === 'function') {
                window.loadDashboard();
            } else {
                if (content) content.innerHTML = '<div class="error">❌ Dashboard-Modul nicht geladen</div>';
            }
            break;
        case 'ranking':
            if (typeof window.loadRankingModule === 'function') {
                window.loadRankingModule(ranking);
            } else if (typeof window.loadRanking === 'function') {
                window.loadRanking(ranking);
            } else {
                if (content) content.innerHTML = '<div class="error">❌ Ranking-Modul nicht geladen</div>';
            }
            break;
        case 'players':
            if (typeof window.loadPlayersModule === 'function') {
                window.loadPlayersModule(ranking);
            } else if (typeof window.loadPlayers === 'function') {
                window.loadPlayers(ranking);
            } else {
                if (content) content.innerHTML = '<div class="error">❌ Players-Modul nicht geladen</div>';
            }
            break;
        case 'analyse':
            if (typeof window.loadAnalyseModule === 'function') {
                window.loadAnalyseModule();
            } else if (typeof window.loadAnalyse === 'function') {
                window.loadAnalyse();
            } else {
                if (content) content.innerHTML = '<div class="error">❌ Analyse-Modul nicht geladen</div>';
            }
            break;
        case 'h2h':
            if (typeof window.loadH2H === 'function') {
                window.loadH2H();
            } else {
                if (content) content.innerHTML = '<div class="error">❌ Head-to-Head Modul nicht geladen</div>';
            }
            break;
        case 'matchPredictor':
            if (typeof window.loadMatchPredictor === 'function') {
                window.loadMatchPredictor();
            } else {
                if (content) content.innerHTML = '<div class="error">❌ Match Vorhersage Modul nicht geladen</div>';
            }
            break;
        default:
            if (content) content.innerHTML = '<div class="error">❌ Seite nicht gefunden</div>';
    }
}

// ===== DATENBANKEN BEIM START LADEN =====
async function initGlobalDatabases() {
    console.log('🔥 Lade globale Datenbanken...');
    try {
        await loadDatabase('atp');
        await loadDatabase('wta');
        console.log('✅ Alle Datenbanken geladen!');
    } catch (error) {
        console.error('❌ Fehler beim Laden der Datenbanken:', error);
    }
}

// ==========================================
// SIDEBAR-BUTTONS & APP START
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 App initialisiert');

    // 🔥 Datenbanken laden (bevor Navigation startet)
    initGlobalDatabases().then(() => {
        // 🔥 Event-Listener für Sidebar-Buttons
        document.querySelectorAll('.sidebar-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                const page = this.dataset.page;
                const ranking = this.dataset.ranking || null;

                // Aktiven Button setzen
                document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');

                // Speichern
                localStorage.setItem('currentPage', page);
                if (ranking) localStorage.setItem('currentRanking', ranking);

                // Navigation
                navigateTo(page, ranking);
            });
        });

        // 🔥 Bewusst immer Dashboard beim Start
        const savedPage = 'dashboard';
        const savedRanking = localStorage.getItem('currentRanking') || 'atp';

        // Aktiven Button setzen
        document.querySelectorAll('.sidebar-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.page === savedPage) {
                const btnRanking = btn.dataset.ranking;
                if (!btnRanking || btnRanking === savedRanking) {
                    btn.classList.add('active');
                }
            }
        });

        navigateTo(savedPage, savedRanking);
    });
});

console.log('✅ app.js geladen');