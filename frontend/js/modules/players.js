// ===== players.js - MAXIMALE PERFORMANCE (mit Matches & erweiterten Stats) =====

console.log('🔄 players.js wird geladen...');

// ===== API-URL (lokal vs. online) =====
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? ''
    : 'https://tennis-analyzer-api.onrender.com';

const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? '..'
    : 'https://jovili1.github.io/tennis-analyzer';

let playerData = [];
let currentRankingType = 'atp';
let dbATP = null;
let dbWTA = null;
let totalPlayers = 0;
let totalPlayersATP = 0;
let totalPlayersWTA = 0;
let isLoadingMore = false;
let hasMorePlayers = true;
let searchTimer = null;
let isRankingLoaded = false;
const PLAYERS_PER_PAGE = 10;

// ===== TOP 10 SPIELER =====
const TOP_PLAYERS_ATP = [
    206173,  // Jannik Sinner
    100644,  // Alexander Zverev
    207989,  // Carlos Alcaraz
    200000,  // Felix Auger Aliassime
    104925,  // Novak Djokovic
    200282,  // Alex De Minaur
    106421,  // Daniil Medvedev
    210097,  // Ben Shelton
    207925,  // Flavio Cobolli
    126203,  // Taylor Fritz
];

const TOP_PLAYERS_WTA = [
    214544,  // 1. Aryna Sabalenka
    214981,  // 2. Elena Rybakina
    202468,  // 3. Jessica Pegula
    221103,  // 4. Coco Gauff
    216347,  // 5. Iga Swiatek
    259799,  // 6. Mirra Andreeva
    214096,  // 7. Karolina Muchova
    222328,  // 8. Linda Noskova
    202494,  // 9. Elina Svitolina
    216153   // 10. Amanda Anisimova
];

// ===== KONFIGURATION =====
const PLAYER_DATA_PATH = `${BACKEND_URL}/backend/spieler/`;
const MATCH_DATA_PATH = `${BACKEND_URL}/backend/spieler/`;
const ATP_DB_FILENAME = 'atp_players.db';
const WTA_DB_FILENAME = 'wta_players.db';
const ATP_MATCHES_FILENAME = 'atp_matches.db';
const WTA_MATCHES_FILENAME = 'wta_matches.db';
const RANKING_PATH = `${BACKEND_URL}/backend/ranglisten/`;

// ===== PERFORMANCE: CACHE-KEYS =====
const CACHE_WIKIDATA_PREFIX = 'wikidata_img_';
const CACHE_RANKING_ATP = 'tennis_ranking_atp';
const CACHE_RANKING_WTA = 'tennis_ranking_wta';

// =====================================================
// ===== HELPER: Player-Row-Transformation =====
// =====================================================
function transformPlayerRow(p) {
    const fullName = p.name_first && p.name_last
        ? `${p.name_first} ${p.name_last}`.trim()
        : p.name_first || p.name_last || 'Unbekannt';

    let imageUrl = null;
    if (p.wikidata_id) {
        const cacheKey = CACHE_WIKIDATA_PREFIX + p.wikidata_id;
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached && cached !== 'null' && cached !== 'undefined') {
                imageUrl = cached;
            }
        } catch (e) {}
    }

    return {
        player_id: p.player_id,
        name: fullName,
        name_first: p.name_first || '',
        name_last: p.name_last || '',
        country: getCountryName(p.ioc),
        country_code: p.ioc || 'UNK',
        wikidata_id: p.wikidata_id || '',
        _imageUrl: imageUrl
    };
}

// =====================================================
// ===== loadPlayers =====
// =====================================================

