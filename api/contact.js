const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, subject, message } = req.body || {};

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPass) {
    console.error('Missing GMAIL_USER or GMAIL_APP_PASSWORD');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

  try {
    await transporter.sendMail({
      from: `"Yeti Poop Ski Wax" <${gmailUser}>`,
      to: gmailUser,
      replyTo: `"${name}" <${email}>`,
      subject: `[Contact] ${subject}`,
      text: `From: ${name} (${email})\n\n${message}`,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Contact send error:', err);
    return res.status(500).json({ error: 'Failed to send message' });
  }
};
