-- Give every portfolio article a stable, visible author identity.
ALTER TABLE articles ADD COLUMN IF NOT EXISTS author_name TEXT;
UPDATE articles
SET author_name = 'Anyaegbu Emmanuel Ikenna'
WHERE author_name IS NULL OR trim(author_name) = '';
ALTER TABLE articles ALTER COLUMN author_name SET DEFAULT 'Anyaegbu Emmanuel Ikenna';
ALTER TABLE articles ALTER COLUMN author_name SET NOT NULL;
