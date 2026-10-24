/**
 * Course Thumbnail & Banner Helper
 * Automatically selects a matching subject banner based on course title or category.
 * If user uploads an image, that takes precedence.
 * All default images are served directly from /defaults/courses/ (committed to git in client/public).
 */

export const DEFAULT_COURSE_BANNERS = {
  math: ['/defaults/courses/math-1.png', '/defaults/courses/math-2.png'],
  physics: ['/defaults/courses/physics.png'],
  chemistry: ['/defaults/courses/chemistry.png'],
  science: ['/defaults/courses/science.png'],
  biology: ['/defaults/courses/biology.jpg'],
  coding: ['/defaults/courses/coding.jpg'],
  english: ['/defaults/courses/english.jpg'],
  commerce: ['/defaults/courses/commerce.jpg'],
  general: ['/defaults/courses/general.jpg'],
};

/**
 * Returns the proper image URL for any course.
 * @param {Object} course - The course object (title, category, photo, etc.)
 * @param {number} index - Optional index to alternate images when multiple courses of same subject exist
 * @param {string} API - Base API URL for uploaded photos
 * @returns {string} - Image URL path
 */
export const getCourseThumbnail = (course, index = 0, API = '') => {
  if (course?.photo) {
    if (course.photo.startsWith('http') || course.photo.startsWith('blob:')) {
      return course.photo;
    }
    const cleanPhoto = course.photo.startsWith('/') ? course.photo : `/${course.photo}`;
    return API ? `${API}${cleanPhoto}` : cleanPhoto;
  }

  const title = (course?.title || '').toLowerCase();
  const category = (course?.category || '').toLowerCase();
  const combined = `${title} ${category}`;

  // 1. Mathematics (Calculus, Algebra, Geometry, Stats, etc.)
  if (
    combined.includes('math') ||
    combined.includes('algebra') ||
    combined.includes('geometry') ||
    combined.includes('calculus') ||
    combined.includes('calc') ||
    combined.includes('ganit') ||
    combined.includes('trig') ||
    combined.includes('stat')
  ) {
    const list = DEFAULT_COURSE_BANNERS.math;
    return list[index % list.length];
  }

  // 2. Chemistry
  if (
    combined.includes('chemist') ||
    combined.includes('rasayan') ||
    combined.includes('organic') ||
    combined.includes('inorganic') ||
    combined.includes('periodic')
  ) {
    return DEFAULT_COURSE_BANNERS.chemistry[0];
  }

  // 3. Physics
  if (
    combined.includes('physic') ||
    combined.includes('bhautik') ||
    combined.includes('mechanic') ||
    combined.includes('optics') ||
    combined.includes('motion') ||
    combined.includes('gravity')
  ) {
    return DEFAULT_COURSE_BANNERS.physics[0];
  }

  // 4. Biology / Life Sciences
  if (
    combined.includes('biolog') ||
    combined.includes('botany') ||
    combined.includes('zoology') ||
    combined.includes('anatomy') ||
    combined.includes('jeev') ||
    combined.includes('cell') ||
    combined.includes('dna')
  ) {
    return DEFAULT_COURSE_BANNERS.biology[0];
  }

  // 5. Computer Science / Coding / IT
  if (
    combined.includes('comput') ||
    combined.includes('coding') ||
    combined.includes('program') ||
    combined.includes('python') ||
    combined.includes('java') ||
    combined.includes('web') ||
    combined.includes('software') ||
    combined.includes('tech') ||
    combined.includes('data structure')
  ) {
    return DEFAULT_COURSE_BANNERS.coding[0];
  }

  // 6. English / Languages / Literature
  if (
    combined.includes('english') ||
    combined.includes('hindi') ||
    combined.includes('language') ||
    combined.includes('literature') ||
    combined.includes('grammar') ||
    combined.includes('prose') ||
    combined.includes('poetry')
  ) {
    return DEFAULT_COURSE_BANNERS.english[0];
  }

  // 7. Commerce / Accounts / Economics / Business
  if (
    combined.includes('commerce') ||
    combined.includes('account') ||
    combined.includes('econom') ||
    combined.includes('business') ||
    combined.includes('finance') ||
    combined.includes('banking') ||
    combined.includes('money')
  ) {
    return DEFAULT_COURSE_BANNERS.commerce[0];
  }

  // 8. General Science
  if (
    combined.includes('scienc') ||
    combined.includes('lab') ||
    combined.includes('experiment') ||
    combined.includes('vigyan')
  ) {
    return DEFAULT_COURSE_BANNERS.science[0];
  }

  // 9. Universal / General Fallback
  return DEFAULT_COURSE_BANNERS.general[0];
};
