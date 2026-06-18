// ==========================================
// 1. DOM GLOBAL ELEMENT SELECTORS
// ==========================================
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-btn');
const resultsContainer = document.getElementById('results-container');
const loadMoreBtn = document.getElementById('load-more-btn');
const siteTopTitle = document.getElementById('site-top-title');
const feedTitle = document.getElementById('feed-title');

// Modals, Screens, and Panel Containers
const modal = document.getElementById('trailer-modal');
const closeBtn = document.querySelector('.close-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const closeSettings = document.querySelector('.close-settings');
const loadingScreen = document.getElementById('loading-screen');

// Interactive System Controls
const musicBtn = document.getElementById('music-btn');
const volSlider = document.getElementById('vol-slider');
const bgToggle = document.getElementById('bg-toggle');

// Constant Configuration Links
// Automatically detects if the user is on the About page
const isAboutPage = document.querySelector('about') !== null;

const liveBgUrl = isAboutPage ? "url('assets/outro.gif')" : "url('assets/bg.gif')";
const staticBgUrl = isAboutPage ? "url('assets/outro(static).png')" : "url('assets/bg(static).png')";

// ==========================================
// 2. CORE SYSTEM ENGINE VARIABLES
// ==========================================
let ytPlayer;
let isPlayerReady = false;
let pendingVideoId = null;

let currentPage = 1;
let isFetching = false;
let hasMoreData = true;
let currentQuery = "";
let globalUniqueIds = new Set();
let allAnimeData = [];
let searchTimeout; 
let countdownInterval; 

// Custom Engine Animation States
let currentVolPercentage = 50;
let animationTime = 0;

// Audio System Configuration
let audio = new Audio("assets/music1.mp3"); 
audio.loop = true;
audio.volume = 0.5; 
let isPlaying = false;

// ==========================================
// 3. BACKUP SYSTEMS (TIER 2 DATA HUNTER)
// ==========================================
async function getTier2BackupTrailer(english, romaji, native, synonyms = []) {
    const TMDB_API_KEY = ""; 
    const searchTitles = [...new Set([english, romaji, native, ...synonyms])].filter(Boolean);    
    for (const title of searchTitles) {
        try {
            const searchUrl = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
            const response = await fetch(searchUrl);
            const searchData = await response.json();
            
            if (searchData.results && searchData.results.length > 0) {
                let bestMatch = searchData.results.find(r => r.genre_ids && r.genre_ids.includes(16)) || searchData.results[0];
                
                const mediaId = bestMatch.id;
                const mediaType = bestMatch.media_type || (bestMatch.title ? 'movie' : 'tv');

                const videoUrl = `https://api.themoviedb.org/3/${mediaType}/${mediaId}/videos?api_key=${TMDB_API_KEY}`;
                const videoResponse = await fetch(videoUrl);
                const videoData = await videoResponse.json();
                
                if (videoData.results && videoData.results.length > 0) {
                    const trailer = videoData.results.find(v => v.type === "Trailer" && v.site === "YouTube") ||
                                    videoData.results.find(v => v.type === "Teaser" && v.site === "YouTube") ||
                                    videoData.results.find(v => v.site === "YouTube");
                    
                    if (trailer) return trailer.key; 
                }
            }
        } catch (error) {
            console.error(`Tier 2 failed tracking title "${title}":`, error);
        }
    }
    return null;
}

// ==========================================
// TIER 3 BACKUP (YOUTUBE DATA API v3 - FILTER & SEQUEL ENGINE)
// ==========================================
const YOUTUBE_API_KEY = '';

async function getTier3YouTubeTrailer(title) {
    if (!title || YOUTUBE_API_KEY === '') return null;
    try {
        const query = encodeURIComponent(`${title} official anime trailer PV`);
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${query}&key=${YOUTUBE_API_KEY}&maxResults=5`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
            const blacklist = ['primeflix', 'anime hype', 'kiji', 'fan trailer', 'concept trailer', 'slv sound design', 'amv'];
            const lowerTitle = title.toLowerCase();
            
            const sequelMatch = lowerTitle.match(/(season\s+(\d+)|part\s+(\d+)|cour\s+(\d+)|\b(ii|iii|iv|v)\b|two blue vortex)/i);
            
            for (let item of data.items) {
                const vidTitle = item.snippet.title.toLowerCase();
                const channelName = item.snippet.channelTitle.toLowerCase();
                
                const isBlacklisted = blacklist.some(term => vidTitle.includes(term) || channelName.includes(term));
                if (isBlacklisted) continue;
                
                if (sequelMatch) {
                    const targetNumMatch = lowerTitle.match(/\b(2|3|4|5|6|7|8|9)\b/);
                    if (targetNumMatch) {
                        const targetNum = targetNumMatch[1];
                        if (!vidTitle.includes(targetNum)) continue;
                        if (targetNum > "1" && vidTitle.match(/\b1\b/)) continue;
                    }
                }
                
                return item.id.videoId; 
            }
            return data.items[0].id.videoId;
        }
    } catch (error) {
        console.error(`Tier 3 failed tracking title "${title}":`, error);
    }
    return null;
}

function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('trailer-player', {
        height: '450',
        width: '100%',
        videoId: '', 
        playerVars: {
            'autoplay': 1,
            'rel': 0,
            'modestbranding': 1
        },
        events: {
            'onReady': (event) => {
                isPlayerReady = true;
                if (pendingVideoId) {
                    event.target.loadVideoById(pendingVideoId);
                    pendingVideoId = null; 
                }
            }
        }
    });
}

// ==========================================
// 4. GLOBAL ANIME ENGINE (ANILIST GRAPHQL)
// ==========================================
async function fetchAnimeData(title = "", page = 1, isNewSearch = true) {
    if (isFetching || (!hasMoreData && !isNewSearch)) return;
    isFetching = true;
    
    if (isNewSearch) {
        loadingScreen.style.display = 'flex';
        currentQuery = title;
        currentPage = 1;
        hasMoreData = true;
        globalUniqueIds.clear();
        resultsContainer.innerHTML = ""; 
        allAnimeData = [];
    }
    
    const isUpcomingFeed = title.trim() === "";

    if (feedTitle && isNewSearch) {
        feedTitle.textContent = isUpcomingFeed ? "Upcoming Anime" : `Showing Results For "${title}"`;
    }

    const url = 'https://graphql.anilist.co';
    const query = `
    query ($page: Int, $perPage: Int, $search: String, $status: MediaStatus) {
      Page (page: $page, perPage: $perPage) {
        pageInfo { hasNextPage }
        media (search: $search, status: $status, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          id
          idMal
          synonyms
          title { english romaji native }
          coverImage { extraLarge large medium }
          description
          averageScore
          popularity
          format
          season
          seasonYear
          startDate { year month day }
          episodes
          source
          genres
          studios(isMain: true) { nodes { name } }
          trailer { id site }
        }
      }
    }`;

    let variables = { page: page, perPage: 40 };
    if (isUpcomingFeed) {
        variables.status = "NOT_YET_RELEASED";
    } else {
        variables.search = title;
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables })
        });
        const result = await response.json();
        
        if (result.data && result.data.Page.media.length > 0) {
            const incomingAnime = result.data.Page.media;
            hasMoreData = result.data.Page.pageInfo.hasNextPage;

            const processedAnime = [];
            const backupPromises = [];

            incomingAnime.forEach(anime => {
                if (globalUniqueIds.has(anime.id)) return;
                globalUniqueIds.add(anime.id);

                const mainTitle = (anime.title.english && anime.title.english.trim() !== "") 
                    ? anime.title.english 
                    : (anime.title.romaji || anime.title.native || "Unknown Title");
                
                let trailerVideoId = null;
                if (anime.trailer && anime.trailer.site === 'youtube') {
                    trailerVideoId = anime.trailer.id;
                }

                const studio = anime.studios?.nodes?.[0]?.name || "Unknown Studio";
                const genres = anime.genres ? anime.genres.slice(0, 3).join(", ") : "Anime";
                const episodes = anime.episodes || "TBA";
                const synonyms = anime.synonyms || []; 
                
                const bestImage = anime.coverImage.extraLarge || anime.coverImage.large || anime.coverImage.medium;
                const protectedYear = anime.seasonYear || anime.startDate?.year || "TBD";
                
                let seasonBadgeText = "UPCOMING";
                if (anime.season) {
                    seasonBadgeText = `${anime.season.toUpperCase()}`;
                }

                const animeObject = {
                    anilist_id: anime.id,
                    mal_id: anime.idMal || anime.id,
                    title: mainTitle,
                    images: { jpg: { large_image_url: bestImage } },
                    description: anime.description || "No official lore has been released yet.",
                    type: anime.format || "TV",
                    score: anime.averageScore ? (anime.averageScore / 10).toFixed(1) : "N/A",
                    members: anime.popularity || 0,
                    verified_video_id: trailerVideoId,
                    season: anime.season || "Upcoming",
                    seasonLabel: seasonBadgeText,
                    year: protectedYear,
                    studio: studio,
                    genres: genres,
                    episodes: episodes,
                    synonyms: synonyms,
                    startDate: anime.startDate
                };

                processedAnime.push(animeObject);

                if (!trailerVideoId) {
                    const promise = getTier2BackupTrailer(anime.title.english, anime.title.romaji, anime.title.native, synonyms).then(backupId => {
                        if (backupId) animeObject.verified_video_id = backupId;         
                   });
                    backupPromises.push(promise);
                }
            });

            if (backupPromises.length > 0) {
                await Promise.all(backupPromises);
            }

            allAnimeData = [...allAnimeData, ...processedAnime];
            renderAnimeCards(processedAnime);
            currentPage++;

        } else {
            hasMoreData = false;
            if (isNewSearch) {
                resultsContainer.innerHTML = `<p style="color: white; font-size: 1.2rem;">No results found.</p>`;
            }
        } 
    } catch (error) {
        console.error("AniList Fetch Error:", error);
        if (isNewSearch) {
            resultsContainer.innerHTML = `<p style="color: white; font-size: 1.2rem;">Something went wrong. Please try again.</p>`;
        }
    } finally {
        isFetching = false;
        loadingScreen.style.display = 'none';
        loadMoreBtn.style.display = (hasMoreData && allAnimeData.length > 0) ? 'block' : 'none';
    }
}

// ==========================================
// 5. USER INTERFACE & UTILITY LORE
// ==========================================
function initializeBackgroundSystem() {
    const savedBgPreference = localStorage.getItem("liveBackground");
    if (savedBgPreference === "enabled" || savedBgPreference === null) {
        bgToggle.checked = true;
        document.body.style.backgroundImage = liveBgUrl;
    } else {
        bgToggle.checked = false;
        document.body.style.backgroundImage = staticBgUrl;
    }
}

function animateSliderTrack() {
    animationTime += 0.02; 
    const cycle = (Math.sin(animationTime) + 1) / 2; 
    const shift = cycle * currentVolPercentage; 
    
    if (volSlider) {
        volSlider.style.background = `linear-gradient(to right, rgb(220, 20, 60) 0%, rgb(255, 255, 255) ${shift}%, rgb(220, 20, 60) ${currentVolPercentage}%, #333 ${currentVolPercentage}%, #333 100%)`;
    }
    requestAnimationFrame(animateSliderTrack);
}

function initiateSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        fetchAnimeData(searchInput.value.trim(), 1, true); 
    }, 300);
}

