module.exports = async (req, res) => {
  try {
    const { artist, title } = req.query; // Changed from params to query for serverless conventions or kept as params if rewrite handles it

    if (!artist || !title) {
      return res.status(400).json({ error: 'Artist and Title are required' });
    }

    const response = await fetch(
      `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`
    );
    const data = await response.json();

    if (data && data.syncedLyrics) {
      res.status(200).json({ syncedLyrics: data.syncedLyrics });
    } else {
      res.status(404).json({ error: 'Synced lyrics not found' });
    }
  } catch (error) {
    console.error('Lyrics fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch lyrics', details: error.message });
  }
};
