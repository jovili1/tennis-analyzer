// ==========================================
// ANALYSE MODUL – ATP / WTA (optimiert)
// ==========================================

console.log('🔥 analyse.js wird geladen...');

// ===== API-URL (lokal vs. online) =====
var API_URL = window.API_URL || ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? ''
    : 'https://tennis-analyzer-api.onrender.com');
window.API_URL = API_URL;

var BACKEND_URL = window.BACKEND_URL || ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? '..'
    : 'https://jovili1.github.io/tennis-analyzer');
window.BACKEND_URL = BACKEND_URL;

let state = {
    type: 'atp', players: [], cacheLoaded: false,
    selected: null, imageCache: {}, imageCacheKeys: [],
    matchDb: null,
    selectedElo: null,
    filter: 'wins',
    tournamentWins: 'all',
    tournamentSurface: 'all',
    tournamentSemifinal: 'all',
    tournamentFinal: 'all',
    tournamentTitles: 'all',
    tournamentComeback: 'all',
    tournamentForm: 'all',
    tournamentOpponent: 'all',
    opponentFilter: 'hardest',
    dropdownOpen: false,
    tbFilter: 'all',
    tbTournament: 'all'
};

// ===== GLOBALE KONSTANTEN =====
const SURF_MAP = { 'Hard':'🏟️','Clay':'🧱','Grass':'🌿','Carpet':'🟫' };
const SURFACE_MAP_FULL = { 'Hard': '🏟️ Hartplatz', 'Clay': '🧱 Sand', 'Grass': '🌿 Rasen', 'Carpet': '🟫 Teppich' };

// ===== HELPER =====
function cacheImage(key, url) {
    state.imageCache[key] = url;
    state.imageCacheKeys.push(key);
    while (state.imageCacheKeys.length > 30) {
        const old = state.imageCacheKeys.shift();
        delete state.imageCache[old];
    }
}

async function loadImage(id) {
    if (!id) return null;
    const key = 'wikidata_img_' + id;
    if (state.imageCache[key]) return state.imageCache[key];
    try {
        const cached = localStorage.getItem(key);
        if (cached && cached !== 'null') { cacheImage(key, cached); return cached; }
    } catch (e) {}
    try {
        const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`);
        if (!res.ok) return null;
        const data = await res.json();
        const entity = data.entities[id];
        if (!entity) return null;
        const claim = entity.claims?.P18;
        if (!claim || !claim.length) return null;
        const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${claim[0].mainsnak.datavalue.value.replace(/ /g, '_')}`;
        localStorage.setItem(key, url);
        cacheImage(key, url);
        return url;
    } catch (e) { return null; }
}

// ===== ELO LADEN (EINZELNER SPIELER) =====
async function loadPlayerElo(playerName, surface = 'Rolling_Gesamt') {
    try {
        const response = await fetch(`${API_URL}/api/elo?name=${encodeURIComponent(playerName)}&surface=${surface}`);
        if (!response.ok) return null;
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Fehler beim Laden der ELO:', error);
        return null;
    }
}

async function loadEloForSelected(playerName) {
    try {
        const [gesamt, hard, clay, grass] = await Promise.all([
            loadPlayerElo(playerName, 'Rolling_Gesamt'),
            loadPlayerElo(playerName, 'Rolling_Hard'),
            loadPlayerElo(playerName, 'Rolling_Clay'),
            loadPlayerElo(playerName, 'Rolling_Grass')
        ]);

        const result = {
            gesamt: gesamt?.elo || null,
            hard: hard?.elo || null,
            clay: clay?.elo || null,
            grass: grass?.elo || null
        };

        console.log(`🎯 ELO geladen für ${playerName}:`, result);
        return result;
    } catch (e) {
        console.error('❌ Fehler beim Laden der ELOs:', e);
        return { gesamt: null, hard: null, clay: null, grass: null };
    }
}

// ===== LOAD MATCH DB (VERWENDET GLOBALE DB) =====
async function loadMatchDb(type) {
    if (window.getDatabase) {
        const db = window.getDatabase(type);
        if (db) {
            console.log(`✅ Match-DB aus globalem Cache (wiederverwendet)`);
            state.matchDb = db;
            return db;
        }
    }

    console.warn(`⚠️ Keine globale DB, lade direkt...`);
    try {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        let dbBytes;

        if (isLocal) {
            const filename = type === 'atp' ? 'atp_matches.db' : 'wta_matches.db';
            const res = await fetch(`${BACKEND_URL}/backend/spieler/${filename}`);
            if (!res.ok) throw new Error(`${filename} nicht gefunden`);
            dbBytes = new Uint8Array(await res.arrayBuffer());
        } else {
            const zipName = type === 'atp' ? 'atp_matches.zip' : 'wta_matches.zip';
            const zipUrl = `${BACKEND_URL}/dbs/${zipName}`;
            console.log(`📦 Lade ZIP: ${zipUrl}`);
            const res = await fetch(zipUrl);
            if (!res.ok) throw new Error(`${zipName} nicht gefunden`);
            const zipBuf = await res.arrayBuffer();
            const unzipped = fflate.unzipSync(new Uint8Array(zipBuf));
            const filename = Object.keys(unzipped)[0];
            dbBytes = unzipped[filename];
        }

        const SQL = await initSqlJs({ locateFile: f => `https://sql.js.org/dist/${f}` });

        const db = new SQL.Database(dbBytes);
        db._type = type;
        db._rankingType = type;

        state.matchDb = db;
        window.dbMatches = db;

        if (type === 'atp') {
            window.globalDbATP = db;
        } else {
            window.globalDbWTA = db;
        }

        console.log(`✅ Match-DB geladen und global gespeichert (${type.toUpperCase()})`);
        return db;
    } catch (e) {
        console.error(e);
        return null;
    }
}

async function loadPlayers(type) {
    if (state.cacheLoaded && state.type === type) return state.players;
    try {
        const db = await initDatabase(type);
        if (!db) return [];
        const stmt = db.prepare(`SELECT player_id, name_first, name_last, wikidata_id FROM players`);
        const players = [];
        while (stmt.step()) {
            const p = stmt.getAsObject();
            const first = p.name_first || '', last = p.name_last || '';
            const full = `${first} ${last}`.trim();
            const rev = `${last} ${first}`.trim();
            players.push({
                player_id: p.player_id,
                name: full,
                wikidata_id: p.wikidata_id || '',
                search: `${full} ${rev} ${first} ${last}`.toLowerCase()
            });
        }
        stmt.free();
        state.players = players;
        state.cacheLoaded = true;
        state.type = type;
        console.log(`✅ ${players.length} Spieler (${type.toUpperCase()})`);
        return players;
    } catch (e) { console.error(e); return []; }
}

// ===== RENDER FUNKTIONEN =====

// ===== 1. RENDER SURFACE STATS =====
function renderSurfaceStats(matches, playerName, allMatches) {
    const container = document.getElementById('matchesContainer');
    if (!container) return;

    let filteredMatches = allMatches || matches;
    if (state.tournamentSurface !== 'all') {
        filteredMatches = filteredMatches.filter(m => m.tourney_name === state.tournamentSurface);
    }

    if (!filteredMatches || !filteredMatches.length) {
        container.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:20px 0;">📭 Keine Matches für dieses Turnier gefunden.</div>`;
        return;
    }

    const surfaceStats = {};
    for (const m of filteredMatches) {
        const surface = m.surface || 'Unknown';
        if (!surfaceStats[surface]) {
            surfaceStats[surface] = { total: 0, wins: 0, losses: 0 };
        }
        surfaceStats[surface].total++;
        if (m.winner_name === playerName) surfaceStats[surface].wins++;
        else surfaceStats[surface].losses++;
    }

    const allTourneys = {};
    const allMatchesForDropdown = allMatches || matches;
    for (const m of allMatchesForDropdown) {
        const t = m.tourney_name || 'Unbekannt';
        allTourneys[t] = (allTourneys[t]||0) + 1;
    }
    const sortedTourneys = Object.entries(allTourneys).sort((a,b) => b[1]-a[1]);

    let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
            <div><span style="color:#7a8aa3;font-size:11px;text-transform:uppercase;">🏟️ Belag Statistik</span></div>
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="color:#7a8aa3;font-size:11px;">Turnier:</span>
                <select id="surfaceTournamentFilter" style="padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:#141b2b;color:#e0e6f0;font-size:12px;outline:none;cursor:pointer;">
                    <option value="all">🏟️ Alle</option>
                    ${sortedTourneys.map(([name,count]) => `<option value="${name}" ${state.tournamentSurface===name?'selected':''}>${name} (${count})</option>`).join('')}
                </select>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:12px;">`;
    const sorted = Object.keys(surfaceStats).sort((a,b) => surfaceStats[b].total - surfaceStats[a].total);
    for (const surface of sorted) {
        const s = surfaceStats[surface];
        const rate = s.total > 0 ? Math.round((s.wins/s.total)*100) : 0;
        const color = rate >= 70 ? '#2ecc71' : rate >= 50 ? '#f1c40f' : '#e74c3c';
        html += `<div style="background:rgba(255,255,255,0.03);border-radius:12px;padding:14px;">
            <div style="display:flex;justify-content:space-between;font-size:18px;"><span>${SURF_MAP[surface]||'🎾'}</span><span style="color:#e0e6f0;font-weight:600;">${SURFACE_MAP_FULL[surface]||surface}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;margin:4px 0;"><span style="color:#7a8aa3;">Matches</span><span>${s.total}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;"><span style="color:#2ecc71;">✅</span><span>${s.wins}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;"><span style="color:#e74c3c;">❌</span><span>${s.losses}</span></div>
            <div style="display:flex;justify-content:space-between;"><span style="color:#7a8aa3;font-size:12px;">Quote</span><span style="color:${color};font-weight:700;">${rate}%</span></div>
            <div style="width:100%;height:4px;background:rgba(255,255,255,0.05);border-radius:4px;margin-top:4px;"><div style="width:${rate}%;height:100%;background:${color};border-radius:4px;"></div></div>
        </div>`;
    }
    html += `</div>`;
    html += `<div style="overflow-x:auto;max-height:400px;overflow-y:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:rgba(255,255,255,0.05);position:sticky;top:0;z-index:1;"><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Datum</th><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Turnier</th><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Belag</th><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Gegner</th><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Ergebnis</th><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Asse</th></tr></thead><tbody>`;
    for (const m of filteredMatches) {
        const win = m.winner_name === playerName;
        const opp = win ? m.loser_name : m.winner_name;
        const bg = win ? 'rgba(46,204,113,0.08)' : 'rgba(231,76,60,0.08)';
        const col = win ? '#2ecc71' : '#e74c3c';
        const txt = win ? '✅' : '❌';
        const d = m.tourney_date ? String(m.tourney_date) : '';
        const ds = d.length === 8 ? `${d.substring(6,8)}.${d.substring(4,6)}.${d.substring(0,4)}` : d;
        const ace = win ? (m.w_ace||0) : (m.l_ace||0);
        const surf = m.surface || '—';
        html += `<tr style="background:${bg};border-bottom:1px solid rgba(255,255,255,0.03);">
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${ds}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${m.tourney_name||'-'}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${SURF_MAP[surf]||''} ${surf}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${opp||'-'}</td>
            <td style="padding:4px 10px;color:${col};font-weight:600;font-size:11px;">${txt} ${m.score||'-'}</td>
            <td style="padding:4px 10px;color:#f1c40f;font-size:11px;text-align:center;">${ace}</td>
        </tr>`;
    }
    html += `</tbody></table></div><div style="margin-top:8px;color:#4a5a77;font-size:11px;text-align:right;">${filteredMatches.length} Matches</div>`;
    container.innerHTML = html;

    document.getElementById('surfaceTournamentFilter').onchange = function() {
        state.tournamentSurface = this.value;
        if (state.selected) loadMatches(state.selected);
    };
}