async function loadPlayers(rankingType) {
    console.log('🔥 loadPlayers AUFGERUFEN mit:', rankingType);
    currentRankingType = rankingType;
    window.currentRankingType = rankingType;

    const container = document.getElementById('pageContent');
    if (!container) {
        console.error('❌ Container #pageContent nicht gefunden!');
        return;
    }
    const title = rankingType === 'atp' ? '🏆 ATP' : '👑 WTA';

    await loadRankingData(rankingType);

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:15px;">
            <div style="width:40px;height:40px;border:4px solid rgba(46,204,113,0.2);border-top:4px solid #2ecc71;border-radius:50%;animation:spin 1s linear infinite;"></div>
            <div style="color:#7a8aa3;font-size:16px;">⏳ Lade ${title} Top 10...</div>
        </div>
        <style>
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    `;

    try {
        await initDatabase(rankingType);

        let topIds = rankingType === 'atp' ? TOP_PLAYERS_ATP : TOP_PLAYERS_WTA;
        let players = [];
        if (topIds && topIds.length > 0) {
            players = await getPlayersByIds(topIds);
        } else {
            players = await getPlayersFromDB(PLAYERS_PER_PAGE, 0);
        }

        let rankingData = rankingType === 'atp' ? window.rankingDataATP : window.rankingDataWTA;

        const playersWithRank = [];

        for (const p of players) {
            const dbFullName = p.name_first && p.name_last
                ? `${p.name_first} ${p.name_last}`.trim()
                : p.name_first || p.name_last || 'Unbekannt';

            let rank = 9999;
            let rankingName = dbFullName;
            let rankingCountry = '';
            let foundInRanking = false;

            if (rankingData && rankingData.length > 0) {
                const match = findPlayerInRanking(dbFullName, rankingData);
                if (match && match.rank) {
                    rank = match.rank;
                    rankingName = match.name || dbFullName;
                    rankingCountry = match.country || match.flag || '';
                    foundInRanking = true;
                }
            }

            let imageUrl = null;
            if (p.wikidata_id) {
                const cacheKey = CACHE_WIKIDATA_PREFIX + p.wikidata_id;
                try {
                    const cached = localStorage.getItem(cacheKey);
                    if (cached && cached !== 'null' && cached !== 'undefined') {
                        imageUrl = cached;
                    }
                } catch (e) {}
            }

            const countryCode = rankingCountry || p.ioc || 'UNK';
            const countryName = rankingCountry ? getCountryName(rankingCountry) : getCountryName(p.ioc);

            playersWithRank.push({
                player_id: p.player_id,
                name: rankingName,
                name_first: p.name_first || '',
                name_last: p.name_last || '',
                country: countryName,
                country_code: countryCode,
                wikidata_id: p.wikidata_id || '',
                _imageUrl: imageUrl,
                _rank: rank,
                _foundInRanking: foundInRanking
            });
        }

        playersWithRank.sort((a, b) => a._rank - b._rank);
        playersWithRank.forEach(p => delete p._rank);

        playerData = playersWithRank;
        window.playerData = playersWithRank;
        window._searchResults = null;
        hasMorePlayers = totalPlayers > PLAYERS_PER_PAGE;

        if (rankingType === 'atp') {
            window.playerDataATP = playersWithRank;
        } else {
            window.playerDataWTA = playersWithRank;
        }

        renderPlayerList(playersWithRank, title, totalPlayers);
    } catch (error) {
        console.error('Fehler:', error);
        container.innerHTML = `
            <div class="error" style="color:#e74c3c;padding:20px;text-align:center;">
                ❌ Fehler beim Laden der Spieler:<br>
                ${error.message}
            </div>
        `;
    }
}

// =====================================================
// ===== HILFSFUNKTIONEN =====
// =====================================================

async function getPlayerImage(wikidataId) {
    if (!wikidataId) return null;

    const cacheKey = CACHE_WIKIDATA_PREFIX + wikidataId;
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

async function loadRankingData(rankingType) {
    if (isRankingLoaded) {
        const rankingData = rankingType === 'atp' ? window.rankingDataATP : window.rankingDataWTA;
        if (rankingData && rankingData.length > 0) {
            return rankingData;
        }
    }

    const cacheKey = rankingType === 'atp' ? CACHE_RANKING_ATP : CACHE_RANKING_WTA;

    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const data = JSON.parse(cached);
            if (data && data.length > 0) {
                if (rankingType === 'atp') {
                    window.rankingDataATP = data;
                } else {
                    window.rankingDataWTA = data;
                }
                isRankingLoaded = true;
                console.log(`✅ Ranking aus Cache (${data.length} Einträge)`);
                return data;
            }
        }
    } catch (e) {}

    try {
        const filename = rankingType === 'atp' ? 'atp_ranking.json' : 'wta_ranking.json';
        const response = await fetch(`${RANKING_PATH}${filename}`);
        if (!response.ok) throw new Error(`${filename} nicht gefunden!`);
        const data = await response.json();

        if (data && data.length > 0) {
            if (rankingType === 'atp') {
                window.rankingDataATP = data;
            } else {
                window.rankingDataWTA = data;
            }
            isRankingLoaded = true;

            try {
                localStorage.setItem(cacheKey, JSON.stringify(data));
            } catch (e) {}

            console.log(`✅ ${data.length} Ranking-Einträge geladen`);
            return data;
        }
    } catch (error) {
        console.error('❌ Fehler beim Laden der Ranking-Daten:', error);
    }

    return null;
}

function getPlayerRank(playerName, rankingType) {
    if (!playerName) return '—';

    const rankingData = rankingType === 'atp' ? window.rankingDataATP : window.rankingDataWTA;
    if (!rankingData || rankingData.length === 0) {
        return '—';
    }

    const match = findPlayerInRanking(playerName, rankingData);
    if (match && match.rank) {
        return '#' + match.rank;
    }

    return '—';
}

function getPlayerPoints(playerName, rankingType) {
    if (!playerName) return '—';

    const rankingData = rankingType === 'atp' ? window.rankingDataATP : window.rankingDataWTA;
    if (!rankingData || rankingData.length === 0) {
        return '—';
    }

    const match = findPlayerInRanking(playerName, rankingData);
    if (match && match.points !== undefined && match.points !== null) {
        return match.points.toLocaleString();
    }

    return '—';
}

// =====================================================
// ===== ELO FUNKTIONEN =====
// =====================================================

async function getPlayerElo(playerName) {
    try {
        const response = await fetch(`${API_URL}/api/elo?name=${encodeURIComponent(playerName)}&surface=Rolling_Gesamt`);
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

// =====================================================
// ===== NAMENS-NORMALISIERUNG =====
// =====================================================

function normalizeName(name) {
    if (!name) return '';
    return name.trim().toLowerCase();
}

function getLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b[i-1] === a[j-1]) {
                matrix[i][j] = matrix[i-1][j-1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i-1][j-1] + 1,
                    matrix[i][j-1] + 1,
                    matrix[i-1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function isSimilarName(name1, name2) {
    if (!name1 || !name2) return false;

    const n1 = normalizeName(name1);
    const n2 = normalizeName(name2);

    if (n1 === n2) return true;

    const distance = getLevenshteinDistance(n1, n2);
    const maxLength = Math.max(n1.length, n2.length);
    const similarity = 1 - (distance / maxLength);

    return similarity >= 0.85;
}

function nameMatches(rankingName, dbFirstName, dbLastName) {
    if (!rankingName || !dbFirstName || !dbLastName) return false;

    const rName = normalizeName(rankingName);
    const rParts = rName.split(' ');
    const dbFirst = normalizeName(dbFirstName);
    const dbLast = normalizeName(dbLastName);
    const dbFull = `${dbFirst} ${dbLast}`;
    const dbFullReversed = `${dbLast} ${dbFirst}`;

    if (rName === dbFull) return true;
    if (rName === dbFullReversed) return true;

    if (rParts.length >= 2) {
        const rLast = rParts[0];
        const rFirst = rParts.slice(1).join(' ');

        if (rLast === dbLast && rFirst === dbFirst) return true;
        if (rLast === dbLast && rFirst && dbFirst.startsWith(rFirst)) return true;
        if (rFirst === dbFirst && rLast === dbLast) return true;
        if (isSimilarName(rLast, dbLast) && rFirst === dbFirst) return true;
        if (rLast === dbLast && isSimilarName(rFirst, dbFirst)) return true;
        if (isSimilarName(rLast, dbLast) && isSimilarName(rFirst, dbFirst)) return true;
    }

    if (rParts.length === 1) {
        const rLast = rParts[0];
        if (rLast === dbLast || isSimilarName(rLast, dbLast)) return true;
    }

    return false;
}

function findPlayerInRanking(playerName, rankingData) {
    if (!playerName || !rankingData || rankingData.length === 0) return null;

    const nameParts = playerName.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    for (const r of rankingData) {
        if (nameMatches(r.name, firstName, lastName)) {
            return r;
        }
    }

    if (lastName) {
        let bestMatch = null;
        let bestScore = 0;
        const normalizedLastName = normalizeName(lastName);

        for (const r of rankingData) {
            const rName = normalizeName(r.name);
            const rParts = rName.split(' ');
            const rLast = rParts.length > 0 ? rParts[0] : '';

            if (rLast) {
                const distance = getLevenshteinDistance(normalizedLastName, rLast);
                const maxLength = Math.max(normalizedLastName.length, rLast.length);
                const score = 1 - (distance / maxLength);

                if (score > bestScore && score >= 0.7) {
                    bestScore = score;
                    bestMatch = r;
                }
            }
        }

        if (bestMatch) return bestMatch;
    }

    return null;
}

function getCountryISO(countryName) {
    if (!countryName) return 'unknown';

    const map = {
        'italien': 'it', 'italy': 'it',
        'spanien': 'es', 'spain': 'es',
        'deutschland': 'de', 'germany': 'de',
        'kanada': 'ca', 'canada': 'ca',
        'serbien': 'rs', 'serbia': 'rs',
        'russland': 'ru', 'russia': 'ru',
        'australien': 'au', 'australia': 'au',
        'vereinigte staaten': 'us', 'usa': 'us', 'united states': 'us',
        'frankreich': 'fr', 'france': 'fr',
        'großbritannien': 'gb', 'great britain': 'gb',
        'schweiz': 'ch', 'switzerland': 'ch',
        'österreich': 'at', 'austria': 'at',
        'niederlande': 'nl', 'netherlands': 'nl',
        'belgien': 'be', 'belgium': 'be',
        'schweden': 'se', 'sweden': 'se',
        'norwegen': 'no', 'norway': 'no',
        'dänemark': 'dk', 'denmark': 'dk',
        'finnland': 'fi', 'finland': 'fi',
        'polen': 'pl', 'poland': 'pl',
        'tschechien': 'cz', 'czech republic': 'cz',
        'ungarn': 'hu', 'hungary': 'hu',
        'rumänien': 'ro', 'romania': 'ro',
        'bulgarien': 'bg', 'bulgaria': 'bg',
        'griechenland': 'gr', 'greece': 'gr',
        'portugal': 'pt', 'portugal': 'pt',
        'ukraine': 'ua', 'ukraine': 'ua',
        'slowakei': 'sk', 'slovakia': 'sk',
        'slowenien': 'si', 'slovenia': 'si',
        'kroatien': 'hr', 'croatia': 'hr',
        'bosnien': 'ba', 'bosnia': 'ba',
        'montenegro': 'me', 'montenegro': 'me',
        'nordmazedonien': 'mk', 'north macedonia': 'mk',
        'albanien': 'al', 'albania': 'al',
        'estland': 'ee', 'estonia': 'ee',
        'lettland': 'lv', 'latvia': 'lv',
        'litauen': 'lt', 'lithuania': 'lt',
        'weißrussland': 'by', 'belarus': 'by',
        'georgien': 'ge', 'georgia': 'ge',
        'armenien': 'am', 'armenia': 'am',
        'aserbaidschan': 'az', 'azerbaijan': 'az',
        'kasachstan': 'kz', 'kazakhstan': 'kz',
        'usbekistan': 'uz', 'uzbekistan': 'uz',
        'türkei': 'tr', 'turkey': 'tr',
        'israel': 'il', 'israel': 'il',
        'ägypten': 'eg', 'egypt': 'eg',
        'südafrika': 'za', 'south africa': 'za',
        'marokko': 'ma', 'morocco': 'ma',
        'tunesien': 'tn', 'tunisia': 'tn',
        'algerien': 'dz', 'algeria': 'dz',
        'nigeria': 'ng', 'nigeria': 'ng',
        'kenia': 'ke', 'kenya': 'ke',
        'mexiko': 'mx', 'mexico': 'mx',
        'kolumbien': 'co', 'colombia': 'co',
        'chile': 'cl', 'chile': 'cl',
        'peru': 'pe', 'peru': 'pe',
        'venezuela': 've', 'venezuela': 've',
        'uruguay': 'uy', 'uruguay': 'uy',
        'paraguay': 'py', 'paraguay': 'py',
        'bolivien': 'bo', 'bolivia': 'bo',
        'ecuador': 'ec', 'ecuador': 'ec',
        'argentinien': 'ar', 'argentina': 'ar',
        'brasilien': 'br', 'brazil': 'br',
        'china': 'cn', 'china': 'cn',
        'japan': 'jp', 'japan': 'jp',
        'südkorea': 'kr', 'south korea': 'kr',
        'indien': 'in', 'india': 'in',
        'indonesien': 'id', 'indonesia': 'id',
        'philippinen': 'ph', 'philippines': 'ph',
        'malaysien': 'my', 'malaysia': 'my',
        'singapur': 'sg', 'singapore': 'sg',
        'hongkong': 'hk', 'hong kong': 'hk',
        'taiwan': 'tw', 'taiwan': 'tw',
        'neuseeland': 'nz', 'new zealand': 'nz',
        'fidschi': 'fj', 'fiji': 'fj',
        'monaco': 'mc', 'monaco': 'mc'
    };

    const key = countryName.toLowerCase().trim();
    return map[key] || 'unknown';
}

const COUNTRY_MAP = {
    'USA': 'Vereinigte Staaten', 'GBR': 'Großbritannien', 'ITA': 'Italien',
    'ESP': 'Spanien', 'FRA': 'Frankreich', 'GER': 'Deutschland',
    'AUS': 'Australien', 'CAN': 'Kanada', 'BRA': 'Brasilien',
    'ARG': 'Argentinien', 'CHN': 'China', 'JPN': 'Japan',
    'SUI': 'Schweiz', 'AUT': 'Österreich', 'NED': 'Niederlande',
    'BEL': 'Belgien', 'SWE': 'Schweden', 'NOR': 'Norwegen',
    'DEN': 'Dänemark', 'FIN': 'Finnland', 'POL': 'Polen',
    'CZE': 'Tschechien', 'SVK': 'Slowakei', 'HUN': 'Ungarn',
    'ROU': 'Rumänien', 'BUL': 'Bulgarien', 'GRE': 'Griechenland',
    'POR': 'Portugal', 'RUS': 'Russland', 'UKR': 'Ukraine',
    'SRB': 'Serbien', 'CRO': 'Kroatien', 'SLO': 'Slowenien',
    'BIH': 'Bosnien', 'MNE': 'Montenegro', 'MKD': 'Nordmazedonien',
    'ALB': 'Albanien', 'EST': 'Estland', 'LAT': 'Lettland',
    'LTU': 'Litauen', 'BLR': 'Weißrussland', 'GEO': 'Georgien',
    'ARM': 'Armenien', 'AZE': 'Aserbaidschan', 'KAZ': 'Kasachstan',
    'UZB': 'Usbekistan', 'TUR': 'Türkei', 'ISR': 'Israel',
    'EGY': 'Ägypten', 'RSA': 'Südafrika', 'MAR': 'Marokko',
    'TUN': 'Tunesien', 'ALG': 'Algerien', 'NGR': 'Nigeria',
    'KEN': 'Kenia', 'MEX': 'Mexiko', 'COL': 'Kolumbien',
    'CHI': 'Chile', 'PER': 'Peru', 'VEN': 'Venezuela',
    'URU': 'Uruguay', 'PAR': 'Paraguay', 'BOL': 'Bolivien',
    'ECU': 'Ecuador', 'IND': 'Indien', 'PAK': 'Pakistan',
    'SRI': 'Sri Lanka', 'BAN': 'Bangladesch', 'THA': 'Thailand',
    'INA': 'Indonesien', 'PHI': 'Philippinen', 'MAS': 'Malaysien',
    'SGP': 'Singapur', 'KOR': 'Südkorea', 'TPE': 'Taiwan',
    'HKG': 'Hongkong', 'NZL': 'Neuseeland', 'FIJ': 'Fidschi'
};

function getCountryName(iocCode) {
    if (!iocCode) return 'Unbekannt';
    return COUNTRY_MAP[iocCode] || iocCode || 'Unbekannt';
}

function calculateAge(dob) {
    if (!dob || dob === '—' || dob === 0) return '—';
    const dobStr = String(dob);
    if (dobStr.length === 8) {
        const year = parseInt(dobStr.substring(0, 4));
        const month = parseInt(dobStr.substring(4, 6)) - 1;
        const day = parseInt(dobStr.substring(6, 8));
        const birthDate = new Date(year, month, day);
        if (!isNaN(birthDate.getTime())) {
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            return String(age);
        }
    }
    return '—';
}

// =====================================================
// ===== DATENBANK =====
// =====================================================

async function initDatabase(rankingType) {
    if (rankingType === 'atp' && dbATP) {
        console.log('✅ ATP-Datenbank bereits geladen');
        return dbATP;
    }
    if (rankingType === 'wta' && dbWTA) {
        console.log('✅ WTA-Datenbank bereits geladen');
        return dbWTA;
    }

    console.log(`🔄 Lade ${rankingType.toUpperCase()} Datenbank...`);

    try {
        const filename = rankingType === 'atp' ? ATP_DB_FILENAME : WTA_DB_FILENAME;
        const response = await fetch(`${PLAYER_DATA_PATH}${filename}`);
        if (!response.ok) throw new Error(`${filename} nicht gefunden!`);

        const arrayBuffer = await response.arrayBuffer();
        const SQL = await initSqlJs({
            locateFile: file => `https://sql.js.org/dist/${file}`
        });

        const newDb = new SQL.Database(new Uint8Array(arrayBuffer));

        if (rankingType === 'atp') {
            dbATP = newDb;
        } else {
            dbWTA = newDb;
        }

        const countStmt = newDb.prepare("SELECT COUNT(*) FROM players");
        countStmt.step();
        const count = countStmt.get()[0];
        countStmt.free();

        if (rankingType === 'atp') {
            totalPlayersATP = count;
        } else {
            totalPlayersWTA = count;
        }
        totalPlayers = count;

        console.log(`✅ ${rankingType.toUpperCase()} Datenbank geladen (${count} Spieler)`);
        return newDb;
    } catch (error) {
        console.error(`❌ Fehler beim Laden der ${rankingType.toUpperCase()} Datenbank:`, error);
        throw error;
    }
}

