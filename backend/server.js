const express = require('express');
const fs = require('fs');
const admin = require('firebase-admin');
const cors = require('cors');
const YTMusic = require('ytmusic-api');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const nodemailer = require('nodemailer');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env and .env.local
dotenv.config();
dotenv.config({ path: path.join(__dirname, '.env.local') });

console.log('--- Environment Load Debug ---');
console.log('Available process.env keys:', Object.keys(process.env).filter(k => k.includes('EMAIL') || k.includes('PORT') || k.includes('FIREBASE')));
console.log('------------------------------');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize YTMusic
const ytmusic = new YTMusic();

// We must initialize ytmusic before it can be used
ytmusic.initialize().then(() => {
  console.log('YTMusic API initialized.');
}).catch(console.error);

// 1. Search Endpoint
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    // Search songs using ytmusic-api
    const results = await ytmusic.searchSongs(query);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search for songs' });
  }
});

// 2. Stream Endpoint (Audio Only)
app.get('/api/stream/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const audioUrl = await resolveAudioStreamUrl(videoId);
    const audioRes = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': '*/*'
      }
    });

    if (!audioRes.ok || !audioRes.body) {
      throw new Error(`Failed to fetch audio stream: ${audioRes.status}`);
    }

    // Set headers for audio streaming
    res.setHeader('Content-Type', audioRes.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    const contentLength = audioRes.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const stream = Readable.fromWeb(audioRes.body);

    stream.on('error', (err) => {
      console.error('CRITICAL STREAM ERROR:', err.message);
      if (!res.headersSent) {
        res.status(500).send('Streaming failed');
      } else {
        res.end();
      }
    });

    stream.on('data', () => {
      console.log(`Streaming data for: ${videoId}`);
    });

    stream.pipe(res);

    res.on('close', () => {
      console.log('Client connection closed.');
      if (!stream.destroyed) stream.destroy();
    });
  } catch (error) {
    console.error('Route error:', error);
    res.status(500).json({ error: 'Failed to initialize' });
  }
});

function resolveAudioStreamUrl(videoId) {
  const pythonBin = process.env.PYTHON_BIN || 'python';
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const args = [
    '-m',
    'yt_dlp',
    '-g',
    '-f',
    'bestaudio',
    '--no-playlist',
    '--no-warnings',
    '--js-runtimes',
    'node',
    url
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, args, {
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start yt-dlp: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const details = (stderr || stdout).trim() || `exit code ${code}`;
        reject(new Error(`yt-dlp failed: ${details}`));
        return;
      }

      const audioUrl = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.startsWith('http'));

      if (!audioUrl) {
        reject(new Error(`yt-dlp did not return a stream URL. ${stderr.trim()}`));
        return;
      }

      resolve(audioUrl);
    });
  });
}

// 3. Synced Lyrics Endpoint
app.get('/api/lyrics/:artist/:title', async (req, res) => {
  try {
    const { artist, title } = req.params;

    // Fetch directly from LRCLIB rest API 
    const response = await fetch(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`);
    const data = await response.json();

    if (data && data.syncedLyrics) {
      res.json({ syncedLyrics: data.syncedLyrics });
    } else {
      res.status(404).json({ error: 'Synced lyrics not found' });
    }
  } catch (error) {
    console.error('Lyrics fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch lyrics' });
  }
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// --- Firebase Initialization (Server Admin SDK) ---
let db;
try {
    if (process.env.VITE_FIREBASE_PROJECT_ID) {
        admin.initializeApp({
            projectId: process.env.VITE_FIREBASE_PROJECT_ID
        });
        db = admin.firestore();
        console.log('Firebase Admin initialized for project:', process.env.VITE_FIREBASE_PROJECT_ID);
    } else {
        console.warn('VITE_FIREBASE_PROJECT_ID missing in backend .env.local - Firestore backend sync disabled.');
    }
} catch (e) {
    console.error('Firebase Admin initialization failed:', e);
}

const otpStore = new Map();

// --- Library Persistence Logic ---
const LIBRARY_FILE = path.join(__dirname, 'user_libraries.json');

const readLocalLibrary = () => {
  if (!fs.existsSync(LIBRARY_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
  } catch (e) { return {}; }
};

app.post('/api/library/save', async (req, res) => {
  const { userId, likedSongs, playlists } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  
  // 1. Save to local fallback first
  const localLibrary = readLocalLibrary();
  localLibrary[userId] = { likedSongs, playlists };
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(localLibrary, null, 2));

  // 2. Try to save to Firestore
  if (db) {
    try {
      const userRef = db.collection('users').doc(userId);
      await userRef.set({ likedSongs, playlists }, { merge: true });
      return res.json({ success: true, storage: 'firestore' });
    } catch (e) {
      console.error('Firestore save failed, used local fallback:', e);
    }
  }
  
  res.json({ success: true, storage: 'local-fallback' });
});

app.get('/api/library/load/:userId', async (req, res) => {
  const { userId } = req.params;
  
  // 1. Try Firestore
  if (db) {
    try {
      const userRef = db.collection('users').doc(userId);
      const docSnap = await userRef.get();
      if (docSnap.exists) {
        return res.json(docSnap.data());
      }
    } catch (e) {
      console.error('Firestore load failed, checking local:', e);
    }
  }

  // 2. Fallback to local
  const localLibrary = readLocalLibrary();
  res.json(localLibrary[userId] || { likedSongs: [], playlists: [] });
});

// OTP Send Endpoint
app.post('/api/otp/send', async (req, res) => {
  const { phone, email } = req.body;
  if (!phone || !email) return res.status(400).json({ error: 'Phone and Email are required' });

  console.log('Attempting to send OTP...');
  console.log('Using Email User:', process.env.EMAIL_USER ? 'Defined' : 'UNDEFINED');
  console.log('Using Email Pass:', process.env.EMAIL_PASS ? 'Defined' : 'UNDEFINED');

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, { otp, email, expires: Date.now() + 300000 }); 

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your Musify Login OTP',
    text: `Your OTP for logging into Musify with phone ${phone} is: ${otp}. It expires in 5 minutes.`
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: 'OTP sent successfully' });
    console.log(`OTP sent to ${email} for phone ${phone}: ${otp}`);
  } catch (error) {
    console.error('CRITICAL EMAIL ERROR:', error);
    res.status(500).json({ 
      error: 'Failed to send OTP email', 
      details: error.message,
      code: error.code
    });
  }
});

// OTP Verify Endpoint
app.post('/api/otp/verify', async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP are required' });

  const record = otpStore.get(phone);
  if (!record) return res.status(400).json({ error: 'No OTP found for this phone' });
  if (record.expires < Date.now()) {
    otpStore.delete(phone);
    return res.status(400).json({ error: 'OTP expired' });
  }

  if (record.otp === otp) {
    otpStore.delete(phone);
    // In a real app, you would generate a JWT here. 
    // For this demo, we'll return the user info.
    res.json({ 
      success: true, 
      user: { 
        phoneNumber: phone, 
        email: record.email,
        displayName: phone // Fallback
      } 
    });
  } else {
    res.status(400).json({ error: 'Invalid OTP' });
  }
});

const PORT = process.env.PORT || 5010;
const server = app.listen(PORT, () => {
  console.log(`Node Server running on port ${server.address().port}`);
});

server.on('error', (error) => {
  console.error('Server startup error:', error.message);
});
