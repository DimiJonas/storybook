import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Login from './components/Login';
import StartPage from './components/StartPage';
import StorybookChooser from './components/StorybookChooser';
import StorybookLayout from './components/StorybookLayout';
import { lastStorybook } from './api';
import { storybookPath } from './storybook';
import { splashReady } from './splash';
import { checkSession, useSession } from './session';
import Splash from './components/Splash';

// Pages that need a login. While the app asks the server whether you're logged in (at start),
// the start screen stays.
const RequireLogin = ({ children }) => {
  const { status } = useSession();
  if (status === 'checking') return <Splash visible />;
  return status === 'in' ? children : <Navigate to="/login" replace />;
};

const LoginPage = () => {
  const { status } = useSession();
  if (status === 'checking') return <Splash visible />;
  return status === 'in' ? <Navigate to="/" replace /> : <Login />;
};

// Addresses from before there were several storybooks (/memory/5, /edit/5, /add – e.g. bookmarks
// or an older app version still open): continue in the last used storybook (or the first)
const OldAddress = ({ page }) => {
  const { id } = useParams();
  const book = lastStorybook() || 1;
  return <Navigate to={storybookPath(book, id ? `/${page}/${id}` : `/${page}`)} replace />;
};

// Pages:
//   /login               login
//   /                    opens the last used storybook (or the only one, or the choice)
//   /books               choose a storybook
//   /b/<id>/...          inside a storybook: home, add, edit/<memory>, memory/<memory>
function App() {
  // The start screen (see splash.js) may go away once the first page has been drawn and nothing
  // is loading. (Effects of the pages run before this one, so a loading page keeps it.)
  useEffect(() => {
    splashReady();
    checkSession();
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireLogin><StartPage /></RequireLogin>} />
        <Route path="/books" element={<RequireLogin><StorybookChooser /></RequireLogin>} />
        <Route path="/b/:bookId/*" element={<RequireLogin><StorybookLayout /></RequireLogin>} />
        <Route path="/memory/:id" element={<RequireLogin><OldAddress page="memory" /></RequireLogin>} />
        <Route path="/edit/:id" element={<RequireLogin><OldAddress page="edit" /></RequireLogin>} />
        <Route path="/add" element={<RequireLogin><OldAddress page="add" /></RequireLogin>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