// ===== 2. RENDER SEMIFINAL STATS =====
function renderSemifinalStats(matches, playerName) {
    const container = document.getElementById('matchesContainer');
    if (!container) return;
    const sf = matches.filter(m => m.round === 'SF');
    if (!sf || !sf.length) { container.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:20px 0;">📭 Keine Halbfinale.</div>`; return; }
    const total = sf.length, wins = sf.filter(m => m.winner_name === playerName).length, losses = total - wins;
    const rate = total > 0 ? Math.round((wins/total)*100) : 0;
    const tourneyStats = {};
    for (const m of sf) { const t = m.tourney_name || 'Unbekannt'; tourneyStats[t] = (tourneyStats[t]||0)+1; }
    const sorted = Object.entries(tourneyStats).sort((a,b) => b[1]-a[1]);
    let html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
        <div><div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;">🏆 Halbfinale</div><div style="color:#4a5a77;font-size:12px;">${total} Halbfinale</div></div>
        <div style="display:flex;align-items:center;gap:8px;"><span style="color:#7a8aa3;font-size:11px;">🏟️ Turnier:</span>
        <select id="semifinalTournamentFilter" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:#141b2b;color:#e0e6f0;font-size:12px;outline:none;cursor:pointer;">
            <option value="all">🏟️ Alle</option>${sorted.map(([name,count]) => `<option value="${name}" ${state.tournamentSemifinal===name?'selected':''}>${name} (${count})</option>`).join('')}
        </select></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
        <div style="text-align:center;"><div style="color:#a0b3cc;font-size:16px;font-weight:700;">${total}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Halbfinale</div></div>
        <div style="text-align:center;"><div style="color:#2ecc71;font-size:16px;font-weight:700;">${wins}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Gewonnen</div></div>
        <div style="text-align:center;"><div style="color:#e74c3c;font-size:16px;font-weight:700;">${losses}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Verloren</div></div>
        <div style="text-align:center;"><div style="color:#f1c40f;font-size:16px;font-weight:700;">${rate}%</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Quote</div></div>
    </div>
    <div style="overflow-x:auto;max-height:400px;overflow-y:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:rgba(255,255,255,0.05);position:sticky;top:0;z-index:1;"><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Datum</th><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Turnier</th><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Belag</th><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Gegner</th><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Ergebnis</th><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Asse</th></tr></thead><tbody>`;
    for (const m of sf) {
        const win = m.winner_name === playerName;
        const opp = win ? m.loser_name : m.winner_name;
        const bg = win ? 'rgba(46,204,113,0.08)' : 'rgba(231,76,60,0.08)';
        const col = win ? '#2ecc71' : '#e74c3c';
        const txt = win ? '✅' : '❌';
        const d = m.tourney_date ? String(m.tourney_date) : '';
        const ds = d.length === 8 ? `${d.substring(6,8)}.${d.substring(4,6)}.${d.substring(0,4)}` : d;
        const ace = win ? (m.w_ace||0) : (m.l_ace||0);
        const surf = m.surface || '—';
        html += `<tr style="background:${bg};border-bottom:1px solid rgba(255,255,255,0.03);">
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${ds}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${m.tourney_name||'-'}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${SURF_MAP[surf]||''} ${surf}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${opp||'-'}</td>
            <td style="padding:4px 10px;color:${col};font-weight:600;font-size:11px;">${txt} ${m.score||'-'}</td>
            <td style="padding:4px 10px;color:#f1c40f;font-size:11px;text-align:center;">${ace}</td>
        </tr>`;
    }
    html += `</tbody></table></div><div style="margin-top:8px;color:#4a5a77;font-size:11px;text-align:right;">${total} Halbfinale</div>`;
    container.innerHTML = html;
    document.getElementById('semifinalTournamentFilter').onchange = function() {
        state.tournamentSemifinal = this.value;
        if (state.selected) loadMatches(state.selected);
    };
}

// ===== 3. RENDER FINAL STATS =====
function renderFinalStats(matches, playerName) {
    const container = document.getElementById('matchesContainer');
    if (!container) return;
    const f = matches.filter(m => m.round === 'F');
    if (!f || !f.length) { container.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:20px 0;">📭 Keine Finals.</div>`; return; }
    const total = f.length, wins = f.filter(m => m.winner_name === playerName).length, losses = total - wins;
    const rate = total > 0 ? Math.round((wins/total)*100) : 0;
    const tourneyStats = {};
    for (const m of f) { const t = m.tourney_name || 'Unbekannt'; tourneyStats[t] = (tourneyStats[t]||0)+1; }
    const sorted = Object.entries(tourneyStats).sort((a,b) => b[1]-a[1]);
    let html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
        <div><div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;">🏆 Finals</div><div style="color:#4a5a77;font-size:12px;">${total} Finals</div></div>
        <div style="display:flex;align-items:center;gap:8px;"><span style="color:#7a8aa3;font-size:11px;">🏟️ Turnier:</span>
        <select id="finalTournamentFilter" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:#141b2b;color:#e0e6f0;font-size:12px;outline:none;cursor:pointer;">
            <option value="all">🏟️ Alle</option>${sorted.map(([name,count]) => `<option value="${name}" ${state.tournamentFinal===name?'selected':''}>${name} (${count})</option>`).join('')}
        </select></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
        <div style="text-align:center;"><div style="color:#a0b3cc;font-size:16px;font-weight:700;">${total}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Finals</div></div>
        <div style="text-align:center;"><div style="color:#2ecc71;font-size:16px;font-weight:700;">${wins}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Gewonnen</div></div>
        <div style="text-align:center;"><div style="color:#e74c3c;font-size:16px;font-weight:700;">${losses}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Verloren</div></div>
        <div style="text-align:center;"><div style="color:#f1c40f;font-size:16px;font-weight:700;">${rate}%</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Quote</div></div>
    </div>
    <div style="overflow-x:auto;max-height:400px;overflow-y:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:rgba(255,255,255,0.05);position:sticky;top:0;z-index:1;"><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Datum</th><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Turnier</th><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Belag</th><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Gegner</th><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Ergebnis</th><th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Asse</th></tr></thead><tbody>`;
    for (const m of f) {
        const win = m.winner_name === playerName;
        const opp = win ? m.loser_name : m.winner_name;
        const bg = win ? 'rgba(46,204,113,0.08)' : 'rgba(231,76,60,0.08)';
        const col = win ? '#2ecc71' : '#e74c3c';
        const txt = win ? '✅' : '❌';
        const d = m.tourney_date ? String(m.tourney_date) : '';
        const ds = d.length === 8 ? `${d.substring(6,8)}.${d.substring(4,6)}.${d.substring(0,4)}` : d;
        const ace = win ? (m.w_ace||0) : (m.l_ace||0);
        const surf = m.surface || '—';
        html += `<tr style="background:${bg};border-bottom:1px solid rgba(255,255,255,0.03);">
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${ds}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${m.tourney_name||'-'}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${SURF_MAP[surf]||''} ${surf}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${opp||'-'}</td>
            <td style="padding:4px 10px;color:${col};font-weight:600;font-size:11px;">${txt} ${m.score||'-'}</td>
            <td style="padding:4px 10px;color:#f1c40f;font-size:11px;text-align:center;">${ace}</td>
        </tr>`;
    }
    html += `</tbody></table></div><div style="margin-top:8px;color:#4a5a77;font-size:11px;text-align:right;">${total} Finals</div>`;
    container.innerHTML = html;
    document.getElementById('finalTournamentFilter').onchange = function() {
        state.tournamentFinal = this.value;
        if (state.selected) loadMatches(state.selected);
    };
}

// ===== 4. RENDER TOURNAMENT WINS =====
function renderTournamentWins(matches, playerName) {
    const container = document.getElementById('matchesContainer');
    if (!container) return;
    const wins = matches.filter(m => m.round === 'F' && m.winner_name === playerName);
    if (!wins || !wins.length) { container.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:20px 0;">🏆 Keine Turniersiege.</div>`; return; }
    const total = wins.length;

    const allTourneys = {};
    for (const m of wins) {
        const t = m.tourney_name || 'Unbekannt';
        allTourneys[t] = (allTourneys[t]||0) + 1;
    }
    const sortedTourneys = Object.entries(allTourneys).sort((a,b) => b[1]-a[1]);

    let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:10px;">
            <span style="color:#f1c40f;font-size:18px;font-weight:700;">🏆 ${total} Titel</span>
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="color:#7a8aa3;font-size:11px;">Turnier:</span>
                <select id="titlesTournamentFilter" style="padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:#141b2b;color:#e0e6f0;font-size:12px;outline:none;cursor:pointer;">
                    <option value="all">🏟️ Alle</option>
                    ${sortedTourneys.map(([name,count]) => `<option value="${name}" ${state.tournamentTitles===name?'selected':''}>${name} (${count})</option>`).join('')}
                </select>
            </div>
        </div>`;
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">`;
    for (const m of wins) {
        const opp = m.loser_name || '—';
        const d = m.tourney_date ? String(m.tourney_date) : '';
        const year = d.length >= 4 ? d.substring(0,4) : '—';
        const surf = m.surface || '—';
        const score = m.score || '—';
        const ace = m.w_ace || 0;
        html += `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
            <div style="display:flex;justify-content:space-between;"><div style="color:#f1c40f;font-weight:700;font-size:15px;">${m.tourney_name||'Unbekannt'}</div><div style="background:rgba(46,204,113,0.15);border:1px solid rgba(46,204,113,0.3);border-radius:20px;padding:2px 12px;font-size:11px;color:#2ecc71;">🏆</div></div>
            <div style="color:#7a8aa3;font-size:12px;">${year} · ${SURF_MAP[surf]||''} ${SURFACE_MAP_FULL[surf]||surf}</div>
            <div style="display:flex;justify-content:space-between;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05);">
                <div><span style="color:#7a8aa3;font-size:10px;">Gegner</span><div style="color:#e0e6f0;font-size:13px;font-weight:600;">${opp}</div></div>
                <div style="text-align:right;"><span style="color:#7a8aa3;font-size:10px;">Ergebnis</span><div style="color:#2ecc71;font-size:13px;font-weight:700;">${score}</div></div>
            </div>
            <div style="color:#4a5a77;font-size:10px;text-align:right;margin-top:4px;">💪 ${ace} Asse</div>
        </div>`;
    }
    html += `</div><div style="margin-top:8px;color:#4a5a77;font-size:11px;text-align:right;">${total} Turniersiege</div>`;
    container.innerHTML = html;
    document.getElementById('titlesTournamentFilter').onchange = function() {
        state.tournamentTitles = this.value;
        if (state.selected) loadMatches(state.selected);
    };
}

