# MY LMS — Security Fixes (Simple Hinglish Log)

**Kis ke liye:** Jis insaan ko web development ya security ka koi gyaan nahi hai.
**Kaam ki date:** 12 October 2026
**Technical version:** `docs/security/SECURITY_REMEDIATION_PLAN.md`

**Dhyan dein:** Section 8 sabse naya update hai (doosra round). Jahan section 8 aur upar ke sections mein farq ho, section 8 sahi hai.

Is document mein har problem ko ghar, gate aur chaabi jaise simple examples se samjhaya gaya hai. Jo result likha hai woh asli test chalane ke baad ka hai. Jahan test nahi ho paya, wahan saaf likha hai "Not tested".

**Result ke shabd:**
- **Pass** = fix kiya aur test ne confirm kiya.
- **Partly** = kaafi hissa fix aur test hua, lekin kuch baaki hai.
- **Not tested** = code badla hai, par test se confirm nahi ho paya.
- **Open** = abhi fix nahi hua.

---

## 1. Overall progress — seedhi baat

Sochiye LMS ek school building hai jisme bahut saare kamre hain (students ke records, results, fees, admin office).

**Pehle haalat yeh thi:**
- Main gate par guard ID check nahi karta tha. Jo bhi aata, use "mehmaan" maan kar andar jaane deta tha.
- Koi bhi ek kaagaz par khud "Main Super Admin hoon" likh kar le aata, to use maan liya jaata tha.
- Ek school ka banda doosre school ke kamre mein ja sakta tha.
- Kuch kamron mein password likhi hui parchiyan khuli padi thi.

**Ab haalat yeh hai:**
- Main gate par ek hi guard hai jo **har** request ka ID check karta hai. Jis darwaze ka naam uski list mein nahi hai, woh darwaza band rehta hai.
- ID asli hai ya nakli, yeh server khud check karta hai. Aur har baar register (database) mein dekhta hai ki yeh banda abhi bhi school mein hai ya nahi, aur uska role kya hai.
- Har school apne hi kamron tak seemit hai. Student sirf apna record dekh sakta hai, teacher sirf apni class ka.

**Ginti (audit ke 25 critical/high issues mein se):**

| Haalat | Kitne |
|---|---|
| Poori tarah fix aur test se confirm | 17 |
| Fix hua, par poori tarah confirm nahi (ya aapka kaam baaki) | 3 |
| Abhi open | 5 |

Iske alawa kaam ke dauraan **11 naye problems** mile jo audit mein nahi the. Woh sab fix kiye gaye (section 3 dekhein).

**Tests:** Server ke 242 tests chale, 242 pass hue. Yeh tests ek alag nakli database par chalte hain jisme do nakli school hain. Asli school ke data ko chhua nahi gaya, koi asli email, payment ya AI call nahi hui.

**Zaroori baat:** Project pehle se bahut zyada safe hai, lekin "100% secure" nahi keh sakte. Section 5 aur 6 zaroor padhein, khaaskar passwords/keys badalne wala kaam jo sirf aap kar sakti hain.

---

## 2. Critical issues jo fix hue

### SEC-003 — Bina login ke andar aana ("mehmaan" wala gate)

- **Pehle kya problem thi?** Agar koi bina login ke, ya galat/purane login ke saath request bhejta, to server use rokta nahi tha. Use "guest" maan kar aage jaane deta tha. Aur agar school pata nahi hota, to use School number 1 ka maan leta tha.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Building ka guard ID maange bina sabko andar bhej raha tha, aur bol raha tha "aap pehle wale school ke honge".
- **Koi iska galat fayda kaise utha sakta tha?** Koi bhi anjaan insaan internet se users ki list, announcements, fees ki jaankari dekh sakta tha.
- **Maine kya change kiya?** Ab sahi login ke bina server seedha mana kar deta hai (code 401). "Guest" jaisa kuch nahi hai. "School 1 maan lo" wali line 49 jagah se hata di.
- **Ab kya rok diya gaya hai?** Bina login, galat login, expire ho chuka login, chhed-chhaad kiya hua login, sab.
- **Kaise check kiya ki fix sahi hai?** 12 alag tarah ke galat login bheje. Aur system ke 350 se zyada darwazon (routes) par, har ek par, bina login request bheji.
- **Test ka result:** Pass. Har jagah 401 mila. Sahi login wali request chalti rahi.
- **Kya abhi bhi karna baaki hai?** Nahi.

### SEC-004 — Haath se likha "Super Admin" pass

- **Pehle kya problem thi?** Agar login token `superadmin-` se shuru hota, to server use bina jaanche Super Admin maan leta tha. Website ka Super Admin page khud aisa nakli token banata tha, aur us page ke code mein Super Admin ka email-password likha hua tha.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Sabse badi chaabi ke liye bas ek parchi par "main maalik hoon" likhna kaafi tha.
- **Koi iska galat fayda kaise utha sakta tha?** Koi bhi sabhi schools ka data dekh sakta tha aur naye school/admin bana sakta tha.
- **Maine kya change kiya?** Woh raasta server se poori tarah hata diya. Super Admin page ab asli login use karta hai. Code mein likha password hata diya.
- **Ab kya rok diya gaya hai?** Nakli Super Admin token har jagah reject hota hai.
- **Kaise check kiya?** Nakli token banakar har darwaze par bheja.
- **Test ka result:** Pass (server). Super Admin login page ko browser mein click karke nahi dekha gaya, sirf build hua hai: **Not tested** (browser).
- **Kya abhi bhi karna baaki hai?** Super Admin ka ek asli account aur password hona chahiye. Purana page-wala password ab kaam nahi karega.

### SEC-006 — Demo accounts bina password ke khul jaate the

- **Pehle kya problem thi?** `admin@gmail.com`, `superadmin@core5.com` jaise 6 email bina password ke login ho jaate the. Aur agar aisa account bana hi nahi tha, to login karte hi ban jaata tha.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Building mein kuch "master chaabiyan" thi jo sabko pata thi.
- **Koi iska galat fayda kaise utha sakta tha?** Koi bhi admin ban kar pehle school ko chala sakta tha.
- **Maine kya change kiya?** Dono hisse hata diye. Ab har account ko sahi password dena hi padta hai. Login se koi naya account nahi banta.
- **Ab kya rok diya gaya hai?** Bina password, khaali password, ya kisi bhi random password se demo login.
- **Kaise check kiya?** 8 demo email par 4-4 tarah se try kiya (bina password, khaali, random, purana "12345678").
- **Test ka result:** Pass. Sab reject hue, koi account nahi bana. Sahi password se login chalta hai.
- **Kya abhi bhi karna baaki hai?** **Haan.** Agar kisi asli database mein yeh demo accounts pehle se bane hain, to unke purane password sabko pata hain. Unhe delete karein ya password badlein.

### SEC-005 — Register karte waqt khud ko Admin bana lena

