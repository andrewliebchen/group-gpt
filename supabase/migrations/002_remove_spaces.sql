-- Remove space_id from threads table
ALTER TABLE threads DROP CONSTRAINT IF EXISTS threads_space_id_fkey;
ALTER TABLE threads DROP COLUMN IF EXISTS space_id;

-- Drop spaces table
DROP TABLE IF EXISTS spaces;

