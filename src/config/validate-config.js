const requiredProductionConfig = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'AWS_REGION', 'AWS_S3_BUCKET', 'APP_ORIGIN'];

const validateConfig = (env = process.env) => {
  if (env.NODE_ENV !== 'production') return;
  const missing = requiredProductionConfig.filter((name) => !env[name] || !String(env[name]).trim());
  if (missing.length) throw new Error(`Missing required production configuration: ${missing.join(', ')}`);
  if (!/^\d+$/.test(env.DB_PORT || '3306')) throw new Error('DB_PORT must be a valid integer');
};

export { validateConfig };