- **Pehle kya problem thi?** Sign-up form mein jo role bheja jaata, wahi mil jaata tha, aur account turant approve ho jaata tha.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Admission form mein "main Principal hoon" likh do, aur aap Principal ban gaye.
- **Maine kya change kiya?** Public sign-up ab by default **band** hai. Agar aap ise chalu karti hain, to sirf student ya mentor ban sakta hai, woh bhi sirf ek chune hue school mein, aur admin ke approve karne tak login nahi kar sakta.
- **Kaise check kiya?** Admin, superadmin, accountant, storekeeper, vendor bankar register karne ki koshish ki.
- **Test ka result:** Pass. Har baar bina-approval wala student hi bana.
- **Kya abhi bhi karna baaki hai?** Agar aapko public sign-up chahiye, to settings mein chalu karna hoga.

### SEC-001 aur SEC-002 — Khula hua "sab kuch" wala counter

- **Pehle kya problem thi?** Ek aam raasta tha jisse 20 tarah ke records (users, results, fees, vendors...) bina login ke padhe, badle aur delete kiye ja sakte the. Users ke record ke saath password ka code (hash) bhi aata tha.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Office ki saari files ek khule counter par rakhi thi, aur koi bhi unhe padh, badal ya phaad sakta tha.
- **Koi iska galat fayda kaise utha sakta tha?** Kisi ke marks badalna, kisi ko admin bana dena, students ka data utha lena.
- **Maine kya change kiya?** Is raaste se badalne, delete karne, ek saath bahut saara daalne aur export karne wale hisse **hata diye**. Sirf padhne wala hissa bacha hai, woh bhi login ke baad, sirf apne school ka, aur password ke bina.
- **Kaise check kiya?** Purane 29 khatarnaak raaston par 6 tarah ke users se request bheji. Baseline (purane code) par yahi cheez chala kar dekha: wahan bina login user ka record password ke saath mil gaya tha aur ek vendor delete ho gaya tha.
- **Test ka result:** Pass. Naye code mein sab band, database mein kuch nahi badla.
- **Kya abhi bhi karna baaki hai?** Nahi.

### SEC-010 — Ek school doosre school ka data dekh sakta tha

- **Pehle kya problem thi?** Zyadatar jagah server yeh check hi nahi karta tha ki record kis school ka hai. Bas number (ID) badal do, doosre school ka record mil jaata tha.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Do school ek hi building mein hain, par beech mein deewar nahi thi.
- **Maine kya change kiya?** Ek central "deewar" banayi. Ab request mein jo bhi ID aati hai (address mein, sawaal mein ya form ke andar), server dekhta hai ki woh record usi school ka hai ya nahi. Doosre school ka ho to jawaab milta hai "nahi mila" (taaki pata bhi na chale ki woh record hai). Iske alawa student sirf apna, aur teacher sirf apni class/course/students ka record khol sakta hai.
- **Kaise check kiya?** Do nakli school banaye (A aur B). School A ke 5 tarah ke users se School B ki 53 cheezein padhne ki, aur 43 tarah se badalne ki koshish ki. Phir har list aur dashboard mein dhoonda ki kahin School B ka naam to nahi aa raha.
- **Test ka result:** Partly. Padhai wala hissa, results, attendance, courses, fees, payments, expenses, orders: **Pass**. Store (inventory), vendors, stock requests aur vendor invoices: **Not tested**, kyunki naye database mein woh tables bante hi nahi, to test ke paas check karne ko data nahi tha.
- **Kya abhi bhi karna baaki hai?** Store/vendor wale hisse ko asli jaisa data daal kar test karna. Aur purane records jinke saath school nahi likha, unhe sahi school dena (section 6, kaam 7).

### SEC-007 — Chaabiyan code mein likhi hui thi

- **Pehle kya problem thi?** (1) Login token banane wali secret chaabi template wali hi thi, aur na ho to code ek fixed chaabi use kar leta tha. (2) Payment (Razorpay) ki keys code mein likhi thi, live wali bhi. (3) Support email ka password 6 files mein likha tha jo GitHub par hain.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Ghar ki chaabi doormat ke neeche rakhi thi, aur uski photo internet par thi.
- **Koi iska galat fayda kaise utha sakta tha?** Jisne bhi code dekha, woh kisi ke bhi naam ka nakli login bana sakta tha, ya jhoothi payment "confirm" kar sakta tha.
- **Maine kya change kiya?** Code se saari fixed chaabiyan hata di. Ab server asli, lambi secret ke bina **start hi nahi hota**. Razorpay keys sirf server ki settings se aati hain. 6 files mein email password ki jagah placeholder likh diya.
- **Kaise check kiya?** 10 galat settings ke saath server start karke dekha, har baar usne mana kiya. Server ke code mein keys dhoondne wala test chalaya.
- **Test ka result:** Partly. Code wala hissa **Pass**. Lekin purani chaabiyan GitHub ki history mein abhi bhi hain.
- **Kya abhi bhi karna baaki hai?** **Haan, sabse zaroori kaam.** Email password, Razorpay keys aur login secret **aapko badalne honge** (section 6). Yeh main nahi kar sakta.

### SEC-008 — Password reset ka code

- **Pehle kya problem thi?** 6 number ka code galat daalne par ginti hi nahi hoti thi, to koi lagataar try kar sakta tha. Aur ek bahut badi baat mili: yeh code server ke jawaab mein hi wapas aa jaata tha.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Tijori ka code poochne par guard khud bata deta tha.
- **Koi iska galat fayda kaise utha sakta tha?** Sirf kisi ka email pata ho, to uska account apne kabze mein le sakta tha.
- **Maine kya change kiya?** Code ab sirf email mein jaata hai. 5 galat koshish ke baad code bekaar. Code ek hi baar chalta hai. 10 minute mein expire. Database mein code seedha nahi, uski "chhap" rakhi jaati hai.
- **Kaise check kiya?** Nakli mail-box (asli email nahi gayi) se code padh kar poora flow chalaya: sahi code, galat code 5 baar, purana code dobara, expire hua code, doosre ke account par code.
- **Test ka result:** Pass (10 tests).
- **Kya abhi bhi karna baaki hai?** Asli email server se ek baar try karna.

### SEC-009 — Address ke zariye database ko hukm dena

- **Pehle kya problem thi?** Ek jagah address mein likha shabd seedha database ke sawaal mein daal diya jaata tha.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Form mein naam ki jagah koi hukm likh de, aur clerk use bina soche maan le.
- **Maine kya change kiya?** Ab sirf ek pakki list ke shabd hi chalte hain, baaki sab reject.
- **Test ka result:** Pass.
- **Kya abhi bhi karna baaki hai?** Nahi.

### REL-001 — Ek request se poora server band

- **Pehle kya problem thi?** Fees ke aankdon wala ek page kholne se poora server gir jaata tha. Kaam ke dauraan ek aur aisi jagah mili: password reset maangne par bhi server band ho jaata tha.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Ek switch dabane se poori building ki bijli chali jaati thi.
- **Maine kya change kiya?** Dono jagah theek ki. Aur ek safety net lagaya ki ek galti se poora server na gire.
- **Test ka result:** Pass. Fees ke aankde sahi aaye (sirf apne school ke) aur server chalta raha.
- **Kya abhi bhi karna baaki hai?** Server ko apne aap dobara chalu karne wala tool (supervisor) abhi nahi laga.

