// Student "Dashboard + Courses + Course detail + Results + Attendance"
// walkthrough — deterministic, configuration-driven. One continuous GuideBot
// session. A / B / C / D are sidebar-tab introductions: GuideBot opens the tab
// first (autoNavigate — the app's own sidebar link), waits for the page and
// target to render, and only then highlights the tab. A1.., B1.., C1.., D1
// explain that page's contents.
//
// Purely descriptive and non-interactive: the only things GuideBot ever
// clicks are the app's own sidebar tabs, the real "Continue" link of the
// first course (to open that course by its real id), and the first week's
// own expand header (to reveal its materials). It never calls an API and
// never invents data: steps whose target depends on real data (an enrolled
// course, a material, a result...) are skipped when that data isn't there
// (`skipIfMissing`), and dropped from the progress total.
//
// Interaction is blocked by default (`disableActiveInteraction` below); a
// step that genuinely needs the user to act would opt in with
//   driverStepConfig: { disableActiveInteraction: false }

import { registerTour } from '../registry';

const COURSE_ROUTE = '/student/course/';
// Expanding a week is the app's own toggle; only offered when the week has
// content (the app does not render an empty expanded week safely).
const WEEK_OPENER = '[data-tour="course-weeks-progress"]:not([data-tour-week-items="0"])';
const ON_COURSE_PAGE = {
  route: COURSE_ROUTE,
  ready: '[data-tour="course-title"]',
};

