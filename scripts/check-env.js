import dotenv from 'dotenv';

const result = dotenv.config();

console.log(JSON.stringify({
  error: result.error?.message || null,
  cwd: process.cwd(),
  hasPassword: Object.prototype.hasOwnProperty.call(process.env, 'DB_PASSWORD'),
  passwordType: typeof process.env.DB_PASSWORD,
  passwordLength: process.env.DB_PASSWORD?.length || 0,
  host: process.env.DB_HOST || null,
  user: process.env.DB_USER || null
}, null, 2));