---

## 3. High-priority issues jo fix hue

| Issue | Aasaan bhaasha mein problem | Ab kya hota hai | Result |
|---|---|---|---|
| SEC-011 Test ke jawaab | Student ko sawaalon ke saath sahi jawaab bhi mil jaate the; time khatam hone ke baad bhi submit ho jaata tha | Student ko jawaab nahi milte; sirf publish hue test, sirf time ke andar, sirf ek baar; number server lagata hai | Pass |
| SEC-012 Kisi ki bhi class | Koi bhi teacher kisi bhi class ki attendance/course badal sakta tha | Teacher sirf apni class, course aur students tak | Pass |
| SEC-013 Free mein paid plan | "Test upgrade" button se bina paise plan mil jaata tha; payment ki jaanch fail ho to bhi plan chalu | Woh raasta hata diya; ab Razorpay ki sahi mohar aur poori payment zaroori | Pass (asli payment nahi ki gayi) |
| SEC-014 File upload | Koi bhi file kisi bhi naam se upload ho jaati thi | Sirf tay ki hui file types; file ka asli content bhi check hota hai; naam random | Partly: upload **Pass**; lekin upload hui file ka link jiske paas ho woh bina login khol sakta hai (**Open**) |
| SEC-015 Poora data export | Admin/accountant poori tables Excel mein nikaal sakte the | Sirf platform owner; password wale columns hata diye | Pass |
| SEC-016 Debug darwaze | Testing ke liye bane 16 raaste khule the | Hata diye | Pass |
| SEC-017 Live updates | Koi bhi bina login live updates sun sakta tha, sabhi schools ke | Sirf login kiye hue, sirf apne school ke | Pass |
| SEC-018 Password ka code list mein | Users ki list ke saath password ka code aata tha | Kisi bhi jawaab mein nahi aata (har page, 6 roles se check kiya) | Pass |
| SEC-019 Kisi bhi website se | Koi bhi website login kiye hue user ki taraf se request bhej sakti thi | Sirf list mein likhi websites | Pass |
| SEC-021 Logs mein password | Login ke waqt password aur token log file mein likhe jaate the | Ab nahi likhe jaate | Pass |
| DATA-005 Attendance double | Ek hi din ki attendance do baar ban sakti thi | Ek student, ek class, ek din = ek hi entry; adhoori save nahi hoti | Pass |
| Fee structure restart par | Audit ko shak tha ki server start hote hi fee structures delete hote hain | Aisa abhi ke code mein nahi mila. Phir bhi pakka kiya: 3 baar restart, data bilkul wahi; delete kiye hue wapas nahi aate | Pass |

**Kaam ke dauraan mile naye problems (sab fix):**
1. Password reset ka code jawaab mein wapas aata tha (sabse khatarnaak).
2. Reset code ka time-check galat tha, code ghanton chalta tha.
3. Password reset request se server band ho jaata tha.
4. School banane/user banane wale Super Admin raaste kisi bhi login (student ka bhi) se chal jaate the.
5. Super Admin ka password website ke code mein likha tha.
6. School admin kisi ko bhi Super Admin bana sakta tha.
7. Fee reminder email kisi bhi address par bheji ja sakti thi.
8. Plan ki payment-jaanch fail hone par bhi plan chalu ho jaata tha.
9. Email password 6 files mein tha.
10. Kisi bhi school ka admin kisi bhi course mein material daal sakta tha.
11. Bilkul naye database par kai pages (admin users, student dashboard, expenses, orders) chalte hi nahi the.

---

## 4. Kaun se tests hue aur unka matlab

| Test | Kya check karta hai | Result |
|---|---|---|
| Login/ID tests (42) | Galat ID se andar aana, demo login, register, bar-bar galat password | 42 pass |
| Role tests (60) | Student admin ka kaam na kar sake, admin Super Admin ka na kar sake, etc. | 60 pass |
| Har darwaza test (10) | System ke saare raaste bina login band hain; purane khatarnaak raaste gayab hain | 10 pass |
| School deewar tests (26) | School A, School B ka kuch na dekh/badal sake; student/teacher apne tak seemit | 26 pass |
| Chhupi jaankari tests (11) | Kisi jawaab mein password, code ya andar ki technical jaankari na ho | 11 pass |
| Password reset tests (10) | Reset code ke saare niyam | 10 pass |
| Upload tests (19) | Galat/khatarnaak files reject hon | 19 pass |
| Extra hardening (10) | Live updates, logs, test ka time, fees page | 10 pass |
| Restart tests (21) | Restart par data na jaye; galat settings par server start na ho | 21 pass |
| Data sahi-pan tests (17) | Attendance, results, expenses, orders, purane records wala tool | 17 pass |
| Purana notification test (16) | Pehle se bana test | 16 pass |
| **Server total** | | **242 / 242 pass** |
| AI Assessment module | Pehle 432 pass + 93 chal hi nahi pa rahe the. Ab 524 pass, 1 fail (yeh purani galti hai, is kaam se nahi aayi) | 524 / 525 |
| Student Onboarding module | | 343 / 343 pass |
| Website (client) build | | Pass |
| Website lint check | Project mein iski setting file hi nahi hai | Not tested |

**Jo test nahi hua:** browser mein asli click karke chaaron portal; asli payment; asli email; live (hosted) website; PostgreSQL.

---

## 5. Jo abhi bhi open ya adhoora hai

1. **Passwords/keys badalna** — aapka kaam (section 6).
2. **Upload hui files** — link pata ho to bina login khul sakti hain. Naam ab random hai, to andaza lagana mushkil hai, par poora fix baaki hai.
3. **Store, vendor, stock request** — school-deewar ka code hai, par data ke saath test nahi hua.
4. **Purane records bina school ke** (expenses, orders, inventory, vendors) — jab tak aap tool nahi chalati, kisi school ko nahi dikhenge.
5. **Database ke andar ki majbooti** (audit DATA-001, 002, 003, 004 ka kuch hissa, 006) — jaise delete karne par jude records ka kya ho. Yeh bada design ka kaam hai, abhi nahi hua.
6. **Login token browser mein rakha jaata hai**, aur ek device se logout karwane ka tareeka nahi hai.
7. **Plan ki keemat** server par fixed list se nahi milayi jaati.
8. **Admin ke liye apne school ka export** — band kiya gaya hai, naya nahi banaya.
9. **Terms & Conditions ki consent** — is baar dekha nahi gaya.
10. **Kuch purane toote hue pages** (certificates, kuch payment history, stock requests) — yeh pehle se toote the, security se alag hain.

---

## 6. Aapko khud kya karna hai (manual kaam)

Yeh kaam main nahi kar sakta kyunki inke liye aapke accounts chahiye. **Pehle 5 kaam asli school ke use se pehle zaroor karein.**

