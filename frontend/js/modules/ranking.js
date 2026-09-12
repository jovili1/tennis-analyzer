// ==========================================
// RANKING MODUL – ATP + WTA (mit Bildern)
// ==========================================

console.log('🔄 ranking.js wird geladen...');

let allPlayers = [];

// ===== ISO-Länder-Codes (für Flaggen) =====
const COUNTRY_ISO = {
    'italy':'it','spain':'es','germany':'de','canada':'ca','serbia':'rs','russia':'ru',
    'australia':'au','usa':'us','kazakhstan':'kz','czech republic':'cz','norway':'no',
    'monaco':'mc','argentina':'ar','france':'fr','chile':'cl','brazil':'br','belgium':'be',
    'peru':'pe','great britain':'gb','greece':'gr','switzerland':'ch','netherlands':'nl',
    'poland':'pl','portugal':'pt','sweden':'se','ukraine':'ua','slovakia':'sk','slovenia':'si',
    'croatia':'hr','hungary':'hu','romania':'ro','bulgaria':'bg','turkey':'tr','denmark':'dk',
    'finland':'fi','ireland':'ie','austria':'at','lithuania':'lt','latvia':'lv','estonia':'ee',
    'cyprus':'cy','mexico':'mx','colombia':'co','ecuador':'ec','venezuela':'ve','uruguay':'uy',
    'paraguay':'py','bolivia':'bo','china':'cn','japan':'jp','south korea':'kr','india':'in',
    'israel':'il','georgia':'ge','belarus':'by','montenegro':'me','north macedonia':'mk',
    'hong kong':'hk','indonesia':'id','rsa':'za','south africa':'za','egypt':'eg','morocco':'ma',
    'tunisia':'tn','algeria':'dz','senegal':'sn','nigeria':'ng','ghana':'gh','ivory coast':'ci',
    'cameroon':'cm','angola':'ao','botswana':'bw','zimbabwe':'zw','zambia':'zm','madagascar':'mg',
    'mauritius':'mu','seychelles':'sc','bahamas':'bs','barbados':'bb','jamaica':'jm','costa rica':'cr',
    'guatemala':'gt','honduras':'hn','panama':'pa','nicaragua':'ni','el salvador':'sv',
    'puerto rico':'pr','dominican rep.':'do','cuba':'cu','trinidad and tobago':'tt'
};
const getISO = c => COUNTRY_ISO[c?.toLowerCase().trim()] || 'unknown';

// ===== HELPER: Ranking-Daten zentral setzen =====
function setRankingData(type, data) {
    allPlayers = data;
    if (type === 'atp') {
        window.rankingDataATP = data;
    } else {
        window.rankingDataWTA = data;
    }
    window.playerData = data;
}

// ===== BILD VON WIKIMEDIA COMMONS HOLEN =====
async function getPlayerImageForRanking(wikidataId) {
    if (!wikidataId) return null;

    const cacheKey = 'wikidata_img_' + wikidataId;
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached && cached !== 'null' && cached !== 'undefined') {
            return cached;
        }
    } catch (e) {}

    try {
        const url = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
        const response = await fetch(url);
        if (!response.ok) return null;

        const data = await response.json();
        const entity = data.entities[wikidataId];
        if (!entity) return null;

        const claims = entity.claims || {};
        const imageClaim = claims.P18;
        if (!imageClaim || imageClaim.length === 0) return null;

        const imageFileName = imageClaim[0].mainsnak.datavalue.value;
        const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${imageFileName.replace(/ /g, '_')}`;

        try {
            localStorage.setItem(cacheKey, imageUrl);
        } catch (e) {}

        return imageUrl;
    } catch (error) {
        return null;
    }
}

// ===== RANKING LADEN =====
window.loadRanking = async function(t='atp') {
    window.currentRankingType = t;
    console.log('📌 loadRanking setzt currentRankingType auf:', t);

    document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.sidebar-btn[data-page="ranking"][data-ranking="${t}"]`);
    if (btn) btn.classList.add('active');

    const c = document.getElementById('pageContent');
    const isAtp = t === 'atp';
    const file = isAtp ? 'atp_ranking.json' : 'wta_ranking.json';
    const title = isAtp ? 'ATP' : 'WTA';

    try {
        let p = JSON.parse(localStorage.getItem(`tennis_ranking_${t}`));
        if (p?.length) {
            setRankingData(t, p);
            render(p, title);
            console.log(`✅ ${p.length} ${title}-Spieler aus localStorage geladen`);
            return;
        }
        const r = await fetch(`../backend/ranglisten/${file}`);
        if (!r.ok) throw new Error(`${file} nicht gefunden!`);
        p = await r.json();
        if (!p.length) throw new Error('Keine Spieler gefunden');
        localStorage.setItem(`tennis_ranking_${t}`, JSON.stringify(p));
        setRankingData(t, p);
        render(p, title);
        console.log(`✅ ${p.length} ${title}-Spieler aus JSON geladen`);
    } catch (e) {
        console.error(e);
        c.innerHTML = `<div class="error">❌ Fehler beim Laden der ${title}-Rangliste:<br>${e.message}<br><br><small>Führe den Scraper aus.</small></div>`;
    }
};

