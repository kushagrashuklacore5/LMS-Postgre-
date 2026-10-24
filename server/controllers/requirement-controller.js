const db = require('../config/database-switch');



/* ================= CREATE REQUIREMENT ================= */
const createRequirement = async (req, res) => {
  try {
    const { classroomName, priority, items } = req.body;
    const teacherId = req.user.userId;
    const teacherName = req.user.name || req.user.email || 'Unknown Teacher';

    console.log("CREATE REQUIREMENT - Request:", { classroomName, priority, items, teacherId, teacherName });

    // Validate input
    if (!classroomName || !priority || !items || !Array.isArray(items) || items.length === 0) {
      console.error("CREATE REQUIREMENT - Invalid input:", { classroomName, priority, items });
      return res.status(400).json({ message: 'Invalid input data' });
    }

    // Create the main requirement
    db.run(`
      INSERT INTO requirements (teacherId, teacherName, classroomName, priority)
      VALUES (?, ?, ?, ?)
    `, [teacherId, teacherName, classroomName, priority], function(err) {
      if (err) {
        console.error("Error creating requirement:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      const requirementId = this.lastID;
      console.log("CREATE REQUIREMENT - Requirement created with ID:", requirementId);

      // Create requirement items
      const itemPromises = items.map(item => {
        return new Promise((resolve, reject) => {
          // Validate item data
          if (!item.itemName || !item.quantity || item.quantity <= 0) {
            reject(new Error('Invalid item data'));
            return;
          }

          db.run(`
            INSERT INTO requirement_items (requirementId, itemName, quantity, status)
            VALUES (?, ?, ?, 'pending')
          `, [requirementId, item.itemName, item.quantity], (err) => {
            if (err) {
              console.error("Error creating requirement item:", err);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });

      Promise.all(itemPromises)
        .then(() => {
          console.log("CREATE REQUIREMENT - All items created successfully");
          
          // Emit socket.io event to notify storekeeper of new requirement
          if (req.io) {
            req.io.emit('requirement:created', {
              requirementId,
              teacherId,
              teacherName,
              classroomName,
              priority,
              itemCount: items.length,
              timestamp: new Date().toISOString()
            });
            console.log("CREATE REQUIREMENT - Socket event emitted for storekeeper");
          }
          
          res.json({ 
            message: 'Requirement created successfully',
            requirementId,
            teacherName,
            classroomName,
            priority
          });
        })
        .catch((err) => {
          console.error("Error creating requirement items:", err);
          res.status(500).json({ message: 'Error creating requirement items: ' + err.message });
        });
    });
  } catch (error) {
    console.error("CREATE REQUIREMENT - Error:", error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

/* ================= GET ALL REQUIREMENTS (STOREKEEPER) ================= */
const getAllRequirements = async (req, res) => {
  try {
    console.log("GET ALL REQUIREMENTS - Request received");

    db.all(`
      SELECT 
        r.id,
        r.teacherId,
        r.teacherName,
        r.classroomName,
        r.priority,
        r.requestedAt,
        r.status,
        ri.id as itemId,
        ri.itemName,
        ri.quantity,
        ri.status as itemStatus
      FROM requirements r
      JOIN users teacher ON teacher.id = r.teacherId
      LEFT JOIN requirement_items ri ON r.id = ri.requirementId
      WHERE teacher.university_id = ?
      ORDER BY r.requestedAt DESC, ri.id
    `, [req.user.universityId], (err, rows) => {
      try {
        if (err) {
          console.error("Database error in getAllRequirements:", err);
          return res.status(500).json({ message: 'Database error: ' + err.message });
        }

        if (!rows || rows.length === 0) {
          console.log("GET ALL REQUIREMENTS - No requirements found");
          return res.json([]);
        }

        // Group items by requirement
        const requirements = {};
        rows.forEach(row => {
          if (!requirements[row.id]) {
            requirements[row.id] = {
              id: row.id,
              teacherName: row.teacherName,
              classroomName: row.classroomName,
              priority: row.priority,
              requestedAt: row.requestedAt,
              status: row.status,
              requirements: []
            };
          }

          if (row.itemId) {
            requirements[row.id].requirements.push({
              id: row.itemId,
              itemName: row.itemName,
              quantity: row.quantity,
              status: row.itemStatus
            });
          }
        });

        const result = Object.values(requirements);
        console.log("GET ALL REQUIREMENTS - Found requirements:", result.length);
        res.json(result);
      } catch (innerError) {
        console.error("GET ALL REQUIREMENTS - Error processing rows:", innerError);
        res.status(500).json({ message: 'Error processing requirements: ' + innerError.message });
      }
    });
  } catch (error) {
    console.error("GET ALL REQUIREMENTS - Error:", error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

/* ================= GET MY REQUIREMENTS (TEACHER) ================= */
const getMyRequirements = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    console.log("=== GET MY REQUIREMENTS ===");
    console.log("Teacher ID from JWT:", teacherId);

    db.all(`
      SELECT 
        r.id,
        r.teacherId,
        r.teacherName,
        r.classroomName,
        r.priority,
        r.requestedAt,
        r.status,
        ri.id as itemId,
        ri.itemName,
        ri.quantity,
        ri.status as itemStatus
      FROM requirements r
      LEFT JOIN requirement_items ri ON r.id = ri.requirementId
      WHERE r.teacherId = ?
      ORDER BY r.requestedAt DESC, ri.id
    `, [teacherId], (err, rows) => {
      try {
        if (err) {
          console.error("Database error in getMyRequirements:", err);
          return res.status(500).json({ message: 'Database error: ' + err.message });
        }

        console.log("Query executed. Rows found:", rows ? rows.length : 0);
        
        if (!rows || rows.length === 0) {
          console.log("No requirements found for teacher ID:", teacherId);
          return res.json([]);
        }

        // Group items by requirement
        const requirements = {};
        rows.forEach(row => {
          if (!requirements[row.id]) {
            requirements[row.id] = {
              id: row.id,
              teacherId: row.teacherId,
              teacherName: row.teacherName,
              classroomName: row.classroomName,
              priority: row.priority,
              requestedAt: row.requestedAt,
              status: row.status,
              requirements: []
            };
          }

          if (row.itemId) {
            requirements[row.id].requirements.push({
              id: row.itemId,
              itemName: row.itemName,
              quantity: row.quantity,
              status: row.itemStatus
            });
          }
        });

        const result = Object.values(requirements);
        console.log("GET MY REQUIREMENTS - Returning", result.length, "requirements");
        res.json(result);
      } catch (innerError) {
        console.error("GET MY REQUIREMENTS - Error processing rows:", innerError);
        res.status(500).json({ message: 'Error processing requirements: ' + innerError.message });
      }
    });
  } catch (error) {
    console.error("GET MY REQUIREMENTS - Error:", error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
};

/* ================= UPDATE REQUIREMENT ITEM STATUS ================= */
const debugDatabase = async (req, res) => {
  try {
    console.log("DEBUG DATABASE - Inspecting requirements tables");
    
    // Check requirements table
    db.all("SELECT * FROM requirements", (err, requirements) => {
      if (err) {
        console.error("Error fetching requirements:", err);
        return res.status(500).json({ message: 'Database error' });
      }
      
      // Check requirement_items table
      db.all("SELECT * FROM requirement_items", (err, items) => {
        if (err) {
          console.error("Error fetching requirement items:", err);
          return res.status(500).json({ message: 'Database error' });
        }
        
        console.log("DEBUG DATABASE - Requirements:", requirements);
        console.log("DEBUG DATABASE - Items:", items);
        
        res.json({
          requirements,
          items,
          count: {
            requirements: requirements.length,
            items: items.length
          }
        });
      });
    });
  } catch (error) {
    console.error("DEBUG DATABASE - Error:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= UPDATE REQUIREMENT ITEM STATUS ================= */
const updateRequirementItemStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { itemId } = req.params;
    
    console.log("UPDATE REQUIREMENT ITEM - STARTING");
    console.log("UPDATE REQUIREMENT ITEM - Request:", { itemId, status });

    // First, get the requirement item to find the requirementId and teacherId
    db.get(`
      SELECT ri.*, r.teacherId, r.classroomName FROM requirement_items ri
      JOIN requirements r ON ri.requirementId = r.id
      JOIN users teacher ON teacher.id = r.teacherId
      WHERE ri.id = ? AND teacher.university_id = ?
    `, [itemId, req.user.universityId], (err, item) => {
      if (err) {
        console.error("Error finding requirement item:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      if (!item) {
        console.error("Requirement item not found:", itemId);
        return res.status(404).json({ message: 'Requirement item not found' });
      }

      // Update the item status
      db.run(`
        UPDATE requirement_items 
        SET status = ? 
        WHERE id = ?
      `, [status, itemId], function(err) {
        if (err) {
          console.error("Error updating requirement item:", err);
          return res.status(500).json({ message: 'Database error' });
        }

        console.log("UPDATE REQUIREMENT ITEM - Updated successfully");

        // Now update the overall requirement status based on all items
        db.all(`
          SELECT status FROM requirement_items WHERE requirementId = ?
        `, [item.requirementId], (err, allItems) => {
          if (err) {
            console.error("Error fetching all requirement items:", err);
            return res.status(500).json({ message: 'Database error' });
          }

          // Calculate overall status
          const allApproved = allItems.every(item => item.status === 'approved');
          const allOutOfStock = allItems.every(item => item.status === 'out_of_stock');
          const someApproved = allItems.some(item => item.status === 'approved');
          const someOutOfStock = allItems.some(item => item.status === 'out_of_stock');

          let newStatus = 'pending';
          if (allApproved) newStatus = 'approved';
          else if (allOutOfStock) newStatus = 'rejected';
          else if (someApproved || someOutOfStock) newStatus = 'partially_approved';

          // Update the main requirement status
          db.run(`
            UPDATE requirements 
            SET status = ?, updatedAt = utc_now_text()
            WHERE id = ?
          `, [newStatus, item.requirementId], (err) => {
            if (err) {
              console.error("Error updating requirement status:", err);
              return res.status(500).json({ message: 'Database error' });
            }

            console.log("UPDATE REQUIREMENT ITEM - Overall status updated to:", newStatus);
            
            // ============ INVENTORY MANAGEMENT ============
            if (status === 'approved') {
              // Deduct from inventory when approved
              console.log(`INVENTORY: Deducting ${item.quantity} units of ${item.itemName}`);
              db.run(`
                UPDATE inventory 
                SET quantity = GREATEST(0, quantity - ?)
                WHERE itemName = ?
              `, [item.quantity, item.itemName], (invErr) => {
                if (invErr) {
                  console.error("Error updating inventory:", invErr);
                }else {
                  console.log(`INVENTORY: Successfully deducted ${item.quantity} units of ${item.itemName}`);
                }
                sendSuccessResponse();
              });
            } else if (status === 'out_of_stock') {
              // Auto-restock logic for out of stock
              console.log(`AUTO-RESTOCK: Starting restock for ${item.itemName}, quantity: ${item.quantity}`);
              
              // Create order with 'restocking' status
              db.run(`
                INSERT INTO orders (itemName, quantity, status, createdAt, classroom)
                VALUES (?, ?, 'restocking', utc_now_text(), ?)
              `, [item.itemName, item.quantity, item.classroomName], function(ordErr) {
                if (ordErr) {
                  console.error("Error creating restock order:", ordErr);
                  return sendSuccessResponse();
                }
                
                const orderId = this.lastID;
                console.log(`AUTO-RESTOCK: Order created with ID ${orderId}`);
                
                // After 10 seconds, change status to 'in stock' and add to inventory
                setTimeout(() => {
                  console.log(`AUTO-RESTOCK: Changing order ${orderId} status to in_stock and adding to inventory`);
                  
                  // Update order status
                  db.run(`
                    UPDATE orders 
                    SET status = 'in_stock'
                    WHERE id = ?
                  `, [orderId], (updateErr) => {
                    if (updateErr) {
                      console.error("Error updating order status:", updateErr);
                    }
                  });
                  
                  // Add to inventory
                  db.run(`
                    UPDATE inventory 
                    SET quantity = quantity + ?
                    WHERE itemName = ?
                  `, [item.quantity, item.itemName], (invErr2) => {
                    if (invErr2) {
                      console.error("Error adding to inventory:", invErr2);
                    } else {
                      console.log(`AUTO-RESTOCK: Added ${item.quantity} units of ${item.itemName} to inventory`);
                    }
                    
                    // Emit socket event to notify update
                    if (req.io) {
                      req.io.emit('inventory:updated', {
                        itemName: item.itemName,
                        quantity: item.quantity,
                        action: 'restock_completed',
                        timestamp: new Date().toISOString()
                      });
                    }
                  });
                }, 10000); // 10 seconds
                
                sendSuccessResponse();
              });
            } else {
              sendSuccessResponse();
            }
            
            function sendSuccessResponse() {
              // Emit socket.io events for real-time updates
              if (req.io) {
                // Notify storekeeper of the update
                req.io.emit('requirement:updated', {
                  requirementId: item.requirementId,
                  itemId: itemId,
                  itemStatus: status,
                  overallStatus: newStatus,
                  timestamp: new Date().toISOString()
                });
                
                // Notify the specific teacher about the status change
                req.io.emit(`teacher:${item.teacherId}:requirement-update`, {
                  requirementId: item.requirementId,
                  itemId: itemId,
                  itemStatus: status,
                  overallStatus: newStatus,
                  timestamp: new Date().toISOString()
                });
                
                console.log("UPDATE REQUIREMENT ITEM - Socket events emitted for teacher and storekeeper");
              }
              
              res.json({ 
                message: 'Requirement item updated successfully',
                overallStatus: newStatus,
                itemStatus: status
              });
            }
          });
        });
      });
    });
  } catch (error) {
    console.error("UPDATE REQUIREMENT ITEM - Error:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  createRequirement,
  getAllRequirements,
  getMyRequirements,
  updateRequirementItemStatus,
  debugDatabase
};
