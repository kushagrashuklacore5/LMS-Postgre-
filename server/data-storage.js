const fs = require('fs');
const path = require('path');

// Data storage paths
const DATA_DIR = path.join(__dirname, 'data');
const UNIVERSITIES_FILE = path.join(DATA_DIR, 'universities.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Read data from file
const readData = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return {};
  }
};

// Write data to file
const writeData = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    return false;
  }
};

// Get universities for superadmin
const getUniversities = (superadminId) => {
  const data = readData(UNIVERSITIES_FILE);
  return data[superadminId] || [];
};

// Save universities for superadmin
const saveUniversities = (superadminId, universities) => {
  const data = readData(UNIVERSITIES_FILE);
  data[superadminId] = universities;
  return writeData(UNIVERSITIES_FILE, data);
};

// Get users for superadmin
const getUsers = (superadminId) => {
  const data = readData(USERS_FILE);
  return data[superadminId] || [];
};

// Save users for superadmin
const saveUsers = (superadminId, users) => {
  const data = readData(USERS_FILE);
  data[superadminId] = users;
  return writeData(USERS_FILE, data);
};

// Add university to superadmin's collection
const addUniversity = (superadminId, university) => {
  const universities = getUniversities(superadminId);
  universities.push(university);
  return saveUniversities(superadminId, universities);
};

// Add user to superadmin's collection
const addUser = (superadminId, user) => {
  const users = getUsers(superadminId);
  users.push(user);
  return saveUsers(superadminId, users);
};

module.exports = {
  getUniversities,
  saveUniversities,
  getUsers,
  saveUsers,
  addUniversity,
  addUser
};
