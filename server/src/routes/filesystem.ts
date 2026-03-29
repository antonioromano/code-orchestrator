import express, { Router } from 'express';
import { execFile } from 'child_process';
import { readFile, stat, readdir } from 'fs/promises';
import path from 'path';
import { getPathCompletions } from '../utils/fsAutocomplete.js';
import { getDirectoryChildren } from '../utils/fsChildren.js';
import { atomicWrite } from '../utils/atomicWrite.js';
import type { SessionManager } from '../services/SessionManager.js';
import type { WriteFileRequest } from '@remote-orchestrator/shared';

const MAX_FILE_SIZE_BYTES = 512 * 1024; // 512 KB

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff', '.avif',
  '.svg', '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.pdf', '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.exe', '.bin', '.dylib', '.so', '.o', '.a', '.dll',
  '.pyc', '.db', '.sqlite', '.sqlite3',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.webm',
]);

export function createFilesystemRoutes(sessionManager: SessionManager): Router {
  const router = Router();

  router.get('/autocomplete', async (req, res) => {
    const pathQuery = req.query.path as string;

    if (!pathQuery) {
      res.json({ completions: [] });
      return;
    }

    const completions = await getPathCompletions(pathQuery);
    res.json({ completions });
  });

  router.get('/children', async (req, res) => {
    const dirPath = req.query.path as string | undefined;
    const includeFiles = req.query.includeFiles === 'true';
    const result = await getDirectoryChildren(dirPath, includeFiles);
    res.json(result);
  });

  router.get('/file', async (req, res) => {
    const rawPath = req.query.path as string;

    if (!rawPath) {
      res.status(400).json({ error: 'path query parameter required' });
      return;
    }

    // Security: reject relative paths; use resolve() to normalize // and ../ safely
    if (!path.isAbsolute(rawPath)) {
      res.status(400).json({ error: 'invalid path' });
      return;
    }
    const resolved = path.resolve(rawPath);

    const ext = path.extname(resolved).toLowerCase();

    if (BINARY_EXTENSIONS.has(ext)) {
      res.status(400).json({ error: 'binary', mimeType: `application/octet-stream` });
      return;
    }

    try {
      const fileStat = await stat(resolved);

      if (!fileStat.isFile()) {
        res.status(400).json({ error: 'not a file' });
        return;
      }

      const size = fileStat.size;
      let content: string;
      let truncated = false;

      if (size > MAX_FILE_SIZE_BYTES) {
        const buf = Buffer.alloc(MAX_FILE_SIZE_BYTES);
        const { open } = await import('fs/promises');
        const fd = await open(resolved, 'r');
        try {
          await fd.read(buf, 0, MAX_FILE_SIZE_BYTES, 0);
        } finally {
          await fd.close();
        }
        content = buf.toString('utf8');
        truncated = true;
      } else {
        content = await readFile(resolved, 'utf8');
      }

      const mimeType = getMimeType(ext);
      res.json({ content, encoding: 'utf8', mimeType, size, truncated, mtimeMs: fileStat.mtimeMs });
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        res.status(404).json({ error: 'file not found' });
      } else {
        res.status(500).json({ error: 'failed to read file' });
      }
    }
  });

  router.put('/file', express.json({ limit: '2mb' }), async (req, res) => {
    const { sessionId, path: rawPath, content, originalMtimeMs } = req.body as WriteFileRequest;

    if (!sessionId || !rawPath || typeof content !== 'string') {
      res.status(400).json({ error: 'sessionId, path, and content are required' });
      return;
    }

    if (!path.isAbsolute(rawPath)) {
      res.status(400).json({ error: 'invalid path' });
      return;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'session not found' });
      return;
    }

    const resolved = path.resolve(rawPath);
    if (!resolved.startsWith(session.folderPath + path.sep) && resolved !== session.folderPath) {
      res.status(403).json({ error: 'path is outside session working directory' });
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      res.status(400).json({ error: 'binary files cannot be written' });
      return;
    }

    try {
      // Conflict detection: check mtime if provided
      if (originalMtimeMs !== undefined) {
        try {
          const currentStat = await stat(resolved);
          if (Math.abs(currentStat.mtimeMs - originalMtimeMs) > 1) {
            res.json({ success: false, size: 0, mtimeMs: currentStat.mtimeMs, conflict: true });
            return;
          }
        } catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException).code;
          // File doesn't exist yet — allow write (new file)
          if (code !== 'ENOENT') throw err;
        }
      }

      await atomicWrite(resolved, content);
      const newStat = await stat(resolved);
      res.json({ success: true, size: newStat.size, mtimeMs: newStat.mtimeMs });
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EACCES' || code === 'EPERM') {
        res.status(403).json({ success: false, size: 0, mtimeMs: 0, error: 'permission denied' });
      } else {
        res.status(500).json({ success: false, size: 0, mtimeMs: 0, error: 'failed to write file' });
      }
    }
  });

  router.get('/search', async (req, res) => {
    const rootPath = req.query.path as string;
    const query = req.query.q as string;

    if (!rootPath || !query || !query.trim()) {
      res.json({ results: [], query: query ?? '' });
      return;
    }

    const resolved = path.resolve(rootPath);
    if (resolved !== rootPath) {
      res.status(400).json({ error: 'invalid path' });
      return;
    }

    const queryLower = query.toLowerCase();
    const EXCLUDED_SEARCH_DIRS = new Set([
      'node_modules', '.git', '__pycache__', 'dist', 'build',
      '.next', '.nuxt', '.cache', 'coverage', '.terraform',
    ]);
    const EXCLUDED_SEARCH_EXTS = new Set(['.map', '.lock', '.log']);

    const filenameSeen = new Set<string>();
    const filenameResults: { path: string; name: string; ext: string }[] = [];

    async function walk(dirPath: string, depth: number): Promise<void> {
      if (depth > 10 || filenameResults.length >= 50) return;
      let entries;
      try {
        entries = await readdir(dirPath, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (filenameResults.length >= 50) break;
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          if (EXCLUDED_SEARCH_DIRS.has(entry.name)) continue;
          await walk(entryPath, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (BINARY_EXTENSIONS.has(ext) || EXCLUDED_SEARCH_EXTS.has(ext)) continue;
          if (entry.name.toLowerCase().includes(queryLower)) {
            filenameSeen.add(entryPath);
            filenameResults.push({ path: entryPath, name: entry.name, ext });
          }
        }
      }
    }

    await walk(resolved, 0);

    // Content search via grep (best-effort)
    const contentResults: { path: string; name: string; ext: string }[] = [];
    await new Promise<void>((resolve) => {
      const excludeDirArgs = [...EXCLUDED_SEARCH_DIRS].flatMap(d => ['--exclude-dir', d]);
      execFile(
        'grep',
        ['-ril', query, resolved, ...excludeDirArgs],
        { timeout: 8000 },
        (_err, stdout) => {
          const lines = stdout ? stdout.trim().split('\n').filter(Boolean) : [];
          for (const line of lines) {
            if (filenameSeen.has(line)) continue;
            const ext = path.extname(line).toLowerCase();
            if (BINARY_EXTENSIONS.has(ext) || EXCLUDED_SEARCH_EXTS.has(ext)) continue;
            contentResults.push({ path: line, name: path.basename(line), ext });
            if (filenameResults.length + contentResults.length >= 50) break;
          }
          resolve();
        },
      );
    });

    const results = [
      ...filenameResults.map(r => ({ ...r, matchType: 'filename' as const })),
      ...contentResults.map(r => ({ ...r, matchType: 'content' as const })),
    ];

    res.json({ results, query });
  });

  router.post('/pick-folder', (_req, res) => {
    execFile('osascript', ['-e', 'POSIX path of (choose folder with prompt "Select project folder")'], (err, stdout) => {
      if (err) {
        // User cancelled or osascript error
        res.json({ path: null });
        return;
      }
      const folderPath = stdout.trim().replace(/\/$/, '');
      res.json({ path: folderPath });
    });
  });

  return router;
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.ts': 'text/typescript',
    '.tsx': 'text/typescript',
    '.js': 'text/javascript',
    '.jsx': 'text/javascript',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.css': 'text/css',
    '.html': 'text/html',
    '.xml': 'text/xml',
    '.py': 'text/x-python',
    '.rb': 'text/x-ruby',
    '.sh': 'text/x-sh',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.toml': 'text/x-toml',
    '.txt': 'text/plain',
  };
  return map[ext] ?? 'text/plain';
}
