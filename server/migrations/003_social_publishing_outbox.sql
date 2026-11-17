-- Social publishing outbox. Website pages remain audio-free; music is only part of social video assets.
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','linkedin')),
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
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts (status, platform, created_at);
CREATE INDEX IF NOT EXISTS idx_social_posts_article ON social_posts (article_id, created_at);