1. **Support email ka password badlein.** Mail provider (Zoho/Gmail) ke admin panel mein purana "app password" hata kar naya banayein. Naya password sirf server ki `server/.env` file mein `EMAIL_PASS` mein daalein. Mailbox ke "Sent" aur login history bhi dekh lein.
2. **Razorpay ki keys badlein.** Razorpay Dashboard → Settings → API Keys → test aur **live** dono keys regenerate karein. Nayi keys server ki `.env` mein `RAZORPAY_KEY_ID` aur `RAZORPAY_KEY_SECRET` mein daalein. Haal ki payments/refunds ek baar dekh lein.
3. **Naya login secret banayein.** Yeh command do baar chalayein aur do alag values `JWT_SECRET` aur `JWT_REFRESH_SECRET` mein daalein:
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   Iske baad sab users ko ek baar dobara login karna padega.
4. **Hugging Face (AI) token** — agar purani `.env` file kabhi kisi ko bheji thi, to token naya banayein.
5. **Demo accounts hatayein.** Asli database mein `admin@gmail.com`, `superadmin@core5.com`, `portal@core5.co.in`, `student@gmail.com`, `mentor@gmail.com` jaise accounts hon to delete karein ya password badlein.
6. **Live server ki settings:** `NODE_ENV=production`, `CORS_ORIGINS=` (aapki website ka address). `server/.env.example` mein sab samjhaya hai.
7. **Purane records ko school dena.** Pehle database ki **copy** par:
   `node scripts/security/reconcile-school-ownership.js --db <copy ka path>`
   Yeh sirf report dikhata hai. Aage ke steps technical document ke section 7 mein hain.
8. **Jo accounts approve nahi hain** woh ab login nahi kar payenge. Sahi logon ko admin screen se approve karein.
9. **Live website** par agar purana code chal raha hai, to yeh sab problems wahan abhi bhi hain. Naya code deploy karna hoga.
10. **Code ko GitHub par bhejna** — maine kuch push nahi kiya, aur commit bhi nahi kiya. Saara kaam `security/critical-remediation` branch par aapke computer mein hai.

---

## 7. Checks dobara kaise chalayein

Terminal mein:

```
cd server
npm test
```

Lagbhag 100 second lagte hain. Aakhir mein `pass 242` aur `fail 0` dikhna chahiye.

Sirf security wale tests:

```
npm run test:security
```

Yeh tests apna alag nakli database banate hain aur khatam hone par hata dete hain. Asli database, asli email, asli payment ko chhute nahi. Agar computer mein asli email/payment ki settings chalu hain, to tests khud chalne se mana kar dete hain.

---

## 8. Doosra round (12 October 2026) — production ki taiyaari

Pehle round ke baad jo cheezein adhoori thi, unme se kai is round mein poori hui. **Upar ke sections pehle round ki tasveer hain; jahan farq hai, wahan yeh section sahi maana jaye.**

**Abhi ki haalat ek line mein:** Code staging (testing server) par chalane ke liye taiyaar hai. Asli school ke liye live karne se pehle section 6 ke kaam aapko karne honge.

### Is round mein kya fix hua

#### Upload hui files ab private hain (SEC-014)

- **Pehle kya problem thi?** File ka link jiske paas ho, woh bina login ke file khol sakta tha.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Almaari mein taala tha, par chaabi ki photocopy jiske paas ho woh kabhi bhi khol sakta tha.
- **Maine kya change kiya?** Ab file ka link sirf us insaan ko milta hai jise woh course dekhne ki ijazat hai. Us link par ek "mohar" aur "expiry time" (4 ghante) hota hai. Bina mohar ya time nikal jaane par file nahi khulti.
- **Kaise check kiya?** Seedha link khola (login ke saath aur bina), mohar badli, time aage badhaya, doosri file par wahi mohar lagayi, purana link chalaya.
- **Test ka result:** Pass (24 tests). Har galat koshish par mana hua; sahi teacher aur student ke liye file khuli.
- **Kya abhi bhi karna baaki hai?** Nahi.

#### Plan ki keemat ab server tay karta hai (SEC-013)

- **Pehle kya problem thi?** Plan kitne ka hai aur kitne din ka, yeh browser batata tha.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Dukaan mein grahak khud price tag likh raha tha.
- **Maine kya change kiya?** Keemat server ki settings mein hai. Order usi keemat ka banta hai. Plan tabhi chalu hota hai jab Razorpay confirm kare ki poori rakam aa gayi, usi order ki, usi plan ke liye. Ek payment se ek hi baar plan chalu hota hai.
- **Kaise check kiya?** Nakli Razorpay bana kar (asli payment nahi hui): kam paisa, adhoori payment, fail payment, doosre order ki payment, doosra plan, nakli mohar, wahi payment dobara.
- **Test ka result:** Pass (14 tests).
- **Kya abhi bhi karna baaki hai?** **Haan.** Aapko dono plan ki keemat settings mein daalni hai (`PLAN_PRICE_STANDARD_INR`, `PLAN_PRICE_PROFESSIONAL_INR`). Jab tak nahi daalengi, paid plan khareeda nahi ja sakega. Asli test-payment ek baar staging par karni hai.

#### Logout ab sach mein logout hai

- **Pehle kya problem thi?** Logout sirf browser se token hatata tha. Agar token kisi ne chura liya ho, to woh 7 din chalta rehta.
- **Maine kya change kiya?** Logout dabane par server us account ke saare purane login band kar deta hai, har device par. Password reset karne par bhi yahi hota hai.
- **Test ka result:** Pass.
- **Kya abhi bhi karna baaki hai?** Sirf ek device ko logout karna (baaki ko chhod kar) abhi nahi hai.

#### Certificates aur payment history chalne lage

- **Pehle kya problem thi?** Yeh pages hamesha error dete the. Wajah: inka code ek doosre database (MongoDB) ke liye likha tha jo is LMS mein hai hi nahi.
- **Maine kya change kiya?** Dono ko asli database par dobara likha. Certificate ab asli PDF banta hai, tabhi jab student ne course ke saare chapters poore kiye hon, aur sirf wahi student use khol sakta hai. Online fee payment verify hone ke baad ab record mein likhi jaati hai, ek hi baar.
- **Test ka result:** Pass (7 tests).
- **Kya abhi bhi karna baaki hai?** Browser mein ek baar dekhna.

#### AI Assessment ka 1 fail test

- **Kya tha?** Pichhli baar 525 mein se 1 test fail tha aur maine use "purani galti" kaha tha. Is baar wajah dhoondi.
- **Wajah:** Pehle ke kaam (Work Log Entry 3) mein test save karte waqt class chunna zaroori kiya gaya tha. Yeh test tab chal hi nahi pa raha tha, isliye use update nahi kiya gaya; woh class bheje bina save kar raha tha.
- **Kya kiya?** Test ki request mein class jodi. Product ka code nahi badla.
- **Test ka result:** Pass. Ab 525 mein se 525.

#### Server ki majbooti

