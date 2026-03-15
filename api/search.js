const YTMusic = require('ytmusic-api');

let ytmusic;

module.exports = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!ytmusic) {
      ytmusic = new YTMusic();
      await ytmusic.initialize();
    }

    const results = await ytmusic.searchSongs(q);
    res.status(200).json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search for songs', details: error.message });
  }
};
