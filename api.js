import { dom, state } from './state.js';
import { renderAnimeCards, buildGenrePills } from './ui.js';

const TMDB_API_KEY = "0f8828789e9c3e479561d16641621a73";

export async function getTier2BackupTrailer(english, romaji, native, synonyms = []) {
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

const YOUTUBE_API_KEY = 'AlzaSyCzjWcEiYm_mueUwtkilitJYk2Umu0q_gk';

export async function getTier3YouTubeTrailer(title) {
    if (!title || YOUTUBE_API_KEY === 'AlzaSyCzjWcEiYm_mueUwtkilitJYk2Umu0q_gk') return null;
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

export async function fetchStudioHead(studioName) {
    if (!studioName || studioName === "Unknown Studio" || studioName === "TBA") return "TBA";
    const cleanStudioName = studioName.replace(/\b(Studio|Animation|Co\.|Ltd\.|Corp\.|Inc\.)\b/gi, '').trim();
    if (state.studioHeadCache[cleanStudioName]) return state.studioHeadCache[cleanStudioName];

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
            state.studioHeadCache[cleanStudioName] = headName;
            return headName;
        }
    } catch (e) {
        console.warn("Wikidata search failed for studio:", cleanStudioName);
    }
    state.studioHeadCache[cleanStudioName] = "TBA";
    return "TBA";
}