// =====================================================
// ===== MATCH-DATENBANK (VERWENDET GLOBALE DB) =====
// =====================================================

async function initMatchDatabase(rankingType) {
    const type = rankingType || currentRankingType || 'atp';

    if (window.getDatabase) {
        const db = window.getDatabase(type);
        if (db) {
            console.log(`✅ ${type.toUpperCase()}-Match-DB aus globalem Cache (wiederverwendet)`);
            return db;
        }
    }

    if (!window._dbLoading) window._dbLoading = {};
    if (window._dbLoading[type]) {
        console.log(`⏳ Warte auf laufende ${type.toUpperCase()}-DB Ladung...`);
        return await window._dbLoading[type];
    }

    console.warn(`⚠️ Keine globale DB für ${type}, lade direkt...`);

    window._dbLoading[type] = (async () => {
        try {
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            let dbBytes;

            if (isLocal) {
                const filename = type === 'atp' ? 'atp_matches.db' : 'wta_matches.db';
                const response = await fetch(`${MATCH_DATA_PATH}${filename}`);
                if (!response.ok) throw new Error(`${filename} nicht gefunden!`);
                dbBytes = new Uint8Array(await response.arrayBuffer());
            } else {
                const zipName = type === 'atp' ? 'atp_matches.zip' : 'wta_matches.zip';
                const zipUrl = `${BACKEND_URL}/dbs/${zipName}`;
                console.log(`📦 Lade ZIP: ${zipUrl}`);
                const response = await fetch(zipUrl);
                if (!response.ok) throw new Error(`${zipName} nicht gefunden!`);
                const zipBuf = await response.arrayBuffer();
                const unzipped = fflate.unzipSync(new Uint8Array(zipBuf));
                const filename = Object.keys(unzipped)[0];
                dbBytes = unzipped[filename];
            }

            const SQL = await initSqlJs({ locateFile: file => `https://sql.js.org/dist/${file}` });

            const db = new SQL.Database(dbBytes);
            db._rankingType = type;
            db._type = type;

            if (type === 'atp') {
                window.globalDbATP = db;
            } else {
                window.globalDbWTA = db;
            }

            console.log(`✅ ${type.toUpperCase()} Match-DB global gespeichert (${(dbBytes.byteLength/1024/1024).toFixed(1)} MB)`);
            delete window._dbLoading[type];
            return db;
        } catch (error) {
            console.error(`❌ Fehler beim Laden:`, error);
            delete window._dbLoading[type];
            return null;
        }
    })();

    return await window._dbLoading[type];
}

