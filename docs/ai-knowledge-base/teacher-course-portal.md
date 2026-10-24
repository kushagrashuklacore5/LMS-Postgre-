---
id: teacher-course-portal
title: Add course content, quizzes and students in the Course Portal (Teacher)
intent: task-procedure
portal: teacher
roles: [teacher]
navigation: "My Classrooms → open a class → course card → Course Portal (or Dashboard → Your Courses → View)"
related: [teacher-ai-tests, teacher-live-classes, student-courses-and-learning, admin-courses-manage]
sources: [client/src/pages/mentor/CourseTeacherPortal.jsx, client/src/pages/mentor/DesignAssessment.jsx, client/src/pages/mentor/AddChapter.jsx, server/controllers/chapter-controller.js, server/controllers/assessmentController.js, server/middleware/uploadPolicy.js]
verified: true
last_verified: 2026-10-21
---

# Course Portal (Teacher)

You can open the Course Portal only for courses **you teach**.

## Open it

- Go to **My Classrooms**, **Open** the class, and on the course card click **Course Portal**; or
- go to **Dashboard → Your Courses**, then **View**.

The portal has four buttons at the top (**Add Week**, **Add Material**, **Add Assessment**, **Assign Students**) and four tabs:

- **Weeks & Materials**
- **Assessments**
- **Live Classes**
- **Student Progress**

## Add a week

1. Click **Add Week**.
2. Enter the **Week Number** and **Title** (both required) and an optional **Description**.
3. Save. You will see "Week added successfully".

## Add study material

1. Click **Add Material**.
2. Choose the **Week (optional)**, or **General (No Week)**.
3. Choose the **Type**:
   - **Video Link (YouTube, etc.)** or **PDF Link**: enter the **Link URL**. It must start with http:// or https://.
   - **Video Upload** or **PDF Upload**: choose the file.
4. Add an optional **Description** and save. You will see "Material added successfully".

Upload limits:

- Only the listed file types are accepted.
- The maximum size is about 500 MB for course materials.
- A file whose content does not match its type is refused.

## Add a chapter

From **Dashboard → Your Courses → Add Chapter**:

1. Fill in the chapter (title, description, optional file, video or image).
2. Click **Add Chapter**.

Students need to complete every chapter to earn the course certificate.

## Create a quiz in the Course Portal

The Course Portal has its own older quiz tool. For the newer, AI-assisted tests, use **AI Assessments**.

1. Click **Add Assessment** and enter:
   - the title;
   - **Start Time** and **End Time** (required; the end must be after the start);
   - **Timer (minutes)**, from 1 to 1440.
2. In **Add Questions to Assessment**, enter the **Question Text**.
3. Choose the **Question Type** (**Multiple Choice**, **Short Answer**, **Essay** or **True/False**), the options, the **Correct Answer** and the **Marks**. Click **Add Question**; repeat for each question, then **Done**.
4. The quiz appears under **Assessments** as **Draft**.
5. Open **Manage Questions →** and click **Publish Assessment**. At least one question is needed ("Add at least one question before publishing").

Students see only published quizzes, and each student can attempt a quiz **once**.

## Add students to the course

**Assign Students** (**Assign More Students**) lists the school's students who are not in the course. Select them and save: "Students assigned successfully".

Usually the admin manages enrolment per class on the **Courses** page.

## Track progress

The **Student Progress** tab shows each enrolled student's chapters completed, or "No progress yet".

## Live classes

The **Live Classes** tab lists this course's lectures. Start or schedule them from the class page with **Start Class** (see "Live classes for teachers").

## Questions this answers

- How do I upload notes / PDF / video? / Material kaise upload karun?
- How do I add a chapter or week?
- How do I make a quiz in my course?
- How do I publish a quiz?
- How do I see student progress?
- How do I add a student to my course?
