-- Add useful decision and delivery context to individual landing pages.
UPDATE services
SET description = COALESCE(description, summary, title) || ' Before work starts, I clarify the intended audience, required pages or outputs, content the client will supply, and how the finished work will be reviewed. This keeps the scope realistic and makes it easier to prioritise the parts that matter most to visitors. A typical engagement includes agreed deliverables, review points and a practical handover.',
    updated_at = CURRENT_TIMESTAMP
WHERE is_published = TRUE;

UPDATE projects
SET description = COALESCE(description, summary, title) || ' This portfolio case study is included to show the structure of the experience, the way key information is prioritised, and the frontend decisions involved in presenting the content. It is an illustrative portfolio entry; it should not be read as a claim of a live client deployment, commercial results or user adoption unless those details are stated separately.',
    updated_at = CURRENT_TIMESTAMP
WHERE is_published = TRUE;

-- Replace an obsolete CV PDF reference with the live, crawlable resume page.
UPDATE articles
SET content_html = REPLACE(content_html, '/assets/files/Emmanuel_Anyaegbu_CV.pdf', '/resume'),
    content_md = REPLACE(content_md, '/assets/files/Emmanuel_Anyaegbu_CV.pdf', '/resume'),
    updated_at = CURRENT_TIMESTAMP
WHERE content_html LIKE '%/assets/files/Emmanuel_Anyaegbu_CV.pdf%'
   OR content_md LIKE '%/assets/files/Emmanuel_Anyaegbu_CV.pdf%';
