import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { registerLocale } from 'react-datepicker';
import { de } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { Image as ImageIcon, Loader2, Plus } from 'lucide-react';
import MoodPicker from './MoodPicker';
import PhotoOrderGrid from './PhotoOrderGrid';
import PlacesField from './PlacesField';
import { DEFAULT_MOOD } from '../moods';
import { api } from '../api';
import { useStorybook } from '../storybook';
import { parseDate, toDateText, daysBetween, daysText } from '../dates';
import { coverPhoto } from '../photos';
import { boxStyle, possessive, usePeople } from '../people';

registerLocale('de', de);


const strings = {
  title: 'Titel',
  date: 'Datum',
  dateRange: 'Zeitraum',
  multiDay: 'Mehrere Tage',
  content: 'Text',
  photos: 'Fotos',
  addPhotos: 'Fotos hinzufügen',
  edit: '✨ Erinnerung bearbeiten',
  add: '✨ Erinnerung anlegen',
  cancel: 'Abbrechen',
};

// Your own perspective in the form, in your colour (only you can write or change it)
function PerspectiveField({ perspective, onChange, autoFocus }) {
  const { me } = usePeople();
  return (
    <div className="p-3 rounded-2xl border-2" style={boxStyle(me.color)} data-testid="perspective-field">
      <label className="block text-sm font-semibold text-gray-800 mb-1">Aus deiner Sicht</label>
      <textarea
        value={perspective.text}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        placeholder={perspective.original ? 'Leer lassen, um die Perspektive zu entfernen' : 'Wie hast du es erlebt?'}
        aria-label={`Perspektive von ${me.name}`}
        className="w-full p-3 border border-white/60 rounded-xl bg-white/80 min-h-28 focus:outline-hidden focus:ring-2 focus:ring-purple-400"
      />
    </div>
  );
}

// Someone else's perspective: shown for context, but only its author can change it
function OtherPerspective({ perspective }) {
  const { person } = usePeople();
  const author = person(perspective.author_id);
  return (
    <div className="p-3 rounded-2xl border-2 opacity-80" style={boxStyle(author.color)} data-testid="other-perspective">
      <div className="text-sm font-semibold text-gray-800 mb-1">
        Aus {possessive(author.name)} Sicht <span className="font-normal text-gray-500">– nur {author.name} kann sie ändern</span>
      </div>
      <p className="text-gray-700 whitespace-pre-wrap text-sm">{perspective.text}</p>
    </div>
  );
}

const dateInputClass =
  'w-full p-3 border border-purple-200 rounded-2xl shadow-inner bg-white/80 focus:outline-hidden focus:ring-2 focus:ring-purple-400';

