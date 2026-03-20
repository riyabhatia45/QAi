// Credentials can be provided via environment variables so the test
// doesn't require editing source code.
const env = {
  email: process.env.OPENCART_EMAIL || 'your-demo-email@example.com',
  password: process.env.OPENCART_PASSWORD || 'your-demo-password',

  // OpenCart admin demo credentials are publicly documented as demo/demo.
  adminUsername: process.env.OPENCART_ADMIN_USERNAME || 'demo',
  adminPassword: process.env.OPENCART_ADMIN_PASSWORD || 'demo',

  // Amazon credentials (provide via env vars for security).
  amazonEmail: process.env.AMAZON_EMAIL || '',
  amazonPassword: process.env.AMAZON_PASSWORD || ''
};

module.exports = env;

