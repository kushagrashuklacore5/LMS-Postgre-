const fs = require('fs');
const path = require('path');

console.log('🗑️ Deleting all .md files...\n');

function deleteMdFiles(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules directory to avoid deleting dependency documentation
      if (file !== 'node_modules') {
        deleteMdFiles(filePath);
      }
    } else if (file.endsWith('.md')) {
      try {
        fs.unlinkSync(filePath);
        console.log(`✅ Deleted: ${filePath}`);
      } catch (error) {
        console.log(`❌ Error deleting ${filePath}: ${error.message}`);
      }
    }
  }
}

// Start from the main project directory
const projectRoot = path.join(__dirname, '..');
deleteMdFiles(projectRoot);

console.log('\n✅ All .md files deleted successfully!');