function renderAnimeCards(animeArray) {
    let htmlContent = "";

    for (const anime of animeArray) {
        if (!anime?.images?.jpg?.large_image_url) continue;

        const watchCount = anime.members ? anime.members.toLocaleString() : "0";
        const type = anime.type || "TV";
        const score = anime.score || "N/A";
        const finalVideoId = anime.verified_video_id; 
        const title = anime.title || "Unknown Title";
        
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
            <div class="anime-card" data-id="${anime.mal_id}" data-video-id="${finalVideoId}" data-title="${title.replace(/"/g, '"')}">
                <div class="image-container" oncontextmenu="return false;" style="background-image: url('${anime.images.jpg.large_image_url}'); background-size: cover; background-position: center;">
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

    if (htmlContent) resultsContainer.insertAdjacentHTML('beforeend', htmlContent);
}

function closeModal() {
    modal.style.display = 'none';
    pendingVideoId = null;
    if (isPlayerReady && ytPlayer && typeof ytPlayer.stopVideo === 'function') {
        ytPlayer.stopVideo(); 
    }
    clearInterval(countdownInterval);
}

// ==========================================
// 7. EVENT EMITTERS & LISTENERS
// ==========================================
bgToggle.addEventListener('change', () => {
    if (bgToggle.checked) {
        document.body.style.backgroundImage = liveBgUrl;
        localStorage.setItem("liveBackground", "enabled");
    } else {
        document.body.style.backgroundImage = staticBgUrl;
        localStorage.setItem("liveBackground", "disabled");
    }
});

