/**
 * Bilingual Data Service
 * 
 * This service handles retrieving language-specific data from the database.
 * It automatically selects the appropriate language column based on user preference.
 */

class BilingualDataService {
  /**
   * Get content in the user's preferred language
   * @param {string} language - User's preferred language ('en' or 'ar')
   * @param {string} fieldName - Field name (title, description, content, name, etc.)
   * @returns {string} - The language-specific field name (e.g., 'title_en' or 'title_ar')
   */
  static getLanguageField(language, fieldName) {
    const lang = (language || 'en').toLowerCase();
    const suffix = lang === 'ar' ? '_ar' : '_en';
    return `${fieldName}${suffix}`;
  }

  /**
   * Get course with language-specific fields
   */
  static getCourseFields(language) {
    const lang = this.getLanguageField(language, '');
    return {
      title: this.getLanguageField(language, 'title'),
      description: this.getLanguageField(language, 'description'),
      suffix: lang
    };
  }

  /**
   * Get chapter with language-specific fields
   */
  static getChapterFields(language) {
    return {
      title: this.getLanguageField(language, 'title'),
      content: this.getLanguageField(language, 'content')
    };
  }

  /**
   * Get announcement with language-specific fields
   */
  static getAnnouncementFields(language) {
    return {
      title: this.getLanguageField(language, 'title'),
      content: this.getLanguageField(language, 'content')
    };
  }

  /**
   * Get classroom with language-specific fields
   */
  static getClassroomFields(language) {
    return {
      name: this.getLanguageField(language, 'name')
    };
  }

  /**
   * Get university with language-specific fields
   */
  static getUniversityFields(language) {
    return {
      name: this.getLanguageField(language, 'name'),
      area: this.getLanguageField(language, 'area')
    };
  }

  /**
   * Get live class with language-specific fields
   */
  static getLiveClassFields(language) {
    return {
      title: this.getLanguageField(language, 'title'),
      description: this.getLanguageField(language, 'description')
    };
  }

  /**
   * Get inventory item with language-specific fields
   */
  static getInventoryFields(language) {
    return {
      itemName: this.getLanguageField(language, 'itemName'),
      description: this.getLanguageField(language, 'description')
    };
  }

  /**
   * Format a course object with correct language
   */
  static formatCourse(course, language = 'en') {
    if (!course) return null;
    
    const titleField = this.getLanguageField(language, 'title');
    const descField = this.getLanguageField(language, 'description');
    
    return {
      ...course,
      title: course[titleField] || course.title,
      description: course[descField] || course.description
    };
  }

  /**
   * Format a chapter object with correct language
   */
  static formatChapter(chapter, language = 'en') {
    if (!chapter) return null;
    
    const titleField = this.getLanguageField(language, 'title');
    const contentField = this.getLanguageField(language, 'content');
    
    return {
      ...chapter,
      title: chapter[titleField] || chapter.title,
      content: chapter[contentField] || chapter.content
    };
  }

  /**
   * Format an announcement object with correct language
   */
  static formatAnnouncement(announcement, language = 'en') {
    if (!announcement) return null;
    
    const titleField = this.getLanguageField(language, 'title');
    const contentField = this.getLanguageField(language, 'content');
    
    return {
      ...announcement,
      title: announcement[titleField] || announcement.title || 'Untitled',
      content: announcement[contentField] || announcement.content || ''
    };
  }

  /**
   * Format a classroom object with correct language
   */
  static formatClassroom(classroom, language = 'en') {
    if (!classroom) return null;
    
    const nameField = this.getLanguageField(language, 'name');
    
    return {
      ...classroom,
      name: classroom[nameField] || classroom.name
    };
  }

  /**
   * Format a university object with correct language
   */
  static formatUniversity(university, language = 'en') {
    if (!university) return null;
    
    const nameField = this.getLanguageField(language, 'name');
    const areaField = this.getLanguageField(language, 'area');
    
    return {
      ...university,
      name: university[nameField] || university.name,
      area: university[areaField] || university.area
    };
  }

  /**
   * Format a live class object with correct language
   */
  static formatLiveClass(liveClass, language = 'en') {
    if (!liveClass) return null;
    
    const titleField = this.getLanguageField(language, 'title');
    const descField = this.getLanguageField(language, 'description');
    
    return {
      ...liveClass,
      title: liveClass[titleField] || liveClass.title,
      description: liveClass[descField] || liveClass.description
    };
  }

  /**
   * Format an inventory item with correct language
   */
  static formatInventoryItem(item, language = 'en') {
    if (!item) return null;
    
    const itemNameField = this.getLanguageField(language, 'itemName');
    const descField = this.getLanguageField(language, 'description');
    
    return {
      ...item,
      itemName: item[itemNameField] || item.itemName,
      description: item[descField] || item.description
    };
  }

  /**
   * Format an array of courses
   */
  static formatCourses(courses, language = 'en') {
    return (courses || []).map(course => this.formatCourse(course, language));
  }

  /**
   * Format an array of chapters
   */
  static formatChapters(chapters, language = 'en') {
    return (chapters || []).map(chapter => this.formatChapter(chapter, language));
  }

  /**
   * Format an array of announcements
   */
  static formatAnnouncements(announcements, language = 'en') {
    return (announcements || []).map(ann => this.formatAnnouncement(ann, language));
  }

  /**
   * Format an array of classrooms
   */
  static formatClassrooms(classrooms, language = 'en') {
    return (classrooms || []).map(classroom => this.formatClassroom(classroom, language));
  }

  /**
   * Format an array of universities
   */
  static formatUniversities(universities, language = 'en') {
    return (universities || []).map(uni => this.formatUniversity(uni, language));
  }

  /**
   * Format an array of live classes
   */
  static formatLiveClasses(liveClasses, language = 'en') {
    return (liveClasses || []).map(lc => this.formatLiveClass(lc, language));
  }

  /**
   * Format an array of inventory items
   */
  static formatInventoryItems(items, language = 'en') {
    return (items || []).map(item => this.formatInventoryItem(item, language));
  }

  /**
   * Build SELECT clause for bilingual queries
   * Returns only the necessary columns for each language
   */
  static buildSelectClause(baseColumns, language) {
    // Returns the alias names for the language-specific fields
    const titleField = this.getLanguageField(language, 'title');
    const descField = this.getLanguageField(language, 'description');
    const contentField = this.getLanguageField(language, 'content');
    const nameField = this.getLanguageField(language, 'name');
    
    return {
      titleField,
      descField,
      contentField,
      nameField
    };
  }
}

module.exports = BilingualDataService;
