import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, CalendarHeart, GitCommitVertical, Images, Library, LogOut, Map as MapIcon, MapPin, Menu, MoreVertical, Pencil, Settings, Smile, Tag } from 'lucide-react';
import { useStorybook } from '../storybook';
import { filterSuffix } from '../viewState';
import { usePeople } from '../people';
import { logout } from '../session';

// The bar at the top of a storybook: ☰ (the views: Zeitstrahl, Fotos, Karte, Unser Jahr), the name
// (back to the timeline) and ⋮ (Kapitel, Tags, rename, settings, logout, ...).

// Closes a menu when tapping somewhere outside of `ref`
const useCloseOutside = (ref, open, close) => {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) close(); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [ref, open, close]);
};

// ☰: switch between the views. Search and filters are kept (they're in the address) – except for
// "Unser Jahr", the list of the yearly reviews, which always look at the whole year.
const VIEWS = [
  { page: '', label: 'Zeitstrahl', Icon: GitCommitVertical },
  { page: '/fotos', label: 'Fotos', Icon: Images },
  { page: '/karte', label: 'Karte', Icon: MapIcon },
  { page: '/jahre', label: 'Unser Jahr', Icon: CalendarHeart, noFilters: true, also: '/jahr/' },
];

function ViewMenu() {
  const book = useStorybook();
  const { pathname, search } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = React.useCallback(() => setOpen(false), []);
  useCloseOutside(ref, open, close);
  const suffix = filterSuffix(new URLSearchParams(search));
  const isCurrent = (page, also) =>
    pathname.replace(/\/$/, '') === book.path(page) || Boolean(also && pathname.startsWith(book.path(also)));

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-white hover:text-purple-200 transition-colors flex"
        aria-label="Ansicht wählen"
        aria-expanded={open}
      >
        <Menu className="w-6 h-6" />
      </button>
      {open && (
        <nav className="absolute left-0 mt-2 z-50 bg-white/95 backdrop-blur-md shadow-xl rounded-2xl w-52 border border-purple-200 overflow-hidden" aria-label="Ansichten">
          {VIEWS.map(({ page, label, Icon, noFilters, also }) => {
            const current = isCurrent(page, also);
            return (
              <Link
                key={label}
                to={book.path(page) + (noFilters ? '' : suffix)}
                onClick={close}
                aria-current={current ? 'page' : undefined}
                className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm transition ${
                  current ? 'bg-purple-100 text-purple-800 font-semibold' : 'text-gray-700 hover:bg-purple-50'
                }`}
              >
                <Icon className="w-4 h-4" /> {label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

const Header = () => {
  const book = useStorybook();
  const { me } = usePeople();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameError, setRenameError] = useState('');
  const menuRef = useRef(null);

  // close the menu when tapping somewhere else
  const closeMenu = React.useCallback(() => { setIsMenuOpen(false); setRenaming(false); }, []);
  useCloseOutside(menuRef, isMenuOpen, closeMenu);

  const handleLogout = () => logout();

  const startRenaming = () => {
    setNewName(book.name);
    setRenameError('');
    setRenaming(true);
  };

  const saveName = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return setRenameError('Bitte einen Namen eingeben.');
    try {
      await book.rename(name);
      setRenaming(false);
      setIsMenuOpen(false);
    } catch (err) {
      setRenameError(err.response?.data?.error || 'Umbenennen hat nicht geklappt.');
    }
  };

  const itemClass = 'block w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-purple-100 transition';

  return (
    <header className="bg-linear-to-r from-purple-500 via-pink-400 to-rose-400 shadow-lg z-40 rounded-b-3xl">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ViewMenu />
          <Link
            to={book.path()}
            className="text-white font-extrabold text-xl md:text-3xl tracking-tight hover:text-rose-100 transition-colors truncate"
          >
            💖 {book.name}
          </Link>
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => { setIsMenuOpen(!isMenuOpen); setRenaming(false); }}
            className="text-white hover:text-purple-200 transition-colors"
            aria-label="Menü"
          >
            <MoreVertical className="w-6 h-6" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-2 z-50 bg-white/95 backdrop-blur-md shadow-xl rounded-2xl w-64 border border-purple-200 overflow-hidden">
              {renaming ? (
                <form onSubmit={saveName} className="p-3 space-y-2">
                  <label className="block text-xs font-medium text-purple-800">Name des Storybooks</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={100}
                    autoFocus
                    className="w-full p-2 border border-purple-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-400"
                  />
                  {renameError && <div className="text-xs text-red-600">{renameError}</div>}
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 bg-purple-500 text-white text-sm py-1.5 rounded-xl hover:bg-purple-600 transition">
                      Speichern
                    </button>
                    <button type="button" onClick={() => setRenaming(false)} className="flex-1 bg-gray-100 text-gray-700 text-sm py-1.5 rounded-xl hover:bg-gray-200 transition">
                      Abbrechen
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {me.id && (
                    <div className="px-4 py-2 text-xs text-gray-500 border-b border-purple-100" data-testid="logged-in-as">
                      Angemeldet als <span className="font-semibold text-gray-700">{me.name}</span>
                    </div>
                  )}
                  {book.storybookCount > 1 && (
                    <Link to="/books" className={itemClass} onClick={() => setIsMenuOpen(false)}>
                      <BookOpen className="inline w-4 h-4 mr-2" />
                      Storybook wechseln
                    </Link>
                  )}
                  <Link to={book.path('/kapitel')} className={itemClass} onClick={() => setIsMenuOpen(false)}>
                    <Library className="inline w-4 h-4 mr-2" />
                    Kapitel bearbeiten
                  </Link>
                  <Link to={book.path('/tags')} className={itemClass} onClick={() => setIsMenuOpen(false)}>
                    <Tag className="inline w-4 h-4 mr-2" />
                    Tags bearbeiten
                  </Link>
                  <Link to={book.path('/orte')} className={itemClass} onClick={() => setIsMenuOpen(false)}>
                    <MapPin className="inline w-4 h-4 mr-2" />
                    Orte bearbeiten
                  </Link>
                  <Link to={book.path('/stimmungen')} className={itemClass} onClick={() => setIsMenuOpen(false)}>
                    <Smile className="inline w-4 h-4 mr-2" />
                    Stimmungen bearbeiten
                  </Link>
                  <button onClick={startRenaming} className={itemClass}>
                    <Pencil className="inline w-4 h-4 mr-2" />
                    Storybook umbenennen
                  </button>
                  <Link to={book.path('/einstellungen')} className={itemClass} onClick={() => setIsMenuOpen(false)}>
                    <Settings className="inline w-4 h-4 mr-2" />
                    Einstellungen
                  </Link>
                  <button onClick={handleLogout} className={itemClass}>
                    <LogOut className="inline w-4 h-4 mr-2" />
                    Logout
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
