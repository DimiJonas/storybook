import React, { lazy, Suspense, useEffect, useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { fallbackToOriginal, imageUrl } from '../../config';
import { memoryDateText } from '../../dates';
import { coverPhoto } from '../../photos';
import { memoriesText } from '../../phases';
import { boxStyle } from '../../people';
import { useStorybook } from '../../storybook';
import { comparisonText, MONTHS, reviewYears, yearReview } from '../../yearReview';
import PhotoViewer, { usePhotoParam } from '../PhotoViewer';
import { photosText } from '../photos/PhotosPage';
import { yearAnchor } from '../home/TimelineNav';
import MoodBadge from '../MoodBadge';
import { DEFAULT_MOOD } from '../../moods';
// the small map (and its library) only downloads when the year has places
const PlacesMiniMap = lazy(() => import('../map/PlacesMiniMap'));

// "/b/<id>/jahr/<year>": "Unser Jahr" – the review of one year (worked out in yearReview.js):
// the numbers (compared with the year before), the highlights (👑), month by month, the places,
// what each of you wrote, and the photos of the year. ‹ › go to the next older/newer year.

const Section = ({ title, children, testId }) => (
  <section className="mt-10" data-testid={testId}>
    <h2 className="text-xl font-bold text-purple-700 mb-4">{title}</h2>
    {children}
  </section>
);

// one photo as a square tile (thumbnail, the original if that's missing)
function Thumb({ image, className = '' }) {
  const book = useStorybook();
  return (
    <img
      src={imageUrl(book.id, image.filename, 'thumb')}
      onError={fallbackToOriginal(book.id, image.filename)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`w-full h-full object-cover ${className}`}
    />
  );
}

function Stat({ label, value, before, year, testId }) {
  return (
    <div className="rounded-2xl bg-white/80 border border-purple-100 shadow p-4" data-testid={testId}>
      <div className="text-3xl font-extrabold text-purple-700">{value}</div>
      <div className="text-sm text-gray-600">{label}</div>
      {before !== undefined && <div className="text-xs text-gray-400 mt-1" data-testid="comparison">{comparisonText(value, before, year)}</div>}
    </div>
  );
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function YearPage({ memories }) {
  const book = useStorybook();
  const navigate = useNavigate();
  const year = Number(useParams().year);
  const years = useMemo(() => reviewYears(memories).map((y) => y.year), [memories]);
  const review = useMemo(
    () => (Number.isInteger(year) ? yearReview(memories, year, { users: book.users, places: book.places }) : null),
    [memories, year, book.users, book.places]
  );
  const older = years.find((y) => y < year);
  const newer = [...years].reverse().find((y) => y > year);
  const { openId, open, show, close } = usePhotoParam();

  useEffect(() => { window.scrollTo({ top: 0 }); }, [year]);

  if (!review) {
    // nothing loaded at all (e.g. no connection – the notice above explains it)
    if (memories.length === 0) return null;
    // a year without memories: to the list of years
    return <Navigate to={book.path('/jahre')} replace />;
  }

  const { numbers, previous } = review;
  const openMemory = (memory) => navigate(book.path(`/memory/${memory.id}`), { state: { from: 'jahr', year } });
  const viewerIndex = openId ? review.photos.findIndex((p) => p.image.id === openId) : -1;
  const yearLink = (y) => book.path(`/jahr/${y}`);

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <div className="flex items-center justify-between gap-2 mb-4 text-sm">
        <Link to={book.path(`#${yearAnchor(year)}`)} className="flex items-center text-purple-600 hover:text-purple-800">
          <ChevronLeft className="w-5 h-5 mr-0.5" /> Zum Zeitstrahl
        </Link>
        <Link to={book.path('/jahre')} className="text-purple-600 hover:text-purple-800 font-semibold">Alle Jahre</Link>
      </div>

      {/* the year, with ‹ › to the years around it */}
      <div className="rounded-3xl bg-linear-to-br from-purple-600 via-fuchsia-500 to-pink-400 text-white shadow-xl px-4 py-6 sm:py-8 flex items-center justify-between gap-2">
        {older ? (
          <Link to={yearLink(older)} className="p-2 rounded-full hover:bg-white/20" aria-label={`Unser Jahr ${older}`} title={String(older)}>
            <ChevronLeft className="w-7 h-7" />
          </Link>
        ) : <span className="w-11" />}
        <div className="text-center">
          <div className="text-sm sm:text-base uppercase tracking-widest opacity-90">Unser Jahr</div>
          <h1 className="text-5xl sm:text-6xl font-extrabold drop-shadow" data-testid="year-title">{year}</h1>
        </div>
        {newer ? (
          <Link to={yearLink(newer)} className="p-2 rounded-full hover:bg-white/20" aria-label={`Unser Jahr ${newer}`} title={String(newer)}>
            <ChevronRight className="w-7 h-7" />
          </Link>
        ) : <span className="w-11" />}
      </div>

      {/* the numbers */}
      <Section title="In Zahlen" testId="year-numbers">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label={numbers.memories === 1 ? 'Erinnerung' : 'Erinnerungen'} value={numbers.memories} before={previous?.memories} year={year} testId="number-memories" />
          <Stat label={numbers.photos === 1 ? 'Foto' : 'Fotos'} value={numbers.photos} before={previous?.photos} year={year} testId="number-photos" />
          <Stat label={numbers.places === 1 ? 'Ort' : 'Orte'} value={numbers.places} before={previous?.places} year={year} testId="number-places" />
          <Stat label={numbers.days === 1 ? 'Tag mit Erinnerungen' : 'Tage mit Erinnerungen'} value={numbers.days} before={previous?.days} year={year} testId="number-days" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div className="rounded-2xl bg-white/80 border border-purple-100 shadow p-4" data-testid="year-moods">
            <div className="text-sm text-gray-600 mb-1">Eure häufigsten Stimmungen</div>
            {review.moods.length ? (
              <div className="flex flex-wrap gap-4">
                {review.moods.map(({ mood, count }) => (
                  <span key={mood} className="text-2xl">{mood}<span className="text-sm text-gray-500 ml-1">×{count}</span></span>
                ))}
              </div>
            ) : <div className="text-sm text-gray-400">Keine Stimmungen gewählt</div>}
          </div>
          <div className="rounded-2xl bg-white/80 border border-purple-100 shadow p-4" data-testid="busiest-month">
            <div className="text-sm text-gray-600 mb-1">Der vollste Monat</div>
            <div className="text-2xl font-bold text-purple-700">
              {MONTHS[review.busiestMonth.month]} <span className="text-sm font-normal text-gray-500">· {memoriesText(review.busiestMonth.count)}</span>
            </div>
          </div>
        </div>
      </Section>

      {/* the highlights (👑) – or, while none are marked, the memories with the most photos */}
      <Section title={review.markedHighlights ? '👑 Eure Highlights' : 'Die Erinnerungen mit den meisten Fotos'} testId="year-highlights">
        {!review.markedHighlights && (
          <p className="-mt-2 mb-4 text-sm text-gray-500" data-testid="highlight-hint">
            Markiert eure Highlights mit 👑 – oben auf der Seite einer Erinnerung.
          </p>
        )}
        {/* no 👑 or golden frame here – they're all highlights; the mood sits on the edge of the
            cover photo (without a cover photo it fills the picture area instead) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {review.highlights.map((memory) => {
            const cover = coverPhoto(memory);
            return (
              <button
                key={memory.id}
                type="button"
                onClick={() => openMemory(memory)}
                className="group relative text-left rounded-3xl bg-white shadow-xl border border-purple-100 hover:scale-[1.02] transition-transform"
                data-testid="highlight-card"
              >
                <div className="relative h-44">
                  <div className="h-full rounded-t-3xl bg-linear-to-br from-purple-200 to-pink-200 overflow-hidden">
                    {cover ? <Thumb image={cover} className="transition-transform duration-300 group-hover:scale-105" /> : <div className="h-full flex items-center justify-center text-5xl">{memory.mood || DEFAULT_MOOD}</div>}
                  </div>
                  {cover && <MoodBadge mood={memory.mood} className="absolute -bottom-6 right-4" />}
                </div>
                <div className={`p-4 ${cover ? 'pr-20' : ''}`}>
                  <div className="font-semibold text-gray-800 truncate">{memory.title}</div>
                  <div className="text-sm text-gray-500">{memoryDateText(memory)}{memory.images?.length ? ` · ${photosText(memory.images.length)}` : ''}</div>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* month by month: tapping one shows its first memory in the timeline */}
      <Section title="Monat für Monat" testId="year-months">
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {review.months.map(({ month, count, first, cover }) => (
            count === 0 ? (
              <div key={month} className="relative h-24 rounded-2xl bg-gray-100 text-gray-400 p-2 text-sm" data-testid="month-tile" data-empty="true">
                <div className="font-semibold">{MONTHS[month].slice(0, 3)}</div>
                <div className="text-xs">–</div>
              </div>
            ) : (
              <Link
                key={month}
                to={book.path(`#erinnerung-${first.id}`)}
                className="group relative h-24 rounded-2xl overflow-hidden bg-linear-to-br from-purple-400 to-pink-300 text-white p-2 text-sm shadow"
                title={`${MONTHS[month]}: im Zeitstrahl zeigen`}
                data-testid="month-tile"
              >
                {cover && <span className="absolute inset-0"><Thumb image={cover.image} /></span>}
                <span className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition" />
                <span className="relative block font-semibold drop-shadow">{MONTHS[month].slice(0, 3)}</span>
                <span className="relative block text-xs drop-shadow">{memoriesText(count)}</span>
              </Link>
            )
          ))}
        </div>
      </Section>

      {/* the places: a still map (tap -> the Karte with this year) and the most frequent ones */}
      <Section title="Orte des Jahres" testId="year-places">
        {review.allPlaces.length === 0 ? (
          <p className="text-sm text-gray-500">Noch keine Orte in diesem Jahr – ihr fügt sie beim Bearbeiten einer Erinnerung hinzu.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <Suspense fallback={<div className="h-36 sm:h-44 w-full rounded-2xl bg-purple-50" />}>
              <PlacesMiniMap places={review.allPlaces} onOpen={() => navigate(book.path(`/karte?jahr=${year}`))} />
            </Suspense>
            <ol className="space-y-1.5">
              {review.places.map(({ place, count }) => (
                <li key={place.id}>
                  <Link
                    to={book.path(`/karte?jahr=${year}&ort=${place.id}`)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/80 border border-purple-100 hover:bg-purple-50"
                    data-testid="year-place"
                  >
                    <MapPin className="w-4 h-4 text-purple-500 shrink-0" />
                    <span className="flex-1 truncate text-gray-800">{place.name}</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{memoriesText(count)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Section>

      {/* the two of you, in your perspective colours */}
      {review.people.length > 0 && (
        <Section title="Ihr beide" testId="year-people">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {review.people.map(({ user, memories: written, perspectives }) => (
              <div key={user.id} className="rounded-2xl border-2 p-4" style={boxStyle(user.color)} data-testid="year-person">
                <div className="font-bold text-gray-800 text-lg">{user.name}</div>
                <div className="text-sm text-gray-700">{plural(written, 'Erinnerung', 'Erinnerungen')} geschrieben</div>
                <div className="text-sm text-gray-700">{plural(perspectives, 'Perspektive', 'Perspektiven')} geschrieben</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* photos of the year: tap one to see it big */}
      {review.photos.length > 0 && (
        <Section title="Fotos des Jahres" testId="year-photos">
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 grid-flow-dense gap-1.5">
            {review.photos.map(({ image, memory }, i) => (
              <button
                key={image.id}
                type="button"
                onClick={() => open(image.id)}
                className={`relative overflow-hidden rounded-xl bg-purple-100 cursor-zoom-in aspect-square ${i === 0 ? 'col-span-2 row-span-2' : ''}`}
                aria-label={`Foto: ${memory.title}, ${memoryDateText(memory)}`}
                data-testid="year-photo"
              >
                <Thumb image={image} className="transition hover:opacity-90" />
              </button>
            ))}
          </div>
        </Section>
      )}

      <div className="h-16" />

      {viewerIndex >= 0 && (
        <PhotoViewer
          photos={review.photos}
          index={viewerIndex}
          onIndexChange={(i) => show(review.photos[i].image.id)}
          onClose={close}
          onOpenMemory={openMemory}
        />
      )}
    </div>
  );
}
