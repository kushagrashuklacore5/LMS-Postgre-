const db = require('config/database-switch');

// Get vendor ID
db.get('SELECT id FROM vendors WHERE name LIKE "%Dell%" LIMIT 1', (err, vendor) => {
  if (err) {
    console.error('Error finding vendor:', err);
    return;
  }

  if (!vendor) {
    console.log('No vendor found, please create a vendor first');
    return;
  }

  // Get storekeeper user ID
  db.get('SELECT id FROM users WHERE role = "storekeeper" LIMIT 1', (err, storekeeper) => {
    if (err) {
      console.error('Error finding storekeeper:', err);
      return;
    }

    if (!storekeeper) {
      console.log('No storekeeper found, please create a storekeeper user first');
      return;
    }

    // Create sample stock request
    const requestData = {
      request_number: `SR-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      storekeeper_id: storekeeper.id,
      university_id: 1,
      title: 'Computer Equipment Request',
      description: 'Need laptops and chairs for new computer lab',
      urgency_level: 'high',
      expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      total_amount: 50000
    };

    db.run(`
      INSERT INTO stock_requests (
        request_number, storekeeper_id, university_id, title, description,
        urgency_level, expected_delivery_date, total_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      requestData.request_number,
      requestData.storekeeper_id,
      requestData.university_id,
      requestData.title,
      requestData.description,
      requestData.urgency_level,
      requestData.expected_delivery_date,
      requestData.total_amount
    ], function(err) {
      if (err) {
        console.error('Error creating stock request:', err);
        return;
      }

      const requestId = this.lastID;

      // Add request items
      const items = [
        {
          request_id: requestId,
          vendor_id: vendor.id,
          item_name: 'Laptop Dell Inspiron',
          item_code: 'LT-001',
          category: 'Electronics',
          quantity_requested: 5,
          unit_price: 899.99,
          total_price: 5 * 899.99,
          specifications: '16GB RAM, 512GB SSD, Intel i7',
          preferred_brand: 'Dell',
          alternatives_allowed: true
        },
        {
          request_id: requestId,
          vendor_id: vendor.id,
          item_name: 'Office Chair',
          item_code: 'CH-001',
          category: 'Furniture',
          quantity_requested: 10,
          unit_price: 199.99,
          total_price: 10 * 199.99,
          specifications: 'Ergonomic office chair with lumbar support',
          preferred_brand: 'Any',
          alternatives_allowed: false
        }
      ];

      items.forEach(item => {
        db.run(`
          INSERT INTO stock_request_items (
            request_id, vendor_id, item_name, item_code, category,
            quantity_requested, unit_price, total_price, specifications,
            preferred_brand, alternatives_allowed
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          item.request_id,
          item.vendor_id,
          item.item_name,
          item.item_code,
          item.category,
          item.quantity_requested,
          item.unit_price,
          item.total_price,
          item.specifications,
          item.preferred_brand,
          item.alternatives_allowed
        ], (err) => {
          if (err) {
            console.error('Error adding request item:', err);
          } else {
            console.log(`✅ Request item added: ${item.item_name}`);
          }
        });
      });

      console.log(`✅ Sample stock request created: ${requestData.request_number}`);
      console.log(`Request ID: ${requestId}`);
      console.log('This request will be visible in vendor portal');
    });
  });
});
