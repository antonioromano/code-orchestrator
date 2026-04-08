import { execFile } from 'child_process';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import { appendFile } from 'fs/promises';
import path from 'path';
import type { GitDiffResponse, GitFileStatusCode, GitFileStatusResponse, PatchSelectionRequest, PatchOperationResponse, CommitResponse, GitLogResponse, GitBranchesResponse, DiffFileResponse } from '@remote-orchestrator/shared';

function findGit(): string {
  try {
    return execSync('which git', { encoding: 'utf-8' }).trim();
  } catch {
    return 'git';
  }
}

const GIT_PATH = findGit();
const TIMEOUT_MS = 10_000;
const UNDO_TTL_MS = 30_000;

interface UndoEntry {
  patchText: string;
  folderPath: string;
  timer: ReturnType<typeof setTimeout>;
}

function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(GIT_PATH, args, { cwd, timeout: TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout);
    });
  });
}

// Like execGit but captures stderr for surfacing git hook/apply errors
function execGitWithStderr(args: string[], cwd: string, stdinData?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(GIT_PATH, args, { cwd, timeout: TIMEOUT_MS, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject({ message: err.message, stderr });
        return;
      }
      resolve({ stdout, stderr });
    });
    if (stdinData !== undefined && child.stdin) {
      child.stdin.write(stdinData);
      child.stdin.end();
    }
  });
}

interface ParsedHunk {
  header: string;
  oldStart: number;
  changes: string[]; // raw lines (may include +, -, space, \)
}

function parseHunks(diffText: string): ParsedHunk[] {
  const lines = diffText.split('\n');
  const hunks: ParsedHunk[] = [];
  let i = 0;

  // Skip file header lines (diff --git, index, ---, +++)
  while (i < lines.length && !lines[i].startsWith('@@')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
      const oldStart = match ? parseInt(match[1]) : 0;
      const changes: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('@@')) {
        if (lines[i] !== '') changes.push(lines[i]);
        i++;
      }
      hunks.push({ header: line, oldStart, changes });
    } else {
      i++;
    }
  }
  return hunks;
}

function buildPatchText(fileHeader: string, hunks: ParsedHunk[], selection: PatchSelectionRequest, mode: 'stage' | 'discard'): string {
  const patchLines: string[] = [fileHeader];
  let cumulativeDelta = 0;

  for (const chunkSel of selection.chunks) {
    const hunk = hunks[chunkSel.chunkIndex];
    if (!hunk) continue;

    const selectedSet = new Set(chunkSel.selectedChangeIndices);
    const processedLines: string[] = [];
    let normalCount = 0;
    let selectedAddCount = 0;
    let selectedDelCount = 0;
    let changeIndex = 0;
    let lastLineDropped = false;

    for (const rawLine of hunk.changes) {
      if (rawLine === '\\ No newline at end of file') {
        if (!lastLineDropped) processedLines.push(rawLine);
        lastLineDropped = false;
        continue;
      }
      lastLineDropped = false;
      const prefix = rawLine[0];
      if (prefix === '+') {
        if (selectedSet.has(changeIndex)) {
          processedLines.push(rawLine);
          selectedAddCount++;
        } else if (mode === 'stage') {
          // stage: unselected adds don't exist in the index, drop them
          lastLineDropped = true;
        } else {
          // discard: unselected adds exist in the working tree, keep as context
          processedLines.push(' ' + rawLine.slice(1));
          normalCount++;
        }
        changeIndex++;
      } else if (prefix === '-') {
        if (selectedSet.has(changeIndex)) {
          processedLines.push(rawLine);
          selectedDelCount++;
        } else if (mode === 'discard') {
          // discard: unselected dels don't exist in the working tree, drop them
          lastLineDropped = true;
        } else {
          // stage: unselected dels exist in the index, keep as context
          processedLines.push(' ' + rawLine.slice(1));
          normalCount++;
        }
        changeIndex++;
      } else {
        // Context line (space prefix or other)
        processedLines.push(rawLine);
        if (prefix === ' ') normalCount++;
      }
    }

    if (selectedAddCount === 0 && selectedDelCount === 0) continue; // nothing to patch in this hunk

    const oldCount = normalCount + selectedDelCount;
    const newCount = normalCount + selectedAddCount;
    const newStart = hunk.oldStart + cumulativeDelta;

    const match = hunk.header.match(/@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@(.*)/);
    const tail = match ? match[1] : '';
    const oldCountStr = oldCount === 1 ? '' : `,${oldCount}`;
    const newCountStr = newCount === 1 ? '' : `,${newCount}`;
    const hunkHeader = `@@ -${hunk.oldStart}${oldCountStr} +${newStart}${newCountStr} @@${tail}`;

    patchLines.push(hunkHeader);
    patchLines.push(...processedLines);

    cumulativeDelta += selectedAddCount - selectedDelCount;
  }

  // Ensure patch ends with newline
  const result = patchLines.join('\n');
  return result.endsWith('\n') ? result : result + '\n';
}

