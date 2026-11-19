-- Allow editors to manage search metadata for project and service detail pages.
ALTER TABLE projects ADD COLUMN seo_title TEXT;
ALTER TABLE projects ADD COLUMN seo_description TEXT;
ALTER TABLE projects ADD COLUMN canonical_url TEXT;
ALTER TABLE services ADD COLUMN seo_title TEXT;
ALTER TABLE services ADD COLUMN seo_description TEXT;
ALTER TABLE services ADD COLUMN canonical_url TEXT;
