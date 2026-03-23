import { useState } from 'react';
import { FolderTree } from './FolderTree.js';
import { api } from '../services/api.js';

interface CreateSessionModalProps {
  onClose: () => void;
  onCreate: (folderPath: string, name?: string) => Promise<void>;
  theme: 'dark' | 'light';
  initialFolderPath?: string | null;
}

export function CreateSessionModal({ onClose, onCreate, theme, initialFolderPath }: CreateSessionModalProps) {
  const [folderPath, setFolderPath] = useState(initialFolderPath || '');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [picking, setPicking] = useState(false);
  const isDark = theme === 'dark';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderPath.trim()) {
      setError('Folder path is required');
      return;
    }

    setCreating(true);
    setError('');

    try {
      await onCreate(folderPath.trim(), name.trim() || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const handlePickFolder = async () => {
    setPicking(true);
    try {
      const path = await api.pickFolder();
      if (path) {
        setFolderPath(path);
      }
    } catch {
      setError('Failed to open folder picker');
    } finally {
      setPicking(false);
    }
  };

  const preventDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
      onDragOver={preventDrag}
      onDrop={preventDrag}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: isDark ? '#24283b' : '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          width: '560px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <h2
          style={{
            margin: '0 0 20px 0',
            fontSize: '18px',
            fontWeight: 600,
            color: isDark ? '#c0caf5' : '#343b58',
          }}
        >
          New Session
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '13px',
                fontWeight: 500,
                color: isDark ? '#a9b1d6' : '#565c73',
              }}
            >
              Project Folder
            </label>

            {!folderPath ? (
              <>
                <button
                  type="button"
                  onClick={handlePickFolder}
                  disabled={picking}
                  style={{
                    width: '100%',
                    padding: '8px 14px',
                    fontSize: '13px',
                    border: `1px solid ${isDark ? '#3b4261' : '#c0c0c0'}`,
                    borderRadius: '6px',
                    background: isDark ? '#1a1b26' : '#ffffff',
                    color: isDark ? '#7aa2f7' : '#3b5998',
                    cursor: picking ? 'wait' : 'pointer',
                    marginBottom: '8px',
                    textAlign: 'left',
                    fontWeight: 500,
                  }}
                >
                  {picking ? 'Opening...' : 'Choose Folder from System...'}
                </button>

                <FolderTree onSelect={setFolderPath} theme={theme} />
              </>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  fontFamily: 'Menlo, Monaco, monospace',
                  color: isDark ? '#7aa2f7' : '#3b5998',
                  background: isDark ? '#1a1b26' : '#f0f4ff',
                  borderRadius: '4px',
                }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {folderPath}
                </span>
                <button
                  type="button"
                  onClick={() => setFolderPath('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: isDark ? '#565f89' : '#8b8fa3',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '0 2px',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                  title="Change folder"
                >
                  {'\u2715'}
                </button>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '6px',
                fontSize: '13px',
                fontWeight: 500,
                color: isDark ? '#a9b1d6' : '#565c73',
              }}
            >
              Session Name (optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Defaults to folder name"
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '14px',
                border: `1px solid ${isDark ? '#3b4261' : '#c0c0c0'}`,
                borderRadius: '6px',
                background: isDark ? '#1a1b26' : '#ffffff',
                color: isDark ? '#c0caf5' : '#343b58',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div
              style={{
                marginBottom: '16px',
                padding: '8px 12px',
                background: isDark ? '#3b2030' : '#fee2e2',
                color: '#f7768e',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: `1px solid ${isDark ? '#3b4261' : '#c0c0c0'}`,
                borderRadius: '6px',
                background: 'transparent',
                color: isDark ? '#a9b1d6' : '#565c73',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                border: 'none',
                borderRadius: '6px',
                background: '#7aa2f7',
                color: '#ffffff',
                cursor: creating ? 'not-allowed' : 'pointer',
                opacity: creating ? 0.6 : 1,
                fontWeight: 500,
              }}
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
