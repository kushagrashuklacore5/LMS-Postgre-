// The handlers below use the shared LMS database connection.
const db = require('../config/database-switch');
const { isUniqueViolation } = require('../helpers/dbErrors');


class Translation {
  // Create translation table if not exists
  static createTable() {
    const schema = `
      CREATE TABLE IF NOT EXISTS translations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_text TEXT NOT NULL,
        english_text TEXT NOT NULL,
        arabic_text TEXT NOT NULL,
        urdu_text TEXT NOT NULL,
        category TEXT,
        field_name TEXT,
        model_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(original_text, model_name, field_name)
      )
    `;
    
    try {
      db.exec(schema);
      console.log('✅ Translations table initialized');
    } catch (error) {
      console.error('Error creating translations table:', error.message);
    }
  }

  // Create a new translation entry
  static create(data) {
    return new Promise((resolve, reject) => {
      const {
        original_text,
        english_text,
        arabic_text,
        urdu_text,
        category,
        field_name,
        model_name
      } = data;

      const query = `
        INSERT INTO translations (
          original_text,
          english_text,
          arabic_text,
          urdu_text,
          category,
          field_name,
          model_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      db.run(
        query,
        [original_text, english_text, arabic_text, urdu_text, category, field_name, model_name],
        function(err) {
          if (err) {
            if (isUniqueViolation(err)) {
              // Translation already exists, just resolve
              resolve({ id: this.lastID, exists: true });
            } else {
              reject(err);
            }
          } else {
            resolve({ id: this.lastID, exists: false });
          }
        }
      );
    });
  }

  // Get translation by original text
  static async getByText(original_text, model_name = null) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM translations WHERE original_text = ?';
      let params = [original_text];

      if (model_name) {
        query += ' AND model_name = ?';
        params.push(model_name);
      }

      db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Get translation by ID
  static async getById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM translations WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Get all translations for a model
  static async getByModel(model_name) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM translations WHERE model_name = ? ORDER BY created_at DESC',
        [model_name],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Update translation
  static update(id, data) {
    return new Promise((resolve, reject) => {
      const {
        english_text,
        arabic_text,
        urdu_text,
        category
      } = data;

      const query = `
        UPDATE translations
        SET english_text = ?, arabic_text = ?, urdu_text = ?, category = ?, updated_at = utc_now_text()
        WHERE id = ?
      `;

      db.run(
        query,
        [english_text, arabic_text, urdu_text, category, id],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  }

  // Delete translation
  static delete(id) {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM translations WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  // Get translated version based on language
  static async getTranslated(original_text, language = 'en', model_name = null) {
    try {
      const translation = await this.getByText(original_text, model_name);
      
      if (!translation) {
        return original_text; // Return original if no translation found
      }

      const languageField = {
        'en': 'english_text',
        'ar': 'arabic_text',
        'ur': 'urdu_text'
      };

      const field = languageField[language] || 'english_text';
      return translation[field] || original_text;
    } catch (error) {
      console.error('Error getting translated text:', error);
      return original_text;
    }
  }

  // Batch create translations
  static async createBatch(translations) {
    const results = [];
    for (const translation of translations) {
      try {
        const result = await this.create(translation);
        results.push(result);
      } catch (error) {
        console.error('Error in batch creation:', error);
        results.push({ error: error.message });
      }
    }
    return results;
  }

  // Get all translations
  static async getAll(limit = 100, offset = 0) {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM translations ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [limit, offset],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Search translations
  static async search(query) {
    return new Promise((resolve, reject) => {
      const searchQuery = `
        SELECT * FROM translations
        WHERE english_text ILIKE ? OR arabic_text ILIKE ? OR urdu_text ILIKE ?
        ORDER BY created_at DESC
      `;
      const searchTerm = `%${query}%`;

      db.all(searchQuery, [searchTerm, searchTerm, searchTerm], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // Get translation stats
  static async getStats() {
    return new Promise((resolve, reject) => {
      db.get(
        `
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN category = 'announcement' THEN 1 END) as announcements,
          COUNT(CASE WHEN category = 'course' THEN 1 END) as courses,
          COUNT(CASE WHEN category = 'assessment' THEN 1 END) as assessments,
          COUNT(CASE WHEN category = 'user' THEN 1 END) as users,
          COUNT(CASE WHEN category = 'other' THEN 1 END) as other
        FROM translations
        `,
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }
}

module.exports = Translation;
