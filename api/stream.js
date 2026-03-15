const ytdl = require('@distube/ytdl-core');

// List of public Piped instances to fall back to if YouTube blocks the Vercel IP
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://pipedapi.moomoo.me',
  'https://pipedapi.syncord.org',
  'https://api.piped.privacydev.net',
  'https://pipedapi.r48.moe'
];

async function resolveViaPiped(videoId) {
  for (const instance of PIPED_INSTANCES) {
    try {
      console.log(`Trying Piped instance: ${instance}`);
      const response = await fetch(`${instance}/streams/${videoId}`);
      if (!response.ok) continue;
      
      const data = await response.json();
      // Piped returns audio-only streams in hls or separate formats
      // Format 249, 250, 251 are Opus. Format 140 is M4A.
      const audioStream = data.audioStreams?.find(s => s.bitrate > 0) || data.audioStreams?.[0];
      
      if (audioStream && audioStream.url) {
        return audioStream.url;
      }
    } catch (e) {
      console.warn(`Piped instance ${instance} failed:`, e.message);
    }
  }
  return null;
}

module.exports = async (req, res) => {
  const { videoId } = req.query;

  if (!videoId) {
    return res.status(400).json({ error: 'Video ID is required' });
  }

  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({ error: 'Resolution timed out' });
    }
  }, 12000); // Increased timeout for fallbacks

  try {
    let streamUrl;

    try {
      console.log('Attempting direct ytdl resolution...');
      const info = await ytdl.getBasicInfo(videoId);
      const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
      if (format && format.url) streamUrl = format.url;
    } catch (ytdlError) {
      console.error('ytdl-core failed:', ytdlError.message);
      
      // If blocked by bot detection, try Piped fallback
      if (ytdlError.message.includes('bot') || ytdlError.message.includes('Sign in')) {
        console.log('Bot detection triggered. Falling back to Piped...');
        streamUrl = await resolveViaPiped(videoId);
      } else {
        throw ytdlError;
      }
    }

    clearTimeout(timeout);

    if (!streamUrl) {
      throw new Error('Could not resolve a playable stream URL from any source.');
    }

    res.setHeader('Cache-Control', 'no-cache');
    res.redirect(302, streamUrl);
  } catch (error) {
    clearTimeout(timeout);
    console.error('Streaming crash:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to resolve stream', details: error.message });
    }
  }
};
