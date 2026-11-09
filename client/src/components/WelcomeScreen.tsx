import { useEffect, useState } from 'react';
import ansiAsset from '../assets/SHUKE.ANS?url';
import { ansiStyleClass, parseAnsiScreen, type AnsiLine } from '../lib/ansi';

export const WELCOME_TRANSITION_DELAY_MS = 1500;

export function WelcomeScreen({
  onEnter,
  onBrowse,
}: {
  onEnter: () => void;
  onBrowse?: () => void;
}) {
  const [screen, setScreen] = useState<AnsiLine[] | null>(null);
  const [error, setError] = useState(false);
  const [actionSelected, setActionSelected] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch(ansiAsset)
      .then((response) => {
        if (!response.ok) throw new Error(`ANSI asset returned ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (mounted) setScreen(parseAnsiScreen(new Uint8Array(buffer)));
      })
      .catch(() => {
        if (mounted) setError(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!screen || error || actionSelected) return;

    const timeout = window.setTimeout(
      onBrowse ?? onEnter,
      WELCOME_TRANSITION_DELAY_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [actionSelected, error, onEnter, onBrowse, screen]);

  const enterAuth = () => {
    setActionSelected(true);
    onEnter();
  };

  const enterBrowse = () => {
    setActionSelected(true);
    onBrowse?.();
  };

  return (
    <main className="bbs-landing">
      <section className="bbs-console" aria-labelledby="bbs-title">
        <h1 id="bbs-title" className="sr-only">
          Shuke Computer Info BBS
        </h1>
        {screen ? (
          <pre className="bbs-screen" aria-label="Shuke Computer Info BBS welcome screen">
            {screen.map((line, lineIndex) => (
              <span className="bbs-line" key={lineIndex}>
                {line.map((cell, cellIndex) => (
                  <span className={ansiStyleClass(cell.style)} key={cellIndex}>
                    {cell.character}
                  </span>
                ))}
                {'\n'}
              </span>
            ))}
          </pre>
        ) : (
          <p className="bbs-status">{error ? 'Welcome screen unavailable.' : 'Loading welcome screen…'}</p>
        )}
        <div className="bbs-actions">
          <button type="button" onClick={enterAuth}>Log in or register</button>
          {onBrowse && (
            <button type="button" className="link" onClick={enterBrowse}>
              Browse without an account
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
