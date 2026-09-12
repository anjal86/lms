-- Add converted_at column to lead_conversations for conversion tracking
ALTER TABLE lead_conversations
ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
