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

/* ───────── Spotlight Carousel ───────── */

let spotlightInterval = null;

export function renderSpotlight(items) {
    const section = document.getElementById('spotlight');
    const slider = document.getElementById('spotlight-slider');
    const dots = document.getElementById('spotlight-dots');
    if (!section || !slider || !dots || !items.length) return;

    section.style.display = 'block';
    slider.innerHTML = '';
    dots.innerHTML = '';

    items.forEach((item, i) => {
        const slide = document.createElement('div');
        slide.className = 'spotlight-slide' + (i === 0 ? ' active' : '');
        slide.innerHTML = `
            <div class="spotlight-bg" style="background-image: url('${item.backdrop}');"></div>
            <div class="spotlight-overlay"></div>
            <div class="spotlight-content">
                <div class="spotlight-number">#${i + 1} Spotlight</div>
                <div class="spotlight-title">${item.title}</div>
                <div class="spotlight-detail">
                    <span class="sp-badge">${item.type}</span>
                    <span class="sp-badge">${item.duration}</span>
                    <span class="sp-badge">${item.aired}</span>
                    <span class="sp-badge quality">${item.quality}</span>
                    <span class="sp-badge eps">EP ${item.episodes}</span>
                </div>
                <div class="spotlight-desc">${item.description}</div>
                <div class="spotlight-buttons">
                    <a class="sp-btn primary">▶ Watch Now</a>
                    <a class="sp-btn secondary">Detail →</a>
                </div>
            </div>
        `;
        slider.appendChild(slide);

        const dot = document.createElement('span');
        dot.className = 'sp-dot' + (i === 0 ? ' active' : '');
        dot.dataset.index = i;
        dot.addEventListener('click', () => goToSpotlight(i, items.length));
        dots.appendChild(dot);
    });

    goToSpotlight(0, items.length);
    startSpotlightAutoplay(items.length);
}

function goToSpotlight(index, total) {
    const slides = document.querySelectorAll('.spotlight-slide');
    const dots = document.querySelectorAll('.sp-dot');
    if (!slides.length) return;
    state._spotlightIndex = index;
    slides.forEach((s, i) => s.classList.toggle('active', i === index));
    dots.forEach((d, i) => d.classList.toggle('active', i === index));
}

function startSpotlightAutoplay(total) {
    stopSpotlightAutoplay();
    spotlightInterval = setInterval(() => {
        const next = ((state._spotlightIndex ?? 0) + 1) % total;
        goToSpotlight(next, total);
    }, 6000);
}

function stopSpotlightAutoplay() {
    if (spotlightInterval) {
        clearInterval(spotlightInterval);
        spotlightInterval = null;
    }
}

document.addEventListener('click', (e) => {
    const prevBtn = e.target.closest('#spotlight-prev');
    const nextBtn = e.target.closest('#spotlight-next');
    const section = document.getElementById('spotlight');
    if (!section || section.style.display === 'none') return;
    const total = document.querySelectorAll('.spotlight-slide').length;
    if (!total) return;
    if (prevBtn) {
        const prev = ((state._spotlightIndex ?? 0) - 1 + total) % total;
        goToSpotlight(prev, total);
        startSpotlightAutoplay(total);
    }
    if (nextBtn) {
        const next = ((state._spotlightIndex ?? 0) + 1) % total;
        goToSpotlight(next, total);
        startSpotlightAutoplay(total);
    }
});

const spEl = document.getElementById('spotlight');
if (spEl) {
    spEl.addEventListener('mouseenter', stopSpotlightAutoplay);
    spEl.addEventListener('mouseleave', () => {
        const total = document.querySelectorAll('.spotlight-slide').length;
        if (total) startSpotlightAutoplay(total);
    });
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
