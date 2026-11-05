import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { api, isMaintenance, isServerUnreachable, rememberStorybook } from '../api';
import { storybookPath } from '../storybook';
import Splash from './Splash';
import ConnectionNotice from './ConnectionNotice';
import { logout } from '../session';


// "/books": choose a storybook (a card per storybook)
export default function StorybookChooser() {
  const [books, setBooks] = useState(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setConnectionLost(false);
    api.get('/api/books')
      .then(({ data }) => setBooks(data))
      .catch((err) => {
        if (isServerUnreachable(err)) {
          setConnectionLost(true);
          setMaintenance(isMaintenance(err));
        }
      });
  };
  useEffect(() => {
    document.title = 'Storybook';
    load();
  }, []);

  const open = (id) => {
    rememberStorybook(id);
    navigate(storybookPath(id));
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-100 via-purple-200 to-purple-300">
      <Splash visible={!books && !connectionLost} />
      {connectionLost && (
        <ConnectionNotice text="die Storybooks konnten gerade nicht geladen werden." maintenance={maintenance} onRetry={load} />
      )}
      {books && (
        <div className="container mx-auto px-4 py-12 max-w-3xl">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-extrabold text-purple-700 drop-shadow-sm">📚 Welches Storybook?</h1>
            <button onClick={logout} className="text-sm text-purple-700 hover:text-purple-900 transition">
              <LogOut className="inline w-4 h-4 mr-1" /> Logout
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {books.map((book, index) => (
              <motion.button
                key={book.id}
                onClick={() => open(book.id)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(index, 5) * 0.05 }}
                className="text-left p-6 rounded-3xl bg-white/70 backdrop-blur-sm border border-purple-200 shadow-xl hover:bg-white hover:scale-[1.02] transition"
              >
                <div className="text-4xl mb-3">📖</div>
                <div className="text-xl font-bold text-purple-800">{book.name}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {book.memories === 1 ? '1 Erinnerung' : `${book.memories} Erinnerungen`}
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
