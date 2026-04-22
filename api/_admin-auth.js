// Shared admin authentication helper
// Checks Authorization: Bearer <password> against ADMIN_PASSWORD env var

function checkAdminAuth(req) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return 'ADMIN_PASSWORD env var not set';

  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!token || token !== password) return 'Unauthorized';
  return null; // null = auth passed
}

module.exports = { checkAdminAuth };
