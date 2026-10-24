const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Frontend and Backend Services...\n');

// Function to start a service
function startService(name, command, cwd, color = '\x1b[0m') {
  const child = spawn(command, {
    cwd: cwd,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      console.log(`${color}[${name}]${output ? ': ' + output : ''}\x1b[0m`);
    }
  });
  
  child.stderr.on('data', (data) => {
    const error = data.toString().trim();
    if (error) {
      console.log(`\x1b[31m[${name} ERROR]${error ? ': ' + error : ''}\x1b[0m`);
    }
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`\x1b[31m❌ ${name} exited with code ${code}\x1b[0m`);
    } else {
      console.log(`\x1b[32m✅ ${name} stopped gracefully\x1b[0m`);
    }
  });
  
  return child;
}

// Function to check if port is in use
function checkPort(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();
    
    server.listen(port, () => {
      server.once('close', () => resolve(false));
      server.close();
    });
    
    server.on('error', () => resolve(true));
  });
}

// Main startup function
async function startServices() {
  try {
    console.log('🔍 Checking port availability...');
    
    const backendPortInUse = await checkPort(5002);
    const frontendPortInUse = await checkPort(5174);
    
    if (backendPortInUse) {
      console.log('⚠️ Backend port 5002 is already in use');
      console.log('🔄 You may need to stop existing backend processes');
    }
    
    if (frontendPortInUse) {
      console.log('⚠️ Frontend port 5174 is already in use');
      console.log('🔄 You may need to stop existing frontend processes');
    }
    
    console.log('\n🖥️ Starting Backend Server...');
    const backendPath = path.join(__dirname, '../server');
    const backendProcess = startService('Backend', 'npm start', backendPath, '\x1b[36m');
    
    // Wait a bit for backend to start
    setTimeout(() => {
      console.log('\n🌐 Starting Frontend Server...');
      const frontendPath = path.join(__dirname, '../client');
      const frontendProcess = startService('Frontend', 'npm run dev', frontendPath, '\x1b[35m');
      
      console.log('\n🎉 Services starting...');
      console.log('\n🌐 Access URLs:');
      console.log('   Frontend: http://localhost:5174');
      console.log('   Backend:  http://localhost:5002');
      
      console.log('\n🔐 Test Credentials:');
      console.log('   Storekeeper: storekeeper@core5.co.in / storekeeper123');
      console.log('   Admin: admin@core5.co.in / admin123');
      console.log('   Mentor: debugmentor@pro.com / jp08qyud');
      console.log('   Student: student@core5.co.in / student123');
      
      console.log('\n📋 Portal URLs:');
      console.log('   Storekeeper: http://localhost:5174/storekeeper/dashboard');
      console.log('   Accountant:  http://localhost:5174/accountant/dashboard');
      console.log('   Mentor:      http://localhost:5174/mentor/dashboard');
      console.log('   SuperAdmin:  http://localhost:5174/superadmin/dashboard');
      console.log('   Student:     http://localhost:5174/student/dashboard');
      console.log('   Vendor:      http://localhost:5174/vendor/dashboard');
      console.log('   Admin:       http://localhost:5174/admin/dashboard');
      
      console.log('\n🔧 Services are running. Press Ctrl+C to stop.');
      
      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down services...');
        backendProcess.kill();
        frontendProcess.kill();
        process.exit(0);
      });
      
    }, 3000);
    
  } catch (error) {
    console.error('❌ Failed to start services:', error.message);
    process.exit(1);
  }
}

// Start the services
startServices();
