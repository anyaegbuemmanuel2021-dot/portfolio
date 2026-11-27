-- Persist provider-side asynchronous publication identifiers for status reconciliation.
ALTER TABLE social_posts ADD COLUMN provider_post_id TEXT;