// ===== 5. RENDER TIE BREAK STATS =====
function renderTieBreakStats(matches, playerName) {
    const container = document.getElementById('matchesContainer');
    if (!container) return;

    let allTieBreaks = [];
    for (const m of matches) {
        const score = m.score || '';
        const parts = score.split(' ');
        let setIndex = 0;
        for (const part of parts) {
            if (part.includes('7-6') || part.includes('6-7')) {
                setIndex++;
                const isWon = part.includes('7-6');
                allTieBreaks.push({
                    ...m,
                    setNumber: setIndex,
                    setScore: part,
                    isWon: isWon,
                    opponent: m.winner_name === playerName ? m.loser_name : m.winner_name,
                    matchWin: m.winner_name === playerName,
                    tourney_name: m.tourney_name || 'Unbekannt'
                });
            }
        }
    }

    if (!allTieBreaks || !allTieBreaks.length) {
        container.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:20px 0;">🎾 Keine Tie-Breaks gefunden.</div>`;
        return;
    }

    let filteredByTournament = allTieBreaks;
    if (state.tbTournament !== 'all') {
        filteredByTournament = allTieBreaks.filter(tb => tb.tourney_name === state.tbTournament);
    }

    let filteredTieBreaks = filteredByTournament;
    if (state.tbFilter === 'won') {
        filteredTieBreaks = filteredByTournament.filter(tb => tb.isWon === true);
    } else if (state.tbFilter === 'lost') {
        filteredTieBreaks = filteredByTournament.filter(tb => tb.isWon === false);
    }

    if (!filteredTieBreaks || !filteredTieBreaks.length) {
        const msg = state.tbFilter === 'won' ? 'Keine gewonnenen Tie-Breaks.' :
                   state.tbFilter === 'lost' ? 'Keine verlorenen Tie-Breaks.' :
                   'Keine Tie-Breaks.';
        container.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:20px 0;">🎾 ${msg}</div>`;
        return;
    }

    const total = filteredTieBreaks.length;
    const won = filteredTieBreaks.filter(tb => tb.isWon).length;
    const lost = total - won;
    const rate = total > 0 ? Math.round((won/total)*100) : 0;

    const allTourneyStats = {};
    for (const tb of allTieBreaks) {
        const t = tb.tourney_name || 'Unbekannt';
        allTourneyStats[t] = (allTourneyStats[t]||0) + 1;
    }
    const sortedTourneys = Object.entries(allTourneyStats).sort((a,b) => b[1]-a[1]);

    let tourneyOptions = `<option value="all" ${state.tbTournament === 'all' ? 'selected' : ''}>🏟️ Alle Turniere</option>`;
    for (const [name, count] of sortedTourneys) {
        tourneyOptions += `<option value="${name}" ${state.tbTournament === name ? 'selected' : ''}>${name} (${count})</option>`;
    }

    let html = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
            <div><div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;">🎾 Tie Break Statistik</div>
            <div style="color:#4a5a77;font-size:12px;">${total} Tie-Breaks</div></div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="color:#7a8aa3;font-size:11px;">Filter:</span>
                <select id="tbFilterSelect" style="padding:4px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:#141b2b;color:#e0e6f0;font-size:12px;outline:none;cursor:pointer;">
                    <option value="all" ${state.tbFilter === 'all' ? 'selected' : ''}>🎾 Alle</option>
                    <option value="won" ${state.tbFilter === 'won' ? 'selected' : ''}>✅ Gewonnen</option>
                    <option value="lost" ${state.tbFilter === 'lost' ? 'selected' : ''}>❌ Verloren</option>
                </select>
                <span style="color:#7a8aa3;font-size:11px;margin-left:8px;">🏟️ Turnier:</span>
                <select id="tbTournamentFilter" style="padding:4px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:#141b2b;color:#e0e6f0;font-size:12px;outline:none;cursor:pointer;">
                    ${tourneyOptions}
                </select>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
            <div style="text-align:center;"><div style="color:#a0b3cc;font-size:16px;font-weight:700;">${total}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Tie-Breaks</div></div>
            <div style="text-align:center;"><div style="color:#2ecc71;font-size:16px;font-weight:700;">${won}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Gewonnen</div></div>
            <div style="text-align:center;"><div style="color:#e74c3c;font-size:16px;font-weight:700;">${lost}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Verloren</div></div>
            <div style="text-align:center;"><div style="color:#f1c40f;font-size:16px;font-weight:700;">${rate}%</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Quote</div></div>
        </div>
        <div style="margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:#7a8aa3;font-size:12px;">Tie-Break Quote</span><span style="color:#f1c40f;font-weight:700;font-size:14px;">${rate}%</span></div>
            <div style="width:100%;height:8px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;"><div style="width:${rate}%;height:100%;background:linear-gradient(90deg,#2ecc71,#f1c40f);border-radius:4px;"></div></div>
            <div style="display:flex;justify-content:space-between;margin-top:2px;"><span style="color:#2ecc71;font-size:10px;">✅ ${won}</span><span style="color:#e74c3c;font-size:10px;">❌ ${lost}</span></div>
        </div>
        <div style="overflow-x:auto;max-height:400px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                    <tr style="background:rgba(255,255,255,0.05);position:sticky;top:0;z-index:1;">
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Datum</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Turnier</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Belag</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Gegner</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Satz</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Ergebnis</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (const tb of filteredTieBreaks) {
        const bg = tb.isWon ? 'rgba(46,204,113,0.08)' : 'rgba(231,76,60,0.08)';
        const col = tb.isWon ? '#2ecc71' : '#e74c3c';
        const txt = tb.isWon ? '✅' : '❌';
        const d = tb.tourney_date ? String(tb.tourney_date) : '';
        const ds = d.length === 8 ? `${d.substring(6,8)}.${d.substring(4,6)}.${d.substring(0,4)}` : d;
        const surf = tb.surface || '—';
        html += `<tr style="background:${bg};border-bottom:1px solid rgba(255,255,255,0.03);">
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${ds}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${tb.tourney_name||'-'}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${SURF_MAP[surf]||''} ${surf}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${tb.opponent||'-'}</td>
            <td style="padding:4px 10px;color:#7a8aa3;font-size:11px;">Satz ${tb.setNumber}</td>
            <td style="padding:4px 10px;color:${col};font-weight:600;font-size:11px;">${txt} ${tb.setScore}</td>
        </tr>`;
    }
    html += `</tbody></table></div><div style="margin-top:8px;color:#4a5a77;font-size:11px;text-align:right;">${total} Tie-Breaks</div>`;
    container.innerHTML = html;

    document.getElementById('tbFilterSelect').onchange = function() {
        state.tbFilter = this.value;
        if (state.selected) loadMatches(state.selected);
    };
    document.getElementById('tbTournamentFilter').onchange = function() {
        state.tbTournament = this.value;
        if (state.selected) loadMatches(state.selected);
    };
}