| Kya | Aasaan bhaasha mein | Result |
|---|---|---|
| Atki hui requests | Pehle kuch galtiyon par request bas latki rehti thi. Ab turant saaf error milta hai | Pass |
| Health check | Do darwaze: "server zinda hai?" aur "server kaam ke liye taiyaar hai (database mil raha hai)?" | Pass |
| Aaram se band hona | Server band karte waqt chalti requests poori hone deta hai, phir band hota hai | Not tested (code likha hai) |
| Har request ka number | Har request ko ek ID milti hai, jisse log mein dhoondhna aasaan hai. Log mein password/token nahi jaata | Pass |
| Bahut badi request | 5 MB se badi request mana | Pass |
| Double submit | Ek student ek test ek hi baar submit kar sakta hai, chahe do baar button dab jaye | Pass |
| Badi lists | Lists ko tukdon mein (page by page) maanga ja sakta hai | Pass |

#### Speed

40,000 students wale nakli database par naap kar dekha. Database mein "index" (kitaab ke peeche wali suchi jaisa) jodne se:

| Kaam | Pehle | Ab |
|---|---|---|
| Ek student ke results | 5.3 ms | 0.08 ms (67 guna tez) |
| Ek student ki payments | 5.2 ms | 0.09 ms (55 guna tez) |
| Ek class ke results | 5.5 ms | 0.2 ms (27 guna tez) |
| Ek school ki fees ka total | 14.4 ms | 1.2 ms (12 guna tez) |

Yeh sirf database ke sawaalon ki speed hai. Bahut saare users ek saath aane par poori website kaisi chalegi, yeh **Not tested** hai.

### Naye tests ki ginti

| Test | Result |
|---|---|
| Server | 279 / 279 pass (pehle 242) |
| AI Assessment module | 525 / 525 pass (pehle 524) |
| Student Onboarding module | 343 / 343 pass |
| Website build | Pass |
| Website lint | Not tested (setting file nahi hai) |

### Ab bhi kya open hai

1. **Passwords/keys badalna** — aapka kaam, sabse zaroori.
2. **Store, vendor, stock request** ka school-deewar test data ke saath nahi hua.
3. **Database ke andar ki majbooti** (DATA-001, 002, 003, 006) — bada design ka kaam, nahi hua.
4. **Browser mein chaaron portal** click karke nahi dekhe gaye.
5. **Asli email, asli payment, live website, zyada load** — test nahi hue.
6. **Terms & Conditions consent** — nahi dekha gaya.

### Section 6 mein do naye kaam

11. **Plan ki keemat** settings mein daalein (upar dekhein).
12. **Server ko "supervisor" ke saath chalayein** (PM2 / systemd / Docker) taaki girne par khud dobara chalu ho. Poori deployment checklist technical document ke section 13 mein hai, backup aur wapas-purana-version (rollback) ke steps ke saath.

### Kya project ab real school ke liye safe hai?

Abhi **nahi** bolunga. Code ki taraf se bade critical darwaze band hain aur test se confirm hain. Lekin jab tak purane passwords/keys badle nahi jaate, demo accounts hataye nahi jaate, aur staging par browser se ek poora chakkar nahi lagta, tab tak ise asli school ke liye live nahi karna chahiye.


---

## 9. Teesra round (12–13 October 2026) — customer ban kar chalaya, load test, backup test

Is round mein maine app ko ek school ke principal ki tarah chalaya, phir ek aur audit kiya, aur pehli baar load aur backup ko naap kar dekha. **Jahan upar ke sections se farq hai, wahan yeh section sahi maana jaye.**

**Abhi ki haalat ek line mein:** Asli school ke liye abhi **taiyaar nahi**. Staging (testing server) par chalane ke liye taiyaar hai. Jo bacha hai woh zyadatar aapke haath ka kaam hai (neeche "Aapke kaam" dekhein).

Kuch bhi commit, push ya deploy nahi hua. Razorpay nahi lagaya gaya, jaisa aapne kaha tha.

### Customer ban kar chalane par jo galtiyan mili (sab fix)

#### Quiz mein sahi jawaab bhi galat aa raha tha

- **Pehle kya problem thi?** Agar quiz ke options number the (jaise 2, 4, 6, 8), to student ka har jawaab galat gina jaata tha.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Bachche ne sahi jawaab likha, phir bhi zero mila.
- **Maine kya change kiya?** Ab jawaab pehle option ke likhe hue text se milaya jaata hai.
- **Kaise check kiya?** Number wale options ka quiz bana kar student se sahi aur galat jawaab bhijwaye.
- **Test ka result:** Pass.
- **Kya abhi bhi karna baaki hai?** Nahi.

#### Course ka naam badalne par baaki jaankari ud jaati thi

- **Pehle kya problem thi?** Sirf title badalne par description, category aur duration khaali ho jaate the. Aur course ko baad mein kisi class ya doosre teacher se jodna mumkin nahi tha, jabki page "updated" bolta tha.
- **Maine kya change kiya?** Jo cheez bheji nahi gayi, woh waisi hi rehti hai. Admin ab course ki class aur teacher badal sakta hai (sirf apne school ke).
- **Kaise check kiya?** Sirf title bhej kar dekha ki baaki cheezein bachi hain; doosre school ki class dene par mana hua.
- **Test ka result:** Pass.
- **Kya abhi bhi karna baaki hai?** Nahi.

#### Baad mein aaye student ko class ke course nahi dikhte the

- **Pehle kya problem thi?** Course banne ke baad jo student class mein aaya, use woh course nahi dikhta tha.
- **Maine kya change kiya?** Student ko ab apni class ke saare course dikhte hain.
- **Test ka result:** Pass.
- **Kya abhi bhi karna baaki hai?** Nahi.

#### Galat marks aur aage ki tareekh ki attendance

- **Pehle kya problem thi?** 100 mein se 150 marks, ya minus marks save ho jaate the. Kal ki attendance aaj lag jaati thi.
- **Maine kya change kiya?** Marks 0 se total ke beech hi chalenge. Aage ki tareekh ki attendance mana hai.
- **Test ka result:** Pass.
- **Kya abhi bhi karna baaki hai?** Nahi.

#### Certificate "ban chuka hai" par file nahi

- **Pehle kya problem thi?** Course poora karne par certificate ka record banta tha par file nahi, aur download mein kuch nahi milta tha.
- **Maine kya change kiya?** Certificate maangne par file ab ban jaati hai.
- **Test ka result:** Pass.
- **Kya abhi bhi karna baaki hai?** Nahi.

### Audit mein jo nayi cheezein mili

#### Super Admin login page par email-password likha tha

- **Pehle kya problem thi?** Login page par "Default Credentials" naam ka dabba tha jisme Super Admin ka email aur password dikhta tha.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Tijori ke darwaze par hi uska code chipka tha.
- **Maine kya change kiya?** Dabba hata diya aur website dobara build ki.
- **Kaise check kiya?** Bani hui website ki files mein woh shabd dhoonde.
- **Test ka result:** Pass (0 jagah mila).
- **Kya abhi bhi karna baaki hai?** **Haan.** Yeh password GitHub ke purane record mein hai, isliye asli database mein Super Admin ka password badalna hoga.

#### Teacher ke daale hue link

