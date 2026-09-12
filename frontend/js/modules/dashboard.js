// frontend/js/modules/dashboard.js

console.log('🔥 dashboard.js wird geladen...');

// Blink-Animation für LIVE-Badge
const styleBlink = document.createElement('style');
styleBlink.textContent = `
    @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
    }
`;
document.head.appendChild(styleBlink);

// ===== DASHBOARD HAUPTFUNKTION =====
window.loadDashboard = function() {
    console.log('📊 Dashboard wird geladen...');
    const container = document.getElementById('pageContent');
    if (!container) return;

    const tour = localStorage.getItem('currentRanking') === 'wta' ? 'WTA' : 'ATP';
    const isATP = tour === 'ATP';
    const title = isATP ? '🏆 ATP' : '👑 WTA';

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:24px;">
            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
                <div style="display:flex;align-items:center;gap:14px;">
                    <span style="font-size:24px;font-weight:700;color:#e0e6f0;">📊 Dashboard</span>
                    <span style="font-size:13px;color:#4a5a77;background:rgba(255,255,255,0.05);padding:4px 14px;border-radius:20px;">${title}</span>
                </div>
                <div style="font-size:11px;color:#2a3a4a;">🟢 Live · ${new Date().toLocaleDateString('de-DE')}</div>
            </div>

            <!-- Willkommen -->
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:24px 28px;">
                <div style="color:#ffffff;font-size:28px;font-weight:700;">Willkommen zurück 👋</div>
                <div style="color:#7a8aa3;font-size:16px;margin-top:4px;">${tour} Tennis Analytics Platform</div>
                <div style="display:flex;gap:20px;margin-top:12px;flex-wrap:wrap;">
                    <span style="color:#4a5a77;font-size:13px;">🎾 ${tour} Daten</span>
                    <span style="color:#4a5a77;font-size:13px;">📊 Live Statistiken</span>
                    <span style="color:#4a5a77;font-size:13px;">🏆 Top 10</span>
                </div>
            </div>

            <!-- Stats Kacheln -->
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;" id="dashboardStats">
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:18px 20px;text-align:center;transition:0.25s;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                    <div style="font-size:28px;margin-bottom:4px;">🎾</div>
                    <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${tour} Spieler</div>
                    <div style="color:#e0e6f0;font-size:28px;font-weight:700;margin-top:4px;" id="stat-players-value">-</div>
                </div>
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:18px 20px;text-align:center;transition:0.25s;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                    <div style="font-size:28px;margin-bottom:4px;">⚔️</div>
                    <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Matches</div>
                    <div style="color:#e0e6f0;font-size:28px;font-weight:700;margin-top:4px;" id="stat-matches-value">-</div>
                </div>
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:18px 20px;text-align:center;transition:0.25s;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                    <div style="font-size:28px;margin-bottom:4px;">🌍</div>
                    <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Länder</div>
                    <div style="color:#e0e6f0;font-size:28px;font-weight:700;margin-top:4px;" id="stat-countries-value">-</div>
                </div>
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:18px 20px;text-align:center;transition:0.25s;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                    <div style="font-size:28px;margin-bottom:4px;">🏆</div>
                    <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Top 10</div>
                    <div style="color:#e0e6f0;font-size:28px;font-weight:700;margin-top:4px;" id="stat-top10-value">10</div>
                </div>
            </div>

            <!-- Haupt-Grid -->
            <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px;">
                <!-- Linke Spalte -->
                <div style="display:flex;flex-direction:column;gap:20px;">
                    <!-- Top 10 Spieler -->
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:20px 24px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                            <span style="color:#e0e6f0;font-size:18px;font-weight:600;">🏆 Top 10 ${tour}</span>
                            <span style="color:#4a5a77;font-size:12px;cursor:pointer;" onclick="if(typeof navigateTo === 'function') navigateTo('players', '${tour.toLowerCase()}')">Alle anzeigen →</span>
                        </div>
                        <div id="topPlayers" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                            <div style="color:#7a8aa3;text-align:center;padding:20px 0;font-size:14px;grid-column:span 2;">⏳ Lade Top 10...</div>
                        </div>
                    </div>

                    <!-- Matches -->
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:20px 24px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                            <span style="color:#e0e6f0;font-size:18px;font-weight:600;">🎾 Aktuelle Matches</span>
                        </div>
                        <div id="latestMatches" style="display:flex;flex-direction:column;gap:8px;">
                            <div style="color:#7a8aa3;text-align:center;padding:20px 0;font-size:14px;">⏳ Lade Matches...</div>
                        </div>
                    </div>
                </div>

                <!-- Rechte Spalte -->
                <div style="display:flex;flex-direction:column;gap:20px;">
                    <!-- Live Turniere -->
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:20px 24px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                            <span style="color:#e0e6f0;font-size:18px;font-weight:600;">🏟️ Live Turniere</span>
                            <span style="color:#2ecc71;font-size:11px;background:rgba(46,204,113,0.12);padding:2px 10px;border-radius:12px;">● LIVE</span>
                        </div>
                        <div id="liveTournaments" style="display:flex;flex-direction:column;gap:10px;">
                            <div style="color:#7a8aa3;text-align:center;padding:20px 0;font-size:14px;">⏳ Lade Turniere...</div>
                        </div>
                    </div>

                    <!-- Schnellzugriffe -->
                    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:20px 24px;">
                        <span style="color:#e0e6f0;font-size:18px;font-weight:600;display:block;margin-bottom:16px;">⚡ Schnellzugriffe</span>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                            <button onclick="if(typeof navigateTo === 'function') navigateTo('ranking','atp')" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 14px;color:#c0d0e0;font-size:13px;cursor:pointer;transition:0.2s;text-align:left;font-family:'Inter',sans-serif;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">🎾 ATP Ranking</button>
                            <button onclick="if(typeof navigateTo === 'function') navigateTo('ranking','wta')" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 14px;color:#c0d0e0;font-size:13px;cursor:pointer;transition:0.2s;text-align:left;font-family:'Inter',sans-serif;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">🏆 WTA Ranking</button>
                            <button onclick="if(typeof navigateTo === 'function') navigateTo('players','atp')" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 14px;color:#c0d0e0;font-size:13px;cursor:pointer;transition:0.2s;text-align:left;font-family:'Inter',sans-serif;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">👤 ATP Spieler</button>
                            <button onclick="if(typeof navigateTo === 'function') navigateTo('players','wta')" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 14px;color:#c0d0e0;font-size:13px;cursor:pointer;transition:0.2s;text-align:left;font-family:'Inter',sans-serif;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">👤 WTA Spieler</button>
                            <button onclick="if(typeof navigateTo === 'function') navigateTo('h2h')" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 14px;color:#c0d0e0;font-size:13px;cursor:pointer;transition:0.2s;text-align:left;font-family:'Inter',sans-serif;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">⚔️ Head to Head</button>
                            <button onclick="if(typeof navigateTo === 'function') navigateTo('analyse')" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 14px;color:#c0d0e0;font-size:13px;cursor:pointer;transition:0.2s;text-align:left;font-family:'Inter',sans-serif;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">📊 Analyse</button>
                        </div>
                    </div>
                </div>
            </div>

            <div style="font-size:11px;color:#2a3a4a;text-align:right;padding-top:12px;border-top:1px solid rgba(255,255,255,0.04);">
                🎾 TennisAnalyzer · ${new Date().toLocaleDateString('de-DE')}
            </div>
        </div>
    `;

    loadDashboardData(tour);
};

// ===== DATEN LADEN =====
async function loadDashboardData(tour) {
    try {
        // 🔥 1. Zuerst Ranking-Daten laden (damit sie für Top 10 verfügbar sind)
        const rankingData = await loadRankingDataForDashboard(tour);

        // 🔥 2. Ranking-Daten global speichern (für andere Funktionen)
        if (tour === 'ATP') {
            window.rankingDataATP = rankingData;
        } else {
            window.rankingDataWTA = rankingData;
        }

        // 🔥 3. Jetzt die anderen Daten laden
        await loadStats(tour);
        await loadTopPlayers(tour);
        await loadLatestMatches();
        await loadTournaments();
    } catch (error) {
        console.error('❌ Fehler beim Laden:', error);
    }
}

// ===== SPIELER-DATENBANK (nutzt zentralen Cache aus players.js) =====
async function getPlayerDatabase(tour) {
    // 🔥 Nutzt initDatabase aus players.js (mit Cache!) statt eigene DB jedes Mal zu laden
    if (typeof window.initDatabase !== 'function') {
        console.error('❌ initDatabase nicht verfügbar (players.js nicht geladen?)');
        return null;
    }
    try {
        return await window.initDatabase(tour.toLowerCase());
    } catch (error) {
        console.error(`❌ Fehler beim Laden der Spieler-Datenbank:`, error);
        return null;
    }
}

// ===== STATS LADEN =====
async function loadStats(tour) {
    try {
        const db = await getPlayerDatabase(tour.toLowerCase());
        if (!db) {
            setStatsUnavailable();
            return;
        }

        const playersStmt = db.exec("SELECT COUNT(*) FROM players");
        const totalPlayers = playersStmt[0]?.values[0][0] || 0;

        const matchDb = window.getDatabase(tour.toLowerCase());
        let totalMatches = 0;
        if (matchDb) {
            try {
                const matchesStmt = matchDb.exec("SELECT COUNT(*) FROM matches");
                totalMatches = matchesStmt[0]?.values[0][0] || 0;
            } catch (e) {
                console.warn('⚠️ Konnte Matches nicht zählen:', e);
            }
        }

        const countriesStmt = db.exec("SELECT COUNT(DISTINCT ioc) FROM players");
        const totalCountries = countriesStmt[0]?.values[0][0] || 0;

        const setText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setText('stat-players-value', totalPlayers.toLocaleString());
        setText('stat-matches-value', totalMatches.toLocaleString());
        setText('stat-countries-value', totalCountries);
        setText('stat-top10-value', '10');

    } catch (error) {
        console.error('❌ Fehler beim Laden der Stats:', error);
        setStatsUnavailable();
    }
}

function setStatsUnavailable() {
    const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    setText('stat-players-value', '—');
    setText('stat-matches-value', '—');
    setText('stat-countries-value', '—');
    setText('stat-top10-value', '10');
}

// ===== RANKING-DATEN LADEN (nutzt globalen Cache) =====
async function loadRankingDataForDashboard(tour) {
    // 🔥 Erst prüfen ob schon im globalen Cache
    const cached = tour === 'ATP' ? window.rankingDataATP : window.rankingDataWTA;
    if (cached && cached.length > 0) {
        console.log(`✅ Ranking aus globalem Cache (${cached.length} Einträge)`);
        return cached;
    }

    const filename = tour === 'ATP' ? 'atp_ranking.json' : 'wta_ranking.json';
    const url = `../backend/ranglisten/${filename}`;

    console.log(`📥 Lade Ranking: ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`⚠️ ${filename} nicht gefunden (Status: ${response.status})`);
            return null;
        }
        const data = await response.json();
        console.log(`✅ ${data.length} Ranking-Einträge geladen`);
        return data;
    } catch (error) {
        console.error('❌ Fehler beim Laden der Ranking-Daten:', error);
        return null;
    }
}

