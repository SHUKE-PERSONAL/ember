import { useEffect, useState } from 'react';
import ansiAsset from '../assets/SHUKE.ANS?url';
import { ansiStyleClass, parseAnsiScreen, type AnsiLine } from '../lib/ansi';

export function WelcomeScreen({ onEnter }: { onEnter: () => void }) {
  const [screen, setScreen] = useState<AnsiLine[] | null>(null);
  const [error, setError] = useState(false);

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
        <WelcomeAction onEnter={onEnter} disabled={!screen} />
      </section>
    </main>
  );
}

export function WelcomeAction({ onEnter, disabled }: { onEnter: () => void; disabled: boolean }) {
  return (
    <button type="button" className="bbs-enter" onClick={onEnter} disabled={disabled}>
      Enter the BBS
    </button>
  );
}
