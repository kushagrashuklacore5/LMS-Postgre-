// Mentor "Dashboard + Course management" walkthrough — deterministic,
// configuration-driven. One continuous GuideBot session:
//
//   Dashboard (announcements, overview, create announcement, courses)
//   -> ONE course block -> View (opens that real course)
//   -> Course View (actions, information, one live class, student progress)
//   -> Add Chapter (opens the chapter manager) -> Select -> Chapters
//   -> Add Chapter   (optional action)
//   -> Assign (opens the student assignment page) -> Select -> Students
//   -> Assignment -> Assign Students (optional action)
//   -> My Classrooms -> one class -> class actions -> Create Course (optional
//      action) -> Assign Students (Next opens the form; optional action)
//   -> Attendance -> Class Results (Edit Result: optional action)
//   -> Requirements (New Requirement: optional action; approved / pending)
//   -> Calendar -> Create Event (optional action)
//
// Informational steps never click or submit anything. GuideBot only ever
// triggers the app's own navigation: the sidebar Dashboard link, the real
// View / Add Chapter / Assign buttons of the first course card, and the
// "Select" control of the first course block on the chapter / assignment
// pages (which only reveals that course's tools), plus the app's own
// Live Classes / Student Progress tab buttons. It never fills a field,
// never submits a form and never calls an API.
//
// The two optional-action steps (marked "optional" in their titles) hand the
// real form to the mentor: no Next button, the spotlight allows interaction,
// and the tour advances by itself when the app reports the real creation /
// assignment succeeded (the app dispatches `guidebot:action-success` only
// after its own request succeeds), when the mentor leaves the workflow, or
// via the explicit "Skip this step" control.
//
// Nothing is invented: every data-dependent step is skipped (and dropped
// from the progress total) when its data isn't there, and steps that build
// on an earlier skipped step are skipped with it.

import { registerTour } from '../registry';

const DASHBOARD_READY = '[data-tour="mentor-courses"][data-tour-courses-state="ready"]';
const COURSE_ROUTE = '/mentor/course/';
const NAV_DASHBOARD = '[data-tour="nav-dashboard"]';

// Steps that live on the course page: skipped if no course was opened.
const ON_COURSE_VIEW = { dependsOn: 'mentor-course-view', route: COURSE_ROUTE };

// My Classrooms (classroom list -> a class's page).
const CLASSROOMS_READY = '[data-tour="classrooms-header"][data-tour-classrooms-state="ready"]';
const CLASSROOM_ROUTE = '/mentor/classroom/';

// Interactive spotlight (the mentor uses the real control) with no Next button.
const INTERACTIVE_NO_NEXT = {
  disableActiveInteraction: false,
  popover: { showButtons: ['close'] },
};

const ACTION_SIGNAL = 'guidebot:action-success';
const ACTION_TIMEOUT_MS = 30 * 60 * 1000;

