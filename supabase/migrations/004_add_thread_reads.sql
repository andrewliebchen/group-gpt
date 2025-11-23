-- Create thread_reads table to track when users last read each thread
CREATE TABLE IF NOT EXISTS thread_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  last_read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, thread_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_thread_reads_user_thread ON thread_reads(user_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_reads_thread_id ON thread_reads(thread_id);

-- Enable Row Level Security
ALTER TABLE thread_reads ENABLE ROW LEVEL SECURITY;

-- RLS Policies for thread_reads
CREATE POLICY "Allow all users to read their own thread reads"
  ON thread_reads FOR SELECT
  USING (true);

CREATE POLICY "Allow all users to create thread reads"
  ON thread_reads FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all users to update their own thread reads"
  ON thread_reads FOR UPDATE
  USING (true)
  WITH CHECK (true);