settingsBtn.addEventListener('click', () => settingsPanel.style.display = 'flex');
closeSettings.addEventListener('click', () => settingsPanel.style.display = 'none');
window.addEventListener('click', (e) => { if (e.target === settingsPanel) settingsPanel.style.display = 'none'; });

if (volSlider) {
    volSlider.addEventListener('input', (e) => {
        const value = e.target.value;
        if (audio) audio.volume = value;
        currentVolPercentage = value * 100;
    });
}

if (searchInput) searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') initiateSearch(); });
if (searchButton) searchButton.addEventListener('click', initiateSearch);
if (loadMoreBtn) loadMoreBtn.addEventListener('click', () => fetchAnimeData(currentQuery, currentPage, false));

// Handles Card Click, Modal Injections, and Layout Adjustments
if (resultsContainer) {
    resultsContainer.addEventListener('click', async (event) => {
        const card = event.target.closest('.anime-card');
        if (!card) return;

        clearInterval(countdownInterval);

        const animeId = parseInt(card.getAttribute('data-id'));
        const clickedAnime = allAnimeData.find(a => a.mal_id === animeId);
        if (!clickedAnime) return;
        
        modal.style.display = 'flex';

        document.getElementById('modal-poster').src = clickedAnime.images.jpg.large_image_url;
        document.getElementById('modal-title').textContent = clickedAnime.title;
        document.getElementById('modal-studio').textContent = clickedAnime.studio;

        const epBadge = document.getElementById('modal-episodes');
        if (epBadge) {
            const isMovie = clickedAnime.type === "Movie" || clickedAnime.type === "MOVIE";
            if (isMovie || clickedAnime.season === "Upcoming" || clickedAnime.episodes === "TBA" || !clickedAnime.episodes) {
                epBadge.style.display = 'none';
            } else {
                epBadge.style.display = '';
                epBadge.textContent = `EPs: ${clickedAnime.episodes}`;
            }
        }
        
        const sourceBadge = document.getElementById('modal-source');
        if (sourceBadge) {
            sourceBadge.textContent = clickedAnime.seasonLabel;
        }

        document.getElementById('modal-genres').textContent = clickedAnime.genres;
        document.getElementById('modal-desc').innerHTML = clickedAnime.description;

        const countdownElem = document.getElementById('modal-countdown');
        if (countdownElem) countdownElem.textContent = "Loading airing schedule...";
        
        document.getElementById('modal-director').textContent = "Director: Loading...";
        document.getElementById('modal-cast').textContent = "Cast: Loading...";

        const streamsContainer = document.getElementById('modal-streams');
        if (streamsContainer) streamsContainer.innerHTML = ""; 

        // --- WIKIDATA STUDIO HEAD FETCHER (WITH STRING CLEANER) ---
        const studioHeadCache = {};

        async function fetchStudioHead(studioName) {
            if (!studioName || studioName === "Unknown Studio" || studioName === "TBA") return "TBA";
            
            const cleanStudioName = studioName.replace(/\b(Studio|Animation|Co\.|Ltd\.|Corp\.|Inc\.)\b/gi, '').trim();
            if (studioHeadCache[cleanStudioName]) return studioHeadCache[cleanStudioName];

            const endpointUrl = 'https://query.wikidata.org/sparql';
            const sparqlQuery = `
            SELECT ?personLabel WHERE {
            ?studio rdfs:label ?name.
            FILTER(CONTAINS(LCASE(?name), LCASE("${cleanStudioName}")))
            ?studio wdt:P31/wdt:P279* wd:Q4830453. 
            { ?studio wdt:P112 ?person. } UNION { ?studio wdt:P169 ?person. }
            SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
            } LIMIT 1`;

            try {
                const response = await fetch(endpointUrl + '?query=' + encodeURIComponent(sparqlQuery), {
                    headers: { 'Accept': 'application/sparql-results+json' }
                });
                const data = await response.json();
                
                if (data.results.bindings.length > 0) {
                    const headName = data.results.bindings[0].personLabel.value;
                    studioHeadCache[cleanStudioName] = headName;
                    return headName;
                }
            } catch (e) {
                console.warn("Wikidata search failed for studio:", cleanStudioName);
            }
            
            studioHeadCache[cleanStudioName] = "TBA";
            return "TBA";
        }

        let videoId = clickedAnime.verified_video_id;
        const playerContainer = document.getElementById('trailer-player'); 
        const splitLayoutContainer = document.querySelector('.split-layout');
        const videoSection = document.getElementById('modal-video-section');

        function applyVideoLayout(activeVideoId) {
            if (activeVideoId) {
                if (videoSection) videoSection.style.display = 'flex';
                if (splitLayoutContainer) splitLayoutContainer.classList.remove('no-video-mode');
                if (playerContainer) playerContainer.style.display = 'block';

                if (isPlayerReady && ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
                    ytPlayer.loadVideoById(activeVideoId);
                } else {
                    pendingVideoId = activeVideoId;
                }
            } else {
                if (videoSection) videoSection.style.display = 'none';
                if (playerContainer) playerContainer.style.display = 'none';
                if (splitLayoutContainer) splitLayoutContainer.classList.add('no-video-mode');
            }
        }
        
        // --- PIPELINE DATA & VIDEO PROCESSING ---
        try {
            const currentMalId = clickedAnime.mal_id;
            const currentAnilistId = clickedAnime.anilist_id || clickedAnime.mal_id;
            const currentAnimeTitle = clickedAnime.title;
            
            const directorElem = document.getElementById('modal-director');
            const castElem = document.getElementById('modal-cast');

            // MULTI-TEASER/TRAILER ENGINE API FETCH
            let promoVideos = [];
            if (currentMalId) {
                try {
                    const jikanVidRes = await fetch(`https://api.jikan.moe/v4/anime/${currentMalId}/videos`);
                    if (jikanVidRes.ok) {
                        const jikanVidData = await jikanVidRes.json();
                        if (jikanVidData.data && jikanVidData.data.promo) {
                            promoVideos = jikanVidData.data.promo; 
                        }
                    }
                } catch (e) {
                    console.warn("Extra footage pipeline skipped.");
                }
            }

            // Apply primary video, if not found use the first promo (Teaser/Sneak Peek)
            if (!videoId && promoVideos.length > 0 && promoVideos[0].trailer.youtube_id) {
                videoId = promoVideos[0].trailer.youtube_id;
            }

            applyVideoLayout(videoId);

            // EXTRA FOOTAGE INJECTION MODULE
            let extraVideosContainer = document.getElementById('modal-extra-videos');
            if (!extraVideosContainer) {
                // Find a safe container on the right info side
                const parentContainer = document.getElementById('modal-streams')?.parentElement || document.querySelector('.modal-info');
                if (parentContainer) {
                    extraVideosContainer = document.createElement('div');
                    extraVideosContainer.id = 'modal-extra-videos';
                    extraVideosContainer.style.marginTop = '20px';
                    parentContainer.appendChild(extraVideosContainer);
                }
            }

            if (extraVideosContainer) {
                extraVideosContainer.innerHTML = ''; // Clear previous data
                if (promoVideos.length > 1 || (promoVideos.length > 0 && videoId !== promoVideos[0].trailer.youtube_id)) {
                    extraVideosContainer.innerHTML = `<h4 style="margin-bottom: 10px; color: #fff;">Extra Footage</h4>`;
                    const btnContainer = document.createElement('div');
                    btnContainer.style.display = 'flex';
                    btnContainer.style.flexWrap = 'wrap';
                    btnContainer.style.gap = '10px';

                    promoVideos.slice(0, 5).forEach(promo => {
                        if (promo.trailer.youtube_id) {
                            const vidBtn = document.createElement('button');
                            vidBtn.className = 'stream-pill'; // Reusing your pill style
                            vidBtn.style.backgroundColor = '#444';
                            vidBtn.style.color = '#fff';
                            vidBtn.style.cursor = 'pointer';
                            vidBtn.style.border = 'none';
                            vidBtn.textContent = promo.title || "Sneak Peek";
                            
                            vidBtn.addEventListener('click', () => {
                                applyVideoLayout(promo.trailer.youtube_id);
                                // Visual cue that it's selected
                                document.querySelectorAll('#modal-extra-videos button').forEach(b => b.style.backgroundColor = '#444');
                                vidBtn.style.backgroundColor = '#FBC02D'; 
                                vidBtn.style.color = '#000';
                            });

                            btnContainer.appendChild(vidBtn);
                        }
                    });
                    extraVideosContainer.appendChild(btnContainer);
                }
            }

            const aniListData = await fetchAniListMasterData(currentAnilistId, currentAnimeTitle, clickedAnime.synonyms || []);
            
            // --- MULTI-TIERED FUZZY COUNTDOWN ENGINE ---
            if (countdownElem) {
                clearInterval(countdownInterval); 
                if (aniListData && aniListData.nextAiringEpisode) {
                    const { timeUntilAiring, episode } = aniListData.nextAiringEpisode;
                    startModalCountdown(timeUntilAiring, `Ep ${episode} Airs In: `);
                } else if (aniListData && aniListData.startDate && aniListData.startDate.year) {
                    const { year, month, day } = aniListData.startDate;
                    let targetDate;
                    let labelText = "";

                    if (month && day) {
                        targetDate = new Date(year, month - 1, day);
                        labelText = `Est. Premiere (${month}/${day}/${year}): `;
                    } else if (month) {
                        targetDate = new Date(year, month - 1, 1);
                        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                        labelText = `Est. Premiere (${monthNames[month - 1]} ${year}): `;
                    } else {
                        targetDate = new Date(year, 0, 1);
                        labelText = `Est. Premiere (${year}): `;
                    }

                    const currentMs = Date.now();
                    const targetMs = targetDate.getTime();
                    let secondsRemaining = Math.floor((targetMs - currentMs) / 1000);

                    if (secondsRemaining > 0) {
                        startModalCountdown(secondsRemaining, labelText);
                    } else {
                        const realStatus = aniListData.status ? aniListData.status.replace(/_/g, ' ') : "RELEASED";
                        countdownElem.textContent = `Airing Status: ${realStatus}`;
                    }
                } else {
                    const realStatus = aniListData?.status ? aniListData.status.replace(/_/g, ' ') : "RELEASED";
                    countdownElem.textContent = `Airing Status: ${realStatus}`;
                }
            }

            // --- DYNAMIC TRAILER INJECTION (WIRED WITH TIER 3 YOUTUBE SEARCH) ---
            if (!videoId) {
                if (aniListData && aniListData.trailer && aniListData.trailer.site === 'youtube') {
                    videoId = aniListData.trailer.id;
                }
                if (!videoId) {
                    let cleanTitle = currentAnimeTitle.replace(/(\s+Part\s+\d+|\s+Season\s+\d+|\s+\d+(st|nd|rd|th)\s+Season|\s+Cour\s+\d+|\s+-*\s*Part\s+\d+)/gi, '').trim();
                    const searchTitles = [...new Set([currentAnimeTitle, cleanTitle, ...(clickedAnime.synonyms || [])])].filter(Boolean);
                    videoId = await getTier2BackupTrailer(searchTitles[0], searchTitles[1], searchTitles[2], clickedAnime.synonyms);
                }
                if (!videoId) {
                    videoId = await getTier3YouTubeTrailer(currentAnimeTitle);
                }

                if (videoId) {
                    clickedAnime.verified_video_id = videoId; 
                    applyVideoLayout(videoId);
                } else {
                    applyVideoLayout(null);
                }
            }

            // --- DYNAMIC STUDIO INJECTION ---
            let studioName = clickedAnime.studio;
            if ((!studioName || studioName === "Unknown Studio") && aniListData?.studios?.nodes?.length > 0) {
                studioName = aniListData.studios.nodes[0].name;
                clickedAnime.studio = studioName; 
                document.getElementById('modal-studio').textContent = studioName;
            }

            // --- STRICT OMNI-STREAMING WHITELIST ENGINE ---
            const platformStyles = {
                'crunchyroll': { bg: '#F47521', text: '#FFFFFF' },
                'netflix': { bg: '#E50914', text: '#FFFFFF' },
                'hulu': { bg: '#1CE783', text: '#000000' },
                'hidive': { bg: '#00AEFF', text: '#FFFFFF' },
                'amazon': { bg: '#00A8E8', text: '#FFFFFF' },
                'amazon prime video': { bg: '#00A8E8', text: '#FFFFFF' },
                'disney+': { bg: '#0063e5', text: '#FFFFFF' },
                'funimation': { bg: '#410099', text: '#FFFFFF' },
                'tubi': { bg: '#f25b22', text: '#FFFFFF' },
                'youtube': { bg: '#FF0000', text: '#FFFFFF' },
                'justwatch': { bg: '#312432', text: '#FBC02D', border: '#FBC02D' }
            };

            const allowedStreamingSites = [
                'crunchyroll', 'netflix', 'hulu', 'hidive', 'amazon', 'amazon prime video', 
                'disney+', 'funimation', 'tubi', 'youtube'
            ];

            let linksToRender = [];
            if (aniListData) {
                if (aniListData.externalLinks && aniListData.externalLinks.length > 0) {
                    linksToRender = [...aniListData.externalLinks];
                }
                if (linksToRender.length === 0 || aniListData.status === "NOT_YET_RELEASED") {
                    const prequelEdge = aniListData.relations?.edges?.find(edge => 
                        edge.relationType === "PREQUEL" || edge.relationType === "PARENT"
                    );
                    if (prequelEdge?.node?.externalLinks && prequelEdge.node.externalLinks.length > 0) {
                        linksToRender = [...linksToRender, ...prequelEdge.node.externalLinks];
                    }
                }
            }

            if (streamsContainer) {
                streamsContainer.innerHTML = ""; 
                const seenSites = new Set();
                const cleanStreamingLinks = [];

                linksToRender.forEach(link => {
                    const lowerSite = link.site.toLowerCase();
                    // ONLY allow it if it's explicitly in the whitelist
                    if (allowedStreamingSites.includes(lowerSite) && !seenSites.has(lowerSite)) {
                        seenSites.add(lowerSite);
                        cleanStreamingLinks.push(link);
                    }
                });

                if (cleanStreamingLinks.length > 0) {
                    cleanStreamingLinks.forEach(link => {
                        const pill = document.createElement('a');
                        pill.href = link.url;
                        pill.target = "_blank";
                        pill.className = "stream-pill";
                        pill.textContent = link.site;
                        
                        const siteKey = link.site.toLowerCase();
                        if (platformStyles[siteKey]) {
                            pill.style.backgroundColor = platformStyles[siteKey].bg;
                            pill.style.color = platformStyles[siteKey].text;
                            pill.style.borderColor = platformStyles[siteKey].bg;
                        } else {
                            pill.style.backgroundColor = "#2a2a2a";
                            pill.style.color = "#ffffff";
                            pill.style.borderColor = "#444444";
                        }
                        streamsContainer.appendChild(pill);
                    });
                } else {
                    const fallbackPill = document.createElement('a');
                    fallbackPill.href = `https://www.justwatch.com/us/search?q=${encodeURIComponent(currentAnimeTitle)}`;
                    fallbackPill.target = "_blank";
                    fallbackPill.className = "stream-pill fallback-pill";
                    fallbackPill.textContent = "JustWatch";
                    
                    fallbackPill.style.backgroundColor = platformStyles['justwatch'].bg;
                    fallbackPill.style.color = platformStyles['justwatch'].text;
                    fallbackPill.style.borderColor = platformStyles['justwatch'].border;
                    fallbackPill.style.borderWidth = "1px";
                    fallbackPill.style.borderStyle = "solid";
                    
                    streamsContainer.appendChild(fallbackPill);
                }
            }

            let directorName = "Unknown";
            let castNames = "Alternative Casting";

            if (aniListData) {
                if (aniListData.staff && aniListData.staff.edges) {
                    const directorEdge = aniListData.staff.edges.find(edge => 
                        edge.role && edge.role.toLowerCase().includes('director')
                    );
                    if (directorEdge) directorName = directorEdge.node.name.full;
                }
                if (aniListData.characters && aniListData.characters.nodes && aniListData.characters.nodes.length > 0) {
                    castNames = aniListData.characters.nodes.map(char => char.name.full).join(', ');
                }
            }

            // Layer 2: Jikan API
            if ((directorName === "Unknown" || castNames === "Alternative Casting") && currentMalId) {
                try {
                    const jikanStaffRes = await fetch(`https://api.jikan.moe/v4/anime/${currentMalId}/staff`);
                    if (jikanStaffRes.ok) {
                        const jikanStaff = await jikanStaffRes.json();
                        if (jikanStaff?.data) {
                            const director = jikanStaff.data.find(member => 
                                member.positions && member.positions.some(pos => 
                                    pos === "Director" || pos === "Series Director" || pos === "Chief Director"
                                )
                            );
                            if (director) directorName = director.person.name;
                        }
                    }
                    
                    await new Promise(r => setTimeout(r, 250));

                    const jikanCastRes = await fetch(`https://api.jikan.moe/v4/anime/${currentMalId}/characters`);
                    if (jikanCastRes.ok) {
                        const jikanCast = await jikanCastRes.json();
                        if (jikanCast?.data && jikanCast.data.length > 0) {
                            castNames = jikanCast.data.slice(0, 3).map(c => c.character.name).join(', ');
                        }
                    }
                } catch (e) {
                    console.warn("Layer 2 Jikan Fallback skipped.");
                }
            }

            // Layer 3: ANN API
            if (directorName === "Unknown") {
                const annData = await fetchANNStaffDetails(currentAnimeTitle);
                if (annData.director !== "Unknown" && annData.director !== "Production Crew") {
                    directorName = annData.director;
                }
                if (castNames === "Alternative Casting" && annData.cast !== "Alternative Casting" && annData.cast !== "Main Cast Indexed") {
                    castNames = annData.cast;
                }
            }

            // --- LAYER 4: ACTUAL DIRECTOR ENFORCEMENT & STRICT FALLBACK ---
            if (directorElem) {
                if (directorName === "Unknown" || directorName === "Production Crew") {
                    // Completely removed "In Production at". If director isn't found, we strictly check wikidata.
                    const fallbackHead = await fetchStudioHead(studioName);
                    if (fallbackHead && fallbackHead !== "TBA") {
                        directorElem.innerHTML = `<strong>Director:</strong> ${fallbackHead}`;
                    } else {
                        // Absolute Strict Fallback if no actual human name exists
                        directorElem.innerHTML = `<strong>Director:</strong> TBA`;
                    }
                } else {
                    directorElem.innerHTML = `<strong>Director:</strong> ${directorName}`;
                }
            }

            if (castElem) {
                castElem.innerHTML = `<strong>Cast:</strong> ${castNames}`;
            }

        } catch (err) {
            console.error("Auxiliary background data failed processing:", err);
            const directorElem = document.getElementById('modal-director');
            const castElem = document.getElementById('modal-cast');
            if (directorElem) {
                directorElem.innerHTML = `<strong>Director:</strong> TBA`;
            }
            if (castElem && castElem.textContent.includes("Loading")) castElem.textContent = "Cast: Alternative Casting";
        }
    }); 
}
// ==========================================
// 8. SYSTEM APP LIFECYCLE LISTENERS
// ==========================================
if (closeBtn) closeBtn.addEventListener('click', closeModal);
window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