const MemoryForm = ({ memories, recentMoods = [], onSuccess }) => {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [date, setDate] = useState(new Date());
  // "Mehrere Tage": the date field then selects a range, date = first day, endDate = last day
  const [multiDay, setMultiDay] = useState(false);
  const [endDate, setEndDate] = useState(null);
  // The memory's photos in their order: saved ones { key, id, filename } and newly chosen ones
  // { key, file, url, isNew } – see PhotoOrderGrid
  const [photos, setPhotos] = useState([]);
  // key of the cover photo ("Titelbild"), independent of the order. Whenever there are photos,
  // one of them is the cover (at first the first one); null without photos.
  const [coverKey, setCoverKey] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(''); // "Foto 2 von 5 wird hochgeladen …"
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const book = useStorybook();
  const [mood, setMood] = useState('');
  const [tagIds, setTagIds] = useState([]); // chosen tags (IDs from the storybook's tag list)
  const [placeIds, setPlaceIds] = useState([]); // its places, in order (IDs from the storybook's place list)
  const [imagesToDelete, setImagesToDelete] = useState([]);
  const { me } = usePeople();
  // Your own perspective: [] or [{ authorId, text, original }] – `original` is the saved text
  // ('' = new); it's only sent if it was changed. The others' are shown, but only their authors
  // can change them.
  const [perspectives, setPerspectives] = useState([]);
  const otherPerspectives = isEditing
    ? (memories?.find((c) => c.id === parseInt(id))?.perspectives ?? []).filter((p) => p.author_id !== me.id)
    : [];
  const [addedMine, setAddedMine] = useState(false);

  // A new memory that was already saved when uploading a photo failed: saving again updates
  // that memory instead of creating a second one
  const createdId = useRef(null);
  const newPhotoCount = useRef(0);

  // Preview addresses of newly chosen photos (created once per photo) are released when the
  // form closes, so big photos don't stay in memory
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => p.isNew && URL.revokeObjectURL(p.url)), []);

  const addPhotos = (files) => {
    const added = Array.from(files).map((file) => {
      newPhotoCount.current += 1;
      return { key: `new-${newPhotoCount.current}`, file, url: URL.createObjectURL(file), isNew: true };
    });
    setPhotos((prev) => [...prev, ...added]);
    setCoverKey((key) => key ?? added[0]?.key ?? null); // the first photo of a memory becomes its cover
  };

  // Saved photos are only marked here and deleted when saving; new ones are simply dropped
  const removePhoto = (photo) => {
    if (photo.isNew) URL.revokeObjectURL(photo.url);
    else setImagesToDelete((prev) => [...prev, photo.id]);
    const rest = photos.filter((p) => p.key !== photo.key);
    setPhotos(rest);
    // removing the cover: the first remaining photo becomes the cover
    if (photo.key === coverKey) setCoverKey(rest[0]?.key ?? null);
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setDate(new Date());
    setMultiDay(false);
    setEndDate(null);
    setPhotos([]);
    setCoverKey(null);
    setImagesToDelete([]);
    setError('');
    setIsSubmitting(false);
    setMood(DEFAULT_MOOD);
    setTagIds([]);
    setPlaceIds([]);
    setPerspectives([]);
    setAddedMine(false);
  };

  useEffect(() => {
    if (isEditing && memories) {
      const memory = memories.find((c) => c.id === parseInt(id));
      if (memory) {
        setTitle(memory.title);
        setContent(memory.content);
        setDate(parseDate(memory.date));
        setMultiDay(Boolean(memory.end_date));
        setEndDate(memory.end_date ? parseDate(memory.end_date) : null);
        setMood(memory.mood || DEFAULT_MOOD);
        setTagIds(memory.tag_ids || []);
        setPlaceIds(memory.place_ids || []);
        const mine = (memory.perspectives || []).find((p) => p.author_id === me.id);
        setPerspectives(mine ? [{ authorId: me.id, text: mine.text, original: mine.text }] : []);
        setAddedMine(false);
        setPhotos((memory.images || []).map((img) => ({ key: `saved-${img.id}`, id: img.id, filename: img.filename, placeId: img.place_id })));
        const cover = coverPhoto(memory); // the chosen one, or the first photo
        setCoverKey(cover ? `saved-${cover.id}` : null);
        setImagesToDelete([]);
      }
    } else {
      resetForm();
    }
  }, [id, memories, isEditing, me.id]);

  // Switching "Mehrere Tage" on or off keeps the first day; the last day is chosen anew
  const toggleMultiDay = (e) => {
    setMultiDay(e.target.checked);
    setEndDate(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date) return setError('Bitte wähle ein Datum.');
    if (multiDay && !endDate) return setError('Bitte wähle auch den letzten Tag aus.');
    setIsSubmitting(true);
    setError('');

    const base = `/api/books/${book.id}`;
    let memoryId = isEditing ? Number(id) : createdId.current;
    let failedPhoto = null;
    try {
      // end_date empty = a single day (also when first and last day are the same)
      const memory = {
        title,
        content,
        date: toDateText(date),
        end_date: multiDay && endDate ? toDateText(endDate) : null,
        mood,
        tag_ids: tagIds,
        place_ids: placeIds,
        perspectives: perspectives
          .filter((p) => p.text !== p.original)
          .map((p) => ({ author_id: p.authorId, text: p.text })),
      };

      // 1. the memory itself
      if (memoryId) {
        await api.put(`${base}/memories/${memoryId}`, memory);
      } else {
        memoryId = (await api.post(`${base}/memories`, memory)).data.id;
        createdId.current = memoryId;
      }
      // saved: if saving again (after a photo failed), only later changes are sent
      setPerspectives((list) => list.map((p) => ({ ...p, original: p.text })));

      // 2. new photos, one request each (keeps every request small, even with many big photos);
      //    each one becomes a saved photo in its place, so saving again never uploads it twice
      let current = photos;
      let cover = coverKey; // follows the cover photo when it gets a new key after uploading
      const newPhotos = current.filter((p) => p.isNew);
      for (const [index, photo] of newPhotos.entries()) {
        setProgress(`Foto ${index + 1} von ${newPhotos.length} wird hochgeladen …`);
        failedPhoto = photo;
        const formData = new FormData();
        formData.append('images', photo.file);
        formData.append('memoryId', memoryId);
        const { data } = await api.post(`${base}/upload`, formData);
        const saved = data.images[0];
        const savedKey = `saved-${saved.id}`;
        current = current.map((p) => (p.key === photo.key ? { key: savedKey, id: saved.id, filename: saved.filename } : p));
        URL.revokeObjectURL(photo.url);
        setPhotos(current);
        if (cover === photo.key) {
          cover = savedKey;
          setCoverKey(savedKey);
        }
      }
      failedPhoto = null;
      setProgress('');

      // 3. photos marked for deletion (before reloading, so they're gone right away)
      if (imagesToDelete.length > 0) {
        await Promise.all(imagesToDelete.map((imgId) => api.delete(`${base}/images/${imgId}`)));
        setImagesToDelete([]);
      }

      // 4. the order
      if (current.length > 1) {
        await api.put(`${base}/memories/${memoryId}/images/order`, { ids: current.map((p) => p.id) });
      }

      // 5. the cover photo (without photos there is none – deleting a photo clears it by itself)
      if (current.length > 0) {
        await api.put(`${base}/memories/${memoryId}/cover`, { imageId: current.find((p) => p.key === cover)?.id ?? null });
      }

      if (onSuccess) await onSuccess();
      navigate(book.path(`/memory/${memoryId}`));
    } catch (err) {
      console.error(err);
      const reason = err.response?.data?.error;
      setError(
        failedPhoto
          ? `Die Erinnerung ist gespeichert, aber das Foto „${failedPhoto.file.name}“ konnte nicht hochgeladen werden` +
            `${reason ? `: ${reason}` : '.'} Entferne es oder versuche es nochmal.`
          : reason || `Fehler beim ${isEditing ? 'Aktualisieren' : 'Anlegen'} der Erinnerung.`
      );
    } finally {
      setIsSubmitting(false);
      setProgress('');
    }
  };

  // Leaving without saving. If a new memory was already saved (and only a photo failed), the
  // memories are reloaded so it shows up.
  const cancel = () => {
    if (createdId.current && onSuccess) onSuccess();
    navigate(book.path(isEditing ? `/memory/${id}` : ''));
  };

  return (
    <motion.div
      className="max-w-2xl mx-auto p-8 rounded-3xl bg-linear-to-br from-purple-50 via-white to-rose-50 shadow-2xl border border-purple-100"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <h2 className="text-4xl font-bold text-purple-700 mb-8 drop-shadow-sm">
        {isEditing ? strings.edit : strings.add}
      </h2>

      {error && (
        <motion.div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-xl mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {error}
        </motion.div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-purple-800 mb-1">
            {strings.title}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-3 border border-purple-200 rounded-2xl shadow-inner bg-white/80 focus:outline-hidden focus:ring-2 focus:ring-purple-400"
            required
          />
        </div>

        {/* Date: one day, or with "Mehrere Tage" a range (tap the first, then the last day) */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-1">
            <label className="block text-sm font-medium text-purple-800">
              {multiDay ? strings.dateRange : strings.date}
            </label>
            <label className="flex items-center gap-2 text-sm text-purple-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={multiDay}
                onChange={toggleMultiDay}
                className="w-4 h-4 accent-purple-600"
              />
              {strings.multiDay}
            </label>
          </div>
          {multiDay ? (
            <DatePicker
              key="range"
              selectsRange
              selected={date}
              startDate={date}
              endDate={endDate}
              onChange={([first, last]) => {
                setDate(first);
                setEndDate(last);
              }}
              locale="de"
              dateFormat="dd.MM.yyyy"
              placeholderText="erster – letzter Tag"
              className={dateInputClass}
            />
          ) : (
            <DatePicker
              key="single"
              selected={date}
              onChange={(newDate) => setDate(newDate)}
              locale="de"
              dateFormat="dd.MM.yyyy"
              className={dateInputClass}
            />
          )}
          {multiDay && (
            <p className="text-xs text-purple-700/80 mt-1 ml-1">
              {date && endDate
                ? daysText(daysBetween(date, endDate) + 1)
                : 'Tippe im Kalender auf den ersten und dann auf den letzten Tag.'}
            </p>
          )}
        </div>

        {/* Mood Picker */}
        <div>
          <label className="block text-sm font-medium text-purple-800 mb-1">Mood</label>
          <MoodPicker value={mood} onChange={setMood} recent={recentMoods} />
        </div>
        {/* Tags (the list is edited under ⋮ → Tags bearbeiten) */}
        <div>
          <span className="block text-sm font-medium text-purple-800 mb-1">Tags</span>
          {book.tags.length === 0 ? (
            <p className="text-xs text-gray-500">Noch keine Tags – anlegen unter ⋮ → „Tags bearbeiten“.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tags">
              {book.tags.map((tag) => {
                const on = tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTagIds((ids) => (on ? ids.filter((x) => x !== tag.id) : [...ids, tag.id]))}
                    className={`px-3 py-1 rounded-full border text-sm font-medium transition ${
                      on ? 'bg-fuchsia-600 border-fuchsia-600 text-white' : 'bg-white border-fuchsia-200 text-fuchsia-800 hover:bg-fuchsia-50'
                    }`}
                  >
                    {on ? '✓ ' : ''}{tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Places (step 11) */}
        <PlacesField
          placeIds={placeIds}
          onChange={setPlaceIds}
          photoPlaceIds={photos.filter((p) => !p.isNew).map((p) => p.placeId)}
        />

        {/* Content */}
        <div>
          <label className="block text-sm font-medium text-purple-800 mb-1">
            {strings.content}
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full p-3 border border-purple-200 rounded-2xl shadow-inner bg-white/80 min-h-48 focus:outline-hidden focus:ring-2 focus:ring-purple-400"
            required
          />
        </div>

        {/* Perspectives: each person's own text about it ("Aus Annas Sicht"), in their colour.
            You write and change only your own; the others' are shown for context. */}
        <div>
          <span className="block text-sm font-medium text-purple-800 mb-1">Perspektiven</span>
          <div className="space-y-3">
            {otherPerspectives.map((p) => <OtherPerspective key={p.author_id} perspective={p} />)}
            {perspectives.map((p) => (
              <PerspectiveField
                key={p.authorId}
                perspective={p}
                autoFocus={addedMine && p.authorId === me.id}
                onChange={(text) => setPerspectives((list) => list.map((x) => (x.authorId === p.authorId ? { ...x, text } : x)))}
              />
            ))}
          </div>
          {me.id && !perspectives.some((p) => p.authorId === me.id) && (
            <button
              type="button"
              onClick={() => { setPerspectives((list) => [...list, { authorId: me.id, text: '', original: '' }]); setAddedMine(true); }}
              className="mt-2 flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-purple-300 text-sm font-medium text-purple-800 hover:border-purple-400 bg-white/70"
            >
              <Plus className="w-4 h-4" /> Meine Perspektive hinzufügen
            </button>
          )}
        </div>

        {/* Photos: one grid, saved and new ones, in their order; ⭐ chooses the cover photo */}
        <div>
          <label className="block text-sm font-medium text-purple-800 mb-1">{strings.photos}</label>
          {/* (not changeable while saving: the photos are being uploaded in this order) */}
          <div inert={isSubmitting} className={isSubmitting ? 'opacity-60' : ''}>
            <PhotoOrderGrid
              photos={photos}
              onChange={setPhotos}
              onRemove={removePhoto}
              bookId={book.id}
              coverKey={coverKey}
              onCoverChange={setCoverKey}
            />
          </div>
          <label className="mt-3 border-dashed border-2 border-purple-300 p-4 rounded-2xl flex items-center gap-3 bg-white/70 hover:border-purple-400 transition-colors cursor-pointer">
            <ImageIcon className="text-purple-500 shrink-0" />
            <span className="text-sm text-purple-800 font-medium">{strings.addPhotos}</span>
            <input
              type="file"
              onChange={(e) => {
                addPhotos(e.target.files);
                e.target.value = ''; // so the same photo can be chosen again after removing it
              }}
              className="sr-only"
              accept="image/*"
              multiple
            />
          </label>
        </div>

        {/* Buttons */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-linear-to-r from-purple-500 to-fuchsia-500 text-white p-3 rounded-2xl font-semibold shadow-lg hover:scale-[1.01] transition-transform disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="animate-spin w-4 h-4" />
                {progress || 'Speichere...'}
              </span>
            ) : isEditing ? '🎨 Erinnerung aktualisieren' : '🌸 Erinnerung hinzufügen'}
          </button>

          <button
            type="button"
            onClick={cancel}
            className="flex-1 bg-gray-100 text-gray-700 p-3 rounded-2xl font-semibold hover:bg-gray-200 transition-colors"
          >
            {strings.cancel}
          </button>
        </div>
      </form>
    </motion.div>
  );
};

export default MemoryForm;