export const studentOverviewTour = {
  id: 'student-overview-v1',
  portal: 'student',
  version: '1.0.0',
  description:
    'Guided walkthrough of the Student portal: Dashboard, Courses (including a course page), Results, and Attendance.',
  driverConfig: {
    showProgress: true,
    allowClose: true,
    overlayClickBehavior: 'close',
    disableActiveInteraction: true,
    allowScroll: false,
    // Instant scroll-into-view: targets far down a page (Learning Summary, a
    // live class) must be at their final position before the spotlight and
    // popover are placed, or they land where the target was mid-scroll.
    smoothScroll: false,
  },
  steps: [
    // ---- A: Dashboard ----
    {
      id: 'nav-dashboard',
      target: '[data-tour="nav-dashboard"]',
      title: 'Dashboard',
      description:
        'Your Dashboard brings your learning together in one place: your courses, attendance, results, and announcements at a glance.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    {
      id: 'announcement-bell',
      target: '[data-tour="announcement-bell"]',
      title: 'Announcements',
      description:
        'The bell shows announcements from your institution and teachers. A dot appears when there is something new to read.',
      placement: 'bottom',
      align: 'end',
    },
    {
      id: 'dashboard-statistics',
      target: '[data-tour="stats-grid"]',
      title: 'Your Statistics',
      description:
        'These cards summarise where you stand: how many courses you are enrolled in, your average progress across them, and your overall attendance percentage.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'dashboard-attendance',
      target: '[data-tour="attendance-summary"]',
      title: 'Attendance Summary',
      description:
        'A quick look at your recent attendance: how many classes you were present for, absent from, and your latest records. Use View All for the full history.',
      placement: 'top',
      align: 'start',
    },
    {
      id: 'dashboard-results',
      target: '[data-tour="result-summary"]',
      title: 'Results Summary',
      description:
        'Your latest published results appear here, with term, overall percentage, and subject-wise marks. Use View All to see every report card.',
      placement: 'top',
      align: 'start',
    },
    {
      id: 'dashboard-first-course',
      target: '[data-tour="first-course-card"]',
      title: 'Your Enrolled Courses',
      description:
        'Each card is a course you are enrolled in, with your progress so far. Open a course to continue learning where you left off.',
      placement: 'top',
      align: 'start',
      skipIfMissing: { ready: '[data-tour="stats-grid"]' },
    },

    // ---- B: Courses ----
    {
      id: 'nav-courses',
      target: '[data-tour="nav-courses"]',
      title: 'Courses',
      description:
        'The Courses section lists every course you are enrolled in, so you can track your progress and jump back into your learning.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    {
      id: 'courses-overview',
      target: '[data-tour="courses-overview"]',
      title: 'Courses Overview',
      description:
        'A summary of your courses: how many you have, how many are completed or in progress, and your average progress.',
      placement: 'left',
      align: 'start',
    },
    {
      id: 'courses-search',
      target: '[data-tour="courses-search"]',
      title: 'Search & Filters',
      description:
        'Search by course name, or filter the list by All, In Progress, or Completed to find the course you want quickly.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'courses-first-card',
      target: '[data-tour="courses-page-first-card"]',
      title: 'Course Card',
      description:
        'Each course shows its title and description, your mentor, your progress, how many chapters you have completed, and how many assessments it has.',
      placement: 'right',
      align: 'start',
      skipIfMissing: { ready: '[data-tour="courses-overview"]' },
    },
    {
      id: 'courses-continue',
      target: '[data-tour="courses-first-continue"]',
      title: 'Continue',
      description:
        'Continue opens the course so you can pick up where you left off. Press Next and GuideBot will open this course for you.',
      placement: 'right',
      align: 'center',
      clickOnNext: true,
      skipIfMissing: { ready: '[data-tour="courses-overview"]' },
    },

    // ---- B (course page): reached through the real Continue link, so it
    // always uses a real course id. Skipped entirely if no course was opened.
    {
      id: 'course-header',
      target: '[data-tour="course-title"]',
      title: 'Course Header',
      description: 'The course name and description, with your overall progress percentage for the whole course.',
      placement: 'bottom',
      align: 'start',
      skipIfMissing: { route: COURSE_ROUTE },
    },
    {
      id: 'course-weeks',
      target: '[data-tour="course-weeks-progress"]',
      title: 'Weeks & Progress',
      description:
        'The course is organised week by week. Each week shows a progress ring and how many of its chapters, materials, and assessments you have completed.',
      placement: 'bottom',
      align: 'start',
      skipIfMissing: ON_COURSE_PAGE,
    },
    {
      id: 'course-material',
      target: '[data-tour="course-material-item"]',
      title: 'Material',
      description:
        'Lecture PDFs, notes, and other course material live here. Use View to open an item, and mark it complete when you are done.',
      placement: 'top',
      align: 'start',
      skipIfMissing: { ...ON_COURSE_PAGE, openVia: WEEK_OPENER },
    },
    {
      id: 'course-assessments',
      target: '[data-tour="course-assessments"]',
      title: 'Assessments',
      description:
        'Quizzes and assessments for the week appear here. Use Start to attempt an unlocked assessment; locked ones open when your teacher releases them.',
      placement: 'top',
      align: 'start',
      skipIfMissing: { ...ON_COURSE_PAGE, openVia: WEEK_OPENER },
    },
    {
      id: 'course-live',
      target: '[data-tour="course-live-video"]',
      title: 'Live Classes',
      description:
        'Live classes for this course are listed here with their schedule. When one is running, use Join to attend it right from the app.',
      placement: 'top',
      align: 'start',
      skipIfMissing: ON_COURSE_PAGE,
    },
    {
      id: 'courses-learning-summary',
      target: '[data-tour="course-learning-summary"]',
      title: 'Learning Summary',
      description:
        'Your learning at a glance: total courses, completed, in progress, and your average progress across everything you study.',
      placement: 'top',
      align: 'start',
      // From the course page this goes back through the app's own Courses tab.
      skipIfMissing: { openVia: '[data-tour="nav-courses"]', timeout: 8000 },
    },

    // ---- C: Results ----
    {
      id: 'nav-results',
      target: '[data-tour="nav-results"]',
      title: 'Results',
      description:
        'The Results section holds your published report cards, term by term, with your grades and marks.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    {
      id: 'results-cards',
      target: '[data-tour="results-cards"]',
      title: 'Term Marksheets',
      description:
        'Each term has its own marksheet showing your classroom, grade, overall percentage, and whether you passed.',
      placement: 'bottom',
      align: 'start',
      skipIfMissing: { ready: '[data-tour="results-page"]' },
    },
    {
      id: 'results-subjects',
      target: '[data-tour="results-subject-breakdown"]',
      title: 'Subject Marks',
      description:
        'Your marks for every subject, with totals, percentages, pass or fail status, and any comments your teacher has added.',
      placement: 'top',
      align: 'start',
      skipIfMissing: { ready: '[data-tour="results-page"]' },
    },

    // ---- D: Attendance (final) ----
    {
      id: 'nav-attendance',
      target: '[data-tour="nav-attendance"]',
      title: 'Attendance',
      description: 'The Attendance section shows how regularly you have been attending your classes.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    {
      id: 'attendance-log',
      target: '[data-tour="attendance-records-log"]',
      title: 'Attendance Log',
      description:
        'Every recorded class appears here with its date, classroom, and whether you were present or absent, so you can see your attendance history at a glance.',
      placement: 'top',
      align: 'start',
    },
  ],
};

registerTour(studentOverviewTour);
