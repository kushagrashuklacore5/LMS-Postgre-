const db = require('config/database-switch');
const bcrypt = require('bcryptjs');

const demoUsers = [
  { name: 'Student', email: 'student@gmail.com', password: '12345678', role: 'student' },
  { name: 'Mentor', email: 'mentor@gmail.com', password: '12345678', role: 'mentor' },
  { name: 'Admin', email: 'admin@gmail.com', password: '12345678', role: 'admin' }
];

// Classroom creation disabled - admin will create classrooms manually
const demoClassrooms = [];

const createDemoUsers = async () => {
  try {
    for (const user of demoUsers) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      
      db.run(
        'INSERT OR IGNORE INTO users (name, email, password, role, isApproved) VALUES (?, ?, ?, ?, ?)',
        [user.name, user.email, hashedPassword, user.role, 1],
        (err) => {
          if (err) {
            if (!err.message.includes('UNIQUE constraint failed')) {
              console.error('Error creating user:', user.email, err.message);
            }
          } else {
            console.log('✅ User created:', user.email);
          }
        }
      );
    }

    // Classroom creation disabled - admin will create classrooms manually via the UI
    // for (const classroom of demoClassrooms) {
    //   db.run(
    //     'INSERT OR IGNORE INTO classrooms (name, grade, section, classTeacher, studentCount) VALUES (?, ?, ?, ?, ?)',
    //     [classroom.name, classroom.grade, classroom.section, classroom.classTeacher, classroom.studentCount],
    //     (err) => {
    //       if (err) {
    //         if (!err.message.includes('UNIQUE constraint failed')) {
    //           console.error('Error creating classroom:', classroom.name, err.message);
    //         }
    //       } else {
    //         console.log('✅ Classroom created:', classroom.name);
    //       }
    //     }
    //   );
    // }
    
    setTimeout(() => {
      console.log('\n✅ Demo setup complete!');
      console.log('\n📝 Test Credentials:');
      console.log('Student: student@gmail.com / 12345678');
      console.log('Mentor (Class Teacher): mentor@gmail.com / 12345678');
      console.log('Admin: admin@gmail.com / 12345678');
      console.log('\n📚 Demo Classrooms:');
      console.log('No default classrooms - Admin can create classrooms via the Dashboard');
      console.log('\n💰 Fee Structure:');
      console.log('Primary (Grades 1-4): ₹8,050 total');
      console.log('  - Tuition: ₹5,000, Transport: ₹1,000, Computer Lab: ₹800');
      console.log('  - Library: ₹500, Sports: ₹300, Examination: ₹700, Misc: ₹200');
      console.log('\nSecondary (Grades 5-12): ₹12,100 total');
      console.log('  - Tuition: ₹7,000, Transport: ₹1,500, Computer Lab: ₹1,200');
      console.log('  - Library: ₹700, Sports: ₹500, Examination: ₹900, Misc: ₹300');
      process.exit(0);
    }, 2000);
  } catch (err) {
    console.error('Setup error:', err);
    process.exit(1);
  }
};

createDemoUsers();
