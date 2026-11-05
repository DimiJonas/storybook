import React from 'react';
import { differenceInDays, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import { formatDate } from '../../dates';

const ImportantDatesCard = ({ dates = [], onEdit }) => {
  const today = new Date();

  const upcoming = dates
    .map(({ label, date }) => ({
      label,
      date,
      daysLeft: differenceInDays(parseISO(date), today),
    }))
    .filter((event) => event.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (!upcoming.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mb-10 p-6 bg-blue-100 border-l-4 border-blue-400 rounded-xl shadow-md"
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">⏳ Nächste wichtige Termine</h2>
        {onEdit && (
          <button
            onClick={onEdit}
            className="text-sm bg-blue-300 text-white px-3 py-1 rounded-sm hover:bg-blue-400"
          >
            Bearbeiten
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {upcoming.map((event) => (
          <li key={event.label} className="text-gray-800">
            <strong>{event.label}</strong> in{' '}
            <span className="text-purple-700">{event.daysLeft}</span> Tagen (
            {formatDate(event.date)})
          </li>
        ))}
      </ul>
    </motion.div>
  );
};

export default ImportantDatesCard;