// ===== RENDER RANKING =====
function render(p, title) {
    document.getElementById('pageContent').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
            <div><span style="font-size:14px;color:#7a8aa3;">${title} RANKING</span><span style="font-size:13px;color:#4a5a77;margin-left:12px;">${new Date().toLocaleDateString('de-DE')}</span></div>
            <div style="font-size:14px;color:#7a8aa3;">${p.length} Spieler</div>
        </div>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap;">
            <div style="flex:1;min-width:180px;position:relative;">
                <input type="text" id="searchInput" placeholder="🔍 Spieler suchen..." onkeyup="filterRanking()" style="width:100%;padding:10px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);background:#141b2b;color:#e0e6f0;font-size:14px;outline:none;transition:0.3s;">
                <span id="resultCount" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);color:#4a5a77;font-size:13px;">${p.length}</span>
            </div>
            <button onclick="clearSearch()" style="padding:10px 20px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:#7a8aa3;cursor:pointer;font-size:13px;transition:0.3s;">✕ Zurücksetzen</button>
            <button onclick="updateRanking()" id="updateBtn" style="padding:10px 24px;border-radius:10px;border:none;background:linear-gradient(135deg,#1a472a,#2d5a3d);color:#fff;font-weight:600;font-size:13px;cursor:pointer;transition:0.3s;box-shadow:0 4px 16px rgba(26,71,42,0.3);">🔄 Update</button>
        </div>
        <div style="font-size:13px;color:#4a5a77;margin-bottom:16px;">
            <span id="totalCount">${p.length}</span> Spieler geladen
            <span id="filterInfo" style="display:none;color:#2ecc71;margin-left:12px;">· <span id="filteredCount">0</span> gefunden</span>
            <span id="updateStatus" style="display:none;color:#f1c40f;margin-left:12px;">⏳ Update läuft...</span>
        </div>
        <div id="tableContainer">${buildCards(p)}</div>
        <div style="font-size:11px;color:#2a3a4a;text-align:right;margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.03);">🎾 TennisExplorer · ${new Date().toLocaleDateString('de-DE')}</div>
    `;
}

// ===== KARTEN BAUEN =====
function buildCards(p) {
    if (!p?.length) return `<div style="color:#4a5a77;text-align:center;padding:40px 0;">😕 Keine Spieler gefunden</div>`;
    let h = '';
    p.forEach(x => {
        const init = x.name.split(' ').map(w=>w[0]).join('').substring(0,2);
        const flag = `https://flagcdn.com/32x24/${getISO(x.country)}.png`;
        let sym='—', col='#4a5a77';
        if (x.move && x.move!=='' && x.move!=='-') {
            // 🔥 Robuster mit Regex
            if (/[+↑⬆]/.test(x.move)) { sym='▲'; col='#2ecc71'; }
            else if (/[-↓⬇]/.test(x.move)) { sym='▼'; col='#e74c3c'; }
        }
        const top10 = x.rank <= 10, nr1 = x.rank === 1, bw = Math.min((x.points/15000)*100,100);
        const bg = nr1 ? 'rgba(212,175,55,0.08)' : top10 ? 'rgba(46,204,113,0.05)' : 'rgba(255,255,255,0.02)';
        const brd = nr1 ? 'rgba(212,175,55,0.3)' : top10 ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.04)';
        const bgH = nr1 ? 'rgba(212,175,55,0.12)' : top10 ? 'rgba(46,204,113,0.08)' : 'rgba(255,255,255,0.05)';
        const brdH = nr1 ? 'rgba(212,175,55,0.4)' : top10 ? 'rgba(46,204,113,0.25)' : 'rgba(255,255,255,0.08)';
        h += `<div style="display:grid;grid-template-columns:48px 32px 1fr 100px;align-items:center;gap:10px;background:${bg};padding:10px 16px;border-radius:12px;border:1px solid ${brd};transition:0.2s;cursor:pointer;" onclick="openPlayerDetail('${x.name}')" onmouseover="this.style.background='${bgH}';this.style.borderColor='${brdH}'" onmouseout="this.style.background='${bg}';this.style.borderColor='${brd}'">
            <div style="font-weight:700;font-size:18px;color:${nr1?'#d4af37':top10?'#2ecc71':'#7a8aa3'};">${nr1?'👑':''} ${x.rank}</div>
            <div style="text-align:center;font-weight:700;font-size:14px;color:${col};">${sym}</div>
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#1a472a,#2d5a3d);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#fff;flex-shrink:0;">${init}</div>
                <div><div style="color:#e0e6f0;font-weight:500;font-size:15px;">${x.name}</div>
                <div style="color:#4a5a77;font-size:12px;display:flex;align-items:center;gap:6px;"><img src="${flag}" alt="${x.country}" style="width:20px;height:15px;border-radius:2px;border:1px solid rgba(255,255,255,0.1);">${x.country}</div></div>
            </div>
            <div style="text-align:right;"><div style="color:#f1c40f;font-weight:700;font-size:15px;">${x.points.toLocaleString()}</div>
            <div style="width:100%;height:3px;background:rgba(255,255,255,0.05);border-radius:4px;margin-top:3px;overflow:hidden;"><div style="width:${bw}%;height:100%;background:linear-gradient(90deg,#2ecc71,#d4af37);border-radius:4px;transition:width 0.6s;"></div></div></div>
        </div>`;
    });
    return h;
}

