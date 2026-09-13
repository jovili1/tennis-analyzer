// ==========================================
// MATCH PREDICTOR MODUL - MAXIMUM PERFORMANCE
// ==========================================

console.log('🔥 match_predictor.js wird geladen...');

// ===== API-URL (lokal vs. online) =====
var API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? ''
    : 'https://tennis-analyzer-api.onrender.com';

var BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? '..'
    : 'https://jovili1.github.io/tennis-analyzer';

let predictorState = {
    type: 'atp',
    player1: null,
    player2: null,
    players: [],
    tournaments: [],
    cacheLoaded: false,
    matchDb: null,
    imageCache: {},
    imageCacheKeys: [],
    searchTerm1: '',
    searchTerm2: '',
    selectedSurface: 'Hartplatz',
    selectedBestOf: 3,
    selectedTournament: '',
    tournamentDropdownOpen: false,
    predictionResult: null,
    isLoading: false,
    bookieOdds: ''
};

// ===== SURFACES (DEUTSCH) =====
const SURFACES = ['Hartplatz', 'Sand', 'Rasen'];
const BEST_OF = [3, 5];
const ELO_SPREAD = 320;

// ===== HELPER: BILD LADEN =====
function cacheImage(key, url) {
    predictorState.imageCache[key] = url;
    predictorState.imageCacheKeys.push(key);
    while (predictorState.imageCacheKeys.length > 30) {
        const old = predictorState.imageCacheKeys.shift();
        delete predictorState.imageCache[old];
    }
}

