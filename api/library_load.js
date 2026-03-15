const { db } = require('./_firebase');

module.exports = async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  if (db) {
    try {
      const userRef = db.collection('users').doc(userId);
      const docSnap = await userRef.get();
      if (docSnap.exists) {
        return res.status(200).json(docSnap.data());
      } else {
        return res.status(200).json({ likedSongs: [], playlists: [] });
      }
    } catch (e) {
      console.error('Firestore load failed:', e);
      return res.status(500).json({ error: 'Firestore load failed' });
    }
  }

  res.status(200).json({ likedSongs: [], playlists: [], warning: 'Firebase not configured' });
};
