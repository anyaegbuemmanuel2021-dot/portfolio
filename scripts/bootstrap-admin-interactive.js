// Create the first owner account against the configured PostgreSQL database.
// Password input is masked and never placed in shell history or printed.
import '../server/config.js';
import { config, assertConfig } from '../server/config.js';
import { connect } from '../server/db.js';
import { migrate } from '../server/migrate.js';
import { seed } from '../server/seed.js';
import { authService } from '../server/services/auth.js';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

if (!stdin.isTTY || !stdout.isTTY) throw new Error('Run this command in an interactive terminal.');
const rl = readline.createInterface({ input: stdin, output: stdout });
function hidden(prompt) {
  return new Promise(resolve => {
    stdout.write(prompt);
    let value = '';
    const onData = chunk => {
      const s = chunk.toString('utf8');
      if (s === '\u0003') { cleanup(); process.exit(130); }
      if (s === '\r' || s === '\n') { cleanup(); stdout.write('\n'); resolve(value); return; }
      if (s === '\u007f' || s === '\b') { value = value.slice(0, -1); return; }
      if (s >= ' ' && s.length === 1) value += s;
    };
    const cleanup = () => { stdin.off('data', onData); if (stdin.isTTY) stdin.setRawMode(false); };
    stdin.setRawMode(true); stdin.resume(); stdin.on('data', onData);
  });
}
let db;
try {
  assertConfig();
  if (/^sqlite:/i.test(config.databaseUrl)) throw new Error('This command must use your Neon/PostgreSQL DATABASE_URL, not SQLite.');
  const email = (await rl.question('Owner email: ')).trim().toLowerCase();
  rl.close();
  const password = await hidden('Owner password (input hidden): ');
  const confirm = await hidden('Confirm password (input hidden): ');
  if (!email || !email.includes('@')) throw new Error('Enter a valid owner email address.');
  if (password.length < 12) throw new Error('Use a unique password with at least 12 characters.');
  if (password !== confirm) throw new Error('The passwords do not match.');
  db = await connect();
  await migrate(db);
  await seed(db);
  const id = await authService(db, { real: false }).bootstrap({ email, password, name: 'Owner' });
  console.log(`Owner account created (${id}). Sign in at /admin/ with your email and password.`);
} catch (error) {
  console.error(`Owner setup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (db) await db.close();
  rl.close();
}