// ===== RENDER MATCHES (für Siege/Niederlagen) =====
function renderAnalyseMatches(matches, playerName, stats) {
    const container = document.getElementById('matchesContainer');
    if (!container) {
        console.error('Container nicht gefunden!');
        return;
    }

    if (!matches || !matches.length) {
        container.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:20px 0;">📭 ${state.filter === 'wins' ? 'Keine Siege' : 'Keine Niederlagen'}.</div>`;
        return;
    }

    const total = matches.length;
    const isWin = state.filter === 'wins';
    const label = isWin ? 'Siege' : 'Niederlagen';
    const emoji = isWin ? '✅' : '❌';
    const color = isWin ? '#2ecc71' : '#e74c3c';

    const currentTournament = state.tournamentWins || 'all';

    let optHtml = `<div class="t-opt" data-value="all" style="padding:6px 12px;cursor:pointer;border-radius:4px;color:#e0e6f0;" onclick="selectTournament('all')">🏟️ Alle Turniere</div>`;
    if (stats && stats.length) {
        for (const t of stats) {
            const sel = t.name === currentTournament;
            const escapedName = t.name.replace(/'/g, "\\'");
            optHtml += `<div class="t-opt" data-value="${escapedName}" style="padding:6px 12px;cursor:pointer;border-radius:4px;color:${sel ? '#f1c40f' : '#e0e6f0'};background:${sel ? 'rgba(241,196,15,0.12)' : ''};${sel ? 'border-left:3px solid #f1c40f;' : ''}" onclick="selectTournament('${escapedName}')">${t.name} (${t.count})</div>`;
        }
    }

    let html = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                <div style="text-align:center;"><div style="color:#a0b3cc;font-size:16px;font-weight:700;">${total}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">${label}</div></div>
                <div style="text-align:center;"><div style="color:${color};font-size:16px;font-weight:700;">${emoji}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">${isWin ? 'Gewonnen' : 'Verloren'}</div></div>
                <div style="text-align:center;"><div style="color:#f1c40f;font-size:16px;font-weight:700;">${total}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Matches</div></div>
            </div>
            <div style="position:relative;">
                <span style="color:#7a8aa3;font-size:11px;">🏟️ Turnier:</span>
                <div style="position:relative;margin-top:2px;">
                    <div id="tournamentTrigger" style="display:flex;justify-content:space-between;align-items:center;padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:#141b2b;color:#e0e6f0;font-size:12px;cursor:pointer;user-select:none;" onclick="toggleDropdown()">
                        <span id="tournamentLabel" style="color:#e0e6f0;">${currentTournament === 'all' ? '🏟️ Alle Turniere' : currentTournament}</span>
                        <span style="font-size:10px;color:#4a5a77;">▼</span>
                    </div>
                    <div id="tournamentList" style="display:none;position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#141b2b;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:4px 0;max-height:220px;overflow-y:auto;z-index:100;box-shadow:0 8px 30px rgba(0,0,0,0.5);">
                        <input type="text" id="tournamentSearch" placeholder="🔍 Turnier suchen..." style="width:calc(100% - 16px);margin:4px 8px;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:#0a0f1a;color:#e0e6f0;font-size:12px;outline:none;" oninput="filterTournaments()">
                        <div id="tournamentOptions">${optHtml}</div>
                    </div>
                </div>
            </div>
        </div>
        <div style="overflow-x:auto;max-height:500px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                    <tr style="background:rgba(255,255,255,0.05);position:sticky;top:0;z-index:1;">
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Datum</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Turnier</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Belag</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Gegner</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Ergebnis</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Asse</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (const m of matches) {
        const win = m.winner_name === playerName;
        const opp = win ? m.loser_name : m.winner_name;
        const bg = win ? 'rgba(46,204,113,0.08)' : 'rgba(231,76,60,0.08)';
        const col = win ? '#2ecc71' : '#e74c3c';
        const txt = win ? '✅' : '❌';
        const d = m.tourney_date ? String(m.tourney_date) : '';
        const ds = d.length === 8 ? `${d.substring(6,8)}.${d.substring(4,6)}.${d.substring(0,4)}` : d;
        const ace = win ? (m.w_ace||0) : (m.l_ace||0);
        const surf = m.surface || '—';
        const surfEmoji = SURF_MAP[surf] || '';

        html += `<tr style="background:${bg};border-bottom:1px solid rgba(255,255,255,0.03);">
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${ds}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${m.tourney_name||'-'}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${surfEmoji} ${surf}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${opp||'-'}</td>
            <td style="padding:4px 10px;color:${col};font-weight:600;font-size:11px;">${txt} ${m.score||'-'}</td>
            <td style="padding:4px 10px;color:#f1c40f;font-size:11px;text-align:center;">${ace}</td>
        </tr>`;
    }

    html += `</tbody></table></div>
        <div style="margin-top:8px;color:#4a5a77;font-size:11px;text-align:right;">${total} ${label}</div>
    `;

    container.innerHTML = html;
    console.log(`✅ ${total} ${label} angezeigt`);
}

// ===== 7. RENDER COMEBACK STATS =====
function renderComebackStats(matches, playerName) {
    const container = document.getElementById('matchesContainer');
    if (!container) return;

    if (!matches || !matches.length) {
        container.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:20px 0;">📭 Keine Matches gefunden.</div>`;
        return;
    }

    const comebackSituations = [];
    const lostAfterLead = [];

    for (const m of matches) {
        const score = m.score || '';
        const sets = score.split(' ');
        let playerSets = 0;
        let opponentSets = 0;
        let wasBehind = false;
        let setResults = [];
        let maxOpponentSets = 0;
        const isWin = m.winner_name === playerName;

        for (const set of sets) {
            const parts = set.split('-');
            if (parts.length === 2) {
                const p1 = parseInt(parts[0]);
                const p2 = parseInt(parts[1]);
                if (!isNaN(p1) && !isNaN(p2)) {
                    const playerWonSet = (p1 > p2);
                    setResults.push({
                        score: set,
                        playerWon: playerWonSet,
                        playerScore: p1,
                        opponentScore: p2
                    });

                    if (playerWonSet) {
                        playerSets++;
                    } else {
                        opponentSets++;
                    }

                    if (opponentSets > playerSets) {
                        wasBehind = true;
                        if (opponentSets > maxOpponentSets) {
                            maxOpponentSets = opponentSets;
                        }
                    }
                }
            }
        }

        if (wasBehind) {
            const matchData = {
                ...m,
                setResults: setResults,
                playerSets: playerSets,
                opponentSets: opponentSets,
                maxOpponentSets: maxOpponentSets,
                isComeback: isWin,
                isWin: isWin
            };

            if (isWin) {
                comebackSituations.push(matchData);
            } else {
                lostAfterLead.push(matchData);
            }
        }
    }

    const totalSituations = comebackSituations.length + lostAfterLead.length;
    if (totalSituations === 0) {
        container.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:20px 0;">🔄 Keine Comeback-Situationen gefunden.</div>`;
        return;
    }

    const totalComebacks = comebackSituations.length;
    const totalLost = lostAfterLead.length;
    const comebackRate = totalSituations > 0 ? Math.round((totalComebacks / totalSituations) * 100) : 0;

    const allTourneyStats = {};
    const allSituations = [...comebackSituations, ...lostAfterLead];
    for (const m of allSituations) {
        const t = m.tourney_name || 'Unbekannt';
        allTourneyStats[t] = (allTourneyStats[t]||0) + 1;
    }
    const sortedTourneys = Object.entries(allTourneyStats).sort((a,b) => b[1]-a[1]);

    let filteredSituations = allSituations;
    if (state.tournamentComeback !== 'all') {
        filteredSituations = allSituations.filter(m => m.tourney_name === state.tournamentComeback);
    }

    const filteredComebacks = filteredSituations.filter(m => m.isComeback);
    const filteredLost = filteredSituations.filter(m => !m.isComeback);
    const filteredTotal = filteredSituations.length;
    const filteredRate = filteredTotal > 0 ? Math.round((filteredComebacks.length / filteredTotal) * 100) : 0;

    const situationStats = {
        '0-1': { total: 0, won: 0, lost: 0 },
        '1-2': { total: 0, won: 0, lost: 0 },
        '0-2': { total: 0, won: 0, lost: 0 }
    };

    for (const m of filteredSituations) {
        let type = '';
        if (m.maxOpponentSets === 1) {
            type = '0-1';
        } else if (m.maxOpponentSets === 2) {
            let was0_2 = false;
            let was1_2 = false;
            let playerSets = 0;
            let opponentSets = 0;

            for (const set of m.setResults) {
                if (set.playerWon) {
                    playerSets++;
                } else {
                    opponentSets++;
                }
                if (opponentSets === 2 && playerSets === 0) was0_2 = true;
                if (opponentSets === 2 && playerSets === 1) was1_2 = true;
            }

            if (was0_2) type = '0-2';
            else if (was1_2) type = '1-2';
        }

        if (type) {
            situationStats[type].total++;
            if (m.isComeback) {
                situationStats[type].won++;
            } else {
                situationStats[type].lost++;
            }
        }
    }

    let tourneyOptions = `<option value="all" ${state.tournamentComeback === 'all' ? 'selected' : ''}>🏟️ Alle Turniere</option>`;
    for (const [name, count] of sortedTourneys) {
        tourneyOptions += `<option value="${name}" ${state.tournamentComeback === name ? 'selected' : ''}>${name} (${count})</option>`;
    }

    let html = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
            <div>
                <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;">🔄 Comeback Statistik</div>
                <div style="color:#4a5a77;font-size:12px;">${totalSituations} Comeback-Situationen</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="color:#7a8aa3;font-size:11px;">🏟️ Turnier:</span>
                <select id="comebackTournamentFilter" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:#141b2b;color:#e0e6f0;font-size:12px;outline:none;cursor:pointer;">
                    ${tourneyOptions}
                </select>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:16px;">
            <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:12px;text-align:center;border:1px solid rgba(255,255,255,0.05);">
                <div style="color:#f1c40f;font-size:22px;font-weight:700;">${filteredTotal}</div>
                <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;">Situationen</div>
            </div>
            <div style="background:rgba(46,204,113,0.05);border-radius:10px;padding:12px;text-align:center;border:1px solid rgba(46,204,113,0.1);">
                <div style="color:#2ecc71;font-size:22px;font-weight:700;">${filteredComebacks.length}</div>
                <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;">✅ Comeback</div>
            </div>
            <div style="background:rgba(231,76,60,0.05);border-radius:10px;padding:12px;text-align:center;border:1px solid rgba(231,76,60,0.1);">
                <div style="color:#e74c3c;font-size:22px;font-weight:700;">${filteredLost.length}</div>
                <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;">❌ Verloren</div>
            </div>
            <div style="background:rgba(52,152,219,0.05);border-radius:10px;padding:12px;text-align:center;border:1px solid rgba(52,152,219,0.1);">
                <div style="color:#3498db;font-size:22px;font-weight:700;">${filteredRate}%</div>
                <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;">Quote</div>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
            <div style="text-align:center;padding:8px;background:rgba(231,76,60,0.05);border-radius:8px;">
                <div style="display:flex;justify-content:center;gap:16px;">
                    <span style="color:#e74c3c;font-size:20px;font-weight:700;">${situationStats['0-1'].total}</span>
                    <span style="color:#7a8aa3;font-size:12px;">|</span>
                    <span style="color:#2ecc71;font-size:16px;">✅ ${situationStats['0-1'].won}</span>
                    <span style="color:#e74c3c;font-size:16px;">❌ ${situationStats['0-1'].lost}</span>
                </div>
                <div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Nach 0-1</div>
                <div style="color:#3498db;font-size:11px;font-weight:600;">${situationStats['0-1'].total > 0 ? Math.round((situationStats['0-1'].won / situationStats['0-1'].total) * 100) : 0}% Quote</div>
            </div>
            <div style="text-align:center;padding:8px;background:rgba(230,126,34,0.05);border-radius:8px;">
                <div style="display:flex;justify-content:center;gap:16px;">
                    <span style="color:#e67e22;font-size:20px;font-weight:700;">${situationStats['1-2'].total}</span>
                    <span style="color:#7a8aa3;font-size:12px;">|</span>
                    <span style="color:#2ecc71;font-size:16px;">✅ ${situationStats['1-2'].won}</span>
                    <span style="color:#e74c3c;font-size:16px;">❌ ${situationStats['1-2'].lost}</span>
                </div>
                <div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Nach 1-2</div>
                <div style="color:#3498db;font-size:11px;font-weight:600;">${situationStats['1-2'].total > 0 ? Math.round((situationStats['1-2'].won / situationStats['1-2'].total) * 100) : 0}% Quote</div>
            </div>
            <div style="text-align:center;padding:8px;background:rgba(192,57,43,0.05);border-radius:8px;">
                <div style="display:flex;justify-content:center;gap:16px;">
                    <span style="color:#c0392b;font-size:20px;font-weight:700;">${situationStats['0-2'].total}</span>
                    <span style="color:#7a8aa3;font-size:12px;">|</span>
                    <span style="color:#2ecc71;font-size:16px;">✅ ${situationStats['0-2'].won}</span>
                    <span style="color:#e74c3c;font-size:16px;">❌ ${situationStats['0-2'].lost}</span>
                </div>
                <div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Nach 0-2</div>
                <div style="color:#3498db;font-size:11px;font-weight:600;">${situationStats['0-2'].total > 0 ? Math.round((situationStats['0-2'].won / situationStats['0-2'].total) * 100) : 0}% Quote</div>
            </div>
        </div>

        <div style="margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <span style="color:#7a8aa3;font-size:12px;">Comeback-Quote</span>
                <span style="color:#f1c40f;font-weight:700;font-size:14px;">${filteredRate}%</span>
            </div>
            <div style="width:100%;height:20px;background:rgba(255,255,255,0.05);border-radius:10px;overflow:hidden;display:flex;">
                <div style="width:${filteredRate}%;height:100%;background:linear-gradient(90deg,#2ecc71,#f1c40f);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;min-width:30px;">
                    ${filteredRate}%
                </div>
                <div style="flex:1;height:100%;background:rgba(231,76,60,0.3);border-radius:10px;display:flex;align-items:center;justify-content:center;color:#e74c3c;font-size:10px;font-weight:700;">
                    ${100 - filteredRate}%
                </div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;">
                <span style="color:#2ecc71;">✅ Comeback ${filteredComebacks.length}</span>
                <span style="color:#e74c3c;">❌ Verloren ${filteredLost.length}</span>
            </div>
        </div>

        <div style="overflow-x:auto;max-height:400px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                    <tr style="background:rgba(255,255,255,0.05);position:sticky;top:0;z-index:1;">
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Datum</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Turnier</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Belag</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Gegner</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Ergebnis</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Status</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (filteredSituations.length === 0) {
        html += `<tr><td colspan="6" style="padding:20px;text-align:center;color:#7a8aa3;">Keine Comeback-Situationen für dieses Turnier.</td></tr>`;
    } else {
        filteredSituations.sort((a, b) => {
            const dateA = a.tourney_date ? String(a.tourney_date) : '';
            const dateB = b.tourney_date ? String(b.tourney_date) : '';
            return dateB.localeCompare(dateA);
        });

        for (const m of filteredSituations) {
            const opp = m.winner_name === playerName ? m.loser_name : m.winner_name;
            const d = m.tourney_date ? String(m.tourney_date) : '';
            const ds = d.length === 8 ? `${d.substring(6,8)}.${d.substring(4,6)}.${d.substring(0,4)}` : d;
            const surf = m.surface || '—';

            let displayScore = m.score || '—';
            if (m.winner_name !== playerName && m.loser_name === playerName) {
                const sets = m.score.split(' ');
                displayScore = sets.map(set => {
                    const parts = set.split('-');
                    if (parts.length === 2) {
                        return `${parts[1]}-${parts[0]}`;
                    }
                    return set;
                }).join(' ');
            }

            let type = '';
            if (m.maxOpponentSets === 1) type = '0-1';
            else if (m.maxOpponentSets === 2) {
                let was0_2 = false;
                let was1_2 = false;
                let playerSets = 0;
                let opponentSets = 0;

                for (const set of m.setResults) {
                    if (set.playerWon) {
                        playerSets++;
                    } else {
                        opponentSets++;
                    }
                    if (opponentSets === 2 && playerSets === 0) was0_2 = true;
                    if (opponentSets === 2 && playerSets === 1) was1_2 = true;
                }

                if (was0_2) type = '0-2';
                else if (was1_2) type = '1-2';
            }

            let statusText = '';
            let statusColor = '';
            let intensity = '';

            if (m.isWin) {
                statusText = '✅ Comeback';
                statusColor = '#2ecc71';
                if (type === '0-2') intensity = '★★★';
                else if (type === '1-2') intensity = '★★';
                else intensity = '★';
            } else {
                statusText = '❌ Verloren';
                statusColor = '#e74c3c';
                intensity = '';
            }

            html += `<tr style="background:${m.isWin ? 'rgba(46,204,113,0.05)' : 'rgba(231,76,60,0.05)'};border-bottom:1px solid rgba(255,255,255,0.03);">
                <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${ds}</td>
                <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${m.tourney_name||'-'}</td>
                <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${SURF_MAP[surf]||''} ${surf}</td>
                <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${opp||'-'}</td>
                <td style="padding:4px 10px;color:#f1c40f;font-weight:600;font-size:11px;">${displayScore}</td>
                <td style="padding:4px 10px;color:${statusColor};font-weight:600;font-size:11px;">${statusText} ${intensity}</td>
            </tr>`;
        }
    }

    html += `</tbody></table></div>
        <div style="margin-top:8px;color:#4a5a77;font-size:11px;text-align:right;">
            ${filteredTotal} Comeback-Situationen
            ${state.tournamentComeback !== 'all' ? `bei ${state.tournamentComeback}` : ''}
            ${state.tournamentComeback === 'all' ? `(Quote: ${comebackRate}%)` : `(Quote: ${filteredRate}%)`}
        </div>
    `;

    container.innerHTML = html;

    document.getElementById('comebackTournamentFilter').onchange = function() {
        state.tournamentComeback = this.value;
        if (state.selected) loadMatches(state.selected);
    };
}

// ===== 8. RENDER FORM STATS =====
function renderFormStats(matches, playerName) {
    const container = document.getElementById('matchesContainer');
    if (!container) return;

    if (!matches || !matches.length) {
        container.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:20px 0;">📭 Keine Matches gefunden.</div>`;
        return;
    }

    let filteredMatches = matches;
    if (state.tournamentForm !== 'all') {
        filteredMatches = matches.filter(m => m.tourney_name === state.tournamentForm);
    }

    if (!filteredMatches || !filteredMatches.length) {
        container.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:20px 0;">📭 Keine Matches für dieses Turnier gefunden.</div>`;
        return;
    }

    const sorted = [...filteredMatches].sort((a, b) => {
        const dateA = a.tourney_date ? String(a.tourney_date) : '';
        const dateB = b.tourney_date ? String(b.tourney_date) : '';
        return dateB.localeCompare(dateA);
    });

    const last10 = sorted.slice(0, 10);
    const total = last10.length;
    const wins = last10.filter(m => m.winner_name === playerName).length;
    const losses = total - wins;
    const rate = total > 0 ? Math.round((wins / total) * 100) : 0;

    const last5 = last10.slice(0, 5);
    const prev5 = last10.slice(5, 10);
    const last5Wins = last5.filter(m => m.winner_name === playerName).length;
    const prev5Wins = prev5.filter(m => m.winner_name === playerName).length;
    const trend = last5Wins - prev5Wins;
    let trendText = '';
    let trendColor = '';
    if (trend > 0) { trendText = `📈 +${trend}`; trendColor = '#2ecc71'; }
    else if (trend < 0) { trendText = `📉 ${trend}`; trendColor = '#e74c3c'; }
    else { trendText = '➡️ ±0'; trendColor = '#f1c40f'; }

    let symbols = '';
    for (const m of last10) {
        const isWin = m.winner_name === playerName;
        symbols += isWin ? '✅' : '❌';
    }

    const allTourneys = {};
    for (const m of matches) {
        const t = m.tourney_name || 'Unbekannt';
        allTourneys[t] = (allTourneys[t]||0) + 1;
    }
    const sortedTourneys = Object.entries(allTourneys).sort((a,b) => b[1]-a[1]);

    let tourneyOptions = `<option value="all" ${state.tournamentForm === 'all' ? 'selected' : ''}>🏟️ Alle Turniere</option>`;
    for (const [name, count] of sortedTourneys) {
        tourneyOptions += `<option value="${name}" ${state.tournamentForm === name ? 'selected' : ''}>${name} (${count})</option>`;
    }

    let html = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
            <div>
                <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;">📈 Aktuelle Form</div>
                <div style="color:#4a5a77;font-size:12px;">Letzte ${total} Matches</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="color:#7a8aa3;font-size:11px;">🏟️ Turnier:</span>
                <select id="formTournamentFilter" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:#141b2b;color:#e0e6f0;font-size:12px;outline:none;cursor:pointer;">
                    ${tourneyOptions}
                </select>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:16px;">
            <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:12px;text-align:center;border:1px solid rgba(255,255,255,0.05);">
                <div style="color:#f1c40f;font-size:22px;font-weight:700;">${total}</div>
                <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;">Matches</div>
            </div>
            <div style="background:rgba(46,204,113,0.05);border-radius:10px;padding:12px;text-align:center;border:1px solid rgba(46,204,113,0.1);">
                <div style="color:#2ecc71;font-size:22px;font-weight:700;">${wins}</div>
                <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;">✅ Siege</div>
            </div>
            <div style="background:rgba(231,76,60,0.05);border-radius:10px;padding:12px;text-align:center;border:1px solid rgba(231,76,60,0.1);">
                <div style="color:#e74c3c;font-size:22px;font-weight:700;">${losses}</div>
                <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;">❌ Niederlagen</div>
            </div>
            <div style="background:rgba(52,152,219,0.05);border-radius:10px;padding:12px;text-align:center;border:1px solid rgba(52,152,219,0.1);">
                <div style="color:#3498db;font-size:22px;font-weight:700;">${rate}%</div>
                <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;">Quote</div>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
            <div style="text-align:center;">
                <div style="display:flex;justify-content:center;gap:4px;font-size:22px;letter-spacing:2px;flex-wrap:wrap;">
                    ${symbols.split('').map(s => `<span>${s}</span>`).join('')}
                </div>
                <div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;margin-top:4px;">Letzte 10 Matches (${wins}-${losses})</div>
            </div>
            <div style="text-align:center;display:flex;flex-direction:column;justify-content:center;">
                <div style="display:flex;justify-content:center;align-items:center;gap:12px;">
                    <span style="color:#7a8aa3;font-size:11px;">Trend:</span>
                    <span style="color:${trendColor};font-size:18px;font-weight:700;">${trendText}</span>
                    <span style="color:#4a5a77;font-size:10px;">(letzte 5 vs. davor)</span>
                </div>
                <div style="display:flex;justify-content:center;gap:16px;margin-top:4px;font-size:11px;">
                    <span style="color:#2ecc71;">Letzte 5: ${last5Wins}-${5-last5Wins}</span>
                    <span style="color:#e74c3c;">Davor: ${prev5Wins}-${5-prev5Wins}</span>
                </div>
            </div>
        </div>

        <div style="margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                <span style="color:#7a8aa3;font-size:12px;">Form-Verlauf</span>
                <span style="color:#f1c40f;font-weight:700;font-size:13px;">${rate}% Siegquote</span>
            </div>
            <div style="display:flex;height:12px;border-radius:6px;overflow:hidden;gap:2px;">
                ${last10.map(m => {
                    const isWin = m.winner_name === playerName;
                    return `<div style="flex:1;background:${isWin ? '#2ecc71' : '#e74c3c'};border-radius:2px;" title="${isWin ? '✅ Sieg' : '❌ Niederlage'}"></div>`;
                }).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:9px;color:#4a5a77;">
                <span>Neueste →</span>
                <span>← Älteste</span>
            </div>
        </div>

        <div style="overflow-x:auto;max-height:400px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                    <tr style="background:rgba(255,255,255,0.05);position:sticky;top:0;z-index:1;">
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Datum</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Turnier</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Belag</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Gegner</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Ergebnis</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Status</th>
                    </tr>
                </thead>
                <tbody>
    `;

    for (const m of last10) {
        const isWin = m.winner_name === playerName;
        const opp = isWin ? m.loser_name : m.winner_name;
        const bg = isWin ? 'rgba(46,204,113,0.05)' : 'rgba(231,76,60,0.05)';
        const col = isWin ? '#2ecc71' : '#e74c3c';
        const status = isWin ? '✅ Sieg' : '❌ Niederlage';
        const d = m.tourney_date ? String(m.tourney_date) : '';
        const ds = d.length === 8 ? `${d.substring(6,8)}.${d.substring(4,6)}.${d.substring(0,4)}` : d;
        const surf = m.surface || '—';

        html += `<tr style="background:${bg};border-bottom:1px solid rgba(255,255,255,0.03);">
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${ds}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${m.tourney_name||'-'}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${SURF_MAP[surf]||''} ${surf}</td>
            <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${opp||'-'}</td>
            <td style="padding:4px 10px;color:#f1c40f;font-weight:600;font-size:11px;">${m.score||'-'}</td>
            <td style="padding:4px 10px;color:${col};font-weight:600;font-size:11px;">${status}</td>
        </tr>`;
    }

    html += `</tbody></table></div>
        <div style="margin-top:8px;color:#4a5a77;font-size:11px;text-align:right;">
            ${total} Matches (${wins}-${losses}) · Quote: ${rate}%
            ${state.tournamentForm !== 'all' ? `bei ${state.tournamentForm}` : ''}
        </div>
    `;

    container.innerHTML = html;

    document.getElementById('formTournamentFilter').onchange = function() {
        state.tournamentForm = this.value;
        if (state.selected) loadMatches(state.selected);
    };
}

// ===== 9. RENDER OPPONENT ANALYSIS =====
function renderOpponentStats(matches, playerName) {
    const container = document.getElementById('matchesContainer');
    if (!container) return;

    if (!matches || !matches.length) {
        container.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:20px 0;">📭 Keine Matches gefunden.</div>`;
        return;
    }

    const opponentStats = {};

    for (const m of matches) {
        const isWin = m.winner_name === playerName;
        const opponent = isWin ? m.loser_name : m.winner_name;

        if (!opponent || opponent === '') continue;

        if (!opponentStats[opponent]) {
            opponentStats[opponent] = {
                name: opponent,
                total: 0,
                wins: 0,
                losses: 0,
                setsWon: 0,
                setsLost: 0,
                matches: []
            };
        }

        const stats = opponentStats[opponent];
        stats.total++;
        if (isWin) stats.wins++;
        else stats.losses++;

        const score = m.score || '';
        const sets = score.split(' ');
        let playerSets = 0;
        let opponentSets = 0;

        for (const set of sets) {
            const parts = set.split('-');
            if (parts.length === 2) {
                const p1 = parseInt(parts[0]);
                const p2 = parseInt(parts[1]);
                if (!isNaN(p1) && !isNaN(p2)) {
                    if (isWin) {
                        playerSets += (p1 > p2) ? 1 : 0;
                        opponentSets += (p2 > p1) ? 1 : 0;
                    } else {
                        playerSets += (p2 > p1) ? 1 : 0;
                        opponentSets += (p1 > p2) ? 1 : 0;
                    }
                }
            }
        }

        stats.setsWon += playerSets;
        stats.setsLost += opponentSets;
        stats.matches.push(m);
    }

    const opponentArray = Object.values(opponentStats);

    const allTourneys = {};
    for (const m of matches) {
        const t = m.tourney_name || 'Unbekannt';
        allTourneys[t] = (allTourneys[t]||0) + 1;
    }
    const sortedTourneys = Object.entries(allTourneys).sort((a,b) => b[1]-a[1]);

    let filteredOpponents = opponentArray;
    if (state.tournamentOpponent !== 'all') {
        filteredOpponents = opponentArray.map(opp => {
            const filteredMatches = opp.matches.filter(m => m.tourney_name === state.tournamentOpponent);
            if (filteredMatches.length === 0) return null;

            const newStats = {
                name: opp.name,
                total: filteredMatches.length,
                wins: 0,
                losses: 0,
                setsWon: 0,
                setsLost: 0,
                matches: filteredMatches
            };

            for (const m of filteredMatches) {
                const isWin = m.winner_name === playerName;
                if (isWin) newStats.wins++;
                else newStats.losses++;

                const score = m.score || '';
                const sets = score.split(' ');
                let playerSets = 0;
                let opponentSets = 0;

                for (const set of sets) {
                    const parts = set.split('-');
                    if (parts.length === 2) {
                        const p1 = parseInt(parts[0]);
                        const p2 = parseInt(parts[1]);
                        if (!isNaN(p1) && !isNaN(p2)) {
                            if (isWin) {
                                playerSets += (p1 > p2) ? 1 : 0;
                                opponentSets += (p2 > p1) ? 1 : 0;
                            } else {
                                playerSets += (p2 > p1) ? 1 : 0;
                                opponentSets += (p1 > p2) ? 1 : 0;
                            }
                        }
                    }
                }
                newStats.setsWon += playerSets;
                newStats.setsLost += opponentSets;
            }

            return newStats;
        }).filter(opp => opp !== null);
    }

    const MIN_MATCHES = state.tournamentOpponent !== 'all' ? 1 : 3;

    const relevantOpponents = filteredOpponents.filter(opp => opp.total >= MIN_MATCHES);
    const finalOpponents = relevantOpponents.length > 0 ? relevantOpponents : filteredOpponents;

    const hardest = [...finalOpponents].sort((a, b) => {
        const rateA = a.total > 0 ? (a.wins / a.total) : 0;
        const rateB = b.total > 0 ? (b.wins / b.total) : 0;
        if (rateA !== rateB) return rateA - rateB;
        return b.total - a.total;
    }).slice(0, 10);

    const easiest = [...finalOpponents].sort((a, b) => {
        const rateA = a.total > 0 ? (a.wins / a.total) : 0;
        const rateB = b.total > 0 ? (b.wins / b.total) : 0;
        if (rateA !== rateB) return rateB - rateA;
        return b.total - a.total;
    }).slice(0, 10);

    const showHardest = state.opponentFilter === 'hardest';
    const displayOpponents = showHardest ? hardest : easiest;
    const icon = showHardest ? '🔴' : '🟢';

    let tourneyOptions = `<option value="all" ${state.tournamentOpponent === 'all' ? 'selected' : ''}>🏟️ Alle Turniere</option>`;
    for (const [name, count] of sortedTourneys) {
        tourneyOptions += `<option value="${name}" ${state.tournamentOpponent === name ? 'selected' : ''}>${name} (${count})</option>`;
    }

    let html = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
            <div>
                <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;">${icon} Gegner Analyse</div>
                <div style="color:#4a5a77;font-size:12px;">${filteredOpponents.length} Gegner analysiert</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <span style="color:#7a8aa3;font-size:11px;">🏟️ Turnier:</span>
                <select id="opponentTournamentFilter" style="flex:1;padding:6px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:#141b2b;color:#e0e6f0;font-size:12px;outline:none;cursor:pointer;">
                    ${tourneyOptions}
                </select>
            </div>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:16px;">
            <button id="btnHardest" style="flex:1;padding:8px 12px;border-radius:8px;border:2px solid ${state.opponentFilter === 'hardest' ? 'rgba(231,76,60,0.5)' : 'rgba(255,255,255,0.1)'};background:${state.opponentFilter === 'hardest' ? 'rgba(231,76,60,0.15)' : 'transparent'};color:${state.opponentFilter === 'hardest' ? '#e74c3c' : '#7a8aa3'};font-weight:600;cursor:pointer;font-size:13px;">
                🔴 Schwierigste Gegner
            </button>
            <button id="btnEasiest" style="flex:1;padding:8px 12px;border-radius:8px;border:2px solid ${state.opponentFilter === 'easiest' ? 'rgba(46,204,113,0.5)' : 'rgba(255,255,255,0.1)'};background:${state.opponentFilter === 'easiest' ? 'rgba(46,204,113,0.15)' : 'transparent'};color:${state.opponentFilter === 'easiest' ? '#2ecc71' : '#7a8aa3'};font-weight:600;cursor:pointer;font-size:13px;">
                🟢 Leichteste Gegner
            </button>
        </div>
    `;

    if (displayOpponents.length === 0) {
        html += `<div style="color:#7a8aa3;text-align:center;padding:20px 0;">📭 Keine Gegner für diese Auswahl gefunden.</div>`;
    } else {
        html += `
        <div style="overflow-x:auto;max-height:500px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                    <tr style="background:rgba(255,255,255,0.05);position:sticky;top:0;z-index:1;">
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">#</th>
                        <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Gegner</th>
                        <th style="padding:6px 10px;text-align:center;color:#7a8aa3;">Matches</th>
                        <th style="padding:6px 10px;text-align:center;color:#2ecc71;">✅ Siege</th>
                        <th style="padding:6px 10px;text-align:center;color:#e74c3c;">❌ Niederlagen</th>
                        <th style="padding:6px 10px;text-align:center;color:#f1c40f;">Quote</th>
                        <th style="padding:6px 10px;text-align:center;color:#3498db;">Sätze</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (let i = 0; i < displayOpponents.length; i++) {
            const opp = displayOpponents[i];
            const rate = opp.total > 0 ? Math.round((opp.wins / opp.total) * 100) : 0;
            const bg = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)';

            let color = '#f1c40f';
            let emoji = '➡️';
            if (rate >= 70) { color = '#2ecc71'; emoji = '🟢'; }
            else if (rate >= 50) { color = '#f1c40f'; emoji = '🟡'; }
            else { color = '#e74c3c'; emoji = '🔴'; }

            const setRatio = opp.setsWon + opp.setsLost > 0 ? Math.round((opp.setsWon / (opp.setsWon + opp.setsLost)) * 100) : 0;

            html += `<tr style="background:${bg};border-bottom:1px solid rgba(255,255,255,0.03);">
                <td style="padding:6px 10px;color:#4a5a77;font-weight:700;font-size:11px;">${i + 1}</td>
                <td style="padding:6px 10px;color:#e0e6f0;font-weight:500;font-size:13px;">${opp.name}</td>
                <td style="padding:6px 10px;text-align:center;color:#c0d0e0;">${opp.total}</td>
                <td style="padding:6px 10px;text-align:center;color:#2ecc71;">${opp.wins}</td>
                <td style="padding:6px 10px;text-align:center;color:#e74c3c;">${opp.losses}</td>
                <td style="padding:6px 10px;text-align:center;color:${color};font-weight:700;">${rate}% ${emoji}</td>
                <td style="padding:6px 10px;text-align:center;color:#3498db;font-size:11px;">${opp.setsWon}:${opp.setsLost} (${setRatio}%)</td>
            </tr>`;
        }

        html += `</tbody></table></div>`;
    }

    if (filteredOpponents.length > 0) {
        const hardestRate = hardest.length > 0 ? Math.round((hardest[0].wins / hardest[0].total) * 100) : 0;
        const easiestRate = easiest.length > 0 ? Math.round((easiest[0].wins / easiest[0].total) * 100) : 0;

        html += `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;padding:10px;background:rgba(255,255,255,0.03);border-radius:10px;">
            <div style="text-align:center;">
                <div style="color:#e74c3c;font-size:11px;text-transform:uppercase;">🔴 Schwierigster Gegner</div>
                <div style="color:#e0e6f0;font-size:16px;font-weight:700;">${hardest.length > 0 ? hardest[0].name : '—'}</div>
                <div style="color:#4a5a77;font-size:12px;">${hardest.length > 0 ? `${hardest[0].wins}-${hardest[0].losses} (${hardestRate}%)` : '—'}</div>
            </div>
            <div style="text-align:center;">
                <div style="color:#2ecc71;font-size:11px;text-transform:uppercase;">🟢 Leichtester Gegner</div>
                <div style="color:#e0e6f0;font-size:16px;font-weight:700;">${easiest.length > 0 ? easiest[0].name : '—'}</div>
                <div style="color:#4a5a77;font-size:12px;">${easiest.length > 0 ? `${easiest[0].wins}-${easiest[0].losses} (${easiestRate}%)` : '—'}</div>
            </div>
        </div>
        `;
    }

    html += `
        <div style="margin-top:8px;color:#4a5a77;font-size:11px;text-align:right;">
            ${filteredOpponents.length} Gegner · ${showHardest ? 'Schwierigste' : 'Leichteste'} Top 10
            ${state.tournamentOpponent !== 'all' ? `bei ${state.tournamentOpponent}` : ''}
        </div>
    `;

    container.innerHTML = html;

    document.getElementById('btnHardest').onclick = function() {
        state.opponentFilter = 'hardest';
        if (state.selected) loadMatches(state.selected);
    };
    document.getElementById('btnEasiest').onclick = function() {
        state.opponentFilter = 'easiest';
        if (state.selected) loadMatches(state.selected);
    };
    document.getElementById('opponentTournamentFilter').onchange = function() {
        state.tournamentOpponent = this.value;
        if (state.selected) loadMatches(state.selected);
    };
}

