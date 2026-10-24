-- SIMPLE DATABASE VIEW - Run these queries in pgAdmin Query Tool

-- 1. SHOW ALL TABLES
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 2. SHOW RECORD COUNTS FOR ALL TABLES
SELECT 
    schemaname,
    tablename,
    n_tup_ins as total_inserts,
    n_tup_upd as total_updates,
    n_live_tup as live_records
FROM pg_stat_user_tables 
ORDER BY tablename;

-- 3. VIEW ALL USERS
SELECT id, name, email, role, university_id, isApproved, subscriptionPlan, createdAt
FROM users 
ORDER BY id;

-- 4. VIEW UNIVERSITIES
SELECT * FROM universities;

-- 5. VIEW COURSES
SELECT * FROM courses;

-- 6. VIEW CLASSROOMS
SELECT * FROM classrooms;

-- 7. VIEW STUDENTS
SELECT * FROM students LIMIT 10;

-- 8. VIEW PAYMENTS
SELECT * FROM payments;

-- 9. VIEW SUBSCRIPTIONS
SELECT * FROM subscriptions;

-- 10. VIEW ATTENDANCE
SELECT * FROM attendance LIMIT 10;

-- 11. VIEW ASSESSMENTS
SELECT * FROM assessments;

-- 12. VIEW COURSE MATERIALS
SELECT * FROM course_materials;