if (siteTopTitle) {
    siteTopTitle.addEventListener('click', () => {
        if (searchInput.value.trim() !== "" || currentQuery !== "") {
            searchInput.value = ""; 
            fetchAnimeData("", 1, true);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

musicBtn.addEventListener('click', () => {
    if (isPlaying) {
        audio.pause();
        musicBtn.textContent = "🔈";
    } else {
        audio.play().catch(e => console.log("Audio play blocked:", e));
        musicBtn.textContent = "🔊";
    }
    isPlaying = !isPlaying;
});

window.addEventListener('load', () => {
    initializeBackgroundSystem();
    if (resultsContainer) {
        fetchAnimeData("", 1, true); 
    }
    requestAnimationFrame(animateSliderTrack);
});

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('search-input');
    const btn = document.getElementById('search-btn');
    const dropdown = document.getElementById('recent-searches');

    if (!input || !btn || !dropdown) return;

    input.addEventListener('focus', () => { displaySearchHistory(); });
    input.addEventListener('blur', () => { setTimeout(() => { dropdown.style.display = 'none'; }, 200); });
    btn.addEventListener('click', () => { saveSearch(input.value.trim()); });
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveSearch(input.value.trim());
            input.blur();
        }
    });
});

function saveSearch(query) {
    if (!query) return;
    let history = JSON.parse(localStorage.getItem('aniTeaseHistory')) || [];
    history = history.filter(item => item.toLowerCase() !== query.toLowerCase());
    history.unshift(query);
    if (history.length > 6) history.pop();
    localStorage.setItem('aniTeaseHistory', JSON.stringify(history));
}

