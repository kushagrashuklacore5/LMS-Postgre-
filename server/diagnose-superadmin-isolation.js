const db = require('./config/database-switch');

console.log('=== DIAGNOSING SUPERADMIN ISOLATION ISSUE ===');

async function diagnoseIsolation() {
  try {
    // 1. Check all universities and their adminId assignments
    console.log('\n1. ALL UNIVERSITIES AND THEIR ADMIN ASSIGNMENTS:');
    db.all(`
      SELECT id, name, adminId 
      FROM universities 
      ORDER BY adminId
    `, [], (err, universities) => {
      if (err) {
        console.error('Error fetching universities:', err);
        return;
      }
      
      console.log('Universities found:');
      universities.forEach(uni => {
        console.log(`  University ID: ${uni.id}, Name: "${uni.name}", AdminId: ${uni.adminId}`);
      });
      
      // 2. Check all superadmins and their university assignments
      console.log('\n2. ALL SUPERADMINS AND THEIR UNIVERSITY ASSIGNMENTS:');
      db.all(`
        SELECT u.id, u.name, u.email, u.role, u.university_id, uni.name as university_name
        FROM users u
        LEFT JOIN universities uni ON u.university_id = uni.id
        WHERE u.role = 'superadmin'
        ORDER BY u.id
      `, [], (err, superadmins) => {
        if (err) {
          console.error('Error fetching superadmins:', err);
          return;
        }
        
        console.log('SuperAdmins found:');
        superadmins.forEach(sa => {
          console.log(`  SuperAdmin ID: ${sa.id}, Name: "${sa.name}", Email: ${sa.email}`);
          console.log(`    University ID: ${sa.university_id}, University Name: "${sa.university_name}"`);
        });
        
        // 3. Check the relationship between universities and adminId
        console.log('\n3. UNIVERSITY-ADMIN RELATIONSHIP ANALYSIS:');
        
        const adminToUniversities = {};
        universities.forEach(uni => {
          if (!adminToUniversities[uni.adminId]) {
            adminToUniversities[uni.adminId] = [];
          }
          adminToUniversities[uni.adminId].push(uni);
        });
        
        Object.keys(adminToUniversities).forEach(adminId => {
          const unis = adminToUniversities[adminId];
          console.log(`\n  AdminId ${adminId} manages ${unis.length} universities:`);
          unis.forEach(uni => {
            console.log(`    - ${uni.name} (ID: ${uni.id})`);
          });
        });
        
        // 4. Check which superadmin should manage which universities
        console.log('\n4. EXPECTED SUPERADMIN-UNIVERSITY MAPPING:');
        superadmins.forEach(sa => {
          const expectedUniversities = universities.filter(uni => uni.adminId == sa.id);
          console.log(`\n  SuperAdmin ${sa.name} (ID: ${sa.id}):`);
          console.log(`    Should manage ${expectedUniversities.length} universities:`);
          expectedUniversities.forEach(uni => {
            console.log(`      - ${uni.name} (ID: ${uni.id})`);
          });
          
          // Check if superadmin has correct university_id assignment
          if (sa.university_id && expectedUniversities.length > 0) {
            const assignedUni = expectedUniversities.find(uni => uni.id == sa.university_id);
            if (assignedUni) {
              console.log(`    ✅ Correctly assigned to: ${assignedUni.name}`);
            } else {
              console.log(`    ❌ Assigned to university ${sa.university_id} but doesn't manage it`);
            }
          } else {
            console.log(`    ⚠️  No university assignment (should be assigned to one of their universities)`);
          }
        });
        
        // 5. Identify the problem
        console.log('\n5. PROBLEM IDENTIFICATION:');
        
        // Check if multiple superadmins are assigned to same universities
        const universityAssignments = {};
        superadmins.forEach(sa => {
          if (sa.university_id) {
            if (!universityAssignments[sa.university_id]) {
              universityAssignments[sa.university_id] = [];
            }
            universityAssignments[sa.university_id].push(sa);
          }
        });
        
        Object.keys(universityAssignments).forEach(uniId => {
          const sas = universityAssignments[uniId];
          if (sas.length > 1) {
            console.log(`    ❌ University ${uniId} assigned to multiple superadmins:`);
            sas.forEach(sa => {
              console.log(`       - ${sa.name} (ID: ${sa.id})`);
            });
          }
        });
        
        // Check if universities have wrong adminId
        universities.forEach(uni => {
          const managingSuperAdmin = superadmins.find(sa => sa.id == uni.adminId);
          if (!managingSuperAdmin) {
            console.log(`    ❌ University ${uni.name} (ID: ${uni.id}) has adminId ${uni.adminId} but no superadmin with that ID exists`);
          }
        });
        
        // 6. Provide solution
        console.log('\n6. SOLUTION RECOMMENDATIONS:');
        
        console.log('\n   To fix this issue:');
        console.log('   1. Each SuperAdmin should have their own unique universities');
        console.log('   2. University adminId should match the SuperAdmin ID');
        console.log('   3. SuperAdmin university_id should point to one of their managed universities');
        
        console.log('\n   Example fix:');
        console.log('   - SuperAdmin 33 should manage University 4 only');
        console.log('   - SuperAdmin 86 should manage University 5 only');
        console.log('   - Remove shared university assignments');
        
        process.exit(0);
      });
    });
    
  } catch (error) {
    console.error('Error during diagnosis:', error);
    process.exit(1);
  }
}

diagnoseIsolation();
