import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Lock } from 'lucide-react';
import { API_URL } from '../config';
import { loggedIn } from '../session';


const HeaderTitle = "T & J Storybook";
const UserString = "Nutzername";
const PasswordString = "Passwort";

// "125" seconds -> "2:05"
const formatWait = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // "Angemeldet bleiben": 30 days, renewed while the app is used; otherwise the login ends when
  // the browser closes (at the latest after 24 h)
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // After too many failed attempts the server makes you wait: until when (ms timestamp)
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const navigate = useNavigate();

  const secondsLeft = Math.max(0, Math.ceil((waitUntil - now) / 1000));

  // Count down once per second while waiting
  useEffect(() => {
    if (!waitUntil) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= waitUntil) {
        setWaitUntil(0);
        setError('');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [waitUntil]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // the server answers with a login cookie (the browser keeps it; the app never sees it)
      await axios.post(`${API_URL}/api/login`, { username, password, remember });
      loggedIn();
      window.location.href = '/';
    } catch (err) {
      console.error('Login error:', err.response?.data || err.message);
      const status = err.response?.status;
      if (status === 429) {
        // from the backend (with the exact waiting time) or from nginx' rate limit (without)
        const seconds = Number(err.response.data?.retryAfter || err.response.headers?.['retry-after']) || 10;
        setNow(Date.now());
        setWaitUntil(Date.now() + seconds * 1000);
        setError('Zu viele Fehlversuche.');
      } else if (status === 503) {
        setError('Storybook macht gerade eine kurze Pause 🔧 Bitte versuch es später nochmal.');
      } else if (status === 401) {
        setError('Nutzername oder Passwort falsch.');
      } else {
        setError(err.response?.data?.error || 'Login fehlgeschlagen. Bitte versuche es nochmal.');
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-100 via-purple-200 to-purple-300 flex items-center justify-center px-4">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="backdrop-blur-lg bg-white/60 border border-purple-200 rounded-3xl shadow-2xl p-10 max-w-md w-full"
      >
        <h2 className="text-3xl font-extrabold text-center text-purple-700 mb-8 drop-shadow-sm">
          ✨ {HeaderTitle} ✨
        </h2>

        {error && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-sm mb-4 text-sm"
          >
            {error}
            {secondsLeft > 0 && <> Bitte warte noch {formatWait(secondsLeft)}.</>}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <label className="block text-purple-800 font-semibold mb-1">{UserString}</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 text-purple-400" size={18} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-purple-300 focus:outline-hidden focus:ring-2 focus:ring-purple-400 bg-white/80"
                required
              />
            </div>
          </div>

          <div className="relative">
            <label className="block text-purple-800 font-semibold mb-1">{PasswordString}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 text-purple-400" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-purple-300 focus:outline-hidden focus:ring-2 focus:ring-purple-400 bg-white/80"
                required
              />
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="mt-1 h-4 w-4 accent-purple-600"
            />
            <span className="text-sm text-purple-900">
              <span className="font-semibold">Angemeldet bleiben</span>
              <span className="block text-xs text-purple-700/80">30 Tage, solange du die App benutzt – nur auf deinen eigenen Geräten</span>
            </span>
          </label>

          <motion.button
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={isLoading || secondsLeft > 0}
            className={`w-full bg-purple-500 text-white font-bold py-2 rounded-xl transition-all duration-300 hover:bg-purple-600 active:scale-95 ${
              isLoading || secondsLeft > 0 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isLoading ? 'Logge ein...' : secondsLeft > 0 ? `⏳ ${formatWait(secondsLeft)}` : '🎉 Einloggen'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
};

export default Login;
