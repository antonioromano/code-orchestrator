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

  private async findDefaultBranch(folderPath: string): Promise<string | null> {
    // Try origin/HEAD first
    try {
      const ref = (await execGit(['rev-parse', '--abbrev-ref', 'origin/HEAD'], folderPath)).trim();
      if (ref && ref !== 'origin/HEAD') return ref;
    } catch { /* ignore */ }

    // Fallback: try common default branch names
    for (const branch of ['origin/main', 'origin/master', 'origin/develop']) {
      try {
        await execGit(['rev-parse', '--verify', branch], folderPath);
        return branch;
      } catch { /* ignore */ }
    }
    return null;
  }

  private async getBranchDiff(folderPath: string): Promise<string> {
    try {
      const defaultBranch = await this.findDefaultBranch(folderPath);
      if (!defaultBranch) return '';

      const mergeBase = (await execGit(['merge-base', 'HEAD', defaultBranch], folderPath)).trim();
      if (!mergeBase) return '';

      return await execGit(['diff', `${mergeBase}...HEAD`], folderPath);
    } catch {
      return '';
    }
  }

  async getDiff(folderPath: string): Promise<GitDiffResponse> {
    const isRepo = await this.isGitRepo(folderPath);
    if (!isRepo) {
      return { unstaged: '', staged: '', branch: '', error: 'Not a git repository' };
    }

    try {
      const [unstaged, staged, branch] = await Promise.all([
        execGit(['diff'], folderPath),
        execGit(['diff', '--cached'], folderPath),
        this.getBranchDiff(folderPath),
      ]);
      return { unstaged, staged, branch };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get diff';
      return { unstaged: '', staged: '', branch: '', error: message };
    }
  }
}
