import { useEffect, useState } from 'react';
import { api, ApiError, type ApiKeyMetadata, type CreateApiKeyInput, type User } from '../api';

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

export function Settings({ user, logout }: { user: User; logout: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [apiKeys, setApiKeys] = useState<ApiKeyMetadata[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(true);
  const [apiKeysLoadError, setApiKeysLoadError] = useState<string | null>(null);
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyScopes, setApiKeyScopes] = useState('');
  const [apiKeyExpiresAt, setApiKeyExpiresAt] = useState('');
  const [apiKeyBusy, setApiKeyBusy] = useState(false);
  const [revokingApiKeyId, setRevokingApiKeyId] = useState<string | null>(null);
  const [apiKeyMessage, setApiKeyMessage] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [oneTimeApiKey, setOneTimeApiKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setApiKeysLoading(true);
    void api.apiKeys()
      .then((response) => {
        if (!active) return;
        setApiKeys(response.apiKeys);
        setApiKeysLoadError(null);
      })
      .catch((err: unknown) => {
        if (active) setApiKeysLoadError(errorMessage(err, 'Could not load API keys.'));
      })
      .finally(() => {
        if (active) setApiKeysLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
      setError(errorMessage(err, 'Could not change password.'));
    } finally {
      setBusy(false);
    }
  };

  const submitApiKey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (apiKeyBusy) return;
    setApiKeyMessage(null);
    setApiKeyError(null);

    const name = apiKeyName.trim();
    if (!name) {
      setApiKeyError('API key name is required.');
      return;
    }

    const body: CreateApiKeyInput = { name };
    const scopes = apiKeyScopes.trim();
    if (scopes) body.scopes = scopes;
    if (apiKeyExpiresAt) body.expiresAt = apiKeyExpiresAt;

    setApiKeyBusy(true);
    try {
      const created = await api.createApiKey(body);
      const { key, ...metadata } = created;
      setApiKeys((current) => [metadata, ...current]);
      setOneTimeApiKey(key);
      setApiKeyName('');
      setApiKeyScopes('');
      setApiKeyExpiresAt('');
      setApiKeyMessage('API key created. Copy the secret now; it will not be shown again.');
    } catch (err) {
      setApiKeyError(errorMessage(err, 'Could not create API key.'));
    } finally {
      setApiKeyBusy(false);
    }
  };

  const revokeApiKey = async (id: string) => {
    const apiKey = apiKeys.find((candidate) => candidate.id === id);
    if (!apiKey || !window.confirm(`Revoke the API key “${apiKey.name}”?`)) return;

    setApiKeyMessage(null);
    setApiKeyError(null);
    setRevokingApiKeyId(id);
    try {
      await api.revokeApiKey(id);
      setApiKeys((current) => current.filter((candidate) => candidate.id !== id));
      setApiKeyMessage('API key revoked.');
    } catch (err) {
      setApiKeyError(errorMessage(err, 'Could not revoke API key.'));
    } finally {
      setRevokingApiKeyId(null);
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

      <section className="api-keys" aria-labelledby="api-keys-heading">
        <h3 id="api-keys-heading">API keys</h3>
        <p className="muted">
          API keys let external agents post on your behalf. The secret is shown only once when a key is created.
        </p>

        {oneTimeApiKey && (
          <aside className="api-key-secret" role="status">
            <h4>New API key — copy it now</h4>
            <p className="muted">This secret cannot be retrieved after you dismiss this message.</p>
            <input
              className="api-key-secret-value"
              aria-label="New API key, shown once"
              type="text"
              readOnly
              value={oneTimeApiKey}
              onFocus={(event) => event.currentTarget.select()}
              onClick={(event) => event.currentTarget.select()}
            />
            <button type="button" onClick={() => setOneTimeApiKey(null)}>
              Dismiss secret
            </button>
          </aside>
        )}

        <form className="api-key-form" onSubmit={submitApiKey}>
          <label htmlFor="api-key-name">Name</label>
          <input
            id="api-key-name"
            type="text"
            value={apiKeyName}
            onChange={(event) => setApiKeyName(event.target.value)}
            autoComplete="off"
            placeholder="HappyNotes sync"
          />
          <label htmlFor="api-key-scopes">Scopes (optional)</label>
          <input
            id="api-key-scopes"
            type="text"
            value={apiKeyScopes}
            onChange={(event) => setApiKeyScopes(event.target.value)}
            autoComplete="off"
            placeholder="posts:write,posts:read"
          />
          <label htmlFor="api-key-expires-at">Expires at (optional)</label>
          <input
            id="api-key-expires-at"
            type="datetime-local"
            value={apiKeyExpiresAt}
            onChange={(event) => setApiKeyExpiresAt(event.target.value)}
          />
          {apiKeyMessage && <p className="muted" role="status">{apiKeyMessage}</p>}
          {apiKeyError && <p className="error" role="alert">{apiKeyError}</p>}
          <button type="submit" disabled={apiKeyBusy}>
            {apiKeyBusy ? 'Creating…' : 'Create API key'}
          </button>
        </form>

        <h4>Existing keys</h4>
        {apiKeysLoading && <p className="muted">Loading API keys…</p>}
        {!apiKeysLoading && apiKeysLoadError && <p className="error" role="alert">{apiKeysLoadError}</p>}
        {!apiKeysLoading && !apiKeysLoadError && apiKeys.length === 0 && (
          <p className="muted">No API keys yet.</p>
        )}
        {!apiKeysLoading && !apiKeysLoadError && apiKeys.length > 0 && (
          <ul className="api-key-list">
            {apiKeys.map((apiKey) => (
              <li className="api-key-row" key={apiKey.id}>
                <div className="api-key-details">
                  <strong>{apiKey.name}</strong>
                  <span>Scopes: {apiKey.scopes || 'None'}</span>
                  <span>Expires: {formatDate(apiKey.expiresAt)}</span>
                  <span>Last used: {formatDate(apiKey.lastUsedAt)}</span>
                  <span>Created: {formatDate(apiKey.createdAt)}</span>
                </div>
                <button
                  type="button"
                  className="api-key-revoke"
                  disabled={revokingApiKeyId !== null}
                  onClick={() => void revokeApiKey(apiKey.id)}
                >
                  {revokingApiKeyId === apiKey.id ? 'Revoking…' : 'Revoke'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
