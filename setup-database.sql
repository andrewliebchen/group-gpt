-- Run this SQL in your Supabase SQL Editor to set up the database

-- Create threads table
CREATE TABLE IF NOT EXISTS threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT NOT NULL
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_threads_created_at ON threads(created_at);

-- Enable Row Level Security
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for threads
CREATE POLICY "Allow all users to read threads"
  ON threads FOR SELECT
  USING (true);

CREATE POLICY "Allow all users to create threads"
  ON threads FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all users to update threads"
  ON threads FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- RLS Policies for messages
CREATE POLICY "Allow all users to read messages"
  ON messages FOR SELECT
  USING (true);

CREATE POLICY "Allow all users to create messages"
  ON messages FOR INSERT
  WITH CHECK (true);

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

-- Enable real-time for messages (optional - can also be done via dashboard)
-- Go to Database > Replication in Supabase dashboard and enable replication for messages table

