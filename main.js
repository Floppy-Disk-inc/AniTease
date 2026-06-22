import './events.js';
import { animateSliderTrack, initializeBackgroundSystem } from './ui.js';
import { fetchAnimeData } from './api.js';

initializeBackgroundSystem();
fetchAnimeData("", 1, true);
requestAnimationFrame(animateSliderTrack);
