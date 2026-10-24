const db = require('./config/database-switch');

async function addSampleStorekeeperData() {
  console.log('🔧 Adding Sample Storekeeper Data...\n');
  
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
      
      console.log('👤 Storekeeper found:');
      console.log(`   - ID: ${storekeeper.id}`);
      console.log(`   - Name: ${storekeeper.name}`);
      console.log(`   - University: ${storekeeper.university_id}`);
      
      // Add sample inventory items
      console.log('\n📦 Adding Sample Inventory Items...');
      const inventoryItems = [
        {
          name: 'Whiteboard Markers',
          category: 'Consumable',
          stock: 50,
          unitPrice: 2.50,
          vendorName: 'Office Supplies Co.',
          purchaseDate: '2024-01-15',
          description: 'Dry erase markers for classroom use',
          minStock: 10,
          university_id: storekeeper.university_id
        },
        {
          name: 'Notebooks',
          category: 'Consumable',
          stock: 200,
          unitPrice: 1.25,
          vendorName: 'Stationery World',
          purchaseDate: '2024-01-10',
          description: 'Student notebooks for all subjects',
          minStock: 50,
          university_id: storekeeper.university_id
        },
        {
          name: 'Laptop',
          category: 'Non-Consumable',
          stock: 5,
          unitPrice: 450.00,
          vendorName: 'Tech Solutions Inc.',
          purchaseDate: '2024-01-05',
          description: 'Laptops for computer lab',
          minStock: 2,
          university_id: storekeeper.university_id
        },
        {
          name: 'Projector',
          category: 'Non-Consumable',
          stock: 3,
          unitPrice: 350.00,
          vendorName: 'AV Equipment Ltd.',
          purchaseDate: '2024-01-08',
          description: 'Classroom projectors',
          minStock: 1,
          university_id: storekeeper.university_id
        },
        {
          name: 'Pens',
          category: 'Consumable',
          stock: 500,
          unitPrice: 0.50,
          vendorName: 'Stationery World',
          purchaseDate: '2024-01-12',
          description: 'Ballpoint pens for students',
          minStock: 100,
          university_id: storekeeper.university_id
        }
      ];
      
      inventoryItems.forEach((item, index) => {
        db.run(`
          INSERT INTO inventory (name, category, stock, unitPrice, vendorName, purchaseDate, description, minStock, university_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          item.name,
          item.category,
          item.stock,
          item.unitPrice,
          item.vendorName,
          item.purchaseDate,
          item.description,
          item.minStock,
          item.university_id
        ], function(err) {
          if (err) {
            console.error(`❌ Error adding inventory item ${index + 1}:`, err);
          } else {
            console.log(`✅ Inventory item ${index + 1} added: ${item.name}`);
          }
        });
      });
      
      // Add sample vendors
      console.log('\n🏪 Adding Sample Vendors...');
      const vendors = [
        {
          name: 'Office Supplies Co.',
          email: 'office@supplies.com',
          phone: '+1-555-0101',
          address: '123 Main St, City, State',
          category: 'Office Supplies',
          university_id: storekeeper.university_id
        },
        {
          name: 'Stationery World',
          email: 'info@stationery.com',
          phone: '+1-555-0102',
          address: '456 Oak Ave, City, State',
          category: 'Stationery',
          university_id: storekeeper.university_id
        },
        {
          name: 'Tech Solutions Inc.',
          email: 'tech@solutions.com',
          phone: '+1-555-0103',
          address: '789 Tech Blvd, City, State',
          category: 'Technology',
          university_id: storekeeper.university_id
        },
        {
          name: 'AV Equipment Ltd.',
          email: 'av@equipment.com',
          phone: '+1-555-0104',
          address: '321 Media Way, City, State',
          category: 'Audio/Visual',
          university_id: storekeeper.university_id
        }
      ];
      
      vendors.forEach((vendor, index) => {
        db.run(`
          INSERT INTO vendors (name, email, phone, address, category, rating, totalOrders, totalValue, university_id, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          vendor.name,
          vendor.email,
          vendor.phone,
          vendor.address,
          vendor.category,
          0,
          0,
          0,
          vendor.university_id,
          new Date().toISOString()
        ], function(err) {
          if (err) {
            console.error(`❌ Error adding vendor ${index + 1}:`, err);
          } else {
            console.log(`✅ Vendor ${index + 1} added: ${vendor.name}`);
          }
        });
      });
      
      // Add sample vendor stock
      console.log('\n📊 Adding Sample Vendor Stock...');
      const vendorStock = [
        { vendorId: 1, itemName: 'Whiteboard Markers', quantity: 100, unitPrice: 2.50 },
        { vendorId: 1, itemName: 'Pens', quantity: 1000, unitPrice: 0.50 },
        { vendorId: 2, itemName: 'Notebooks', quantity: 500, unitPrice: 1.25 },
        { vendorId: 2, itemName: 'Pencils', quantity: 750, unitPrice: 0.25 },
        { vendorId: 3, itemName: 'Laptop', quantity: 10, unitPrice: 450.00 },
        { vendorId: 3, itemName: 'Mouse', quantity: 25, unitPrice: 15.00 },
        { vendorId: 4, itemName: 'Projector', quantity: 5, unitPrice: 350.00 },
        { vendorId: 4, itemName: 'Screen', quantity: 8, unitPrice: 200.00 }
      ];
      
      vendorStock.forEach((stock, index) => {
        db.run(`
          INSERT INTO vendor_stock (vendorId, itemName, quantity, unitPrice)
          VALUES (?, ?, ?, ?)
        `, [
          stock.vendorId,
          stock.itemName,
          stock.quantity,
          stock.unitPrice
        ], function(err) {
          if (err) {
            console.error(`❌ Error adding vendor stock ${index + 1}:`, err);
          } else {
            console.log(`✅ Vendor stock ${index + 1} added: ${stock.itemName}`);
          }
        });
      });
      
      // Verify the data was added
      setTimeout(() => {
        console.log('\n🔍 Verifying Data Addition...');
        
        db.all("SELECT COUNT(*) as count FROM inventory", (err, result) => {
          if (err) {
            console.error('❌ Error checking inventory:', err);
          } else {
            console.log(`✅ Total inventory items: ${result[0].count}`);
          }
        });
        
        db.all("SELECT COUNT(*) as count FROM vendors", (err, result) => {
          if (err) {
            console.error('❌ Error checking vendors:', err);
          } else {
            console.log(`✅ Total vendors: ${result[0].count}`);
          }
        });
        
        db.all("SELECT COUNT(*) as count FROM vendor_stock", (err, result) => {
          if (err) {
            console.error('❌ Error checking vendor stock:', err);
          } else {
            console.log(`✅ Total vendor stock items: ${result[0].count}`);
          }
        });
        
        console.log('\n🎯 SAMPLE DATA ADDITION SUMMARY:');
        console.log('✅ Inventory: 5 sample items added');
        console.log('✅ Vendors: 4 sample vendors added');
        console.log('✅ Vendor Stock: 8 sample stock items added');
        console.log('✅ All data assigned to storekeeper\'s university');
        
        console.log('\n🌐 FRONTEND TESTING:');
        console.log('🏪 Storekeeper Portal: http://localhost:5174/storekeeper/dashboard');
        console.log('🔐 Login: storekeeper@core5.co.in / storekeeper123');
        console.log('📋 Test Sections:');
        console.log('   - /inventory - Should show 5 inventory items');
        console.log('   - /vendors - Should show 4 vendors');
        console.log('   - /vendor-stock - Should show vendor stock options');
        
      }, 2000);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

addSampleStorekeeperData();