async function loadImage(id) {
    if (!id) return null;
    const key = 'wikidata_img_' + id;
    if (predictorState.imageCache[key]) return predictorState.imageCache[key];
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

// ===== LOAD MATCH DB =====
async function loadMatchDb(type) {
    if (window.getDatabase) {
        const db = window.getDatabase(type);
        if (db) {
            console.log(`✅ Match-DB aus globalem Cache (wiederverwendet)`);
            predictorState.matchDb = db;
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

        predictorState.matchDb = new SQL.Database(dbBytes);
        predictorState.matchDb._type = type;
        window.dbMatches = predictorState.matchDb;

        if (type === 'atp') {
            window.globalDbATP = predictorState.matchDb;
        } else {
            window.globalDbWTA = predictorState.matchDb;
        }

        console.log(`✅ Match-DB geladen (${type.toUpperCase()})`);
        return predictorState.matchDb;
    } catch (e) {
        console.error(e);
        return null;
    }
}

// ===== PLAYERS LADEN =====
async function loadPlayers(type) {
    if (predictorState.cacheLoaded && predictorState.type === type) return predictorState.players;
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
        predictorState.players = players;
        predictorState.cacheLoaded = true;
        predictorState.type = type;
        console.log(`✅ ${players.length} Spieler (${type.toUpperCase()})`);
        return players;
    } catch (e) { console.error(e); return []; }
}

// ===== TURNIERE AUS DER DATENBANK LADEN =====
async function loadTournamentsFromDB(type) {
    const db = await loadMatchDb(type);
    if (!db) return [];

    try {
        const stmt = db.prepare(`
            SELECT DISTINCT
                tourney_name,
                surface,
                tourney_level
            FROM matches
            WHERE tourney_name IS NOT NULL
              AND tourney_name != ''
              AND surface IS NOT NULL
              AND surface != ''
            ORDER BY tourney_name ASC
        `);

        const tournaments = [];
        const seen = new Set();
        while (stmt.step()) {
            const row = stmt.getAsObject();
            const name = row.tourney_name;

            if (seen.has(name)) continue;
            seen.add(name);

            let surface = 'Hartplatz';
            const surf = (row.surface || '').toLowerCase();
            if (surf.includes('clay')) surface = 'Sand';
            else if (surf.includes('grass')) surface = 'Rasen';
            else if (surf.includes('hard')) surface = 'Hartplatz';

            let bestOf = 3;
            const nameLower = name.toLowerCase();

            if (nameLower.includes('australian open') || nameLower.includes('french open') ||
                nameLower.includes('wimbledon') || nameLower.includes('us open') ||
                nameLower.includes('roland garros')) {
                if (type === 'atp') {
                    bestOf = 5;
                } else {
                    bestOf = 3;
                }
            } else if (nameLower.includes('finals')) {
                bestOf = 3;
            } else if (nameLower.includes('davis cup')) {
                bestOf = 3;
            }

            let category = 'Sonstige';
            if (nameLower.includes('australian open') || nameLower.includes('french open') ||
                nameLower.includes('wimbledon') || nameLower.includes('us open') ||
                nameLower.includes('roland garros')) {
                category = 'Grand Slam';
            } else if (nameLower.includes('indian wells') || nameLower.includes('miami') ||
                       nameLower.includes('monte carlo') || nameLower.includes('madrid') ||
                       nameLower.includes('rome') || nameLower.includes('canada') ||
                       nameLower.includes('cincinnati') || nameLower.includes('shanghai') ||
                       nameLower.includes('paris')) {
                category = 'Masters 1000';
            } else if (nameLower.includes('finals')) {
                category = 'Tour Finals';
            } else if (nameLower.includes('500')) {
                category = 'ATP 500';
            } else if (nameLower.includes('250')) {
                category = 'ATP 250';
            } else if (nameLower.includes('challenger')) {
                category = 'Challenger';
            } else if (nameLower.includes('itf')) {
                category = 'ITF';
            }

            tournaments.push({
                name: name,
                surface: surface,
                category: category,
                bestOf: bestOf,
                search: name.toLowerCase()
            });
        }
        stmt.free();

        const categoryOrder = {
            'Grand Slam': 1,
            'Masters 1000': 2,
            'Tour Finals': 3,
            'ATP 500': 4,
            'ATP 250': 5,
            'Challenger': 6,
            'ITF': 7,
            'Sonstige': 8
        };
        tournaments.sort((a, b) => {
            const orderA = categoryOrder[a.category] || 99;
            const orderB = categoryOrder[b.category] || 99;
            if (orderA !== orderB) return orderA - orderB;
            return a.name.localeCompare(b.name);
        });

        console.log(`✅ ${tournaments.length} Turniere aus DB geladen (${type.toUpperCase()})`);
        return tournaments;
    } catch (e) {
        console.error('❌ Fehler beim Laden der Turniere:', e);
        return [];
    }
}

function getTournamentByName(name) {
    return predictorState.tournaments.find(t => t.name === name) || null;
}

// =====================================================
// ===== ELO LADEN (ÜBER API) =====
// =====================================================

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

async function loadAllElosForPlayer(playerName) {
    try {
        const [gesamt, hard, clay, grass] = await Promise.all([
            loadEloForPlayer(playerName, 'Rolling_Gesamt'),
            loadEloForPlayer(playerName, 'Rolling_Hard'),
            loadEloForPlayer(playerName, 'Rolling_Clay'),
            loadEloForPlayer(playerName, 'Rolling_Grass')
        ]);

        const hasRealElo = gesamt && gesamt.elo && gesamt.elo !== 1500;

        return {
            elo: gesamt?.elo || 1500,
            hard_elo: hard?.elo || 1500,
            clay_elo: clay?.elo || 1500,
            grass_elo: grass?.elo || 1500,
            matches: gesamt?.matches_played || 0,
            wins: gesamt?.wins || 0,
            losses: gesamt?.losses || 0,
            win_rate: gesamt && gesamt.matches_played > 0 ? Math.round((gesamt.wins / gesamt.matches_played) * 100) : 0,
            form_factor: gesamt?.form_factor || 1.0,
            fatigue_factor: gesamt?.fatigue_factor || 1.0,
            serve_factor: gesamt?.serve_factor || 1.0,
            experience_factor: gesamt?.experience_factor || 1.0,
            has_elo: hasRealElo
        };
    } catch (error) {
        console.error('❌ Fehler beim Laden der ELOs:', error);
        return {
            elo: 1500, hard_elo: 1500, clay_elo: 1500, grass_elo: 1500,
            matches: 0, wins: 0, losses: 0, win_rate: 0,
            form_factor: 1.0, fatigue_factor: 1.0, serve_factor: 1.0, experience_factor: 1.0,
            has_elo: false
        };
    }
}

// =====================================================
// 🔥 H2H DATEN LADEN (umbenannt → vermeidet Konflikt mit h2h.js)
// =====================================================

async function loadH2HData(p1Name, p2Name) {
    try {
        const db = await loadMatchDb(predictorState.type);
        if (!db) return { wins: 0, losses: 0, total: 0 };

        const stmt = db.prepare(`
            SELECT winner_name, loser_name, tourney_date, tourney_name, score, surface
            FROM matches
            WHERE (winner_name = ? AND loser_name = ?)
               OR (winner_name = ? AND loser_name = ?)
            ORDER BY tourney_date DESC
        `);
        stmt.bind([p1Name, p2Name, p2Name, p1Name]);

        let p1Wins = 0, p2Wins = 0;
        const matches = [];
        while (stmt.step()) {
            const m = stmt.getAsObject();
            matches.push(m);
            if (m.winner_name === p1Name) p1Wins++;
            else p2Wins++;
        }
        stmt.free();

        console.log(`✅ H2H: ${p1Name} ${p1Wins} : ${p2Wins} ${p2Name} (${matches.length} Duelle)`);

        return {
            wins: p1Wins,
            losses: p2Wins,
            total: p1Wins + p2Wins,
            matches: matches
        };
    } catch (e) {
        console.error('❌ Fehler beim H2H-Laden:', e);
        return { wins: 0, losses: 0, total: 0 };
    }
}

// =====================================================
// ===== SETZMODELL =====
// =====================================================

function calculateSetModel(prob1, bestOf) {
    if (bestOf === 3) {
        const p1WinSet = prob1 / 100;
        const p2WinSet = 1 - p1WinSet;

        const p1_2_0 = Math.pow(p1WinSet, 2);
        const p1_2_1 = 2 * Math.pow(p1WinSet, 2) * p2WinSet;
        const p2_2_0 = Math.pow(p2WinSet, 2);
        const p2_2_1 = 2 * Math.pow(p2WinSet, 2) * p1WinSet;

        return {
            '2:0': Math.round(p1_2_0 * 100),
            '2:1': Math.round(p1_2_1 * 100),
            '0:2': Math.round(p2_2_0 * 100),
            '1:2': Math.round(p2_2_1 * 100)
        };
    } else {
        const p1WinSet = prob1 / 100;
        const p2WinSet = 1 - p1WinSet;

        const p1_3_0 = Math.pow(p1WinSet, 3);
        const p1_3_1 = 3 * Math.pow(p1WinSet, 3) * p2WinSet;
        const p1_3_2 = 6 * Math.pow(p1WinSet, 3) * Math.pow(p2WinSet, 2);
        const p2_3_0 = Math.pow(p2WinSet, 3);
        const p2_3_1 = 3 * Math.pow(p2WinSet, 3) * p1WinSet;
        const p2_3_2 = 6 * Math.pow(p2WinSet, 3) * Math.pow(p1WinSet, 2);

        return {
            '3:0': Math.round(p1_3_0 * 100),
            '3:1': Math.round(p1_3_1 * 100),
            '3:2': Math.round(p1_3_2 * 100),
            '0:3': Math.round(p2_3_0 * 100),
            '1:3': Math.round(p2_3_1 * 100),
            '2:3': Math.round(p2_3_2 * 100)
        };
    }
}

// =====================================================
// ===== UNDERDOG SATZ-GEWINN WAHRSCHEINLICHKEIT (ELO) =====
// =====================================================

function calculateSetWinProbability(prob1, bestOf) {
    const p1WinSet = prob1 / 100;
    const p2WinSet = 1 - p1WinSet;

    let underdogWinsSet = 0;
    let underdogName = '';

    if (prob1 >= 50) {
        underdogWinsSet = p2WinSet;
        underdogName = 'Spieler 2';
    } else {
        underdogWinsSet = p1WinSet;
        underdogName = 'Spieler 1';
    }

    let underdogWinsAtLeastOneSet = 0;

    if (bestOf === 3) {
        const favoriteWinSets = 1 - underdogWinsSet;
        const favoriteWins2_0 = Math.pow(favoriteWinSets, 2);
        underdogWinsAtLeastOneSet = 1 - favoriteWins2_0;
    } else {
        const favoriteWinSets = 1 - underdogWinsSet;
        const favoriteWins3_0 = Math.pow(favoriteWinSets, 3);
        underdogWinsAtLeastOneSet = 1 - favoriteWins3_0;
    }

    return {
        underdogName: underdogName,
        probability: Math.round(underdogWinsAtLeastOneSet * 100),
        probabilityFormatted: (underdogWinsAtLeastOneSet * 100).toFixed(1) + '%'
    };
}

// =====================================================
// ===== UNDERDOG SATZ-GEWINN AUS MATCH-DB =====
// =====================================================

async function calculateSetWinFromMatchDB(player1, player2, bestOf) {
    try {
        const db = await loadMatchDb(predictorState.type);
        if (!db) return null;

        const surface = predictorState.selectedSurface;
        const dbSurface = surface === 'Hartplatz' ? 'Hard' : surface === 'Sand' ? 'Clay' : 'Grass';

        const elos1 = await loadAllElosForPlayer(player1);
        const elos2 = await loadAllElosForPlayer(player2);
        const surfaceEloMap = { 'Hartplatz': 'hard_elo', 'Sand': 'clay_elo', 'Rasen': 'grass_elo' };
        const surfaceElo1 = elos1 ? elos1[surfaceEloMap[surface]] || elos1.elo : 1500;
        const surfaceElo2 = elos2 ? elos2[surfaceEloMap[surface]] || elos2.elo : 1500;
        const combinedElo1 = (elos1?.elo || 1500) * 0.5 + surfaceElo1 * 0.5;
        const combinedElo2 = (elos2?.elo || 1500) * 0.5 + surfaceElo2 * 0.5;

        const eloProb1 = 1 / (1 + Math.pow(10, (combinedElo2 - combinedElo1) / ELO_SPREAD));

        let underdogName, favoriteName;
        if (eloProb1 >= 0.5) {
            underdogName = player2;
            favoriteName = player1;
        } else {
            underdogName = player1;
            favoriteName = player2;
        }

        function getRelevantMatches(player) {
            const stmt = db.prepare(`
                SELECT winner_name, loser_name, score, surface, tourney_date, best_of
                FROM matches
                WHERE (winner_name = ? OR loser_name = ?)
                ORDER BY tourney_date DESC
                LIMIT 200
            `);
            stmt.bind([player, player]);

            const matches = [];
            while (stmt.step()) {
                const match = stmt.getAsObject();
                const opponent = match.winner_name === player ? match.loser_name : match.winner_name;

                let timeWeight = 1.0;
                if (match.tourney_date) {
                    const dateStr = String(match.tourney_date);
                    if (dateStr.length >= 8) {
                        const year = parseInt(dateStr.substring(0, 4));
                        const month = parseInt(dateStr.substring(4, 6)) - 1;
                        const day = parseInt(dateStr.substring(6, 8));
                        const matchDate = new Date(year, month, day);
                        const now = new Date();
                        const daysDiff = (now - matchDate) / (1000 * 60 * 60 * 24);
                        if (daysDiff > 730) {
                            timeWeight = Math.max(0.1, 1.0 - (daysDiff - 730) / 730);
                        }
                    }
                }

                let surfWeight = 1.0;
                if (match.surface && match.surface.toLowerCase() === dbSurface.toLowerCase()) {
                    surfWeight = 1.5;
                }

                matches.push({
                    ...match,
                    timeWeight: timeWeight,
                    surfWeight: surfWeight,
                    opponent: opponent
                });
            }
            stmt.free();
            return matches;
        }

        const underdogMatches = getRelevantMatches(underdogName);
        const favoriteMatches = getRelevantMatches(favoriteName);

        function calculateStats(player, matches) {
            let totalWeight = 0;
            let matchesWithSet = 0;
            let totalMatches = 0;
            let relevantMatches = 0;

            for (const match of matches) {
                totalMatches++;
                const isWinner = match.winner_name === player;
                const isLoser = !isWinner;

                let matchWeight = match.timeWeight * match.surfWeight;

                const score = match.score || '';
                const sets = score.split(' ');
                let playerSetsWon = 0;

                for (const setScore of sets) {
                    if (setScore.includes('-')) {
                        const parts = setScore.split('-');
                        if (parts.length === 2) {
                            const g1 = parseInt(parts[0].replace(/\(.*\)/, ''));
                            const g2 = parseInt(parts[1].replace(/\(.*\)/, ''));
                            if (!isNaN(g1) && !isNaN(g2)) {
                                if (isWinner) {
                                    if (g1 > g2) playerSetsWon++;
                                } else {
                                    if (g1 < g2) playerSetsWon++;
                                }
                            }
                        }
                    }
                }

                let resultWeight = 1.0;
                if (isWinner) resultWeight = 0.3;

                const finalWeight = matchWeight * resultWeight;

                if (playerSetsWon >= 1) {
                    matchesWithSet += finalWeight;
                }
                totalWeight += finalWeight;

                if (playerSetsWon >= 1 && isLoser) {
                    relevantMatches++;
                }
            }

            return {
                totalMatches: totalMatches,
                matchesWithAtLeastOneSet: matchesWithSet,
                weightedRate: totalWeight > 0 ? matchesWithSet / totalWeight : 0.5,
                simpleRate: totalMatches > 0 ? matchesWithSet / totalMatches : 0.5,
                relevantMatches: relevantMatches
            };
        }

        const underdogStats = calculateStats(underdogName, underdogMatches);
        const favoriteStats = calculateStats(favoriteName, favoriteMatches);

        let underdogSetWinProb = underdogStats.weightedRate || 0.5;

        const underdogWinRate = underdogMatches.filter(m => m.winner_name === underdogName).length / underdogMatches.length || 0.5;
        if (underdogWinRate > 0.5) {
            underdogSetWinProb = underdogSetWinProb * (1 - (underdogWinRate - 0.5) * 0.5);
        }

        const favoriteShutoutRate = 1 - favoriteStats.weightedRate || 0.5;
        let combinedProb = (underdogSetWinProb + favoriteShutoutRate) / 2;

        const eloUnderdogProb = eloProb1 >= 0.5 ? 1 - eloProb1 : eloProb1;
        let finalProb = eloUnderdogProb * 0.6 + combinedProb * 0.4;

        finalProb = Math.max(0.10, Math.min(0.90, finalProb));

        let setWinProb = 0;
        if (bestOf === 3) {
            const favoriteWins2_0 = Math.pow(1 - finalProb, 2);
            setWinProb = 1 - favoriteWins2_0;
        } else {
            const favoriteWins3_0 = Math.pow(1 - finalProb, 3);
            setWinProb = 1 - favoriteWins3_0;
        }
        setWinProb = Math.max(0.10, Math.min(0.90, setWinProb));

        return {
            underdogName: underdogName,
            probability: Math.round(setWinProb * 100),
            probabilityFormatted: (setWinProb * 100).toFixed(1) + '%',
            underdogStats: {
                totalMatches: underdogStats.totalMatches,
                matchesWithAtLeastOneSet: Math.round(underdogStats.matchesWithAtLeastOneSet),
                weightedRate: Math.round(underdogStats.weightedRate * 100),
                relevantMatches: underdogStats.relevantMatches
            },
            favoriteStats: {
                totalMatches: favoriteStats.totalMatches,
                matchesWithAtLeastOneSet: Math.round(favoriteStats.matchesWithAtLeastOneSet),
                weightedRate: Math.round(favoriteStats.weightedRate * 100)
            },
            eloUnderdogProb: Math.round(eloUnderdogProb * 100),
            combinedProb: Math.round(combinedProb * 100),
            finalProb: Math.round(finalProb * 100)
        };
    } catch (error) {
        console.error('❌ Fehler in calculateSetWinFromMatchDB:', error);
        return null;
    }
}

// =====================================================
// ===== WETTMODELL =====
// =====================================================

function calculateBettingModel(probability, fairOdds, bookieOdds) {
    const bookie = parseFloat(bookieOdds);
    if (!bookieOdds || isNaN(bookie) || bookie <= 1) {
        return {
            value: '-', recommendation: '-', expectedValue: '-',
            kelly: '-', ampel: '-', fairValue: '-'
        };
    }

    const fair = fairOdds;
    const prob = probability / 100;

    const value = ((bookie / fair) - 1) * 100;
    const expectedValue = (prob * bookie) - 1;
    const kelly = Math.max(0, ((prob * (bookie - 1)) - (1 - prob)) / (bookie - 1)) * 100;
    const fairValue = ((bookie - fair) / fair) * 100;

    let recommendation = '⚪ Kein Vorteil';
    if (value >= 10) recommendation = '🔥 Stark spielbar';
    else if (value >= 5) recommendation = '✅ Leichter Value';
    else if (value >= 0) recommendation = '⚪ Kein Vorteil';
    else recommendation = '❌ Kein Bet';

    let ampel = '🟡 NO EDGE';
    if (value >= 10) ampel = '🟢 PREMIUM BET';
    else if (value >= 5) ampel = '🟢 VALUE BET';
    else if (value >= 0) ampel = '🟡 NO EDGE';
    else ampel = '🔴 NO BET';

    return {
        value: value.toFixed(1) + '%',
        recommendation: recommendation,
        expectedValue: expectedValue.toFixed(3),
        kelly: kelly.toFixed(1) + '%',
        ampel: ampel,
        fairValue: fairValue.toFixed(1) + '%'
    };
}

// =====================================================
// ===== HELFER: WIN-RATE AUS MATCH-DB =====
// =====================================================

async function getWinRateFromMatches(playerName, db) {
    try {
        const stmt = db.prepare(`
            SELECT winner_name, loser_name
            FROM matches
            WHERE winner_name = ? OR loser_name = ?
            ORDER BY tourney_date DESC
            LIMIT 200
        `);
        stmt.bind([playerName, playerName]);

        const matches = [];
        while (stmt.step()) {
            matches.push(stmt.getAsObject());
        }
        stmt.free();

        if (matches.length === 0) {
            const likeStmt = db.prepare(`
                SELECT winner_name, loser_name
                FROM matches
                WHERE LOWER(winner_name) LIKE LOWER(?) OR LOWER(loser_name) LIKE LOWER(?)
                ORDER BY tourney_date DESC
                LIMIT 200
            `);
            likeStmt.bind([`%${playerName}%`, `%${playerName}%`]);
            while (likeStmt.step()) {
                matches.push(likeStmt.getAsObject());
            }
            likeStmt.free();
        }

        if (matches.length === 0) return 0.5;

        let wins = 0;
        for (const match of matches) {
            if (match.winner_name === playerName) wins++;
        }

        return matches.length > 0 ? wins / matches.length : 0.5;
    } catch (e) {
        console.error('❌ Fehler bei WinRate:', e);
        return 0.5;
    }
}

// =====================================================
// 🔥 CONFIDENCE-BERECHNUNG (mit H2H-Unterstützung)
// =====================================================

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

// =====================================================
// ===== VORHERSAGE BERECHNEN =====
// =====================================================

async function calculatePrediction() {
    const p1 = predictorState.player1;
    const p2 = predictorState.player2;

    if (!p1 || !p2) return;

    predictorState.isLoading = true;
    renderMatchPredictor();

    try {
        const surface = predictorState.selectedSurface;

        const [elos1, elos2] = await Promise.all([
            loadAllElosForPlayer(p1.name),
            loadAllElosForPlayer(p2.name)
        ]);

        const p1HasElo = elos1 && elos1.has_elo === true;
        const p2HasElo = elos2 && elos2.has_elo === true;

        console.log(`🔍 ${p1.name}: has_elo=${p1HasElo}, elo=${elos1?.elo}`);
        console.log(`🔍 ${p2.name}: has_elo=${p2HasElo}, elo=${elos2?.elo}`);

        const surfaceEloMap = { 'Hartplatz': 'hard_elo', 'Sand': 'clay_elo', 'Rasen': 'grass_elo' };

        let surfaceElo1, combinedElo1;
        let p1WinRateFromDb = 0;
        if (!p1HasElo) {
            const db = await loadMatchDb(predictorState.type);
            if (db) {
                const winRate = await getWinRateFromMatches(p1.name, db);
                p1WinRateFromDb = Math.round(winRate * 100);
                const calculatedElo = 1500 + (winRate - 0.5) * 700;
                surfaceElo1 = Math.max(1200, Math.min(1800, calculatedElo));
                combinedElo1 = surfaceElo1;
            } else {
                surfaceElo1 = 1500;
                combinedElo1 = 1500;
            }
        } else {
            surfaceElo1 = elos1 ? elos1[surfaceEloMap[surface]] || elos1.elo : 1500;
            combinedElo1 = (elos1?.elo || 1500) * 0.5 + surfaceElo1 * 0.5;
        }

        let surfaceElo2, combinedElo2;
        let p2WinRateFromDb = 0;
        if (!p2HasElo) {
            const db = await loadMatchDb(predictorState.type);
            if (db) {
                const winRate = await getWinRateFromMatches(p2.name, db);
                p2WinRateFromDb = Math.round(winRate * 100);
                const calculatedElo = 1500 + (winRate - 0.5) * 700;
                surfaceElo2 = Math.max(1200, Math.min(1800, calculatedElo));
                combinedElo2 = surfaceElo2;
            } else {
                surfaceElo2 = 1500;
                combinedElo2 = 1500;
            }
        } else {
            surfaceElo2 = elos2 ? elos2[surfaceEloMap[surface]] || elos2.elo : 1500;
            combinedElo2 = (elos2?.elo || 1500) * 0.5 + surfaceElo2 * 0.5;
        }

        let prob1 = 1 / (1 + Math.pow(10, (combinedElo2 - combinedElo1) / ELO_SPREAD));
        let eloProb = prob1 * 100;
        let finalProb = Math.max(5, Math.min(95, eloProb));
        const prob2 = 100 - finalProb;

        const fairOdds1 = 100 / finalProb;
        const fairOdds2 = 100 / prob2;

        const h2h = await loadH2HData(p1.name, p2.name);

        const eloDiff = Math.abs(combinedElo1 - combinedElo2);
        const confidenceData = calculateConfidence(p1HasElo, p2HasElo, elos1, elos2, h2h, eloDiff);

        const setModel = calculateSetModel(finalProb, predictorState.selectedBestOf);
        const setWinProb = calculateSetWinProbability(finalProb, predictorState.selectedBestOf);

        const setWinFromMatchDB = await calculateSetWinFromMatchDB(
            p1.name,
            p2.name,
            predictorState.selectedBestOf
        );

        const bookieOdds = predictorState.bookieOdds;
        const bettingModel = calculateBettingModel(finalProb, fairOdds1, bookieOdds);

        predictorState.predictionResult = {
            player1: {
                name: p1.name,
                probability: finalProb,
                elo: elos1,
                surface_elo: surfaceElo1,
                fair_odds: fairOdds1,
                class_bonus: 0,
                h2h_bonus: 0,
                surface_bonus: 0,
                has_elo: p1HasElo,
                calculated_elo: !p1HasElo ? Math.round(combinedElo1) : null,
                win_rate_from_db: !p1HasElo ? p1WinRateFromDb : null
            },
            player2: {
                name: p2.name,
                probability: prob2,
                elo: elos2,
                surface_elo: surfaceElo2,
                fair_odds: fairOdds2,
                class_bonus: 0,
                h2h_bonus: 0,
                surface_bonus: 0,
                has_elo: p2HasElo,
                calculated_elo: !p2HasElo ? Math.round(combinedElo2) : null,
                win_rate_from_db: !p2HasElo ? p2WinRateFromDb : null
            },
            h2h: h2h,
            setModel: setModel,
            setWinProb: setWinProb,
            setWinFromMatchDB: setWinFromMatchDB,
            underdogName: finalProb >= 50 ? p2.name : p1.name,
            confidence: confidenceData.confidence,
            confidenceLabel: confidenceData.label,
            confidenceReason: confidenceData.reason,
            surface: surface,
            bestOf: predictorState.selectedBestOf,
            tournament: predictorState.selectedTournament,
            betting: bettingModel,
            elo_diff_abs: Math.round(Math.abs(combinedElo1 - combinedElo2)),
            overall_diff: Math.round((elos1?.elo || 1500) - (elos2?.elo || 1500)),
            weights: { elo: 50, surface: 50 },
            debug: {
                combinedElo1: combinedElo1,
                combinedElo2: combinedElo2,
                eloProb: eloProb,
                surfaceElo1: surfaceElo1,
                surfaceElo2: surfaceElo2,
                p1HasElo: p1HasElo,
                p2HasElo: p2HasElo
            }
        };

        predictorState.isLoading = false;
        renderMatchPredictor();

    } catch (error) {
        console.error('❌ Fehler bei der Vorhersage:', error);
        predictorState.isLoading = false;
        renderMatchPredictor();
    }
}

// =====================================================
// 🔥 GLOBALER CLICK-LISTENER
// =====================================================
document.addEventListener('click', function(e) {
    const r1 = document.getElementById('predResults1');
    const r2 = document.getElementById('predResults2');
    if (r1 && !e.target.closest('#predSearch1') && !e.target.closest('#predResults1')) {
        r1.style.display = 'none';
    }
    if (r2 && !e.target.closest('#predSearch2') && !e.target.closest('#predResults2')) {
        r2.style.display = 'none';
    }
    const results = document.getElementById('tournamentResults');
    const input = document.getElementById('tournamentSearchInput');
    if (results && input && !e.target.closest('#tournamentSearchInput') && !e.target.closest('#tournamentResults')) {
        results.style.display = 'none';
        predictorState.tournamentDropdownOpen = false;
    }
});

// =====================================================
// ===== RENDER MATCH PREDICTOR =====
// =====================================================

function renderMatchPredictor() {
    const container = document.getElementById('pageContent');
    if (!container) return;
    const p1Name = predictorState.player1 ? predictorState.player1.name : 'Spieler 1';
    const p2Name = predictorState.player2 ? predictorState.player2.name : 'Spieler 2';
    const result = predictorState.predictionResult;
    const isLoading = predictorState.isLoading;

    let surfaceOptions = '';
    const surfaceLabels = {
        'Hartplatz': '🏟️ Hartplatz',
        'Sand': '🧱 Sand',
        'Rasen': '🌿 Rasen'
    };
    for (const s of SURFACES) {
        const selected = s === predictorState.selectedSurface ? 'selected' : '';
        surfaceOptions += `<option value="${s}" ${selected}>${surfaceLabels[s]}</option>`;
    }

    let bestOfOptions = '';
    for (const b of BEST_OF) {
        const selected = b === predictorState.selectedBestOf ? 'selected' : '';
        bestOfOptions += `<option value="${b}" ${selected}>Best of ${b}</option>`;
    }

    const currentTour = getTournamentByName(predictorState.selectedTournament);
    const displayText = currentTour ? `${currentTour.surface === 'Hartplatz' ? '🏟️' : currentTour.surface === 'Sand' ? '🧱' : '🌿'} ${currentTour.name}` : '';
    const bookieValue = predictorState.bookieOdds || '';

    let resultHtml = '';
    if (result) {
        const p1 = result.player1;
        const p2 = result.player2;
        const confidence = result.confidence;
        const confidenceLabel = result.confidenceLabel || 'Mittel';
        const confidenceReason = result.confidenceReason || '';
        const setModel = result.setModel;
        const bestOf = result.bestOf;
        const betting = result.betting;
        const setWinProb = result.setWinProb;
        const underdogName = result.underdogName;
        const setWinDB = result.setWinFromMatchDB;
        const h2h = result.h2h;

        const p1HasElo = p1.has_elo === true;
        const p2HasElo = p2.has_elo === true;

        let p1EloDisplay, p1SurfaceElo, p1WinRate, p1HardElo, p1ClayElo, p1GrassElo;
        if (!p1HasElo) {
            p1EloDisplay = p1.calculated_elo || Math.round(p1.surface_elo || 1500);
            p1SurfaceElo = Math.round(p1.surface_elo || 1500);
            p1WinRate = p1.win_rate_from_db || 0;
            p1HardElo = 1500; p1ClayElo = 1500; p1GrassElo = 1500;
        } else {
            p1EloDisplay = Math.round(p1.elo?.elo || 1500);
            p1SurfaceElo = Math.round(p1.surface_elo || 1500);
            p1WinRate = p1.elo?.win_rate || 0;
            p1HardElo = Math.round(p1.elo?.hard_elo || 1500);
            p1ClayElo = Math.round(p1.elo?.clay_elo || 1500);
            p1GrassElo = Math.round(p1.elo?.grass_elo || 1500);
        }

        let p2EloDisplay, p2SurfaceElo, p2WinRate, p2HardElo, p2ClayElo, p2GrassElo;
        if (!p2HasElo) {
            p2EloDisplay = p2.calculated_elo || Math.round(p2.surface_elo || 1500);
            p2SurfaceElo = Math.round(p2.surface_elo || 1500);
            p2WinRate = p2.win_rate_from_db || 0;
            p2HardElo = 1500; p2ClayElo = 1500; p2GrassElo = 1500;
        } else {
            p2EloDisplay = Math.round(p2.elo?.elo || 1500);
            p2SurfaceElo = Math.round(p2.surface_elo || 1500);
            p2WinRate = p2.elo?.win_rate || 0;
            p2HardElo = Math.round(p2.elo?.hard_elo || 1500);
            p2ClayElo = Math.round(p2.elo?.clay_elo || 1500);
            p2GrassElo = Math.round(p2.elo?.grass_elo || 1500);
        }

        const p1EloLabel = p1HasElo ? 'Overall Elo' : '📊 Berechnete Elo';
        const p2EloLabel = p2HasElo ? 'Overall Elo' : '📊 Berechnete Elo';

        let confidenceColor = '#f1c40f';
        if (confidence >= 8) confidenceColor = '#2ecc71';
        else if (confidence >= 6) confidenceColor = '#f1c40f';
        else if (confidence >= 4) confidenceColor = '#e67e22';
        else confidenceColor = '#e74c3c';

        let weightInfoHtml = `
            <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:8px;font-size:11px;color:#4a5a77;">
                <span style="color:#2ecc71;">🎯 ELO: 50%</span>
                <span style="color:#f1c40f;">🏟️ Surface: 50%</span>
                <span style="color:#7a8aa3;font-size:10px;">📊 Spread: ${ELO_SPREAD}</span>
            </div>
        `;

        const setLabels = {
            '2:0': '2:0', '2:1': '2:1',
            '3:0': '3:0', '3:1': '3:1', '3:2': '3:2',
            '0:2': '0:2', '1:2': '1:2',
            '0:3': '0:3', '1:3': '1:3', '2:3': '2:3'
        };

        const sortedKeys = Object.keys(setModel).sort((a, b) => {
            const aIsP1Win = a.startsWith('2') || a.startsWith('3');
            const bIsP1Win = b.startsWith('2') || b.startsWith('3');
            if (aIsP1Win && !bIsP1Win) return -1;
            if (!aIsP1Win && bIsP1Win) return 1;
            return 0;
        });

        const setModelHtml = `
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-top:12px;">
                <div style="color:#a0b3cc;font-size:14px;font-weight:600;margin-bottom:12px;text-align:center;">🎾 Satzmodell (Best of ${bestOf})</div>
                <div style="display:grid;grid-template-columns:${bestOf === 3 ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr 1fr 1fr 1fr'};gap:8px;">
                    ${sortedKeys.map(key => {
                        const prob = setModel[key];
                        const isP1Win = key.startsWith('2') || key.startsWith('3');
                        const color = isP1Win ? '#2ecc71' : '#e74c3c';
                        const emoji = isP1Win ? '✅' : '❌';
                        return `
                            <div style="background:${isP1Win ? 'rgba(46,204,113,0.05)' : 'rgba(231,76,60,0.05)'};border-radius:8px;padding:10px;text-align:center;border:1px solid ${isP1Win ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)'};">
                                <div style="color:#7a8aa3;font-size:11px;">${setLabels[key] || key}</div>
                                <div style="color:${color};font-size:22px;font-weight:700;">${prob}%</div>
                                <div style="color:#4a5a77;font-size:9px;">${emoji}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        let setWinHtml = '';
        if (setWinProb) {
            setWinHtml = `
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(46,204,113,0.2);border-radius:12px;padding:16px;margin-top:12px;text-align:center;">
                    <div style="color:#a0b3cc;font-size:14px;font-weight:600;margin-bottom:8px;">🎯 Underdog Satz-Gewinn (ELO)</div>
                    <div style="color:#f1c40f;font-size:28px;font-weight:700;">${setWinProb.probabilityFormatted}</div>
                    <div style="color:#7a8aa3;font-size:13px;">Wahrscheinlichkeit, dass <span style="color:#f1c40f;font-weight:600;">${underdogName}</span> mindestens einen Satz gewinnt</div>
                    <div style="color:#4a5a77;font-size:11px;margin-top:4px;">(Best of ${result.bestOf})</div>
                </div>
            `;
        }

        let setWinDBHtml = '';
        if (setWinDB) {
            setWinDBHtml = `
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(46,204,113,0.15);border-radius:12px;padding:16px;margin-top:12px;text-align:center;">
                    <div style="color:#a0b3cc;font-size:14px;font-weight:600;margin-bottom:8px;">📊 Underdog Satz-Gewinn (Match-DB)</div>
                    <div style="color:#2ecc71;font-size:28px;font-weight:700;">${setWinDB.probabilityFormatted}</div>
                    <div style="color:#7a8aa3;font-size:13px;">Wahrscheinlichkeit, dass <span style="color:#2ecc71;font-weight:600;">${setWinDB.underdogName}</span> mindestens einen Satz gewinnt</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;text-align:left;font-size:11px;color:#4a5a77;">
                        <div style="background:rgba(255,255,255,0.03);padding:8px;border-radius:6px;">
                            <div style="color:#7a8aa3;">${setWinDB.underdogName}</div>
                            <div>📈 ${setWinDB.underdogStats.matchesWithAtLeastOneSet}/${setWinDB.underdogStats.totalMatches}</div>
                            <div>🎯 ${setWinDB.underdogStats.weightedRate}%</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.03);padding:8px;border-radius:6px;">
                            <div style="color:#7a8aa3;">Gegner</div>
                            <div>📈 ${setWinDB.favoriteStats.matchesWithAtLeastOneSet}/${setWinDB.favoriteStats.totalMatches}</div>
                            <div>🎯 ${setWinDB.favoriteStats.weightedRate}%</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;justify-content:center;margin-top:8px;font-size:10px;color:#4a5a77;">
                        <span>ELO: ${setWinDB.eloUnderdogProb}%</span>
                        <span>Stat: ${setWinDB.combinedProb}%</span>
                        <span>Final: ${setWinDB.finalProb}%</span>
                    </div>
                </div>
            `;
        }

        let bettingHtml = '';
        if (betting && betting.value !== '-') {
            const valueColor = parseFloat(betting.value) >= 5 ? '#2ecc71' : parseFloat(betting.value) >= 0 ? '#f1c40f' : '#e74c3c';
            const ampelColor = betting.ampel.includes('PREMIUM') ? '#2ecc71' : betting.ampel.includes('VALUE') ? '#2ecc71' : betting.ampel.includes('NO EDGE') ? '#f1c40f' : '#e74c3c';

            bettingHtml = `
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-top:12px;">
                    <div style="color:#a0b3cc;font-size:14px;font-weight:600;margin-bottom:12px;">📈 Wettmodell</div>
                    <div style="display:grid;grid-template-columns:1fr;gap:6px;">
                        <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                            <span style="color:#7a8aa3;font-size:13px;">Value</span>
                            <span style="color:${valueColor};font-size:13px;font-weight:600;">${betting.value}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                            <span style="color:#7a8aa3;font-size:13px;">Empfehlung</span>
                            <span style="color:#e0e6f0;font-size:13px;font-weight:600;">${betting.recommendation}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                            <span style="color:#7a8aa3;font-size:13px;">Expected Value</span>
                            <span style="color:${parseFloat(betting.expectedValue) > 0 ? '#2ecc71' : '#e74c3c'};font-size:13px;font-weight:600;">${betting.expectedValue}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                            <span style="color:#7a8aa3;font-size:13px;">Kelly</span>
                            <span style="color:#e0e6f0;font-size:13px;font-weight:600;">${betting.kelly}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                            <span style="color:#7a8aa3;font-size:13px;">Wett-Ampel</span>
                            <span style="color:${ampelColor};font-size:13px;font-weight:600;">${betting.ampel}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                            <span style="color:#7a8aa3;font-size:13px;">Fair Value</span>
                            <span style="color:${parseFloat(betting.fairValue) > 0 ? '#2ecc71' : '#e74c3c'};font-size:13px;font-weight:600;">${betting.fairValue}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        let h2hHtml = '';
        if (h2h && h2h.total > 0) {
            h2hHtml = `
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-top:16px;text-align:center;">
                    <div style="color:#a0b3cc;font-size:16px;font-weight:600;margin-bottom:12px;">🤝 Head to Head</div>
                    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:center;">
                        <div>
                            <div style="color:#2ecc71;font-size:28px;font-weight:700;">${h2h.wins}</div>
                            <div style="color:#7a8aa3;font-size:11px;">${p1.name}</div>
                        </div>
                        <div style="color:#4a5a77;font-size:14px;">${h2h.total} Duelle</div>
                        <div>
                            <div style="color:#e74c3c;font-size:28px;font-weight:700;">${h2h.losses}</div>
                            <div style="color:#7a8aa3;font-size:11px;">${p2.name}</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            h2hHtml = `
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-top:16px;text-align:center;">
                    <div style="color:#a0b3cc;font-size:16px;font-weight:600;margin-bottom:8px;">🤝 Head to Head</div>
                    <div style="color:#4a5a77;font-size:13px;">Noch nie gegeneinander gespielt</div>
                </div>
            `;
        }

        resultHtml = `
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(46,204,113,0.2);border-radius:16px;padding:24px;margin-top:20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
                    <div style="color:#7a8aa3;font-size:12px;text-transform:uppercase;">🔮 Vorhersage</div>
                    <div style="font-size:13px;color:${confidenceColor};text-align:right;">
                        <div>Vertrauen: ${confidence}/10 (${confidenceLabel})</div>
                        ${confidenceReason ? `<div style="font-size:11px;color:#7a8aa3;margin-top:2px;">${confidenceReason}</div>` : ''}
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:20px;align-items:center;text-align:center;">
                    <div>
                        <div style="color:#e0e6f0;font-size:18px;font-weight:600;">${p1.name}</div>
                        <div style="color:#2ecc71;font-size:48px;font-weight:700;">${p1.probability.toFixed(1)}%</div>
                        ${!p1HasElo ? '<div style="color:#f1c40f;font-size:10px;">⚠️ Elo aus Match-DB berechnet</div>' : ''}
                    </div>
                    <div style="color:#4a5a77;font-size:20px;font-weight:700;">VS</div>
                    <div>
                        <div style="color:#e0e6f0;font-size:18px;font-weight:600;">${p2.name}</div>
                        <div style="color:#e74c3c;font-size:48px;font-weight:700;">${p2.probability.toFixed(1)}%</div>
                        ${!p2HasElo ? '<div style="color:#f1c40f;font-size:10px;">⚠️ Elo aus Match-DB berechnet</div>' : ''}
                    </div>
                </div>

                <div style="width:100%;height:12px;background:rgba(255,255,255,0.05);border-radius:6px;overflow:hidden;margin-top:16px;">
                    <div style="width:${p1.probability}%;height:100%;background:linear-gradient(90deg,#2ecc71,#f1c40f);border-radius:6px;"></div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
                    <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:12px;text-align:center;">
                        <div style="color:#7a8aa3;font-size:11px;">Faire Quote</div>
                        <div style="color:#2ecc71;font-size:24px;font-weight:700;">${p1.fair_odds.toFixed(2)}</div>
                    </div>
                    <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:12px;text-align:center;">
                        <div style="color:#7a8aa3;font-size:11px;">Faire Quote</div>
                        <div style="color:#e74c3c;font-size:24px;font-weight:700;">${p2.fair_odds.toFixed(2)}</div>
                    </div>
                </div>

                <div style="text-align:center;color:#4a5a77;font-size:12px;margin-top:12px;">
                    ${result.surface} · Best of ${result.bestOf} · ${result.tournament}
                </div>
                ${weightInfoHtml}
            </div>

            ${h2hHtml}

            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-top:16px;">
                <div style="color:#2ecc71;font-size:16px;font-weight:600;margin-bottom:12px;">${p1.name}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                        <span style="color:#7a8aa3;font-size:13px;">${p1EloLabel}</span>
                        <span style="color:#e0e6f0;font-size:13px;font-weight:600;">${p1EloDisplay}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                        <span style="color:#7a8aa3;font-size:13px;">${result.surface} Elo</span>
                        <span style="color:#e0e6f0;font-size:13px;font-weight:600;">${p1SurfaceElo}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                        <span style="color:#7a8aa3;font-size:13px;">Gesamt Winrate</span>
                        <span style="color:#e0e6f0;font-size:13px;font-weight:600;">${p1WinRate}%</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                        <span style="color:#7a8aa3;font-size:13px;">Hard Elo</span>
                        <span style="color:#e0e6f0;font-size:13px;font-weight:600;">${p1HardElo}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                        <span style="color:#7a8aa3;font-size:13px;">Clay Elo</span>
                        <span style="color:#e0e6f0;font-size:13px;font-weight:600;">${p1ClayElo}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                        <span style="color:#7a8aa3;font-size:13px;">Grass Elo</span>
                        <span style="color:#e0e6f0;font-size:13px;font-weight:600;">${p1GrassElo}</span>
                    </div>
                    ${!p1HasElo ? '<div style="grid-column:span 2;text-align:center;color:#f1c40f;font-size:11px;padding:4px;">⚠️ Keine Elo-Daten in der Datenbank → berechnet aus Match-DB</div>' : ''}
                </div>
            </div>

            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-top:12px;">
                <div style="color:#e74c3c;font-size:16px;font-weight:600;margin-bottom:12px;">${p2.name}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                        <span style="color:#7a8aa3;font-size:13px;">${p2EloLabel}</span>
                        <span style="color:#e0e6f0;font-size:13px;font-weight:600;">${p2EloDisplay}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                        <span style="color:#7a8aa3;font-size:13px;">${result.surface} Elo</span>
                        <span style="color:#e0e6f0;font-size:13px;font-weight:600;">${p2SurfaceElo}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                        <span style="color:#7a8aa3;font-size:13px;">Gesamt Winrate</span>
                        <span style="color:#e0e6f0;font-size:13px;font-weight:600;">${p2WinRate}%</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                        <span style="color:#7a8aa3;font-size:13px;">Hard Elo</span>
                        <span style="color:#e0e6f0;font-size:13px;font-weight:600;">${p2HardElo}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                        <span style="color:#7a8aa3;font-size:13px;">Clay Elo</span>
                        <span style="color:#e0e6f0;font-size:13px;font-weight:600;">${p2ClayElo}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:6px;">
                        <span style="color:#7a8aa3;font-size:13px;">Grass Elo</span>
                        <span style="color:#e0e6f0;font-size:13px;font-weight:600;">${p2GrassElo}</span>
                    </div>
                    ${!p2HasElo ? '<div style="grid-column:span 2;text-align:center;color:#f1c40f;font-size:11px;padding:4px;">⚠️ Keine Elo-Daten in der Datenbank → berechnet aus Match-DB</div>' : ''}
                </div>
            </div>

            ${setModelHtml}
            ${setWinHtml}
            ${setWinDBHtml}
            ${bettingHtml}
        `;
    }

    container.innerHTML = `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:24px;">
            <h2 style="color:#e0e6f0;font-size:20px;margin:0 0 8px 0;">🔮 Match Vorhersage</h2>
            <div style="color:#7a8aa3;font-size:13px;margin-bottom:16px;">Wähle zwei Spieler aus und erhalte eine präzise Vorhersage.</div>

            <div style="display:flex;gap:10px;margin:16px 0;">
                <button id="predBtnAtp" class="toggle ${predictorState.type === 'atp' ? 'active' : ''}" style="padding:8px 24px;border-radius:8px;border:2px solid ${predictorState.type === 'atp' ? 'rgba(46,204,113,0.3)' : 'rgba(255,255,255,0.1)'};background:${predictorState.type === 'atp' ? 'rgba(46,204,113,0.15)' : 'transparent'};color:${predictorState.type === 'atp' ? '#2ecc71' : '#7a8aa3'};font-weight:600;cursor:pointer;">🎾 ATP</button>
                <button id="predBtnWta" class="toggle ${predictorState.type === 'wta' ? 'active' : ''}" style="padding:8px 24px;border-radius:8px;border:2px solid ${predictorState.type === 'wta' ? 'rgba(46,204,113,0.3)' : 'rgba(255,255,255,0.1)'};background:${predictorState.type === 'wta' ? 'rgba(46,204,113,0.15)' : 'transparent'};color:${predictorState.type === 'wta' ? '#2ecc71' : '#7a8aa3'};font-weight:600;cursor:pointer;">👑 WTA</button>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;">
                    <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;margin-bottom:8px;">Spieler 1</div>
                    <div style="position:relative;">
                        <input type="text" id="predSearch1" placeholder="🔍 Spieler suchen..." value="${predictorState.searchTerm1 || ''}" style="width:100%;padding:10px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:#141b2b;color:#e0e6f0;font-size:14px;outline:none;">
                        <div id="predResults1" style="position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#141b2b;border:1px solid rgba(255,255,255,0.1);border-radius:8px;max-height:200px;overflow-y:auto;z-index:100;display:none;"></div>
                    </div>
                    <div id="predSelected1" style="margin-top:8px;padding:8px 12px;background:rgba(46,204,113,0.05);border:1px solid rgba(46,204,113,0.15);border-radius:6px;${predictorState.player1 ? '' : 'display:none;'}">
                        <span style="color:#f1c40f;font-weight:600;">${p1Name}</span>
                        <button onclick="clearPlayer1()" style="float:right;padding:2px 10px;border-radius:4px;border:1px solid rgba(231,76,60,0.3);background:rgba(231,76,60,0.1);color:#e74c3c;cursor:pointer;font-size:11px;">✕</button>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px;">
                    <div style="color:#7a8aa3;font-size:11px;text-transform:uppercase;margin-bottom:8px;">Spieler 2</div>
                    <div style="position:relative;">
                        <input type="text" id="predSearch2" placeholder="🔍 Spieler suchen..." value="${predictorState.searchTerm2 || ''}" style="width:100%;padding:10px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:#141b2b;color:#e0e6f0;font-size:14px;outline:none;">
                        <div id="predResults2" style="position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#141b2b;border:1px solid rgba(255,255,255,0.1);border-radius:8px;max-height:200px;overflow-y:auto;z-index:100;display:none;"></div>
                    </div>
                    <div id="predSelected2" style="margin-top:8px;padding:8px 12px;background:rgba(46,204,113,0.05);border:1px solid rgba(46,204,113,0.15);border-radius:6px;${predictorState.player2 ? '' : 'display:none;'}">
                        <span style="color:#f1c40f;font-weight:600;">${p2Name}</span>
                        <button onclick="clearPlayer2()" style="float:right;padding:2px 10px;border-radius:4px;border:1px solid rgba(231,76,60,0.3);background:rgba(231,76,60,0.1);color:#e74c3c;cursor:pointer;font-size:11px;">✕</button>
                    </div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:16px;">
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px;">
                    <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;margin-bottom:4px;">🏟️ Belag</div>
                    <select id="predSurface" style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);background:#141b2b;color:#e0e6f0;font-size:13px;outline:none;cursor:pointer;">
                        ${surfaceOptions}
                    </select>
                </div>
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px;">
                    <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;margin-bottom:4px;">📋 Satzanzahl</div>
                    <select id="predBestOf" style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);background:#141b2b;color:#e0e6f0;font-size:13px;outline:none;cursor:pointer;">
                        ${bestOfOptions}
                    </select>
                </div>
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px;">
                    <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;margin-bottom:4px;">🏆 Turnier</div>
                    <div style="position:relative;">
                        <div style="display:flex;align-items:center;gap:8px;background:#141b2b;border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px 12px;cursor:text;">
                            <span style="font-size:14px;">🏟️</span>
                            <input type="text" id="tournamentSearchInput" placeholder="🔍 Turnier suchen..."
                                   style="flex:1;background:transparent;border:none;outline:none;color:#e0e6f0;font-size:13px;padding:0;"
                                   oninput="doTournamentSearch(this.value)"
                                   onfocus="if(this.value) doTournamentSearch(this.value)"
                                   autocomplete="off">
                            <span id="selectedTournamentDisplay" style="color:#2ecc71;font-size:13px;${currentTour ? '' : 'display:none;'}">${displayText}</span>
                            <span style="color:#4a5a77;font-size:12px;cursor:pointer;" onclick="clearPredictorTournament()" title="Löschen">✕</span>
                        </div>
                        <div id="tournamentResults" style="display:none;position:absolute;top:100%;left:0;right:0;margin-top:4px;background:#141b2b;border:1px solid rgba(255,255,255,0.1);border-radius:8px;max-height:200px;overflow-y:auto;z-index:100;box-shadow:0 8px 30px rgba(0,0,0,0.5);"></div>
                    </div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;margin-top:16px;align-items:center;">
                <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px;">
                    <div style="color:#7a8aa3;font-size:10px;text-transform:uppercase;margin-bottom:4px;">💰 Bookie Quote</div>
                    <input type="text" id="bookieOddsInput" inputmode="decimal" placeholder="z.B. 1.85 oder 1,85"
                           value="${bookieValue}"
                           style="width:100%;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);background:#141b2b;color:#e0e6f0;font-size:14px;outline:none;">
                </div>
                <div style="text-align:center;">
                    <button id="analyzeBtn" style="padding:16px 64px;border-radius:12px;border:2px solid rgba(46,204,113,0.3);background:rgba(46,204,113,0.15);color:#2ecc71;font-size:18px;font-weight:600;cursor:pointer;transition:0.3s;font-family:'Inter',sans-serif;width:100%;"
                            onmouseover="this.style.background='rgba(46,204,113,0.25)';this.style.borderColor='rgba(46,204,113,0.6)'"
                            onmouseout="this.style.background='rgba(46,204,113,0.15)';this.style.borderColor='rgba(46,204,113,0.3)'"
                            ${isLoading ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
                        ${isLoading ? '⏳ Analysiere...' : '🔮 Analyse starten'}
                    </button>
                </div>
            </div>

            <div id="predResult">
                ${resultHtml || `<div style="text-align:center;color:#4a5a77;padding:40px 0;font-size:16px;margin-top:20px;">
                    ⏳ Wähle zwei Spieler aus und starte die Analyse.
                </div>`}
            </div>
        </div>
    `;

    document.getElementById('predBtnAtp').onclick = () => switchPredictorType('atp');
    document.getElementById('predBtnWta').onclick = () => switchPredictorType('wta');

    document.getElementById('predSurface').onchange = function() {
        predictorState.selectedSurface = this.value;
        if (predictorState.player1 && predictorState.player2) {
            calculatePrediction();
        }
    };

    document.getElementById('predBestOf').onchange = function() {
        predictorState.selectedBestOf = parseInt(this.value);
        if (predictorState.player1 && predictorState.player2) {
            calculatePrediction();
        }
    };

    const bookieInput = document.getElementById('bookieOddsInput');
    if (bookieInput) {
        bookieInput.oninput = function() {
            const normalized = this.value.replace(',', '.');
            predictorState.bookieOdds = normalized;
        };
    }

    document.getElementById('analyzeBtn').onclick = function() {
        if (!predictorState.player1 || !predictorState.player2) {
            alert('⚠️ Bitte wähle zuerst zwei Spieler aus!');
            return;
        }
        const bookieInput = document.getElementById('bookieOddsInput');
        if (bookieInput) {
            const normalized = bookieInput.value.replace(',', '.');
            predictorState.bookieOdds = normalized;
        }
        calculatePrediction();
    };

    const search1 = document.getElementById('predSearch1');
    const search2 = document.getElementById('predSearch2');
    const results1 = document.getElementById('predResults1');
    const results2 = document.getElementById('predResults2');

    search1.oninput = function() {
        predictorState.searchTerm1 = this.value;
        if (this.value.length >= 2) doPredictorSearch(1, this.value);
        else { results1.style.display = 'none'; results1.innerHTML = ''; }
    };
    search1.onfocus = function() {
        if (predictorState.searchTerm1 && predictorState.searchTerm1.length >= 2) {
            doPredictorSearch(1, predictorState.searchTerm1);
        }
    };
    search2.oninput = function() {
        predictorState.searchTerm2 = this.value;
        if (this.value.length >= 2) doPredictorSearch(2, this.value);
        else { results2.style.display = 'none'; results2.innerHTML = ''; }
    };
    search2.onfocus = function() {
        if (predictorState.searchTerm2 && predictorState.searchTerm2.length >= 2) {
            doPredictorSearch(2, predictorState.searchTerm2);
        }
    };
}

// ===== PREDICTOR SEARCH =====
let predictorSearchTimeout = { 1: null, 2: null };

async function doPredictorSearch(player, term) {
    if (predictorSearchTimeout[player]) {
        clearTimeout(predictorSearchTimeout[player]);
        predictorSearchTimeout[player] = null;
    }
    predictorSearchTimeout[player] = setTimeout(async function() {
        const players = predictorState.players;
        if (!players.length) return;
        const found = players.filter(p => p.search.includes(term.toLowerCase())).slice(0, 8);
        const resultsId = player === 1 ? 'predResults1' : 'predResults2';
        const container = document.getElementById(resultsId);
        if (!found.length) {
            container.innerHTML = `<div style="padding:8px 12px;color:#7a8aa3;font-size:13px;">😕 Keine Spieler gefunden.</div>`;
            container.style.display = 'block';
            return;
        }
        let html = '';
        const tasks = [];
        for (const p of found) {
            const imgId = 'pred_img_' + p.player_id;
            const safeName = p.name.replace(/'/g, "\\'");
            html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;cursor:pointer;transition:0.15s;border-bottom:1px solid rgba(255,255,255,0.03);" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'" onclick="window.selectPredictorPlayer(${player}, '${safeName}')">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div id="${imgId}" style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#1a472a,#2d5a3d);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;color:#fff;flex-shrink:0;">${p.name.split(' ').map(w=>w[0]).join('').substring(0,2)}</div>
                    <span style="color:#e0e6f0;font-size:13px;">${p.name}</span>
                </div>
            </div>`;
            if (p.wikidata_id) tasks.push({ id: imgId, wid: p.wikidata_id });
        }
        container.innerHTML = html;
        container.style.display = 'block';
        for (const t of tasks) {
            const url = await loadImage(t.wid);
            if (url) {
                const el = document.getElementById(t.id);
                if (el) el.innerHTML = `<img src="${url}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.1);" onerror="this.style.display='none'">`;
            }
        }
        predictorSearchTimeout[player] = null;
    }, 150);
}

// ===== SELECT PREDICTOR PLAYER =====
window.selectPredictorPlayer = function(player, name) {
    const players = predictorState.players;
    const found = players.find(p => p.name === name);
    if (!found) return;
    if (player === 1) {
        if (predictorState.player2 && predictorState.player2.name === name) {
            alert('⚠️ Bitte wähle zwei verschiedene Spieler!');
            return;
        }
        predictorState.player1 = found;
        predictorState.searchTerm1 = '';
        document.getElementById('predSearch1').value = '';
        document.getElementById('predResults1').style.display = 'none';
        document.getElementById('predSelected1').style.display = 'block';
        document.getElementById('predSelected1').querySelector('span').textContent = found.name;
    } else {
        if (predictorState.player1 && predictorState.player1.name === name) {
            alert('⚠️ Bitte wähle zwei verschiedene Spieler!');
            return;
        }
        predictorState.player2 = found;
        predictorState.searchTerm2 = '';
        document.getElementById('predSearch2').value = '';
        document.getElementById('predResults2').style.display = 'none';
        document.getElementById('predSelected2').style.display = 'block';
        document.getElementById('predSelected2').querySelector('span').textContent = found.name;
    }
    if (predictorState.player1 && predictorState.player2) {
        calculatePrediction();
    }
};

// ===== CLEAR PLAYERS =====
window.clearPlayer1 = function() {
    predictorState.player1 = null;
    predictorState.searchTerm1 = '';
    document.getElementById('predSearch1').value = '';
    document.getElementById('predSelected1').style.display = 'none';
    predictorState.predictionResult = null;
    renderMatchPredictor();
};

window.clearPlayer2 = function() {
    predictorState.player2 = null;
    predictorState.searchTerm2 = '';
    document.getElementById('predSearch2').value = '';
    document.getElementById('predSelected2').style.display = 'none';
    predictorState.predictionResult = null;
    renderMatchPredictor();
};

// ===== TURNIER SEARCH =====
let tournamentSearchTimeout = null;

function doTournamentSearch(term) {
    if (tournamentSearchTimeout) {
        clearTimeout(tournamentSearchTimeout);
        tournamentSearchTimeout = null;
    }

    tournamentSearchTimeout = setTimeout(function() {
        const tournaments = predictorState.tournaments || [];
        const resultsContainer = document.getElementById('tournamentResults');
        if (!resultsContainer) return;

        const searchTerm = term.toLowerCase().trim();

        if (!searchTerm) {
            resultsContainer.style.display = 'none';
            resultsContainer.innerHTML = '';
            predictorState.tournamentDropdownOpen = false;
            return;
        }

        const found = tournaments.filter(t =>
            t.search.includes(searchTerm) ||
            t.category.toLowerCase().includes(searchTerm)
        ).slice(0, 15);

        if (found.length === 0) {
            resultsContainer.innerHTML = `
                <div style="padding:8px 12px;color:#7a8aa3;font-size:13px;">😕 Keine Turniere gefunden.</div>
            `;
            resultsContainer.style.display = 'block';
            predictorState.tournamentDropdownOpen = true;
            return;
        }

        let html = '';
        for (const t of found) {
            const isSelected = t.name === predictorState.selectedTournament;
            const surfEmoji = t.surface === 'Hartplatz' ? '🏟️' : t.surface === 'Sand' ? '🧱' : '🌿';
            html += `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;cursor:pointer;transition:0.15s;border-bottom:1px solid rgba(255,255,255,0.03);${isSelected ? 'background:rgba(46,204,113,0.1);' : ''}"
                     onmouseover="this.style.background='rgba(255,255,255,0.05)'"
                     onmouseout="${isSelected ? '' : 'this.style.background=\'transparent\''}"
                     onclick="selectPredictorTournament('${t.name.replace(/'/g, "\\'")}')">
                    <span style="color:${isSelected ? '#2ecc71' : '#e0e6f0'};font-size:13px;">
                        ${isSelected ? '✅ ' : ''}${surfEmoji} ${t.name}
                    </span>
                    <span style="color:#4a5a77;font-size:10px;">${t.category}</span>
                </div>
            `;
        }

        resultsContainer.innerHTML = html;
        resultsContainer.style.display = 'block';
        predictorState.tournamentDropdownOpen = true;
        tournamentSearchTimeout = null;
    }, 150);
}

// ===== SELECT TOURNAMENT =====
function selectPredictorTournament(name) {
    predictorState.selectedTournament = name;
    predictorState.tournamentDropdownOpen = false;

    const searchInput = document.getElementById('tournamentSearchInput');
    const resultsContainer = document.getElementById('tournamentResults');
    const selectedDisplay = document.getElementById('selectedTournamentDisplay');

    if (searchInput) searchInput.value = '';
    if (resultsContainer) {
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
    }

    const tourData = getTournamentByName(name);
    const surface = tourData ? tourData.surface : 'Hartplatz';
    const bestOf = tourData ? tourData.bestOf : 3;

    const surfaceSelect = document.getElementById('predSurface');
    if (surfaceSelect) {
        surfaceSelect.value = surface;
        predictorState.selectedSurface = surface;
    }

    const bestOfSelect = document.getElementById('predBestOf');
    if (bestOfSelect) {
        bestOfSelect.value = bestOf;
        predictorState.selectedBestOf = bestOf;
    }

    if (selectedDisplay) {
        const surfEmoji = surface === 'Hartplatz' ? '🏟️' : surface === 'Sand' ? '🧱' : '🌿';
        selectedDisplay.textContent = `${surfEmoji} ${name}`;
        selectedDisplay.style.display = 'inline';
        selectedDisplay.style.color = '#2ecc71';
    }

    if (predictorState.player1 && predictorState.player2) {
        calculatePrediction();
    }
}

// ===== CLEAR TOURNAMENT =====
function clearPredictorTournament() {
    predictorState.selectedTournament = '';
    predictorState.tournamentDropdownOpen = false;

    const searchInput = document.getElementById('tournamentSearchInput');
    const resultsContainer = document.getElementById('tournamentResults');
    const selectedDisplay = document.getElementById('selectedTournamentDisplay');

    if (searchInput) searchInput.value = '';
    if (resultsContainer) {
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
    }
    if (selectedDisplay) {
        selectedDisplay.textContent = '';
        selectedDisplay.style.display = 'none';
    }
}

// ===== SWITCH PREDICTOR TYPE =====
async function switchPredictorType(type) {
    predictorState.type = type;
    predictorState.player1 = null;
    predictorState.player2 = null;
    predictorState.searchTerm1 = '';
    predictorState.searchTerm2 = '';
    predictorState.cacheLoaded = false;
    predictorState.players = [];
    predictorState.tournaments = [];
    predictorState.matchDb = null;
    predictorState.predictionResult = null;
    predictorState.bookieOdds = '';

    const players = await loadPlayers(type);
    predictorState.players = players;
    predictorState.cacheLoaded = true;

    const tournaments = await loadTournamentsFromDB(type);
    predictorState.tournaments = tournaments;

    if (tournaments.length > 0) {
        let defaultTour = tournaments.find(t => t.category === 'Grand Slam');
        if (!defaultTour) defaultTour = tournaments[0];
        predictorState.selectedTournament = defaultTour.name;
        predictorState.selectedSurface = defaultTour.surface;
        predictorState.selectedBestOf = defaultTour.bestOf;
    }

    renderMatchPredictor();
}

// ===== INIT MATCH PREDICTOR =====
window.loadMatchPredictor = async function() {
    predictorState.player1 = null;
    predictorState.player2 = null;
    predictorState.searchTerm1 = '';
    predictorState.searchTerm2 = '';
    predictorState.cacheLoaded = false;
    predictorState.players = [];
    predictorState.tournaments = [];
    predictorState.matchDb = null;
    predictorState.predictionResult = null;
    predictorState.bookieOdds = '';

    const players = await loadPlayers('atp');
    predictorState.players = players;
    predictorState.cacheLoaded = true;
    predictorState.type = 'atp';

    const tournaments = await loadTournamentsFromDB('atp');
    predictorState.tournaments = tournaments;

    if (tournaments.length > 0) {
        let defaultTour = tournaments.find(t => t.category === 'Grand Slam');
        if (!defaultTour) defaultTour = tournaments[0];
        predictorState.selectedTournament = defaultTour.name;
        predictorState.selectedSurface = defaultTour.surface;
        predictorState.selectedBestOf = defaultTour.bestOf;
    }

    renderMatchPredictor();

    setTimeout(addEloUpdateButton, 500);
};

window.loadMatchPredictorModule = window.loadMatchPredictor;

// =====================================================
// 🔄 ELO UPDATE BUTTON
// =====================================================

async function updateElos() {
    const status = document.getElementById('eloUpdateStatus');
    if (status) {
        status.textContent = '🔒 Nur für den Entwickler verfügbar';
        status.style.color = '#f1c40f';
        setTimeout(() => {
            if (status.textContent === '🔒 Nur für den Entwickler verfügbar') {
                loadLastUpdateDate();
            }
        }, 3000);
    }
    console.log('🔒 ELO-Update-Button geklickt - nur für Entwickler');
}

async function loadLastUpdateDate() {
    try {
        const response = await fetch(`${API_URL}/api/elo/last-update`);
        const data = await response.json();

        const status = document.getElementById('eloUpdateStatus');
        if (!status) return;

        if (data.exists && data.date) {
            status.textContent = '📅 Letztes Update: ' + data.date;
            status.style.color = '#7a8aa3';
        } else if (data.exists) {
            status.textContent = '⚠️ Keine ELOs in der Datenbank';
            status.style.color = '#e67e22';
        } else {
            status.textContent = '❌ Keine Datenbank gefunden';
            status.style.color = '#e74c3c';
        }
    } catch (error) {
        const status = document.getElementById('eloUpdateStatus');
        if (status) {
            status.textContent = '⚠️ Update-Service nicht erreichbar';
            status.style.color = '#e67e22';
        }
    }
}

function addEloUpdateButton() {
    const container = document.querySelector('.app-header') ||
                     document.querySelector('#pageContent')?.parentElement ||
                     document.querySelector('.container');

    if (!container) return;
    if (document.getElementById('eloUpdateBtn')) return;

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 16px;
        background: rgba(255,255,255,0.03);
        border-radius: 8px;
        margin: 8px 0;
        flex-wrap: wrap;
    `;

    btnContainer.innerHTML = `
        <button id="eloUpdateBtn"
                style="padding:8px 20px;border-radius:8px;border:2px solid rgba(46,204,113,0.3);
                       background:rgba(46,204,113,0.15);color:#2ecc71;font-weight:600;
                       cursor:pointer;transition:0.3s;font-family:'Inter',sans-serif;
                       font-size:14px;"
                onmouseover="this.style.background='rgba(46,204,113,0.25)';this.style.borderColor='rgba(46,204,113,0.6)'"
                onmouseout="this.style.background='rgba(46,204,113,0.15)';this.style.borderColor='rgba(46,204,113,0.3)'">
            🔄 ELOs aktualisieren
        </button>
        <span id="eloUpdateStatus" style="font-size:13px;color:#7a8aa3;">⏳ Lade Status...</span>
    `;

    container.prepend(btnContainer);
    document.getElementById('eloUpdateBtn').addEventListener('click', updateElos);
    loadLastUpdateDate();
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(addEloUpdateButton, 1000);
});

// ===== GLOBALE FUNKTIONEN =====
window.doTournamentSearch = doTournamentSearch;
window.selectPredictorTournament = selectPredictorTournament;
window.clearPredictorTournament = clearPredictorTournament;
window.selectPredictorPlayer = selectPredictorPlayer;

console.log('✅ match_predictor.js geladen (H2H-Fix)');