// =====================================================
// ===== MATCHES FÜR SPIELER LADEN (MIT GLOBALER DB) =====
// =====================================================

async function getPlayerMatches(playerName, limit = 10, offset = 0) {
    let database = null;

    if (window.getDatabase) {
        database = window.getDatabase(currentRankingType);
        if (database) {
            console.log(`✅ getPlayerMatches verwendet globale DB (${currentRankingType})`);
        }
    }

    if (!database) {
        console.warn(`⚠️ getPlayerMatches: Keine globale DB, lade lokal...`);
        database = await initMatchDatabase(currentRankingType);
    }

    if (!database) {
        console.error('❌ Keine Datenbank verfügbar');
        return [];
    }

    try {
        const stmt = database.prepare(`
            SELECT
                tourney_name, surface, tourney_date, round, score,
                minutes, winner_name, loser_name, w_ace, l_ace,
                CASE WHEN winner_name = ? THEN 'win' ELSE 'loss' END as result
            FROM matches
            WHERE winner_name = ? OR loser_name = ?
            ORDER BY tourney_date DESC
            LIMIT ? OFFSET ?
        `);
        stmt.bind([playerName, playerName, playerName, limit, offset]);

        const matches = [];
        while (stmt.step()) {
            matches.push(stmt.getAsObject());
        }
        stmt.free();
        return matches;
    } catch (error) {
        console.error('Fehler beim Laden der Matches:', error);
        return [];
    }
}

async function getPlayerMatchStats(playerName) {
    const database = await initMatchDatabase(currentRankingType);
    if (!database) return null;

    try {
        const stmt = database.prepare(`
            SELECT
                COUNT(CASE WHEN winner_name = ? THEN 1 END) as wins,
                COUNT(CASE WHEN loser_name = ? THEN 1 END) as losses,
                SUM(w_ace) as total_aces,
                SUM(minutes) as total_minutes,
                COUNT(*) as total_matches,
                COUNT(CASE WHEN winner_name = ? AND round = 'F' THEN 1 END) as titles,
                COUNT(CASE WHEN (winner_name = ? OR loser_name = ?) AND round = 'F' THEN 1 END) as finals,
                COUNT(CASE WHEN (winner_name = ? OR loser_name = ?) AND round = 'SF' THEN 1 END) as semifinals
            FROM matches
            WHERE winner_name = ? OR loser_name = ?
        `);

        stmt.bind([
            playerName, playerName, playerName,
            playerName, playerName,
            playerName, playerName,
            playerName, playerName
        ]);

        let stats = null;
        if (stmt.step()) {
            stats = stmt.getAsObject();
        }
        stmt.free();

        if (stats) {
            const grandSlamTournaments = [
                'australian open', 'french open', 'roland garros',
                'wimbledon', 'us open'
            ];

            const gsStmt = database.prepare(`
                SELECT COUNT(*) as count
                FROM matches
                WHERE winner_name = ?
                  AND round = 'F'
                  AND (${grandSlamTournaments.map(() => 'tourney_name LIKE ?').join(' OR ')})
                LIMIT 100
            `);
            const params = [playerName, ...grandSlamTournaments.map(gs => `%${gs}%`)];
            gsStmt.bind(params);

            let grandSlamTitles = 0;
            if (gsStmt.step()) {
                const result = gsStmt.getAsObject();
                grandSlamTitles = result.count || 0;
            }
            gsStmt.free();

            stats.grandSlamTitles = grandSlamTitles;
        }

        return stats;
    } catch (error) {
        console.error('Fehler beim Laden der Match-Statistiken:', error);
        return null;
    }
}

function formatRound(round) {
    if (!round) return '—';
    const roundMap = {
        'F': '🏆 Finale', 'SF': '🥇 Halbfinale', 'QF': 'Viertelfinale',
        'R16': 'Achtelfinale', 'R32': '2. Runde', 'R64': '1. Runde',
        'R128': '1. Runde', 'RR': 'Gruppenphase', 'BR': 'Bronze Match'
    };
    return roundMap[round] || round;
}

function formatSurface(surface) {
    if (!surface) return '—';
    const surfaceMap = {
        'Hard': '🏟️ Hartplatz', 'Clay': '🧱 Sand',
        'Grass': '🌿 Rasen', 'Carpet': '🟫 Teppich'
    };
    return surfaceMap[surface] || surface;
}

function formatMatchDate(date) {
    if (!date) return '—';
    const dateStr = String(date);
    if (dateStr.length === 8) {
        return `${dateStr.substring(6, 8)}.${dateStr.substring(4, 6)}.${dateStr.substring(0, 4)}`;
    }
    return dateStr;
}

function formatSurfacePreference(matches) {
    if (!matches || matches.length === 0) return '—';

    const surfaceCount = {};
    let maxCount = 0;
    let preferredSurface = '—';

    for (const match of matches) {
        if (match.surface) {
            const surface = match.surface;
            surfaceCount[surface] = (surfaceCount[surface] || 0) + 1;
            if (surfaceCount[surface] > maxCount) {
                maxCount = surfaceCount[surface];
                preferredSurface = surface;
            }
        }
    }

    const surfaceMap = {
        'Hard': '🏟️ Hartplatz', 'Clay': '🧱 Sand',
        'Grass': '🌿 Rasen', 'Carpet': '🟫 Teppich'
    };

    return surfaceMap[preferredSurface] || preferredSurface || '—';
}

// =====================================================
// ===== RENDER FUNKTIONEN =====
// =====================================================

