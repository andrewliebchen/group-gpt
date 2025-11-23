-- Create spaces table
CREATE TABLE IF NOT EXISTS spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT NOT NULL
);

-- Create threads table
CREATE TABLE IF NOT EXISTS threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_threads_space_id ON threads(space_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Enable Row Level Security
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for spaces
-- Note: Since we're using Clerk for auth, we allow all operations
-- Authentication is handled by Clerk middleware before requests reach Supabase
-- These policies can be refined later to add space membership checks
CREATE POLICY "Allow all users to read spaces"
  ON spaces FOR SELECT
  USING (true);

CREATE POLICY "Allow all users to create spaces"
  ON spaces FOR INSERT
  WITH CHECK (true);

-- RLS Policies for threads
CREATE POLICY "Allow all users to read threads"
  ON threads FOR SELECT
  USING (true);

CREATE POLICY "Allow all users to create threads"
  ON threads FOR INSERT
  WITH CHECK (true);

-- RLS Policies for messages
CREATE POLICY "Allow all users to read messages"
  ON messages FOR SELECT
  USING (true);

CREATE POLICY "Allow all users to create messages"
  ON messages FOR INSERT
  WITH CHECK (true);

-- Note: Real-time is enabled by default in Supabase for tables with RLS
-- If you need to explicitly enable it, use the Supabase dashboard:
-- Go to Database > Replication and enable replication for the messages table

