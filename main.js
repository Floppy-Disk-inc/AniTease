import './events.js';
import { animateSliderTrack, initializeBackgroundSystem, renderSpotlight } from './ui.js';
import { fetchAnimeData, fetchSpotlightAnime } from './api.js';

initializeBackgroundSystem();

fetchSpotlightAnime().then(renderSpotlight).catch(() => {});
fetchAnimeData("", 1, true);

setTimeout(() => {
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'none';
}, 8000);

requestAnimationFrame(animateSliderTrack);
