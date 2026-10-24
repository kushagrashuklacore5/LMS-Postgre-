-- Master Database Schema for Multi-Tenant LMS
-- This database stores only the superadmin registry table
-- Each superadmin has their own completely isolated PostgreSQL database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Superadmin registry table
-- This is the ONLY table in the master database
CREATE TABLE IF NOT EXISTS superadmins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  db_name VARCHAR(255) UNIQUE NOT NULL,
  db_host VARCHAR(255) NOT NULL,
  db_port INTEGER NOT NULL,
  db_user VARCHAR(255) NOT NULL,
  db_password TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_superadmins_email ON superadmins(email);
CREATE INDEX IF NOT EXISTS idx_superadmins_status ON superadmins(status);
CREATE INDEX IF NOT EXISTS idx_superadmins_created_at ON superadmins(created_at);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_superadmins_updated_at ON superadmins;
CREATE TRIGGER update_superadmins_updated_at 
    BEFORE UPDATE ON superadmins 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert sample superadmin for testing (password: 'admin123')
-- Hash: $2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LFvOe
INSERT INTO superadmins (email, password_hash, db_name, db_host, db_port, db_user, db_password)
VALUES (
  'superadmin@test.com',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LFvOe',
  'lms_tenant_demo',
  'localhost',
  5432,
  'postgres',
  'postgres'
) ON CONFLICT (email) DO NOTHING;

COMMIT;
