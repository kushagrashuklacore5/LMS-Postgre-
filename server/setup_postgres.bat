
@echo off
echo Setting up PostgreSQL...
cd /d "C:\Program Files\PostgreSQL\18\bin"
set PGPASSWORD=postgres
echo Creating database...
createdb -U postgres lms_database 2>nul
echo Database created successfully!
echo Creating tables...
psql -U postgres -d lms_database -c "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', university_id INTEGER DEFAULT 1, is_approved BOOLEAN DEFAULT 1, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);" 2>nul
psql -U postgres -d lms_database -c "CREATE TABLE IF NOT EXISTS universities (id SERIAL PRIMARY KEY, name TEXT NOT NULL, area TEXT, adminId INTEGER, subscriptionPlan TEXT DEFAULT 'free', createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP);" 2>nul
echo Tables created successfully!
echo PostgreSQL setup completed!
  