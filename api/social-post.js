// POST /api/social-post
// Internal API for Claude agent to publish to Instagram and Threads.
// Secured with SOCIAL_POST_SECRET env var.

const https = require('https');

function httpsPost(hostname, path, data) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(data).toString();
    const req = https.request(
      { hostname, path, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(hostname, path) {
  return new Promise((resolve, reject) => {
    https.get({ hostname, path }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    }).on('error', reject);
  });
}

async function postToInstagram(imageUrl, caption, userId, token) {
  // Step 1: Create container
  const create = await httpsPost('graph.instagram.com', `/v25.0/${userId}/media`, {
    image_url: imageUrl,
    caption,
    media_type: 'IMAGE',
    access_token: token,
  });
  if (create.body.error) throw new Error(create.body.error.message);
  const containerId = create.body.id;

  // Step 2: Poll until ready
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const check = await httpsGet('graph.instagram.com', `/v25.0/${containerId}?fields=status_code&access_token=${token}`);
    if (check.body.status_code === 'FINISHED') break;
    if (check.body.status_code === 'ERROR') throw new Error('Instagram media processing failed');
  }

  // Step 3: Publish
  const pub = await httpsPost('graph.instagram.com', `/v25.0/${userId}/media_publish`, {
    creation_id: containerId,
    access_token: token,
  });
  if (pub.body.error) throw new Error(pub.body.error.message);
  return pub.body.id;
}

async function postToThreads(text, token) {
  // Step 1: Get user ID
  const me = await httpsGet('graph.threads.net', `/v1.0/me?access_token=${token}`);
  if (me.body.error) throw new Error(me.body.error.message);
  const userId = me.body.id;

  // Step 2: Create container
  const create = await httpsPost('graph.threads.net', `/v1.0/${userId}/threads`, {
    media_type: 'TEXT',
    text,
    access_token: token,
  });
  if (create.body.error) throw new Error(create.body.error.message);
  const containerId = create.body.id;

  // Step 3: Publish
  await new Promise(r => setTimeout(r, 2000));
  const pub = await httpsPost('graph.threads.net', `/v1.0/${userId}/threads_publish`, {
    creation_id: containerId,
    access_token: token,
  });
  if (pub.body.error) throw new Error(pub.body.error.message);
  return pub.body.id;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.SOCIAL_POST_SECRET;
  if (!secret || req.headers['x-social-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { platform, image_url, caption, text } = req.body;

  try {
    if (platform === 'instagram') {
      if (!image_url || !caption) return res.status(400).json({ error: 'image_url and caption required' });
      const id = await postToInstagram(
        image_url, caption,
        process.env.IG_USER_ID,
        process.env.IG_ACCESS_TOKEN
      );
      return res.status(200).json({ success: true, platform: 'instagram', id });
    }

    if (platform === 'threads') {
      if (!text) return res.status(400).json({ error: 'text required' });
      const id = await postToThreads(text, process.env.THREADS_ACCESS_TOKEN);
      return res.status(200).json({ success: true, platform: 'threads', id });
    }

    return res.status(400).json({ error: 'platform must be instagram or threads' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
