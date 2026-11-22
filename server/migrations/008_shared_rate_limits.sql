-- Shared, atomic request throttling across all application instances.
CREATE TABLE IF NOT EXISTS request_rate_limits (
  bucket_key TEXT NOT NULL,
  window_start_ms BIGINT NOT NULL,
  hits INTEGER NOT NULL,
  PRIMARY KEY (bucket_key, window_start_ms)
);
CREATE INDEX IF NOT EXISTS idx_request_rate_limits_window ON request_rate_limits (window_start_ms);
