export const dom = {
    searchInput: document.getElementById('search-input'),
    searchButton: document.getElementById('search-btn'),
    resultsContainer: document.getElementById('results-container'),
    loadMoreBtn: document.getElementById('load-more-btn'),
    siteTopTitle: document.getElementById('site-top-title'),
    feedTitle: document.getElementById('feed-title'),
    modal: document.getElementById('trailer-modal'),
    closeBtn: document.querySelector('.close-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    closeSettings: document.querySelector('.close-settings'),
    loadingScreen: document.getElementById('loading-screen'),
    musicBtn: document.getElementById('music-btn'),
    volSlider: document.getElementById('vol-slider'),
    bgToggle: document.getElementById('bg-toggle'),
};

const isAboutPage = document.querySelector('about') !== null;

export const liveBgUrl = 'none';
export const staticBgUrl = 'none';

export const state = {
    currentPage: 1,
    isFetching: false,
    hasMoreData: true,
    currentQuery: "",
    globalUniqueIds: new Set(),
    allAnimeData: [],
    searchTimeout: null,
    currentVolPercentage: 50,
    animationTime: 0,
    audio: new Audio("assets/music1.mp3"),
    isPlaying: false,
    countdownInterval: null,
    trailerCache: {},
    aniListMasterCache: {},
    studioHeadCache: {},
    favorites: new Set(JSON.parse(localStorage.getItem('aniTeaseFavorites')) || []),
    filterMode: 'all',
    sortBy: 'default',
    activeGenre: null,
    favoritesLimit: 20,
};

state.audio.loop = true;
state.audio.volume = 0.5;

export function saveFavorites() {
    localStorage.setItem('aniTeaseFavorites', JSON.stringify([...state.favorites]));
}

export function toggleFavorite(id) {
    if (state.favorites.has(id)) {
        state.favorites.delete(id);
    } else {
        state.favorites.add(id);
    }
    saveFavorites();
}

export function getUniqueGenres() {
    const genreSet = new Set();
    state.allAnimeData.forEach(a => {
        if (a.genres) {
            a.genres.split(', ').forEach(g => genreSet.add(g));
        }
    });
    return [...genreSet].sort();
}
