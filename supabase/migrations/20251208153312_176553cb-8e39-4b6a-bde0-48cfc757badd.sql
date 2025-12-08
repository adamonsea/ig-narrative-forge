-- Set the "Public Notices" story to draft and unpublish it since it's evergreen content
UPDATE stories 
SET status = 'draft', is_published = false
WHERE id = '00d13bbf-c06d-42db-aafe-00f24b15a8e5';