// ===== TOP 10 SPIELER LADEN =====
async function loadTopPlayers(tour) {
    const container = document.getElementById('topPlayers');
    if (!container) return;

    try {
        let topIds;
        if (tour === 'ATP') {
            topIds = window.TOP_PLAYERS_ATP || null;
        } else {
            topIds = window.TOP_PLAYERS_WTA || null;
        }

        if (!topIds || topIds.length === 0) {
            // 🔥 Fallback nur wenn players.js nicht geladen wurde
            topIds = tour === 'ATP'
                ? [206173, 100644, 207989, 200000, 104925, 200282, 106421, 210097, 207925, 126203]
                : [214544, 214981, 202468, 221103, 216347, 259799, 214096, 222328, 202494, 216153];
        }

        console.log(`📋 Top IDs für ${tour}:`, topIds);

        const db = await getPlayerDatabase(tour.toLowerCase());

        if (!db) {
            container.innerHTML = getTopPlayersUnavailable();
            return;
        }

        const placeholders = topIds.map(() => '?').join(',');
        const stmt = db.prepare(`
            SELECT player_id, name_first, name_last, ioc
            FROM players
            WHERE player_id IN (${placeholders})
        `);
        stmt.bind(topIds);

        const players = [];
        while (stmt.step()) {
            players.push(stmt.getAsObject());
        }
        stmt.free();

        if (players.length === 0) {
            container.innerHTML = getTopPlayersUnavailable();
            return;
        }

        console.log(`✅ ${players.length} Spieler aus DB geladen`);

        // 🔥 Nutzt jetzt die global geladenen Ranking-Daten (kein 2. Fetch)
        const rankingData = tour === 'ATP' ? window.rankingDataATP : window.rankingDataWTA;

        const playersWithRank = [];

        for (const p of players) {
            const fullName = p.name_first && p.name_last
                ? `${p.name_first} ${p.name_last}`.trim()
                : p.name_first || p.name_last || 'Unbekannt';

            let rank = 9999;
            let points = 0;

            if (rankingData && rankingData.length > 0) {
                // 🔥 Nutzt die robuste findPlayerInRanking aus players.js (falls verfügbar)
                const match = (typeof window.findPlayerInRanking === 'function')
                    ? window.findPlayerInRanking(fullName, rankingData)
                    : findPlayerInRankingLocal(fullName, rankingData);
                if (match) {
                    rank = match.rank || 9999;
                    points = match.points || 0;
                    console.log(`✅ ${fullName} -> Rang #${rank}, ${points} Punkte`);
                }
            }

            playersWithRank.push({
                player_id: p.player_id,
                name: fullName,
                country: p.ioc || '🌍',
                ranking: rank,
                points: points
            });
        }

        playersWithRank.sort((a, b) => a.ranking - b.ranking);

        const rankColors = ['#d4af37', '#c0c0c0', '#cd7f32'];

        container.innerHTML = playersWithRank.map((p, i) => {
            const color = rankColors[i] || '#4a5a77';
            const bg = i < 3 ? `rgba(${i === 0 ? '212,175,55' : i === 1 ? '192,192,192' : '205,127,50'},0.12)` : 'rgba(255,255,255,0.03)';
            const border = i < 3 ? `rgba(${i === 0 ? '212,175,55' : i === 1 ? '192,192,192' : '205,127,50'},0.2)` : 'rgba(255,255,255,0.06)';

            return `
                <div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;transition:0.2s;cursor:pointer;"
                     onmouseover="this.style.background='${bg.replace('0.12', '0.2').replace('0.03', '0.06')}'"
                     onmouseout="this.style.background='${bg}'"
                     onclick="if (typeof showPlayerDetailById === 'function') { showPlayerDetailById(${p.player_id}, '${tour.toLowerCase()}'); }" else { console.error('showPlayerDetailById nicht gefunden'); }">
                    <span style="color:${color};font-weight:700;font-size:14px;min-width:28px;">#${p.ranking}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="color:#e0e6f0;font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}</div>
                        <div style="color:#7a8aa3;font-size:11px;">${p.country}</div>
                    </div>
                    <div style="color:#f1c40f;font-weight:600;font-size:13px;text-align:right;">${p.points.toLocaleString()}</div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('❌ Fehler beim Laden der Top 10:', error);
        container.innerHTML = getTopPlayersUnavailable();
    }
}

// 🔥 Lokale Fallback-Version (nur genutzt wenn players.js nicht geladen)
function findPlayerInRankingLocal(playerName, rankingData) {
    if (!playerName || !rankingData || rankingData.length === 0) return null;

    const nameParts = playerName.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    for (const r of rankingData) {
        const rName = r.name.trim().toLowerCase();
        const rParts = rName.split(' ');
        const rFirst = rParts.length > 1 ? rParts.slice(1).join(' ') : '';
        const rLast = rParts[0] || '';

        if (rLast === lastName && rFirst === firstName) return r;
        if (rLast === lastName && firstName && rFirst.startsWith(firstName)) return r;
        if (rName === `${firstName} ${lastName}`.toLowerCase()) return r;
        if (rName === `${lastName} ${firstName}`.toLowerCase()) return r;
    }

    return null;
}

function getTopPlayersUnavailable() {
    return '<div style="color:#7a8aa3;text-align:center;padding:20px 0;font-size:14px;grid-column:span 2;">📭 Top 10 aktuell nicht verfügbar</div>';
}

// ============================================================
// ===== MATCHES VON SPORTSCORE API (ÜBER BACKEND-PROXY) =====
// ============================================================

async function loadLatestMatches() {
    const container = document.getElementById('latestMatches');
    if (!container) return;

    container.innerHTML = `
        <div style="color:#4a5a77;text-align:center;padding:15px 0;font-size:13px;">
            ⏳ Lade Matches...
        </div>
    `;

    try {
        const response = await fetch('/api/live-matches');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const matches = await response.json();

        if (matches && matches.length > 0) {
            container.innerHTML = renderMatches(matches);
            console.log(`✅ ${matches.length} Matches geladen`);
        } else {
            container.innerHTML = getNoMatchesMessage();
        }
    } catch (error) {
        console.error('❌ Fehler beim Laden der Matches:', error);
        container.innerHTML = getNoMatchesMessage();
    }
}

function renderMatches(matches) {
    if (!matches || matches.length === 0) {
        return getNoMatchesMessage();
    }

    const attribution = `<span style="font-size:9px;color:#2a3a4a;">Daten: <a href="https://sportscore.com" target="_blank" style="color:#2a3a4a;text-decoration:none;">SportScore</a></span>`;

    const matchItems = matches.map(m => {
        const isFinished = m.raw_status === 'finished';

        // Zeit + Datum formatieren
        let timeDisplay = '';
        if (m.time) {
            const date = new Date(m.time);
            const dateStr = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
            const timeStr = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            timeDisplay = `<span style="color:#4a5a77;font-size:10px;flex-shrink:0;">${dateStr} ${timeStr} Uhr</span>`;
        }

        let statusBadge = '';
        if (isFinished) {
            statusBadge = `<span style="color:#4a5a77;font-size:10px;">✅ Beendet</span>`;
        } else {
            statusBadge = `<span style="color:#7a8aa3;font-size:10px;">Aktiv</span>`;
        }

        const playerColor1 = '#e0e6f0';
        const playerColor2 = '#7a8aa3';
        const scoreColor = '#4a5a77';

        return `
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;transition:0.2s;"
                 onmouseover="this.style.background='rgba(255,255,255,0.06)'"
                 onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1;min-width:0;">
                    <span style="color:${playerColor1};font-weight:400;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;">${m.player1 || '—'}</span>
                    <span style="color:#4a5a77;font-size:11px;flex-shrink:0;">vs</span>
                    <span style="color:${playerColor2};font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;">${m.player2 || '—'}</span>
                    ${statusBadge}
                    ${timeDisplay}
                </div>
                <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
                    <span style="color:${scoreColor};font-weight:400;font-size:13px;">${m.score || '—'}</span>
                </div>
            </div>
        `;
    }).join('');

    return matchItems + attribution;
}

function getNoMatchesMessage() {
    return `
        <div style="color:#7a8aa3;text-align:center;padding:20px 0;font-size:13px;">
            🎾 Aktuell keine Matches<br>
            <span style="font-size:11px;color:#4a5a77;">Die nächsten Matches starten bald</span>
        </div>
    `;
}

// ============================================================
// ===== TURNIERE VON TENNISEXPLORER (ÜBER BACKEND) =====
// ============================================================

async function loadTournaments() {
    const container = document.getElementById('liveTournaments');
    if (!container) return;

    try {
        console.log('📥 Lade Turniere über Backend-Proxy...');
        const response = await fetch('/api/tournaments');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const tournaments = await response.json();

        if (tournaments && tournaments.length > 0) {
            container.innerHTML = renderTournaments(tournaments);
            console.log(`✅ ${tournaments.length} Turniere geladen (live von TennisExplorer)`);
        } else {
            console.warn('⚠️ Keine Turniere gefunden, verwende Fallback');
            container.innerHTML = renderTournaments(getFallbackTournaments());
        }
    } catch (error) {
        console.error('❌ Fehler beim Laden der Turniere:', error);
        container.innerHTML = renderTournaments(getFallbackTournaments());
    }
}

function renderTournaments(tournaments) {
    if (!tournaments || tournaments.length === 0) {
        tournaments = getFallbackTournaments();
    }

    const flags = {
        'US': '🇺🇸', 'GB': '🇬🇧', 'FR': '🇫🇷', 'DE': '🇩🇪',
        'IT': '🇮🇹', 'ES': '🇪🇸', 'AU': '🇦🇺', 'CA': '🇨🇦',
        'AT': '🇦🇹', 'CH': '🇨🇭', 'NL': '🇳🇱', 'BE': '🇧🇪',
        'TR': '🇹🇷', 'CN': '🇨🇳', 'VN': '🇻🇳', 'RU': '🇷🇺',
        'BR': '🇧🇷', 'AR': '🇦🇷', 'MX': '🇲🇽', 'JP': '🇯🇵',
        'KR': '🇰🇷', 'IN': '🇮🇳', 'ZA': '🇿🇦', 'EG': '🇪🇬',
        'HR': '🇭🇷', 'RS': '🇷🇸', 'CZ': '🇨🇿', 'SK': '🇸🇰',
        'PL': '🇵🇱', 'HU': '🇭🇺', 'RO': '🇷🇴', 'BG': '🇧🇬',
        'GR': '🇬🇷', 'PT': '🇵🇹', 'SE': '🇸🇪', 'NO': '🇳🇴',
        'DK': '🇩🇰', 'FI': '🇫🇮', 'IE': '🇮🇪', 'NZ': '🇳🇿',
        'MC': '🇲🇨', 'unknown': '🌍'
    };

    return tournaments.map(t => {
        const isLive = t.status === 'Live' || (t.matches && t.matches > 0);
        const flag = flags[t.country] || '🌍';

        return `
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px 16px;transition:0.2s;"
                 onmouseover="this.style.background='rgba(255,255,255,0.06)'"
                 onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:8px;">
                    <span style="color:#e0e6f0;font-weight:600;font-size:14px;white-space:normal;word-break:break-word;flex:1;min-width:0;">
                        ${flag} ${t.name}
                        ${t.tour ? `<span style="font-size:10px;color:#4a5a77;font-weight:400;margin-left:6px;white-space:nowrap;">${t.tour}</span>` : ''}
                    </span>
                    <span style="color:${isLive ? '#2ecc71' : '#f1c40f'};font-size:11px;background:${isLive ? 'rgba(46,204,113,0.12)' : 'rgba(241,196,15,0.12)'};padding:2px 10px;border-radius:12px;white-space:nowrap;flex-shrink:0;">
                        ${isLive ? `● LIVE` : t.status || 'Aktiv'}
                        ${t.matches ? ` (${t.matches})` : ''}
                    </span>
                </div>
                <div style="display:flex;gap:14px;font-size:12px;color:#7a8aa3;flex-wrap:wrap;">
                    ${t.surface && t.surface !== '—' ? `<span>🎾 ${t.surface}</span>` : ''}
                    ${t.prize && t.prize !== '—' ? `<span>💰 ${t.prize}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function getFallbackTournaments() {
    return [
        { name: 'US Open', country: 'US', surface: 'Hartplatz', prize: '$37.8M', status: 'Live', matches: 12, tour: 'ATP' },
        { name: 'US Open', country: 'US', surface: 'Hartplatz', prize: '$37.8M', status: 'Live', matches: 8, tour: 'WTA' },
        { name: 'Genoa Challenger', country: 'IT', surface: 'Sand', prize: '$203K', status: 'Aktiv', matches: 14, tour: 'ATP' },
        { name: 'Sevilla Challenger', country: 'ES', surface: 'Sand', prize: '$203K', status: 'Aktiv', matches: 17, tour: 'ATP' },
        { name: 'Shanghai Challenger', country: 'CN', surface: 'Hartplatz', prize: '$177K', status: 'Aktiv', matches: 14, tour: 'ATP' },
        { name: 'Tulln Challenger', country: 'AT', surface: 'Sand', prize: '$160K', status: 'Aktiv', matches: 12, tour: 'ATP' }
    ];
}

console.log('✅ dashboard.js geladen');