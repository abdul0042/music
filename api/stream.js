const ytdl = require('@distube/ytdl-core');

module.exports = async (req, res) => {
  const { videoId } = req.query;

  if (!videoId) {
    return res.status(400).json({ error: 'Video ID is required' });
  }

  // Set a timeout to prevent Vercel from killing the function silently
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Resolution timed out' });
    }
  }, 9000);

  try {
    const info = await ytdl.getBasicInfo(videoId);
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
    
    clearTimeout(timeout);

    if (!format || !format.url) {
      throw new Error('No audio format found');
    }

    // Redirect to the direct stream URL
    res.setHeader('Cache-Control', 'no-cache');
    res.redirect(302, format.url);
  } catch (error) {
    clearTimeout(timeout);
    console.error('Streaming error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to resolve stream', details: error.message });
    }
  }
};
