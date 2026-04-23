// Shared admin authentication helper
// Accepts either:
//   Authorization: Bearer <password>   (curl / fetch with headers)
//   ?token=<password>                  (query param, for GET-only tools like web_fetch)

function checkAdminAuth(req) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return 'ADMIN_PASSWORD env var not set';

  const auth  = req.headers['authorization'] || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const qtoken = req.query?.token || '';

  const token = bearer || qtoken;
  if (!token || token !== password) return 'Unauthorized';
  return null; // null = auth passed
}

module.exports = { checkAdminAuth };
