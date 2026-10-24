#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('Updating all database imports to use database-switch...');

const serverDir = path.join(__dirname);
const filesToUpdate = [];

// Find all JavaScript files in server directory
function findJSFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      findJSFiles(filePath, fileList);
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

// Find files with sqlite-db imports
function findFilesWithSqliteImports(files) {
  const filesWithImports = [];
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for sqlite-db imports
      if (content.includes("require('config/database-switch')") || 
          content.includes("require('config/database-switch')") ||
          content.includes("require('config/database-switch')") ||
          content.includes("require('config/database-switch')") ||
          content.includes("require('config/database-switch')") ||
          content.includes("require('config/database-switch')")) {
        filesWithImports.push(file);
      }
    } catch (error) {
      console.error(`Error reading ${file}:`, error.message);
    }
  }
  
  return filesWithImports;
}

// Update database imports
function updateDatabaseImports(files) {
  let updatedCount = 0;
  
  for (const file of files) {
    try {
      let content = fs.readFileSync(file, 'utf8');
      let modified = false;
      
      // Update various sqlite-db import patterns
      const patterns = [
        "require('config/database-switch')",
        "require('config/database-switch')",
        "require('config/database-switch')",
        "require('config/database-switch')",
        "require('config/database-switch')",
        "require('config/database-switch')"
      ];
      
      for (const pattern of patterns) {
        if (content.includes(pattern)) {
          // Calculate relative path to database-switch
          const fileDir = path.dirname(file);
          const configDir = path.join(__dirname, 'config');
          const relativePath = path.relative(fileDir, configDir).replace(/\\/g, '/');
          
          const newImport = `require('${relativePath}/database-switch')`;
          content = content.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newImport);
          modified = true;
        }
      }
      
      if (modified) {
        fs.writeFileSync(file, content);
        updatedCount++;
        console.log(`Updated: ${path.relative(serverDir, file)}`);
      }
    } catch (error) {
      console.error(`Error updating ${file}:`, error.message);
    }
  }
  
  return updatedCount;
}

// Main execution
async function main() {
  try {
    console.log('Scanning for JavaScript files...');
    const allJSFiles = findJSFiles(serverDir);
    console.log(`Found ${allJSFiles.length} JavaScript files`);
    
    console.log('Finding files with sqlite-db imports...');
    const filesWithImports = findFilesWithSqliteImports(allJSFiles);
    console.log(`Found ${filesWithImports.length} files with sqlite-db imports`);
    
    if (filesWithImports.length === 0) {
      console.log('No files need updating!');
      return;
    }
    
    console.log('Updating database imports...');
    const updatedCount = updateDatabaseImports(filesWithImports);
    
    console.log(`\n==========================================`);
    console.log(`           UPDATE COMPLETED!`);
    console.log(`==========================================`);
    console.log(`Files updated: ${updatedCount}`);
    console.log(`All files now use database-switch.js`);
    console.log(`\nThe project will automatically use PostgreSQL`);
    console.log(`when USE_POSTGRES=true is set in .env`);
    
  } catch (error) {
    console.error('Error during update:', error);
  }
}

main();
