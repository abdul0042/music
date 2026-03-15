import React, { useEffect, useState } from 'react';
import { auth, googleProvider, db, hasFirebaseConfig } from './firebaseConfig.js';
import {
    browserLocalPersistence,
    getRedirectResult,
    onAuthStateChanged,
    setPersistence,
    signInWithPopup,
    signInWithRedirect,
    signOut
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import ReactPlayer from 'react-player';
import AuthModal from './components/AuthModal';
import ProfileView from './components/ProfileView';
import './App.css';

const BACKEND_URL = 'http://localhost:5010';

function normalizeSong(song) {
    const videoId = song.videoId || song.id;
    return {
        videoId: videoId,
        title: song.name || song.title || 'Untitled',
        artist: song.artists?.[0]?.name || song.artist?.name || song.artist || 'Unknown Artist',
        thumbnail: song.thumbnails?.[0]?.url || song.thumbnail || '',
        category: song.category || 'Song'
    };
}

function App() {
    const [user, setUser] = useState(null);
    const [view, setView] = useState('browse'); // 'browse' or 'profile'
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [currentSong, setCurrentSong] = useState(null);
    const [likedSongs, setLikedSongs] = useState([]);
    const [playlists, setPlaylists] = useState([]);
    const [recentSongs, setRecentSongs] = useState([]);
    const [selectedPlaylistId, setSelectedPlaylistId] = useState('liked');
    const [lyrics, setLyrics] = useState([]);
    const [currentTime, setCurrentTime] = useState(0);
    const [authMessage, setAuthMessage] = useState('');
    const [playlistName, setPlaylistName] = useState('');
    const [libraryMessage, setLibraryMessage] = useState('');
    const [libraryErrorDetail, setLibraryErrorDetail] = useState('');
    const [playlistSelection, setPlaylistSelection] = useState({});

    useEffect(() => {
        // 1. Check for manual (OTP) user session first
        const savedUser = localStorage.getItem('musify_manual_user');
        if (savedUser) {
            const parsedUser = JSON.parse(savedUser);
            setUser(parsedUser);
            fetchLibrary(parsedUser.uid);
        }

        if (!auth) return undefined;

        let isMounted = true;

        const setupAuth = async () => {
            try {
                await setPersistence(auth, browserLocalPersistence);
                const result = await getRedirectResult(auth);
                if (result?.user) {
                    setUser(result.user);
                    localStorage.removeItem('musify_manual_user'); // Firebase takes precedence
                }
            } catch (error) {
                console.error('Auth bootstrap error:', error);
                if (isMounted) {
                    setAuthMessage('Google login could not be completed.');
                }
            }
        };

        setupAuth();

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!isMounted) return;

            // If Firebase user found, clear any manual session
            if (currentUser) {
                setUser(currentUser);
                setAuthMessage('');
                localStorage.removeItem('musify_manual_user');
                await fetchLibrary(currentUser.uid);
            } else {
                // Only clear state if there's no manual user currently active
                const currentManualUser = localStorage.getItem('musify_manual_user');
                if (!currentManualUser) {
                    setUser(null);
                    setLikedSongs([]);
                    setPlaylists([]);
                    setSelectedPlaylistId('liked');
                    setLibraryMessage('');
                    setView('browse');
                }
            }
        });

        return () => {
            isMounted = false;
            unsubscribe();
        };
    }, []);

    const fetchLibrary = async (userId) => {
        // 1. Instant load from localStorage for speed and offline support
        const localData = localStorage.getItem(`musify_library_${userId}`);
        if (localData) {
            const parsed = JSON.parse(localData);
            setLikedSongs(parsed.likedSongs || []);
            setPlaylists(parsed.playlists || []);
        }

        try {
            let data;
            if (userId.startsWith('otp-')) {
                // Fetch from our Node backend for OTP users
                const res = await fetch(`${BACKEND_URL}/api/library/load/${userId}`);
                data = await res.json();
            } else if (db) {
                // Fetch from Firestore for Google users
                const docRef = doc(db, 'users', userId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    data = docSnap.data();
                }
            }

            if (data) {
                setLikedSongs(data.likedSongs || []);
                setPlaylists(data.playlists || []);
                // Update local cache
                localStorage.setItem(`musify_library_${userId}`, JSON.stringify({
                    likedSongs: data.likedSongs || [],
                    playlists: data.playlists || []
                }));
            }
            setLibraryMessage('');
            setLibraryErrorDetail('');
        } catch (error) {
            console.error('Library load error:', error);
            // We still have localStorage data, so just show a quiet warning
            setLibraryMessage('Using local library (sync paused).');
        }
    };

    const persistLibrary = async (nextLikedSongs, nextPlaylists) => {
        if (!user) return;
        
        // Always save to localStorage immediately so data is NEVER lost
        localStorage.setItem(`musify_library_${user.uid}`, JSON.stringify({
            likedSongs: nextLikedSongs,
            playlists: nextPlaylists
        }));

        try {
            if (user.uid.startsWith('otp-')) {
                // Save to Node backend
                await fetch(`${BACKEND_URL}/api/library/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: user.uid, likedSongs: nextLikedSongs, playlists: nextPlaylists })
                });
            } else if (db) {
                // Save to Firebase
                const userRef = doc(db, 'users', user.uid);
                await setDoc(userRef, {
                    likedSongs: nextLikedSongs,
                    playlists: nextPlaylists
                }, { merge: true });
            }
            setLibraryMessage('Library synced.');
            setLibraryErrorDetail('');
        } catch (error) {
            console.error('Library sync error:', error);
            setLibraryMessage('Changes saved locally (sync failed).');
        }
    };

    const handleLoginClick = () => {
        setIsAuthModalOpen(true);
    };

    const handleLogout = async () => {
        if (auth) await signOut(auth);
        localStorage.removeItem('musify_manual_user');
        setUser(null);
        setAuthMessage('');
        setView('browse');
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery) return;
        setView('browse');

        try {
            const res = await fetch(`${BACKEND_URL}/api/search?q=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            setSearchResults(data);
        } catch (error) {
            console.error('Search error:', error);
        }
    };

    const rememberRecentSong = (songData) => {
        setRecentSongs((prev) => {
            const next = [songData, ...prev.filter((item) => item.videoId !== songData.videoId)];
            return next.slice(0, 8);
        });
    };

    const playSong = async (song) => {
        const normalized = normalizeSong(song);
        setCurrentSong({ ...song, name: normalized.title, artists: [{ name: normalized.artist }], thumbnails: [{ url: normalized.thumbnail }] });
        setLyrics([]);
        setCurrentTime(0);
        rememberRecentSong(normalized);

        try {
            const { artist, title } = normalized;

            if (artist && title) {
                const url = `${BACKEND_URL}/api/lyrics/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    if (data.syncedLyrics) {
                        parseLyrics(data.syncedLyrics);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch lyrics:', error);
        }
    };

    const parseLyrics = (syncedLyrics) => {
        const lines = syncedLyrics.split('\n');
        const parsed = lines.map((line) => {
            const match = line.match(/\[(\d{1,2}):(\d{1,2}(?:\.\d{1,3})?)\](.*)/);
            if (match) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseFloat(match[2]);
                const text = match[3].trim();
                return { time: minutes * 60 + seconds, text };
            }
            return null;
        }).filter((line) => line !== null);

        setLyrics(parsed);
    };

    const toggleLike = async (song) => {
        if (!user) {
            setIsAuthModalOpen(true);
            return;
        }

        const songData = normalizeSong(song);
        if (!songData.videoId) {
            console.error('Cannot like: missing videoId', song);
            return;
        }

        const isLiked = likedSongs.some((savedSong) => savedSong.videoId === songData.videoId);
        const nextLikedSongs = isLiked
            ? likedSongs.filter((savedSong) => savedSong.videoId !== songData.videoId)
            : [...likedSongs, songData];

        const previousLikedSongs = likedSongs;
        setLikedSongs(nextLikedSongs);

        try {
            await persistLibrary(nextLikedSongs, playlists);
        } catch (error) {
            console.error('Library persistence failed:', error);
            setLikedSongs(previousLikedSongs);
        }
    };

    const createPlaylist = async (e) => {
        e.preventDefault();
        const trimmedName = playlistName.trim();

        if (!trimmedName) return;
        if (!user) {
            setIsAuthModalOpen(true);
            return;
        }

        const nextPlaylists = [
            ...playlists,
            {
                id: `playlist-${Date.now()}`,
                name: trimmedName,
                songs: []
            }
        ];

        const previousPlaylists = playlists;
        setPlaylists(nextPlaylists);
        setPlaylistName('');
        setSelectedPlaylistId(nextPlaylists[nextPlaylists.length - 1].id);

        try {
            console.log('Creating playlist...', trimmedName);
            await persistLibrary(likedSongs, nextPlaylists);
            console.log('Playlist created and synced.');
        } catch (error) {
            console.error('Playlist creation failed:', error);
            setPlaylists(previousPlaylists);
            setSelectedPlaylistId('liked');
            alert('Could not save playlist to your library. Please try again.');
        }
    };

    const addSongToPlaylist = async (song, playlistId) => {
        if (!user) {
            setIsAuthModalOpen(true);
            return;
        }

        const songData = normalizeSong(song);
        const nextPlaylists = playlists.map((playlist) => {
            if (playlist.id !== playlistId) return playlist;
            if (playlist.songs.some((item) => item.videoId === songData.videoId)) return playlist;
            return {
                ...playlist,
                songs: [...playlist.songs, songData]
            };
        });

        const previousPlaylists = playlists;
        setPlaylists(nextPlaylists);

        try {
            await persistLibrary(likedSongs, nextPlaylists);
        } catch (error) {
            setPlaylists(previousPlaylists);
        }
    };

    const removeSongFromPlaylist = async (playlistId, videoId) => {
        if (!user) return;

        const nextPlaylists = playlists.map((playlist) => (
            playlist.id === playlistId
                ? { ...playlist, songs: playlist.songs.filter((song) => song.videoId !== videoId) }
                : playlist
        ));

        const previousPlaylists = playlists;
        setPlaylists(nextPlaylists);

        try {
            await persistLibrary(likedSongs, nextPlaylists);
        } catch (error) {
            setPlaylists(previousPlaylists);
        }
    };

    const handlePlaylistSelection = async (song, playlistId) => {
        if (!playlistId) return;
        await addSongToPlaylist(song, playlistId);
        setPlaylistSelection((prev) => ({
            ...prev,
            [song.videoId]: ''
        }));
    };

    const selectedPlaylist = selectedPlaylistId === 'liked'
        ? { id: 'liked', name: 'Liked Songs', songs: likedSongs }
        : playlists.find((playlist) => playlist.id === selectedPlaylistId) || null;

    const handleProgress = (state) => {
        setCurrentTime(state.playedSeconds);
    };

    const currentSongArtist = currentSong?.artists?.[0]?.name || 'Unknown Artist';

    return (
        <div className="app-shell layout-three-up">
            <div className="app-backdrop app-backdrop-one" />
            <div className="app-backdrop app-backdrop-two" />

            <header className="topbar">
                <div onClick={() => setView('browse')} style={{ cursor: 'pointer' }}>
                    <span className="eyebrow">Musify Premium</span>
                    <h1>Musify</h1>
                </div>
                <div className="header-actions">
                    <form onSubmit={handleSearch} className="search-bar top-search">
                        <input
                            type="text"
                            placeholder="Search songs or artists"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="search-input"
                        />
                        <button type="submit" className="primary-button">Search</button>
                    </form>
                    
                    {user ? (
                        <button className="nav-profile-btn" onClick={() => setView(view === 'profile' ? 'browse' : 'profile')}>
                            <img src={user.photoURL} alt={user.displayName} />
                            <span>{view === 'profile' ? 'Browse' : 'My Profile'}</span>
                        </button>
                    ) : (
                        <button onClick={handleLoginClick} className="primary-button">Login</button>
                    )}
                </div>
            </header>

            {!hasFirebaseConfig && (
                <div className="notice-banner">
                    Firebase is not configured. Some features may be limited.
                </div>
            )}

            <main className="workspace-grid">
                {view === 'browse' ? (
                    <>
                        <aside className="panel workspace-panel left-column">
                            <div className="section-heading">
                                <div>
                                    <span className="section-kicker">Collection</span>
                                    <h2>Your Library</h2>
                                </div>
                            </div>

                            <div className="left-rail-block">
                                <button
                                    className={selectedPlaylistId === 'liked' ? 'nav-pill active' : 'nav-pill'}
                                    onClick={() => setSelectedPlaylistId('liked')}>
                                    Liked Songs
                                    <span>{likedSongs.length}</span>
                                </button>
                            </div>

                            <form onSubmit={createPlaylist} className="playlist-form">
                                <input
                                    value={playlistName}
                                    onChange={(e) => setPlaylistName(e.target.value)}
                                    className="search-input compact-input"
                                    placeholder="New playlist name"
                                />
                                <button type="submit" className="ghost-button">Create</button>
                            </form>

                            <div className="playlist-list">
                                {playlists.map((playlist) => (
                                    <button
                                        key={playlist.id}
                                        className={selectedPlaylistId === playlist.id ? 'nav-pill active' : 'nav-pill'}
                                        onClick={() => setSelectedPlaylistId(playlist.id)}>
                                        {playlist.name}
                                        <span>{playlist.songs.length}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="panel-subsection">
                                <span className="section-kicker">Selected List</span>
                                {selectedPlaylist ? (
                                    selectedPlaylist.songs.length > 0 ? (
                                        <div className="library-list">
                                            {selectedPlaylist.songs.map((song) => (
                                                <article key={song.videoId} className="library-item stacked">
                                                    <div>
                                                        <strong>{song.title}</strong>
                                                        <p>{song.artist}</p>
                                                    </div>
                                                    <div className="library-actions">
                                                        <button
                                                            onClick={() => playSong(song)}
                                                            className="ghost-button">
                                                            Play
                                                        </button>
                                                        <button 
                                                            onClick={() => selectedPlaylist.id === 'liked' ? toggleLike(song) : removeSongFromPlaylist(selectedPlaylist.id, song.videoId)} 
                                                            className="icon-button"
                                                        >
                                                            Drop
                                                        </button>
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="empty-state compact">
                                            <p>No songs here yet.</p>
                                        </div>
                                    )
                                ) : (
                                    <div className="empty-state compact">
                                        <p>Select a playlist.</p>
                                    </div>
                                )}
                            </div>
                        </aside>

                        <section className="panel workspace-panel center-column">
                            <div className="section-heading">
                                <div>
                                    <span className="section-kicker">Discover</span>
                                    <h2>{searchResults.length > 0 ? 'Search Results' : 'Recommended'}</h2>
                                </div>
                                {searchResults.length > 0 && <span className="section-meta">{searchResults.length} matches</span>}
                            </div>

                            {recentSongs.length > 0 && searchResults.length === 0 && (
                                <section className="content-block">
                                    <div className="subheading-row">
                                        <h3>Jump Back In</h3>
                                    </div>
                                    <div className="recent-grid">
                                        {recentSongs.map((song) => (
                                            <button
                                                key={song.videoId}
                                                className="recent-card"
                                                onClick={() => playSong(song)}>
                                                <strong>{song.title}</strong>
                                                <span>{song.artist}</span>
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            )}

                            <section className="content-block">
                                {searchResults.length > 0 ? (
                                    <div className="results-list song-results">
                                        {searchResults.map((song, index) => (
                                            <article key={song.videoId || index} className="track-card wide-card">
                                                <img
                                                    src={song.thumbnails?.[0]?.url.replace('w120-h120', 'w160-h160')}
                                                    alt={song.name}
                                                    className="track-art"
                                                />
                                                <div className="track-copy">
                                                    <h3>{song.name}</h3>
                                                    <p>{song.artists?.[0]?.name || 'Unknown Artist'}</p>
                                                </div>
                                                <div className="track-actions wrap-actions">
                                                    <button onClick={() => playSong(song)} className="play-button">Play</button>
                                                    <button onClick={() => toggleLike(song)} className="icon-button">
                                                        {likedSongs.some((savedSong) => savedSong.videoId === (song.videoId || song.id)) ? 'Liked' : 'Like'}
                                                    </button>
                                                    <select
                                                        className="playlist-picker"
                                                        value={playlistSelection[song.videoId] || ''}
                                                        onChange={(e) => handlePlaylistSelection(song, e.target.value)}>
                                                        <option value="">Add to playlist</option>
                                                        {playlists.map((playlist) => (
                                                            <option key={playlist.id} value={playlist.id}>{playlist.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="empty-state">
                                        <p>Search for your favorite artists or songs to start building your library.</p>
                                    </div>
                                )}
                            </section>
                        </section>
                    </>
                ) : (
                    <div className="profile-view-wrapper" style={{ gridColumn: 'span 3' }}>
                        <ProfileView 
                            user={user}
                            likedSongs={likedSongs}
                            playlists={playlists}
                            onLogout={handleLogout}
                            onPlaySong={playSong}
                            onToggleLike={toggleLike}
                            onRemoveFromPlaylist={removeSongFromPlaylist}
                        />
                    </div>
                )}

                {view === 'browse' && (
                    <aside className="panel workspace-panel right-column">
                        <div className="section-heading">
                            <div>
                                <span className="section-kicker">Dynamics</span>
                                <h2>Currently Playing</h2>
                            </div>
                        </div>

                        <div className="detail-card hero-detail">
                            <span className="panel-label">On Deck</span>
                            <strong>{currentSong ? currentSong.name : 'No active stream'}</strong>
                            <p>{currentSong ? currentSongArtist : 'Select a track to start listening.'}</p>
                        </div>

                        <div className="detail-metrics">
                            <div>
                                <span className="stat-label">Likes</span>
                                <strong>{likedSongs.length}</strong>
                            </div>
                            <div>
                                <span className="stat-label">Playlists</span>
                                <strong>{playlists.length}</strong>
                            </div>
                            <div>
                                <span className="stat-label">Lyrics</span>
                                <strong>{lyrics.length > 0 ? 'Live' : 'Off'}</strong>
                            </div>
                        </div>

                        <section className="panel-subsection">
                            <div className="subheading-row">
                                <h3>Visual Lyrics</h3>
                            </div>
                            <div className="lyrics-scroll detail-lyrics">
                                {lyrics.length > 0 && currentSong ? (
                                    lyrics.map((line, index) => {
                                        const isActive = currentTime >= line.time &&
                                            (index === lyrics.length - 1 || currentTime < lyrics[index + 1].time);

                                        return (
                                            <p key={index} className={isActive ? 'lyric-line active' : 'lyric-line'}>
                                                {line.text || '...'}
                                            </p>
                                        );
                                    })
                                ) : (
                                    <div className="empty-state compact">
                                        <p>{currentSong ? 'No synced lyrics found.' : 'Lyrics will sync here.'}</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </aside>
                )}
            </main>

            {currentSong && (
                <footer className="player-dock footer-player">
                    <div className="player-meta">
                        <span className="section-kicker">Now playing</span>
                        <strong>{currentSong.name}</strong>
                        <span className="muted-text">{currentSongArtist}</span>
                    </div>
                    <ReactPlayer
                        url={`${BACKEND_URL}/api/stream/${currentSong.videoId}`}
                        playing
                        controls
                        width="100%"
                        height="58px"
                        onProgress={handleProgress}
                        progressInterval={500}
                        className="player-frame"
                    />
                </footer>
            )}

            <AuthModal 
                isOpen={isAuthModalOpen} 
                onClose={() => setIsAuthModalOpen(false)} 
                onAuthSuccess={() => setIsAuthModalOpen(false)}
                onManualUserSet={(manualUser) => {
                    setUser(manualUser);
                    localStorage.setItem('musify_manual_user', JSON.stringify(manualUser));
                    fetchLibrary(manualUser.uid);
                    setIsAuthModalOpen(false);
                }}
            />
        </div>
    );
}

export default App;