// ===== FILTER =====
function filterRanking() {
    const t = document.getElementById('searchInput').value.toLowerCase().trim();
    // 🔥 Robuster: Fallback bei fehlendem country
    const f = t.length >= 2 ? allPlayers.filter(p =>
        (p.name || '').toLowerCase().includes(t) ||
        (p.country || '').toLowerCase().includes(t)
    ) : allPlayers;
    document.getElementById('filterInfo').style.display = t.length >= 2 ? 'inline' : 'none';
    document.getElementById('filteredCount').innerText = f.length;
    document.getElementById('resultCount').innerText = `${f.length}/${allPlayers.length}`;
    document.getElementById('tableContainer').innerHTML = buildCards(f);
}

function clearSearch() {
    const i = document.getElementById('searchInput');
    if (i) { i.value = ''; filterRanking(); i.focus(); }
}

// ===== UPDATE =====
async function updateRanking() {
    const btn = document.getElementById('updateBtn'), st = document.getElementById('updateStatus');
    btn.disabled = true; btn.innerText = '⏳...'; st.style.display = 'inline'; st.innerText = '⏳ Lade Daten...';
    try {
        const a = document.querySelector('.sidebar-btn.active[data-page="ranking"]'), t = a?.dataset?.ranking || 'atp';
        const file = t === 'atp' ? 'atp_ranking.json' : 'wta_ranking.json';
        const r = await fetch(`../backend/ranglisten/${file}?t=${Date.now()}`);
        if (!r.ok) throw new Error('Datei nicht gefunden');
        const p = await r.json();
        if (!p.length) throw new Error('Keine Daten');
        localStorage.setItem(`tennis_ranking_${t}`, JSON.stringify(p));
        setRankingData(t, p);
        render(p, t === 'atp' ? 'ATP' : 'WTA');
        st.style.color = '#2ecc71'; st.innerText = `✅ ${p.length} Spieler geladen!`;
    } catch (e) {
        st.style.color = '#e74c3c';
        st.innerText = `❌ ${e.message}`;
    }
    btn.disabled = false;
    btn.innerText = '🔄 Update';
}