function extractFileHeader(diffText: string): string {
  const lines = diffText.split('\n');
  const headerLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('@@')) break;
    headerLines.push(line);
  }
  return headerLines.join('\n');
}

export class GitService {
  private undoBuffer = new Map<string, UndoEntry>();

  async isGitRepo(folderPath: string): Promise<boolean> {
    try {
      await execGit(['rev-parse', '--is-inside-work-tree'], folderPath);
      return true;
    } catch {
      return false;
    }
  }

  private async getBranchDiff(folderPath: string): Promise<string> {
    try {
      return await execGit(['diff', 'HEAD'], folderPath);
    } catch {
      return '';
    }
  }

  private async getUntrackedFiles(folderPath: string): Promise<string[]> {
    try {
      const output = await execGit(['ls-files', '--others', '--exclude-standard'], folderPath);
      return output.split('\n').map(l => l.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  async getDiff(folderPath: string): Promise<GitDiffResponse> {
    const isRepo = await this.isGitRepo(folderPath);
    if (!isRepo) {
      return { unstaged: '', staged: '', branch: '', untracked: [], error: 'Not a git repository' };
    }

    try {
      const [unstaged, staged, branch, untracked] = await Promise.all([
        execGit(['diff'], folderPath),
        execGit(['diff', '--cached'], folderPath),
        this.getBranchDiff(folderPath),
        this.getUntrackedFiles(folderPath),
      ]);
      return { unstaged, staged, branch, untracked };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get diff';
      return { unstaged: '', staged: '', branch: '', untracked: [], error: message };
    }
  }

  async getDiffForFile(folderPath: string, filePath: string, contextLines: number, source: 'unstaged' | 'staged' | 'branch'): Promise<DiffFileResponse> {
    const isRepo = await this.isGitRepo(folderPath);
    if (!isRepo) {
      return { diff: '', error: 'Not a git repository' };
    }

    // Cap context to prevent abuse
    const ctx = Math.min(Math.max(contextLines, 0), 200);

    try {
      const args = ['diff', `-U${ctx}`];
      if (source === 'staged') {
        args.push('--cached');
      } else if (source === 'branch') {
        args.push('HEAD');
      }
      args.push('--', filePath);

      const diff = await execGit(args, folderPath);
      return { diff };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get file diff';
      return { diff: '', error: message };
    }
  }

  async stagePatch(folderPath: string, selection: PatchSelectionRequest): Promise<PatchOperationResponse> {
    try {
      const diffArgs = selection.source === 'staged'
        ? ['diff', '--cached', '--', selection.filePath]
        : ['diff', '--', selection.filePath];
      const diffText = await execGit(diffArgs, folderPath);
      if (!diffText.trim()) {
        return { success: false, error: 'No diff found for this file' };
      }

      const hunks = parseHunks(diffText);
      const fileHeader = extractFileHeader(diffText);
      const patchText = buildPatchText(fileHeader, hunks, selection, 'stage');

      await execGitWithStderr(['apply', '--cached', '--whitespace=nowarn', '-'], folderPath, patchText);
      return { success: true };
    } catch (err) {
      const e = err as { message?: string; stderr?: string };
      return { success: false, error: e.stderr || e.message || 'Failed to stage patch' };
    }
  }

  async discardPatch(folderPath: string, selection: PatchSelectionRequest): Promise<PatchOperationResponse> {
    try {
      const diffText = await execGit(['diff', '--', selection.filePath], folderPath);
      if (!diffText.trim()) {
        return { success: false, error: 'No diff found for this file' };
      }

      const hunks = parseHunks(diffText);
      const fileHeader = extractFileHeader(diffText);
      const patchText = buildPatchText(fileHeader, hunks, selection, 'discard');

      await execGitWithStderr(['apply', '-R', '--whitespace=nowarn', '-'], folderPath, patchText);

      const undoId = randomUUID();
      const timer = setTimeout(() => {
        this.undoBuffer.delete(undoId);
      }, UNDO_TTL_MS);

      this.undoBuffer.set(undoId, { patchText, folderPath, timer });
      return { success: true, undoId };
    } catch (err) {
      const e = err as { message?: string; stderr?: string };
      return { success: false, error: e.stderr || e.message || 'Failed to discard patch' };
    }
  }

  async undoDiscard(undoId: string): Promise<PatchOperationResponse> {
    const entry = this.undoBuffer.get(undoId);
    if (!entry) {
      return { success: false, error: 'Undo window expired or not found' };
    }

    try {
      await execGitWithStderr(['apply', '--whitespace=nowarn', '-'], entry.folderPath, entry.patchText);
      clearTimeout(entry.timer);
      this.undoBuffer.delete(undoId);
      return { success: true };
    } catch (err) {
      const e = err as { message?: string; stderr?: string };
      return { success: false, error: e.stderr || e.message || 'Failed to undo discard' };
    }
  }

  async stageFile(folderPath: string, filePath: string): Promise<PatchOperationResponse> {
    try {
      await execGitWithStderr(['add', '--', filePath], folderPath);
      return { success: true };
    } catch (err) {
      const e = err as { message?: string; stderr?: string };
      return { success: false, error: e.stderr || e.message || 'Failed to stage file' };
    }
  }

  async unstageFile(folderPath: string, filePath: string): Promise<PatchOperationResponse> {
    try {
      await execGitWithStderr(['restore', '--staged', '--', filePath], folderPath);
      return { success: true };
    } catch (err) {
      const e = err as { message?: string; stderr?: string };
      return { success: false, error: e.stderr || e.message || 'Failed to unstage file' };
    }
  }

  async commit(folderPath: string, message: string, amend: boolean): Promise<CommitResponse> {
    try {
      const args = ['commit', '-m', message];
      if (amend) args.push('--amend');
      const { stdout } = await execGitWithStderr(args, folderPath);
      // Extract short hash from output like "[branch abc1234] message"
      const hashMatch = stdout.match(/\[.*? ([a-f0-9]+)\]/);
      return { success: true, commitHash: hashMatch?.[1] };
    } catch (err) {
      const e = err as { message?: string; stderr?: string };
      // Combine stdout/stderr for pre-commit hook failures
      const errorText = e.stderr || e.message || 'Commit failed';
      return { success: false, error: errorText };
    }
  }

  async push(folderPath: string): Promise<PatchOperationResponse> {
    try {
      await execGitWithStderr(['push'], folderPath);
      return { success: true };
    } catch (err) {
      const e = err as { message?: string; stderr?: string };
      return { success: false, error: e.stderr || e.message || 'Push failed' };
    }
  }

  async getLastCommit(folderPath: string): Promise<GitLogResponse> {
    try {
      const output = await execGit(['log', '-1', '--pretty=%B'], folderPath);
      return { lastMessage: output.trimEnd(), isFirstCommit: false };
    } catch {
      return { lastMessage: '', isFirstCommit: true };
    }
  }

  async hasChanges(folderPath: string): Promise<boolean> {
    try {
      const output = await execGit(['status', '--porcelain'], folderPath);
      return output.trim().length > 0;
    } catch {
      return false;
    }
  }

  async getBranches(folderPath: string): Promise<GitBranchesResponse> {
    try {
      const output = await execGit(['branch'], folderPath);
      const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
      let currentBranch = '';
      const branches: string[] = [];
      for (const line of lines) {
        if (line.startsWith('* ')) {
          const name = line.slice(2).trim();
          currentBranch = name;
          // Don't include detached HEAD as a selectable branch
          if (!name.startsWith('(')) {
            branches.push(name);
          }
        } else {
          branches.push(line);
        }
      }

      let behindCount: number | undefined;
      try {
        const countStr = await execGit(['rev-list', 'HEAD..@{u}', '--count'], folderPath);
        const n = parseInt(countStr.trim(), 10);
        if (!isNaN(n)) behindCount = n;
      } catch {
        // no upstream tracking branch — leave undefined
      }

      return { branches: branches.sort(), currentBranch, behindCount };
    } catch {
      return { branches: [], currentBranch: '' };
    }
  }

  async pull(folderPath: string): Promise<PatchOperationResponse> {
    try {
      await execGitWithStderr(['pull'], folderPath);
      return { success: true };
    } catch (err) {
      const e = err as { message?: string; stderr?: string };
      return { success: false, error: e.stderr || e.message || 'Pull failed' };
    }
  }

  async checkoutBranch(folderPath: string, branch: string): Promise<PatchOperationResponse> {
    try {
      await execGitWithStderr(['checkout', branch], folderPath);
      return { success: true };
    } catch (err) {
      const e = err as { message?: string; stderr?: string };
      return { success: false, error: e.stderr || e.message || 'Checkout failed' };
    }
  }

  async createBranch(folderPath: string, name: string, from?: string): Promise<PatchOperationResponse> {
    try {
      const args = from ? ['checkout', '-b', name, from] : ['checkout', '-b', name];
      await execGitWithStderr(args, folderPath);
      return { success: true };
    } catch (err) {
      const e = err as { message?: string; stderr?: string };
      return { success: false, error: e.stderr || e.message || 'Create branch failed' };
    }
  }

  async getFileStatuses(folderPath: string): Promise<GitFileStatusResponse> {
    const isRepo = await this.isGitRepo(folderPath);
    if (!isRepo) {
      return { statuses: {}, gitRoot: '' };
    }

    try {
      const [statusOutput, toplevel] = await Promise.all([
        execGit(['status', '--porcelain', '--ignored'], folderPath),
        execGit(['rev-parse', '--show-toplevel'], folderPath),
      ]);

      const gitRoot = toplevel.trim();
      const statuses: Record<string, GitFileStatusCode> = {};

      // Porcelain format: "XY PATH" where X=index status, Y=worktree status
      for (const line of statusOutput.split('\n')) {
        if (line.length < 4) continue;

        const xy = line.substring(0, 2);
        const filePart = line.substring(3);

        // Ignored files: "!! path"
        if (xy === '!!') {
          statuses[filePart] = '!!';
          continue;
        }

        // Untracked files: "?? path"
        if (xy === '??') {
          statuses[filePart] = '?';
          continue;
        }

        // Renames/copies: "R  old -> new" or "C  old -> new"
        const x = xy[0];
        const y = xy[1];

        let resolvedPath = filePart;
        if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
          const arrowIdx = filePart.indexOf(' -> ');
          if (arrowIdx !== -1) {
            resolvedPath = filePart.substring(arrowIdx + 4);
          }
          statuses[resolvedPath] = x === 'R' || y === 'R' ? 'R' : 'C';
          continue;
        }

        // Collapse the two-char XY into one code. We don't distinguish staged
        // vs unstaged, so prefer the more severe: D wins over everything.
        if (x === 'D' || y === 'D') {
          statuses[resolvedPath] = 'D';
        } else if (y !== ' ' && y !== '?') {
          statuses[resolvedPath] = y as GitFileStatusCode;
        } else if (x !== ' ' && x !== '?') {
          statuses[resolvedPath] = x as GitFileStatusCode;
        } else {
          statuses[resolvedPath] = 'M'; // fallback
        }
      }

      return { statuses, gitRoot };
    } catch {
      return { statuses: {}, gitRoot: '' };
    }
  }

  async addToGitignore(folderPath: string, filePath: string): Promise<PatchOperationResponse> {
    try {
      const gitignorePath = path.join(folderPath, '.gitignore');
      await appendFile(gitignorePath, `${filePath}\n`);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