function renderPlayerList(players, title, totalPlayers) {
    const container = document.getElementById('pageContent');
    const total = totalPlayers || players.length;
    const loadedCount = players.length;
    const remaining = total - loadedCount;

    let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
            <div style="display:flex;align-items:center;gap:14px;">
                <span style="font-size:20px;font-weight:700;color:#e0e6f0;">${title}</span>
                <span style="font-size:13px;color:#4a5a77;background:rgba(255,255,255,0.05);padding:4px 14px;border-radius:20px;">${loadedCount} von ${total}</span>
                ${total > 1000 ? `<span style="font-size:11px;color:#2a3a4a;">⚡ ${Math.round(total/1000)}k</span>` : ''}
            </div>
            <div style="font-size:11px;color:#2a3a4a;">🎯 Top 10 geladen</div>
        </div>

        <div style="display:flex;gap:10px;align-items:center;margin-bottom:20px;flex-wrap:wrap;">
            <div style="flex:1;min-width:180px;position:relative;">
                <input type="text" id="searchInput" placeholder="🔍 Spieler suchen..." onkeyup="handleSearch()" style="width:100%;padding:10px 16px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#e0e6f0;font-size:14px;outline:none;transition:0.3s;font-family:'Inter',sans-serif;">
                <span id="resultCount" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);color:#4a5a77;font-size:12px;">${loadedCount}</span>
            </div>
            <button onclick="clearSearch()" style="padding:10px 18px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);color:#7a8aa3;cursor:pointer;font-size:13px;transition:0.3s;font-family:'Inter',sans-serif;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">✕</button>
        </div>

        <div id="playerContainer">${buildPlayerList(players)}</div>
    `;

    if (remaining > 0 && !isLoadingMore) {
        html += `
            <div style="margin-top:16px;text-align:center;">
                <button id="loadMoreBtn" onclick="loadMorePlayers()" style="padding:12px 32px;border-radius:12px;border:1px solid rgba(46,204,113,0.3);background:rgba(46,204,113,0.08);color:#2ecc71;cursor:pointer;font-size:14px;transition:0.3s;font-family:'Inter',sans-serif;font-weight:500;"
                        onmouseover="this.style.background='rgba(46,204,113,0.15)';this.style.borderColor='rgba(46,204,113,0.5)'"
                        onmouseout="this.style.background='rgba(46,204,113,0.08)';this.style.borderColor='rgba(46,204,113,0.3)'">
                    📥 ${remaining} weitere Spieler laden
                </button>
            </div>
        `;
    }

    html += `
        <div style="font-size:11px;color:#2a3a4a;text-align:right;margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.04);">
            🎾 TennisAnalyzer · ${new Date().toLocaleDateString('de-DE')}
            ${loadedCount < total ? ` · ${remaining} Spieler verbleibend` : ' · Alle Spieler geladen ✅'}
        </div>
    `;

    container.innerHTML = html;
}

function buildPlayerList(players) {
    if (!players || players.length === 0) {
        return '<div style="color:#4a5a77;text-align:center;padding:40px 0;font-size:16px;">😕 Keine Spieler gefunden</div>';
    }

    const htmlParts = [];
    htmlParts.push('<div style="display:grid;grid-template-columns:1fr;gap:14px;">');

    for (let idx = 0; idx < players.length; idx++) {
        const p = players[idx];
        const initials = p.name.split(' ').map(w => w[0]).join('').substring(0, 2);
        const country = p.country || 'Unbekannt';
        const playerId = p.player_id;
        const rank = idx + 1;
        const imageUrl = p._imageUrl || null;
        const hasImage = imageUrl !== null;

        const iso = getCountryISO(country);
        const flagUrl = 'https://flagcdn.com/32x24/' + iso + '.png';
        const rankingDisplay = getPlayerRank(p.name, currentRankingType);
        const pointsDisplay = getPlayerPoints(p.name, currentRankingType);

        const rankColor = rank === 1 ? '#d4af37' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : '#4a5a77';
        const rankBg = rank === 1 ? 'rgba(212,175,55,0.15)' : rank === 2 ? 'rgba(192,192,192,0.15)' : rank === 3 ? 'rgba(205,127,50,0.15)' : 'rgba(255,255,255,0.03)';
        const rankBorder = rank === 1 ? 'rgba(212,175,55,0.3)' : rank === 2 ? 'rgba(192,192,192,0.3)' : rank === 3 ? 'rgba(205,127,50,0.3)' : 'rgba(255,255,255,0.06)';

        let avatarHtml;
        if (hasImage) {
            avatarHtml = `
                <div style="width:56px;height:56px;border-radius:50%;overflow:hidden;flex-shrink:0;border:2px solid ${rankColor};cursor:pointer;"
                     onclick="event.stopPropagation();openLightbox('${imageUrl}','${p.name}')"
                     onmouseover="this.style.transform='scale(1.05)'"
                     onmouseout="this.style.transform='scale(1)'">
                    <img src="${imageUrl}" alt="${p.name}" loading="lazy" style="width:100%;height:100%;object-fit:cover;"
                         onerror="this.style.display='none';this.parentElement.style.border='none';this.parentElement.innerHTML='<div style=\\'width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#1a472a,#2d5a3d);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;color:#fff;\\'>${initials}</div>'">
                </div>
            `;
        } else {
            avatarHtml = `
                <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#1a472a,#2d5a3d);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;color:#fff;flex-shrink:0;border:2px solid ${rankColor};">
                    ${initials}
                </div>
            `;
        }

        htmlParts.push(`
            <div style="background:${rankBg};border:1px solid ${rankBorder};border-radius:16px;padding:16px 20px;transition:0.25s;cursor:pointer;position:relative;overflow:hidden;"
                 onclick="showPlayerDetailById(${playerId}, currentRankingType)"
                 onmouseover="this.style.background='${rank === 1 ? 'rgba(212,175,55,0.2)' : rank === 2 ? 'rgba(192,192,192,0.2)' : rank === 3 ? 'rgba(205,127,50,0.2)' : 'rgba(255,255,255,0.06)'}';this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 30px rgba(0,0,0,0.3)'"
                 onmouseout="this.style.background='${rankBg}';this.style.transform='translateY(0)';this.style.boxShadow='none'">

                <div style="display:flex;align-items:center;gap:16px;">
                    ${avatarHtml}

                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span style="color:#e0e6f0;font-weight:600;font-size:17px;">${p.name}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;color:#7a8aa3;font-size:13px;margin-top:4px;">
                            <img src="${flagUrl}" alt="${country}" loading="lazy" style="width:18px;height:13px;border-radius:2px;border:1px solid rgba(255,255,255,0.08);">
                            ${country}
                        </div>
                        <div style="color:#f1c40f;font-weight:600;font-size:14px;margin-top:2px;">
                            ${pointsDisplay} <span style="color:#4a5a77;font-size:11px;font-weight:400;">Punkte</span>
                        </div>
                    </div>

                    <div style="background:rgba(46,204,113,0.08);border:2px solid rgba(46,204,113,0.2);border-radius:12px;padding:8px 18px;min-width:60px;text-align:center;flex-shrink:0;">
                        <div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;">Rang</div>
                        <div style="color:#2ecc71;font-size:28px;font-weight:800;line-height:1.1;">${rankingDisplay.replace('#', '')}</div>
                    </div>
                </div>
            </div>
        `);
    }

    htmlParts.push('</div>');
    return htmlParts.join('');
}

// =====================================================
// ===== MATCHES RENDER =====
// =====================================================

let currentMatchLimit = 10;
let currentPlayerName = '';

async function renderPlayerMatches(playerName, limit = 10) {
    const container = document.getElementById('playerMatchesContent');
    if (!container) return;

    container.innerHTML = `<div style="color:#7a8aa3;text-align:center;padding:10px 0;font-size:14px;">⏳ Lade Matches für ${playerName}...</div>`;

    try {
        const [matches, stats] = await Promise.all([
            getPlayerMatches(playerName, limit, 0),
            getPlayerMatchStats(playerName)
        ]);

        if (!matches || matches.length === 0) {
            container.innerHTML = `
                <div style="color:#7a8aa3;text-align:center;padding:20px 0;font-size:14px;">
                    📭 Keine Matches für "${playerName}" gefunden
                </div>
            `;
            return;
        }

        let html = '';

        if (stats) {
            const total = stats.total_matches || 0;
            const wins = stats.wins || 0;
            const losses = stats.losses || 0;
            const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
            const titles = stats.titles || 0;
            const finals = stats.finals || 0;
            const semifinals = stats.semifinals || 0;
            const totalAces = Math.round(stats.total_aces || 0);
            const grandSlamTitles = stats.grandSlamTitles || 0;

            const preferredSurface = formatSurfacePreference(matches);

            html += `
                <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:12px;padding:8px 10px;background:rgba(255,255,255,0.03);border-radius:10px;">
                    <div style="text-align:center;"><div style="color:#a0b3cc;font-size:16px;font-weight:700;">${total}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Matches</div></div>
                    <div style="text-align:center;"><div style="color:#2ecc71;font-size:16px;font-weight:700;">${wins}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Siege</div></div>
                    <div style="text-align:center;"><div style="color:#e74c3c;font-size:16px;font-weight:700;">${losses}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Niederlagen</div></div>
                    <div style="text-align:center;"><div style="color:#f1c40f;font-size:16px;font-weight:700;">${winRate}%</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Siegquote</div></div>
                    <div style="text-align:center;"><div style="color:#f39c12;font-size:16px;font-weight:700;">${totalAces}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Asse</div></div>
                    <div style="text-align:center;"><div style="color:#9b59b6;font-size:16px;font-weight:700;">${semifinals}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Halbfinale</div></div>
                    <div style="text-align:center;"><div style="color:#e67e22;font-size:16px;font-weight:700;">${finals}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Finale</div></div>
                    <div style="text-align:center;"><div style="color:#d4af37;font-size:16px;font-weight:700;">${titles}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Titel</div></div>
                    <div style="text-align:center;"><div style="color:#e74c3c;font-size:16px;font-weight:700;">${grandSlamTitles}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Grand Slam</div></div>
                    <div style="text-align:center;"><div style="color:#1abc9c;font-size:16px;font-weight:700;">${preferredSurface}</div><div style="color:#7a8aa3;font-size:9px;text-transform:uppercase;">Belag</div></div>
                </div>
            `;
        }

        html += `
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                    <thead>
                        <tr style="background:rgba(255,255,255,0.05);">
                            <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Datum</th>
                            <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Turnier</th>
                            <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Belag</th>
                            <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Runde</th>
                            <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Gegner</th>
                            <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Ergebnis</th>
                            <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Dauer</th>
                            <th style="padding:6px 10px;text-align:left;color:#7a8aa3;">Asse</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const match of matches) {
            const isWin = match.result === 'win';
            const opponent = isWin ? match.loser_name : match.winner_name;
            const bgColor = isWin ? 'rgba(46,204,113,0.08)' : 'rgba(231,76,60,0.08)';
            const resultColor = isWin ? '#2ecc71' : '#e74c3c';
            const resultText = isWin ? '✅' : '❌';

            const round = formatRound(match.round);
            const surface = formatSurface(match.surface);
            const date = formatMatchDate(match.tourney_date);
            const aces = isWin ? Math.round(Number(match.w_ace)) || 0 : Math.round(Number(match.l_ace)) || 0;

            html += `
                <tr style="background:${bgColor};border-bottom:1px solid rgba(255,255,255,0.03);">
                    <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${date}</td>
                    <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${match.tourney_name || '-'}</td>
                    <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${surface}</td>
                    <td style="padding:4px 10px;color:#f1c40f;font-weight:600;font-size:11px;">${round}</td>
                    <td style="padding:4px 10px;color:#c0d0e0;font-size:11px;">${opponent || '-'}</td>
                    <td style="padding:4px 10px;color:${resultColor};font-weight:600;font-size:11px;">${resultText} ${match.score || '-'}</td>
                    <td style="padding:4px 10px;color:#7a8aa3;font-size:11px;">${match.minutes ? match.minutes + 'min' : '-'}</td>
                    <td style="padding:4px 10px;color:#f1c40f;font-size:11px;text-align:center;">${aces}</td>
                </tr>
            `;
        }

        html += `
                    </tbody>
                </table>
            </div>
            <div style="margin-top:6px;font-size:11px;color:#4a5a77;text-align:right;">
                ${matches.length} Matches angezeigt
                ${matches.length >= limit ? ' · <span style="color:#2ecc71;cursor:pointer;" onclick="loadMoreMatches()">📥 Mehr laden</span>' : ''}
            </div>
        `;

        container.innerHTML = html;
    } catch (error) {
        console.error('Fehler beim Laden der Matches:', error);
        container.innerHTML = `<div style="color:#e74c3c;text-align:center;padding:10px 0;font-size:14px;">❌ Fehler beim Laden der Matches</div>`;
    }
}

