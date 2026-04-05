const { google } = require('googleapis');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, subject, message } = req.body || {};

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const gmailUser = 'yetipoopskiwax@gmail.com';

  if (!serviceAccountKey) {
    console.error('Missing GOOGLE_SERVICE_ACCOUNT_KEY');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const credentials = JSON.parse(serviceAccountKey);

    // Use domain-wide delegation to send as yetipoopskiwax@gmail.com
    // Requires the service account to have domain-wide delegation enabled
    // and the Gmail API scope granted in Google Workspace admin.
    // For a plain Gmail account, we use the Gmail API with OAuth2 instead.
    // See /api/contact setup notes in COO docs if this needs updating.

    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/gmail.send'],
      gmailUser // impersonate this address (requires domain-wide delegation)
    );

    const gmail = google.gmail({ version: 'v1', auth });

    const emailBody = [
      `From: Yeti Poop Ski Wax <${gmailUser}>`,
      `To: ${gmailUser}`,
      `Reply-To: ${name} <${email}>`,
      `Subject: [Contact] ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      '',
      `From: ${name} (${email})`,
      '',
      message,
    ].join('\n');

    const encoded = Buffer.from(emailBody)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Contact send error:', err);
    return res.status(500).json({ error: 'Failed to send message' });
  }
};
