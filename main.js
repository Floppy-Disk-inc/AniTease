import './events.js';
import { animateSliderTrack, initializeBackgroundSystem, renderSpotlight } from './ui.js';
import { fetchAnimeData, fetchSpotlightAnime } from './api.js';

initializeBackgroundSystem();

fetchSpotlightAnime().then(renderSpotlight);
fetchAnimeData("", 1, true);
requestAnimationFrame(animateSliderTrack);