function changeMatchLimit(newLimit) {
    currentMatchLimit = parseInt(newLimit);
    renderPlayerMatches(currentPlayerName, currentMatchLimit);
}

function loadMoreMatches() {
    currentMatchLimit += 10;
    renderPlayerMatches(currentPlayerName, currentMatchLimit);
}

// =====================================================
// ===== SPIELER DATENBANK FUNKTIONEN =====
// =====================================================

async function getPlayersFromDB(limit = 10, offset = 0) {
    const database = await initDatabase(currentRankingType);

    const stmt = database.prepare(`
        SELECT player_id, name_first, name_last, ioc, wikidata_id
        FROM players
        ORDER BY player_id
        LIMIT ? OFFSET ?
    `);
    stmt.bind([limit, offset]);

    const players = [];
    while (stmt.step()) {
        players.push(stmt.getAsObject());
    }
    stmt.free();
    return players;
}

async function getPlayersByIds(playerIds) {
    const database = await initDatabase(currentRankingType);

    const placeholders = playerIds.map(() => '?').join(',');
    const stmt = database.prepare(`
        SELECT player_id, name_first, name_last, ioc, wikidata_id
        FROM players
        WHERE player_id IN (${placeholders})
    `);
    stmt.bind(playerIds);

    const players = [];
    while (stmt.step()) {
        players.push(stmt.getAsObject());
    }
    stmt.free();
    return players;
}

async function getFullPlayerById(playerId) {
    const database = await initDatabase(currentRankingType);
    const stmt = database.prepare(`SELECT * FROM players WHERE player_id = ? LIMIT 1`);
    stmt.bind([playerId]);

    let player = null;
    if (stmt.step()) {
        player = stmt.getAsObject();
    }
    stmt.free();
    return player;
}

async function searchPlayersInDB(searchTerm) {
    const database = await initDatabase(currentRankingType);
    if (!database) return [];

    const term = `%${searchTerm}%`;

    const stmt = database.prepare(`
        SELECT player_id, name_first, name_last, ioc, wikidata_id
        FROM players
        WHERE name_first LIKE ?
           OR name_last LIKE ?
           OR (name_first || ' ' || name_last) LIKE ?
           OR (name_last || ' ' || name_first) LIKE ?
        LIMIT 50
    `);
    stmt.bind([term, term, term, term]);

    const players = [];
    while (stmt.step()) {
        players.push(stmt.getAsObject());
    }
    stmt.free();
    return players;
}

async function findPlayerInDatabaseByName(playerName) {
    try {
        const database = await initDatabase(currentRankingType);
        if (!database) return null;

        const stmt = database.prepare(`
            SELECT player_id, name_first, name_last, ioc, wikidata_id
            FROM players
            WHERE (name_first || ' ' || name_last) = ?
               OR (name_last || ' ' || name_first) = ?
            LIMIT 1
        `);

        const searchName = playerName.trim();
        stmt.bind([searchName, searchName]);

        let player = null;
        if (stmt.step()) {
            player = stmt.getAsObject();
        }
        stmt.free();
        return player;
    } catch (error) {
        console.error('Fehler beim Suchen in der Datenbank:', error);
        return null;
    }
}

// =====================================================
// ===== WEITERE FUNKTIONEN =====
// =====================================================

async function loadMorePlayers() {
    if (isLoadingMore || !hasMorePlayers) return;

    isLoadingMore = true;
    const currentCount = playerData.length;

    try {
        const nextBatch = await getPlayersFromDB(PLAYERS_PER_PAGE, currentCount);

        if (nextBatch.length === 0) {
            hasMorePlayers = false;
            isLoadingMore = false;
            document.getElementById('loadMoreBtn')?.remove();
            return;
        }

        const cleanedBatch = nextBatch.map(transformPlayerRow);

        playerData = playerData.concat(cleanedBatch);
        window.playerData = playerData;

        if (currentRankingType === 'atp') {
            window.playerDataATP = playerData;
        } else {
            window.playerDataWTA = playerData;
        }

        const title = currentRankingType === 'atp' ? '🏆 ATP' : '👑 WTA';
        renderPlayerList(playerData, title, totalPlayers);

        if (playerData.length >= totalPlayers) {
            hasMorePlayers = false;
            document.getElementById('loadMoreBtn')?.remove();
        }
    } catch (error) {
        console.error('Fehler beim Laden weiterer Spieler:', error);
    }

    isLoadingMore = false;
}

function handleSearch() {
    clearTimeout(searchTimer);

    const input = document.getElementById('searchInput');
    const term = input ? input.value.trim() : '';

    if (term.length === 0) {
        window._searchResults = null;
        window.playerData = playerData;
        const title = currentRankingType === 'atp' ? '🏆 ATP' : '👑 WTA';
        renderPlayerList(playerData, title, totalPlayers);
        const countEl = document.getElementById('resultCount');
        if (countEl) countEl.textContent = playerData.length;
        return;
    }

    if (term.length < 2) {
        return;
    }

    searchTimer = setTimeout(async function() {
        try {
            const results = await searchPlayersInDB(term);
            const cleanedResults = results.map(transformPlayerRow);

            window._searchResults = cleanedResults;
            window.playerData = cleanedResults;

            const container = document.getElementById('playerContainer');
            if (container) {
                container.innerHTML = buildPlayerList(cleanedResults);
            }

            const countEl = document.getElementById('resultCount');
            if (countEl) {
                countEl.textContent = cleanedResults.length + ' ✨';
            }
        } catch (error) {
            console.error('Fehler bei der Suche:', error);
        }
    }, 200);
}

function clearSearch() {
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = '';
        window._searchResults = null;
        window.playerData = playerData;
        const title = currentRankingType === 'atp' ? '🏆 ATP' : '👑 WTA';
        renderPlayerList(playerData, title, totalPlayers);
        const countEl = document.getElementById('resultCount');
        if (countEl) countEl.textContent = playerData.length;
        input.focus();
    }
}

// =====================================================
// ===== LIGHTBOX =====
// =====================================================

