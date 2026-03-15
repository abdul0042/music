const { db } = require('./_firebase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { userId, likedSongs, playlists } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  if (db) {
    try {
      const userRef = db.collection('users').doc(userId);
      await userRef.set({ likedSongs, playlists }, { merge: true });
      return res.status(200).json({ success: true, storage: 'firestore' });
    } catch (e) {
      console.error('Firestore save failed:', e);
      return res.status(500).json({ error: 'Firestore save failed', details: e.message });
    }
  }

  res.status(503).json({ error: 'Firebase not configured' });
};
