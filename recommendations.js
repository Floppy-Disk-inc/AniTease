import { state } from './state.js';

function getBroaderPool(excludeId) {
    const seen = new Map();
    for (const a of [...state.feedPool, ...state.allAnimeData]) {
        if (a.mal_id !== excludeId) seen.set(a.mal_id, a);
    }
    try {
        const raw = sessionStorage.getItem('aniTeaseFeed');
        if (raw) {
            const feed = JSON.parse(raw);
            for (const a of feed) {
                if (a.mal_id && a.mal_id !== excludeId && !seen.has(a.mal_id)) {
                    seen.set(a.mal_id, a);
                }
            }
        }
    } catch (_) {}
    return [...seen.values()];
}

export function computeSimilar(targetAnime, count = 6) {
    const targetGenres = (targetAnime.genres || '').split(', ').filter(Boolean);
    const candidates = getBroaderPool(targetAnime.mal_id);

    const scored = candidates.map(anime => {
        let score = 0;
        const animeGenres = (anime.genres || '').split(', ').filter(Boolean);

        for (const g of targetGenres) {
            if (animeGenres.includes(g)) score += 3;
        }

        if (anime.studio && targetAnime.studio && anime.studio === targetAnime.studio) score += 2;
        if (anime.type === targetAnime.type) score += 1;

        return { anime, score };
    });

    return scored
        .sort((a, b) => b.score - a.score || (parseFloat(b.anime.score) - parseFloat(a.anime.score)))
        .slice(0, count)
        .map(s => s.anime);
}

export function renderSimilar(similarAnime) {
    const container = document.getElementById('similar-scroll');
    const section = document.getElementById('modal-similar');
    if (!container || !section) return;

    if (!similarAnime.length) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    container.innerHTML = '';

    for (const anime of similarAnime) {
        const card = document.createElement('div');
        card.className = 'similar-card';
        card.dataset.id = anime.mal_id;
        card.dataset.videoId = anime.verified_video_id || '';

        const genres = (anime.genres || '').split(', ').slice(0, 2).join(', ') || 'Anime';
        const score = anime.score || 'N/A';

        card.innerHTML = `
            <div class="similar-card-poster" style="background-image: url('${anime.images?.jpg?.large_image_url || ''}');"></div>
            <div class="similar-card-info">
                <h5 class="similar-card-title">${anime.title}</h5>
                <span class="similar-card-genres">${genres}</span>
                <span class="similar-card-score">⭐ ${score}</span>
            </div>
        `;

        card.addEventListener('click', () => {
            import('./events.js').then(m => m.openAnimeModal(anime));
        });

        container.appendChild(card);
    }
}