- **Pehle kya problem thi?** Teacher material, video ya live class ka jo link daalta, woh bina jaanche save hota tha. Khatarnak link (jo click karte hi browser mein code chala de) bhi chal jaata.
- **Maine kya change kiya?** Ab sirf `http` ya `https` wale aam web link hi save hote hain.
- **Kaise check kiya?** 6 tarah ke khatarnak link 4 jagah daal kar dekhe.
- **Test ka result:** Pass (sab mana hue).
- **Kya abhi bhi karna baaki hai?** Nahi.

#### Naye account ke password

- **Pehle kya problem thi?** Naye admin, teacher, student ka pehla password ek kamzor tareeke se banta tha jiska andaza lagaya ja sakta hai.
- **Maine kya change kiya?** Ab computer ke surakshit random tareeke se 12 akshar ka password banta hai.
- **Test ka result:** Pass.
- **Kya abhi bhi karna baaki hai?** Nahi.

#### Nakli students dikhna

- **Pehle kya problem thi?** Do pages par server se data na aane par "Rahul Sharma", "Priya Verma" jaise banaye hue naam dikhte the.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Register khaali tha to kisi ne khud naam likh diye. Accountant galat data par bharosa kar sakta tha.
- **Maine kya change kiya?** Ab khaali list dikhti hai.
- **Kya abhi bhi karna baaki hai?** Nahi.

#### Stock request ka page

- **Pehle kya problem thi?** Stock request kholne par server error aata tha, kyunki uski tables bani hi nahi thi.
- **Maine kya change kiya?** Tables ab server chalu hote hi ban jaati hain (purana data chhede bina).
- **Kaise check kiya?** Do school ke stock, vendor aur request bana kar dekha ki ek school doosre ka data na dekh sake, na badal sake.
- **Test ka result:** Pass.
- **Kya abhi bhi karna baaki hai?** Vendor invoice wala hissa check nahi hua.

### Load test — kitna bojh utha sakta hai (naapa hua)

Nakli data: 2 school, har ek mein 2,000 student. Sirf "padhne" wale pages (course, attendance, result, notice, class). Yeh mere laptop jaisi machine par hua (4-thread processor, 8 GB RAM), asli server par nahi.

| Ek saath requests | Har second kitni poori hui | Aadhi requests itne mein (ms) | 95% itne mein (ms) | Fail |
| --- | --- | --- | --- | --- |
| 10 | 570 | 15.5 | 27.8 | 0 |
| 50 | 653 | 68.6 | 121.5 | 0 |
| 100 | 683 | 130 | 232 | 0 |
| 200 | 686 | 259 | 464 | 0 |

**Matlab:** Server ek second mein lagbhag 680 requests tak sambhalta hai. Usse zyada bojh par girta nahi, bas jawaab dheere aata hai. **Yeh "itne users chalenge" ka vaada nahi hai** — login, likhne wale kaam, file upload aur AI ko nahi naapa gaya.

### Backup test

- **Kya banaya?** Ek tool jo database ka backup leta hai aur phir us backup ko khol kar jaanchta hai ki woh sahi hai aur usme saari tables aur rows hain.
- **Kaise check kiya?** Test database par, aur aapke local database ki ek copy par (51 tables, 96 rows — sahi nikla). Kharab file dene par tool ne mana kiya.
- **Test ka result:** Pass.
- **Kya abhi bhi karna baaki hai?** **Haan.** Ise roz apne aap chalana, aur backup ko server se bahar rakhna, yeh abhi set nahi hai.

### Tests ki ginti (13 October)

| Test | Result |
| --- | --- |
| Server (security + data + reliability) | 285 mein se 285 pass |
| AI Assessment module | 525 mein se 525 pass |
| Student Onboarding module | 343 mein se 343 pass |
| Website build | Pass |
| Browser mein click karke test | **Nahi hua** (koi aisa test hai hi nahi) |
| Libraries mein kamzori ki jaanch (`npm audit`) | **Nahi hua** (is computer par `npm` nahi hai) |

### Jo fix nahi hua (aapka faisla chahiye)

1. **Terms & Conditions ki manzoori** sirf user ke browser mein save hoti hai, server par koi record nahi. Yaani saboot nahi hai ki kisne kab maana.
2. **Translation** ke liye page ka text browser se Google aur do aur bahari services ko jaata hai, aur fonts Google se aate hain. School ke niyam ke hisaab se iski ijazat leni pad sakti hai.
3. **Website ki ek hi badi file** (2.9 MB) hai, dheeme internet par pehli baar kholne mein der lagegi.
4. **Demo accounts** (admin, accountant, storekeeper) pehle school (id 1) se jude hote hain.

### Aapke kaam (kram se)

1. **Support email ka password badlein** aur **purani Razorpay keys band karein** (yeh Razorpay "lagana" nahi hai, sirf leak hui keys ko bekaar karna hai).
2. **Asli database mein demo accounts hatayein** ya unke password badlein, Super Admin ka bhi.
3. **Node.js theek se install karein** (abhi yeh ek doosre tool ke andar se chal raha hai aur uska raasta badalta rehta hai), phir `npm audit` chalayein.
4. **Staging par browser se chaaron portal** ek baar poore chala kar dekhein, ek asli password-reset email ke saath.
5. **Server kahan chalega** yeh tay karein, backup roz ka set karein, aur `/health/ready` par nazar rakhne wala check lagayein.
6. **Branch push karein** jab aap chahein, tabhi GitHub par automatic tests chalte dikhenge. Maine kuch push nahi kiya.

### Kya project ab real school ke liye safe hai?

Abhi bhi **nahi**. Code mein jo bade khatre mile the woh band hain aur test se pakke hain, aur ab bojh aur backup ke asli aankde bhi hain. Lekin upar ke kaam 1, 2 aur 4 hue bina ise asli school ke bachchon ke data ke saath live nahi karna chahiye.


---

## 10. Chautha round (13 October 2026) — asli browser mein chaaron portal chala kar dekha

Is round mein pehli baar app ko **asli Chrome browser** mein chalaya — mouse hila, click hua, type hua — jaise koi insaan chalata hai. Saath mein pehli baar libraries (dependencies) ki kamzori ki jaanch hui. **Jahan upar ke sections se farq hai, wahan yeh section sahi maana jaye.**

**Abhi ki haalat ek line mein:** Code ab **staging par jaanchne ke liye taiyaar** hai (READY FOR STAGING VALIDATION). Asli school ke liye abhi bhi **nahi** — wajah neeche "Asli school ke liye abhi kyun nahi" mein.

Kuch bhi commit, push ya deploy nahi hua. Razorpay nahi lagaya. Aapka asli database chhua nahi gaya (saara test ek alag, kachche database par hua).

**Ek zaroori baat:** Aap chahti thi ki test aapke signed-in Chrome mein ho. Woh nahi ho paya, kyunki Claude ka Chrome connector is session se juda nahi. Isliye ek **alag Chrome window** mein kiya, jisme cursor chalta dikhta hai.

### Sabse badi seekh

Pichhle rounds mein 1,153 tests pass the, phir bhi browser mein kai zaroori kaam **ho hi nahi rahe the**. Wajah: tests server se seedha baat karte the, par website ke pages galat pate par ya galat tareeke se request bhej rahe the. Yeh sirf browser chalane se pakda gaya.

