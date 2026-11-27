-- Rebuild the outbox table portably so SQLite and PostgreSQL share the expanded platform constraint.
CREATE TABLE social_posts_replacement (
  id UUID PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','linkedin','x','tiktok')),
  caption TEXT NOT NULL,
  link_url TEXT NOT NULL,
  media_url TEXT,
  media_kind TEXT NOT NULL DEFAULT 'video_required',
  audio_status TEXT NOT NULL DEFAULT 'needs_licensed_audio',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','publishing','published','failed','paused')),
  published_url TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  UNIQUE(article_id, platform)
);
INSERT INTO social_posts_replacement (id,article_id,platform,caption,link_url,media_url,media_kind,audio_status,status,published_url,last_error,created_at,updated_at,published_at)
SELECT id,article_id,platform,caption,link_url,media_url,media_kind,audio_status,status,published_url,last_error,created_at,updated_at,published_at FROM social_posts;
DROP TABLE social_posts;
ALTER TABLE social_posts_replacement RENAME TO social_posts;
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts (status, platform, created_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_article ON social_posts (article_id, created_at);