// ===== LOAD MATCHES =====
async function loadMatches(playerName) {
    const container = document.getElementById('matchesContainer');
    if (!container) return;

    container.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:10px 0;">⏳ Lade Matches...</div>`;

    try {
        let db = state.matchDb;
        if (!db) {
            db = await loadMatchDb(state.type);
            if (!db) {
                container.innerHTML = '<div style="color:#e74c3c;text-align:center;padding:20px;">❌ Match-DB nicht geladen.</div>';
                return;
            }
            state.matchDb = db;
        }

        const name = typeof playerName === 'string' ? playerName : (playerName.name || String(playerName));

        const sql = `SELECT tourney_name, surface, tourney_date, round, score, winner_name, loser_name, w_ace, l_ace FROM matches WHERE (winner_name = ? OR loser_name = ?) ORDER BY tourney_date DESC`;
        const stmt = db.prepare(sql);
        stmt.bind([name, name]);
        const allMatches = [];
        while (stmt.step()) allMatches.push(stmt.getAsObject());
        stmt.free();

        const stats = [];
        const tourneyCount = {};
        for (const m of allMatches) {
            const t = m.tourney_name || 'Unbekannt';
            tourneyCount[t] = (tourneyCount[t] || 0) + 1;
        }
        for (const [name, count] of Object.entries(tourneyCount)) {
            stats.push({ name, count });
        }
        stats.sort((a,b) => b.count - a.count);

        let filteredMatches = allMatches;

        if (state.filter === 'wins') {
            filteredMatches = filteredMatches.filter(m => m.winner_name === name);
        } else if (state.filter === 'losses') {
            filteredMatches = filteredMatches.filter(m => m.loser_name === name);
        } else if (state.filter === 'semifinal') {
            filteredMatches = filteredMatches.filter(m => m.round === 'SF');
        } else if (state.filter === 'final') {
            filteredMatches = filteredMatches.filter(m => m.round === 'F');
        } else if (state.filter === 'titles') {
            filteredMatches = filteredMatches.filter(m => m.round === 'F' && m.winner_name === name);
        }

        if ((state.filter === 'wins' || state.filter === 'losses') && state.tournamentWins && state.tournamentWins !== 'all') {
            filteredMatches = filteredMatches.filter(m => m.tourney_name === state.tournamentWins);
        }

        if (state.filter === 'surface') {
            renderSurfaceStats(filteredMatches, name, allMatches);
        } else if (state.filter === 'semifinal') {
            renderSemifinalStats(filteredMatches, name);
        } else if (state.filter === 'final') {
            renderFinalStats(filteredMatches, name);
        } else if (state.filter === 'titles') {
            renderTournamentWins(filteredMatches, name);
        } else if (state.filter === 'tiebreak') {
            renderTieBreakStats(allMatches, name);
        } else if (state.filter === 'comeback') {
            renderComebackStats(filteredMatches, name);
        } else if (state.filter === 'form') {
            renderFormStats(filteredMatches, name);
        } else if (state.filter === 'opponent') {
            renderOpponentStats(filteredMatches, name);
        } else {
            renderAnalyseMatches(filteredMatches, name, stats);
        }

    } catch (e) {
        console.error('❌ Fehler in loadMatches:', e);
        container.innerHTML = `<div style="color:#e74c3c;text-align:center;padding:20px;">❌ Fehler: ${e.message}</div>`;
    }
}

