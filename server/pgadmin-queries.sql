-- Copy these queries into pgAdmin Query Tool to verify your migration

-- 1. Check all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 2. Check user count
SELECT COUNT(*) as total_users FROM users;

-- 3. View sample users
SELECT id, name, email, role, university_id 
FROM users 
LIMIT 5;

-- 4. Check universities
SELECT * FROM universities;

-- 5. Check courses
SELECT * FROM courses;

-- 6. Check classrooms
SELECT * FROM classrooms;

-- 7. Check students
SELECT COUNT(*) as total_students FROM students;

-- 8. Check all table counts
SELECT 
    t.table_name,
    COALESCE(s.count, 0) as record_count
FROM information_schema.tables t
LEFT JOIN (
    SELECT 
        table_name,
        COUNT(*) as count
    FROM (
        SELECT 'users' as table_name, COUNT(*) as count FROM users
        UNION ALL
        SELECT 'universities' as table_name, COUNT(*) as count FROM universities
        UNION ALL
        SELECT 'courses' as table_name, COUNT(*) as count FROM courses
        UNION ALL
        SELECT 'classrooms' as table_name, COUNT(*) as count FROM classrooms
        UNION ALL
        SELECT 'students' as table_name, COUNT(*) as count FROM students
    ) counts
    GROUP BY table_name
) s ON t.table_name = s.table_name
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;
