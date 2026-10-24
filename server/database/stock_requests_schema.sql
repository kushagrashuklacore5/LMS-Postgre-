-- Enhanced Stock Request System Database Schema
-- This script creates tables for the new advanced stock request system

-- Drop existing tables if they exist (for clean re-creation)
DROP TABLE IF EXISTS stock_request_items;
DROP TABLE IF EXISTS stock_requests;
DROP TABLE IF EXISTS request_templates;
DROP TABLE IF EXISTS vendor_quotes;
DROP TABLE IF EXISTS request_notifications;

-- Enhanced stock requests table
CREATE TABLE stock_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_number VARCHAR(20) UNIQUE NOT NULL,
    storekeeper_id INTEGER NOT NULL,
    university_id INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    urgency_level VARCHAR(10) DEFAULT 'normal' CHECK (urgency_level IN ('low', 'normal', 'high', 'critical')),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'quoted', 'approved', 'rejected', 'ordered', 'delivered', 'cancelled')),
    total_amount DECIMAL(10,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'INR',
    expected_delivery_date DATE,
    budget_code VARCHAR(50),
    department VARCHAR(100),
    requested_by VARCHAR(100),
    approved_by INTEGER,
    approved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (storekeeper_id) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Stock request items table (for multi-item requests)
CREATE TABLE stock_request_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    vendor_id INTEGER,
    item_name VARCHAR(200) NOT NULL,
    item_code VARCHAR(50),
    category VARCHAR(100),
    quantity_requested INTEGER NOT NULL,
    quantity_approved INTEGER DEFAULT 0,
    unit_price DECIMAL(10,2),
    total_price DECIMAL(10,2),
    specifications TEXT,
    attachments TEXT, -- JSON array of file paths
    preferred_brand VARCHAR(100),
    alternatives_allowed BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES stock_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);

-- Request templates for frequently used items
CREATE TABLE request_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    university_id INTEGER NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    items JSON NOT NULL, -- Array of template items
    created_by INTEGER NOT NULL,
    is_public BOOLEAN DEFAULT false,
    usage_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (university_id) REFERENCES universities(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Vendor quotes for stock requests
CREATE TABLE vendor_quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    vendor_id INTEGER NOT NULL,
    quote_number VARCHAR(50) UNIQUE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    valid_until DATE,
    delivery_terms TEXT,
    payment_terms TEXT,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    quote_file VARCHAR(255), -- Path to quote PDF/document
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES stock_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);

-- Vendor quote items
CREATE TABLE vendor_quote_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER NOT NULL,
    request_item_id INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    availability VARCHAR(100),
    lead_time INTEGER, -- in days
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quote_id) REFERENCES vendor_quotes(id) ON DELETE CASCADE,
    FOREIGN KEY (request_item_id) REFERENCES stock_request_items(id) ON DELETE CASCADE
);

-- Request notifications
CREATE TABLE request_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('created', 'updated', 'quoted', 'approved', 'rejected', 'delivered')),
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES stock_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create indexes for better performance
CREATE INDEX idx_stock_requests_storekeeper ON stock_requests(storekeeper_id);
CREATE INDEX idx_stock_requests_university ON stock_requests(university_id);
CREATE INDEX idx_stock_requests_status ON stock_requests(status);
CREATE INDEX idx_stock_requests_created_at ON stock_requests(created_at);
CREATE INDEX idx_stock_request_items_request ON stock_request_items(request_id);
CREATE INDEX idx_stock_request_items_vendor ON stock_request_items(vendor_id);
CREATE INDEX idx_vendor_quotes_request ON vendor_quotes(request_id);
CREATE INDEX idx_vendor_quotes_vendor ON vendor_quotes(vendor_id);
CREATE INDEX idx_notifications_user ON request_notifications(user_id);
CREATE INDEX idx_notifications_read ON request_notifications(is_read);

-- Insert sample data for testing
INSERT INTO stock_requests (
    request_number, storekeeper_id, university_id, title, description, urgency_level, status, total_amount
) VALUES 
('SR-2026-001', 1, 1, 'Computer Lab Equipment', 'New computers and accessories for computer lab', 'high', 'pending', 250000.00),
('SR-2026-002', 1, 1, 'Library Books', 'Academic books for semester', 'normal', 'approved', 45000.00),
('SR-2026-003', 1, 1, 'Office Stationery', 'Monthly stationery supplies', 'low', 'delivered', 8500.00);

-- Insert sample request items
INSERT INTO stock_request_items (
    request_id, vendor_id, item_name, category, quantity_requested, unit_price, total_price
) VALUES 
(1, 1, 'Laptop Computer', 'Electronics', 10, 25000.00, 250000.00),
(2, 2, 'Programming Textbook', 'Books', 50, 900.00, 45000.00),
(3, 3, 'A4 Paper Pack', 'Stationery', 100, 85.00, 8500.00);

-- Insert sample templates
INSERT INTO request_templates (
    university_id, name, description, category, items, created_by, is_public
) VALUES 
(1, 'Computer Lab Setup', 'Standard computer lab equipment package', 'Electronics', 
 '[{"item_name":"Laptop Computer","quantity":10,"category":"Electronics"},{"item_name":"Mouse","quantity":10,"category":"Electronics"},{"item_name":"Keyboard","quantity":10,"category":"Electronics"}]', 
 1, true),
(1, 'Office Stationery Kit', 'Monthly office supplies', 'Stationery',
 '[{"item_name":"A4 Paper Pack","quantity":50,"category":"Stationery"},{"item_name":"Pen Set","quantity":20,"category":"Stationery"}]',
 1, true);

-- Create trigger for updating updated_at timestamp
CREATE TRIGGER update_stock_requests_timestamp 
    AFTER UPDATE ON stock_requests
    FOR EACH ROW
    BEGIN
        UPDATE stock_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_request_templates_timestamp 
    AFTER UPDATE ON request_templates
    FOR EACH ROW
    BEGIN
        UPDATE request_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_vendor_quotes_timestamp 
    AFTER UPDATE ON vendor_quotes
    FOR EACH ROW
    BEGIN
        UPDATE vendor_quotes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
