-- Add UPDATE policy for threads table
CREATE POLICY "Allow all users to update threads"
  ON threads FOR UPDATE
  USING (true)
  WITH CHECK (true);

