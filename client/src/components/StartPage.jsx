import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, isMaintenance, lastStorybook } from '../api';
import { storybookPath } from '../storybook';
import Splash from './Splash';
import ConnectionNotice from './ConnectionNotice';

// "/" after login: opens the storybook used last on this device; otherwise the only one, or
// the choice page if there are several.
export default function StartPage() {
  const [target, setTarget] = useState(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.get('/api/books')
      .then(({ data: books }) => {
        if (cancelled) return;
        const last = lastStorybook();
        if (last && books.some((b) => b.id === last)) setTarget(storybookPath(last));
        else if (books.length === 1) setTarget(storybookPath(books[0].id));
        else setTarget('/books');
      })
      .catch((err) => {
        if (cancelled) return;
        // offline: go to the last storybook anyway (it shows its own notice and retries)
        if (!err.response && lastStorybook()) setTarget(storybookPath(lastStorybook()));
        else {
          setConnectionLost(true);
          setMaintenance(isMaintenance(err));
        }
      });
    return () => { cancelled = true; };
  }, [attempt]);

  if (target) return <Navigate to={target} replace />;
  return (
    <>
      <Splash visible={!connectionLost} />
      {connectionLost && (
        <ConnectionNotice
          text="die Storybooks konnten gerade nicht geladen werden."
          maintenance={maintenance}
          onRetry={() => { setConnectionLost(false); setAttempt((a) => a + 1); }}
        />
      )}
    </>
  );
}
