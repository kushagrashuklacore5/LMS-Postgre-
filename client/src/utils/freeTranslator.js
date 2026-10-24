// Free MyMemory API for Arabic translation (no CORS issues)
const translateToArabic = async (text) => {
  try {
    // Using MyMemory API (free, no CORS issues)
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ar`);
    
    if (!response.ok) {
      throw new Error('Translation API failed');
    }
    
    const data = await response.json();
    
    // Extract translated text from MyMemory response
    if (data && data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
      return data.responseData.translatedText;
    }
    
    return text; // Fallback to original text
  } catch (error) {
    console.warn('Translation failed, using original text:', error);
    return text; // Fallback to original text
  }
};

// Simple predefined Arabic translations (most reliable)
const getArabicTranslation = (key, englishText) => {
  const arabicTranslations = {
    'login_title': 'نظام إدارة التعلم',
    'email_label': 'البريد الإلكتروني',
    'email_placeholder': 'البريد الإلكتروني',
    'password_label': 'كلمة المرور',
    'password_placeholder': 'كلمة المرور',
    'sign_in_button': 'تسجيل الدخول',
    'logging_in': 'جاري تسجيل الدخول...',
    'demo_accounts': 'تسجيل دخول سريع - حسابات تجريبية:',
    'admin_role': 'مدير',
    'mentor_role': 'مرشد',
    'student_role': 'طالب',
    'accountant_role': 'محاسب',
    'storekeeper_role': 'أمين مخزن',
    'click_to_login': 'انقر لتسجيل الدخول',
    'signup_prompt': 'ليس لديك حساب؟',
    'signup_link': 'سجل',
    'login_successful': 'تم تسجيل الدخول بنجاح! جاري التوجيه...',
    'login_failed': 'فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.',
    'language_changed': 'تم تغيير اللغة إلى',
    
    // Courses page translations
    'my_courses': 'دوراتي',
    'courses_enrolled': 'لديك {count} دورة{plural} مسجلة',
    'no_courses_yet': 'لا توجد دورات بعد',
    'overview': 'نظرة عامة',
    'total': 'الإجمالي',
    'completed': 'مكتمل',
    'in_progress': 'قيد التقدم',
    'avg_progress': 'متوسط التقدم',
    'search_courses': 'ابحث عن الدورات...',
    'all': 'الكل',
    'no_courses_assigned': 'لم يتم تعيين دورات',
    'no_matching_courses': 'لا توجد دورات مطابقة',
    'mentor_will_assign': 'سيقوم مرشدك بتعيين دورات لك قريباً',
    'try_different_search': 'جرب مصطلحات بحث أو عوامل تصفية مختلفة',
    'loading_courses': 'جاري تحميل الدورات...',
    'start_learning': 'ابدأ التعلم',
    'continue_learning': 'تابع التعلم',
    'view_course': 'عرض الدورة',
    'completed_chapters': 'الفصول المكتملة',
    'total_chapters': 'إجمالي الفصول',
    'last_activity': 'آخر نشاط',
    'not_started': 'لم يبدأ',
    'today': 'اليوم',
    'yesterday': 'أمس',
    'days_ago': 'منذ {days} أيام',
    'back_to_dashboard': 'العودة إلى لوحة التحكم',
    'progress': 'التقدم',
    'chapters': 'الفصول',
    'assessments': 'التقييمات',
    'view_certificate': 'عرض الشهادة',
    'continue': 'تابع',
    'learning_summary': 'ملخص التعلم',
    'total_courses': 'إجمالي الدورات',
    
    // Dashboard translations
    'dashboard': 'لوحة التحكم',
    'welcome_back': 'مرحباً بعودتك',
    'recent_activity': 'النشاط الأخير',
    'quick_actions': 'إجراءات سريعة',
    'view_all_courses': 'عرض جميع الدورات',
    'profile': 'الملف الشخصي',
    'settings': 'الإعدادات',
    'logout': 'تسجيل الخروج',
    'timetable': 'الجدول الزمني',
    'attendance': 'الحضور',
    'pay_fees': 'دفع الرسوم',
    'results': 'النتائج',
    'announcements': 'الإعلانات',
    
    // Admin dashboard translations
    'admin_dashboard': 'لوحة تحكم المشرف',
    'total_students': 'إجمالي الطلاب',
    'total_mentors': 'إجمالي المرشدين',
    'total_courses': 'إجمالي الدورات',
    'total_certificates': 'إجمالي الشهادات',
    'new_users': 'المستخدمون الجدد',
    'pending_mentors': 'المرشدون المعلقون',
    'published_courses': 'الدورات المنشورة',
    'quick_actions': 'إجراءات سريعة',
    'add_student': 'إضافة طالب',
    'add_mentor': 'إضافة مرشد',
    'create_course': 'إنشاء دورة',
    'view_all_students': 'عرض جميع الطلاب',
    'view_all_mentors': 'عرض جميع المرشدين',
    'view_all_courses': 'عرض جميع الدورات',
    'recent_activity': 'النشاط الأخير',
    'refresh_stats': 'تحديث الإحصائيات',
    'students': 'الطلاب',
    'mentors': 'المرشدون',
    'courses': 'الدورات',
    'certificates': 'الشهادات',
    'users': 'المستخدمون',
    'pending': 'معلق',
    'published': 'منشور',
    
    // Mentor dashboard translations
    'mentor_dashboard': 'لوحة تحكم المرشد',
    'my_classrooms': 'فصلي الدراسية',
    'create_course_mentor': 'إنشاء دورة',
    'manage_students': 'إدارة الطلاب',
    'view_progress': 'عرض التقدم',
    'attendance': 'الحضور والغياب',
    
    // Student dashboard translations
    'student_dashboard': 'لوحة تحكم الطالب',
    'my_progress': 'تقدمي',
    'enrolled_courses': 'الدورات المسجلة',
    'view_certificates': 'عرض الشهادات',
    'assignments': 'المهام',
    'exams': 'الاختبارات',
    'grades': 'الدرجات',
    
    // Common translations for all portals
    'analytics': 'التحليلات',
    'fee_structure': 'هيكل الرسوم',
    'calendar': 'التقويم',
    'add_student': 'إضافة طالب',
    'add_teacher': 'إضافة معلم',
    'classrooms': 'الفصول الدراسية',
    'user_list': 'قائمة المستخدمين',
  };
  
  return arabicTranslations[key] || englishText;
};

// Batch translate multiple texts
const batchTranslateToArabic = async (texts) => {
  const translations = {};
  
  for (const [key, text] of Object.entries(texts)) {
    // Use predefined Arabic translations for reliability
    translations[key] = getArabicTranslation(key, text);
  }
  
  return translations;
};

export { translateToArabic, batchTranslateToArabic, getArabicTranslation };
