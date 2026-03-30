import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';

export class SleepPreventionService {
  private process: ChildProcess | null = null;

  start(): void {
    if (this.process) return;

    const platform = process.platform;

    if (platform === 'darwin') {
      this.process = spawn('caffeinate', ['-di'], { stdio: 'ignore' });
    } else if (platform === 'linux') {
      this.process = spawn(
        'systemd-inhibit',
        ['--what=idle', '--who=Argus', '--why=ngrok tunnel active', 'sleep', 'infinity'],
        { stdio: 'ignore' }
      );
    } else {
      // Windows and others: no-op
      return;
    }

    this.process.on('exit', () => {
      this.process = null;
    });
  }

  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  get active(): boolean {
    return this.process !== null;
  }
}
