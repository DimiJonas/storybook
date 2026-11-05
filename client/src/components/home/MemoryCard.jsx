import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import ImageComponent from '../ImageComponent';
import { memoryDateText } from '../../dates';
import { useStorybook } from '../../storybook';
import { memoryAnchor } from './TimelineNav';
import TagChips from '../TagChips';
import { excerpt, highlight, normalize } from '../../search';
import { useSetting } from '../../settings';
import { LIGHT_CLASSES, useMoods } from '../../moods';
import MoodBadge from '../MoodBadge';
import MoodPattern from '../MoodPattern';
import HighlightSticker, { HIGHLIGHT_FRAME } from '../HighlightSticker';

// Text with the search words marked
export const Marked = ({ text, words }) =>
  highlight(text, words).map((part, i) =>
    part.mark ? <mark key={i} className="bg-yellow-200 text-inherit rounded-sm px-0.5">{part.text}</mark> : part.text
  );

// One memory in the timeline. `index` = its position in the whole timeline (the first few fade in
// one after another); its mood decides its pattern and lightness (moods.js: `useMoods().look`).
// `words`: search words to highlight (the text then shows the passage around the first match);
// `linkSuffix`: "?q=..." kept when opening it.
const MemoryCard = ({ memory, index, words = [], linkSuffix = '' }) => {
  const navigate = useNavigate();
  const book = useStorybook();
  const [showTags] = useSetting('showTagsOnCards');
  const look = useMoods().look(memory.mood);
  const light = LIGHT_CLASSES[look.light];

  return (
    <motion.div
      id={memoryAnchor(memory)}
      initial={{ opacity: 0, y: 20 }}
      // Fade in when the card scrolls into view (instead of all cards at page load,
      // where card 200 waited 10 seconds). Only the first few get a staggered delay.
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: Math.min(index, 5) * 0.05 }}
      // the mood sets the lightness of the card and its dot, and draws its pattern; a highlight
      // gets a golden frame and the 👑 sticker. `isolate`: the pattern sits behind the content
      // but in front of the card's background
      className={`group ml-6 relative isolate rounded-3xl transition-transform cursor-pointer border border-purple-100 p-6 hover:scale-[1.02] ${light.card} ${
        memory.highlight ? HIGHLIGHT_FRAME : ''
      }`}
      data-mood-group={look.group || 'eigene'}
      data-mood-light={look.light}
      onClick={() => navigate(book.path(`/memory/${memory.id}`) + linkSuffix)}
    >
      {/* Dot */}
      {/* Pulsing with a CSS animation (see index.css): the browser runs it cheaply,
          unlike hundreds of JavaScript animations running at the same time */}
      <div className={`absolute w-5 h-5 ${light.dot} border-4 border-white rounded-full -left-7 top-6 motion-safe:animate-dot-pulse`} />
      {/* 👑 a highlight of its year (set on the detail page) */}
      {memory.highlight && <HighlightSticker testId="card-crown" />}
      {/* the mood's pattern, clipped to the card's rounded corners */}
      <div className="absolute inset-0 -z-10 rounded-3xl overflow-hidden">
        <MoodPattern pattern={look.pattern} className={light.pattern} />
      </div>
      {/* the mood in its own slot in the top-right corner */}
      <MoodBadge
        mood={memory.mood}
        light={look.light}
        marked={Boolean(words.length && memory.mood && words.some((w) => normalize(memory.mood).text.includes(w)))}
        className="absolute top-5 right-5"
      />
      <h3 className={`text-2xl font-semibold mb-2 pr-14 ${light.title}`}><Marked text={memory.title} words={words} /></h3>
      <div className="text-sm text-gray-500 mb-4 pr-14">
        {/* "22.10.2025", or for several days "10.–12.10.2025 · 3 Tage" */}
        {memoryDateText(memory)}
      </div>
      <p className="text-gray-700 whitespace-pre-wrap mb-4">
        <Marked text={excerpt(memory.content, words)} words={words} />
      </p>
      {showTags && <TagChips tagIds={memory.tag_ids} className="-mt-2 mb-4" />}
      {memory.images?.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {memory.images.slice(0, 2).map((image) => (
            <ImageComponent key={image.id} filename={image.filename} title={memory.title} />
          ))}
          {memory.images.length > 2 && (
            <div className="text-sm text-gray-500 mt-1">
              +{memory.images.length - 2} Weitere Fotos
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default MemoryCard;