export const mentorOverviewTour = {
  id: 'mentor-overview-v1',
  portal: 'mentor',
  version: '2.0.0',
  description:
    'Guided walkthrough of the Mentor portal: dashboard, course management, adding chapters, assigning students, classrooms, attendance, class results, requirements, and the calendar.',
  driverConfig: {
    showProgress: true,
    allowClose: true,
    overlayClickBehavior: 'close',
    disableActiveInteraction: true,
    allowScroll: false,
    // Targets far down a page must be in place before the spotlight is drawn.
    smoothScroll: false,
  },
  steps: [
    // ---- Dashboard ----
    {
      id: 'nav-dashboard',
      target: NAV_DASHBOARD,
      title: 'Dashboard',
      description:
        'Your Mentor Dashboard is your starting point: an overview of your courses and students, announcements, and quick access to course management.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    {
      id: 'mentor-announcements',
      target: '[data-tour="mentor-announcements"]',
      title: 'Announcements',
      description:
        'The bell shows announcements from your institution. A dot appears when there is something new to read.',
      placement: 'bottom',
      align: 'end',
    },
    {
      id: 'mentor-overview',
      target: '[data-tour="mentor-stats"]',
      title: 'Your Overview',
      description:
        'These cards summarise your teaching: the total courses assigned to you, the total students across them, and your active courses.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'mentor-create-announcement',
      target: '[data-tour="mentor-create-announcement"]',
      title: 'Create Announcement',
      description:
        'Use this button to write an announcement for your students. Nothing is created unless you fill it in and submit it yourself.',
      placement: 'left',
      align: 'center',
    },
    {
      id: 'mentor-courses',
      target: '[data-tour="mentor-courses-heading"]',
      title: 'Courses',
      description:
        'Course management starts here. Every course assigned to you appears below, with shortcuts to view it, add chapters, assign students, and create assessments.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'mentor-first-course-card',
      target: '[data-tour="mentor-first-course-card"]',
      title: 'Your Course',
      description:
        'Each block is one of your courses, showing its title and how many students are enrolled. The buttons on it open that course’s tools.',
      placement: 'bottom',
      align: 'start',
      skipIfMissing: { ready: DASHBOARD_READY },
    },
    {
      id: 'mentor-course-view',
      target: '[data-tour="mentor-course-view"]',
      title: 'View',
      description:
        'View opens the course page, where you manage its content and follow your students’ progress. Press Next and GuideBot will open this course for you.',
      placement: 'top',
      align: 'start',
      clickOnNext: true,
      skipIfMissing: { dependsOn: 'mentor-first-course-card', ready: DASHBOARD_READY },
    },

    // ---- Course View page (the real course opened by View) ----
    {
      id: 'course-actions',
      target: '[data-tour="course-actions"]',
      title: 'Course Actions',
      description:
        'These buttons manage the course: Add Week creates a new week, Add Material uploads course material, Add Assessment creates a quiz, and Assign Students enrols students. GuideBot never uses them for you.',
      placement: 'bottom',
      align: 'start',
      skipIfMissing: { ...ON_COURSE_VIEW, timeout: 8000 },
    },
    {
      id: 'course-info',
      target: '[data-tour="course-info-tabs"]',
      title: 'Course Information',
      description:
        'Four tabs organise the course: Weeks & Materials, Assessments, Live Classes, and Student Progress. Switch between them to review each part.',
      placement: 'bottom',
      align: 'start',
      skipIfMissing: { ...ON_COURSE_VIEW, ready: '[data-tour="course-info-tabs"]', timeout: 8000 },
    },
    {
      id: 'course-live-class',
      target: '[data-tour="course-live-class-block"]',
      title: 'Live Classes',
      description:
        'Live classes you schedule appear here. Each block shows the class title and schedule, with controls to start or rejoin the class.',
      placement: 'top',
      align: 'start',
      skipIfMissing: {
        ...ON_COURSE_VIEW,
        ready: '[data-tour="course-info-tabs"]',
        openVia: '[data-tour="course-tab-live"]',
        timeout: 8000,
      },
    },
    {
      id: 'course-student-progress',
      target: '[data-tour="course-student-progress"]',
      title: 'Student Progress',
      description:
        'See how each assigned student is progressing through the course: chapters completed and overall completion.',
      placement: 'top',
      align: 'start',
      skipIfMissing: {
        ...ON_COURSE_VIEW,
        ready: '[data-tour="course-info-tabs"]',
        openVia: '[data-tour="course-tab-students"]',
        timeout: 8000,
      },
    },

    // ---- Add Chapter ----
    {
      id: 'mentor-add-chapter',
      target: '[data-tour="mentor-course-add-chapter"]',
      title: 'Add Chapter',
      description:
        'Chapters are the lessons of a course. Add Chapter opens the chapter manager. Press Next and GuideBot will open it for you.',
      placement: 'top',
      align: 'center',
      clickOnNext: true,
      // From the course page this goes back through the app's own Dashboard tab.
      skipIfMissing: { dependsOn: 'mentor-first-course-card', openVia: NAV_DASHBOARD, timeout: 8000 },
    },
    {
      id: 'chapter-course-block',
      target: '[data-tour="chapter-course-block"]',
      title: 'Choose a Course',
      description:
        'Chapters are managed one course at a time. Each block is a course — this is the one whose chapters you would manage.',
      placement: 'bottom',
      align: 'start',
      skipIfMissing: { dependsOn: 'mentor-add-chapter', ready: '[data-tour="add-chapter-page"]', timeout: 8000 },
    },
    {
      id: 'chapter-course-select',
      target: '[data-tour="chapter-course-select"]',
      title: 'Select',
      description:
        'Select opens the chapter manager for that course. Press Next and GuideBot will select this course for you; nothing is created or changed.',
      placement: 'top',
      align: 'end',
      clickOnNext: true,
      skipIfMissing: { dependsOn: 'chapter-course-block', ready: '[data-tour="add-chapter-page"]' },
    },
    {
      id: 'chapters-panel',
      target: '[data-tour="chapters-panel"]',
      title: 'Chapters',
      description:
        'This is where the course’s chapters are listed and managed, in order. Each chapter can be edited or removed here.',
      placement: 'right',
      align: 'start',
      skipIfMissing: { dependsOn: 'chapter-course-select', timeout: 8000 },
    },
    {
      id: 'add-chapter-action',
      target: '[data-tour="add-chapter-form"]',
      title: 'Add Chapter (optional)',
      description:
        'Fill in the chapter details and press <b>Add Chapter</b> to create a real chapter — the tour continues by itself once it is created. This step is optional: use <b>Skip this step</b> to move on without creating one.',
      placement: 'left',
      align: 'start',
      driverStepConfig: {
        disableActiveInteraction: false,
        popover: { showButtons: ['close'] },
      },
      action: {
        signal: ACTION_SIGNAL,
        matches: (detail) => !!detail && detail.actionId === 'chapter-created',
        timeout: ACTION_TIMEOUT_MS,
      },
      completeOnTargetGone: true,
      skipStepLabel: 'Skip this step',
      skipIfMissing: { dependsOn: 'chapter-course-select', timeout: 8000 },
    },

    // ---- Assign students ----
    {
      id: 'mentor-assign',
      target: '[data-tour="mentor-course-assign"]',
      title: 'Assign',
      description:
        'Assign lets you enrol students in a course. Press Next and GuideBot will open the assignment page for you; nothing is assigned automatically.',
      placement: 'top',
      align: 'center',
      clickOnNext: true,
      skipIfMissing: { dependsOn: 'mentor-first-course-card', openVia: NAV_DASHBOARD, timeout: 8000 },
    },
    {
      id: 'assign-course-block',
      target: '[data-tour="assign-course-block"]',
      title: 'Choose a Course',
      description: 'Students are assigned one course at a time. Each block is a course — this is the one you would assign students to.',
      placement: 'bottom',
      align: 'start',
      skipIfMissing: { dependsOn: 'mentor-assign', ready: '[data-tour="assign-students-page"]', timeout: 8000 },
    },
    {
      id: 'assign-course-select',
      target: '[data-tour="assign-course-select"]',
      title: 'Select',
      description:
        'Select opens the student list for that course. Press Next and GuideBot will open it; no student is selected or assigned.',
      placement: 'top',
      align: 'end',
      clickOnNext: true,
      skipIfMissing: { dependsOn: 'assign-course-block', ready: '[data-tour="assign-students-page"]' },
    },
    {
      id: 'assign-students-panel',
      target: '[data-tour="assign-students-panel"]',
      title: 'Students',
      description:
        'Available students are listed here. You choose which students to enrol by ticking them — nothing is ticked for you.',
      placement: 'right',
      align: 'start',
      skipIfMissing: { dependsOn: 'assign-course-select', timeout: 8000 },
    },
    {
      id: 'assign-panel',
      target: '[data-tour="assign-panel"]',
      title: 'Assignment',
      description:
        'This panel summarises the assignment: the selected course, how many students are chosen, and the button that assigns them.',
      placement: 'left',
      align: 'start',
      skipIfMissing: { dependsOn: 'assign-course-select', timeout: 8000 },
    },
    {
      id: 'assign-action',
      target: '[data-tour="assign-view"]',
      title: 'Assign Students (optional)',
      description:
        'Tick the students to enrol and press <b>Assign Students</b> to make a real assignment — the tour finishes by itself once it succeeds. This step is optional: use <b>Skip this step</b> to finish without assigning anyone.',
      placement: 'top',
      align: 'center',
      driverStepConfig: {
        disableActiveInteraction: false,
        popover: { showButtons: ['close'] },
      },
      action: {
        signal: ACTION_SIGNAL,
        matches: (detail) => !!detail && detail.actionId === 'students-assigned',
        timeout: ACTION_TIMEOUT_MS,
      },
      completeOnTargetGone: true,
      skipStepLabel: 'Skip this step',
      skipIfMissing: { dependsOn: 'assign-course-select', timeout: 8000 },
    },

    // ---- My Classrooms ----
    {
      id: 'nav-my-classroom',
      target: '[data-tour="nav-my-classroom"]',
      title: 'My Classrooms',
      description:
        'My Classrooms lists the classes assigned to you. Open a class to manage its courses, students, attendance, and results.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    {
      id: 'my-classroom-overview',
      target: '[data-tour="classrooms-header"]',
      title: 'Your Classrooms',
      description:
        'This is your classroom hub. Every class assigned to you appears below as a block, and each block leads to that class’s management page.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'my-classroom-first-card',
      target: '[data-tour="my-classroom-first-card"]',
      title: 'Your Class',
      description:
        'Each block is one class: its name, grade and section, how many students it has, and its class teacher. Press Next and GuideBot will open this class for you.',
      placement: 'right',
      align: 'start',
      clickOnNext: true,
      skipIfMissing: { ready: CLASSROOMS_READY },
    },
    {
      id: 'classroom-actions',
      target: '[data-tour="classroom-quick-actions"]',
      title: 'Class Actions',
      description:
        'Create Course adds a course to the class, Assign Students enrols students, Attendance opens attendance for the class, and Add Result opens results. GuideBot never runs them for you.',
      placement: 'bottom',
      align: 'start',
      skipIfMissing: { dependsOn: 'my-classroom-first-card', route: CLASSROOM_ROUTE, timeout: 8000 },
    },
    // Optional action: the mentor clicks the real button (or skips). No Next.
    {
      id: 'classroom-create-course-btn',
      target: '[data-tour="classroom-create-course-btn"]',
      title: 'Create Course (optional)',
      description:
        'The <b>+ Create Course</b> button opens the form for adding a course to this class. Click it to create a real course — the tour continues by itself — or use <b>Skip this step</b>.',
      placement: 'left',
      align: 'center',
      driverStepConfig: INTERACTIVE_NO_NEXT,
      advanceWhenPresent: '[data-tour="classroom-create-course-form"]',
      skipStepLabel: 'Skip this step',
      skipIfMissing: { dependsOn: 'my-classroom-first-card', route: CLASSROOM_ROUTE, timeout: 8000 },
    },
    {
      id: 'classroom-create-course-form',
      target: '[data-tour="classroom-create-course-form"]',
      title: 'Create Course Form (optional)',
      description:
        'Enter the course details yourself and press the create button to save a real course, or close the form to cancel. The tour continues by itself either way.',
      placement: 'left',
      align: 'center',
      driverStepConfig: INTERACTIVE_NO_NEXT,
      action: {
        signal: ACTION_SIGNAL,
        matches: (detail) => !!detail && detail.actionId === 'course-created',
        timeout: ACTION_TIMEOUT_MS,
      },
      completeOnTargetGone: true,
      skipStepLabel: 'Skip this step',
      skipIfMissing: { dependsOn: 'classroom-create-course-btn', timeout: 8000 },
    },
    {
      id: 'classroom-assign-students-btn',
      target: '[data-tour="classroom-assign-students-btn"]',
      title: 'Assign Students',
      description:
        'This button opens the list of students you can enrol in the class. Press Next and GuideBot will open it for you; nothing is selected or assigned automatically.',
      placement: 'left',
      align: 'center',
      clickOnNext: true,
      skipIfMissing: { dependsOn: 'my-classroom-first-card', route: CLASSROOM_ROUTE, timeout: 8000 },
    },
    {
      id: 'classroom-assign-form',
      target: '[data-tour="classroom-assign-form"]',
      title: 'Assign Students Form (optional)',
      description:
        'Tick the students to enrol and press the assign button to make a real assignment, or close the form to cancel. The tour continues by itself either way.',
      placement: 'left',
      align: 'center',
      driverStepConfig: INTERACTIVE_NO_NEXT,
      action: {
        signal: ACTION_SIGNAL,
        matches: (detail) => !!detail && detail.actionId === 'classroom-students-assigned',
        timeout: ACTION_TIMEOUT_MS,
      },
      completeOnTargetGone: true,
      skipStepLabel: 'Skip this step',
      skipIfMissing: { dependsOn: 'classroom-assign-students-btn', timeout: 8000 },
    },

    // ---- Attendance ----
    {
      id: 'nav-attendance',
      target: '[data-tour="nav-attendance"]',
      title: 'Attendance',
      description: 'Attendance is where you record which of your students were present or absent on a given day.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    {
      id: 'attendance-controls',
      target: '[data-tour="attendance-controls"]',
      title: 'Choose the Data',
      description:
        'Pick the date you want to record. Save Attendance stores it and Download exports it. The class is taken from your assigned classes.',
      placement: 'bottom',
      align: 'start',
    },
    {
      id: 'attendance-table',
      target: '[data-tour="attendance-table"]',
      title: 'Attendance Table',
      description:
        'Each row is a student, with their S.No., Student Name, Email, and the Attendance column where their status is recorded.',
      placement: 'top',
      align: 'start',
      skipIfMissing: { timeout: 6000 },
    },
    {
      id: 'attendance-present-absent',
      target: '[data-tour="attendance-present-absent"]',
      title: 'Present / Absent',
      description:
        'Choose Present or Absent for each student. Nothing is saved until you press Save Attendance — GuideBot never changes attendance for you.',
      placement: 'left',
      align: 'center',
      skipIfMissing: { dependsOn: 'attendance-table', timeout: 4000 },
    },
    {
      id: 'attendance-summary',
      target: '[data-tour="mentor-attendance-summary"]',
      title: 'Attendance Summary',
      description: 'These totals update as you mark students: how many are Present, how many are Absent, and the Total Students.',
      placement: 'top',
      align: 'start',
      skipIfMissing: { dependsOn: 'attendance-table', timeout: 4000 },
    },

    // ---- Class Results ----
    {
      id: 'nav-results',
      target: '[data-tour="nav-results"]',
      title: 'Class Results',
      description: 'Class Results is where you record and manage your students’ results for a class.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    {
      id: 'results-add-button',
      target: '[data-tour="results-add-button"]',
      title: 'Add Results',
      description:
        'Use Add Result to record a student’s results for the selected class. GuideBot never adds results for you.',
      placement: 'bottom',
      align: 'end',
    },
    {
      id: 'results-table',
      target: '[data-tour="results-table"]',
      title: 'Results Table',
      description:
        'Every student in the class is listed with their S.No., Student Name, a marks box for each class subject, Status, and Actions.',
      placement: 'top',
      align: 'start',
      skipIfMissing: { timeout: 6000 },
    },
    {
      id: 'results-first-action',
      target: '[data-tour="results-first-action"]',
      title: 'Actions',
      description:
        'The Actions column lets you manage each student’s result — the pencil edits it and the bin deletes it. Press Next and GuideBot will open the edit form for this student; nothing changes until you save.',
      placement: 'left',
      align: 'center',
      clickOnNext: '[data-tour="results-first-edit"]',
      skipIfMissing: { dependsOn: 'results-table', timeout: 4000 },
    },
    {
      id: 'results-edit-form',
      target: '[data-tour="results-edit-form"]',
      title: 'Edit Result (optional)',
      description:
        'Enter the marks yourself and press Save Result to update the result, or press Cancel to leave it unchanged. The tour continues by itself either way.',
      placement: 'left',
      align: 'center',
      driverStepConfig: INTERACTIVE_NO_NEXT,
      action: {
        signal: ACTION_SIGNAL,
        matches: (detail) => !!detail && detail.actionId === 'result-updated',
        timeout: ACTION_TIMEOUT_MS,
      },
      completeOnTargetGone: true,
      skipStepLabel: 'Skip this step',
      skipIfMissing: { dependsOn: 'results-first-action', timeout: 8000 },
    },

    // ---- Requirements ----
    {
      id: 'nav-requirements',
      target: '[data-tour="nav-requirements"]',
      title: 'Requirements',
      description:
        'Requirements is where you request items your classroom needs and follow whether they have been approved.',
      placement: 'right',
      align: 'center',
      autoNavigate: true,
    },
    {
      id: 'requirements-new-button',
      target: '[data-tour="requirements-new-button"]',
      title: 'New Requirement',
      description:
        'Use New Requirement to request items for your classroom. Press Next and GuideBot will open the form for you; nothing is submitted automatically.',
      placement: 'left',
      align: 'center',
      clickOnNext: true,
      skipIfMissing: { timeout: 8000 },
    },
    {
      id: 'requirements-create-form',
      target: '[data-tour="requirements-create-form"]',
      title: 'Create Requirement (optional)',
      description:
        'Enter the classroom, priority, and items yourself and press Submit Request to create a real requirement, or press Cancel. The tour continues by itself either way.',
      placement: 'left',
      align: 'center',
      driverStepConfig: INTERACTIVE_NO_NEXT,
      action: {
        signal: ACTION_SIGNAL,
        matches: (detail) => !!detail && detail.actionId === 'requirement-created',
        timeout: ACTION_TIMEOUT_MS,
      },
      completeOnTargetGone: true,
      skipStepLabel: 'Skip this step',
      skipIfMissing: { dependsOn: 'requirements-new-button', timeout: 8000 },
    },
    {
      id: 'requirement-approved-block',
      target: '[data-tour="requirement-approved-block"]',
      title: 'Approved Requirements',
      description:
        'A requirement marked approved has been accepted by the storekeeper. Each request shows its classroom, priority, and the items requested.',
      placement: 'bottom',
      align: 'start',
      skipIfMissing: { ready: '[data-tour="requirements-new-button"]' },
    },
    {
      id: 'requirement-pending-block',
      target: '[data-tour="requirement-pending-block"]',
      title: 'Pending Requirements',
      description:
        'A pending requirement has been submitted and is still waiting for the storekeeper’s decision.',
      placement: 'bottom',
      align: 'start',
      skipIfMissing: { ready: '[data-tour="requirements-new-button"]' },
    },

    // ---- Calendar ----
    // The Calendar page has no sidebar of its own, so this step must NOT
    // navigate while it is shown: the nav item is highlighted and the real
    // link is only clicked when Next is pressed.
    {
      id: 'nav-calendar',
      target: '[data-tour="nav-calendar"]',
      title: 'Calendar',
      description:
        'The Calendar shows events for your courses and lets you create your own. Press Next to open it.',
      placement: 'right',
      align: 'center',
      clickOnNext: true,
    },
    // Optional action: the mentor clicks the real Create Event button (or skips). No Next.
    {
      id: 'calendar-create-event-btn',
      target: '[data-tour="calendar-create-event"]',
      title: 'Create Event (optional)',
      description:
        'Create an event for your class or calendar. Click <b>+ Create Event</b> to open the form and create a real event — the tour continues by itself — or use <b>Skip this step</b>.',
      placement: 'right',
      align: 'start',
      driverStepConfig: INTERACTIVE_NO_NEXT,
      advanceWhenPresent: '[data-tour="calendar-create-event-modal"]',
      skipStepLabel: 'Skip this step',
      skipIfMissing: { route: '/mentor/calendar', timeout: 8000 },
    },
    {
      id: 'calendar-create-event-form',
      target: '[data-tour="calendar-create-event-modal"]',
      title: 'Create Calendar Event (optional)',
      description:
        'Enter the event title, description, start and end date and time, and choose the course, then press <b>Create</b> to save a real event — or press <b>Cancel</b>. The tour finishes by itself either way.',
      placement: 'left',
      align: 'center',
      driverStepConfig: INTERACTIVE_NO_NEXT,
      action: {
        signal: ACTION_SIGNAL,
        matches: (detail) => !!detail && detail.actionId === 'calendar-event-created',
        timeout: ACTION_TIMEOUT_MS,
      },
      completeOnTargetGone: true,
      skipStepLabel: 'Skip this step',
      skipIfMissing: { dependsOn: 'calendar-create-event-btn', timeout: 8000 },
    },
  ],
};

registerTour(mentorOverviewTour);
