// ==========================================
// SIDEBAR KOMPONENTE
// ==========================================

console.log('🔥 sidebar.js wird geladen...');

const Sidebar = {
    // 🔥 Template OHNE äußeres <div class="sidebar"> – der Container wird vom Script erzeugt
    template: `
        <div class="sidebar-logo">
            Tennis<br />
            <span class="highlight">Analyzer</span>
        </div>
        <button class="sidebar-btn" data-page="dashboard">
            📊 Dashboard
        </button>

        <button class="sidebar-btn" data-page="ranking" data-ranking="atp">
            🎾 ATP Weltrangliste
        </button>
        <button class="sidebar-btn" data-page="ranking" data-ranking="wta">
            🏆 WTA Weltrangliste
        </button>

        <button class="sidebar-btn" data-page="players" data-ranking="atp">
            👤 ATP Spieler
        </button>
        <button class="sidebar-btn" data-page="players" data-ranking="wta">
            👤 WTA Spieler
        </button>

        <button class="sidebar-btn" data-page="analyse">
            📊 Analyse
        </button>

        <button class="sidebar-btn" data-page="h2h">
            ⚔️ Head to Head
        </button>

        <button class="sidebar-btn" data-page="matchPredictor">
            🔮 Match Vorhersage
        </button>

        <div class="sidebar-footer">
            <div class="sidebar-footer-row">
                <span class="version">v1.0.0</span>
                <span class="online">🟢 Online</span>
            </div>
        </div>
    `,

    render(container) {
        if (!container) return;
        container.innerHTML = this.template;
    }
};

// ===== SIDEBAR INITIALISIEREN =====
document.addEventListener('DOMContentLoaded', function() {
    let container = document.querySelector('.sidebar');
    if (!container) {
        container = document.createElement('div');
        container.className = 'sidebar';
        const main = document.querySelector('.main');
        if (main && main.parentNode) {
            main.parentNode.insertBefore(container, main);
        } else {
            document.body.prepend(container);
        }
    }
    Sidebar.render(container);
});

console.log('✅ sidebar.js geladen');