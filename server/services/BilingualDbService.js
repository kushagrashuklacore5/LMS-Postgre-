const axios = require('axios');



const LIBRETRA_API_URL = 'http://localhost:5000/translate';

class BilingualDbService {
  /**
   * Translate text to Arabic using LibreTranslate
   */
  static async translateToArabic(text) {
    if (!text || typeof text !== 'string') return text;
    
    try {
      const response = await axios.post(LIBRETRA_API_URL, {
        q: text,
        source: 'en',
        target: 'ar',
      }, { timeout: 5000 });

      return response.data?.translatedText || text;
    } catch (error) {
      console.warn(`Translation to Arabic failed for: "${text.substring(0, 50)}..."`);
      return text; // Return original if translation fails
    }
  }

  /**
   * Translate text to English using LibreTranslate
   */
  static async translateToEnglish(text) {
    if (!text || typeof text !== 'string') return text;
    
    try {
      const response = await axios.post(LIBRETRA_API_URL, {
        q: text,
        source: 'ar',
        target: 'en',
      }, { timeout: 5000 });

      return response.data?.translatedText || text;
    } catch (error) {
      console.warn(`Translation to English failed for: "${text.substring(0, 50)}..."`);
      return text; // Return original if translation fails
    }
  }

  /**
   * Check if text is Arabic
   */
  static isArabic(text) {
    if (!text || typeof text !== 'string') return false;
    const arabicRegex = /[\u0600-\u06FF]/g;
    return arabicRegex.test(text);
  }

  /**
   * Process input - translate if needed based on language
   */
  static async processInput(text, inputLanguage = 'en') {
    if (!text) return { en: text, ar: text };

    try {
      if (inputLanguage === 'ar') {
        // User entered Arabic - translate to English
        const englishText = await this.translateToEnglish(text);
        return { en: englishText, ar: text };
      } else {
        // User entered English - translate to Arabic
        const arabicText = await this.translateToArabic(text);
        return { en: text, ar: arabicText };
      }
    } catch (error) {
      console.error('Error in processInput:', error);
      return { en: inputLanguage === 'ar' ? text : text, ar: inputLanguage === 'ar' ? text : text };
    }
  }

  /**
   * Store bilingual data in database
   */
  static async storeBilingualData(db, table, data, id = null) {
    return new Promise((resolve, reject) => {
      try {
        // Prepare columns and values for bilingual storage
        const columns = [];
        const values = [];
        const placeholders = [];

        for (const [key, value] of Object.entries(data)) {
          if (typeof value === 'string') {
            // Store English version
            columns.push(`${key}_en`);
            values.push(value);
            placeholders.push('?');

            // Auto-translate and store Arabic version
            this.translateToArabic(value).then((arValue) => {
              columns.push(`${key}_ar`);
              values.push(arValue);
              placeholders.push('?');
            });
          } else if (value && typeof value === 'object') {
            // For JSON/objects, store as is
            columns.push(key);
            values.push(JSON.stringify(value));
            placeholders.push('?');
          } else {
            // For non-string values (numbers, booleans, etc.)
            columns.push(key);
            values.push(value);
            placeholders.push('?');
          }
        }

        // Add timestamp columns
        if (!id) {
          columns.push('createdAt');
          values.push(new Date().toISOString());
          placeholders.push('?');
        }
        columns.push('updatedAt');
        values.push(new Date().toISOString());
        placeholders.push('?');

        const query = id
          ? `UPDATE ${table} SET ${columns.map((c, i) => `${c} = ?`).join(', ')} WHERE id = ?`
          : `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;

        const finalValues = id ? [...values, id] : values;

        db.run(query, finalValues, function (err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: id || this.lastID, changes: this.changes });
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Retrieve bilingual data based on user's language preference
   */
  static async retrieveBilingualData(db, table, columns, where = '', language = 'en') {
    return new Promise((resolve, reject) => {
      try {
        // Build query to get both EN and AR versions
        const selectColumns = columns
          .map((col) => `${col}_${language} as ${col}, ${col}_en as ${col}_en, ${col}_ar as ${col}_ar`)
          .join(', ');

        const query = `SELECT * FROM ${table} ${where ? `WHERE ${where}` : ''}`;

        db.all(query, [], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Translate existing database table to add bilingual columns
   */
  static async migrateToBilingual(db, table, textColumns) {
    return new Promise((resolve, reject) => {
      try {
        // First, add new bilingual columns if they don't exist
        const addColumnPromises = textColumns.map((col) => {
          return new Promise((res) => {
            db.run(`ALTER TABLE ${table} ADD COLUMN ${col}_ar TEXT`, (err) => {
              if (err && !err.message.includes('duplicate column')) {
                console.error(`Error adding ${col}_ar column:`, err.message);
              }
              res();
            });
          });
        });

        Promise.all(addColumnPromises).then(() => {
          // Then, fetch all existing data and translate
          db.all(`SELECT id, ${textColumns.join(', ')} FROM ${table}`, [], async (err, rows) => {
            if (err) {
              reject(err);
              return;
            }

            // Translate each row
            for (const row of rows) {
              const updates = [];
              const values = [];

              for (const col of textColumns) {
                const enText = row[col];
                if (enText) {
                  const arText = await this.translateToArabic(enText);
                  updates.push(`${col}_ar = ?`);
                  values.push(arText);
                }
              }

              if (updates.length > 0) {
                values.push(row.id);
                const query = `UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`;
                db.run(query, values, (err) => {
                  if (err) {
                    console.error(`Error updating ${table} row ${row.id}:`, err.message);
                  }
                });
              }
            }

            resolve({ table, columnsAdded: textColumns, rowsProcessed: rows.length });
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = BilingualDbService;
