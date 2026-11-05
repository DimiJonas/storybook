// Shown when the server can't be reached (offline, server down) – or, with `maintenance`, when
// the storybook is switched to maintenance mode (the server answers 503)
export default function ConnectionNotice({
  onRetry,
  text = 'die Erinnerungen konnten gerade nicht geladen werden.',
  maintenance = false,
}) {
  return (
    <div className="container mx-auto px-4 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-2xl">
        <span>
          {maintenance
            ? '🔧 Storybook macht gerade eine kurze Pause – bitte versuch es später nochmal.'
            : `📡 Keine Verbindung – ${text}`}
        </span>
        <button
          onClick={onRetry}
          className="px-3 py-1 rounded-xl bg-amber-200 hover:bg-amber-300 transition font-medium"
        >
          Nochmal versuchen
        </button>
      </div>
    </div>
  );
}
