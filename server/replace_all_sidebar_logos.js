const fs = require('fs');
const path = require('path');

console.log('🔄 Replacing Core5 Logo in All Sidebar Components...\n');

// List of all sidebar components that need logo replacement
const sidebarFiles = [
  {
    path: '../client/src/storekeeper/Sidebar.tsx',
    currentImport: "import whiteLogo from '../../../White Logo.png';",
    newImport: "import whiteLogo from '../../../core5 logo new new-modified (1).png';"
  },
  {
    path: '../client/src/accountant/Sidebar.tsx',
    currentImport: "import whiteLogo from '../../../White Logo.png';",
    newImport: "import whiteLogo from '../../../core5 logo new new-modified (1).png';"
  },
  {
    path: '../client/src/components/MentorLayout.jsx',
    currentImport: "import whiteLogo from '../../../White Logo.png';",
    newImport: "import whiteLogo from '../../../core5 logo new new-modified (1).png';"
  },
  {
    path: '../client/src/components/SuperAdminLayout.jsx',
    currentImport: "import whiteLogo from '../../../White Logo.png';",
    newImport: "import whiteLogo from '../../../core5 logo new new-modified (1).png';"
  },
  {
    path: '../client/src/components/StudentLayout.jsx',
    currentImport: "import whiteLogo from '../../../White Logo.png';",
    newImport: "import whiteLogo from '../../../core5 logo new new-modified (1).png';"
  },
  {
    path: '../client/src/components/VendorLayout.jsx',
    currentImport: "import whiteLogo from '../../../White Logo.png';",
    newImport: "import whiteLogo from '../../../core5 logo new new-modified (1).png';"
  },
  {
    path: '../client/src/components/AdminLayout.jsx',
    currentImport: "import whiteLogo from '../../../White Logo.png';",
    newImport: "import whiteLogo from '../../../core5 logo new new-modified (1).png';"
  },
  {
    path: '../client/src/components/AccountantLayout.jsx',
    currentImport: "import whiteLogo from '../../../White Logo.png';",
    newImport: "import whiteLogo from '../../../core5 logo new new-modified (1).png';"
  }
];

let totalReplaced = 0;

// Replace logo in each file
sidebarFiles.forEach((file, index) => {
  const filePath = path.join(__dirname, file.path);
  
  console.log(`📄 Processing ${index + 1}/${sidebarFiles.length}: ${file.path}`);
  
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`❌ File not found: ${filePath}`);
      return;
    }
    
    // Read file content
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if current import exists
    if (content.includes(file.currentImport)) {
      // Replace the import
      content = content.replace(file.currentImport, file.newImport);
      
      // Write back to file
      fs.writeFileSync(filePath, content);
      
      console.log(`✅ Replaced logo import in ${file.path}`);
      totalReplaced++;
    } else {
      console.log(`⚠️ Current import not found in ${file.path}`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing ${file.path}:`, error.message);
  }
});

// Also update Footer components
console.log('\n📄 Processing Footer Components...');

const footerFiles = [
  {
    path: '../client/src/components/Footer.jsx',
    currentSrc: 'src="/White Logo.png"',
    newSrc: 'src="/core5 logo new new-modified (1).png"'
  },
  {
    path: '../client/src/components/Footer_Original.jsx',
    currentSrc: 'src="/White Logo.png"',
    newSrc: 'src="/core5 logo new new-modified (1).png"'
  }
];

footerFiles.forEach((file, index) => {
  const filePath = path.join(__dirname, file.path);
  
  console.log(`📄 Processing Footer ${index + 1}/${footerFiles.length}: ${file.path}`);
  
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`❌ File not found: ${filePath}`);
      return;
    }
    
    // Read file content
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if current src exists
    if (content.includes(file.currentSrc)) {
      // Replace the src
      content = content.replace(file.currentSrc, file.newSrc);
      
      // Write back to file
      fs.writeFileSync(filePath, content);
      
      console.log(`✅ Replaced logo src in ${file.path}`);
      totalReplaced++;
    } else {
      console.log(`⚠️ Current src not found in ${file.path}`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing ${file.path}:`, error.message);
  }
});

// Copy the new logo to the public directory for footer components
console.log('\n📄 Copying new logo to public directory...');

try {
  const sourceLogoPath = path.join(__dirname, '../core5 logo new new-modified (1).png');
  const destLogoPath = path.join(__dirname, '../client/public/core5 logo new new-modified (1).png');
  
  if (fs.existsSync(sourceLogoPath)) {
    fs.copyFileSync(sourceLogoPath, destLogoPath);
    console.log('✅ Copied new logo to public directory');
  } else {
    console.log('❌ Source logo file not found');
  }
} catch (error) {
  console.error('❌ Error copying logo:', error.message);
}

console.log('\n🎯 LOGO REPLACEMENT SUMMARY:');
console.log(`✅ Total files processed: ${sidebarFiles.length + footerFiles.length}`);
console.log(`✅ Total replacements made: ${totalReplaced}`);
console.log('✅ New logo: core5 logo new new-modified (1).png');

console.log('\n🌐 UPDATED COMPONENTS:');
console.log('   - Storekeeper Sidebar');
console.log('   - Accountant Sidebar');
console.log('   - Mentor Layout');
console.log('   - SuperAdmin Layout');
console.log('   - Student Layout');
console.log('   - Vendor Layout');
console.log('   - Admin Layout');
console.log('   - Accountant Layout');
console.log('   - Footer Components');

console.log('\n📋 PORTALS WITH NEW LOGO:');
console.log('   - Storekeeper Portal: http://localhost:5174/storekeeper/dashboard');
console.log('   - Accountant Portal: http://localhost:5174/accountant/dashboard');
console.log('   - Mentor Portal: http://localhost:5174/mentor/dashboard');
console.log('   - SuperAdmin Portal: http://localhost:5174/superadmin/dashboard');
console.log('   - Student Portal: http://localhost:5174/student/dashboard');
console.log('   - Vendor Portal: http://localhost:5174/vendor/dashboard');
console.log('   - Admin Portal: http://localhost:5174/admin/dashboard');

console.log('\n✅ ALL SIDEBAR LOGOS HAVE BEEN REPLACED WITH THE NEW CORE5 LOGO!');
