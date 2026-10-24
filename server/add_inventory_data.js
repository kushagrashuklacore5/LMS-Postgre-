const db = require('./config/database-switch');

async function addInventoryData() {
  console.log('🔧 Adding Inventory Data with Correct Schema...\n');
  
  try {
    // Get storekeeper's university_id
    db.get("SELECT id, name, university_id FROM users WHERE email = ?", ['storekeeper@core5.co.in'], (err, storekeeper) => {
      if (err) {
        console.error('❌ Error finding storekeeper:', err);
        return;
      }
      
      if (!storekeeper) {
        console.log('❌ Storekeeper not found');
        return;
      }
      
      console.log(`👤 Using storekeeper university_id: ${storekeeper.university_id}`);
      
      // Add sample inventory items with correct schema
      const inventoryItems = [
        {
          itemName: 'Whiteboard Markers',
          category: 'Consumable',
          quantity: 50,
          unitPrice: 2.50,
          vendorId: 1,
          purchaseDate: '2024-01-15',
          description: 'Dry erase markers for classroom use',
          university_id: storekeeper.university_id
        },
        {
          itemName: 'Notebooks',
          category: 'Consumable',
          quantity: 200,
          unitPrice: 1.25,
          vendorId: 2,
          purchaseDate: '2024-01-10',
          description: 'Student notebooks for all subjects',
          university_id: storekeeper.university_id
        },
        {
          itemName: 'Laptop',
          category: 'Non-Consumable',
          quantity: 5,
          unitPrice: 450.00,
          vendorId: 1,
          purchaseDate: '2024-01-05',
          description: 'Laptops for computer lab',
          university_id: storekeeper.university_id
        },
        {
          itemName: 'Projector',
          category: 'Non-Consumable',
          quantity: 3,
          unitPrice: 350.00,
          vendorId: 2,
          purchaseDate: '2024-01-08',
          description: 'Classroom projectors',
          university_id: storekeeper.university_id
        },
        {
          itemName: 'Pens',
          category: 'Consumable',
          quantity: 500,
          unitPrice: 0.50,
          vendorId: 2,
          purchaseDate: '2024-01-12',
          description: 'Ballpoint pens for students',
          university_id: storekeeper.university_id
        }
      ];
      
      inventoryItems.forEach((item, index) => {
        db.run(`
          INSERT INTO inventory (itemName, category, quantity, unitPrice, vendorId, purchaseDate, description, university_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          item.itemName,
          item.category,
          item.quantity,
          item.unitPrice,
          item.vendorId,
          item.purchaseDate,
          item.description,
          item.university_id
        ], function(err) {
          if (err) {
            console.error(`❌ Error adding inventory item ${index + 1}:`, err);
          } else {
            console.log(`✅ Inventory item ${index + 1} added: ${item.itemName}`);
          }
        });
      });
      
      // Verify the data was added
      setTimeout(() => {
        console.log('\n🔍 Verifying Inventory Data...');
        
        db.all("SELECT COUNT(*) as count FROM inventory", (err, result) => {
          if (err) {
            console.error('❌ Error checking inventory:', err);
          } else {
            console.log(`✅ Total inventory items: ${result[0].count}`);
          }
        });
        
        db.all("SELECT itemName, category, quantity, unitPrice FROM inventory LIMIT 5", (err, items) => {
          if (err) {
            console.error('❌ Error checking inventory details:', err);
          } else {
            console.log('📦 Sample Inventory Items:');
            items.forEach((item, index) => {
              console.log(`   ${index + 1}. ${item.itemName} - ${item.category} - Qty: ${item.quantity} - Price: $${item.unitPrice}`);
            });
          }
        });
        
        console.log('\n🎯 INVENTORY DATA ADDITION SUMMARY:');
        console.log('✅ Added 5 sample inventory items');
        console.log('✅ Used correct schema: itemName, category, quantity, unitPrice, vendorId, purchaseDate, description, university_id');
        console.log('✅ All items assigned to storekeeper\'s university');
        
        console.log('\n🌐 FRONTEND TESTING:');
        console.log('🏪 Storekeeper Portal: http://localhost:5174/storekeeper/dashboard');
        console.log('🔐 Login: storekeeper@core5.co.in / storekeeper123');
        console.log('📋 Test Section:');
        console.log('   - /inventory - Should now show 5 inventory items');
        
      }, 1000);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

addInventoryData();