export async function fetchAniListMasterData(anilistId, animeTitle, synonyms = []) {
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

        if (hasStaff && hasTrailer) return exactMedia;

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

export async function fetchANNStaffDetails(animeTitle) {
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

export async function fetchSpotlightAnime() {
    if (state.spotlightAnime && state.spotlightAnime.length > 0) return state.spotlightAnime;
    try {
        const res = await fetch('https://api.jikan.moe/v4/top/anime?filter=bypopularity&limit=8');
        if (!res.ok) return [];
        const json = await res.json();
        const items = (json.data || []).map(a => {
            const backdrop = a.trailer?.images?.maximum_image_url || a.images?.jpg?.large_image_url || '';
            return {
                mal_id: a.mal_id,
                title: a.title || a.title_english || a.title_japanese || 'Unknown',
                japanese_title: a.title_japanese || '',
                image: a.images?.jpg?.large_image_url || '',
                backdrop: backdrop,
                type: a.type || 'TV',
                score: a.score ? a.score.toFixed(1) : 'N/A',
                episodes: a.episodes || '?',
                year: a.year || a.aired?.from?.slice(0, 4) || 'TBD',
                description: a.synopsis ? a.synopsis.slice(0, 280) + (a.synopsis.length > 280 ? '...' : '') : 'No description available.',
                quality: 'HD',
                duration: a.duration || '24 min',
                aired: a.aired?.from ? new Date(a.aired.from).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'TBA',
                genres: (a.genres || []).slice(0, 3).map(g => g.name).join(', ')
            };
        });
        state.spotlightAnime = items;
        return items;
    } catch (e) {
        console.warn('Spotlight fetch failed:', e);
        return [];
    }
}

export async function fetchAnimeData(title = "", page = 1, isNewSearch = true) {
    if (state.isFetching || (!state.hasMoreData && !isNewSearch)) return;
    state.isFetching = true;

    if (isNewSearch) {
        dom.loadingScreen.style.display = 'flex';
        state.currentQuery = title;
        state.currentPage = 1;
        state.hasMoreData = true;
        state.globalUniqueIds.clear();
        if (dom.resultsContainer) dom.resultsContainer.innerHTML = "";
        state.allAnimeData = [];
        state.filterMode = 'all';
        state.sortBy = 'default';
        state.activeGenre = null;
        const sortBtns = document.querySelectorAll('.sort-btn');
        sortBtns.forEach(b => b.classList.remove('active'));
        const defaultSort = document.querySelector('.sort-btn[data-sort="default"]');
        if (defaultSort) defaultSort.classList.add('active');
        const genrePills = document.querySelectorAll('.genre-pill');
        genrePills.forEach(p => p.classList.remove('active'));
        const allGenre = document.querySelector('.genre-pill[data-genre=""]');
        if (allGenre) allGenre.classList.add('active');
    }

    const isUpcomingFeed = title.trim() === "";

    let cacheRendered = false;
    if (isNewSearch && isUpcomingFeed) {
        try {
            const cached = sessionStorage.getItem('aniTeaseFeed');
            if (cached) {
                const data = JSON.parse(cached);
                if (Array.isArray(data) && data.length > 0) {
                    state.allAnimeData = data;
                    state.globalUniqueIds = new Set(data.map(a => a.anilist_id));
                    dom.loadingScreen.style.display = 'none';
                    cacheRendered = true;
                    renderAnimeCards(data);
                    buildGenrePills();
                }
            }
        } catch (e) {
            sessionStorage.removeItem('aniTeaseFeed');
        }
    }

    if (dom.feedTitle && isNewSearch) {
        dom.feedTitle.textContent = isUpcomingFeed ? "Upcoming Anime" : `Showing Results For "${title}"`;
    }

    const url = 'https://graphql.anilist.co';
    const query = `
    query ($page: Int, $perPage: Int, $search: String, $status: MediaStatus) {
      Page (page: $page, perPage: $perPage) {
        pageInfo { hasNextPage }
        media (search: $search, status: $status, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          id idMal
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

    let variables = { page: page, perPage: 20 };
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
            state.hasMoreData = result.data.Page.pageInfo.hasNextPage;

            const processedAnime = [];
            const backupPromises = [];

            incomingAnime.forEach(anime => {
                if (state.globalUniqueIds.has(anime.id)) return;
                state.globalUniqueIds.add(anime.id);

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

                const bestImage = anime.coverImage.large || anime.coverImage.medium || anime.coverImage.extraLarge;
                const protectedYear = anime.seasonYear || anime.startDate?.year || "TBD";

                let seasonLabel = "UPCOMING";
                if (anime.season) {
                    seasonLabel = `${anime.season.toUpperCase()}`;
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
                    seasonLabel: seasonLabel,
                    year: protectedYear,
                    studio: studio,
                    genres: genres,
                    episodes: episodes,
                    synonyms: synonyms,
                    startDate: anime.startDate
                };

                processedAnime.push(animeObject);

                if (!trailerVideoId && !isUpcomingFeed) {
                    const promise = getTier2BackupTrailer(anime.title.english, anime.title.romaji, anime.title.native, synonyms).then(backupId => {
                        if (backupId) animeObject.verified_video_id = backupId;
                    });
                    backupPromises.push(promise);
                }
            });

            if (backupPromises.length > 0) {
                await Promise.all(backupPromises);
            }

            state.allAnimeData = [...state.allAnimeData, ...processedAnime];
            if (cacheRendered && dom.resultsContainer) {
                dom.resultsContainer.innerHTML = '';
            }
            renderAnimeCards(isNewSearch ? state.allAnimeData : processedAnime);
            state.currentPage++;
            if (isNewSearch) {
                buildGenrePills();
                if (window.location.hash === '#favorites') {
                    state.filterMode = 'favorites';
                    if (dom.resultsContainer) {
                        dom.resultsContainer.innerHTML = '';
                        renderAnimeCards(state.allAnimeData);
                    }
                }
            }

            if (isUpcomingFeed) {
                try { sessionStorage.setItem('aniTeaseFeed', JSON.stringify(state.allAnimeData)); } catch (e) {}
            }

        } else {
            state.hasMoreData = false;
            if (isNewSearch && dom.resultsContainer) {
                dom.resultsContainer.innerHTML = `<p style="color: white; font-size: 1.2rem;">No results found.</p>`;
            }
        }
    } catch (error) {
        console.error("AniList Fetch Error:", error);
        if (isNewSearch && dom.resultsContainer) {
            dom.resultsContainer.innerHTML = `<p style="color: white; font-size: 1.2rem;">Something went wrong. Please try again.</p>`;
        }
    } finally {
        state.isFetching = false;
        dom.loadingScreen.style.display = 'none';
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
}


export async function fetchRandomAnime() {
    if (state.allAnimeData.length > 0) {
        const pick = state.allAnimeData[Math.floor(Math.random() * state.allAnimeData.length)];
        return pick;
    }

    const url = 'https://graphql.anilist.co';
    const query = `
    query ($page: Int) {
      Page (page: $page, perPage: 1) {
        media (type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          id idMal
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

    const randomPage = Math.floor(Math.random() * 100) + 1;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables: { page: randomPage } })
        });
        const result = await res.json();
        const anime = result.data?.Page?.media?.[0];
        if (!anime) return null;

        const mainTitle = (anime.title.english && anime.title.english.trim() !== "")
            ? anime.title.english
            : (anime.title.romaji || anime.title.native || "Unknown Title");

        let trailerVideoId = null;
        if (anime.trailer && anime.trailer.site === 'youtube') {
            trailerVideoId = anime.trailer.id;
        }

        const seasonLabel = anime.season ? `${anime.season.toUpperCase()}` : "UPCOMING";

        return {
            anilist_id: anime.id,
            mal_id: anime.idMal || anime.id,
            title: mainTitle,
            images: { jpg: { large_image_url: anime.coverImage.extraLarge || anime.coverImage.large } },
            description: anime.description || "No official lore has been released yet.",
            type: anime.format || "TV",
            score: anime.averageScore ? (anime.averageScore / 10).toFixed(1) : "N/A",
            members: anime.popularity || 0,
            verified_video_id: trailerVideoId,
            season: anime.season || "Upcoming",
            seasonLabel: seasonLabel,
            year: anime.seasonYear || "TBD",
            studio: anime.studios?.nodes?.[0]?.name || "Unknown Studio",
            genres: anime.genres ? anime.genres.slice(0, 3).join(", ") : "Anime",
            episodes: anime.episodes || "TBA",
            source: anime.source ? anime.source.replace(/_/g, ' ') : "Original"
        };
    } catch (e) {
        console.error("Random fetch failed:", e);
        return null;
    }
}
