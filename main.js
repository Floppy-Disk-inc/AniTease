import './events.js';
import { animateSliderTrack, initializeBackgroundSystem } from './ui.js';
import { fetchAnimeData } from './api.js';

window.addEventListener('load', () => {
    initializeBackgroundSystem();
    fetchAnimeData("", 1, true);
    requestAnimationFrame(animateSliderTrack);
});
