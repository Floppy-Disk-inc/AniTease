import { dom, liveBgUrl, staticBgUrl, state, getUniqueGenres } from './state.js';

let lazyObserver = null;

function observeLazyImages() {
    if (!lazyObserver) {
        lazyObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const bg = el.dataset.bg;
                    if (bg) el.style.backgroundImage = `url('${bg}')`;
                    el.classList.remove('lazy-bg');
                    lazyObserver.unobserve(el);
                }
            });
        }, { rootMargin: '200px' });
    }
    document.querySelectorAll('.lazy-bg').forEach(el => lazyObserver.observe(el));
}

export function renderAnimeCards(animeArray) {
    if (!dom.resultsContainer) return;
    if (state.filterMode === 'favorites') {
        animeArray = animeArray.filter(a => state.favorites.has(a.mal_id));
        animeArray = animeArray.slice(0, state.favoritesLimit);
    }
    if (animeArray.length === 0 && state.filterMode === 'favorites') {
        dom.resultsContainer.innerHTML = `<p style="color: white; font-size: 1.2rem; text-align: center; width: 100%;">No favorites yet. Click the ♡ on an anime to add it!</p>`;
        return;
    }

    if (state.activeGenre) {
        animeArray = animeArray.filter(a => a.genres && a.genres.includes(state.activeGenre));
    }
    if (animeArray.length === 0 && state.activeGenre) {
        dom.resultsContainer.innerHTML = `<p style="color: white; font-size: 1.2rem; text-align: center; width: 100%;">No anime found for genre "${state.activeGenre}".</p>`;
        return;
    }

    if (state.sortBy === 'score') {
        animeArray = [...animeArray].sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
    } else if (state.sortBy === 'popularity') {
        animeArray = [...animeArray].sort((a, b) => (b.members || 0) - (a.members || 0));
    } else if (state.sortBy === 'year') {
        animeArray = [...animeArray].sort((a, b) => (b.year || '0') > (a.year || '0') ? 1 : -1);
    } else if (state.sortBy === 'title') {
        animeArray = [...animeArray].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    let htmlContent = "";

    for (const anime of animeArray) {
        if (!anime?.images?.jpg?.large_image_url) continue;

        const watchCount = anime.members ? anime.members.toLocaleString() : "0";
        const type = anime.type || "TV";
        const score = anime.score || "N/A";
        const finalVideoId = anime.verified_video_id;
        const title = anime.title || "Unknown Title";
        const faved = state.favorites.has(anime.mal_id);

        let seasonIcon = type === 'MOVIE' || type === 'Movie' ? '🎬' : '📺';
        if (anime.season) {
            switch (anime.season.toLowerCase()) {
                case 'winter': seasonIcon = '❄️'; break;
                case 'spring': seasonIcon = '🌸'; break;
                case 'summer': seasonIcon = '☀️'; break;
                case 'fall':   seasonIcon = '🍂'; break;
            }
        }

        htmlContent += `
            <div class="anime-card" data-id="${anime.mal_id}" data-video-id="${finalVideoId}" data-title="${title.replace(/"/g, '&quot;')}">
                <div class="image-container lazy-bg" oncontextmenu="return false;" data-bg="${anime.images.jpg.large_image_url}" style="background-size: cover; background-position: center;">
                    <button class="fav-btn ${faved ? 'faved' : ''}" data-id="${anime.mal_id}" title="${faved ? 'Remove from favorites' : 'Add to favorites'}">${faved ? '♥' : '♡'}</button>
                    <span class="anime-type">${type}</span>
                    <span class="anime-badge-season">${seasonIcon} ${anime.seasonLabel}</span>
                    <span class="anime-badge-year">📅${anime.year}</span>
                </div>
                <div class="anime-stats">
                    <span class="views">👥 ${watchCount} Tracked</span>
                    <span class="rating"><span class="star-icon">⭐</span> ${score}</span>
                </div>
                <h3>${title}</h3>
            </div>
        `;
    }

    if (htmlContent) {
        dom.resultsContainer.insertAdjacentHTML('beforeend', htmlContent);
        observeLazyImages();
    }
}

export function closeModal() {
    dom.modal.style.display = 'none';
    window.__pendingVideoId = null;
    if (window.__ytPlayerReady && window.__ytPlayer && typeof window.__ytPlayer.stopVideo === 'function') {
        window.__ytPlayer.stopVideo();
    }
    clearInterval(state.countdownInterval);
}

export function initializeBackgroundSystem() {
    const savedBgPreference = localStorage.getItem("liveBackground");
    if (savedBgPreference === "enabled" || savedBgPreference === null) {
        if (dom.bgToggle) dom.bgToggle.checked = true;
        document.body.style.backgroundImage = liveBgUrl;
    } else {
        if (dom.bgToggle) dom.bgToggle.checked = false;
        document.body.style.backgroundImage = staticBgUrl;
    }
}

export function animateSliderTrack() {
    state.animationTime += 0.02;
    const cycle = (Math.sin(state.animationTime) + 1) / 2;
    const shift = cycle * state.currentVolPercentage;

    if (dom.volSlider) {
        dom.volSlider.style.background = `linear-gradient(to right, rgb(220, 20, 60) 0%, rgb(255, 255, 255) ${shift}%, rgb(220, 20, 60) ${state.currentVolPercentage}%, #333 ${state.currentVolPercentage}%, #333 100%)`;
    }
    requestAnimationFrame(animateSliderTrack);
}

export function buildGenrePills() {
    const container = document.getElementById('genre-pills');
    if (!container) return;
    const genres = getUniqueGenres();
    container.innerHTML = '<button class="genre-pill active" data-genre="">All Genres</button>';
    genres.forEach(g => {
        const pill = document.createElement('button');
        pill.className = 'genre-pill' + (state.activeGenre === g ? ' active' : '');
        pill.dataset.genre = g;
        pill.textContent = g;
        container.appendChild(pill);
    });
}

export function refreshDisplay() {
    if (state.allAnimeData.length === 0) return;
    if (!dom.resultsContainer) return;
    dom.resultsContainer.innerHTML = '';
    renderAnimeCards(state.allAnimeData);

    if (dom.loadMoreBtn) {
        if (state.filterMode === 'favorites') {
            dom.loadMoreBtn.style.display = (state.favorites.size > state.favoritesLimit && state.allAnimeData.length > 0) ? 'block' : 'none';
        } else if (state.activeGenre) {
            dom.loadMoreBtn.style.display = 'none';
        } else {
            dom.loadMoreBtn.style.display = (state.hasMoreData && state.allAnimeData.length > 0) ? 'block' : 'none';
        }
    }
}

export function startModalCountdown(timeUntilSeconds, labelPrefix) {
    clearInterval(state.countdownInterval);
    const targetElement = document.getElementById('modal-countdown');
    if (!targetElement) return;

    let timeLeft = timeUntilSeconds;
    state.countdownInterval = setInterval(() => {
        if (timeLeft <= 0) {
            targetElement.textContent = `Broadcast has commenced! Refresh for updates.`;
            clearInterval(state.countdownInterval);
            return;
        }

        const days = Math.floor(timeLeft / 86400);
        const hours = Math.floor((timeLeft % 86400) / 3600);
        const minutes = Math.floor((timeLeft % 3600) / 60);
        const seconds = timeLeft % 60;

        targetElement.textContent = `${labelPrefix}${days}d ${hours}h ${minutes}m ${seconds}s`;
        timeLeft--;
    }, 1000);
}
