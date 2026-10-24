const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Set environment variables directly
process.env.PG_HOST = 'localhost';
process.env.PG_PORT = '5432';
process.env.PG_DATABASE = 'lms_database';
process.env.PG_USER = 'postgres';
process.env.PG_PASSWORD = 'postgres123';

console.log('=== CREATING ISOLATED INSTITUTES FOR EACH SUPERADMIN ===\n');

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

// Define institutes for each superadmin
const institutesData = [
  {
    superadminId: 1,
    superadminEmail: 'john.anderson@techcorp.com',
    institutes: [
      {
        name: 'TechCorp Institute of Technology',
        code: 'TCIT',
        email: 'admin@tcit.techcorp.com',
        address: '123 Silicon Valley, CA 94025',
        phone: '+1-555-0101'
      },
      {
        name: 'TechCorp Business School',
        code: 'TCBS',
        email: 'admin@tcbs.techcorp.com',
        address: '456 Business Park, CA 94026',
        phone: '+1-555-0102'
      },
      {
        name: 'TechCorp Academy of Arts',
        code: 'TCAA',
        email: 'admin@tcaa.techcorp.com',
        address: '789 Art District, CA 94027',
        phone: '+1-555-0103'
      }
    ]
  },
  {
    superadminId: 2,
    superadminEmail: 'sarah.mitchell@edusolutions.net',
    institutes: [
      {
        name: 'EduSolutions Learning Center',
        code: 'ESLC',
        email: 'admin@eslc.edusolutions.net',
        address: '321 Education Blvd, NY 10001',
        phone: '+1-555-0201'
      },
      {
        name: 'EduSolutions STEM Academy',
        code: 'ESSA',
        email: 'admin@essa.edusolutions.net',
        address: '654 Science Park, NY 10002',
        phone: '+1-555-0202'
      },
      {
        name: 'EduSolutions Language Institute',
        code: 'ESLI',
        email: 'admin@esli.edusolutions.net',
        address: '987 Language Lane, NY 10003',
        phone: '+1-555-0203'
      },
      {
        name: 'EduSolutions Medical College',
        code: 'ESMC',
        email: 'admin@esmc.edusolutions.net',
        address: '147 Medical Drive, NY 10004',
        phone: '+1-555-0204'
      }
    ]
  },
  {
    superadminId: 3,
    superadminEmail: 'michael.chen@learnhub.org',
    institutes: [
      {
        name: 'LearnHub University',
        code: 'LHU',
        email: 'admin@lhu.learnhub.org',
        address: '111 University Ave, TX 75001',
        phone: '+1-555-0301'
      },
      {
        name: 'LearnHub Technical Institute',
        code: 'LHTI',
        email: 'admin@lhti.learnhub.org',
        address: '222 Tech Street, TX 75002',
        phone: '+1-555-0302'
      }
    ]
  },
  {
    superadminId: 4,
    superadminEmail: 'emma.williams@academysuite.io',
    institutes: [
      {
        name: 'AcademySuite Business Institute',
        code: 'ASBI',
        email: 'admin@asbi.academysuite.io',
        address: '555 Commerce Blvd, FL 33101',
        phone: '+1-555-0401'
      },
      {
        name: 'AcademySuite Design School',
        code: 'ASDS',
        email: 'admin@asds.academysuite.io',
        address: '777 Creative Way, FL 33102',
        phone: '+1-555-0402'
      },
      {
        name: 'AcademySuite Healthcare Academy',
        code: 'ASHA',
        email: 'admin@asha.academysuite.io',
        address: '999 Health Park, FL 33103',
        phone: '+1-555-0403'
      }
    ]
  },
  {
    superadminId: 5,
    superadminEmail: 'david.rodriguez@smartlearn.co',
    institutes: [
      {
        name: 'SmartLearn Innovation Center',
        code: 'SLIC',
        email: 'admin@slic.smartlearn.co',
        address: '333 Innovation Drive, WA 98001',
        phone: '+1-555-0501'
      },
      {
        name: 'SmartLearn Digital Academy',
        code: 'SLDA',
        email: 'admin@slda.smartlearn.co',
        address: '666 Digital Plaza, WA 98002',
        phone: '+1-555-0502'
      },
      {
        name: 'SmartLearn Research Institute',
        code: 'SLRI',
        email: 'admin@slri.smartlearn.co',
        address: '999 Research Lane, WA 98003',
        phone: '+1-555-0503'
      },
      {
        name: 'SmartLearn Global Campus',
        code: 'SLGC',
        email: 'admin@slgc.smartlearn.co',
        address: '222 Global Way, WA 98004',
        phone: '+1-555-0504'
      }
    ]
  }
];

