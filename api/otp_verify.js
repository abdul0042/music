const { db } = require('./_firebase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP are required' });

  if (!db) {
    return res.status(503).json({ error: 'Firestore not available for verification' });
  }

  try {
    const docRef = db.collection('otps').doc(phone);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(400).json({ error: 'No OTP found for this phone' });
    }

    const record = docSnap.data();
    if (record.expires < Date.now()) {
      await docRef.delete();
      return res.status(400).json({ error: 'OTP expired' });
    }

    if (record.otp === otp) {
      await docRef.delete();
      res.status(200).json({
        success: true,
        user: {
          uid: 'otp-' + phone.replace(/\+/g, ''),
          phoneNumber: phone,
          email: record.email,
          displayName: phone
        }
      });
    } else {
      res.status(400).json({ error: 'Invalid OTP' });
    }
  } catch (error) {
    console.error('OTP Verify error:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
};
