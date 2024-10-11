require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const path = require('path');
const pidusage = require('pidusage');
const CryptoJS = require('crypto-js');

const SECRET_KEY = process.env.SECRET_KEY;
const PASSWORD_HASH = bcrypt.hashSync(process.env.PASSWORD, 10);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/deno_types', express.static('deno_types'));
app.use(bodyParser.json());

// Serve index.html for all non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/deno_types/') || req.path.startsWith('/dist/') || req.path.startsWith('/bundle.js')) {
    next();
  } else {
    res.sendFile(path.resolve('public/index.html'));
  }
});

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.sendStatus(401);
  const token = authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    next();
  });
}

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (!bcrypt.compareSync(password, PASSWORD_HASH)) {
    return res.sendStatus(401);
  }
  const token = jwt.sign({ username: 'admin' }, SECRET_KEY);
  res.json({ token });
});

app.get('/api/authenticated', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.json({ authenticated: false });
  const token = authHeader.split(' ')[1];
  if (!token) return res.json({ authenticated: false });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.json({ authenticated: false });
    res.json({ authenticated: true });
  });
});

// File management
app.get('/api/files', authenticateToken, (req, res) => {
  const files = fs.readdirSync('codes').filter(file => !file.startsWith('.'));
  res.json(files);
});

app.get('/api/files/:fileName', authenticateToken, (req, res) => {
  const { fileName } = req.params;
  const code = fs.readFileSync(`codes/${fileName}`, 'utf8');
  res.json({ code });
});

app.delete('/api/files/:fileName', authenticateToken, (req, res) => {
  const { fileName } = req.params;

  const process = processes.get(fileName);
  if (process) {
    process.process.kill();
    processes.delete(fileName);
  }

  fs.removeSync(`codes/${fileName}`);
  fs.removeSync(`configs/${fileName}.json`);
  fs.removeSync(`configs/${fileName}.env.json`);
  res.sendStatus(200);
});

app.post('/api/files', authenticateToken, (req, res) => {
  const { fileName, code } = req.body;
  fs.writeFileSync(`codes/${fileName}`, code);
  res.sendStatus(200);
});


// Flags management
app.post('/api/flags', authenticateToken, (req, res) => {
  const { fileName, flags, autostart } = req.body;
  const configPath = `configs/${fileName}.json`;
  let config = {};
  if (fs.existsSync(configPath)) {
    config = fs.readJSONSync(configPath);
  }
  config.flags = flags;
  config.autostart = autostart;
  fs.writeJSONSync(configPath, config);
  res.sendStatus(200);
});

app.get('/api/flags/:fileName', authenticateToken, (req, res) => {
  const { fileName } = req.params;
  const configPath = `configs/${fileName}.json`;
  if (fs.existsSync(configPath)) {
    const config = fs.readJSONSync(configPath);
    res.json(config);
  } else {
    res.json({ flags: '--allow-net', autostart: false });
  }
});

// Environment variables management
app.post('/api/env', authenticateToken, (req, res) => {
  const { fileName, envVars } = req.body;
  const envPath = `configs/${fileName}.env.json`;
  let existingVars = {};
  if (fs.existsSync(envPath)) {
    existingVars = fs.readJSONSync(envPath);
  }
  const encryptedVars = { ...existingVars };
  Object.keys(envVars).forEach(key => {
    if (envVars[key] !== '********') {
      const encryptedValue = CryptoJS.AES.encrypt(envVars[key], SECRET_KEY).toString();
      encryptedVars[key] = encryptedValue;
    }
  });
  fs.writeJSONSync(envPath, encryptedVars);
  res.sendStatus(200);
});

app.post('/api/env/delete', authenticateToken, (req, res) => {
  const { fileName, key } = req.body;
  const envPath = `configs/${fileName}.env.json`;
  if (fs.existsSync(envPath)) {
    let encryptedVars = fs.readJSONSync(envPath);
    delete encryptedVars[key];
    fs.writeJSONSync(envPath, encryptedVars);
  }
  res.sendStatus(200);
});

app.get('/api/env/:fileName', authenticateToken, (req, res) => {
  const { fileName } = req.params;
  const envPath = `configs/${fileName}.env.json`;
  if (fs.existsSync(envPath)) {
    const encryptedVars = fs.readJSONSync(envPath);
    const maskedVars = {};
    Object.keys(encryptedVars).forEach(key => {
      maskedVars[key] = '********';
    });
    res.json({ envVars: maskedVars });
  } else {
    res.json({ envVars: {} });
  }
});

