import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter as Router, Routes, Route, Link, useNavigate, useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import { Switch } from '@headlessui/react';

function App() {
  const [authenticated, setAuthenticated] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const navigate = useNavigate();
  const [isDarkMode, setIsDarkMode] = React.useState(
    localStorage.getItem('darkMode') === 'true' || false
  );

  const login = async () => {
    try {
      const response = await axios.post('/api/login', { password });
      const token = response.data.token;
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setAuthenticated(true);
      navigate('/');
    } catch {
      alert('Incorrect password');
    }
  };

  React.useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios.get('/api/authenticated').then((response) => {
        if (response.data.authenticated) {
          setAuthenticated(true);
          navigate('/');
        } else {
          localStorage.removeItem('token');
          navigate('/login');
        }
      }).catch(() => {
        localStorage.removeItem('token');
        navigate('/login');
      });
    } else {
      navigate('/login');
    }
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('darkMode', isDarkMode);
  }, [isDarkMode]);

  if (!authenticated) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Login</h1>
        <input
          type="password"
          placeholder="Password"
          className="border p-2 mb-2 w-full dark:bg-gray-800 dark:border-gray-700"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded"
          onClick={login}
        >
          Login
        </button>
      </div>
    );
  }

  return (
    <div>
      <nav className="bg-gray-800 dark:bg-gray-700 p-4 flex justify-between items-center">
        <div>
          <Link to="/" className="text-white mr-4 font-semibold">Home</Link>
        </div>
        <div className="flex items-center">
          <Switch
            checked={isDarkMode}
            onChange={setIsDarkMode}
            className={`${
              isDarkMode ? 'bg-blue-600' : 'bg-gray-200'
            } relative inline-flex items-center h-6 rounded-full w-11`}
          >
            <span
              className={`${
                isDarkMode ? 'translate-x-6' : 'translate-x-1'
              } inline-block w-4 h-4 transform bg-white rounded-full`}
            />
          </Switch>
          <span className="ml-2 text-white mr-2">
            {isDarkMode ? '🌚' : '🌞'}
          </span>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/editor/:fileName" element={<CodeEditor />} />
        <Route path="/logs/:processId" element={<Logs />} />
        <Route path="/login" element={<></>} />
      </Routes>
    </div>
  );
}

