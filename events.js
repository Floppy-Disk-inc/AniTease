import { dom, liveBgUrl, staticBgUrl, state, toggleFavorite } from './state.js';
import { fetchAnimeData, fetchAniListMasterData, fetchStudioHead, fetchANNStaffDetails, fetchRandomAnime, getTier2BackupTrailer, getTier3YouTubeTrailer } from './api.js';
import { closeModal, initializeBackgroundSystem, animateSliderTrack, startModalCountdown, refreshDisplay } from './ui.js';

if (dom.bgToggle) {
    dom.bgToggle.addEventListener('change', () => {
        if (dom.bgToggle.checked) {
            document.body.style.backgroundImage = liveBgUrl;
            localStorage.setItem("liveBackground", "enabled");
        } else {
            document.body.style.backgroundImage = staticBgUrl;
            localStorage.setItem("liveBackground", "disabled");
        }
    });
}

if (dom.settingsBtn) {
    dom.settingsBtn.addEventListener('click', () => { if (dom.settingsPanel) dom.settingsPanel.style.display = 'flex'; });
}
if (dom.closeSettings) {
    dom.closeSettings.addEventListener('click', () => { if (dom.settingsPanel) dom.settingsPanel.style.display = 'none'; });
}
if (dom.settingsPanel) {
    window.addEventListener('click', (e) => { if (e.target === dom.settingsPanel) dom.settingsPanel.style.display = 'none'; });
}

if (dom.volSlider) {
    dom.volSlider.addEventListener('input', (e) => {
        const value = e.target.value;
        if (state.audio) state.audio.volume = value;
        state.currentVolPercentage = value * 100;
    });
}

if (dom.musicBtn) {
    dom.musicBtn.addEventListener('click', () => {
        if (state.isPlaying) {
            state.audio.pause();
            dom.musicBtn.textContent = "🔈";
        } else {
            state.audio.play().catch(e => console.log("Audio play blocked:", e));
            dom.musicBtn.textContent = "🔊";
        }
        state.isPlaying = !state.isPlaying;
    });
}

function initiateSearch() {
    if (!dom.searchInput) return;
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(() => {
        fetchAnimeData(dom.searchInput.value.trim(), 1, true);
    }, 300);
}

if (dom.searchInput) dom.searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') initiateSearch(); });
if (dom.searchButton) dom.searchButton.addEventListener('click', initiateSearch);
if (dom.loadMoreBtn) dom.loadMoreBtn.addEventListener('click', () => fetchAnimeData(state.currentQuery, state.currentPage, false));