### Bade bugs jo mile aur fix hue

#### Ek school fees badle to sab schools ki fees badal jaati thi (sabse gambhir)

- **Pehle kya problem thi?** Jab koi school apna fee structure save karta, to **har school** ke usi class ke bachchon ki fees badal jaati thi.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Ek school ne apni fees ka board badla, aur shehar ke saare schools ke board badal gaye.
- **Maine kya change kiya?** Ab sirf usi school ke bachchon ki fees badalti hai.
- **Kaise check kiya?** Do school banaye, ek ki fees badli, doosre ke bachche ki fees dekhi.
- **Test ka result:** Pass. Doosre school ki fees waisi ki waisi rahi.
- **Kya abhi bhi karna baaki hai?** Nahi.

#### Admin course bana hi nahi sakta tha

- **Pehle kya problem thi?** "Create Course" page par teacher ki list khaali aati thi, teacher/student chune nahi ja sakte the, aur save par "title required" aata tha. Teen alag galtiyan ek hi page par.
- **Maine kya change kiya?** Teeno theek ki.
- **Kaise check kiya?** Browser mein admin se course banaya, teacher aur do students ke saath.
- **Test ka result:** Pass.
- **Kya abhi bhi karna baaki hai?** Nahi.

#### Teacher attendance nahi laga sakta tha

- **Pehle kya problem thi?** Attendance page class ki list maangta tha aur server "nahi mila" (404) bolta tha.
- **Maine kya change kiya?** Server par woh raasta jod diya.
- **Kaise check kiya?** Browser mein teacher se attendance lagayi, do baar save ki, page dobara khola.
- **Test ka result:** Pass. Ek bachche ki ek hi entry rahi.
- **Kya abhi bhi karna baaki hai?** Nahi.

#### Student ka "Pay Fees" page nakli "payment ho gaya" dikha sakta tha

- **Pehle kya problem thi?** Button dabane par page toot jaata tha. Aur code aisa tha ki gadbad hone par bhi "Simulated payment recorded successfully" dikha deta. (Server ne aisi payment kabhi gini nahi thi, par bachche ko screen par "ho gaya" dikhta.)
- **Aam insaan ko iska matlab kya samajhna chahiye?** Dukaan ki machine bina paisa liye "payment successful" ki parchi nikal de.
- **Maine kya change kiya?** Ab page server se order maangta hai, aur "payment mil gaya" tabhi dikhata hai jab server confirm kare. Nakli raasta hata diya. Abhi Razorpay nahi laga hai to saaf likha aata hai: "Online payment abhi uplabdh nahi, school office mein jama karein."
- **Kaise check kiya?** Browser mein student se Pay dabaya.
- **Test ka result:** Pass. Message aaya, koi payment record nahi hui.
- **Kya abhi bhi karna baaki hai?** **Haan.** Jab Razorpay lagega tab asli test-payment ek baar karni hogi.

#### Super Admin apne login page se login nahi kar sakta tha

- **Pehle kya problem thi?** `/superadmin/login` page galat pate par request bhejta tha.
- **Maine kya change kiya?** Pata theek kiya. (Aapke kehne par baaki test `/login` page se hi kiye.)
- **Test ka result:** Pass.
- **Kya abhi bhi karna baaki hai?** Ek shak baaki hai: galat password ke baad page kabhi-kabhi `/login` par chala jaata hai. Wajah nahi mili.

#### Libraries mein kamzoriyan (pehli baar jaanch)

- **Pehle kya problem thi?** Server mein 2 "critical" aur 27 "high" kamzoriyan thi, website mein 1 critical aur 21 high.
- **Aam insaan ko iska matlab kya samajhna chahiye?** Ghar mazboot tha, par kuch taale purane model ke the jinki chaabi bazaar mein milti hai.
- **Maine kya change kiya?** Libraries naye surakshit version par le aaya.
- **Kaise check kiya?** `npm audit` dobara chalaya, phir saare tests aur browser test dobara.
- **Test ka result:** Pass. Jo cheez asli server/website par chalti hai usme ab **0 critical, 0 high**.
- **Kya abhi bhi karna baaki hai?** Sirf developer ke tools mein kuch bachi hain (woh website ke saath nahi jaate).

### Chhote-bade aur bugs jo fix hue

- Galat email ("not-an-email") se bhi teacher ban jaata tha — ab mana.
- Quiz ki khatam hone ki tareekh shuru se pehle ho sakti thi — ab mana.
- Bina publish hua quiz student ko dikhta tha — ab nahi.
- Student ko poore school ke saare course dikh sakte the — ab sirf apne.
- Student ko classmates ke email mil jaate the — ab sirf naam.
- Teacher ki upload ki file student ko dikhti hi nahi thi — ab "View PDF" aata hai.
- Certificate download nahi hota tha — ab hota hai.
- Export ke buttons login-token ko address mein daal rahe the (aur chalte bhi nahi the) — theek kiya.
- Announcements page khaali aata tha — ab notice dikhte hain.
- Login khatam hone par page khaali pada rehta tha — ab login page par le jaata hai.
- Website ke code mein 381 jagah debug likhaai thi (user ki jaankari bhi) — live build se hata di.
- Plan "upgrade" button ek hataye hue raaste ko bula raha tha — theek kiya.
- Server ko aaraam se band karna (graceful shutdown) ab test se pakka hai.

### Browser test ka result (chaaron portal)

Poora flow ab ek script hai jo kabhi bhi dobara chal sakti hai. Final code par, naye database par: **28 mein se 28 pass**.

| Portal | Kya kiya | Result |
| --- | --- | --- |
| Super Admin | Login, do school banaye, galat email mana, logout | 5 / 5 |
| Admin | Teacher, class, 2 student, course, fees, notice | 8 / 8 |
| Teacher | Chapter + file, quiz banaya aur publish, attendance, result | 6 / 6 |
| Student | Course, file kholi, quiz diya (2/2), result, attendance, fees | 7 / 7 |
| Doosra school | Pehle school ka kuch nahi dikha, kuch nahi badal paaya | 1 / 1 |
| Poora run | Server ne ek bhi baar "error 500" nahi diya | 1 / 1 |

Browser mein **nahi** hua: password reset (asli email chahiye), asli payment, AI tests wale pages, Accountant/Storekeeper/Vendor portal, mobile par dikhna.

### Tests ki ginti (final)

| Test | Result |
| --- | --- |
| Server | 298 mein se 298 pass |
| AI Assessment module | 525 mein se 525 pass |
| Student Onboarding module | 343 mein se 343 pass |
| Browser (chaaron portal) | 28 mein se 28 pass |
| Website build | Pass |
| Libraries ki jaanch | Asli code mein 0 critical, 0 high |

### Load test (dobara naapa)

Wahi laptop, wahi nakli data (2 school × 2,000 student), sirf padhne wale pages.