function Home() {
  const [files, setFiles] = React.useState([]);
  const [processes, setProcesses] = React.useState([]);
  const navigate = useNavigate();

  const loadFiles = async () => {
    const response = await axios.get('/api/files');
    setFiles(response.data);
  };

  const loadProcesses = async () => {
    const response = await axios.get('/api/processes');
    setProcesses(response.data);
  };

  const createFile = async () => {
    const fileName = prompt('Enter new file name (without extension):');
    if (fileName) {
      const fullFileName = fileName.endsWith('.ts') ? fileName : fileName + '.ts';
      await axios.post('/api/files', { fileName: fullFileName, code: '' });
      navigate(`/editor/${encodeURIComponent(fullFileName)}`);
      loadFiles();
    }
  };

  const deleteFile = async (fileName) => {
    if (confirm(`Delete file ${fileName}?`)) {
      await axios.delete(`/api/files/${encodeURIComponent(fileName)}`);
      loadFiles();
    }
  };

  React.useEffect(() => {
    loadFiles();
    loadProcesses();
  }, []);

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Files</h2>
        <button
          onClick={createFile}
          className="px-4 py-2 bg-green-500 text-white rounded"
        >
          New File
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {files.map((file) => (
          <div key={file} className="bg-white dark:bg-gray-800 p-4 rounded shadow">
            <h3 className="text-lg font-semibold">{file}</h3>
            <div className="mt-2">
              <button
                onClick={() => navigate(`/editor/${encodeURIComponent(file)}`)}
                className="mr-2 px-2 py-1 bg-blue-500 text-white rounded"
              >
                Edit
              </button>
              <button
                onClick={() => deleteFile(file)}
                className="px-2 py-1 bg-red-500 text-white rounded"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-xl font-bold mt-8 mb-4">Running Processes</h2>
      <div className="overflow-auto">
        <table className="min-w-full bg-white dark:bg-gray-800">
          <thead>
            <tr>
              <th className="py-2 px-4">File</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4">Start Time</th>
              <th className="py-2 px-4">CPU (%)</th>
              <th className="py-2 px-4">Memory (MB)</th>
              <th className="py-2 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {processes.map((proc) => (
              <tr key={proc.id} className="border-t">
                <td className="py-2 px-4">{proc.fileName}</td>
                <td className="py-2 px-4">{proc.status}</td>
                <td className="py-2 px-4">{new Date(proc.startTime).toLocaleString()}</td>
                <td className="py-2 px-4">{proc.cpu || '-'}</td>
                <td className="py-2 px-4">{proc.memory || '-'}</td>
                <td className="py-2 px-4">
                  {proc.status === 'running' && (
                    <>
                      <button
                        className="mr-2 px-2 py-1 bg-yellow-500 text-white rounded"
                        onClick={() => navigate(`/editor/${encodeURIComponent(proc.fileName)}`)}
                      >
                        Open Editor
                      </button>
                      <Link
                        to={`/logs/${proc.id}`}
                        className="px-2 py-1 bg-green-500 text-white rounded"
                      >
                        View Logs
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CodeEditor() {
  const { fileName } = useParams();
  const [code, setCode] = React.useState('');
  const [flags, setFlags] = React.useState('--allow-net');
  const [processInfo, setProcessInfo] = React.useState(null);
  const [logs, setLogs] = React.useState('');
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [envVars, setEnvVars] = React.useState({});
  const [newEnvVars, setNewEnvVars] = React.useState({});
  const [showEnvVars, setShowEnvVars] = React.useState(false);
  const [autostart, setAutostart] = React.useState(false);
  const logsEndRef = React.useRef(null);
  const navigate = useNavigate();

  const loadFile = async () => {
    if (fileName) {
      const response = await axios.get(`/api/files/${encodeURIComponent(fileName)}`);
      setCode(response.data.code);
    }
  };

  const saveFile = async () => {
    await axios.post('/api/files', { fileName, code });
  };

  const deploy = async () => {
    await saveFile();
    await axios.post('/api/deploy', { fileName, flags });
    loadProcessInfo();
  };

  const stopProcess = async () => {
    if (processInfo) {
      await axios.post(`/api/processes/${processInfo.id}/stop`);
      setProcessInfo(null);
      setLogs('');
    }
  };

  const loadProcessInfo = async () => {
    const response = await axios.get('/api/processes');
    const proc = response.data.find(p => p.fileName === fileName && p.status === 'running');
    if (proc) {
      setProcessInfo(proc);
    } else {
      setProcessInfo(null);
    }
  };

  const loadLogs = async () => {
    if (processInfo) {
      const response = await axios.get(`/api/processes/${processInfo.id}/logs`);
      setLogs(response.data.logs);
    }
  };

  const saveFlags = async (values = {}) => {
    await axios.post('/api/flags', { fileName, flags, autostart, ...values });
  };

  const loadFlags = async () => {
    const response = await axios.get(`/api/flags/${encodeURIComponent(fileName)}`);
    if (response.data.flags) {
      setFlags(response.data.flags);
    }
    if (response.data.autostart !== undefined) {
      setAutostart(response.data.autostart);
    }
  };

  const saveEnvVars = async () => {
    await axios.post('/api/env', { fileName, envVars: newEnvVars });
    setNewEnvVars({});
    loadEnvVars();
    setShowEnvVars(false);
  };

  const loadEnvVars = async () => {
    const response = await axios.get(`/api/env/${encodeURIComponent(fileName)}`);
    if (response.data.envVars) {
      setEnvVars(response.data.envVars);
    }
  };

  const handleAddEnvVar = () => {
    const key = prompt('Enter variable name:');
    const value = prompt('Enter variable value (will not be shown again):');
    if (key && value) {
      setNewEnvVars({ ...newEnvVars, [key]: value });
      setEnvVars({ ...envVars, [key]: '********' });
    }
  };

  const handleDeleteEnvVar = async (key) => {
    if (confirm(`Delete environment variable ${key}?`)) {
      await axios.post('/api/env/delete', { fileName, key });
      loadEnvVars();
    }
  };

  const handleEditorDidMount = (editor, monaco) => {
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      jsx: monaco.languages.typescript.JsxEmit.React,
      typeRoots: ['node_modules/@types'],
      allowJs: true,
      strict: true,
      esModuleInterop: true,
      experimentalDecorators: true,
      inlineSourceMap: true,
      inlineSources: true,
      importHelpers: true,
    });

    // Add Deno types
    fetch('/deno_types/lib.deno.d.ts')
      .then((response) => response.text())
      .then((denoTypes) => {
        monaco.languages.typescript.typescriptDefaults.addExtraLib(denoTypes, 'file:///node_modules/@types/deno/index.d.ts');
      });

    // Add support for dynamic imports
    monaco.languages.typescript.typescriptDefaults.addExtraLib(`
      declare module "https://*" {
        const mod: any;
        export default mod;
      }
      declare module "npm:*" {
        const mod: any;
        export default mod;
      }
    `, 'file:///dynamic-imports.d.ts');

    // Add type definitions for specific modules
    monaco.languages.typescript.typescriptDefaults.addExtraLib(`
      declare module "npm:node-telegram-bot-api" {
        export default class TelegramBot {
          constructor(token: string, options?: any);
          // Add more methods as needed
        }
      }
    `, 'file:///node-telegram-bot-api.d.ts');

    monaco.languages.typescript.typescriptDefaults.addExtraLib(`
      declare module "https://deno.land/std/path/mod.ts" {
        export function join(...paths: string[]): string;
        export function dirname(path: string): string;
        export function basename(path: string, ext?: string): string;
        export function extname(path: string): string;
        // Add more path functions as needed
      }
    `, 'file:///deno-std-path.d.ts');
  };

  React.useEffect(() => {
    loadFile();
    loadProcessInfo();
    loadFlags();
    loadEnvVars();
  }, [fileName]);

  React.useEffect(() => {
    if (processInfo) {
      loadLogs();
      const interval = setInterval(loadLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [processInfo]);

  React.useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  if (!fileName) {
    return (
      <div className="container mx-auto p-4">
        <h2 className="text-xl font-bold mb-2">Select a file to edit</h2>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-xl font-bold mb-4">Editor: {fileName}</h2>
      <Editor
        height="70vh"
        defaultLanguage="typescript"
        value={code}
        onChange={(value) => setCode(value)}
        onMount={handleEditorDidMount}
        options={{
          automaticLayout: true,
          scrollBeyondLastLine: false,
          // theme: localStorage.getItem('darkMode') === 'true' ? 'vs-dark' : 'light',
        }}
        
      />
      <div className="mt-4">
        <label className="inline-flex items-center">
          <input
            type="checkbox"
            checked={autostart}
            onChange={(e) => {
              setAutostart(() => e.target.checked);
              saveFlags({autostart: e.target.checked});
            }}
            className="form-checkbox"
          />
          <span className="ml-2">Autostart on Server Launch</span>
        </label>
      </div>
      <input
        type="text"
        placeholder="Deno flags (e.g., --allow-net)"
        className="border p-2 mt-2 w-full dark:bg-gray-800 dark:border-gray-700"
        value={flags}
        onChange={(e) => setFlags(e.target.value)}
        onBlur={saveFlags}
      />
      <div className="mt-4 flex space-x-2">
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded"
          onClick={deploy}
        >
          Save & Deploy
        </button>
        {processInfo && processInfo.status === 'running' && (
          <button
            className="px-4 py-2 bg-red-500 text-white rounded"
            onClick={stopProcess}
          >
            Stop Process
          </button>
        )}
        <button
          className="px-4 py-2 bg-gray-500 text-white rounded"
          onClick={() => navigate('/')}
        >
          Back to Home
        </button>
        <button
          className="px-4 py-2 bg-yellow-500 text-white rounded"
          onClick={() => setShowEnvVars(!showEnvVars)}
        >
          {showEnvVars ? 'Hide Env Vars' : 'Manage Env Vars'}
        </button>
      </div>
      {showEnvVars && (
        <div className="mt-4">
          <h3 className="text-lg font-bold">Environment Variables</h3>
          {Object.keys(envVars).map((key) => (
            <div key={key} className="flex items-center mb-2">
              <span className="w-1/4">{key}</span>
              <input
                type="text"
                className="border p-2 w-2/4 dark:bg-gray-800 dark:border-gray-700"
                value="********"
                disabled
              />
              <button
                className="ml-2 px-2 py-1 bg-red-500 text-white rounded"
                onClick={() => handleDeleteEnvVar(key)}
              >
                Delete
              </button>
            </div>
          ))}
          <div className="mt-2">
            <button
              className="px-2 py-1 bg-green-500 text-white rounded"
              onClick={handleAddEnvVar}
            >
              Add Variable
            </button>
            <button
              className="ml-2 px-2 py-1 bg-blue-500 text-white rounded"
              onClick={saveEnvVars}
            >
              Save Variables
            </button>
          </div>
        </div>
      )}
      {processInfo && (
        <div className="mt-8">
          <h3 className="text-lg font-bold mb-2">Logs for Process {processInfo.id}</h3>
          <div className="bg-black text-white p-4 rounded h-64 overflow-y-scroll">
            <pre>{logs}</pre>
            <div ref={logsEndRef} />
          </div>
          <label className="mt-2 inline-flex items-center">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="form-checkbox"
            />
            <span className="ml-2">Auto Scroll</span>
          </label>
        </div>
      )}
    </div>
  );
}

function Logs() {
  const { processId } = useParams();
  const [logs, setLogs] = React.useState('');
  const [autoScroll, setAutoScroll] = React.useState(true);
  const logsEndRef = React.useRef(null);

  const loadLogs = async () => {
    const response = await axios.get(`/api/processes/${processId}/logs`);
    setLogs(response.data.logs);
  };

  React.useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 2000);
    return () => clearInterval(interval);
  }, [processId]);

  React.useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-xl font-bold mb-2">Logs for Process {processId}</h2>
      <div className="bg-black text-white p-4 rounded h-100 overflow-y-scroll">
        <pre>{logs}</pre>
        <div ref={logsEndRef} />
      </div>
      <label className="mt-2 inline-flex items-center">
        <input
          type="checkbox"
          checked={autoScroll}
          onChange={(e) => setAutoScroll(e.target.checked)}
          className="form-checkbox"
        />
        <span className="ml-2">Auto Scroll</span>
      </label>
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <Router>
    <App />
  </Router>
);