// ===== DROPDOWN =====
window.toggleDropdown = function() {
    const list = document.getElementById('tournamentList');
    if (!list) return;
    state.dropdownOpen = !state.dropdownOpen;
    list.style.display = state.dropdownOpen ? 'block' : 'none';
    if (state.dropdownOpen) {
        setTimeout(() => {
            const s = document.getElementById('tournamentSearch');
            if (s) { s.value = ''; s.focus(); filterTournaments(); }
        }, 100);
    }
};

window.filterTournaments = function() {
    const search = document.getElementById('tournamentSearch');
    const container = document.getElementById('tournamentOptions');
    if (!search || !container) return;
    const term = search.value.toLowerCase().trim();
    container.querySelectorAll('.t-opt').forEach(opt => {
        opt.style.display = (!term || opt.textContent.toLowerCase().includes(term)) ? 'block' : 'none';
    });
};

window.selectTournament = function(name) {
    state.tournamentWins = name;
    state.dropdownOpen = false;
    document.getElementById('tournamentList').style.display = 'none';
    document.getElementById('tournamentLabel').textContent = name === 'all' ? '🏟️ Alle Turniere' : name;
    if (state.selected) loadMatches(state.selected);
};

// ===== HAUPTFUNKTION =====
window.loadAnalyse = async function() {
    state.selected = null;
    state.selectedElo = null;
    state.tournamentWins = 'all';
    state.tournamentSurface = 'all';
    state.tournamentSemifinal = 'all';
    state.tournamentFinal = 'all';
    state.tournamentTitles = 'all';
    state.tournamentComeback = 'all';
    state.tournamentForm = 'all';
    state.tournamentOpponent = 'all';
    state.opponentFilter = 'hardest';
    state.filter = 'wins';
    state.tbFilter = 'all';
    state.tbTournament = 'all';
    const container = document.getElementById('pageContent');
    if (!container) return;
    container.innerHTML = `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;">
            <h2 style="color:#e0e6f0;font-size:20px;margin:0 0 8px 0;">📊 Spieler/Match Analyse</h2>
            <div style="display:flex;gap:10px;margin:16px 0;">
                <button id="btnAtp" class="toggle active" style="padding:8px 24px;border-radius:8px;border:2px solid rgba(46,204,113,0.3);background:rgba(46,204,113,0.15);color:#2ecc71;font-weight:600;cursor:pointer;">🎾 ATP</button>
                <button id="btnWta" class="toggle" style="padding:8px 24px;border-radius:8px;border:2px solid rgba(255,255,255,0.1);background:transparent;color:#7a8aa3;font-weight:600;cursor:pointer;">👑 WTA</button>
            </div>
            <div style="position:relative;">
                <input type="text" id="searchInput" placeholder="🔍 Spieler suchen..." style="width:100%;padding:10px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:#141b2b;color:#e0e6f0;font-size:14px;outline:none;">
                <span id="resultCount" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);color:#4a5a77;font-size:12px;"></span>
            </div>
            <div id="results" style="margin-top:16px;"><div style="color:#4a5a77;text-align:center;padding:20px 0;font-size:14px;">💡 Gib 2 Buchstaben ein.</div></div>
            <div id="selectedDisplay" style="margin-top:16px;display:none;">
                <div style="background:rgba(46,204,113,0.05);border:1px solid rgba(46,204,113,0.15);border-radius:10px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
                    <div style="flex:1;min-width:200px;">
                        <div style="color:#7a8aa3;font-size:12px;text-transform:uppercase;">Ausgewählt</div>
                        <div id="selectedName" style="color:#f1c40f;font-size:20px;font-weight:700;margin-top:4px;">—</div>
                        <div id="selectedElo" style="margin-top:6px;"></div>
                    </div>
                    <button onclick="clearSelection()" style="padding:6px 16px;border-radius:6px;border:1px solid rgba(231,76,60,0.3);background:rgba(231,76,60,0.1);color:#e74c3c;cursor:pointer;font-size:13px;">✕ Zurücksetzen</button>
                </div>
            </div>
            <div id="filterContainer" style="margin-top:16px;display:none;">
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px 20px;">
                    <div style="color:#7a8aa3;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Filter</div>
                    <select id="filterSelect" style="width:100%;padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:#141b2b;color:#e0e6f0;font-size:14px;outline:none;cursor:pointer;">
                        <option value="wins">✅ Nur Siege</option>
                        <option value="losses">❌ Nur Niederlagen</option>
                        <option value="surface">🏟️ Belag Statistik</option>
                        <option value="semifinal">🏆 Halbfinale</option>
                        <option value="final">🏆 Finale</option>
                        <option value="titles">🏆 Turniersiege</option>
                        <option value="tiebreak">🎾 Tie Break</option>
                        <option value="comeback">🔄 Comeback</option>
                        <option value="form">📈 Form (letzte 10)</option>
                        <option value="opponent">🎯 Gegner Analyse</option>
                    </select>
                    <div style="margin-top:8px;color:#4a5a77;font-size:12px;" id="filterInfo">Zeigt nur Siege an.</div>
                </div>
            </div>
            <div id="matchesContainer" style="margin-top:16px;"></div>
        </div>
    `;
    await switchType('atp');
    document.getElementById('btnAtp').onclick = () => switchType('atp');
    document.getElementById('btnWta').onclick = () => switchType('wta');
    document.getElementById('searchInput').oninput = function(e) {
        const term = this.value.trim();
        if (term.length >= 2) doSearch(term);
        else if (!state.selected) {
            document.getElementById('results').innerHTML = `<div style="color:#4a5a77;text-align:center;padding:20px 0;font-size:14px;">💡 Gib 2 Buchstaben ein.</div>`;
            document.getElementById('resultCount').textContent = '';
        }
    };
    document.getElementById('filterSelect').onchange = function() {
        state.filter = this.value;
        const info = document.getElementById('filterInfo');
        const labels = {
            'wins':'Siege',
            'losses':'Niederlagen',
            'surface':'Belag',
            'semifinal':'Halbfinale',
            'final':'Finale',
            'titles':'Turniersiege',
            'tiebreak':'Tie Break',
            'comeback':'Comeback',
            'form':'Form (letzte 10)',
            'opponent':'Gegner Analyse'
        };
        info.textContent = `Zeigt ${labels[state.filter]||'Filter'} an.`;
        if (state.selected) loadMatches(state.selected);
    };
};