// ===== RANKING TYPE =====
function getRankingType() {
    if (window.currentRankingType) {
        return window.currentRankingType;
    }
    const title = document.getElementById('pageTitle')?.innerText || '';
    if (title.toLowerCase().includes('wta')) {
        return 'wta';
    }
    return 'atp';
}

// ============================================================
// 🔥 SPIELER DETAIL ÖFFNEN
// ============================================================
function openPlayerDetail(name) {
    console.log(`🔍 Suche Spieler: "${name}"`);
    const t = getRankingType();
    const title = t === 'atp' ? 'ATP' : 'WTA';
    console.log(`📌 Aktives Ranking: ${title}`);

    const rankingData = t === 'atp' ? window.rankingDataATP : window.rankingDataWTA;

    if (!rankingData || rankingData.length === 0) {
        console.error(`❌ Keine ${title}-Ranking-Daten gefunden`);
        alert(`Bitte lade zuerst die ${title} Rangliste.`);
        return;
    }

    // 🔥 1. Spieler im Ranking finden (exakt)
    const searchName = name.trim().toLowerCase();
    let foundPlayer = null;

    for (const r of rankingData) {
        const rName = r.name?.trim().toLowerCase() || '';
        if (rName === searchName) {
            foundPlayer = r;
            console.log(`✅ Exakter Match: "${r.name}"`);
            break;
        }
    }

    // Fallback: Teil-Suche
    if (!foundPlayer) {
        for (const r of rankingData) {
            const rName = r.name?.trim().toLowerCase() || '';
            if (rName.includes(searchName) || searchName.includes(rName)) {
                foundPlayer = r;
                console.log(`⚠️ Teil-Match: "${r.name}" für "${name}"`);
                break;
            }
        }
    }

    if (!foundPlayer) {
        console.error(`❌ Spieler "${name}" nicht gefunden in ${title}-Ranking`);
        alert(`Spieler "${name}" nicht gefunden in der ${title}-Rangliste.`);
        return;
    }

    console.log(`✅ Spieler gefunden: "${foundPlayer.name}"`);

    // 🔥 2. Jetzt den Spieler in der Datenbank suchen und öffnen
    findPlayerIdAndOpen(t, foundPlayer);
}

// ===== Spieler in der Datenbank finden und öffnen =====
async function findPlayerIdAndOpen(rankingType, foundPlayer) {
    console.log(`🔍 Suche "${foundPlayer.name}" in der Datenbank...`);

    try {
        // 🔥 initDatabase ist jetzt global verfügbar (durch players.js Export)
        if (typeof window.initDatabase !== 'function') {
            console.warn('⚠️ Datenbank-Funktionen nicht verfügbar');
            showRankingDetailFallback(foundPlayer);
            return;
        }

        const db = await window.initDatabase(rankingType);
        if (!db) {
            console.warn('⚠️ Datenbank konnte nicht geladen werden');
            showRankingDetailFallback(foundPlayer);
            return;
        }

        // 🔥 Direkte Suche mit SQL (nur 1 Spieler!)
        const searchName = foundPlayer.name.trim();
        const stmt = db.prepare(`
            SELECT player_id, name_first, name_last, ioc, wikidata_id
            FROM players
            WHERE (name_first || ' ' || name_last) = ?
               OR (name_last || ' ' || name_first) = ?
            LIMIT 1
        `);
        stmt.bind([searchName, searchName]);

        let foundDbPlayer = null;
        if (stmt.step()) {
            foundDbPlayer = stmt.getAsObject();
            console.log(`✅ Spieler in DB gefunden: ${foundDbPlayer.name_first} ${foundDbPlayer.name_last}`);
        }
        stmt.free();

        if (foundDbPlayer && foundDbPlayer.player_id) {
            const playerId = foundDbPlayer.player_id;
            console.log(`✅ player_id gefunden: ${playerId}`);

            if (typeof window.showPlayerDetailById === 'function') {
                window.currentRankingType = rankingType;
                // 🔥 rankingType explizit übergeben
                window.showPlayerDetailById(playerId, rankingType);
                return;
            }
        }

        console.warn(`⚠️ Kein Match für "${foundPlayer.name}" in der Datenbank.`);
        showRankingDetailFallback(foundPlayer);

    } catch (error) {
        console.error('❌ Fehler:', error);
        showRankingDetailFallback(foundPlayer);
    }
}

