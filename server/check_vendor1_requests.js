const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('=== Checking Stock Requests for Vendor1 ===\n');

// Vendor1 details
const vendorId = 16; // vendor1@gmail.com
const userEmail = 'vendor1@gmail.com';

console.log(`Checking for stock requests assigned to Vendor ID: ${vendorId} (${userEmail})\n`);

// Check stock requests that have items for this vendor
console.log('1. Checking stock requests with items for vendor 16...');
db.all(`
  SELECT 
    sr.id as request_id,
    sr.title,
    sr.description,
    sr.status,
    sr.created_at,
    sri.id as item_id,
    sri.item_name,
    sri.category,
    sri.quantity_requested,
    sri.vendor_id,
    sr.requested_by
  FROM stock_requests sr
  JOIN stock_request_items sri ON sr.id = sri.request_id
  WHERE sri.vendor_id = ?
  ORDER BY sr.created_at DESC
`, [vendorId], (err, requests) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  if (requests.length > 0) {
    console.log(`✅ Found ${requests.length} stock request items for vendor 16:`);
    
    // Group by request
    const groupedRequests = {};
    requests.forEach(req => {
      if (!groupedRequests[req.request_id]) {
        groupedRequests[req.request_id] = {
          id: req.request_id,
          title: req.title,
          description: req.description,
          status: req.status,
          created_at: req.created_at,
          requested_by: req.requested_by,
          items: []
        };
      }
      groupedRequests[req.request_id].items.push({
        item_id: req.item_id,
        item_name: req.item_name,
        category: req.category,
        quantity_requested: req.quantity_requested,
        vendor_id: req.vendor_id
      });
    });
    
    Object.values(groupedRequests).forEach((request, index) => {
      console.log(`\n📋 Request ${index + 1}:`);
      console.log(`- Request ID: ${request.id}`);
      console.log(`- Title: ${request.title}`);
      console.log(`- Description: ${request.description}`);
      console.log(`- Status: ${request.status}`);
      console.log(`- Requested By: ${request.requested_by}`);
      console.log(`- Created: ${request.created_at}`);
      console.log(`- Items: ${request.items.length}`);
      
      request.items.forEach((item, itemIndex) => {
        console.log(`  Item ${itemIndex + 1}: ${item.item_name} (${item.quantity_requested})`);
      });
    });
    
  } else {
    console.log('❌ No stock requests found for vendor 16');
    
    // Check if there are any stock requests at all
    console.log('\n2. Checking all stock requests in database...');
    db.all('SELECT * FROM stock_requests ORDER BY created_at DESC LIMIT 5', (err, allRequests) => {
      if (err) {
        console.error('Error:', err);
        return;
      }
      
      if (allRequests.length > 0) {
        console.log(`Found ${allRequests.length} total stock requests:`);
        allRequests.forEach((req, index) => {
          console.log(`\nRequest ${index + 1}:`);
          console.log(`- ID: ${req.id}`);
          console.log(`- Title: ${req.title}`);
          console.log(`- Status: ${req.status}`);
          console.log(`- Created: ${req.created_at}`);
        });
        
        // Check stock request items
        console.log('\n3. Checking stock request items...');
        db.all('SELECT * FROM stock_request_items ORDER BY request_id', (err, items) => {
          if (err) {
            console.error('Error:', err);
            return;
          }
          
          if (items.length > 0) {
            console.log(`Found ${items.length} stock request items:`);
            items.forEach((item, index) => {
              console.log(`Item ${index + 1}:`);
              console.log(`- Request ID: ${item.request_id}`);
              console.log(`- Item Name: ${item.item_name}`);
              console.log(`- Vendor ID: ${item.vendor_id}`);
              console.log(`- Quantity: ${item.quantity_requested}`);
            });
            
            // Check if any items have vendor_id = 16
            const vendor16Items = items.filter(item => item.vendor_id === 16);
            console.log(`\n🎯 Items specifically for Vendor 16: ${vendor16Items.length}`);
            
            if (vendor16Items.length === 0) {
              console.log('❌ No stock request items are assigned to vendor 16');
              console.log('💡 This means no requests have been sent to vendor1@gmail.com');
            }
          } else {
            console.log('❌ No stock request items found at all');
          }
          
          checkVendorMapping(vendorId);
        });
      } else {
        console.log('❌ No stock requests found in database at all');
        console.log('💡 Storekeeper needs to create stock requests first');
        checkVendorMapping(vendorId);
      }
    });
  }
});

function checkVendorMapping(vendorId) {
  console.log('\n4. Checking vendor mapping in API...');
  
  // Simulate the vendor authentication mapping
  db.get('SELECT id FROM vendors WHERE email = (SELECT email FROM users WHERE id = ?)', [36], (err, vendorRow) => {
    if (err) {
      console.error('Error:', err);
      return;
    }
    
    if (vendorRow) {
      console.log(`✅ API mapping works: User ID 36 → Vendor ID ${vendorRow.id}`);
      
      if (vendorRow.id !== vendorId) {
        console.log(`❌ Mismatch: Expected Vendor ID ${vendorId}, got ${vendorRow.id}`);
      } else {
        console.log(`✅ Vendor ID mapping is correct: ${vendorId}`);
      }
    } else {
      console.log('❌ Vendor mapping failed');
    }
    
    console.log('\n=== Summary ===');
    console.log('🎯 If no requests are showing, it means:');
    console.log('1. Storekeeper has not created any stock requests');
    console.log('2. Or requests were created but not assigned to vendor 16');
    console.log('3. Or vendor authentication mapping is incorrect');
    
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('\n✅ Database connection closed');
      }
    });
  });
}
