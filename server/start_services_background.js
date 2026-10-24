const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Frontend and Backend Services in Background...\n');

// Function to start a service in background
function startServiceBackground(name, command, cwd) {
  const child = spawn(command, {
    cwd: cwd,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
    windowsHide: true
  });
  
  // Detach from parent process
  child.unref();
  
  console.log(`✅ ${name} started in background (PID: ${child.pid})`);
  
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
      console.log('🔄 Backend may already be running');
    } else {
      console.log('🖥️ Starting Backend Server...');
      const backendPath = path.join(__dirname, '../server');
      startServiceBackground('Backend', 'npm start', backendPath);
    }
    
    if (frontendPortInUse) {
      console.log('⚠️ Frontend port 5174 is already in use');
      console.log('🔄 Frontend may already be running');
    } else {
      // Wait a bit for backend to start
      setTimeout(() => {
        console.log('🌐 Starting Frontend Server...');
        const frontendPath = path.join(__dirname, '../client');
        startServiceBackground('Frontend', 'npm run dev', frontendPath);
      }, 3000);
    }
    
    console.log('\n🎉 Services started in background!');
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
    
    console.log('\n✅ Services are now running in background!');
    console.log('📝 This terminal can now be closed safely.');
    console.log('🔧 To stop services, use Task Manager or kill node.exe processes.');
    
    // Exit the script after starting services
    setTimeout(() => {
      process.exit(0);
    }, 2000);
    
  } catch (error) {
    console.error('❌ Failed to start services:', error.message);
    process.exit(1);
  }
}

// Start the services
startServices();
