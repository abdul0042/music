import React from 'react';

const ProfileView = ({ user, likedSongs, playlists, onLogout, onPlaySong, onToggleLike, onRemoveFromPlaylist }) => {
    if (!user) return null;

    return (
        <div className="profile-container animate-fade-in">
            <header className="profile-header">
                <div className="profile-hero">
                    <img src={user.photoURL} alt={user.displayName} className="profile-avatar" />
                    <div className="profile-info">
                        <span className="section-kicker">Member Profile</span>
                        <h1>{user.displayName}</h1>
                        <p className="muted-text">{user.email}</p>
                        <div className="profile-stats">
                            <div className="stat">
                                <strong>{likedSongs.length}</strong>
                                <span>Liked Tracks</span>
                            </div>
                            <div className="stat">
                                <strong>{playlists.length}</strong>
                                <span>Playlists</span>
                            </div>
                        </div>
                        <button onClick={onLogout} className="ghost-button logout-btn">Sign Out</button>
                    </div>
                </div>
            </header>

            <div className="profile-sections-grid">
                <section className="profile-section">
                    <div className="subheading-row">
                        <h3>Liked Tracks</h3>
                        <span>Recently saved</span>
                    </div>
                    <div className="profile-list">
                        {likedSongs.length > 0 ? (
                            likedSongs.map((song) => (
                                <article key={song.videoId} className="profile-item-card">
                                    <img src={song.thumbnail} alt={song.title} />
                                    <div className="item-details">
                                        <strong>{song.title}</strong>
                                        <p>{song.artist}</p>
                                    </div>
                                    <div className="item-actions">
                                        <button onClick={() => onPlaySong(song)} className="play-btn-small">▶</button>
                                        <button onClick={() => onToggleLike(song)} className="icon-btn-small">✕</button>
                                    </div>
                                </article>
                            ))
                        ) : (
                            <div className="empty-state compact">
                                <p>You haven't liked any songs yet.</p>
                            </div>
                        )}
                    </div>
                </section>

                <section className="profile-section">
                    <div className="subheading-row">
                        <h3>My Playlists</h3>
                        <span>Organized collections</span>
                    </div>
                    <div className="profile-list">
                        {playlists.length > 0 ? (
                            playlists.map((playlist) => (
                                <div key={playlist.id} className="playlist-group">
                                    <div className="playlist-header">
                                        <strong>{playlist.name}</strong>
                                        <span>{playlist.songs.length} tracks</span>
                                    </div>
                                    <div className="playlist-songs-mini">
                                        {playlist.songs.map((song) => (
                                            <div key={song.videoId} className="mini-song">
                                                <span>{song.title}</span>
                                                <button onClick={() => onRemoveFromPlaylist(playlist.id, song.videoId)}>&times;</button>
                                            </div>
                                        ))}
                                        {playlist.songs.length === 0 && <p className="muted-text small">Playlist is empty</p>}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="empty-state compact">
                                <p>Create your first playlist to see it here.</p>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default ProfileView;