window.loadAnalyseModule = window.loadAnalyse;

// ===== SWITCH TYPE =====
async function switchType(type) {
    state.type = type;
    state.selected = null;
    state.selectedElo = null;
    state.tournamentWins = 'all';
    state.tournamentSurface = 'all';
    state.tournamentSemifinal = 'all';
    state.tournamentFinal = 'all';
    state.tournamentTitles = 'all';
    state.tournamentComeback = 'all';
    state.tournamentForm = 'all';
    state.tournamentOpponent = 'all';
    state.opponentFilter = 'hardest';
    state.filter = 'wins';
    state.tbFilter = 'all';
    state.tbTournament = 'all';
    document.getElementById('selectedDisplay').style.display = 'none';
    document.getElementById('filterContainer').style.display = 'none';
    document.getElementById('matchesContainer').innerHTML = '';
    document.querySelectorAll('.toggle').forEach(b => {
        const active = b.id === 'btn' + type.charAt(0).toUpperCase() + type.slice(1);
        b.style.borderColor = active ? 'rgba(46,204,113,0.3)' : 'rgba(255,255,255,0.1)';
        b.style.background = active ? 'rgba(46,204,113,0.15)' : 'transparent';
        b.style.color = active ? '#2ecc71' : '#7a8aa3';
    });
    state.cacheLoaded = false;
    state.players = [];
    state.matchDb = null;

    await loadPlayers(type);
    document.getElementById('searchInput').value = '';
    document.getElementById('results').innerHTML = `<div style="color:#4a5a77;text-align:center;padding:20px 0;font-size:14px;">💡 Gib 2 Buchstaben ein, um ${type.toUpperCase()}-Spieler zu suchen.</div>`;
    document.getElementById('resultCount').textContent = '';
    document.getElementById('filterSelect').value = 'wins';
    document.getElementById('filterInfo').textContent = 'Zeigt nur Siege an.';
}

