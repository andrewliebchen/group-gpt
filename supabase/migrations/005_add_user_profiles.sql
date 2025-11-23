-- Create user_profiles table to store user background context
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  background_context TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
-- Users can read all profiles (to get background context for AI)
CREATE POLICY "Allow all users to read profiles"
  ON user_profiles FOR SELECT
  USING (true);

-- Users can insert profiles (we'll validate user_id on the client side)
-- Note: Since we're using Clerk for auth, we can't use auth.uid() in RLS
-- The client-side code will ensure users can only create/update their own profile
CREATE POLICY "Allow users to create profiles"
  ON user_profiles FOR INSERT
  WITH CHECK (true);

-- Users can update profiles (we'll validate user_id on the client side)
CREATE POLICY "Allow users to update profiles"
  ON user_profiles FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_profiles_updated_at();