function openLightbox(imageUrl, playerName) {
    let lightbox = document.getElementById('lightbox');
    if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'lightbox';
        lightbox.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.3s ease;
            padding: 20px;
        `;
        document.body.appendChild(lightbox);

        lightbox.addEventListener('click', function() {
            closeLightbox();
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeLightbox();
            }
        });
    }

    lightbox.innerHTML = `
        <div style="position:relative;max-width:90%;max-height:90%;display:flex;flex-direction:column;align-items:center;" onclick="event.stopPropagation();">
            <div style="color:#7a8aa3;font-size:14px;margin-bottom:12px;text-align:center;">
                ${playerName}
                <span style="color:#4a5a77;margin-left:10px;font-size:12px;">(Klick zum Schließen)</span>
            </div>
            <img src="${imageUrl}" alt="${playerName}" style="max-width:100%;max-height:80vh;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,0.5);object-fit:contain;border:2px solid rgba(255,255,255,0.1);">
            <div style="color:#4a5a77;font-size:11px;margin-top:10px;">Quelle: Wikimedia Commons</div>
        </div>
    `;

    lightbox.style.display = 'flex';
    setTimeout(function() {
        lightbox.style.opacity = '1';
    }, 50);
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        lightbox.style.opacity = '0';
        setTimeout(function() {
            lightbox.style.display = 'none';
        }, 300);
    }
}

// =====================================================
// ===== DETAILANSICHT =====
// =====================================================

async function showPlayerDetailById(playerId, rankingTypeOverride) {
    if (!playerId) {
        console.error('❌ Keine player_id übergeben!');
        return;
    }

    let rankingType = rankingTypeOverride || currentRankingType || 'atp';
    currentRankingType = rankingType;
    window.currentRankingType = rankingType;

    console.log(`📌 showPlayerDetailById: playerId=${playerId}, rankingType=${rankingType}`);

    var container = document.getElementById('pageContent');
    container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:15px;">
            <div style="width:40px;height:40px;border:4px solid rgba(46,204,113,0.2);border-top:4px solid #2ecc71;border-radius:50%;animation:spin 1s linear infinite;"></div>
            <div style="color:#7a8aa3;font-size:16px;">⏳ Lade Spieler-Details...</div>
        </div>
        <style>
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
    `;

    try {
        const fullPlayer = await getFullPlayerById(playerId);
        if (!fullPlayer) throw new Error('Spieler nicht gefunden');

        const fullName = fullPlayer.name_first && fullPlayer.name_last
            ? `${fullPlayer.name_first} ${fullPlayer.name_last}`.trim()
            : fullPlayer.name_first || fullPlayer.name_last || 'Unbekannt';

        let imageUrl = null;
        if (fullPlayer.wikidata_id) {
            imageUrl = await getPlayerImage(fullPlayer.wikidata_id);
        }

        const eloData = await getPlayerElo(fullName);
        const eloDisplay = eloData && eloData.elo ? eloData.elo : '—';

        const player = {
            player_id: fullPlayer.player_id,
            name: fullName,
            name_first: fullPlayer.name_first || '',
            name_last: fullPlayer.name_last || '',
            country: getCountryName(fullPlayer.ioc),
            country_code: fullPlayer.ioc || 'UNK',
            height: fullPlayer.height || '—',
            weight: fullPlayer.weight || '—',
            birth_date: fullPlayer.dob || '—',
            age: calculateAge(fullPlayer.dob),
            hand: fullPlayer.hand || '—',
            sex: currentRankingType === 'wta' ? 'Weiblich' : 'Männlich',
            plays: fullPlayer.hand === 'R' ? 'Rechts' : fullPlayer.hand === 'L' ? 'Links' : '—',
            wikidata_id: fullPlayer.wikidata_id || '',
            _imageUrl: imageUrl,
            _elo: eloDisplay
        };

        renderDetail(player);
    } catch (error) {
        console.error('❌ Fehler beim Laden der Details:', error);
        container.innerHTML = `
            <div style="padding:20px;">
                <button onclick="backToPlayerList()" style="background:transparent;border:1px solid rgba(255,255,255,0.1);color:#a0b3cc;padding:8px 20px;border-radius:10px;cursor:pointer;font-size:14px;font-family:'Inter',sans-serif;">← Zurück zur Liste</button>
                <div style="color:#e74c3c;padding:20px;text-align:center;font-size:16px;">❌ Fehler: ${error.message}</div>
            </div>
        `;
    }
}

async function showPlayerDetail(index) {
    let data = window.playerData || playerData;

    if (window._searchResults && window._searchResults.length > 0) {
        if (index < window._searchResults.length) {
            data = window._searchResults;
        }
    }

    var p = data[index];
    if (p && p.player_id) {
        showPlayerDetailById(p.player_id, currentRankingType);
    } else {
        console.error('❌ Spieler nicht gefunden! Index:', index);
        if (playerData[index]) {
            showPlayerDetailById(playerData[index].player_id, currentRankingType);
        }
    }
}

