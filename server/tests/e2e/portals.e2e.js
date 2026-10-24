/**
 * Browser run of the four portals, start to finish, in a visible Chrome window.
 *
 *   1. node tests/e2e/stack.js          (in one terminal: throw-away server + built client)
 *   2. node tests/e2e/portals.e2e.js    (in another)                         [npm run e2e:browser]
 *
 * What it does, through the pages a person would use (real mouse movement, clicks, typing):
 *   platform owner  signs in, creates two schools
 *   school admin    creates a teacher, a class, two students and a course; saves fee structures
 *   teacher         adds a chapter with a file, creates and publishes a quiz, marks attendance, enters a result
 *   student         opens the course and the file, takes the quiz, sees result and attendance, tries to pay
 * and after each role: that pages and requests of the other roles and of the other school are refused.
 *
 * It only ever talks to the stack above (temporary database, mock mail, no payment keys).
 * Set E2E_HEADLESS=1 to run without a window; E2E_SLOW=0 to skip the human-speed pauses.
 * Screenshots go to E2E_SHOTS (default: <repo>/temp/e2e-evidence/run); one-time passwords
 * shown on screen are masked before a screenshot is taken and are never printed.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');

const WEB = process.env.E2E_WEB || 'http://localhost:5178';
const API = process.env.E2E_API || 'http://localhost:5612';
const SHOTS = process.env.E2E_SHOTS || path.resolve(__dirname, '..', '..', '..', 'temp', 'e2e-evidence', 'run');
const HEADLESS = process.env.E2E_HEADLESS === '1';
const SLOW = process.env.E2E_SLOW === '0' ? 0 : 1;
const CHROME = process.env.E2E_CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((candidate) => fs.existsSync(candidate));

if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(WEB) || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(API)) {
  console.error('Refusing to run: this script only drives a local E2E stack.');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const secrets = {};
let page;
let pointer = { x: 300, y: 300 };

/* ---------- acting like a person ---------- */
const visible = () => page.evaluate(() => document.visibilityState === 'visible').catch(() => false);
async function moveTo(x, y) {
  // a covered or minimised window is throttled: stepped movement would never finish there
  await page.mouse.move(x, y, { steps: SLOW && (await visible()) ? 22 : 1 });
  pointer = { x, y };
  await sleep(120 * SLOW);
}
async function clickElement(element) {
  await element.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'center' }));
  await sleep(200);
  const box = await element.boundingBox();
  if (!box) throw new Error('element is not visible');
  await moveTo(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(60);
  await page.mouse.up();
}
async function find(description, locate, ...args) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const handle = await page.evaluateHandle(locate, ...args);
    const element = handle.asElement();
    if (element && (await element.boundingBox())) return element;
    await sleep(250);
  }
  throw new Error(`not found on ${page.url().replace(WEB, '')}: ${description}`);
}
const byText = (text, selector = 'button, a') =>
  find(`"${text}"`, (wanted, css) => {
    const shown = (node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const nodes = [...document.querySelectorAll(css)].filter(shown);
    const clean = (node) => (node.innerText || '').trim().toLowerCase();
    return nodes.find((node) => clean(node) === wanted.toLowerCase())
      || nodes.filter((node) => clean(node).includes(wanted.toLowerCase())).sort((a, b) => a.innerText.length - b.innerText.length)[0] || null;
  }, text, selector);
const byField = (key) =>
  find(`field "${key}"`, (wanted) => {
    const shown = (node) => { const r = node.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const fields = [...document.querySelectorAll('input, textarea')].filter(shown);
    const k = wanted.toLowerCase();
    return fields.find((f) => (f.name || '').toLowerCase() === k) || fields.find((f) => (f.placeholder || '').toLowerCase().includes(k)) || null;
  }, key);

async function click(text, selector) { await clickElement(await byText(text, selector)); await sleep(600); }
async function type(key, value) {
  await clickElement(await byField(key));
  await page.keyboard.down('Control'); await page.keyboard.press('a'); await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(String(value), { delay: 25 * SLOW });
}
async function choose(index, optionText) {
  const selects = [];
  for (const element of await page.$$('select')) if (await element.boundingBox()) selects.push(element);
  if (!selects[index]) throw new Error(`no drop-down #${index} on ${page.url().replace(WEB, '')}`);
  await clickElement(selects[index]);
  await page.keyboard.press('Escape');
  const value = await selects[index].evaluate((node, wanted) => ([...node.options].find((o) => o.text.toLowerCase().includes(wanted.toLowerCase())) || {}).value, optionText);
  if (value === undefined) throw new Error(`option "${optionText}" not offered`);
  await selects[index].select(value);
  await sleep(400);
}
async function setDateTime(index, value) {
  const element = (await page.$$('input[type=datetime-local]'))[index];
  await clickElement(element);
  await page.keyboard.press('Escape');
  await element.evaluate((node, v) => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set.call(node, v);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
const go = async (route) => { await page.goto(WEB + route, { waitUntil: 'networkidle2', timeout: 45000 }); await sleep(900); };
const text = async () => page.evaluate(() => document.body.innerText);
const waitForText = async (pattern, what = String(pattern)) => {
  for (let attempt = 0; attempt < 60; attempt++) { if (pattern.test(await text())) return; await sleep(250); }
  throw new Error(`the page never showed ${what} (at ${page.url().replace(WEB, '')})`);
};
/** Calls the API from inside the page with the signed-in session, like the page's own requests. */
const api = (method, url, body) =>
  page.evaluate(async (base, m, u, b) => {
    const token = localStorage.getItem('token');
    const response = await fetch(base + u, { method: m, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
    let json = null; try { json = await response.clone().json(); } catch { /* not JSON */ }
    return { status: response.status, body: json };
  }, API, method, url, body);

/** Reads a one-time password shown on the page into memory and masks it on screen. */
async function takePassword(name) {
  for (let attempt = 0; attempt < 30 && !secrets[name]; attempt++) {
    secrets[name] = await page.evaluate(() => {
      const mask = '************';
      const leaf = [...document.querySelectorAll('body *')].find((node) => node.children.length === 0 && /^[A-Za-z0-9!@#$%^&*_\-+=?]{10,20}$/.test((node.innerText || '').trim()) && /[A-Z]/.test(node.innerText) && /\d/.test(node.innerText));
      if (leaf) { const value = leaf.innerText.trim(); leaf.textContent = mask; return value; }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const match = /Password:?\s*([^\s]{8,24})/.exec(node.nodeValue);
        if (match) { node.nodeValue = node.nodeValue.replace(match[1], mask); return match[1]; }
      }
      return null;
    });
    if (!secrets[name]) await sleep(250);
  }
  if (!secrets[name]) throw new Error(`no one-time password was shown for ${name}`);
}

/** Clicks "Copy password" in the notification and checks the clipboard holds the password. */
async function copyPassword(name) {
  await click('Copy password', 'button');
  await waitForText(/Password copied|Could not copy/, 'the copy message');
  const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
  expect(copied === secrets[name], copied === null ? 'the clipboard could not be read back' : 'the clipboard does not hold the password');
}

async function shot(name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

async function signIn(email, password, landing) {
  await page.evaluate(() => localStorage.clear()).catch(() => {});
  await go('/login');
  if (!(await page.$('input[placeholder="student@core5.edu"]'))) await click('SIGN IN', 'button');
  await type('student@core5.edu', email);
  await type('••••••••', password);
  await click('SIGN IN TO STUDENT PORTAL', 'button');
  await page.waitForFunction((expected) => location.pathname.startsWith(expected), { timeout: 20000 }, landing);
  await sleep(1500);
  const terms = await page.$('#acknowledge');
  if (terms) { await clickElement(terms); await click('Accept & Continue to Dashboard', 'button'); }
}
async function signOut() {
  await click('Logout', 'button, a');
  await page.waitForFunction(() => !localStorage.getItem('token'), { timeout: 10000 });
}

async function check(id, title, work) {
  const started = Date.now();
  try {
    await work();
    results.push({ id, title, status: 'PASS', ms: Date.now() - started });
    console.log(`PASS  ${id}  ${title}`);
  } catch (error) {
    results.push({ id, title, status: 'FAIL', ms: Date.now() - started, error: error.message.split('\n')[0] });
    console.log(`FAIL  ${id}  ${title}\n      ${error.message.split('\n')[0]}`);
    await shot(`FAIL-${id}`).catch(() => {});
  }
}
const expect = (condition, message) => { if (!condition) throw new Error(message); };
const refused = async (label, calls) => {
  for (const [method, url, body] of calls) {
    const response = await api(method, url, body);
    expect([401, 403, 404].includes(response.status), `${label}: ${method} ${url} answered ${response.status}`);
  }
};

(async () => {
  if (!CHROME) throw new Error('Chrome was not found; set E2E_CHROME to its path.');
  const ready = await fetch(`${API}/health/ready`).then((r) => r.status).catch(() => 0);
  if (ready !== 200) throw new Error(`the E2E stack is not running (${API}/health/ready -> ${ready}). Start it with: node tests/e2e/stack.js`);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lms-e2e-chrome-'));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: HEADLESS, userDataDir: profile, defaultViewport: null, args: ['--window-size=1366,900', '--no-first-run', '--no-default-browser-check', '--disable-features=Translate'] });
  page = (await browser.pages())[0] || (await browser.newPage());
  await browser.defaultBrowserContext().overridePermissions(WEB, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']).catch(() => {});
  page.on('dialog', (dialog) => dialog.accept().catch(() => {}));
  const serverErrors = [];
  page.on('response', (response) => { if (response.url().startsWith(API) && response.status() >= 500 && !response.url().includes('/assessment-agent/') && !response.url().includes('/payments/create-order') && !(response.status() === 503 && response.url() === `${API}/api/live-classes`)) serverErrors.push(`${response.status()} ${response.url().replace(API, '')}`); });
  // a pointer the watcher can follow
  await page.evaluateOnNewDocument(() => {
    const make = () => {
      if (!document.body || document.getElementById('__e2e_pointer')) return;
      const dot = document.createElement('div');
      dot.id = '__e2e_pointer';
      dot.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,60,0,.55);border:2px solid #fff;box-shadow:0 0 0 2px rgba(255,60,0,.9);pointer-events:none;left:-50px;top:-50px';
      document.body.appendChild(dot);
      addEventListener('mousemove', (event) => { dot.style.left = `${event.clientX}px`; dot.style.top = `${event.clientY}px`; }, true);
    };
    document.addEventListener('DOMContentLoaded', make);
    setInterval(make, 500);
  });

  const stamp = Date.now().toString(36);
  const mail = (name) => `${name}.${stamp}@e2e.invalid`;
  const upload = path.join(profile, 'notes.pdf');
  fs.writeFileSync(upload, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  const disguised = path.join(profile, 'fake.pdf');
  fs.writeFileSync(disguised, '<html><script>alert(1)</script></html>');
  const ids = {};

  /* ============ platform owner ============ */
  await check('SA-1', 'the dashboard is not shown without signing in', async () => {
    await go('/superadmin/dashboard');
    expect(page.url().endsWith('/superadmin/login'), `landed on ${page.url()}`);
  });
  await check('SA-2', 'a wrong password is refused with a message', async () => {
    await go('/login');
    if (!(await page.$('input[placeholder="student@core5.edu"]'))) await click('SIGN IN', 'button');
    await type('student@core5.edu', 'superadmin@core5.com');
    await type('••••••••', 'not-the-password-1');
    await click('SIGN IN TO STUDENT PORTAL', 'button');
    await waitForText(/Invalid email or password/, 'the error message');
    expect(!(await page.evaluate(() => localStorage.getItem('token'))), 'a session was created');
  });
  await check('SA-3', 'signs in and creates two schools with their admins', async () => {
    await signIn('superadmin@core5.com', 'password', '/superadmin/dashboard');
    for (const [key, name, city] of [['adminA', `Sunrise ${stamp}`, 'Pune'], ['adminB', `Riverbank ${stamp}`, 'Nagpur']]) {
      await go('/superadmin/dashboard?tab=createUniversity');
      await type('name', name); await type('city', city); await type('country', 'India');
      await type('email', mail(key)); await type('phone', '9000000001');
      await click('CREATE INSTITUTE', 'button');
      await waitForText(/Institute & Admin Created Successfully/, 'the success panel');
      await takePassword(key);
      await shot(`SA-3-${key}`);
    }
    await go('/superadmin/dashboard?tab=universities');
    await waitForText(new RegExp(`Riverbank ${stamp}`), 'the new school in the list');
  });
  await check('SA-4', 'an address that is not an email is refused', async () => {
    const response = await api('POST', '/api/superadmin/create-university', { name: 'Bad Email School', email: 'not-an-email' });
    expect(response.status === 400, `answered ${response.status}`);
  });
  await check('SA-5', 'signing out ends the session on the server', async () => {
    const old = await page.evaluate(() => localStorage.getItem('token'));
    await signOut();
    const status = await page.evaluate(async (base, token) => (await fetch(`${base}/api/superadmin/universities`, { headers: { Authorization: `Bearer ${token}` } })).status, API, old);
    expect(status === 401, `the old token still answered ${status}`);
  });

  /* ============ school admin ============ */
  await check('AD-1', 'the new admin signs in with the one-time password', async () => {
    await signIn(mail('adminA'), secrets.adminA, '/admin/dashboard');
    await waitForText(/Admin Dashboard/);
  });
  await check('AD-2', 'creates a teacher', async () => {
    await go('/admin/add-teacher');
    await type('fullName', 'Meera Teacher'); await type('email', mail('teacher')); await type('phone', '9000000011');
    await type('qualification', 'M.Sc'); await type('subject', 'Science');
    await click('Save Teacher', 'button');
    await waitForText(/Teacher created/);
    await takePassword('teacher');
    await copyPassword('teacher');
  });
  await check('AD-3', 'creates a class with that teacher; the same class twice is refused', async () => {
    await go('/admin/classrooms');
    await click('CREATE CLASSROOM', 'button');
    await choose(0, 'Grade 5'); await type('enter section', 'A'); await choose(1, mail('teacher'));
    await click('CREATE', 'button');
    await waitForText(/Classroom created successfully/);
    const list = await api('GET', '/api/classrooms');
    ids.classroom = (list.body.data || list.body.classrooms || list.body)[0].id;
    const people = (await api('GET', '/api/admin/users')).body;
    const teacherId = (people.users || people.data || people).find((u) => u.email === mail('teacher')).id;
    const again = await api('POST', '/api/classrooms', { grade: '5', section: 'A', classTeacherId: teacherId });
    expect(again.status === 409 || again.status === 400, `a duplicate class answered ${again.status}`);
  });
  await check('AD-4', 'creates two students in that class', async () => {
    for (const [key, name] of [['student', 'Asha Student'], ['student2', 'Vivek Student']]) {
      await go('/admin/add-student');
      await type('fullName', name); await type('parentName', 'Parent'); await type('email', mail(key)); await type('phone', '9000000021');
      await choose(0, 'Grade 5'); await sleep(500); await choose(1, 'A');
      await click('Save Student', 'button');
      await waitForText(/Student created successfully/);
      await takePassword(key);
      await copyPassword(key);
      await go('/admin/dashboard');
    }
    const users = await api('GET', '/api/admin/users');
    const list = users.body.users || users.body.data || users.body;
    ids.student = list.find((u) => u.email === mail('student')).id;
    ids.student2 = list.find((u) => u.email === mail('student2')).id;
    ids.teacher = list.find((u) => u.email === mail('teacher')).id;
    expect(list.length === 4, `the school has ${list.length} accounts, expected 4`);
  });
  await check('AD-5', 'creates a course for the teacher and both students', async () => {
    await go('/admin/create-course');
    await type('title', 'Science Grade 5'); await type('category', 'Science'); await type('duration', '8 Weeks'); await type('description', 'Browser run');
    await choose(0, mail('teacher'));
    await clickElement(await byText('5-A', 'label')); // the class; "All students" is the default
    await click('Create Course & Assign Students', 'button');
    // after saving, the admin lands on the course list
    await page.waitForFunction(() => location.pathname === '/admin/courses', { timeout: 15000 });
    const courses = await api('GET', '/api/courses');
    const course = (courses.body.courses || courses.body.data || courses.body).find((c) => c.title === 'Science Grade 5');
    expect(course && Number(course.mentorId) === ids.teacher, 'the course is not assigned to the chosen teacher');
    ids.course = course.id || course._id;
  });
  await check('AD-6', 'saves both fee structures; a negative fee is refused', async () => {
    await go('/admin/fee-structure');
    await click('SAVE PRIMARY STRUCTURE', 'button'); await waitForText(/Primary fee structure[^\n]*saved/i);
    await click('SAVE SECONDARY STRUCTURE', 'button'); await waitForText(/Secondary fee structure[^\n]*saved/i);
    const list = await api('GET', '/api/classrooms/fee-structures');
    const secondary = (list.body.feeStructures || list.body.data || list.body).find((f) => f.category === 'Secondary');
    const negative = await api('PUT', `/api/classrooms/fee-structures/${secondary.id}`, { tuitionFee: -500 });
    expect(negative.status === 400, `a negative fee answered ${negative.status}`);
  });
  await check('AD-7', 'publishes an announcement', async () => {
    await go('/admin/dashboard');
    await click('+ ANNOUNCEMENT', 'button');
    await type('title', 'Sports day on Friday'); await type('message', 'Bring sports shoes.');
    await choose(0, 'Both');
    await click('Publish', 'button');
    await waitForText(/Announcement published/);
  });
  await check('AD-9', 'assigns the course to a second class from the Courses page; its student is enrolled', async () => {
    // a second class with one student (set up through the API the pages use)
    expect((await api('POST', '/api/classrooms', { grade: '6', section: 'B', classTeacherId: ids.teacher })).status === 201, 'class 6-B was not created');
    const list = await api('GET', '/api/classrooms');
    ids.classroom6B = (list.body.data || list.body.classrooms || list.body).find((c) => String(c.grade) === '6').id;
    const created = await api('POST', '/api/admin/create-student', { fullName: 'Ravi Sixth', email: mail('student3'), classroomId: ids.classroom6B, section: 'B' });
    expect(created.status === 201, `the 6-B student was not created (${created.status})`);
    const people = (await api('GET', '/api/admin/users')).body;
    ids.student3 = (people.users || people.data || people).find((u) => u.email === mail('student3')).id;

    await go('/admin/courses');
    await waitForText(/Science Grade 5/);
    await click('Assign to classes', 'button');
    await clickElement(await byText('6-B', 'label'));
    await click('Assign 1', 'button');
    await waitForText(/1 student\(s\) enrolled/, 'the enrolment summary');
    await waitForText(/6-B — 1/, 'the new class with its count');
    const again = await api('POST', `/api/courses/${ids.course}/classrooms`, { classroomIds: [ids.classroom6B] });
    expect(again.body.data[0].enrolledNow === 0 && again.body.data[0].alreadyEnrolled === 1, 'assigning twice enrolled again');
    await shot('AD-9-courses-page');
  });
  await check('AD-10', 'creates a second course for the teacher, chosen for class 6-B in the form', async () => {
    await go('/admin/create-course');
    await type('title', 'Maths Grade 6'); await type('description', 'Taught to 6-B');
    await choose(0, mail('teacher'));
    await clickElement(await byText('6-B', 'label'));
    await click('Create Course & Assign Students', 'button');
    await page.waitForFunction(() => location.pathname === '/admin/courses', { timeout: 15000 });
    await waitForText(/Maths Grade 6/);
    const overview = await api('GET', '/api/courses/teaching/overview');
    const maths = overview.body.data.courses.find((c) => c.title === 'Maths Grade 6');
    expect(maths && maths.total === 1 && maths.classes.map((c) => c.label).join() === '6-B', `Maths: ${JSON.stringify(maths)}`);
    ids.maths = maths.id;
  });
  await check('AD-11', 'creates a course for SELECTED students of a class: only the ticked student is enrolled', async () => {
    await go('/admin/create-course');
    await type('title', 'Art Grade 5'); await type('description', 'Only some students');
    await choose(0, mail('teacher'));
    await clickElement(await byText('5-A', 'label'));
    await clickElement(await byText('Selected students', 'label'));
    await waitForText(/Asha Student/, 'the class\'s students to tick');
    await clickElement(await byText('Asha Student', 'label'));
    await shot('AD-11-selected-students');
    await click('Create Course & Assign Students', 'button');
    await page.waitForFunction(() => location.pathname === '/admin/courses', { timeout: 15000 });
    const overview = (await api('GET', '/api/courses/teaching/overview')).body.data;
    const art = overview.courses.find((c) => c.title === 'Art Grade 5');
    expect(art && art.total === 1, `Art has ${art && art.total} student(s), expected 1`);
    ids.art = art.id;
    const roster = (await api('GET', `/api/courses/${art.id}/roster`)).body.data;
    expect(roster.groups.flatMap((g) => g.students.map((s) => s.id)).join() === String(ids.student), 'the roster is not just Asha');
  });
  await check('AD-13', 'Courses page: an assigned class is not offered again; removing it asks first; Cancel keeps it', async () => {
    await go('/admin/courses');
    await waitForText(/Art Grade 5/);
    const inCard = (title, text) => find(`"${text}" of ${title}`, (course, wanted) => {
      const card = [...document.querySelectorAll('h2')].find((h) => h.innerText.trim() === course)?.closest('.bg-white');
      return card ? [...card.querySelectorAll('button')].find((b) => b.innerText.trim().startsWith(wanted)) || null : null;
    }, title, text);
    await clickElement(await inCard('Art Grade 5', 'Assign to classes'));
    const row = await page.evaluate(() => {
      const r = [...document.querySelectorAll('[aria-label="Assign to classes"] [data-assigned="true"]')].find((n) => n.innerText.includes('5-A'));
      return r ? { text: r.innerText, checkbox: Boolean(r.querySelector('input')) } : null;
    });
    expect(row && /Assigned/.test(row.text) && !row.checkbox, `5-A in the dialog: ${JSON.stringify(row)}`);
    await shot('AD-13-assigned-class');
    await click('Remove class', 'button');
    await waitForText(/Remove 5-A from Art Grade 5\?/, 'the confirmation naming class and course');
    await click('Cancel', '[role="alertdialog"] button');
    const classes = (await api('GET', `/api/courses/${ids.art}/classrooms`)).body.data.map((c) => c.label);
    expect(classes.includes('5-A'), 'Cancel removed the class');
    await click('Cancel', '[aria-label="Assign to classes"] button');
    ids.inCard = inCard;
  });
  await check('AD-14', 'a class of a course: the whole class, ticked by enrolment; adding goes straight in, removing asks first', async () => {
    const studentsOf = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[aria-label="Class students"] label')].map((l) => [l.innerText.split('\n')[0].trim(), l.querySelector('input').checked])));
    await clickElement(await ids.inCard('Art Grade 5', '5-A'));
    await waitForText(/Vivek Student/, 'the whole class');
    let shown = await studentsOf();
    expect(shown['Asha Student'] === true && shown['Vivek Student'] === false && Object.keys(shown).length === 2, `ticks: ${JSON.stringify(shown)}`);
    await shot('AD-14-class-roster');
    await clickElement(await byText('Vivek Student', '[aria-label="Class students"] label'));
    await click('Save', '[aria-label="Class students"] button');
    await waitForText(/1 enrolled, 0 removed/, 'the save summary');
    expect(!(await page.$('[role="alertdialog"]')), 'adding asked for a confirmation');
    let art = (await api('GET', '/api/courses/teaching/overview')).body.data.courses.find((c) => c.id === ids.art);
    expect(art.total === 2, `Art has ${art.total} student(s) after adding Vivek`);

    await clickElement(await ids.inCard('Art Grade 5', '5-A'));
    await waitForText(/Vivek Student/);
    await clickElement(await byText('Vivek Student', '[aria-label="Class students"] label'));
    await click('Save', '[aria-label="Class students"] button');
    await waitForText(/will no longer take/, 'the removal confirmation');
    const asked = await page.evaluate(() => document.querySelector('[role="alertdialog"]').innerText);
    expect(/Vivek Student/.test(asked) && /Art Grade 5/.test(asked) && /5-A/.test(asked), `the confirmation does not name student, course and class: ${asked}`);
    await shot('AD-14-remove-confirmation');
    await click('Cancel', '[role="alertdialog"] button');
    art = (await api('GET', '/api/courses/teaching/overview')).body.data.courses.find((c) => c.id === ids.art);
    expect(art.total === 2, 'Cancel removed the student');
    await click('Save', '[aria-label="Class students"] button');
    await click('Remove 1 student(s)', '[role="alertdialog"] button');
    await waitForText(/0 enrolled, 1 removed/, 'the save summary');
    const roster = (await api('GET', `/api/courses/${ids.art}/roster`)).body.data;
    expect(roster.groups.flatMap((g) => g.students.map((s) => s.id)).join() === String(ids.student), 'Art is not back to just Asha');
    const classmates = (await api('GET', `/api/classrooms/${ids.classroom}/students`)).body;
    expect(JSON.stringify(classmates).includes('Vivek Student'), 'Vivek lost his class');
  });
  await check('AD-12', 'class first: a course without a class is refused, with a message', async () => {
    await go('/admin/create-course');
    await type('title', 'No Class Course');
    await choose(0, mail('teacher'));
    await click('Create Course & Assign Students', 'button');
    await waitForText(/Choose at least one class/, 'the class-first message');
    const direct = await api('POST', '/api/courses/create-course', { title: 'No Class Course', mentorId: ids.teacher });
    expect(direct.status === 400, `the server answered ${direct.status}`);
  });
  await check('AD-8', 'cannot reach the platform owner\'s area or another school', async () => {
    await refused('admin', [['GET', '/api/superadmin/universities'], ['GET', '/api/database-export/tables'], ['GET', '/api/courses/999999'], ['DELETE', '/api/admin/users/1']]);
    await signOut();
  });

  /* ============ teacher ============ */
  await check('TE-1', 'signs in and sees the course', async () => {
    await signIn(mail('teacher'), secrets.teacher, '/mentor/dashboard');
    await waitForText(/Science Grade 5/);
  });
  await check('TE-2', 'adds a chapter with a file; a disguised file is refused', async () => {
    await go('/mentor/add-chapter');
    await click('Select', 'button');
    await type('title', 'Chapter 1: Plants'); await type('description', 'Parts of a plant'); await type('videoUrl', 'https://example.invalid/video1');
    await (await page.$('input[type=file]')).uploadFile(disguised);
    await click('Add Chapter', 'button');
    await waitForText(/Failed to create chapter/);
    await (await page.$('input[type=file]')).uploadFile(upload);
    await click('Add Chapter', 'button');
    await waitForText(/Chapter created successfully/);
  });
  await check('TE-3', 'creates a quiz with two questions and publishes it', async () => {
    const bad = await api('POST', '/api/assessments/create', { courseId: ids.course, title: 'Backwards', startTime: new Date(Date.now() + 7200e3).toISOString(), endTime: new Date(Date.now() + 3600e3).toISOString() });
    expect(bad.status === 400, `a quiz ending before it starts answered ${bad.status}`);
    await go('/mentor/dashboard');
    await click('Assessment', 'button, a');
    const local = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    await type('assessment title', 'Plants Quiz'); await type('description', 'Chapter 1');
    await setDateTime(0, local(new Date(Date.now() - 1800e3))); await setDateTime(1, local(new Date(Date.now() + 6 * 3600e3)));
    await click('Create Assessment', 'button');
    await page.waitForFunction(() => /\/mentor\/assessment\/\d+/.test(location.pathname), { timeout: 15000 });
    ids.assessment = Number(page.url().split('/').pop());
    for (const [question, first, second, correct] of [['Which part of a plant makes food?', 'Leaf', 'Root', 0], ['How many cotyledons does a dicot seed have?', '1', '2', 1]]) {
      await type('enter question text', question); await type('option 1', first); await type('option 2', second);
      await clickElement((await page.$$('input[type=radio]'))[2 + correct]);
      await click('Add Question', 'button');
      await waitForText(new RegExp(question.replace(/[?]/g, '\\?')));
      await sleep(800);
    }
    await click('Publish Assessment', 'button');
    await waitForText(/published successfully/i);
  });
  await check('TE-4', 'marks attendance; saving the same day twice keeps one record each', async () => {
    await go('/mentor/attendance');
    // the teacher works in two classes now (5-A, and 6-B through Maths): pick 5-A
    if (await page.$('#attendance-class')) await choose(0, '5-A');
    await waitForText(/Vivek Student/);
    await clickElement((await page.$$(`input[name=attendance-${ids.student2}]`))[1]);
    await click('Save Attendance', 'button'); await waitForText(/1 present, 1 absent/);
    await click('Save Attendance', 'button'); await sleep(1500);
    const today = new Date().toISOString().slice(0, 10);
    const day = await api('GET', `/api/attendance/classroom/${ids.classroom}/date/${today}`);
    const rows = day.body.attendance || day.body.data || day.body;
    expect(rows.length === 2, `${rows.length} attendance rows for two students`);
  });
  await check('TE-5', 'enters a result; marks above the total are refused', async () => {
    const over = await api('POST', '/api/results/add', { classroomId: ids.classroom, studentId: ids.student, term: 'Probe', subjects: [{ name: 'Science', marks: 150, total: 100 }] });
    expect(over.status === 400, `150/100 answered ${over.status}`);
    await go('/mentor/results');
    await choose(0, 'Grade 5');
    await type('first term', 'Term 1');
    await click('Add Result', 'button');
    await choose(1, 'Asha Student');
    await type('subject name', 'Science'); await type('marks', '82'); await type('total', '100');
    await click('Save Result', 'button');
    await waitForText(/Science 82\/100/);
  });
  await check('TE-7', 'My Students, by course: the course\'s students grouped by class, with filter and search', async () => {
    await go('/mentor/students');
    await click('By course', 'button');
    await choose(0, 'Science Grade 5');
    await waitForText(/5-A — 2 students/, 'the 5-A header with its count');
    await waitForText(/6-B — 1 student\b/, 'the 6-B header with its count');
    await shot('TE-7-by-course');
    await choose(1, '6-B');
    await waitForText(/Ravi Sixth/);
    expect(!/Asha Student/.test(await text()), 'the class filter left another class\'s student');
    await choose(1, 'All classes');
    await type('search name', 'vivek');
    await waitForText(/showing 1 of 3/);
    await type('search name', 'nobody-like-this');
    await waitForText(/No student matches your search/);
  });
  await check('TE-8', 'My Students, by class: a class, then a course, shows that class\'s students only', async () => {
    await go('/mentor/students');
    await choose(0, '6-B');
    await choose(1, 'Maths Grade 6');
    await waitForText(/6-B — 1 student\b/);
    await waitForText(/Ravi Sixth/);
    await choose(0, '5-A');
    await choose(1, 'Science Grade 5');
    await waitForText(/5-A — 2 students/);
    expect(!/Ravi Sixth/.test(await text()), 'a 6-B student shown under 5-A');
    await shot('TE-8-by-class');
    await refused('teacher', [['POST', `/api/courses/${ids.course}/classrooms`, { classroomIds: [ids.classroom6B] }], ['DELETE', `/api/courses/${ids.course}/classrooms/${ids.classroom6B}`]]);
  });
  await check('TE-9', 'AI test: class, then one of the teacher\'s courses of that class; stored with the course', async () => {
    await go('/teacher/assessments');
    await click('New Test', 'button'); // opens the manual test form
    await type('chemical bonding', 'Art Quiz'); await type('e.g. chemistry', 'Art');
    await choose(0, 'Grade 5'); // this page names classes by grade
    const offered = await page.evaluate(() => [...document.querySelector('select[aria-label="Course"]').options].map((o) => o.text));
    expect(offered.includes('Art Grade 5') && offered.includes('Science Grade 5') && !offered.includes('Maths Grade 6'), `courses offered for 5-A: ${offered.join(', ')}`);
    await page.select('select[aria-label="Course"]', String(ids.art));
    await shot('TE-9-ai-course-choice');
    await click('Create Draft Test', 'button');
    await waitForText(/Draft created/);
    const mine = (await api('GET', '/api/assessment-agent/teacher/assessments')).body.assessments;
    const quiz = mine.find((a) => a.title === 'Art Quiz');
    expect(quiz && quiz.courseId === ids.art && quiz.course.title === 'Art Grade 5' && quiz.legacy === false, `stored: ${JSON.stringify(quiz && { courseId: quiz.courseId, legacy: quiz.legacy })}`);
    ids.artQuiz = quiz.id;
    // question and publishing through the same API the page uses (the question editor is unchanged)
    const q = await api('POST', `/api/assessment-agent/teacher/assessments/${quiz.id}/questions`, { text: 'Which is a primary colour?', options: ['Red', 'Grey', 'Brown', 'Pink'].map((text, i) => ({ text, isCorrect: i === 0 })) });
    expect(q.status === 201, `adding a question answered ${q.status}`);
    const picker = (await api('GET', `/api/assessment-agent/teacher/classrooms/${ids.classroom}/students?courseId=${ids.art}`)).body.students.map((s) => s.id);
    expect(picker.join() === String(ids.student), `the "assign to" list is ${picker.join()}, expected only Asha`);
    const wrong = await api('POST', `/api/assessment-agent/teacher/assessments/${quiz.id}/publish`, { recipientIds: [ids.student2] });
    expect(wrong.status === 400, `publishing to a student outside the course answered ${wrong.status}`);
    const published = await api('POST', `/api/assessment-agent/teacher/assessments/${quiz.id}/publish`);
    expect(published.status === 200, `publishing answered ${published.status}`);
    const bad = await api('POST', '/api/assessment-agent/teacher/assessments', { title: 'Wrong course', subject: 'x', classroomId: ids.classroom, courseId: ids.maths });
    expect(bad.status === 400, `a course not taught to the class answered ${bad.status}`);
  });
  await check('TE-10', 'Start Class: schedules a lecture of their course; "start now" says the meeting service is not set up', async () => {
    await go(`/mentor/classroom/${ids.classroom}`);
    await click('Start Class', 'button');
    await waitForText(/Start a class/, 'the start class dialog');
    const offered = await page.evaluate(() => [...document.querySelector('select[aria-label="Course"]').options].map((o) => o.text));
    expect(offered.includes('Science Grade 5') && !offered.includes('Maths Grade 6'), `courses offered: ${offered.join(', ')}`);
    await page.select('select[aria-label="Course"]', String(ids.course));
    await type('e.g. Fractions', 'Photosynthesis');
    await click('Start now', '[aria-label="Start class"] button[type="submit"]');
    await waitForText(/not set up yet/, 'the not-configured message');
    await clickElement(await byText('Schedule', 'label'));
    await shot('TE-10-start-class');
    await click('Schedule', '[aria-label="Start class"] button[type="submit"]');
    await waitForText(/Scheduled for/, 'the scheduled message');
    await waitForText(/Photosynthesis/, 'the lecture in Your Lectures');
    const mine = (await api('GET', '/api/live-classes/mine')).body.data;
    const lecture = mine.find((l) => l.title === 'Photosynthesis');
    expect(lecture && lecture.status === 'scheduled' && lecture.classroomId === ids.classroom && lecture.courseId === ids.course, `stored: ${JSON.stringify(lecture)}`);
    expect(mine.filter((l) => l.title === 'Photosynthesis').length === 1, 'the lecture was created twice');
    ids.lecture = lecture.id;
    await shot('TE-10-your-lectures');
  });
  await check('TE-6', 'cannot use admin functions or open other portals', async () => {
    await refused('teacher', [['GET', '/api/admin/users'], ['POST', '/api/admin/create-student', {}], ['POST', '/api/classrooms/fee-structures', {}], ['GET', '/api/superadmin/universities']]);
    await go('/admin/users');
    expect(page.url().endsWith('/mentor/dashboard'), `the admin page opened at ${page.url()}`);
    await signOut();
  });

  /* ============ student ============ */
  await check('ST-1', 'signs in and sees the course, today\'s attendance and the result', async () => {
    await signIn(mail('student'), secrets.student, '/student/dashboard');
    await waitForText(/Science Grade 5/); await waitForText(/82%/);
    await shot('ST-1-dashboard');
  });
  await check('ST-2', 'opens the chapter file through a signed link; the bare address is refused', async () => {
    await go(`/student/course/${ids.course}`);
    await click('Week 1', 'div, button, h3, span');
    await waitForText(/View PDF/);
    const link = await page.evaluate(() => [...document.querySelectorAll('a')].find((a) => /View PDF/.test(a.innerText)).href);
    const statuses = await page.evaluate(async (url) => [(await fetch(url)).status, (await fetch(url.split('?')[0])).status], link);
    expect(statuses[0] === 200 && statuses[1] === 403, `signed ${statuses[0]}, unsigned ${statuses[1]}`);
  });
  await check('ST-3', 'takes the quiz and is marked correctly; it cannot be taken twice', async () => {
    const paper = await api('GET', `/api/assessments/${ids.assessment}/questions`);
    expect(!/correctAnswer/.test(JSON.stringify(paper.body)), 'the answer key was sent to the student');
    await click('Start Quiz', 'button, a');
    await waitForText(/Submit Assessment/);
    const options = await page.$$('input[type=radio]');
    await clickElement(options[0]); await clickElement(options[3]);
    await click('Submit Assessment', 'button');
    await waitForText(/2 \/ 2/);
    await shot('ST-3-quiz-result');
    const again = await api('POST', '/api/assessments/submit', { assessmentId: ids.assessment, answers: [] });
    expect(again.body && again.body.alreadyAttempted === true, 'a second attempt was accepted');
  });
  await check('ST-4', 'sees announcements, results and attendance', async () => {
    await go('/announcements'); await waitForText(/Sports day on Friday/);
    await go('/student/results'); await waitForText(/82\.00%/);
    await go('/student/attendance'); await waitForText(/PRESENT/);
  });
  await check('ST-5', 'online payment says it is unavailable and records nothing', async () => {
    await go('/student/pay-fees');
    await click('Pay Fees Online', 'button, a');
    await clickElement(await byText('Pay ₹', 'button'));
    await waitForText(/Online payment is not available yet/);
    const history = await api('GET', `/api/payments/transactions/${ids.student}`);
    expect((history.body.transactions || []).length === 0, 'a payment was recorded');
  });
  await check('ST-8', 'cannot see who takes a course', async () => {
    await refused('student', [['GET', `/api/courses/${ids.course}/roster`], ['GET', '/api/courses/teaching/overview'], ['GET', `/api/courses/${ids.course}/classrooms`]]);
  });
  await check('ST-9', 'sees the AI test of a course they are enrolled in', async () => {
    const fromServer = await api('GET', '/api/assessment-agent/student/assessments');
    const me = await page.evaluate(() => JSON.parse(localStorage.getItem('user') || '{}'));
    expect((fromServer.body?.assessments || []).some((a) => a.title === 'Art Quiz'), `the server gave ${me.email} (${me.id}): ${JSON.stringify(fromServer.body).slice(0, 200)}`);
    await go('/student/assessment-agent/tests');
    await waitForText(/Art Quiz/, 'the Art test in My Tests');
  });
  await check('ST-11', 'Your Lectures: the scheduled lecture of their course is upcoming, not joinable yet', async () => {
    await go('/student/lectures');
    await waitForText(/Photosynthesis/, 'the lecture');
    await waitForText(/Upcoming/, 'its status');
    const join = await api('POST', `/api/live-classes/${ids.lecture}/join`);
    expect(join.status === 409, `joining before it starts answered ${join.status}`);
    await shot('ST-11-your-lectures');
  });
  await check('ST-6', 'cannot read a classmate\'s records or use staff functions', async () => {
    await refused('student', [
      ['GET', `/api/results/student/${ids.student2}`], ['GET', `/api/attendance/student/${ids.student2}`], ['GET', `/api/payments/transactions/${ids.student2}`],
      ['GET', '/api/admin/users'], ['POST', '/api/results/add', { classroomId: ids.classroom, studentId: ids.student, term: 'X', subjects: [] }],
      ['POST', '/api/attendance/mark', { classroomId: ids.classroom, date: '2026-01-01', attendanceData: [] }], ['PUT', `/api/assessments/${ids.assessment}/publish`],
    ]);
    const classmates = await api('GET', `/api/classrooms/${ids.classroom}/students`);
    expect(!JSON.stringify(classmates.body).includes('@e2e.invalid'), 'classmates\' email addresses were sent to a student');
    await go('/mentor/dashboard');
    expect(page.url().endsWith('/student/dashboard'), `the teacher page opened at ${page.url()}`);
  });
  await check('ST-7', 'a session the server no longer accepts returns the user to sign-in', async () => {
    await page.evaluate(() => localStorage.setItem('token', `${localStorage.getItem('token').slice(0, -6)}AAAAAA`));
    await go('/student/results');
    await page.waitForFunction(() => location.pathname === '/login', { timeout: 15000 });
    expect(!(await page.evaluate(() => localStorage.getItem('token'))), 'the dead session was kept');
  });

  /* ============ the other school ============ */
  await check('ST-10', 'a classmate not enrolled in the course sees neither the course nor its AI test', async () => {
    await signIn(mail('student2'), secrets.student2, '/student/dashboard');
    const courses = (await api('GET', '/api/courses/student')).body.map((c) => c.id || c._id);
    expect(!courses.includes(ids.art) && courses.includes(ids.course), `Vivek's courses: ${courses.join()}`);
    await go('/student/assessment-agent/tests');
    await sleep(1500);
    expect(!/Art Quiz/.test(await text()), 'the Art test is shown to a student who is not in Art');
    const direct = await api('GET', `/api/assessment-agent/student/assessments/${ids.artQuiz}`);
    expect(direct.status === 404, `opening it directly answered ${direct.status}`);
    await shot('ST-10-not-enrolled');
    await signOut();
  });
  await check('XS-1', 'the second school\'s admin sees and reaches nothing of the first school', async () => {
    // (also: the first school's course rosters and class assignments)
    await signIn(mail('adminB'), secrets.adminB, '/admin/dashboard');
    await go('/admin/users');
    await waitForText(/User Management/);
    expect(!/Asha Student|Meera Teacher/.test(await text()), 'people of the other school are listed');
    await refused('other school', [
      ['GET', `/api/classrooms/${ids.classroom}`], ['GET', `/api/classrooms/${ids.classroom}/students`], ['GET', `/api/courses/${ids.course}`],
      ['GET', `/api/results/classroom/${ids.classroom}`], ['GET', `/api/chapters/course/${ids.course}`], ['GET', `/api/assessments/${ids.assessment}/questions`],
      ['DELETE', `/api/admin/users/${ids.student}`],
      ['GET', `/api/courses/${ids.course}/roster`], ['POST', `/api/courses/${ids.course}/classrooms`, { classroomIds: [ids.classroom6B] }],
    ]);
  });
  await check('REL-1', 'no request in the whole run was answered with a server error', async () => {
    expect(serverErrors.length === 0, `server errors: ${[...new Set(serverErrors)].slice(0, 5).join('; ')}`);
  });

  await browser.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Windows may still hold the folder */ }

  const failed = results.filter((r) => r.status === 'FAIL');
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify({ ranAt: new Date().toISOString(), web: WEB, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Evidence: ${SHOTS}`);
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error('E2E run stopped:', error.message);
  process.exit(1);
});
