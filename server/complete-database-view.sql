-- COMPLETE DATABASE VIEW - Copy and paste these queries in pgAdmin Query Tool
-- This will show you all your migrated database data

-- ========================================
-- 1. SHOW ALL TABLES WITH RECORD COUNTS
-- ========================================
SELECT 
    t.table_name,
    COALESCE(
        (SELECT COUNT(*) 
         FROM information_schema.columns c 
         WHERE c.table_name = t.table_name 
         AND c.table_schema = t.table_schema
         LIMIT 1), 0
    ) as column_count
FROM information_schema.tables t
WHERE t.table_schema = 'public' 
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;

-- ========================================
-- 2. GET RECORD COUNTS FOR ALL TABLES
-- ========================================
DO $$
DECLARE
    table_name text;
    record_count bigint;
BEGIN
    RAISE NOTICE '=== DATABASE RECORD COUNTS ===';
    FOR table_name IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
    LOOP
        EXECUTE format('SELECT COUNT(*) FROM %I', table_name) INTO record_count;
        RAISE NOTICE '%: % records', table_name, record_count;
    END LOOP;
END $$;

-- ========================================
-- 3. SHOW ALL TABLE STRUCTURES
-- ========================================
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- ========================================
-- 4. VIEW KEY TABLES DATA
-- ========================================

-- Users Table
RAISE NOTICE '=== USERS TABLE ===';
SELECT 
    id, 
    name, 
    email, 
    role, 
    university_id, 
    isApproved, 
    subscriptionPlan,
    createdAt
FROM users 
ORDER BY id;

-- Universities Table
RAISE NOTICE '=== UNIVERSITIES TABLE ===';
SELECT * FROM universities;

-- Courses Table
RAISE NOTICE '=== COURSES TABLE ===';
SELECT * FROM courses;

-- Classrooms Table
RAISE NOTICE '=== CLASSROOMS TABLE ===';
SELECT 
    id, 
    name, 
    university_id, 
    course_id,
    created_at
FROM classrooms 
ORDER BY id;

-- Students Table
RAISE NOTICE '=== STUDENTS TABLE ===';
SELECT 
    id, 
    name, 
    email, 
    university_id,
    classroom_id
FROM students 
ORDER BY id
LIMIT 10;

-- ========================================
-- 5. VIEW ALL TABLES WITH SAMPLE DATA
-- ========================================
DO $$
DECLARE
    table_name text;
    sample_query text;
    sample_result text;
BEGIN
    RAISE NOTICE '=== SAMPLE DATA FROM ALL TABLES ===';
    FOR table_name IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
    LOOP
        BEGIN
            sample_query := format('SELECT * FROM %I LIMIT 3', table_name);
            RAISE NOTICE '--- Table: % ---', table_name;
            EXECUTE sample_query;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error accessing table %: %', table_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- ========================================
-- 6. COMPLETE OVERVIEW QUERY
-- ========================================
WITH table_stats AS (
    SELECT 
        t.table_name,
        c.column_count,
        CASE 
            WHEN t.table_name = 'users' THEN (SELECT COUNT(*) FROM users)
            WHEN t.table_name = 'universities' THEN (SELECT COUNT(*) FROM universities)
            WHEN t.table_name = 'courses' THEN (SELECT COUNT(*) FROM courses)
            WHEN t.table_name = 'classrooms' THEN (SELECT COUNT(*) FROM classrooms)
            WHEN t.table_name = 'students' THEN (SELECT COUNT(*) FROM students)
            WHEN t.table_name = 'payments' THEN (SELECT COUNT(*) FROM payments)
            WHEN t.table_name = 'subscriptions' THEN (SELECT COUNT(*) FROM subscriptions)
            WHEN t.table_name = 'attendance' THEN (SELECT COUNT(*) FROM attendance)
            WHEN t.table_name = 'assessments' THEN (SELECT COUNT(*) FROM assessments)
            WHEN t.table_name = 'course_materials' THEN (SELECT COUNT(*) FROM course_materials)
            ELSE 0
        END as record_count
    FROM information_schema.tables t
    LEFT JOIN (
        SELECT 
            table_name,
            COUNT(*) as column_count
        FROM information_schema.columns
        WHERE table_schema = 'public'
        GROUP BY table_name
    ) c ON t.table_name = c.table_name
    WHERE t.table_schema = 'public' 
      AND t.table_type = 'BASE TABLE'
)
SELECT 
    table_name,
    column_count,
    record_count,
    CASE 
        WHEN record_count > 0 THEN 'HAS DATA'
        ELSE 'EMPTY'
    END as status
FROM table_stats
ORDER BY 
    CASE 
        WHEN table_name IN ('users', 'universities', 'courses', 'classrooms', 'students') THEN 1
        ELSE 2
    END,
    table_name;
