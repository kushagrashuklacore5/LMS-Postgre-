// Mock translation service for testing
const mockTranslations = {
  'Hello World': { ar: 'مرحبا بالعالم', es: 'Hola Mundo', fr: 'Bonjour le monde', de: 'Hallo Welt', zh: '你好世界', hi: 'हैलो वर्ल्ड', ur: 'ہیلو ورلڈ' },
  'Login': { ar: 'تسجيل الدخول', es: 'Iniciar sesión', fr: 'Connexion', de: 'Anmelden', zh: '登录', hi: 'लॉगिन', ur: 'لاگ ان' },
  'Dashboard': { ar: 'لوحة التحكم', es: 'Tablero', fr: 'Tableau de bord', de: 'Dashboard', zh: '仪表板', hi: 'डैशबोर्ड', ur: 'ڈیش بورڈ' },
  'Courses': { ar: 'الدورات', es: 'Cursos', fr: 'Cours', de: 'Kurse', zh: '课程', hi: 'पाठ्यक्रम', ur: 'کورسز' },
  'Students': { ar: 'الطلاب', es: 'Estudiantes', fr: 'Étudiants', de: 'Studenten', zh: '学生', hi: 'छात्र', ur: 'طالب علم' },
  'Settings': { ar: 'الإعدادات', es: 'Configuración', fr: 'Paramètres', de: 'Einstellungen', zh: '设置', hi: 'सेटिंग्स', ur: 'ترتیبات' },
  'Admin': { ar: 'المدير', es: 'Administrador', fr: 'Administrateur', de: 'Administrator', zh: '管理员', hi: 'व्यवस्थापक', ur: 'ایڈمن' },
  'Save': { ar: 'حفظ', es: 'Guardar', fr: 'Enregistrer', de: 'Speichern', zh: '保存', hi: 'सेव करें', ur: 'محفوظ کریں' },
  'Cancel': { ar: 'إلغاء', es: 'Cancelar', fr: 'Annuler', de: 'Abbrechen', zh: '取消', hi: 'रद्द करें', ur: 'منسوخ کریں' },
  'Edit': { ar: 'تحرير', es: 'Editar', fr: 'Modifier', de: 'Bearbeiten', zh: '编辑', hi: 'संपादित करें', ur: 'ترمیم کریں' },
  'Delete': { ar: 'حذف', es: 'Eliminar', fr: 'Supprimer', de: 'Löschen', zh: '删除', hi: 'हटाएं', ur: 'حذف کریں' },
  'Add': { ar: 'إضافة', es: 'Agregar', fr: 'Ajouter', de: 'Hinzufügen', zh: '添加', hi: 'जोड़ें', ur: 'شامل کریں' },
  'Search': { ar: 'بحث', es: 'Buscar', fr: 'Rechercher', de: 'Suchen', zh: '搜索', hi: 'खोजें', ur: 'تلاش کریں' },
  'Loading': { ar: 'جاري التحميل...', es: 'Cargando...', fr: 'Chargement...', de: 'Wird geladen...', zh: '加载中...', hi: 'लोड हो रहा है...', ur: 'لوڈنگ ہو رہا ہے...' },
  'Error': { ar: 'خطأ', es: 'Error', fr: 'Erreur', de: 'Fehler', zh: '错误', hi: 'त्रुटि', ur: 'خرابی' },
  'Success': { ar: 'نجح', es: 'Éxito', fr: 'Succès', de: 'Erfolg', zh: '成功', hi: 'सफलता', ur: 'کامیابی' },
  'Email': { ar: 'البريد الإلكتروني', es: 'Correo electrónico', fr: 'E-mail', de: 'E-Mail', zh: '电子邮件', hi: 'ईमेल', ur: 'ای میل' },
  'Password': { ar: 'كلمة المرور', es: 'Contraseña', fr: 'Mot de passe', de: 'Passwort', zh: '密码', hi: 'पासवर्ड', ur: 'پاس ورڈ' }
};

class MockTranslationService {
  constructor() {
    this.defaultLanguage = 'en';
    this.supportedLanguages = ['en', 'ar', 'es', 'fr', 'de', 'zh', 'hi', 'ur'];
  }

  async translateText(text, targetLang, sourceLang = 'en') {
    try {
      if (!text || text.trim() === '') return text;
      if (targetLang === sourceLang) return text;

      // Check if we have a mock translation
      if (mockTranslations[text] && mockTranslations[text][targetLang]) {
        return mockTranslations[text][targetLang];
      }

      // For demonstration, return a simple "translated" version
      return `[${targetLang.toUpperCase()}] ${text}`;
    } catch (error) {
      console.error('Mock translation error:', error.message);
      return text;
    }
  }

  async translateBatch(texts, targetLang, sourceLang = 'en') {
    const translations = [];
    
    for (const text of texts) {
      const translated = await this.translateText(text, targetLang, sourceLang);
      translations.push(translated);
    }
    
    return translations;
  }

  async isServiceAvailable() {
    return true; // Always available since it's a mock
  }

  async getSupportedLanguages() {
    return this.supportedLanguages.map(code => ({ code: code, name: code.toUpperCase() }));
  }

  isLanguageSupported(langCode) {
    return this.supportedLanguages.includes(langCode);
  }

  getDefaultLanguage() {
    return this.defaultLanguage;
  }
}

module.exports = new MockTranslationService();
