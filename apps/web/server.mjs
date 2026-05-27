import { createServer } from 'https';
import { parse } from 'url';
import next from 'next';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const dev = process.env.NODE_ENV !== 'production';
const appDir = path.dirname(fileURLToPath(import.meta.url));

function readArgValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const hostname = readArgValue('--hostname') ?? process.env.WEB_HOSTNAME ?? process.env.HOST ?? 'localhost';
const port = Number(readArgValue('--port') ?? process.env.PORT ?? 3080);

const app = next({ dev, dir: appDir, hostname, port });
const handle = app.getRequestHandler();

// Generate self-signed certificate if it doesn't exist
const certDir = path.join(appDir, '.cert');
const keyPath = path.join(certDir, 'localhost-key.pem');
const certPath = path.join(certDir, 'localhost.pem');

if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.log('Generating self-signed certificate...');
  try {
    execSync(`openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj "/CN=localhost" -keyout "${keyPath}" -out "${certPath}" -days 365`, { stdio: 'inherit' });
    console.log('Certificate generated successfully');
  } catch (error) {
    console.error('Failed to generate certificate. Make sure OpenSSL is installed.');
    process.exit(1);
  }
}

const httpsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

app.prepare().then(() => {
  createServer(httpsOptions, async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`> Ready on https://${hostname}:${port}`);
  });
});
