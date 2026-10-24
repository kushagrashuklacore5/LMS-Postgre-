-- PostgreSQL Database Schema for LMS Production
-- Run this script to create all necessary tables

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    university_id INTEGER DEFAULT 1,
    isApproved BOOLEAN DEFAULT 0,
    classroom_id INTEGER,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    subscriptionPlan TEXT DEFAULT 'free',
    status TEXT DEFAULT 'active',
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER
);

-- Universities table
CREATE TABLE IF NOT EXISTS universities (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    area TEXT,
    adminId INTEGER,
    subscriptionPlan TEXT DEFAULT 'free',
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Classrooms table
CREATE TABLE IF NOT EXISTS classrooms (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    university_id INTEGER DEFAULT 1,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Courses table
CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    university_id INTEGER DEFAULT 1,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Students table
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    university_id INTEGER DEFAULT 1,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    superadminId TEXT NOT NULL,
    planType TEXT DEFAULT 'free',
    planName TEXT DEFAULT 'Free',
    status TEXT DEFAULT 'active',
    expiryDate TIMESTAMP,
    isFreeTrial BOOLEAN DEFAULT false,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fee structures table
CREATE TABLE IF NOT EXISTS feeStructures (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    university_id INTEGER DEFAULT 1,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Announcements table
CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    university_id INTEGER DEFAULT 1,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraints
ALTER TABLE users ADD CONSTRAINT fk_users_university FOREIGN KEY (university_id) REFERENCES universities(id);
ALTER TABLE classrooms ADD CONSTRAINT fk_classrooms_university FOREIGN KEY (university_id) REFERENCES universities(id);
ALTER TABLE courses ADD CONSTRAINT fk_courses_university FOREIGN KEY (university_id) REFERENCES universities(id);
ALTER TABLE students ADD CONSTRAINT fk_students_university FOREIGN KEY (university_id) REFERENCES universities(id);
ALTER TABLE feeStructures ADD CONSTRAINT fk_feeStructures_university FOREIGN KEY (university_id) REFERENCES universities(id);
ALTER TABLE announcements ADD CONSTRAINT fk_announcements_university FOREIGN KEY (university_id) REFERENCES universities(id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_university_id ON users(university_id);
CREATE INDEX IF NOT EXISTS idx_universities_adminId ON universities(adminId);
CREATE INDEX IF NOT EXISTS idx_subscriptions_superadminId ON subscriptions(superadminId);

-- Insert default superadmin user
INSERT INTO users (name, email, password, role, isApproved, university_id)
VALUES ('SuperAdmin', 'superadmin@core5.co.in', '$2a$10$rOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZQZO', 'superadmin', 1, 1)
ON CONFLICT (email) DO NOTHING;

-- Insert default subscription for superadmin
INSERT INTO subscriptions (superadminId, planType, planName, status)
VALUES ('superadmin-1', 'free', 'Free', 'active')
ON CONFLICT DO NOTHING;

-- Insert default university
INSERT INTO universities (name, area, adminId, subscriptionPlan)
VALUES ('Default University', 'Default Area', 2, 'free')
ON CONFLICT DO NOTHING;

-- Create sequence for auto-incrementing IDs if needed
CREATE SEQUENCE IF NOT EXISTS users_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS universities_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS classrooms_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS courses_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS students_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS subscriptions_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS feeStructures_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS announcements_id_seq START 1;

-- Set default values for sequences
ALTER SEQUENCE users_id_seq OWNED BY users.id;
ALTER SEQUENCE universities_id_seq OWNED BY universities.id;
ALTER SEQUENCE classrooms_id_seq OWNED BY classrooms.id;
ALTER SEQUENCE courses_id_seq OWNED BY courses.id;
ALTER SEQUENCE students_id_seq OWNED BY students.id;
ALTER SEQUENCE subscriptions_id_seq OWNED BY subscriptions.id;
ALTER SEQUENCE feeStructures_id_seq OWNED BY feeStructures.id;
ALTER SEQUENCE announcements_id_seq OWNED BY announcements.id;

COMMIT;
