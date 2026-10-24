const fs = require('fs');

// Read the current file
const filePath = './routes/storekeeperRoutes.js';
const fileContent = fs.readFileSync(filePath, 'utf8');

// Check if module.exports already exists
if (!fileContent.includes('module.exports = router;')) {
  // Add module.exports at the end
  const updatedContent = fileContent + '\nmodule.exports = router;';
  fs.writeFileSync(filePath, updatedContent);
  console.log('✅ Added module.exports to storekeeperRoutes.js');
} else {
  console.log('✅ module.exports already exists in storekeeperRoutes.js');
}
