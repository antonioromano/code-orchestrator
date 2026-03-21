import { execFile } from 'child_process';
import { execSync } from 'child_process';
import type { GitDiffResponse } from '@remote-orchestrator/shared';

function findGit(): string {
  try {
    return execSync('which git', { encoding: 'utf-8' }).trim();
  } catch {
    return 'git';
  }
}

const GIT_PATH = findGit();
const TIMEOUT_MS = 10_000;

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

export class GitService {
  async isGitRepo(folderPath: string): Promise<boolean> {
    try {
      await execGit(['rev-parse', '--is-inside-work-tree'], folderPath);
      return true;
    } catch {
      return false;
    }
  }

  async getDiff(folderPath: string): Promise<GitDiffResponse> {
    const isRepo = await this.isGitRepo(folderPath);
    if (!isRepo) {
      return { unstaged: '', staged: '', error: 'Not a git repository' };
    }

    try {
      const [unstaged, staged] = await Promise.all([
        execGit(['diff'], folderPath),
        execGit(['diff', '--cached'], folderPath),
      ]);
      return { unstaged, staged };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get diff';
      return { unstaged: '', staged: '', error: message };
    }
  }
}
