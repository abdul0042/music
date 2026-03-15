const ytdl = require('@distube/ytdl-core');

module.exports = async (req, res) => {
  const { videoId } = req.query;

  console.log('Stream request for videoId:', videoId);

  if (!videoId) {
    return res.status(400).json({ error: 'Video ID is required' });
  }

  try {
    const info = await ytdl.getInfo(videoId);
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
    
    if (!format || !format.url) {
      throw new Error('No audio format found');
    }

    console.log('Redirecting to stream URL');
    // We use a temporary redirect to the direct Google Video URL
    // Note: This URL is often IP-restricted, so a proxy might be needed if this fails.
    res.setHeader('Cache-Control', 'no-cache');
    res.redirect(302, format.url);
  } catch (error) {
    console.error('Streaming error:', error.message);
    res.status(500).json({ error: 'Failed to resolve stream', details: error.message });
  }
};