// Process management
const processes = new Map();

app.post('/api/deploy', authenticateToken, (req, res) => {
  const { fileName, flags } = req.body;
  const id = uuidv4();
  const filePath = path.resolve(`codes/${fileName}`);
  const logPath = `logs/${id}.log`;
  const port = 9000 + processes.size + 1;

  // Stop existing process
  for (let [procId, proc] of processes) {
    if (proc.fileName === fileName) {
      proc.process.kill();
      processes.delete(procId);
    }
  }

  const args = ['run', ...flags.split(' '), filePath];
  const envVars = { ...process.env, PORT: port.toString() };
  const envPath = `configs/${fileName}.env.json`;
  if (fs.existsSync(envPath)) {
    const encryptedVars = fs.readJSONSync(envPath);
    Object.keys(encryptedVars).forEach(key => {
      const decrypted = CryptoJS.AES.decrypt(encryptedVars[key], SECRET_KEY).toString(CryptoJS.enc.Utf8);
      envVars[key] = decrypted;
    });
  }

  const denoPath = process.env.DENO_PATH || 'deno';

  const child = spawn(denoPath, args, {
    env: envVars,
    maxBuffer: 1024 * 1024,
  });

  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  processes.set(id, {
    id,
    fileName,
    status: 'running',
    startTime: new Date(),
    process: child,
    logPath,
    serverPort: port,
  });

  child.on('exit', (code) => {
    const proc = processes.get(id);
    if (proc) {
      proc.status = 'stopped';
    }
  });

  res.json({ id });
});

app.get('/api/processes', authenticateToken, async (req, res) => {
  const processList = await Promise.all(Array.from(processes.values()).map(async (p) => {
    let stats = {};
    try {
      stats = await pidusage(p.process.pid);
    } catch {}
    return {
      id: p.id,
      fileName: p.fileName,
      status: p.status,
      startTime: p.startTime,
      cpu: stats.cpu ? stats.cpu.toFixed(2) : null,
      memory: stats.memory ? (stats.memory / 1024 / 1024).toFixed(2) : null,
    };
  }));
  res.json(processList);
});

app.post('/api/processes/:id/stop', authenticateToken, (req, res) => {
  const id = req.params.id;
  const proc = processes.get(id);
  if (proc && proc.status === 'running') {
    proc.process.kill();
    proc.status = 'stopped';
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

app.get('/api/processes/:id/logs', authenticateToken, (req, res) => {
  const id = req.params.id;
  const proc = processes.get(id);
  if (proc) {
    let logs = fs.readFileSync(proc.logPath, 'utf8');
    logs = logs.replace(/\x1b\[.*?m/g, '');
    res.json({ logs });
  } else {
    res.sendStatus(404);
  }
});

// Autostart processes
const startAutostartProcesses = () => {
  const files = fs.readdirSync('codes').filter(file => !file.startsWith('.'));
  files.forEach(fileName => {
    const configPath = `configs/${fileName}.json`;
    if (fs.existsSync(configPath)) {
      const config = fs.readJSONSync(configPath);
      if (config.autostart) {
        const id = uuidv4();
        const filePath = path.resolve(`codes/${fileName}`);
        const logPath = `logs/${id}.log`;
        const port = 9000 + processes.size + 1;

        const args = ['run', ...config.flags.split(' '), filePath];
        const envVars = { ...process.env, PORT: port.toString() };
        const envPath = `configs/${fileName}.env.json`;
        if (fs.existsSync(envPath)) {
          const encryptedVars = fs.readJSONSync(envPath);
          Object.keys(encryptedVars).forEach(key => {
            const decrypted = CryptoJS.AES.decrypt(encryptedVars[key], SECRET_KEY).toString(CryptoJS.enc.Utf8);
            envVars[key] = decrypted;
          });
        }

        const denoPath = process.env.DENO_PATH || 'deno';

        const child = spawn(denoPath, args, {
          env: envVars,
          maxBuffer: 1024 * 1024,
        });

        const logStream = fs.createWriteStream(logPath, { flags: 'a' });
        child.stdout.pipe(logStream);
        child.stderr.pipe(logStream);

        processes.set(id, {
          id,
          fileName,
          status: 'running',
          startTime: new Date(),
          process: child,
          logPath,
          serverPort: port,
        });

        child.on('exit', (code) => {
          const proc = processes.get(id);
          if (proc) {
            proc.status = 'stopped';
          }
        });
      }
    }
  });
};

// Start server
const PORT = process.env.PORT || 3000;
const mainServer = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startAutostartProcesses();
});