function renderDetail(p) {
    var container = document.getElementById('pageContent');
    var name = p.name || 'Unbekannt';
    var country = p.country || 'Unbekannt';
    var iso = getCountryISO(country);
    var flagUrl = 'https://flagcdn.com/32x24/' + iso + '.png';
    var imageUrl = p._imageUrl || null;
    var hasImage = imageUrl !== null;
    var initials = name.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2);
    var age = p.age || '—';
    var height = p.height || '—';
    var weight = p.weight || '—';
    var hand = p.hand === 'R' ? 'Rechts' : p.hand === 'L' ? 'Links' : '—';
    var birthDate = p.birth_date || '—';
    var sex = p.sex || 'ATP';
    var playerId = p.player_id || '—';
    var elo = p._elo || '—';

    var rankingDisplay = getPlayerRank(name, currentRankingType);
    var pointsDisplay = getPlayerPoints(name, currentRankingType);

    let formattedBirthDate = birthDate;
    if (birthDate && birthDate !== '—' && String(birthDate).length === 8) {
        const bd = String(birthDate);
        formattedBirthDate = `${bd.substring(6, 8)}.${bd.substring(4, 6)}.${bd.substring(0, 4)}`;
    }

    currentPlayerName = name;
    currentMatchLimit = 10;

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:20px;">
            <div>
                <button onclick="backToPlayerList()" style="background:transparent;border:1px solid rgba(255,255,255,0.1);color:#a0b3cc;padding:8px 20px;border-radius:10px;cursor:pointer;font-size:14px;font-family:'Inter',sans-serif;transition:0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">← Zurück zur Liste</button>
            </div>

            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:32px;">
                <div style="display:flex;align-items:center;gap:28px;margin-bottom:28px;padding-bottom:24px;border-bottom:2px solid rgba(46,204,113,0.15);flex-wrap:wrap;">
                    ${hasImage ? `
                    <div style="width:88px;height:88px;border-radius:50%;overflow:hidden;flex-shrink:0;border:3px solid rgba(46,204,113,0.3);cursor:pointer;"
                         onclick="openLightbox('${imageUrl}','${name}')"
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
                        <div style="color:#7a8aa3;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${sex} Spieler</div>
                        <div style="color:#ffffff;font-size:32px;font-weight:700;margin:4px 0;">${name}</div>
                        <div style="color:#a0b3cc;font-size:16px;display:flex;align-items:center;gap:8px;">
                            <img src="${flagUrl}" alt="${country}" loading="lazy" style="width:24px;height:16px;border-radius:3px;border:1px solid rgba(255,255,255,0.08);">
                            ${country}
                        </div>
                        <div style="color:#f1c40f;font-size:18px;font-weight:700;margin-top:4px;">
                            ${pointsDisplay} <span style="font-size:13px;font-weight:400;color:#7a8aa3;">Punkte</span>
                        </div>
                        <div style="color:#2ecc71;font-size:18px;font-weight:700;margin-top:2px;">
                            🔥 ${elo} <span style="font-size:13px;font-weight:400;color:#7a8aa3;">ELO</span>
                        </div>
                    </div>

                    <div style="background:rgba(46,204,113,0.08);border:2px solid rgba(46,204,113,0.2);border-radius:16px;padding:16px 28px;min-width:100px;text-align:center;flex-shrink:0;">
                        <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Ranking</div>
                        <div style="color:#2ecc71;font-size:42px;font-weight:800;line-height:1.1;">${rankingDisplay.replace('#', '')}</div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(7, 1fr);gap:10px;">
                    ${detailTile('🎂','Geburtstag',formattedBirthDate)}
                    ${detailTile('📅','Alter',age)}
                    ${detailTile('📏','Größe',height !== '—' ? height + ' cm' : '—')}
                    ${detailTile('⚖️','Gewicht',weight !== '—' ? weight + ' kg' : '—')}
                    ${detailTile('✋','Spielhand',hand)}
                    ${detailTile('🎯','Spieler-ID',playerId)}
                    ${detailTile('📊','ELO Rating',elo)}

                    <div id="statsMatches" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;text-align:center;transition:0.3s;">
                        <div style="font-size:22px;margin-bottom:2px;">🎾</div>
                        <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;">Matches gesamt</div>
                        <div style="color:#e0e6f0;font-size:16px;font-weight:600;margin-top:2px;" id="statMatchesTotal">⏳</div>
                    </div>

                    <div id="statsAces" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;text-align:center;transition:0.3s;">
                        <div style="font-size:22px;margin-bottom:2px;">💪</div>
                        <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;">Asse</div>
                        <div style="color:#e0e6f0;font-size:16px;font-weight:600;margin-top:2px;" id="statTotalAces">⏳</div>
                    </div>

                    <div id="statsWins" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;text-align:center;transition:0.3s;">
                        <div style="font-size:22px;margin-bottom:2px;">✅</div>
                        <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;">Siege</div>
                        <div style="color:#e0e6f0;font-size:16px;font-weight:600;margin-top:2px;" id="statWins">⏳</div>
                    </div>

                    <div id="statsLosses" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;text-align:center;transition:0.3s;">
                        <div style="font-size:22px;margin-bottom:2px;">❌</div>
                        <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;">Niederlagen</div>
                        <div style="color:#e0e6f0;font-size:16px;font-weight:600;margin-top:2px;" id="statLosses">⏳</div>
                    </div>

                    <div id="statsWinRate" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;text-align:center;transition:0.3s;">
                        <div style="font-size:22px;margin-bottom:2px;">📊</div>
                        <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;">Siegquote</div>
                        <div style="color:#e0e6f0;font-size:16px;font-weight:600;margin-top:2px;" id="statWinRate">⏳</div>
                    </div>

                    <div id="statsSemifinals" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;text-align:center;transition:0.3s;">
                        <div style="font-size:22px;margin-bottom:2px;">🥇</div>
                        <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;">Halbfinale</div>
                        <div style="color:#e0e6f0;font-size:16px;font-weight:600;margin-top:2px;" id="statSemifinals">⏳</div>
                    </div>

                    <div id="statsFinals" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;text-align:center;transition:0.3s;">
                        <div style="font-size:22px;margin-bottom:2px;">🏆</div>
                        <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;">Finale</div>
                        <div style="color:#e0e6f0;font-size:16px;font-weight:600;margin-top:2px;" id="statFinals">⏳</div>
                    </div>

                    <div id="statsTitles" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;text-align:center;transition:0.3s;">
                        <div style="font-size:22px;margin-bottom:2px;">👑</div>
                        <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;">Titel</div>
                        <div style="color:#e0e6f0;font-size:16px;font-weight:600;margin-top:2px;" id="statTitles">⏳</div>
                    </div>

                    <div id="statsGrandSlam" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;text-align:center;transition:0.3s;">
                        <div style="font-size:22px;margin-bottom:2px;">🎾</div>
                        <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;">Grand Slam Titel</div>
                        <div style="color:#e0e6f0;font-size:16px;font-weight:600;margin-top:2px;" id="statGrandSlam">⏳</div>
                    </div>

                    <div id="statsSurface" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;text-align:center;transition:0.3s;">
                        <div style="font-size:22px;margin-bottom:2px;">🌍</div>
                        <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;">bevorzugter Belag</div>
                        <div style="color:#e0e6f0;font-size:16px;font-weight:600;margin-top:2px;" id="statSurface">⏳</div>
                    </div>
                </div>

                <div id="playerMatchesContainer" style="margin-top:20px;padding-top:20px;border-top:2px solid rgba(255,255,255,0.06);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
                        <span style="color:#a0b3cc;font-size:15px;font-weight:600;">🎾 Match-Übersicht</span>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="color:#7a8aa3;font-size:12px;">Anzeigen:</span>
                            <select id="matchLimitSelect" style="background:#141b2b;color:#e0e6f0;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;font-family:'Inter',sans-serif;" onchange="changeMatchLimit(this.value)">
                                <option value="5">5</option>
                                <option value="10" selected>10</option>
                                <option value="15">15</option>
                                <option value="20">20</option>
                                <option value="30">30</option>
                                <option value="50">50</option>
                                <option value="70">70</option>
                                <option value="100">100</option>
                                <option value="150">150</option>
                                <option value="200">200</option>
                                <option value="250">250</option>
                                <option value="500">500</option>
                                <option value="1000">1000</option>
                            </select>
                        </div>
                    </div>
                    <div id="playerMatchesContent" style="margin-top:10px;">
                        <div style="color:#7a8aa3;text-align:center;padding:10px 0;font-size:14px;">⏳ Lade Matches...</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        renderPlayerMatches(currentPlayerName, currentMatchLimit);
        updatePlayerStats(currentPlayerName);
    }, 300);
}

function detailTile(icon, label, value) {
    return `
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;text-align:center;transition:0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.07)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
            <div style="font-size:22px;margin-bottom:2px;">${icon}</div>
            <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;">${label}</div>
            <div style="color:#e0e6f0;font-size:16px;font-weight:600;margin-top:2px;">${value}</div>
        </div>
    `;
}

async function updatePlayerStats(playerName) {
    try {
        const stats = await getPlayerMatchStats(playerName);
        if (!stats) return;

        const total = stats.total_matches || 0;
        const wins = stats.wins || 0;
        const losses = stats.losses || 0;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        const titles = stats.titles || 0;
        const finals = stats.finals || 0;
        const semifinals = stats.semifinals || 0;
        const totalAces = Math.round(stats.total_aces || 0);
        const grandSlamTitles = stats.grandSlamTitles || 0;

        const allMatchesForSurface = await getPlayerMatches(playerName, 9999, 0);
        const preferredSurface = formatSurfacePreference(allMatchesForSurface);

        const setStat = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        setStat('statMatchesTotal', total);
        setStat('statTotalAces', totalAces);
        setStat('statWins', wins);
        setStat('statLosses', losses);
        setStat('statWinRate', winRate + '%');
        setStat('statSemifinals', semifinals);
        setStat('statFinals', finals);
        setStat('statTitles', titles);
        setStat('statGrandSlam', grandSlamTitles);
        setStat('statSurface', preferredSurface);

    } catch (error) {
        console.error('Fehler beim Aktualisieren der Statistiken:', error);
    }
}

function backToPlayerList() {
    const title = currentRankingType === 'atp' ? '🏆 ATP' : '👑 WTA';
    window._searchResults = null;
    window.playerData = playerData;
    renderPlayerList(playerData, title, totalPlayers);
}

// =====================================================
// ===== GLOBALE EXPORTS =====
// =====================================================

window.loadPlayers = loadPlayers;
window.loadPlayersModule = loadPlayers;
window.loadMorePlayers = loadMorePlayers;
window.handleSearch = handleSearch;
window.clearSearch = clearSearch;
window.showPlayerDetail = showPlayerDetail;
window.showPlayerDetailById = showPlayerDetailById;
window.backToPlayerList = backToPlayerList;
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
window.playerData = playerData;
window.getPlayerRank = getPlayerRank;
window.getPlayerPoints = getPlayerPoints;
window.renderPlayerMatches = renderPlayerMatches;
window.changeMatchLimit = changeMatchLimit;
window.loadMoreMatches = loadMoreMatches;
window.updatePlayerStats = updatePlayerStats;
window.getPlayerMatches = getPlayerMatches;
window.getPlayerMatchStats = getPlayerMatchStats;
window.TOP_PLAYERS_ATP = TOP_PLAYERS_ATP;
window.TOP_PLAYERS_WTA = TOP_PLAYERS_WTA;

window.initDatabase = initDatabase;
window.initMatchDatabase = initMatchDatabase;

console.log('✅ players.js geladen (MAXIMALE PERFORMANCE + MATCHES + ERWEITERTE STATS + ELO)');
console.log('📌 loadPlayers verfügbar:', typeof window.loadPlayers);