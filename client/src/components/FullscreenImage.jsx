import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { imageUrl, gridSize } from '../config';
import { useStorybook } from '../storybook';

// Full-screen photo: shows the original. While the (big) original is still downloading,
// the smaller version from the grid is shown in its place – usually it's already cached,
// so something appears immediately and gets sharper when the original has arrived.
const FullscreenImage = ({ filename, alt }) => {
  const book = useStorybook();
  const [originalLoaded, setOriginalLoaded] = useState(false);
  const [originalFailed, setOriginalFailed] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [aspect, setAspect] = useState(null); // width / height, known once a version has loaded

  useEffect(() => {
    setOriginalLoaded(false);
    setOriginalFailed(false);
    setPreviewFailed(false);
    setAspect(null);
    const original = new Image();
    original.onload = () => setOriginalLoaded(true);
    original.onerror = () => setOriginalFailed(true);
    original.src = imageUrl(book.id, filename, 'original');
    return () => {
      original.onload = null;
      original.onerror = null;
    };
  }, [book.id, filename]);

  // Show the original once it's downloaded (or right away if there is no smaller version);
  // keep showing the smaller version if the original can't be loaded.
  const showingOriginal = !originalFailed && (originalLoaded || previewFailed);
  const src = imageUrl(book.id, filename, showingOriginal ? 'original' : gridSize());

  if (originalFailed && previewFailed) {
    return <div className="text-white/80" onClick={(e) => e.stopPropagation()}>📷 Foto nicht verfügbar</div>;
  }

  // Once the shape of the photo is known, give the image a fixed size that fills the screen.
  // That way the small preview is shown just as big as the original, and nothing jumps.
  const style = aspect
    ? { aspectRatio: aspect, width: `min(95vw, calc(90vh * ${aspect}))`, height: 'auto' }
    : undefined;

  return (
    <motion.img
      src={src}
      alt={alt}
      style={style}
      onLoad={(e) => !aspect && setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
      onError={() => (showingOriginal ? setOriginalFailed(true) : setPreviewFailed(true))}
      className="max-w-[95vw] max-h-[90vh] object-cover rounded-2xl shadow-2xl"
      initial={{ scale: 0.9 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0.9 }}
      onClick={(e) => e.stopPropagation()}
      draggable={false}
    />
  );
};

export default FullscreenImage;