function displaySearchHistory() {
    const dropdown = document.getElementById('recent-searches');
    const input = document.getElementById('search-input');
    const btn = document.getElementById('search-btn');
    if (!dropdown || !input || !btn) return;
    
    const history = JSON.parse(localStorage.getItem('aniTeaseHistory')) || [];
    if (history.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    dropdown.innerHTML = '';
    dropdown.style.display = 'block';

    history.forEach(term => {
        const item = document.createElement('div');
        item.className = 'search-history-item';
        item.textContent = term;
        item.addEventListener('mousedown', () => {
            input.value = term;
            btn.click();
        });
        dropdown.appendChild(item);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const topBtn = document.querySelector('.back-to-top');
    const siteTitle = document.getElementById('site-top-title');
    const footer = document.querySelector('footer');

    if (!topBtn) return; 

    window.addEventListener('scroll', () => {
        const titleThreshold = siteTitle ? siteTitle.offsetTop + siteTitle.offsetHeight : 200;
        if (window.scrollY > titleThreshold) {
            topBtn.classList.add('active');
        } else {
            topBtn.classList.remove('active');
        }
    }, { passive: true });

    if (footer) {
        const adjustButtonHeight = () => {
            const footerRect = footer.getBoundingClientRect();
            const windowHeight = window.innerHeight;

            if (footerRect.top < windowHeight) {
                const visibleFooterHeight = windowHeight - footerRect.top;
                topBtn.style.setProperty('--footer-offset', `${visibleFooterHeight + 32}px`);
            } else {
                topBtn.style.setProperty('--footer-offset', '2rem');
            }
        };

        window.addEventListener('scroll', adjustButtonHeight, { passive: true });
        window.addEventListener('resize', adjustButtonHeight, { passive: true });
    }
});

function startModalCountdown(timeUntilSeconds, labelPrefix) {
    clearInterval(countdownInterval);
    const targetElement = document.getElementById('modal-countdown');
    if (!targetElement) return;

    let timeLeft = timeUntilSeconds;
    countdownInterval = setInterval(() => {
        if (timeLeft <= 0) {
            targetElement.textContent = `Broadcast has commenced! Refresh for updates.`;
            clearInterval(countdownInterval);
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

async function fetchANNStaffDetails(animeTitle) {
    try {
        const cleanTitle = animeTitle.replace(/(S\d+|Season \d+|Part \d+|:\s*Core\s*\d+)/gi, '').trim();
        const url = `https://cdn.animenewsnetwork.com/encyclopedia/api.xml?title=${encodeURIComponent(cleanTitle)}`;
        const response = await fetch(url);
        const xmlText = await response.text();
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const staffNodes = xmlDoc.getElementsByTagName('staff');
        let director = "Unknown";

        for (let node of staffNodes) {
            const task = node.getElementsByTagName('task')[0]?.textContent;
            const person = node.getElementsByTagName('person')[0]?.textContent;
            if (task?.toLowerCase().includes('director')) {
                director = person;
                break;
            }
        }

        const castNodes = xmlDoc.getElementsByTagName('cast');
        let mainCast = [];
        for (let i = 0; i < Math.min(castNodes.length, 3); i++) {
            mainCast.push(castNodes[i].getElementsByTagName('person')[0]?.textContent);
        }

        return { director, cast: mainCast.length > 0 ? mainCast.join(', ') : "Alternative Casting" };
    } catch (e) {
        console.error("ANN Industry Engine failed:", e);
        return { director: "Production Crew", cast: "Main Cast Indexed" };
    }
}

async function fetchAniListMasterData(anilistId, animeTitle, synonyms = []) {
    const url = 'https://graphql.anilist.co';
    const queryById = `
    query ($id: Int) {
      Media (id: $id, type: ANIME) {
        status
        startDate { year month day }
        nextAiringEpisode { airingAt timeUntilAiring episode }
        externalLinks { url site }
        relations {
          edges {
            relationType
            node {
              id
              externalLinks { url site }
            }
          }
        }
        studios(isMain: true) { nodes { name } }
        trailer { id site }
        staff(perPage: 10) { edges { role node { name { full } } } }
        characters(sort: ROLE, perPage: 3) { nodes { name { full } } }
      }
    }`;

    const queryByTitle = `
    query ($title: String) {
      Media (search: $title, type: ANIME) {
        status
        startDate { year month day }
        nextAiringEpisode { airingAt timeUntilAiring episode }
        externalLinks { url site }
        relations {
          edges {
            relationType
            node {
              id
              externalLinks { url site }
            }
          }
        }
        studios(isMain: true) { nodes { name } }
        trailer { id site }
        staff(perPage: 10) { edges { role node { name { full } } } }
        characters(sort: ROLE, perPage: 3) { nodes { name { full } } }
      }
    }`;

    try {
        let response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ query: queryById, variables: { id: anilistId } })
        });
        let result = await response.json();
        let exactMedia = result.data?.Media;

        if (!exactMedia) return null;

        let hasStaff = exactMedia.staff && exactMedia.staff.edges.length > 0;
        let hasTrailer = exactMedia.trailer && exactMedia.trailer.site === 'youtube';

        if (hasStaff && hasTrailer) {
            return exactMedia; 
        }

        let cleanTitle = animeTitle
            .replace(/(\s+Part\s+\d+|\s+Season\s+\d+|\s+\d+(st|nd|rd|th)\s+Season|\s+Cour\s+\d+|\s+-*\s*Part\s+\d+)/gi, '')
            .trim();

        const titleFallbackQueue = [...new Set([cleanTitle, ...synonyms])].filter(Boolean);

        for (const testTitle of titleFallbackQueue) {
            response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify({ query: queryByTitle, variables: { title: testTitle } })
            });
            result = await response.json();
            let fallbackMedia = result.data?.Media;

            if (fallbackMedia) {
                if (!hasStaff && fallbackMedia.staff && fallbackMedia.staff.edges.length > 0) {
                    exactMedia.staff = fallbackMedia.staff;
                    exactMedia.characters = fallbackMedia.characters;
                    hasStaff = true;
                }
                if (!hasTrailer && fallbackMedia.trailer && fallbackMedia.trailer.site === 'youtube') {
                    exactMedia.trailer = fallbackMedia.trailer;
                    hasTrailer = true;
                }
                if (!exactMedia.studios?.nodes?.length && fallbackMedia.studios?.nodes?.length) {
                    exactMedia.studios = fallbackMedia.studios;
                }
            }
            if (hasStaff && hasTrailer) break;
        }

        return exactMedia; 
    } catch (e) {
        console.error("AniList Master Engine failed:", e);
        return null;
    }
}