// ===== SEARCH =====
async function doSearch(term) {
    if (window.st) { clearTimeout(window.st); window.st = null; }
    window.st = setTimeout(async function() {
        const results = document.getElementById('results');
        const players = await loadPlayers(state.type);
        if (!players.length) { results.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:10px 0;">⏳ Lade...</div>`; return; }
        const found = players.filter(p => p.search.includes(term.toLowerCase())).slice(0, 10);
        document.getElementById('resultCount').textContent = found.length ? `${found.length} ✨` : '';
        if (!found.length) { results.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:20px 0;">😕 Keine Spieler gefunden.</div>`; return; }
        let html = '';
        const tasks = [];
        for (const p of found) {
            const imgId = 'img_' + p.player_id;
            html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;cursor:pointer;transition:0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'" onclick="selectPlayer('${p.name}')">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div id="${imgId}" style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#1a472a,#2d5a3d);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#fff;flex-shrink:0;">${p.name.split(' ').map(w=>w[0]).join('').substring(0,2)}</div>
                    <span style="color:#e0e6f0;font-weight:500;">${p.name}</span>
                </div>
                <span style="color:#2ecc71;font-size:14px;">→</span>
            </div>`;
            if (p.wikidata_id) tasks.push({ id: imgId, wid: p.wikidata_id });
        }
        results.innerHTML = html;
        for (const t of tasks) {
            const url = await loadImage(t.wid);
            if (url) {
                const el = document.getElementById(t.id);
                if (el) el.innerHTML = `<img src="${url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.1);" onerror="this.style.display='none'">`;
            }
        }
        window.st = null;
    }, 150);
}

function renderSelectedElo(eloData) {
    const container = document.getElementById('selectedElo');
    if (!container) return;

    if (!eloData || !eloData.gesamt) {
        container.innerHTML = `<span style="color:#4a5a77;font-size:13px;">— ELO nicht verfügbar</span>`;
        return;
    }

    const parts = [`🔥 <span style="color:#f1c40f;font-weight:700;font-size:15px;">${eloData.gesamt}</span> <span style="color:#7a8aa3;font-size:12px;">ELO</span>`];

    const surfaceParts = [];
    if (eloData.hard) surfaceParts.push(`🏟️ ${eloData.hard}`);
    if (eloData.clay) surfaceParts.push(`🧱 ${eloData.clay}`);
    if (eloData.grass) surfaceParts.push(`🌿 ${eloData.grass}`);

    let html = parts.join('');
    if (surfaceParts.length > 0) {
        html += `<span style="color:#4a5a77;font-size:12px;margin-left:10px;">· ${surfaceParts.join(' · ')}</span>`;
    }

    container.innerHTML = html;
}

// ===== SELECT PLAYER =====
window.selectPlayer = async function(name) {
    const players = await loadPlayers(state.type);
    const found = players.find(p => p.name === name);
    if (!found) return;
    state.selected = found.name;
    state.selectedElo = null;
    state.tournamentWins = 'all';
    state.tournamentSurface = 'all';
    state.tournamentSemifinal = 'all';
    state.tournamentFinal = 'all';
    state.tournamentTitles = 'all';
    state.tournamentComeback = 'all';
    state.tournamentForm = 'all';
    state.tournamentOpponent = 'all';
    state.opponentFilter = 'hardest';
    state.filter = 'wins';
    state.tbFilter = 'all';
    state.tbTournament = 'all';
    document.getElementById('results').innerHTML = '';
    document.getElementById('resultCount').textContent = '';
    document.getElementById('selectedDisplay').style.display = 'block';
    document.getElementById('selectedName').textContent = found.name;

    const eloContainer = document.getElementById('selectedElo');
    if (eloContainer) eloContainer.innerHTML = `<span style="color:#4a5a77;font-size:13px;">⏳ Lade ELO...</span>`;

    loadEloForSelected(found.name).then(eloData => {
        state.selectedElo = eloData;
        renderSelectedElo(eloData);
    });

    document.getElementById('searchInput').value = '';
    document.getElementById('filterContainer').style.display = 'block';
    document.getElementById('filterSelect').value = 'wins';
    document.getElementById('filterInfo').textContent = 'Zeigt nur Siege an.';
    loadMatches(found.name);
};

// ===== CLEAR =====
window.clearSelection = function() {
    state.selected = null;
    state.selectedElo = null;
    state.tournamentWins = 'all';
    state.tournamentSurface = 'all';
    state.tournamentSemifinal = 'all';
    state.tournamentFinal = 'all';
    state.tournamentTitles = 'all';
    state.tournamentComeback = 'all';
    state.tournamentForm = 'all';
    state.tournamentOpponent = 'all';
    state.opponentFilter = 'hardest';
    state.filter = 'wins';
    state.tbFilter = 'all';
    state.tbTournament = 'all';
    document.getElementById('selectedDisplay').style.display = 'none';
    document.getElementById('filterContainer').style.display = 'none';
    document.getElementById('matchesContainer').innerHTML = '';
    document.getElementById('results').innerHTML = `<div style="color:#4a5a77;text-align:center;padding:20px 0;font-size:14px;">💡 Gib 2 Buchstaben ein, um Spieler zu suchen.</div>`;
    document.getElementById('searchInput').value = '';
    document.getElementById('resultCount').textContent = '';
    document.getElementById('filterSelect').value = 'wins';
    document.getElementById('filterInfo').textContent = 'Zeigt nur Siege an.';
};

console.log('✅ analyse.js geladen (10 Filter mit separaten Turnier-Dropdowns + ELO)');