async function handleSurprise() {
    const btn = document.getElementById('surprise-btn');
    if (btn) {
        btn.textContent = 'Rolling...';
        btn.disabled = true;
    }

    const anime = await fetchRandomAnime();

    if (btn) {
        btn.textContent = 'Surprise Me';
        btn.disabled = false;
    }

    if (anime) {
        openAnimeModal(anime);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

if (dom.resultsContainer) {
    dom.resultsContainer.addEventListener('click', async (event) => {
        const target = event.target;
        const favBtn = target.closest('.fav-btn');
        if (favBtn) {
            event.stopPropagation();
            const id = parseInt(favBtn.dataset.id);
            toggleFavorite(id);
            favBtn.classList.toggle('faved');
            const isFaved = state.favorites.has(id);
            favBtn.textContent = isFaved ? '♥' : '♡';
            favBtn.title = isFaved ? 'Remove from favorites' : 'Add to favorites';
            return;
        }

        const card = target.closest('.anime-card');
        if (!card) return;

        const animeId = parseInt(card.getAttribute('data-id'));
        const clickedAnime = state.allAnimeData.find(a => a.mal_id === animeId);
        if (!clickedAnime) return;

        openAnimeModal(clickedAnime);
    });
}

export async function openAnimeModal(clickedAnime) {
    clearInterval(state.countdownInterval);
    dom.modal.style.display = 'flex';

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

    const malId = clickedAnime.mal_id;
    const anilistId = clickedAnime.anilist_id || clickedAnime.mal_id;
    const title = clickedAnime.title;
    let videoId = clickedAnime.verified_video_id;

    const playerContainer = document.getElementById('trailer-player');
    const splitLayoutContainer = document.querySelector('.split-layout');
    const videoSection = document.getElementById('modal-video-section');

    function applyVideoLayout(activeVideoId) {
        if (activeVideoId) {
            if (videoSection) videoSection.style.display = 'flex';
            if (splitLayoutContainer) splitLayoutContainer.classList.remove('no-video-mode');
            if (playerContainer) playerContainer.style.display = 'block';

            if (window.__ytPlayerReady && window.__ytPlayer && typeof window.__ytPlayer.loadVideoById === 'function') {
                window.__ytPlayer.loadVideoById(activeVideoId);
            } else {
                window.__pendingVideoId = activeVideoId;
            }
        } else {
            if (videoSection) videoSection.style.display = 'none';
            if (playerContainer) playerContainer.style.display = 'none';
            if (splitLayoutContainer) splitLayoutContainer.classList.add('no-video-mode');
        }
    }

    try {
        let promoVideos = [];
        if (malId) {
            try {
                const jikanVidRes = await fetch(`https://api.jikan.moe/v4/anime/${malId}/videos`);
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

        if (!videoId && promoVideos.length > 0 && promoVideos[0].trailer.youtube_id) {
            videoId = promoVideos[0].trailer.youtube_id;
        }

        applyVideoLayout(videoId);

        let extraVideosContainer = document.getElementById('modal-extra-videos');
        if (!extraVideosContainer) {
            const parentContainer = document.getElementById('modal-streams')?.parentElement || document.querySelector('.modal-info');
            if (parentContainer) {
                extraVideosContainer = document.createElement('div');
                extraVideosContainer.id = 'modal-extra-videos';
                extraVideosContainer.style.marginTop = '20px';
                parentContainer.appendChild(extraVideosContainer);
            }
        }

        if (extraVideosContainer) {
            extraVideosContainer.innerHTML = '';
            if (promoVideos.length > 1 || (promoVideos.length > 0 && videoId !== promoVideos[0].trailer.youtube_id)) {
                extraVideosContainer.innerHTML = `<h4 style="margin-bottom: 10px; color: #fff;">Extra Footage</h4>`;
                const btnContainer = document.createElement('div');
                btnContainer.style.display = 'flex';
                btnContainer.style.flexWrap = 'wrap';
                btnContainer.style.gap = '10px';

                promoVideos.slice(0, 5).forEach(promo => {
                    if (promo.trailer.youtube_id) {
                        const vidBtn = document.createElement('button');
                        vidBtn.className = 'stream-pill';
                        vidBtn.style.backgroundColor = '#444';
                        vidBtn.style.color = '#fff';
                        vidBtn.style.cursor = 'pointer';
                        vidBtn.style.border = 'none';
                        vidBtn.textContent = promo.title || "Sneak Peek";

                        vidBtn.addEventListener('click', () => {
                            applyVideoLayout(promo.trailer.youtube_id);
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

        let aniListData = state.aniListMasterCache[anilistId];
        if (!aniListData) {
            aniListData = await fetchAniListMasterData(anilistId, title, clickedAnime.synonyms || []);
            if (aniListData) state.aniListMasterCache[anilistId] = aniListData;
        }

        if (countdownElem) {
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

        if (!videoId) {
            if (aniListData && aniListData.trailer && aniListData.trailer.site === 'youtube') {
                videoId = aniListData.trailer.id;
            }
            if (!videoId) {
                let cleanTitle = title.replace(/(\s+Part\s+\d+|\s+Season\s+\d+|\s+\d+(st|nd|rd|th)\s+Season|\s+Cour\s+\d+|\s+-*\s*Part\s+\d+)/gi, '').trim();
                const searchTitles = [...new Set([title, cleanTitle, ...(clickedAnime.synonyms || [])])].filter(Boolean);
                videoId = await getTier2BackupTrailer(searchTitles[0], searchTitles[1], searchTitles[2], clickedAnime.synonyms);
            }
            if (!videoId) {
                videoId = await getTier3YouTubeTrailer(title);
            }

            if (videoId) {
                clickedAnime.verified_video_id = videoId;
                applyVideoLayout(videoId);
            } else {
                applyVideoLayout(null);
            }
        }

        let studioName = clickedAnime.studio;
        if ((!studioName || studioName === "Unknown Studio") && aniListData?.studios?.nodes?.length > 0) {
            studioName = aniListData.studios.nodes[0].name;
            clickedAnime.studio = studioName;
            document.getElementById('modal-studio').textContent = studioName;
        }

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
                fallbackPill.href = `https://www.justwatch.com/us/search?q=${encodeURIComponent(title)}`;
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

        if ((directorName === "Unknown" || castNames === "Alternative Casting") && malId) {
            try {
                const jikanStaffRes = await fetch(`https://api.jikan.moe/v4/anime/${malId}/staff`);
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

                const jikanCastRes = await fetch(`https://api.jikan.moe/v4/anime/${malId}/characters`);
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

        if (directorName === "Unknown") {
            const annData = await fetchANNStaffDetails(title);
            if (annData.director !== "Unknown" && annData.director !== "Production Crew") {
                directorName = annData.director;
            }
            if (castNames === "Alternative Casting" && annData.cast !== "Alternative Casting" && annData.cast !== "Main Cast Indexed") {
                castNames = annData.cast;
            }
        }

        const directorElem = document.getElementById('modal-director');
        const castElem = document.getElementById('modal-cast');
        if (directorElem) {
            if (directorName === "Unknown" || directorName === "Production Crew") {
                const fallbackHead = await fetchStudioHead(studioName);
                if (fallbackHead && fallbackHead !== "TBA") {
                    directorElem.innerHTML = `<strong>Director:</strong> ${fallbackHead}`;
                } else {
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
}

if (dom.closeBtn) dom.closeBtn.addEventListener('click', closeModal);
window.addEventListener('click', (e) => { if (e.target === dom.modal) closeModal(); });

if (dom.siteTopTitle && dom.searchInput) {
    dom.siteTopTitle.addEventListener('click', () => {
        if (dom.searchInput.value.trim() !== "" || state.currentQuery !== "") {
            dom.searchInput.value = "";
            fetchAnimeData("", 1, true);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function handleRoute() {
    if (window.location.hash === '#favorites') {
        state.filterMode = 'favorites';
        if (dom.feedTitle) dom.feedTitle.textContent = 'Your Favorites';
        refreshDisplay();
    }
}

window.addEventListener('hashchange', handleRoute);

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
    const surpriseBtn = document.getElementById('surprise-btn');
    if (surpriseBtn) {
        surpriseBtn.addEventListener('click', handleSurprise);
    }

    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const dropdown = document.getElementById('recent-searches');

    if (searchInput && searchBtn && dropdown) {
        searchInput.addEventListener('focus', () => displaySearchHistory());
        searchInput.addEventListener('blur', () => { setTimeout(() => { dropdown.style.display = 'none'; }, 200); });
        searchBtn.addEventListener('click', () => saveSearch(searchInput.value.trim()));
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveSearch(searchInput.value.trim());
                searchInput.blur();
            }
        });
    }

    handleRoute();

    const filterToggle = document.getElementById('filter-toggle');
    const filterDropdown = document.getElementById('filter-dropdown');
    if (filterToggle && filterDropdown) {
        filterToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = filterDropdown.style.display !== 'none';
            filterDropdown.style.display = isOpen ? 'none' : 'block';
            filterToggle.classList.toggle('open', !isOpen);
            filterToggle.textContent = isOpen ? 'Filter ▾' : 'Filter ▴';
        });
        document.addEventListener('click', (e) => {
            if (!filterToggle.contains(e.target) && !filterDropdown.contains(e.target)) {
                filterDropdown.style.display = 'none';
                filterToggle.classList.remove('open');
                filterToggle.textContent = 'Filter ▾';
            }
        });
    }

    const sortBtns = document.querySelectorAll('.sort-btn');
    sortBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sortBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.sortBy = btn.dataset.sort;
            refreshDisplay();
        });
    });

    const genreContainer = document.getElementById('genre-pills');
    if (genreContainer) {
        genreContainer.addEventListener('click', (e) => {
            const pill = e.target.closest('.genre-pill');
            if (!pill) return;
            document.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            state.activeGenre = pill.dataset.genre || null;
            refreshDisplay();
        });
    }

    const topBtn = document.querySelector('.back-to-top');
    const siteTitle = document.getElementById('site-top-title');
    const footer = document.querySelector('footer');

    if (topBtn) {
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
    }
});