// ===== FALLBACK: Ranking-Detailansicht =====
function showRankingDetailFallback(foundPlayer) {
    console.log(`📋 Zeige Ranking-Detailansicht für "${foundPlayer.name}"`);
    const container = document.getElementById('pageContent');
    if (container) {
        const player = {
            name: foundPlayer.name,
            country: foundPlayer.country || 'Unbekannt',
            rank: foundPlayer.rank,
            points: foundPlayer.points || 0
        };
        document.getElementById('pageTitle').innerHTML = `👤 ${foundPlayer.name} <span class="highlight">Detail</span>`;
        renderRankingDetail(player);
    }
}

// ===== RENDER RANKING DETAIL (OPTIMIERT - KEINE ALLE SPIELER!) =====
async function renderRankingDetail(p) {
    const container = document.getElementById('pageContent');
    const name = p.name || 'Unbekannt';
    const country = p.country || 'Unbekannt';
    const rank = p.rank || '—';
    const points = p.points ? p.points.toLocaleString() : '—';
    const iso = getISO(country);
    const flagUrl = 'https://flagcdn.com/32x24/' + iso + '.png';
    const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2);

    let imageUrl = null;
    let wikidataId = null;

    // 🔥 NUR in den bereits geladenen Spieler-Daten suchen (NICHT in der DB!)
    const detailDataKey = window.currentRankingType === 'atp' ? 'playerDataATP' : 'playerDataWTA';
    let playerData = window[detailDataKey] || [];

    if (playerData.length > 0) {
        const searchName = name.trim().toLowerCase();
        const searchParts = searchName.split(' ');
        const lastName = searchParts.length >= 2 ? searchParts[searchParts.length - 1] : searchName;

        const found = playerData.find(function(player) {
            const pName = player.name?.trim().toLowerCase() || '';
            const pParts = pName.split(' ');
            const pLastName = pParts.length >= 2 ? pParts[pParts.length - 1] : pName;

            if (pName === searchName) return true;
            if (pParts.length >= 2 && searchParts.length >= 2) {
                const pReversed = pParts[1] + ' ' + pParts[0];
                if (pReversed === searchName) return true;
            }
            if (pLastName === lastName) return true;
            if (pName.includes(searchName) || searchName.includes(pName)) return true;
            return false;
        });

        if (found && found.wikidata_id) {
            wikidataId = found.wikidata_id;
            console.log(`✅ wikidata_id für "${name}" aus Spieler-Daten: ${wikidataId}`);
        }
    }

    // 🔥 FALLBACK: NUR mit globaler DB suchen (nicht neu laden!)
    if (!wikidataId && window.getDatabase) {
        try {
            console.log(`🔍 Suche in globaler DB nach "${name}"...`);
            const db = window.getDatabase(window.currentRankingType);
            if (db) {
                const stmt = db.prepare(`
                    SELECT wikidata_id
                    FROM players
                    WHERE (name_first || ' ' || name_last) = ?
                       OR (name_last || ' ' || name_first) = ?
                    LIMIT 1
                `);
                const searchName = name.trim();
                stmt.bind([searchName, searchName]);

                if (stmt.step()) {
                    const result = stmt.getAsObject();
                    if (result && result.wikidata_id) {
                        wikidataId = result.wikidata_id;
                        console.log(`✅ wikidata_id für "${name}" aus globaler DB: ${wikidataId}`);
                    }
                }
                stmt.free();
            }
        } catch (e) {
            console.warn('⚠️ Fehler beim Zugriff auf globale DB:', e);
        }
    }

    // Bild laden (Cache-Check ist in getPlayerImageForRanking enthalten)
    if (wikidataId) {
        const img = await getPlayerImageForRanking(wikidataId);
        if (img) {
            imageUrl = img;
        }
    }

    const hasImage = imageUrl !== null;

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:20px;">
            <div>
                <button onclick="loadRanking('${window.currentRankingType}')" style="background:transparent;border:1px solid rgba(255,255,255,0.1);color:#a0b3cc;padding:8px 20px;border-radius:10px;cursor:pointer;font-size:14px;font-family:'Inter',sans-serif;transition:0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">← Zurück zur Rangliste</button>
            </div>

            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:32px;">
                <div style="display:flex;align-items:center;gap:28px;margin-bottom:28px;padding-bottom:24px;border-bottom:2px solid rgba(46,204,113,0.15);flex-wrap:wrap;">
                    ${hasImage ? `
                    <div style="width:88px;height:88px;border-radius:50%;overflow:hidden;flex-shrink:0;border:3px solid rgba(46,204,113,0.3);cursor:pointer;"
                         onclick="if (typeof openLightbox === 'function') openLightbox('${imageUrl}','${name}')"
                         onmouseover="this.style.borderColor='rgba(46,204,113,0.6)';this.style.transform='scale(1.02)'"
                         onmouseout="this.style.borderColor='rgba(46,204,113,0.3)';this.style.transform='scale(1)'"
                         title="Bild vergrößern">
                        <img src="${imageUrl}" alt="${name}" loading="lazy" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';this.parentElement.style.border='none';this.parentElement.innerHTML='<div style=\\'width:88px;height:88px;border-radius:50%;background:linear-gradient(135deg,#1a472a,#2d5a3d);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:36px;color:#fff;flex-shrink:0;border:3px solid rgba(46,204,113,0.3);\\'>${initials}</div>'">
                    </div>
                    ` : `
                    <div style="width:88px;height:88px;border-radius:50%;background:linear-gradient(135deg,#1a472a,#2d5a3d);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:36px;color:#fff;flex-shrink:0;border:3px solid rgba(46,204,113,0.3);">
                        ${initials}
                    </div>
                    `}

                    <div style="flex:1;min-width:150px;">
                        <div style="color:#7a8aa3;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${window.currentRankingType === 'atp' ? 'ATP' : 'WTA'} Spieler</div>
                        <div style="color:#ffffff;font-size:32px;font-weight:700;margin:4px 0;">${name}</div>
                        <div style="color:#a0b3cc;font-size:16px;display:flex;align-items:center;gap:8px;">
                            <img src="${flagUrl}" alt="${country}" style="width:24px;height:16px;border-radius:3px;border:1px solid rgba(255,255,255,0.08);">
                            ${country}
                        </div>
                        <div style="color:#f1c40f;font-size:18px;font-weight:700;margin-top:4px;">
                            ${points} <span style="font-size:13px;font-weight:400;color:#7a8aa3;">Punkte</span>
                        </div>
                    </div>

                    <div style="background:rgba(46,204,113,0.08);border:2px solid rgba(46,204,113,0.2);border-radius:16px;padding:16px 28px;min-width:100px;text-align:center;flex-shrink:0;">
                        <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Ranking</div>
                        <div style="color:#2ecc71;font-size:42px;font-weight:800;line-height:1.1;">${rank}</div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));gap:10px;">
                    ${detailTile('🏆','Rang',rank)}
                    ${detailTile('⭐','Punkte',points)}
                    ${detailTile('🌍','Land',country)}
                    ${detailTile('🎯','Quelle','Rangliste')}
                </div>
            </div>
        </div>
    `;
}

// ===== TILE HELPER (war im Original nicht als eigene Funktion, hier extrahiert) =====
function detailTile(icon, label, value) {
    return `
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;text-align:center;">
            <div style="font-size:22px;margin-bottom:2px;">${icon}</div>
            <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;">${label}</div>
            <div style="color:#e0e6f0;font-size:16px;font-weight:600;margin-top:2px;">${value}</div>
        </div>
    `;
}

// ===== GLOBALE EXPORTS =====
window.loadRanking = window.loadRanking; // (bereits oben gesetzt – hier nur zur Klarheit)
window.filterRanking = filterRanking;
window.clearSearch = clearSearch;
window.updateRanking = updateRanking;
window.openPlayerDetail = openPlayerDetail;

// 🔥 WICHTIG: Alias NACH der Definition setzen (nicht vorher!)
window.loadRankingModule = window.loadRanking;

console.log('✅ ranking.js geladen (optimiert)');