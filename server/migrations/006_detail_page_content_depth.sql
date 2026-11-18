-- Add a final layer of project-specific review and delivery context to thin detail pages.
UPDATE projects
SET description = COALESCE(description, summary, title) || ' When reviewing this entry, look at how the page introduces its purpose, groups information, handles primary actions and adapts to smaller screens. The sample brand and content are illustrative. The source repository, where linked, is the best place to inspect implementation details; this description is a guide to the problem and interface represented.',
    updated_at = CURRENT_TIMESTAMP
WHERE is_published = TRUE;

UPDATE services
SET description = COALESCE(description, summary, title) || ' Project planning also covers content readiness, accessibility expectations, browser support and the level of ongoing maintenance required. I confirm what is included before starting and identify third-party tools or paid services separately. This helps clients understand responsibilities, delivery stages and what they will receive at handover.',
    updated_at = CURRENT_TIMESTAMP
WHERE is_published = TRUE;
