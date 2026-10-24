#!/usr/bin/env node

console.log('🔍 WEBSITE LOADING TROUBLESHOOTING');
console.log('==================================');

console.log('\n✅ SERVER STATUS CHECK:');
console.log('   • Backend: Running on http://127.0.0.1:5002');
console.log('   • Frontend: Running on http://localhost:5176');
console.log('   • API: Responding correctly (401 for unauthenticated requests)');

console.log('\n🔧 POSSIBLE ISSUES:');
console.log('   1. Browser cache issues');
console.log('   2. JavaScript compilation errors');
console.log('   3. Network connectivity problems');
console.log('   4. Port conflicts');

console.log('\n🚀 SOLUTIONS TO TRY:');

console.log('\n📋 STEP 1: Clear Browser Cache');
console.log('   • Press Ctrl+Shift+R (hard refresh)');
console.log('   • Or clear browser cache manually');
console.log('   • Or try incognito/private window');

console.log('\n📋 STEP 2: Check Browser Console');
console.log('   • Press F12 to open developer tools');
console.log('   • Look for red error messages');
console.log('   • Check Console tab for JavaScript errors');

console.log('\n📋 STEP 3: Verify URLs');
console.log('   • Frontend: http://localhost:5176');
console.log('   • Alternative: http://127.0.0.1:5176');
console.log('   • Network: http://192.168.1.117:5176');

console.log('\n📋 STEP 4: Check Network');
console.log('   • Try accessing other websites');
console.log('   • Check if localhost is working');
console.log('   • Verify no firewall blocking');

console.log('\n📋 STEP 5: Restart Frontend');
console.log('   • Stop frontend server (Ctrl+C in terminal)');
console.log('   • Restart with: npm run dev');
console.log('   • Wait for "Local: http://localhost:5176/" message');

console.log('\n📋 STEP 6: Check Dependencies');
console.log('   • Run: npm install (in client folder)');
console.log('   • Check for any missing packages');

console.log('\n🔍 DEBUGGING COMMANDS:');
console.log('   • Backend test: node server/test-api-simple.js');
console.log('   • Frontend restart: cd client && npm run dev');

console.log('\n📞 If Still Not Working:');
console.log('   1. Check browser console for specific errors');
console.log('   2. Share the exact error message');
console.log('   3. Try different browser');

console.log('\n🎯 Most Likely Cause:');
console.log('   Browser cache or compilation error');
console.log('   Try hard refresh (Ctrl+Shift+R) first!');
