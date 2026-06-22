import { dom, liveBgUrl, staticBgUrl, state } from './state.js';

export function renderAnimeCards(animeArray) {
    if (!dom.resultsContainer) return;
    if (state.filterMode === 'favorites') {
        animeArray = animeArray.filter(a => state.favorites.has(a.mal_id));
    }
    if (animeArray.length === 0 && state.filterMode === 'favorites') {
        dom.resultsContainer.innerHTML = `<p style="color: white; font-size: 1.2rem; text-align: center; width: 100%;">No favorites yet. Click the ♡ on an anime to add it!</p>`;
        return;
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
                <div class="image-container" oncontextmenu="return false;" style="background-image: url('${anime.images.jpg.large_image_url}'); background-size: cover; background-position: center;">
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

    if (htmlContent) dom.resultsContainer.insertAdjacentHTML('beforeend', htmlContent);
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
