const nodemailer = require('nodemailer');
const { db } = require('./_firebase');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { phone, email } = req.body;
  if (!phone || !email) return res.status(400).json({ error: 'Phone and Email are required' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 300000;

  try {
    // Store in Firestore for cross-instance verification
    if (db) {
      await db.collection('otps').doc(phone).set({ otp, email, expires });
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Musify Login OTP',
      text: `Your OTP for logging into Musify with phone ${phone} is: ${otp}. It expires in 5 minutes.`
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (error) {
    console.error('OTP Send error:', error);
    res.status(500).json({ error: 'Failed to send OTP', details: error.message });
  }
};
