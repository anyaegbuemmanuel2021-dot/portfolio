-- Give every portfolio article a stable, visible author identity.
-- This single ADD COLUMN form is supported by both PostgreSQL and SQLite.
ALTER TABLE articles ADD COLUMN author_name TEXT NOT NULL DEFAULT 'Anyaegbu Emmanuel Ikenna';
