-- Add campaign attribution and privacy-conscious visitor activity reporting.
ALTER TABLE page_views ADD COLUMN utm_source TEXT;
ALTER TABLE page_views ADD COLUMN utm_medium TEXT;
ALTER TABLE page_views ADD COLUMN utm_campaign TEXT;
ALTER TABLE page_views ADD COLUMN utm_content TEXT;
ALTER TABLE page_views ADD COLUMN utm_term TEXT;
ALTER TABLE analytics_events ADD COLUMN visitor_hash TEXT;
ALTER TABLE analytics_events ADD COLUMN category TEXT;
ALTER TABLE analytics_events ADD COLUMN label TEXT;
ALTER TABLE analytics_events ADD COLUMN utm_source TEXT;
ALTER TABLE analytics_events ADD COLUMN utm_medium TEXT;
ALTER TABLE analytics_events ADD COLUMN utm_campaign TEXT;
CREATE INDEX IF NOT EXISTS idx_page_views_campaign ON page_views (day, utm_source, utm_campaign);
CREATE INDEX IF NOT EXISTS idx_analytics_events_activity ON analytics_events (day, type, created_at);