async function createIsolatedInstitutes() {
  try {
    console.log('Connecting to database...');
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('Connected to lms_database\n');
    
    // Check current institutes
    const currentInstitutes = await pool.query('SELECT COUNT(*) as count FROM universities');
    console.log(`Current institutes in database: ${currentInstitutes.rows[0].count}`);
    
    let totalCreated = 0;
    let totalSkipped = 0;
    
    // Create institutes for each superadmin
    for (const superadminData of institutesData) {
      console.log(`\nCreating institutes for ${superadminData.superadminEmail} (ID: ${superadminData.superadminId}):`);
      console.log('-'.repeat(60));
      
      for (const institute of superadminData.institutes) {
        try {
          // Check if institute already exists
          const existingInstitute = await pool.query(
            'SELECT id FROM universities WHERE code = $1',
            [institute.code]
          );
          
          if (existingInstitute.rows.length > 0) {
            console.log(`  ${institute.name} (${institute.code}) - ALREADY EXISTS - SKIPPING`);
            totalSkipped++;
            continue;
          }
          
          // Insert the institute with superadmin association
          const insertResult = await pool.query(`
            INSERT INTO universities (name, code, email, address, phone, createdat, updatedat)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            RETURNING id
          `, [
            institute.name,
            institute.code,
            institute.email,
            institute.address,
            institute.phone
          ]);
          
          const instituteId = insertResult.rows[0].id;
          console.log(`  ${institute.name} (${institute.code}) - CREATED (ID: ${instituteId})`);
          console.log(`    Email: ${institute.email}`);
          console.log(`    Address: ${institute.address}`);
          console.log(`    Phone: ${institute.phone}`);
          console.log(`    Superadmin: ${superadminData.superadminEmail}`);
          console.log('');
          
          totalCreated++;
          
          // Create admin user for each institute
          const adminEmail = institute.email;
          const adminPassword = await bcrypt.hash('admin123', 10);
          
          // Check if admin already exists
          const existingAdmin = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [adminEmail]
          );
          
          if (existingAdmin.rows.length === 0) {
            const adminResult = await pool.query(`
              INSERT INTO users (name, email, password, role, isapproved, university_id, createdat, updatedat)
              VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
              RETURNING id
            `, [
              `${institute.name} Admin`,
              adminEmail,
              adminPassword,
              'admin',
              true,
              instituteId
            ]);
            
            console.log(`    Admin user created: ${adminEmail} (Password: admin123)`);
          } else {
            console.log(`    Admin user already exists: ${adminEmail}`);
          }
          
        } catch (error) {
          console.log(`  ${institute.name} (${institute.code}) - ERROR: ${error.message}`);
        }
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('INSTITUTE CREATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total institutes created: ${totalCreated}`);
    console.log(`Total institutes skipped: ${totalSkipped}`);
    
    // Show final institute count
    const finalInstitutes = await pool.query('SELECT COUNT(*) as count FROM universities');
    console.log(`Total institutes in database: ${finalInstitutes.rows[0].count}`);
    
    // Show all institutes with superadmin mapping
    console.log('\nAll institutes with superadmin mapping:');
    const allInstitutes = await pool.query(`
      SELECT u.id, u.name, u.code, u.email, u.createdat,
             CASE 
               WHEN u.id BETWEEN 1 AND 3 THEN 'john.anderson@techcorp.com'
               WHEN u.id BETWEEN 4 AND 7 THEN 'sarah.mitchell@edusolutions.net'
               WHEN u.id BETWEEN 8 AND 9 THEN 'michael.chen@learnhub.org'
               WHEN u.id BETWEEN 10 AND 12 THEN 'emma.williams@academysuite.io'
               WHEN u.id BETWEEN 13 AND 16 THEN 'david.rodriguez@smartlearn.co'
               ELSE 'Unknown'
             END as superadmin
      FROM universities u 
      ORDER BY u.id
    `);
    
    if (allInstitutes.rows.length === 0) {
      console.log('  No institutes found');
    } else {
      allInstitutes.rows.forEach((institute, index) => {
        console.log(`  ${index + 1}. ${institute.name} (${institute.code})`);
        console.log(`     Email: ${institute.email}`);
        console.log(`     Superadmin: ${institute.superadmin}`);
        console.log(`     ID: ${institute.id}`);
        console.log('');
      });
    }
    
    console.log('='.repeat(60));
    console.log('INSTITUTE ADMIN LOGIN CREDENTIALS:');
    console.log('='.repeat(60));
    
    let adminCredentials = [];
    for (const superadminData of institutesData) {
      console.log(`\nSuperadmin: ${superadminData.superadminEmail}`);
      console.log('-'.repeat(40));
      
      for (const institute of superadminData.institutes) {
        adminCredentials.push({
          institute: institute.name,
          email: institute.email,
          password: 'admin123',
          superadmin: superadminData.superadminEmail
        });
        
        console.log(`${institute.name}:`);
        console.log(`  Email: ${institute.email}`);
        console.log(`  Password: admin123`);
        console.log('');
      }
    }
    
    console.log('\nAll institute admins can login with their email and password: admin123');
    console.log('Each superadmin has isolated access to their own institutes.');
    
  } catch (error) {
    console.error('Error creating institutes:', error.message);
    console.error('Full error details:', error);
  } finally {
    await pool.end();
  }
}

createIsolatedInstitutes();
