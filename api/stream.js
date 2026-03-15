const { Innertube } = require('youtubei.js');

let youtube;

module.exports = async (req, res) => {
  const { videoId } = req.query;

  if (!videoId) {
    return res.status(400).json({ error: 'Video ID is required' });
  }

  try {
    if (!youtube) {
      youtube = await Innertube.create();
    }

    const info = await youtube.getBasicInfo(videoId);
    const format = info.chooseFormat({ type: 'audio', quality: 'best' });
    const url = format.url;

    if (!url) {
      throw new Error('Could not find audio URL');
    }

    // Redirect to the direct stream URL
    // Note: Some YouTube URLs might be restricted by IP, but this is the simplest Node-only way.
    res.redirect(url);
  } catch (error) {
    console.error('Streaming error:', error);
    res.status(500).json({ error: 'Failed to resolve stream', details: error.message });
  }
};
