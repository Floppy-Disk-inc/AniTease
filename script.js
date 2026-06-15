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
const liveBgUrl = "url('assets/bg.gif')";
const staticBgUrl = "url('assets/bg(static).png')"; 

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
/**
 * Searches TMDB API for a backup trailer link if AniList doesn't offer one
 */
async function getTier2BackupTrailer(english, romaji, native) {
    const TMDB_API_KEY = "0f8828789e9c3e479561d16641621a73"; 
    const searchTitles = [english, romaji, native].filter(Boolean);
    
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
// TIER 3 BACKUP (YOUTUBE DATA API v3 - ON DEMAND)
// ==========================================
const YOUTUBE_API_KEY = 'AlzaSyCzjWcEiYm_mueUwtkilitJYk2Umu0q_gk';

async function getTier3YouTubeTrailer(title) {
    if (!title || YOUTUBE_API_KEY === 'AlzaSyCzjWcEiYm_mueUwtkilitJYk2Umu0q_gk') return null;
    
    try {
        const query = encodeURIComponent(`${title} official anime trailer PV`);
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${query}&key=${YOUTUBE_API_KEY}&maxResults=1`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
            return data.items[0].id.videoId; 
        }
    } catch (error) {
        console.error(`Tier 3 failed tracking title "${title}":`, error);
    }
    return null;
}

/**
 * Native callback initialization for the embedded YouTube Iframe Engine
 */
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
          title { english romaji native }
          coverImage { extraLarge large }
          description
          averageScore
          popularity
          format
          season
          seasonYear
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
                const source = anime.source ? anime.source.replace(/_/g, ' ') : "Original";

                const animeObject = {
                    mal_id: anime.id, 
                    title: mainTitle,
                    images: { jpg: { large_image_url: anime.coverImage.extraLarge || anime.coverImage.large } },
                    description: anime.description || "No official lore has been released yet.",
                    type: anime.format || "TV",
                    score: anime.averageScore ? (anime.averageScore / 10).toFixed(1) : "N/A",
                    members: anime.popularity || 0,
                    verified_video_id: trailerVideoId,
                    season: anime.season || "Upcoming",
                    year: anime.seasonYear || "TBD",
                    studio: studio,
                    genres: genres,
                    episodes: episodes,
                    source: source
                };

                processedAnime.push(animeObject);

                if (!trailerVideoId) {
                    const promise = getTier2BackupTrailer(anime.title.english, anime.title.romaji, anime.title.native)
                        .then(backupId => {
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

// ==========================================
// 6. LAYOUT RENDERING UTILITIES
// ==========================================
function renderAnimeCards(animeArray) {
    let htmlContent = "";

    for (const anime of animeArray) {
        if (!anime?.images?.jpg?.large_image_url) continue;

        const watchCount = anime.members ? anime.members.toLocaleString() : "0";
        const type = anime.type || "TV";
        const score = anime.score || "N/A";
        const finalVideoId = anime.verified_video_id; 
        const title = anime.title || "Unknown Title";
        
        let formattedSeason = 'Movie';
        let seasonIcon = '📺'; 

        if (anime.season) {
            formattedSeason = anime.season.charAt(0).toUpperCase() + anime.season.slice(1);
            switch (anime.season.toLowerCase()) {
                case 'winter': seasonIcon = '❄️'; break;
                case 'spring': seasonIcon = '🌸'; break;
                case 'summer': seasonIcon = '☀️'; break;
                case 'fall':   seasonIcon = '🍂'; break;
            }
        } else if (anime.type && anime.type !== 'TV') {
            formattedSeason = anime.type; 
        }

        if (anime.type === 'Movie') seasonIcon = '🎬'; 
        const releaseYear = anime.year || 'N/A';

        htmlContent += `
            <div class="anime-card" data-id="${anime.mal_id}" data-video-id="${finalVideoId}" data-title="${title.replace(/"/g, '"')}">
                <div class="image-container" oncontextmenu="return false;">
                    <img src="${anime.images.jpg.large_image_url}" alt="${title}" loading="lazy">
                    <span class="anime-type">${type}</span>
                    <span class="anime-badge-season">${seasonIcon} ${formattedSeason}</span>
                    <span class="anime-badge-year">📅${releaseYear}</span>
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

searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') initiateSearch(); });
searchButton.addEventListener('click', initiateSearch);
loadMoreBtn.addEventListener('click', () => fetchAnimeData(currentQuery, currentPage, false));

// Handles Card Click, Modal Injections, and Layout Adjustments
resultsContainer.addEventListener('click', async (event) => {
    const card = event.target.closest('.anime-card');
    if (!card) return;

    const animeId = parseInt(card.getAttribute('data-id'));
    const clickedAnime = allAnimeData.find(a => a.mal_id === animeId);
    if (!clickedAnime) return;
    
    // Show the modal immediately
    modal.style.display = 'flex';

    // Core Data Injection
    document.getElementById('modal-poster').src = clickedAnime.images.jpg.large_image_url;
    document.getElementById('modal-title').textContent = clickedAnime.title;
    document.getElementById('modal-studio').textContent = clickedAnime.studio;
    document.getElementById('modal-episodes').textContent = `EPs: ${clickedAnime.episodes}`;
    document.getElementById('modal-source').textContent = clickedAnime.source;
    document.getElementById('modal-genres').textContent = clickedAnime.genres;
    document.getElementById('modal-desc').innerHTML = clickedAnime.description;

    // Reset asynchronous elements to loading states
    document.getElementById('modal-countdown').textContent = "Loading airing schedule...";
    document.getElementById('modal-director').textContent = "Director: Loading...";
    document.getElementById('modal-cast').textContent = "Cast: Loading...";

    const streamsContainer = document.getElementById('modal-streams');
    if (streamsContainer) streamsContainer.innerHTML = ""; 

    const malId = clickedAnime.mal_id;
    const title = clickedAnime.title;

    // --- YOUTUBE VIDEO INJECTION ---
    const videoId = clickedAnime.verified_video_id;
    const playerContainer = document.getElementById('trailer-player'); 

    // --- WIKIDATA STUDIO HEAD FETCHER ---
const studioHeadCache = {};

async function fetchStudioHead(studioName) {
    if (!studioName || studioName === "Unknown Studio" || studioName === "TBA") return "TBA";
    if (studioHeadCache[studioName]) return studioHeadCache[studioName];

    const endpointUrl = 'https://query.wikidata.org/sparql';
    const sparqlQuery = `
    SELECT ?personLabel WHERE {
      ?studio rdfs:label ?name.
      FILTER(CONTAINS(LCASE(?name), LCASE("${studioName}")))
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
            studioHeadCache[studioName] = headName;
            return headName;
        }
    } catch (e) {
        console.warn("Wikidata search failed for studio:", studioName);
    }
    
    studioHeadCache[studioName] = "TBA";
    return "TBA";
}
    
    if (videoId) {
        if (playerContainer) playerContainer.style.display = 'block';
        if (isPlayerReady && ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
            ytPlayer.loadVideoById(videoId);
        } else {
            pendingVideoId = videoId;
        }
    } else {
        if (playerContainer) playerContainer.style.display = 'none';
    }

    // --- SECURE PIPELINE RUNNER ---
    try {
        const currentMalId = clickedAnime?.mal_id;
        const currentAnimeTitle = clickedAnime?.title;
        
        let studioName = "Unknown Studio";
        if (clickedAnime?.studios && clickedAnime.studios.length > 0 && clickedAnime.studios[0]?.name) {
            studioName = clickedAnime.studios[0].name;
        } else if (clickedAnime?.studio) {
            studioName = clickedAnime.studio;
        }
        
        const directorElem = document.getElementById('modal-director');
        const castElem = document.getElementById('modal-cast');
        const countdownElem = document.getElementById('modal-countdown');

        const aniListData = await fetchAniListMasterData(currentMalId, currentAnimeTitle);
        
        if (countdownElem) {
            if (aniListData && aniListData.nextAiringEpisode) {
                const { timeUntilAiring, episode } = aniListData.nextAiringEpisode;
                startModalCountdown(timeUntilAiring, episode);
            } else {
                const realStatus = aniListData?.status ? aniListData.status.replace(/_/g, ' ') : "TBA";
                countdownElem.textContent = `Airing Status: ${realStatus}`;
            }
        }

        if (streamsContainer && aniListData && aniListData.externalLinks && aniListData.externalLinks.length > 0) {
            const allowedSites = ['Crunchyroll', 'Netflix', 'Hulu', 'HiDive', 'Bilibili'];
            aniListData.externalLinks.forEach(link => {
                if (allowedSites.includes(link.site)) {
                    const pill = document.createElement('a');
                    pill.href = link.url;
                    pill.target = "_blank";
                    pill.className = "stream-pill";
                    pill.textContent = link.site;
                    streamsContainer.appendChild(pill);
                }
            });
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
                console.warn("Layer 3 Jikan Fallback skipped due to rate limit.");
            }
        }

        // --- LAYER 4: DYNAMIC STUDIO HEAD ASSIGNMENT ---
        if (directorElem) {
            if (directorName === "Unknown") {
                // Show a brief loading text so the UI doesn't look frozen while Wikidata thinks
                directorElem.innerHTML = `<strong>Director:</strong> Searching Studio...`;
                
                // Read the studioName variable and fetch the real director
                const dynamicDirector = await fetchStudioHead(studioName);
                directorElem.innerHTML = `<strong>Director:</strong> ${dynamicDirector}`;
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
        if (directorElem && directorElem.textContent.includes("Loading")) directorElem.textContent = "Director: Unknown";
        if (castElem && castElem.textContent.includes("Loading")) castElem.textContent = "Cast: Alternative Casting";
    }
}); 

// ==========================================
// 8. SYSTEM APP LIFECYCLE LISTENERS
// ==========================================
closeBtn.addEventListener('click', closeModal);
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

// Primary System Initialization Bootloader
window.addEventListener('load', () => {
    initializeBackgroundSystem();
    fetchAnimeData("", 1, true); 
    requestAnimationFrame(animateSliderTrack);
});

// --- GOOGLE-STYLE SEARCH HISTORY ENGINE ---
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('search-input');
    const btn = document.getElementById('search-btn');
    const dropdown = document.getElementById('recent-searches');

    if (!input || !btn || !dropdown) return;

    input.addEventListener('focus', () => {
        displaySearchHistory();
    });

    input.addEventListener('blur', () => {
        setTimeout(() => {
            dropdown.style.display = 'none';
        }, 200);
    });

    btn.addEventListener('click', () => {
        saveSearch(input.value.trim());
    });

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

// --- CRASH-PROOF BACK TO TOP FOOTER ESCAPE ENGINE ---
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

//* Dynamic Ticker Helper *//
let countdownInterval;

function startModalCountdown(timeUntilAiring, episodeNum) {
    clearInterval(countdownInterval);
    const targetElement = document.getElementById('modal-countdown');
    if (!targetElement) return;

    let timeLeft = timeUntilAiring;

    countdownInterval = setInterval(() => {
        if (timeLeft <= 0) {
            targetElement.textContent = `Episode ${episodeNum} is airing now!`;
            clearInterval(countdownInterval);
            return;
        }

        const days = Math.floor(timeLeft / (3600 * 24));
        const hours = Math.floor((timeLeft % (3600 * 24)) / 3600);
        const minutes = Math.floor((timeLeft % 3600) / 60);
        const seconds = timeLeft % 60;

        targetElement.textContent = `Ep ${episodeNum} Airs In: ${days}d ${hours}h ${minutes}m ${seconds}s`;
        timeLeft--;
    }, 1000);
}

//* Layer 2: The Music Layer (Spotify API Preview) *//
async function fetchSpotifyThemePreview(songQuery, spotifyAccessToken) {
    if (!songQuery || !spotifyAccessToken) return null;

    try {
        const url = `https://api.spotify.com/v1/search?q=$$${encodeURIComponent(songQuery)}&type=track&limit=1`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${spotifyAccessToken}` }
        });
        const data = await response.json();
        return data.tracks?.items[0]?.preview_url || null;
    } catch (e) {
        console.error("Spotify Audio Engine failed:", e);
        return null;
    }
}

