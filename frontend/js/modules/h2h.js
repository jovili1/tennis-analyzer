// ==========================================
// HEAD TO HEAD MODUL
// ==========================================

console.log('🔥 h2h.js wird geladen...');

// ===== API-URL (lokal vs. online) =====
var API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? ''
    : 'https://tennis-analyzer-api.onrender.com';

var BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? '..'
    : 'https://jovili1.github.io/tennis-analyzer';

let h2hState = {
    type: 'atp',
    player1: null,
    player2: null,
    players: [],
    cacheLoaded: false,
    matchDb: null,
    imageCache: {},
    imageCacheKeys: [],
    searchTerm1: '',
    searchTerm2: ''
};

// ===== HELPER =====
function cacheImage(key, url) {
    h2hState.imageCache[key] = url;
    h2hState.imageCacheKeys.push(key);
    while (h2hState.imageCacheKeys.length > 30) {
        const old = h2hState.imageCacheKeys.shift();
        delete h2hState.imageCache[old];
    }
}

async function loadImage(id) {
    if (!id) return null;
    const key = 'wikidata_img_' + id;
    if (h2hState.imageCache[key]) return h2hState.imageCache[key];
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

// ===== LOAD MATCH DB (VERWENDET GLOBALE DB) =====
async function loadMatchDb(type) {
    if (window.getDatabase) {
        const db = window.getDatabase(type);
        if (db) {
            console.log(`✅ Match-DB aus globalem Cache (wiederverwendet)`);
            h2hState.matchDb = db;
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

        h2hState.matchDb = db;
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
    if (h2hState.cacheLoaded && h2hState.type === type) return h2hState.players;
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
        h2hState.players = players;
        h2hState.cacheLoaded = true;
        h2hState.type = type;
        console.log(`✅ ${players.length} Spieler (${type.toUpperCase()})`);
        return players;
    } catch (e) { console.error(e); return []; }
}

// ============================================================
// 🔥 GLOBALER CLICK-LISTENER (einmalig registriert!)
// ============================================================
document.addEventListener('click', function(e) {
    const r1 = document.getElementById('h2hResults1');
    const r2 = document.getElementById('h2hResults2');
    if (r1 && !e.target.closest('#h2hSearch1') && !e.target.closest('#h2hResults1')) {
        r1.style.display = 'none';
    }
    if (r2 && !e.target.closest('#h2hSearch2') && !e.target.closest('#h2hResults2')) {
        r2.style.display = 'none';
    }
});

// ===== RENDER H2H =====
function renderH2H() {
    const container = document.getElementById('pageContent');
    if (!container) return;
    const p1Name = h2hState.player1 ? h2hState.player1.name : 'Spieler 1';
    const p2Name = h2hState.player2 ? h2hState.player2.name : 'Spieler 2';
    container.innerHTML = `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;">
            <h2 style="color:#e0e6f0;font-size:20px;margin:0 0 8px 0;">⚔️ Head to Head</h2>
            <div style="display:flex;gap:10px;margin:16px 0;">
                <button id="h2hBtnAtp" class="toggle ${h2hState.type === 'atp' ? 'active' : ''}" style="padding:8px 24px;border-radius:8px;border:2px solid ${h2hState.type === 'atp' ? 'rgba(46,204,113,0.3)' : 'rgba(255,255,255,0.1)'};background:${h2hState.type === 'atp' ? 'rgba(46,204,113,0.15)' : 'transparent'};color:${h2hState.type === 'atp' ? '#2ecc71' : '#7a8aa3'};font-weight:600;cursor:pointer;">🎾 ATP</button>
                <button id="h2hBtnWta" class="toggle ${h2hState.type === 'wta' ? 'active' : ''}" style="padding:8px 24px;border-radius:8px;border:2px solid ${h2hState.type === 'wta' ? 'rgba(46,204,113,0.3)' : 'rgba(255,255,255,0.1)'};background:${h2hState.type === 'wta' ? 'rgba(46,204,113,0.15)' : 'transparent'};color:${h2hState.type === 'wta' ? '#2ecc71' : '#7a8aa3'};font-weight:600;cursor:pointer;">👑 WTA</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;">
                    <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;margin-bottom:8px;">Spieler 1</div>
                    <div style="position:relative;">
                        <input type="text" id="h2hSearch1" placeholder="🔍 Spieler suchen..." value="${h2hState.searchTerm1 || ''}" style="width:100%;padding:10px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:#141b2b;color:#e0e6f0;font-size:14px;outline:none;">
                        <div id="h2hResults1" style="position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#141b2b;border:1px solid rgba(255,255,255,0.1);border-radius:8px;max-height:200px;overflow-y:auto;z-index:100;display:none;"></div>
                    </div>
                    <div id="h2hSelected1" style="margin-top:8px;padding:8px 12px;background:rgba(46,204,113,0.05);border:1px solid rgba(46,204,113,0.15);border-radius:6px;${h2hState.player1 ? '' : 'display:none;'}">
                        <span style="color:#f1c40f;font-weight:600;">${p1Name}</span>
                        <button onclick="clearPlayer1()" style="float:right;padding:2px 10px;border-radius:4px;border:1px solid rgba(231,76,60,0.3);background:rgba(231,76,60,0.1);color:#e74c3c;cursor:pointer;font-size:11px;">✕</button>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;">
                    <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;margin-bottom:8px;">Spieler 2</div>
                    <div style="position:relative;">
                        <input type="text" id="h2hSearch2" placeholder="🔍 Spieler suchen..." value="${h2hState.searchTerm2 || ''}" style="width:100%;padding:10px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:#141b2b;color:#e0e6f0;font-size:14px;outline:none;">
                        <div id="h2hResults2" style="position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#141b2b;border:1px solid rgba(255,255,255,0.1);border-radius:8px;max-height:200px;overflow-y:auto;z-index:100;display:none;"></div>
                    </div>
                    <div id="h2hSelected2" style="margin-top:8px;padding:8px 12px;background:rgba(46,204,113,0.05);border:1px solid rgba(46,204,113,0.15);border-radius:6px;${h2hState.player2 ? '' : 'display:none;'}">
                        <span style="color:#f1c40f;font-weight:600;">${p2Name}</span>
                        <button onclick="clearPlayer2()" style="float:right;padding:2px 10px;border-radius:4px;border:1px solid rgba(231,76,60,0.3);background:rgba(231,76,60,0.1);color:#e74c3c;cursor:pointer;font-size:11px;">✕</button>
                    </div>
                </div>
            </div>
            <div id="h2hStats" style="margin-top:20px;${h2hState.player1 && h2hState.player2 ? '' : 'display:none;'}">
                <div style="text-align:center;color:#4a5a77;padding:40px 0;font-size:16px;">
                    ⏳ Wähle zwei Spieler aus, um die Head-to-Head Statistik zu sehen.
                </div>
            </div>
        </div>
    `;
    document.getElementById('h2hBtnAtp').onclick = () => switchH2HType('atp');
    document.getElementById('h2hBtnWta').onclick = () => switchH2HType('wta');
    const search1 = document.getElementById('h2hSearch1');
    const search2 = document.getElementById('h2hSearch2');
    const results1 = document.getElementById('h2hResults1');
    const results2 = document.getElementById('h2hResults2');
    search1.oninput = function() {
        h2hState.searchTerm1 = this.value;
        if (this.value.length >= 2) doH2HSearch(1, this.value);
        else { results1.style.display = 'none'; results1.innerHTML = ''; }
    };
    search1.onfocus = function() {
        if (h2hState.searchTerm1 && h2hState.searchTerm1.length >= 2) {
            doH2HSearch(1, h2hState.searchTerm1);
        }
    };
    search2.oninput = function() {
        h2hState.searchTerm2 = this.value;
        if (this.value.length >= 2) doH2HSearch(2, this.value);
        else { results2.style.display = 'none'; results2.innerHTML = ''; }
    };
    search2.onfocus = function() {
        if (h2hState.searchTerm2 && h2hState.searchTerm2.length >= 2) {
            doH2HSearch(2, h2hState.searchTerm2);
        }
    };
}

// ===== H2H SEARCH =====
let h2hSearchTimeout = { 1: null, 2: null };

async function doH2HSearch(player, term) {
    if (h2hSearchTimeout[player]) {
        clearTimeout(h2hSearchTimeout[player]);
        h2hSearchTimeout[player] = null;
    }
    h2hSearchTimeout[player] = setTimeout(async function() {
        const players = await loadPlayers(h2hState.type);
        if (!players.length) return;
        const found = players.filter(p => p.search.includes(term.toLowerCase())).slice(0, 8);
        const resultsId = player === 1 ? 'h2hResults1' : 'h2hResults2';
        const container = document.getElementById(resultsId);
        if (!found.length) {
            container.innerHTML = `<div style="padding:8px 12px;color:#7a8aa3;font-size:13px;">😕 Keine Spieler gefunden.</div>`;
            container.style.display = 'block';
            return;
        }
        let html = '';
        const tasks = [];
        for (const p of found) {
            const imgId = 'h2h_img_' + p.player_id;
            // 🔥 data-Attribute statt inline onclick (robuster!)
            const escapedName = p.name.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            html += `<div class="h2h-result-item" data-player="${player}" data-name="${escapedName}" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;cursor:pointer;transition:0.15s;border-bottom:1px solid rgba(255,255,255,0.03);" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div id="${imgId}" style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#1a472a,#2d5a3d);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;color:#fff;flex-shrink:0;">${p.name.split(' ').map(w=>w[0]).join('').substring(0,2)}</div>
                    <span style="color:#e0e6f0;font-size:13px;">${p.name}</span>
                </div>
            </div>`;
            if (p.wikidata_id) tasks.push({ id: imgId, wid: p.wikidata_id });
        }
        container.innerHTML = html;
        container.style.display = 'block';

        // 🔥 Click-Handler per JS (zuverlässig!)
        container.querySelectorAll('.h2h-result-item').forEach(function(item) {
            item.addEventListener('click', function(e) {
                e.stopPropagation();
                const playerNum = parseInt(this.dataset.player);
                const name = this.dataset.name;
                console.log('🎯 Klick auf H2H-Spieler:', playerNum, name);
                if (typeof window.selectH2HPlayer === 'function') {
                    window.selectH2HPlayer(playerNum, name);
                } else {
                    console.error('❌ selectH2HPlayer nicht gefunden!');
                }
            });
        });

        for (const t of tasks) {
            const url = await loadImage(t.wid);
            if (url) {
                const el = document.getElementById(t.id);
                if (el) el.innerHTML = `<img src="${url}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.1);" onerror="this.style.display='none'">`;
            }
        }
        h2hSearchTimeout[player] = null;
    }, 150);
}

// ===== SELECT H2H PLAYER =====
window.selectH2HPlayer = function(player, name) {
    const players = h2hState.players;
    const found = players.find(p => p.name === name);
    if (!found) return;
    if (player === 1) {
        if (h2hState.player2 && h2hState.player2.name === name) {
            alert('⚠️ Bitte wähle zwei verschiedene Spieler!');
            return;
        }
        h2hState.player1 = found;
        h2hState.searchTerm1 = '';
        document.getElementById('h2hSearch1').value = '';
        document.getElementById('h2hResults1').style.display = 'none';
        document.getElementById('h2hSelected1').style.display = 'block';
        document.getElementById('h2hSelected1').querySelector('span').textContent = found.name;
    } else {
        if (h2hState.player1 && h2hState.player1.name === name) {
            alert('⚠️ Bitte wähle zwei verschiedene Spieler!');
            return;
        }
        h2hState.player2 = found;
        h2hState.searchTerm2 = '';
        document.getElementById('h2hSearch2').value = '';
        document.getElementById('h2hResults2').style.display = 'none';
        document.getElementById('h2hSelected2').style.display = 'block';
        document.getElementById('h2hSelected2').querySelector('span').textContent = found.name;
    }
    if (h2hState.player1 && h2hState.player2) {
        loadH2HStats();
    }
};

// ===== CLEAR H2H PLAYER =====
window.clearPlayer1 = function() {
    h2hState.player1 = null;
    h2hState.searchTerm1 = '';
    document.getElementById('h2hSearch1').value = '';
    document.getElementById('h2hSelected1').style.display = 'none';
    document.getElementById('h2hStats').style.display = 'none';
    document.getElementById('h2hStats').innerHTML = '';
};

window.clearPlayer2 = function() {
    h2hState.player2 = null;
    h2hState.searchTerm2 = '';
    document.getElementById('h2hSearch2').value = '';
    document.getElementById('h2hSelected2').style.display = 'none';
    document.getElementById('h2hStats').style.display = 'none';
    document.getElementById('h2hStats').innerHTML = '';
};

async function switchH2HType(type) {
    h2hState.type = type;
    h2hState.player1 = null;
    h2hState.player2 = null;
    h2hState.searchTerm1 = '';
    h2hState.searchTerm2 = '';
    h2hState.cacheLoaded = false;
    h2hState.players = [];
    h2hState.matchDb = null;

    // 🔥 FIX: Spieler LADEN und SPEICHERN!
    const players = await loadPlayers(type);
    h2hState.players = players;
    console.log(`✅ ${players.length} Spieler in h2hState gespeichert (${type.toUpperCase()})`);

    renderH2H();
}

// ============================================================
// 🔥 CONFIDENCE-BERECHNUNG (KONSISTENT MIT match_predictor.js)
// ============================================================
function calculateConfidence(p1HasElo, p2HasElo, elos1, elos2, h2h, eloDiff) {
    const p1Matches = elos1?.matches || 0;
    const p2Matches = elos2?.matches || 0;
    const minMatches = Math.min(p1Matches, p2Matches);
    const h2hMatches = h2h?.total || 0;

    let confidence = 3;
    let label = 'Gering';
    let reason = '';

    if (p1HasElo && p2HasElo) {
        if (h2hMatches >= 5) {
            if (minMatches >= 100 && eloDiff >= 100) {
                confidence = 10; label = 'Sehr hoch';
                reason = `Beide ELO + ${h2hMatches} direkte Duelle, ≥100 Matches`;
            } else if (minMatches >= 60 && eloDiff >= 50) {
                confidence = 9; label = 'Hoch';
                reason = `Beide ELO + ${h2hMatches} direkte Duelle`;
            } else if (minMatches >= 30) {
                confidence = 8; label = 'Hoch';
                reason = `Beide ELO + ${h2hMatches} direkte Duelle`;
            } else {
                confidence = 7; label = 'Mittel-Hoch';
                reason = `Beide ELO + ${h2hMatches} direkte Duelle (wenig Daten)`;
            }
        }
        else if (h2hMatches >= 1) {
            if (minMatches >= 100 && eloDiff >= 100) {
                confidence = 8; label = 'Hoch';
                reason = `Beide ELO + ${h2hMatches} direkte Duelle, ≥100 Matches`;
            } else if (minMatches >= 50) {
                confidence = 7; label = 'Mittel-Hoch';
                reason = `Beide ELO + ${h2hMatches} direkte Duelle`;
            } else {
                confidence = 6; label = 'Mittel';
                reason = `Beide ELO + ${h2hMatches} direktes Duell`;
            }
        }
        else {
            if (minMatches >= 100 && eloDiff >= 100) {
                confidence = 7; label = 'Mittel-Hoch';
                reason = 'Beide ELO, viele Matches, aber nie gegeneinander';
            } else if (minMatches >= 50) {
                confidence = 6; label = 'Mittel';
                reason = 'Beide ELO, aber nie gegeneinander';
            } else if (minMatches >= 20) {
                confidence = 5; label = 'Mittel';
                reason = 'Beide ELO, wenige Matches, kein H2H';
            } else {
                confidence = 4; label = 'Gering';
                reason = 'Beide ELO, aber kaum Matchdaten';
            }
        }
    }
    else if (p1HasElo || p2HasElo) {
        confidence = 3;
        label = 'Gering';
        const who = p1HasElo ? 'Spieler 2' : 'Spieler 1';
        reason = `${who} ohne ELO in DB – eingeschränkte Datenlage`;
    }
    else {
        confidence = 2;
        label = 'Sehr gering';
        reason = 'Beide Spieler ohne ELO in DB';
    }

    return { confidence, label, reason };
}

// ============================================================
// 🔥 HILFSFUNKTION: Belag-Label
// ============================================================
function getSurfaceLabel(surface) {
    if (surface === 'all') return 'allen Belägen';
    const map = { 'Hard': 'Hartplatz', 'Clay': 'Sand', 'Grass': 'Rasen', 'Carpet': 'Teppich' };
    return map[surface] || surface;
}

// ===== PREDICTION (VORHERSAGE) =====
function renderPrediction(p1, p2, matches, surface) {
    if (!matches || matches.length === 0) {
        return `
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;text-align:center;color:#4a5a77;">
                ⚖️ Keine ausreichenden Daten für eine Vorhersage.
            </div>
        `;
    }

    const total = matches.length;
    const p1Wins = matches.filter(m => m.winner_name === p1).length;
    const p2Wins = matches.filter(m => m.winner_name === p2).length;
    const p1Rate = total > 0 ? Math.round((p1Wins / total) * 100) : 0;
    const p2Rate = total > 0 ? Math.round((p2Wins / total) * 100) : 0;

    const isAllSurface = surface === 'all';
    const surfaceMatches = isAllSurface ? matches : matches.filter(m => m.surface === surface);
    const surfTotal = surfaceMatches.length;
    const surfP1Wins = surfaceMatches.filter(m => m.winner_name === p1).length;
    const surfP2Wins = surfaceMatches.filter(m => m.winner_name === p2).length;
    const surfP1Rate = surfTotal > 0 ? Math.round((surfP1Wins / surfTotal) * 100) : 50;
    const surfP2Rate = surfTotal > 0 ? Math.round((surfP2Wins / surfTotal) * 100) : 50;

    const last5 = matches.slice(0, 5);
    const last5P1 = last5.filter(m => m.winner_name === p1).length;
    const last5P2 = last5.filter(m => m.winner_name === p2).length;

    let p1Score = 50, p2Score = 50;
    let reasons = [];
    let hasData = false;

    if (p1Rate > p2Rate) {
        const diff = Math.min(15, Math.round((p1Rate - p2Rate) / 3));
        p1Score += diff;
        p2Score -= diff;
        reasons.push(`📊 ${p1} führt im direkten Vergleich mit ${p1Rate}% (${p1Wins}-${p2Wins})`);
        hasData = true;
    } else if (p2Rate > p1Rate) {
        const diff = Math.min(15, Math.round((p2Rate - p1Rate) / 3));
        p2Score += diff;
        p1Score -= diff;
        reasons.push(`📊 ${p2} führt im direkten Vergleich mit ${p2Rate}% (${p2Wins}-${p1Wins})`);
        hasData = true;
    } else {
        reasons.push(`⚖️ Direkter Vergleich ist ausgeglichen (${p1Wins}-${p2Wins})`);
    }

    const surfaceLabel = getSurfaceLabel(surface);
    if (isAllSurface) {
        // Skip
    } else if (surfTotal >= 3) {
        if (surfP1Rate > surfP2Rate) {
            const diff = Math.min(12, Math.round((surfP1Rate - surfP2Rate) / 4));
            p1Score += diff;
            p2Score -= diff;
            reasons.push(`🏟️ ${p1} ist stärker auf ${surfaceLabel} (${surfP1Rate}% Siegquote, ${surfTotal} Matches)`);
            hasData = true;
        } else if (surfP2Rate > surfP1Rate) {
            const diff = Math.min(12, Math.round((surfP2Rate - surfP1Rate) / 4));
            p2Score += diff;
            p1Score -= diff;
            reasons.push(`🏟️ ${p2} ist stärker auf ${surfaceLabel} (${surfP2Rate}% Siegquote, ${surfTotal} Matches)`);
            hasData = true;
        } else {
            reasons.push(`🏟️ Beide sind gleich stark auf ${surfaceLabel} (${surfTotal} Matches)`);
        }
    } else {
        reasons.push(`🏟️ Zu wenige Daten auf ${surfaceLabel} (${surfTotal} Matches) – neutral bewertet`);
    }

    if (last5.length >= 3) {
        if (last5P1 > last5P2) {
            const diff = Math.min(10, Math.round((last5P1 - last5P2) * 2.5));
            p1Score += diff;
            p2Score -= diff;
            reasons.push(`📈 ${p1} gewann ${last5P1} der letzten ${last5.length} Begegnungen (${Math.round((last5P1/last5.length)*100)}%)`);
            hasData = true;
        } else if (last5P2 > last5P1) {
            const diff = Math.min(10, Math.round((last5P2 - last5P1) * 2.5));
            p2Score += diff;
            p1Score -= diff;
            reasons.push(`📈 ${p2} gewann ${last5P2} der letzten ${last5.length} Begegnungen (${Math.round((last5P2/last5.length)*100)}%)`);
            hasData = true;
        } else {
            reasons.push(`📈 Letzte ${last5.length} Begegnungen sind ausgeglichen (${last5P1}-${last5P2})`);
        }
    } else {
        reasons.push(`📈 Zu wenige aktuelle Daten (${last5.length} Matches) – neutral bewertet`);
    }

    const totalDiff = Math.abs(p1Wins - p2Wins);
    if (totalDiff >= 5) {
        const diff = Math.min(8, Math.round(totalDiff / 2));
        if (p1Wins > p2Wins) {
            p1Score += diff;
            p2Score -= diff;
            reasons.push(`🏆 ${p1} hat insgesamt mehr Siege (${p1Wins}-${p2Wins})`);
            hasData = true;
        } else {
            p2Score += diff;
            p1Score -= diff;
            reasons.push(`🏆 ${p2} hat insgesamt mehr Siege (${p2Wins}-${p1Wins})`);
            hasData = true;
        }
    } else {
        reasons.push(`🏆 Gesamtbilanz ist nahezu ausgeglichen (${p1Wins}-${p2Wins})`);
    }

    p1Score = Math.max(5, Math.min(95, Math.round(p1Score)));
    p2Score = Math.max(5, Math.min(95, Math.round(p2Score)));

    if (!hasData && total < 3) {
        return `
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;text-align:center;color:#4a5a77;">
                ⚖️ Zu wenige Daten für eine aussagekräftige Vorhersage (${total} Matches).
            </div>
        `;
    }

    const winner = p1Score > p2Score ? p1 : (p2Score > p1Score ? p2 : 'Unentschieden');
    const winnerColor = p1Score > p2Score ? '#2ecc71' : (p2Score > p1Score ? '#e74c3c' : '#f1c40f');
    const winnerEmoji = p1Score > p2Score ? '🏆' : (p2Score > p1Score ? '🏆' : '⚖️');

    const confidenceData = calculateConfidence(
        true, true,
        { matches: 0 }, { matches: 0 },
        { total: total },
        0
    );
    let confidence = confidenceData.confidence;
    let confidenceLabel = confidenceData.label;
    let confidenceReason = confidenceData.reason;

    if (total >= 20) {
        confidence = 10; confidenceLabel = 'Sehr hoch';
        confidenceReason = `${total} direkte Duelle – sehr aussagekräftig`;
    } else if (total >= 10) {
        confidence = 9; confidenceLabel = 'Hoch';
        confidenceReason = `${total} direkte Duelle`;
    } else if (total >= 5) {
        confidence = 8; confidenceLabel = 'Hoch';
        confidenceReason = `${total} direkte Duelle`;
    } else if (total >= 3) {
        confidence = 7; confidenceLabel = 'Mittel-Hoch';
        confidenceReason = `${total} direkte Duelle`;
    } else if (total >= 1) {
        confidence = 6; confidenceLabel = 'Mittel';
        confidenceReason = `${total} direktes Duell`;
    }

    let confidenceColor = '#f1c40f';
    if (confidence >= 8) confidenceColor = '#2ecc71';
    else if (confidence >= 6) confidenceColor = '#f1c40f';
    else if (confidence >= 4) confidenceColor = '#e67e22';
    else confidenceColor = '#e74c3c';

    return `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;">🔮 Vorhersage</div>
                <div style="text-align:right;">
                    <div style="font-size:13px;color:${confidenceColor};">Vertrauen: ${confidence}/10 (${confidenceLabel})</div>
                    ${confidenceReason ? `<div style="font-size:11px;color:#7a8aa3;margin-top:2px;">${confidenceReason}</div>` : ''}
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:center;margin-bottom:12px;">
                <div style="text-align:right;">
                    <div style="color:#e0e6f0;font-size:14px;font-weight:600;">${p1}</div>
                    <div style="color:#2ecc71;font-size:24px;font-weight:700;">${p1Score}%</div>
                </div>
                <div style="color:#4a5a77;font-size:14px;font-weight:600;">vs</div>
                <div>
                    <div style="color:#e0e6f0;font-size:14px;font-weight:600;">${p2}</div>
                    <div style="color:#e74c3c;font-size:24px;font-weight:700;">${p2Score}%</div>
                </div>
            </div>
            <div style="width:100%;height:8px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;margin-bottom:12px;">
                <div style="width:${p1Score}%;height:100%;background:linear-gradient(90deg,#2ecc71,#f1c40f);border-radius:4px;"></div>
            </div>
            <div style="text-align:center;color:${winnerColor};font-size:18px;font-weight:700;margin-bottom:8px;">
                ${winnerEmoji} ${winner} wird gewinnen
            </div>
            <div style="font-size:12px;color:#7a8aa3;text-align:center;margin-bottom:8px;">
                Basierend auf ${total} direkten Duellen
            </div>
            <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:10px;margin-top:4px;">
                <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;margin-bottom:6px;">Begründung</div>
                ${reasons.map(r => `<div style="color:#c0d0e0;font-size:11px;padding:2px 0;">${r}</div>`).join('')}
            </div>
        </div>
    `;
}

// ============================================================
// ELO-FUNKTIONEN
// ============================================================

async function loadEloForPlayer(playerName, surface = 'Rolling_Gesamt') {
    try {
        const response = await fetch(`${API_URL}/api/elo?name=${encodeURIComponent(playerName)}&surface=${surface}`);
        if (!response.ok) {
            console.warn(`⚠️ Keine ELO für ${playerName} (${response.status})`);
            return null;
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('❌ Fehler beim Laden der ELO:', error);
        return null;
    }
}

async function loadEloComparison(p1, p2) {
    try {
        const [elos1, elos2] = await Promise.all([
            loadEloForPlayer(p1, 'Rolling_Gesamt'),
            loadEloForPlayer(p2, 'Rolling_Gesamt')
        ]);
        return { elos1, elos2 };
    } catch (error) {
        console.error('❌ Fehler beim ELO-Vergleich:', error);
        return null;
    }
}

function renderEloComparison(p1, p2, elos1, elos2) {
    const has1 = elos1 && elos1.elo !== null && elos1.elo !== undefined;
    const has2 = elos2 && elos2.elo !== null && elos2.elo !== undefined;

    if (!has1 || !has2) {
        const missing = [];
        if (!has1) missing.push(p1);
        if (!has2) missing.push(p2);
        return `
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-bottom:16px;">
                <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;margin-bottom:8px;">🎯 ELO Vergleich</div>
                <div style="color:#7a8aa3;font-size:13px;">ℹ️ Keine ELO-Daten für ${missing.join(' & ')} – Vergleich nicht möglich.</div>
            </div>
        `;
    }

    const elo1 = elos1.elo;
    const elo2 = elos2.elo;
    const diff = elo1 - elo2;
    const p1Percent = Math.round(1 / (1 + Math.pow(10, (elo2 - elo1) / 400)) * 100);
    const p2Percent = 100 - p1Percent;

    let diffEmoji = '⚖️', diffColor = '#7a8aa3', diffText = 'Ausgeglichen';
    if (diff > 100) { diffEmoji = '🔥'; diffColor = '#2ecc71'; diffText = `${p1} deutlich stärker`; }
    else if (diff > 50) { diffEmoji = '💪'; diffColor = '#f1c40f'; diffText = `${p1} stärker`; }
    else if (diff < -100) { diffEmoji = '🔥'; diffColor = '#e74c3c'; diffText = `${p2} deutlich stärker`; }
    else if (diff < -50) { diffEmoji = '💪'; diffColor = '#e74c3c'; diffText = `${p2} stärker`; }

    const matches1 = elos1.matches_played || 0;
    const matches2 = elos2.matches_played || 0;

    return `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;">🎯 ELO Vergleich</div>
                <span style="color:${diffColor};font-size:12px;font-weight:600;">${diffEmoji} ${diffText}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:center;margin-bottom:12px;">
                <div style="text-align:right;">
                    <div style="color:#e0e6f0;font-size:14px;font-weight:600;">${p1}</div>
                    <div style="color:${elo1 > elo2 ? '#2ecc71' : '#7a8aa3'};font-size:22px;font-weight:700;">${elo1}</div>
                    <div style="color:#7a8aa3;font-size:10px;">${matches1} M</div>
                </div>
                <div style="color:#4a5a77;font-size:14px;font-weight:600;">${diff > 0 ? '+' : ''}${diff}</div>
                <div>
                    <div style="color:#e0e6f0;font-size:14px;font-weight:600;">${p2}</div>
                    <div style="color:${elo2 > elo1 ? '#e74c3c' : '#7a8aa3'};font-size:22px;font-weight:700;">${elo2}</div>
                    <div style="color:#7a8aa3;font-size:10px;">${matches2} M</div>
                </div>
            </div>
            <div style="width:100%;height:6px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;margin-bottom:12px;">
                <div style="width:${p1Percent}%;height:100%;background:linear-gradient(90deg,#2ecc71,#f1c40f);border-radius:4px;"></div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center;">
                <div style="background:rgba(46,204,113,0.05);border-radius:6px;padding:4px;">
                    <span style="color:#2ecc71;font-size:14px;font-weight:700;">${p1Percent}%</span>
                </div>
                <div style="background:rgba(231,76,60,0.05);border-radius:6px;padding:4px;">
                    <span style="color:#e74c3c;font-size:14px;font-weight:700;">${p2Percent}%</span>
                </div>
            </div>
        </div>
    `;
}

// ===== LOAD H2H STATS (ERWEITERT MIT ELO) =====
async function loadH2HStats() {
    const container = document.getElementById('h2hStats');
    if (!container) return;
    if (!h2hState.player1 || !h2hState.player2) return;
    container.style.display = 'block';
    container.innerHTML = `<div style="text-align:center;color:#7a8aa3;padding:20px 0;">⏳ Lade Head-to-Head Daten...</div>`;
    try {
        const db = await loadMatchDb(h2hState.type);
        if (!db) {
            container.innerHTML = `<div style="text-align:center;color:#e74c3c;padding:20px 0;">❌ Datenbank konnte nicht geladen werden.</div>`;
            return;
        }
        const p1 = h2hState.player1.name;
        const p2 = h2hState.player2.name;

        const eloData = await loadEloComparison(p1, p2);
        const eloHtml = renderEloComparison(p1, p2, eloData?.elos1, eloData?.elos2);

        const stmt = db.prepare(`
            SELECT * FROM matches
            WHERE (winner_name = ? AND loser_name = ?)
               OR (winner_name = ? AND loser_name = ?)
            ORDER BY tourney_date DESC
        `);
        stmt.bind([p1, p2, p2, p1]);
        const matches = [];
        while (stmt.step()) matches.push(stmt.getAsObject());
        stmt.free();

        if (!matches.length) {
            container.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:16px;margin-top:16px;">
                    ${eloHtml}
                    <div style="text-align:center;color:#7a8aa3;padding:30px 0;">
                        <div style="font-size:48px;margin-bottom:12px;">🤝</div>
                        <div style="font-size:16px;">Keine direkten Begegnungen gefunden.</div>
                        <div style="font-size:13px;color:#4a5a77;margin-top:4px;">${p1} und ${p2} haben noch nie gegeneinander gespielt.</div>
                    </div>
                </div>
            `;
            return;
        }

        const total = matches.length;
        const p1Wins = matches.filter(m => m.winner_name === p1).length;
        const p2Wins = matches.filter(m => m.winner_name === p2).length;
        const p1Rate = total > 0 ? Math.round((p1Wins / total) * 100) : 0;
        const p2Rate = total > 0 ? Math.round((p2Wins / total) * 100) : 0;

        const surfaceStats = {};
        const surfEmoji = { 'Hard': '🏟️', 'Clay': '🧱', 'Grass': '🌿', 'Carpet': '🟫' };
        for (const m of matches) {
            const s = m.surface || 'Unbekannt';
            if (!surfaceStats[s]) surfaceStats[s] = { total: 0, p1Wins: 0, p2Wins: 0 };
            surfaceStats[s].total++;
            if (m.winner_name === p1) surfaceStats[s].p1Wins++;
            else surfaceStats[s].p2Wins++;
        }
        let surfaceRows = '';
        for (const s of Object.keys(surfaceStats).sort((a,b) => surfaceStats[b].total - surfaceStats[a].total)) {
            const d = surfaceStats[s];
            const rate = d.total > 0 ? Math.round((d.p1Wins / d.total) * 100) : 0;
            surfaceRows += `
                <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);">
                    <span style="color:#c0d0e0;font-size:13px;">${surfEmoji[s] || '🎾'} ${s}</span>
                    <span style="color:#e0e6f0;font-size:13px;">${d.p1Wins}-${d.p2Wins}</span>
                    <span style="color:#f1c40f;font-size:13px;font-weight:600;">${rate}%</span>
                </div>
            `;
        }

        const H2H_LAST = 10;
        const last = matches.slice(0, H2H_LAST);
        let lastRows = '', lastP1 = 0, lastP2 = 0;
        for (const m of last) {
            const isP1 = m.winner_name === p1;
            if (isP1) lastP1++; else lastP2++;
            const d = m.tourney_date ? String(m.tourney_date) : '';
            const ds = d.length === 8 ? `${d.substring(6,8)}.${d.substring(4,6)}.${d.substring(0,4)}` : d;
            const surf = m.surface || '—';
            lastRows += `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);">
                    <span style="color:#7a8aa3;font-size:11px;width:80px;">${ds}</span>
                    <span style="color:#c0d0e0;font-size:12px;flex:1;padding:0 8px;">${m.tourney_name || '-'}</span>
                    <span style="color:#7a8aa3;font-size:11px;width:60px;">${surfEmoji[surf] || '🎾'} ${surf}</span>
                    <span style="color:${isP1 ? '#2ecc71' : '#e74c3c'};font-weight:600;font-size:12px;width:80px;text-align:right;">${isP1 ? '✅' : '❌'} ${m.score || '-'}</span>
                </div>
            `;
        }
        const winner = lastP1 > lastP2 ? p1 : (lastP2 > lastP1 ? p2 : 'Unentschieden');
        const wColor = lastP1 > lastP2 ? '#2ecc71' : (lastP2 > lastP1 ? '#e74c3c' : '#f1c40f');
        const lastSummary = last.length ? `
            <div style="text-align:center;color:#4a5a77;font-size:12px;margin-top:8px;">
                ${lastP1}-${lastP2} für <span style="color:${wColor};font-weight:600;">${winner}</span>
            </div>
        ` : '';

        const cats = {
            'Grand Slam': { kw: ['australian open', 'french open', 'roland garros', 'wimbledon', 'us open'], m: [], p1: 0, p2: 0 },
            'Masters 1000': { kw: ['indian wells', 'miami', 'monte carlo', 'madrid', 'rome', 'canada', 'cincinnati', 'shanghai', 'paris'], m: [], p1: 0, p2: 0 },
            'ATP Finals': { kw: ['atp finals', 'tour finals', 'world tour finals'], m: [], p1: 0, p2: 0 },
            'ATP 500': { kw: ['500'], m: [], p1: 0, p2: 0 },
            'ATP 250': { kw: ['250'], m: [], p1: 0, p2: 0 }
        };
        for (const m of matches) {
            const name = (m.tourney_name || '').toLowerCase();
            let assigned = false;
            for (const [cat, data] of Object.entries(cats)) {
                if (data.kw.some(k => name.includes(k))) {
                    data.m.push(m);
                    if (m.winner_name === p1) data.p1++; else data.p2++;
                    assigned = true; break;
                }
            }
            if (!assigned) {
                if (!cats['Sonstige']) cats['Sonstige'] = { kw: [], m: [], p1: 0, p2: 0 };
                cats['Sonstige'].m.push(m);
                if (m.winner_name === p1) cats['Sonstige'].p1++; else cats['Sonstige'].p2++;
            }
        }
        let catRows = '';
        const catEmoji = { 'Grand Slam': '🏆', 'Masters 1000': '🥇', 'ATP Finals': '🏅', 'ATP 500': '⭐', 'ATP 250': '💫' };
        for (const [cat, data] of Object.entries(cats)) {
            const totalCat = data.m.length;
            if (!totalCat) continue;
            const rate = Math.round((data.p1 / totalCat) * 100);
            catRows += `
                <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);">
                    <span style="color:#c0d0e0;font-size:13px;">${catEmoji[cat] || '🎾'} ${cat}</span>
                    <span style="color:#e0e6f0;font-size:13px;">${data.p1}-${data.p2}</span>
                    <span style="color:#f1c40f;font-size:13px;font-weight:600;">${rate}%</span>
                </div>
            `;
        }

        let tSetsP1 = 0, tSetsP2 = 0, m3 = 0, m5 = 0, p1m3 = 0, p2m3 = 0, p1m5 = 0, p2m5 = 0, tbP1 = 0, tbP2 = 0;
        for (const m of matches) {
            const sets = (m.score || '').split(' ');
            let ps = 0, os = 0;
            for (const set of sets) {
                const p = set.split('-');
                if (p.length === 2) {
                    const a = parseInt(p[0]), b = parseInt(p[1]);
                    if (!isNaN(a) && !isNaN(b)) {
                        if (m.winner_name === p1) { ps += (a > b) ? 1 : 0; os += (b > a) ? 1 : 0; }
                        else { ps += (b > a) ? 1 : 0; os += (a > b) ? 1 : 0; }
                        if (set.includes('7-6') || set.includes('6-7')) {
                            if (m.winner_name === p1) tbP1++; else tbP2++;
                        }
                    }
                }
            }
            tSetsP1 += ps; tSetsP2 += os;
            const totalSets = ps + os;
            if (totalSets === 3) { m3++; if (m.winner_name === p1) p1m3++; else p2m3++; }
            else if (totalSets === 5) { m5++; if (m.winner_name === p1) p1m5++; else p2m5++; }
        }
        const setRate = (tSetsP1 + tSetsP2) > 0 ? Math.round((tSetsP1 / (tSetsP1 + tSetsP2)) * 100) : 0;
        const rate3 = m3 > 0 ? Math.round((p1m3 / m3) * 100) : 0;
        const rate5 = m5 > 0 ? Math.round((p1m5 / m5) * 100) : 0;
        const tbRate = (tbP1 + tbP2) > 0 ? Math.round((tbP1 / (tbP1 + tbP2)) * 100) : 0;

        const yearStats = {};
        for (const m of matches) {
            const d = m.tourney_date ? String(m.tourney_date) : '';
            const year = d.length >= 4 ? d.substring(0,4) : 'Unbekannt';
            if (!yearStats[year]) yearStats[year] = { total: 0, p1Wins: 0, p2Wins: 0 };
            yearStats[year].total++;
            if (m.winner_name === p1) yearStats[year].p1Wins++;
            else yearStats[year].p2Wins++;
        }
        let yearRows = '';
        for (const year of Object.keys(yearStats).sort((a,b) => {
            if (a === 'Unbekannt') return 1;
            if (b === 'Unbekannt') return -1;
            return parseInt(b) - parseInt(a);
        })) {
            const d = yearStats[year];
            const rate = d.total > 0 ? Math.round((d.p1Wins / d.total) * 100) : 0;
            yearRows += `
                <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03);">
                    <span style="color:#c0d0e0;font-size:13px;">📅 ${year}</span>
                    <span style="color:#e0e6f0;font-size:13px;">${d.p1Wins}-${d.p2Wins}</span>
                    <span style="color:#f1c40f;font-size:13px;font-weight:600;">${rate}%</span>
                </div>
            `;
        }

        let tbMatches = [];
        for (const m of matches) {
            const sets = (m.score || '').split(' ');
            for (const set of sets) {
                if (set.includes('7-6') || set.includes('6-7')) {
                    const isP1 = m.winner_name === p1;
                    const tbWinner = set.includes('7-6') ? (isP1 ? p1 : p2) : (isP1 ? p2 : p1);
                    tbMatches.push({
                        date: m.tourney_date,
                        tourney: m.tourney_name || '-',
                        surface: m.surface || '-',
                        setScore: set,
                        p1Won: tbWinner === p1
                    });
                }
            }
        }
        const tbP1Wins = tbMatches.filter(t => t.p1Won).length;
        const tbP2Wins = tbMatches.length - tbP1Wins;
        const tbOverallRate = tbMatches.length > 0 ? Math.round((tbP1Wins / tbMatches.length) * 100) : 0;
        let tbDetailRows = '';
        const lastTB = tbMatches.slice(-10).reverse();
        for (const tb of lastTB) {
            const d = tb.date ? String(tb.date) : '';
            const ds = d.length === 8 ? `${d.substring(6,8)}.${d.substring(4,6)}.${d.substring(0,4)}` : d;
            tbDetailRows += `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.03);">
                    <span style="color:#7a8aa3;font-size:10px;width:70px;">${ds}</span>
                    <span style="color:#c0d0e0;font-size:11px;flex:1;padding:0 6px;">${tb.tourney}</span>
                    <span style="color:#7a8aa3;font-size:10px;width:50px;">${surfEmoji[tb.surface] || '🎾'}</span>
                    <span style="color:${tb.p1Won ? '#2ecc71' : '#e74c3c'};font-weight:600;font-size:11px;width:60px;text-align:right;">${tb.p1Won ? '✅' : '❌'} ${tb.setScore}</span>
                </div>
            `;
        }

        container.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:16px;margin-top:16px;">
                ${eloHtml}

                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;">
                    <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;margin-bottom:12px;">📊 Gesamtbilanz</div>
                    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:center;">
                        <div style="text-align:right;">
                            <div style="color:#e0e6f0;font-size:16px;font-weight:600;">${p1}</div>
                            <div style="color:#2ecc71;font-size:28px;font-weight:700;">${p1Wins}</div>
                            <div style="color:#7a8aa3;font-size:12px;">${p1Rate}%</div>
                        </div>
                        <div style="color:#4a5a77;font-size:14px;font-weight:600;">vs</div>
                        <div>
                            <div style="color:#e0e6f0;font-size:16px;font-weight:600;">${p2}</div>
                            <div style="color:#e74c3c;font-size:28px;font-weight:700;">${p2Wins}</div>
                            <div style="color:#7a8aa3;font-size:12px;">${p2Rate}%</div>
                        </div>
                    </div>
                    <div style="text-align:center;color:#4a5a77;font-size:12px;margin-top:8px;">${total} Matches</div>
                </div>

                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;">🔮 Vorhersage</div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="color:#7a8aa3;font-size:11px;">Belag:</span>
                            <select id="predictionSurface" style="padding:4px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:#141b2b;color:#e0e6f0;font-size:12px;outline:none;cursor:pointer;">
                                <option value="Hard">🏟️ Hartplatz</option>
                                <option value="Clay">🧱 Sand</option>
                                <option value="Grass">🌿 Rasen</option>
                                <option value="Carpet">🟫 Teppich</option>
                                <option value="all">🎾 Alle</option>
                            </select>
                        </div>
                    </div>
                    <div id="predictionContainer">
                        ${renderPrediction(p1, p2, matches, 'Hard')}
                    </div>
                </div>

                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;">
                    <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;margin-bottom:12px;">📈 Letzte ${H2H_LAST} Begegnungen</div>
                    ${lastRows || '<div style="color:#4a5a77;text-align:center;padding:8px 0;font-size:13px;">Keine Begegnungen verfügbar.</div>'}
                    ${lastSummary}
                </div>

                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;">
                    <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;margin-bottom:12px;">🏟️ Nach Belag</div>
                    ${surfaceRows || '<div style="color:#4a5a77;text-align:center;padding:8px 0;font-size:13px;">Keine Belag-Informationen verfügbar.</div>'}
                </div>

                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;">
                    <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;margin-bottom:12px;">🏆 Nach Turnier-Kategorie</div>
                    ${catRows || '<div style="color:#4a5a77;text-align:center;padding:8px 0;font-size:13px;">Keine Kategorien verfügbar.</div>'}
                </div>

                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;">
                    <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;margin-bottom:12px;">🎾 Set-Statistik</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                        <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:10px;text-align:center;">
                            <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;">Gesamt-Sets</div>
                            <div style="color:#e0e6f0;font-size:18px;font-weight:700;">${tSetsP1}:${tSetsP2}</div>
                            <div style="color:#f1c40f;font-size:12px;font-weight:600;">${setRate}%</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:10px;text-align:center;">
                            <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;">3-Satz Matches</div>
                            <div style="color:#e0e6f0;font-size:18px;font-weight:700;">${p1m3}:${p2m3}</div>
                            <div style="color:#f1c40f;font-size:12px;font-weight:600;">${m3 > 0 ? rate3 : '-'}%</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:10px;text-align:center;">
                            <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;">5-Satz Matches</div>
                            <div style="color:#e0e6f0;font-size:18px;font-weight:700;">${p1m5}:${p2m5}</div>
                            <div style="color:#f1c40f;font-size:12px;font-weight:600;">${m5 > 0 ? rate5 : '-'}%</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:10px;text-align:center;">
                            <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;">Tie-Breaks</div>
                            <div style="color:#e0e6f0;font-size:18px;font-weight:700;">${tbP1}:${tbP2}</div>
                            <div style="color:#f1c40f;font-size:12px;font-weight:600;">${(tbP1 + tbP2) > 0 ? tbRate : '-'}%</div>
                        </div>
                    </div>
                </div>

                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;">
                    <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;margin-bottom:12px;">📅 Jahresweise Aufschlüsselung</div>
                    ${yearRows || '<div style="color:#4a5a77;text-align:center;padding:8px 0;font-size:13px;">Keine Jahresdaten verfügbar.</div>'}
                </div>

                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;">
                    <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;margin-bottom:12px;">🎯 Tie-Break Detail-Ansicht</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
                        <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:8px;text-align:center;">
                            <div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Gesamt</div>
                            <div style="color:#e0e6f0;font-size:16px;font-weight:700;">${tbMatches.length}</div>
                        </div>
                        <div style="background:rgba(46,204,113,0.05);border-radius:8px;padding:8px;text-align:center;">
                            <div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">${p1}</div>
                            <div style="color:#2ecc71;font-size:16px;font-weight:700;">${tbP1Wins}</div>
                        </div>
                        <div style="background:rgba(231,76,60,0.05);border-radius:8px;padding:8px;text-align:center;">
                            <div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">${p2}</div>
                            <div style="color:#e74c3c;font-size:16px;font-weight:700;">${tbP2Wins}</div>
                        </div>
                    </div>
                    <div style="text-align:center;color:#f1c40f;font-size:13px;font-weight:600;margin-bottom:8px;">
                        ${tbMatches.length > 0 ? `${tbOverallRate}% für ${p1}` : 'Keine Tie-Breaks'}
                    </div>
                    ${tbDetailRows || '<div style="color:#4a5a77;text-align:center;padding:8px 0;font-size:13px;">Keine Tie-Breaks verfügbar.</div>'}
                </div>
            </div>
        `;

        const surfaceSelect = document.getElementById('predictionSurface');
        if (surfaceSelect) {
            surfaceSelect.onchange = function() {
                const surface = this.value;
                const container = document.getElementById('predictionContainer');
                if (container) {
                    container.innerHTML = renderPrediction(p1, p2, matches, surface);
                }
            };
        }

    } catch (error) {
        console.error('Fehler beim Laden der H2H-Daten:', error);
        container.innerHTML = `<div style="text-align:center;color:#e74c3c;padding:20px 0;">❌ Fehler beim Laden der Daten: ${error.message}</div>`;
    }
}

// ===== INIT H2H =====
window.loadH2H = async function() {
    console.log('📌 loadH2H aufgerufen');

    h2hState.player1 = null;
    h2hState.player2 = null;
    h2hState.searchTerm1 = '';
    h2hState.searchTerm2 = '';
    h2hState.cacheLoaded = false;
    h2hState.players = [];

    // 🔥 FIX: Spieler LADEN und SPEICHERN!
    const players = await loadPlayers(h2hState.type);
    h2hState.players = players;   // ← DAS FEHLTE!
    console.log(`✅ ${players.length} Spieler in h2hState gespeichert`);

    renderH2H();
};

window.loadH2HModule = window.loadH2H;

console.log('✅ h2h.js geladen (mit ELO-Integration über API)');