- 50 ek saath requests par: lagbhag 545–575 requests har second, 0 fail.
- 2 minute lagataar: 68,820 requests, 0 fail. Server ki memory lagbhag 390 MB par tham gayi (badhti nahi gayi).
- Kal se lagbhag 15% kam aaya. Aaj laptop par doosre programs bhi chal rahe the aur libraries bhi badli hain — kaun si wajah hai, yeh alag nahi kiya gaya.

**Yeh ab bhi "itne users chalenge" ka vaada nahi hai.**

### Jo fix nahi hua (aapka faisla ya aapka kaam)

1. **Terms & Conditions** ke text mein abhi bhi khaali jagah hai: "[YOUR COMPANY NAME]", "[Registered Address]", aur naam "EduMentor LMS" likha hai.
2. **Home page par daave**: "Trusted by Harvard, MIT, Stanford, Oxford…", "50+ Universities", "99.9% uptime". Yeh sach nahi hain to hatane honge.
3. **Naye account ka password** admin ko screen par dikhta hai; pehli baar login par badalne ki zabardasti nahi hai.
4. **Admin ke menu mein "Database Export"** hai jo hamesha "mana" bolta hai (yeh sirf Super Admin ke liye hai).
5. **Subscription page** par keemat "₹1/year" likhi hai, aur Free plan "1 school" bolta hai jabki 3 ban gaye.
6. **Foreign keys** (database ka apna taala) abhi ON nahi ho sakta — fees ki table galat table se judi hai. Ise theek karne ke liye asli data ke saath soch-samajh kar kaam karna hoga.
7. **Fonts aur course ki tasveerein** project mein hain hi nahi (isliye default font dikhta hai).
8. **Website ki ek hi badi file** (2.98 MB).

### Asli school ke liye abhi kyun nahi

1. GitHub par jo **password/keys** the, woh abhi badle nahi gaye.
2. **Demo accounts** ka password sabko pata hai.
3. Yeh sab abhi sirf **ek laptop** par chala hai. Asli server, asli email, GitHub ke automatic tests, backup ka schedule, nigrani — kuch bhi abhi chala nahi.
4. Database ka **foreign-key taala** band hai.
5. **Terms** adhoore hain aur home page ke **daave** galat hain.

### Aapke kaam (kram se)

1. Support email ka password badlein; purani Razorpay keys band karein.
2. Har asli database se demo accounts hatayein ya password badlein.
3. Computer par **Node.js 24** theek se install karein.
4. Batayein ki server **kahan** chalega. Phir `docs/DEPLOYMENT_RUNBOOK.md` ke hisaab se staging banayein.
5. Staging par: ek asli password-reset email, aur browser test dobara (`npm run e2e:stack` aur `npm run e2e:browser`).
6. Jab chahein tab branch push karein, taaki GitHub ke automatic tests chal sakein.
7. Terms ka text, home page ke daave, aur keematein tay karein.

### Kya project ab real school ke liye safe hai?

Abhi bhi **nahi**. Lekin ab pehli baar yeh kaha ja sakta hai ki chaaron portal ka mukhya kaam browser mein shuru se aakhir tak chalta hai, aur yeh ek script se kabhi bhi dobara jaancha ja sakta hai. Agla sahi kadam staging hai.


---

## 11. Naya feature (14 October 2026) — course poori class ko, teacher ke do view

### Kya bana

- **Admin ek course poori class (ya kai classes) ko de sakta hai.** Us class ke saare students apne aap course mein jud jaate hain. Jo student baad mein class mein aaye, woh bhi apne aap judta hai. Ek hi student do baar nahi judta.
- Admin ke paas ab **"Courses" page** hai: har course, uska teacher, kaun si classes, kitne students. Wahin se "Assign to classes" aur class hatana.
- Course banate waqt hi classes chuni ja sakti hain.
- Class hatane par sirf wahi students hat-te hain jo us class ki wajah se jude the. Jinhe akele (individually) joda tha, woh rehte hain.
- **Teacher ka "My Students" page**, do tarah se:
  - **By class:** class chuno → apna course chuno → us class ke woh students jo is course mein hain.
  - **By course:** apna course chuno → har class ke students, class ke naam aur ginti ke saath (jaise "5-A — 2 students"); class filter aur search.
- Teacher sirf apne courses dekh sakta hai; class assign karna sirf admin ka kaam.

### Aapse kya poochha tha

Pehle ek course sirf ek class ka hota tha. Aapne "linking table" wala tareeka chuna: nayi table, purana data aur purane features waise hi.

### 3 chhote sudhaar jo maine chune

1. Admin ke liye Courses ki list (pehle course banne ke baad dikhta hi nahi tha).
2. Admin menu se "Database Export" hataya (woh hamesha "mana" bolta tha).
3. Student ke attendance page par "Classroom 1" ki jagah class ka naam.

Browser test se ek aur purani kami mili aur theek ki: teacher ke Attendance page par class badalne ka option nahi tha.

### Test

| Test | Result |
|---|---|
| Server | 313 / 313 pass (15 naye) |
| AI Assessment | 525 / 525 |
| Student Onboarding | 343 / 343 |
| Browser (chaaron portal + naye views) | 33 / 33 |
| Website build | Pass |

### Jo abhi nahi kiya

- Student ki class badalne par purani class ke courses se woh nahi hat-ta (pehle jaisa).
- AI test module abhi course ki "home" class hi dekhta hai.
- Admin form se bane students ka "Roll no." asal mein section ka akshar ("A") hai — purani gadbad, abhi chhuyi nahi.

---

## 12. Class pehle, explicit enrollment, teacher ko sirf apni classes, AI test course ke saath (15 October 2026)

- **Ab course sirf usi student ka hai jo usme enroll hai.** Sirf class mein hone se course nahi milta. Aapne yahi tareeka chuna tha.
- **Class assign karte waqt chunav:** "All students" (poori class, aur baad mein aane wale bhi) ya "Selected students" (sirf tick kiye hue). Duplicate nahi banta; jo student pehle se akele joda gaya tha, woh waisa hi rehta hai.
- **Class pehle:** admin bina class ke course nahi bana sakta; school mein ek bhi class na ho to fee structure save nahi hota.
- **Teacher ko class tabhi dikhti hai** jab woh uska class teacher ho, ya us class ko assign kisi course ka mentor ho. Course sirf woh jinka woh mentor hai. Yeh server par lagu hai, sirf screen par nahi.
- **Kavita:** woh 5-B ki class teacher hai aur English (jo 5-A, 5-B, 9-A teeno ko assign hai) ki mentor — isliye teeno classes niyam se sahi hain. Galti sirf label ki thi: har class par "Class teacher" likha aata tha. Ab sahi likha aata hai.
- **AI test:** class aur us class ka apna course chunna zaroori. Test sirf un students ko dikhta hai jo us class mein hain **aur** us course mein enroll hain. Purane AI tests "Legacy (no course)" dikhte hain; unka course andaze se nahi joda gaya.
- **Ek-baar ki migration:** start par purane "class ke member" students ko enrollment mein jod diya (pehle backup). Aapke local database mein 1 student juda.

Test: server 326/326, AI Assessment 532/532, Onboarding 343/343, browser 38/38, build pass.