//* Layer 3: The Industry Layer (Anime News Network XML) *//
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

//* Layer 4: The Last Resort Layer (Google Custom Search JSON) *//
const GOOGLE_SEARCH_KEY = 'AlzaSyCzjWcEiYm_mueUwtkilitJYk2Umu0q_gk';
const GOOGLE_CX_ID = 'f1506aaa45f764c54';

async function fetchGoogleFallbackData(animeTitle) {
    if (GOOGLE_SEARCH_KEY === 'YOUR_GOOGLE_API_KEY') return null;

    try {
        const query = encodeURIComponent(`${animeTitle} anime official website production visual`);
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_KEY}&cx=${GOOGLE_CX_ID}&q=${query}&searchType=image&num=1`;
        const response = await fetch(url);
        const data = await response.json();
        return { fallbackImageUrl: data.items?.[0]?.link || null, contextLink: data.items?.[0]?.image?.contextLink || null };
    } catch (e) {
        console.error("Google Backup Engine failed:", e);
        return null;
    }
}

//* Layer 1: The Master AniList Engine (Upgraded to properly target Exact IDs!) *//
async function fetchAniListMasterData(anilistId, animeTitle) {
    const url = 'https://graphql.anilist.co';

    // 🚨 Changed idMal to id, and added 'status'
    const queryById = `
    query ($id: Int) {
      Media (id: $id, type: ANIME) {
        status
        nextAiringEpisode { airingAt timeUntilAiring episode }
        externalLinks { url site }
        staff(perPage: 10) { edges { role node { name { full } } } }
        characters(sort: ROLE, perPage: 3) { nodes { name { full } } }
      }
    }`;

    const queryByTitle = `
    query ($title: String) {
      Media (search: $title, type: ANIME) {
        status
        nextAiringEpisode { airingAt timeUntilAiring episode }
        externalLinks { url site }
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
        let media = result.data?.Media;

        if (media && media.staff && media.staff.edges.length > 0) {
            return media;
        }

        let cleanTitle = animeTitle.split(':')[0].split(' Season')[0].split(' 2nd')[0].split(' 3rd')[0].trim();
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ query: queryByTitle, variables: { title: cleanTitle } })
        });
        result = await response.json();

        return result.data?.Media || media || null;
    } catch (e) {
        console.error("AniList Master Engine failed:", e);
        return null;
    }
}