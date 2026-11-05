// Storybooks: each one is a schema ("folder" in the database) named book_<number> with its own
// tables, and a photo folder uploads/book_<number>/. The users are shared (public schema).
const path = require('path');
const { uploadDir } = require('./images');

const SCHEMA_PATTERN = /^book_([1-9][0-9]*)$/;

// "1" -> "book_1" (only plain numbers, so the name can safely be used in SQL)
const schemaFor = (id) => {
  const text = String(id);
  return /^[1-9][0-9]{0,8}$/.test(text) ? `book_${text}` : null;
};
const idOf = (schema) => Number(SCHEMA_PATTERN.exec(schema)[1]);

// Folder with the storybook's photos (and its thumb/ and medium/ subfolders)
const photoDirFor = (schema) => path.join(uploadDir, schema);

// All storybook schemas, sorted by number: ['book_1', 'book_2', ...]
const listSchemas = async (db) => {
  const { rows } = await db.query(
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name ~ '^book_[1-9][0-9]*$'"
  );
  return rows.map((r) => r.schema_name).sort((a, b) => idOf(a) - idOf(b));
};

// All storybooks with name and number of memories (for the choice page)
const listStorybooks = async (db) => {
  const books = [];
  for (const schema of await listSchemas(db)) {
    const { rows } = await db.query(
      `SELECT (SELECT name FROM "${schema}".storybook_info LIMIT 1) AS name,
              (SELECT count(*)::int FROM "${schema}".memories) AS memories`
    );
    books.push({ id: idOf(schema), name: rows[0].name || `Storybook ${idOf(schema)}`, memories: rows[0].memories });
  }
  return books;
};

// Runs `fn(db)` with the storybook's tables: inside one transaction whose search path points to
// the storybook's schema, so queries like "SELECT * FROM memories" only see this storybook.
// (SET LOCAL ends with the transaction – the connection goes back to the pool unchanged.)
// If fn throws, everything it changed is undone.
const withStorybook = async (pool, schema, fn) => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`SET LOCAL search_path TO "${schema}", public`);
    const result = await fn(db);
    await db.query('COMMIT');
    return result;
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.release();
  }
};

module.exports = { SCHEMA_PATTERN, schemaFor, idOf, photoDirFor, listSchemas, listStorybooks, withStorybook };
