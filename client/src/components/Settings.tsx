import { useState } from 'react';
import { api, ApiError, type User } from '../api';

export function Settings({ user, logout }: { user: User; logout: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setMessage(null);
    setError(null);

    if (!currentPassword.trim() || !newPassword.trim()) {
      setError('Current and new passwords are required.');
      return;
    }
    if (newPassword !== confirmation) {
      setError('New passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setMessage('Password changed successfully.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'could not change password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app">
      <header className="topbar">
        <h1><a href="/" className="brand-link">Ember</a></h1>
        <nav className="who">
          <a href="/search">Search</a>
          <a href="/messages">Messages</a>
          <a href="/settings">Settings</a>
          <a className="handle profile-link" href={`/@${encodeURIComponent(user.handle)}`}>
            @{user.handle}
          </a>
          <button type="button" className="link" onClick={logout}>Log out</button>
        </nav>
      </header>

      <a className="back-link" href="/">← Home</a>
      <h2 className="section-title">Settings</h2>
      <form className="settings-form" onSubmit={submit}>
        <label htmlFor="current-password">Current password</label>
        <input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
        />
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
        />
        <label htmlFor="confirm-password">Confirm new password</label>
        <input
          id="confirm-password"
          type="password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="new-password"
        />
        {message && <p className="muted" role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </main>
  );
}
