-- DATABASE DASHBOARD - Run this once to create a dashboard view
-- This creates views that you can easily access in pgAdmin

-- Create a dashboard view showing all table summaries
CREATE OR REPLACE VIEW database_dashboard AS
SELECT 
    t.table_name,
    COALESCE(s.n_live_tup, 0) as record_count,
    CASE 
        WHEN COALESCE(s.n_live_tup, 0) > 0 THEN 'HAS DATA'
        ELSE 'EMPTY'
    END as status,
    CASE 
        WHEN t.table_name IN ('users', 'universities', 'courses', 'classrooms', 'students') THEN 'KEY TABLE'
        ELSE 'SUPPORTING TABLE'
    END as table_type
FROM information_schema.tables t
LEFT JOIN pg_stat_user_tables s ON t.table_name = s.relname
WHERE t.table_schema = 'public' 
  AND t.table_type = 'BASE TABLE'
ORDER BY 
    CASE 
        WHEN t.table_name IN ('users', 'universities', 'courses', 'classrooms', 'students') THEN 1
        ELSE 2
    END,
    s.n_live_tup DESC,
    t.table_name;

-- Create quick access views for key tables
CREATE OR REPLACE VIEW users_summary AS
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

CREATE OR REPLACE VIEW universities_summary AS
SELECT * FROM universities;

CREATE OR REPLACE VIEW courses_summary AS
SELECT * FROM courses;

CREATE OR REPLACE VIEW classrooms_summary AS
SELECT 
    id,
    name,
    university_id,
    course_id,
    created_at
FROM classrooms
ORDER BY id;

CREATE OR REPLACE VIEW students_summary AS
SELECT 
    id,
    name,
    email,
    university_id,
    classroom_id
FROM students
ORDER BY id;

-- Create a complete data overview
CREATE OR REPLACE VIEW complete_data_overview AS
SELECT 
    'Users' as table_name,
    COUNT(*) as count,
    'Active users in the system' as description
FROM users

UNION ALL

SELECT 
    'Universities' as table_name,
    COUNT(*) as count,
    'Educational institutions' as description
FROM universities

UNION ALL

SELECT 
    'Courses' as table_name,
    COUNT(*) as count,
    'Available courses' as description
FROM courses

UNION ALL

SELECT 
    'Classrooms' as table_name,
    COUNT(*) as count,
    'Virtual classrooms' as description
FROM classrooms

UNION ALL

SELECT 
    'Students' as table_name,
    COUNT(*) as count,
    'Enrolled students' as description
FROM students

UNION ALL

SELECT 
    'Payments' as table_name,
    COUNT(*) as count,
    'Payment records' as description
FROM payments

UNION ALL

SELECT 
    'Inventory' as table_name,
    COUNT(*) as count,
    'Inventory items' as description
FROM inventory

UNION ALL

SELECT 
    'Vendors' as table_name,
    COUNT(*) as count,
    'Vendor records' as description
FROM vendors

ORDER BY count DESC;

-- Grant access to views (if needed)
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO postgres;
