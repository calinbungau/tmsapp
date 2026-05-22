-- ============================================================
-- Chat System: Scalable, context-agnostic messaging
-- Supports: Direct messages, Task-level, Order-level (future)
-- ============================================================

-- 1. conversations: The container for all chats
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id),
  
  -- Type of conversation
  type TEXT NOT NULL DEFAULT 'direct', -- 'direct', 'task', 'order', 'group'
  
  -- Context binding (polymorphic)
  context_type TEXT, -- 'task', 'order', null for direct/group
  context_id UUID,   -- FK to the task/order/etc (not enforced for flexibility)
  
  -- Display
  title TEXT, -- Null for direct (auto-generated), custom for groups
  
  -- Denormalized for fast inbox queries
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  last_message_sender_name TEXT,
  
  -- Metadata
  created_by_id UUID NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'admin', -- 'admin', 'driver', 'user'
  is_archived BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. conversation_participants: Who is in each conversation
CREATE TABLE IF NOT EXISTS conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Polymorphic user reference (admins, drivers, users live in different tables)
  user_id UUID NOT NULL,
  user_type TEXT NOT NULL DEFAULT 'admin', -- 'admin', 'driver', 'user'
  
  -- Cached for fast rendering (avoid JOINs in hot paths)
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  
  -- Participation
  role TEXT DEFAULT 'member', -- 'member', 'owner'
  
  -- Unread tracking: messages after this timestamp are "unread"
  last_read_at TIMESTAMPTZ DEFAULT now(),
  
  -- Preferences
  muted BOOLEAN DEFAULT false,
  
  joined_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(conversation_id, user_id, user_type)
);

-- 3. messages: The actual chat messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Sender (polymorphic)
  sender_id UUID NOT NULL,
  sender_type TEXT NOT NULL DEFAULT 'admin', -- 'admin', 'driver', 'user', 'system'
  sender_name TEXT NOT NULL, -- Cached at send time
  
  -- Content
  content TEXT, -- Message body (null for attachment-only messages)
  message_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'image', 'file', 'location', 'system'
  
  -- Flexible metadata (attachments, coordinates, etc.)
  metadata JSONB DEFAULT '{}',
  
  -- Threading
  reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  
  -- Soft delete / edit
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. message_attachments: Multiple files per message
CREATE TABLE IF NOT EXISTS message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT, -- MIME type
  file_size INTEGER, -- bytes
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Indexes for performance
-- ============================================================

-- Inbox query: "all conversations for user X, sorted by most recent"
CREATE INDEX IF NOT EXISTS idx_conv_participants_user 
  ON conversation_participants(user_id, user_type);

-- Conversation members lookup
CREATE INDEX IF NOT EXISTS idx_conv_participants_conv 
  ON conversation_participants(conversation_id);

-- Context lookup: "get chat for task X"
CREATE INDEX IF NOT EXISTS idx_conversations_context 
  ON conversations(context_type, context_id) WHERE context_type IS NOT NULL;

-- Inbox sorting
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg 
  ON conversations(last_message_at DESC NULLS LAST);

-- Message loading: paginated by conversation
CREATE INDEX IF NOT EXISTS idx_messages_conv_created 
  ON messages(conversation_id, created_at DESC);

-- Message sender lookup
CREATE INDEX IF NOT EXISTS idx_messages_sender 
  ON messages(sender_id, sender_type);

-- Attachments per message
CREATE INDEX IF NOT EXISTS idx_message_attachments_msg 
  ON message_attachments(message_id);

-- Admin scoping
CREATE INDEX IF NOT EXISTS idx_conversations_admin 
  ON conversations(admin_id);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'conversations_all') THEN
    CREATE POLICY conversations_all ON conversations FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'conv_participants_all') THEN
    CREATE POLICY conv_participants_all ON conversation_participants FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'messages_all') THEN
    CREATE POLICY messages_all ON messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'message_attachments_all') THEN
    CREATE POLICY message_attachments_all ON message_attachments FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- Enable Realtime for live chat
-- ============================================================

ALTER TABLE conversations REPLICA IDENTITY FULL;
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE conversation_participants REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE conversation_participants;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Trigger: Update conversation denormalized fields on new message
-- ============================================================

CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET 
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 100),
    last_message_sender_name = NEW.sender_name,
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_conversation_on_message ON messages;
CREATE TRIGGER trg_update_conversation_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();
