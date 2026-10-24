import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const localesDir = path.resolve(__dirname, '../public/locales');

// Load existing dictionaries
const namespaces = ['common', 'navigation', 'dashboard', 'forms', 'notifications', 'tours', 'chatbot'];
const currentEn = {};
const currentHi = {};

for (const ns of namespaces) {
  currentEn[ns] = JSON.parse(fs.readFileSync(path.join(localesDir, 'en-IN', `${ns}.json`), 'utf8'));
  currentHi[ns] = JSON.parse(fs.readFileSync(path.join(localesDir, 'hi-IN', `${ns}.json`), 'utf8'));
}

const legacyEn = JSON.parse(fs.readFileSync(path.join(__dirname, 'legacy_en_keys.json'), 'utf8'));

// High quality Hindi translation mappings for LMS domain
const translationsHi = {
  // Navigation & Role keys
  'nav_fee_status': 'शुल्क निगरानी और अनुस्मारक',
  'fee_collection': 'शुल्क संग्रह',
  'vendor_invoices': 'विक्रेता चालान',
  'expenses': 'खर्च',
  'database_export': 'रिपोर्ट और विश्लेषण',
  'reports_and_analysis': 'रिपोर्ट और विश्लेषण',
  'nav_my_tests': 'मेरे टेस्ट',
  'nav_my_progress': 'मेरी प्रगति',
  'nav_certificates': 'प्रमाणपत्र',
  'nav_subscription': 'सदस्यता',
  'overall_progress': 'कुल प्रगति',
  'joined_live_class': 'लाइव क्लास में सफलतापूर्वक शामिल हुए',
  'failed_join_live_class': 'लाइव क्लास में शामिल होने में विफल',
  'login_title': 'Core5 अकादमी',
  'logging_in': 'लॉग इन हो रहा है...',
  'demo_accounts': 'त्वरित लॉगिन - डेमो खाते:',
  'admin_role': 'एडमिन',
  'mentor_role': 'मार्गदर्शक',
  'student_role': 'छात्र',
  'teacher_role': 'शिक्षक',
  'accountant_role': 'लेखाकार',
  'storekeeper_role': 'स्टोरकीपर',
  'vendor_role': 'विक्रेता',
  'superadmin_role': 'सुपर एडमिन',
  'click_to_login': 'लॉगिन करने के लिए क्लिक करें',
  'signup_prompt': 'क्या आपके पास खाता नहीं है?',
  'signup_link': 'साइन अप करें',
  'login_successful': 'लॉगिन सफल! पुनर्निर्देशित किया जा रहा है...',
  'login_failed': 'लॉगिन विफल। कृपया पुनः प्रयास करें।',
  'language_changed': 'भाषा बदलकर कर दी गई है:',
  'my_courses': 'मेरे पाठ्यक्रम',
  'courses_enrolled': 'आपने {count} पाठ्यक्रम में नामांकन किया है',
  'no_courses_yet': 'अभी कोई पाठ्यक्रम नहीं है',
  'overview': 'अवलोकन',
  'total': 'कुल',
  'completed': 'पूर्ण हुआ',
  'in_progress': 'प्रगति पर',
  'avg_progress': 'औसत प्रगति',
  'search_courses': 'पाठ्यक्रम खोजें...',
  'all': 'सभी',
  'no_courses_assigned': 'कोई पाठ्यक्रम आवंटित नहीं किया गया',
  'no_matching_courses': 'कोई मेल खाता पाठ्यक्रम नहीं मिला',
  'mentor_will_assign': 'आपके मार्गदर्शक जल्द ही आपको पाठ्यक्रम आवंटित करेंगे',
  'try_different_search': 'विभिन्न खोज शब्दों या फ़िल्टर का प्रयास करें',
  'loading_courses': 'पाठ्यक्रम लोड हो रहे हैं...',
  'start_learning': 'सीखना शुरू करें',
  'continue_learning': 'सीखना जारी रखें',
  'view_course': 'पाठ्यक्रम देखें',
  'completed_chapters': 'पूर्ण अध्याय',
  'total_chapters': 'कुल अध्याय',
  'last_activity': 'अंतिम गतिविधि',
  'not_started': 'प्रारंभ नहीं हुआ',
  'today': 'आज',
  'yesterday': 'कल',
  'days_ago': '{days} दिन पहले',
  'back_to_dashboard': 'डैशबोर्ड पर वापस जाएं',
  'progress': 'प्रगति',
  'chapters': 'अध्याय',
  'assessments': 'मूल्यांकन',
  'view_certificate': 'प्रमाणपत्र देखें',
  'continue': 'जारी रखें',
  'learning_summary': 'सीखने का सारांश',
  'total_courses': 'कुल पाठ्यक्रम',
  'dashboard': 'डैशबोर्ड',
  'welcome_back': 'वापसी पर स्वागत है',
  'recent_activity': 'हाल की गतिविधि',
  'quick_actions': 'त्वरित कार्य',
  'view_all_courses': 'सभी पाठ्यक्रम देखें',
  'profile': 'प्रोफ़ाइल',
  'settings': 'सेटिंग्स',
  'logout': 'लॉगआउट',
  'timetable': 'समय सारणी',
  'attendance': 'उपस्थिति',
  'pay_fees': 'शुल्क भुगतान करें',
  'results': 'परिणाम',
  'announcements': 'सूचनाएं',
  'admin_dashboard_title': 'एडमिन डैशबोर्ड',
  'welcome_control_panel': 'आपके नियंत्रण कक्ष में आपका स्वागत है',
  'create_course': 'पाठ्यक्रम बनाएं',
  'announcement_button': '+ सूचना',
  'refresh': 'रीफ़्रेश',
  'total_students': 'कुल छात्र',
  'total_mentors': 'कुल मार्गदर्शक',
  'certificates': 'प्रमाणपत्र',
  'manage_users': 'उपयोगकर्ता प्रबंधित करें',
  'mentor_approvals': 'मार्गदर्शक अनुमोदन',
  'view_analytics': 'विश्लेषण देखें',
  'published_courses': 'प्रकाशित पाठ्यक्रम',
  'pending_mentors': 'लंबित मार्गदर्शक',
  'new_users': 'नए उपयोगकर्ता',
  'mentoring_overview': 'आपका मार्गदर्शन अवलोकन',
  'inspire_teach_lead': 'प्रेरित करें। सिखाएं। नेतृत्व करें।',
  'manage_courses_hero': 'पाठ्यक्रम प्रबंधित करें, छात्रों को ट्रैक करें, और वास्तविक प्रभाव पैदा करें।',
  'active_courses': 'सक्रिय पाठ्यक्रम',
  'your_courses': 'आपके पाठ्यक्रम',
  'announcement': 'सूचना',
  'view': 'देखें',
  'add_chapter': 'अध्याय जोड़ें',
  'assign': 'असाइन करें',
  'assessment': 'मूल्यांकन',
  'search': 'खोजें',
  'admin_dashboard': 'एडमिन डैशबोर्ड',
  'total_certificates': 'कुल प्रमाणपत्र',
  'refresh_stats': 'आँकड़े रीफ़्रेश करें',
  'add_mentor': 'मार्गदर्शक जोड़ें',
  'view_all_students': 'सभी छात्र देखें',
  'view_all_mentors': 'सभी मार्गदर्शक देखें',
  'students': 'छात्र',
  'mentors': 'मार्गदर्शक',
  'teachers': 'शिक्षक',
  'courses': 'पाठ्यक्रम',
  'users': 'उपयोगकर्ता',
  'pending': 'लंबित',
  'published': 'प्रकाशित',
  'mentor_dashboard': 'मार्गदर्शक डैशबोर्ड',
  'my_classrooms': 'मेरी कक्षाएं',
  'create_course_mentor': 'पाठ्यक्रम बनाएं',
  'manage_students': 'छात्र प्रबंधित करें',
  'view_progress': 'प्रगति देखें',
  'student_dashboard': 'छात्र डैशबोर्ड',
  'my_progress': 'मेरी प्रगति',
  'enrolled_courses': 'नामांकित पाठ्यक्रम',
  'view_certificates': 'प्रमाणपत्र देखें',
  'assignments': 'असाइनमेंट',
  'exams': 'परीक्षाएं',
  'grades': 'ग्रेड',
  'analytics': 'विश्लेषण',
  'fee_structure': 'शुल्क संरचना',
  'calendar': 'कैलेंडर',
  'add_student': 'छात्र जोड़ें',
  'add_teacher': 'शिक्षक जोड़ें',
  'classrooms': 'कक्षाएं',
  'user_list': 'उपयोगकर्ता सूची',
  'my_classroom': 'मेरी कक्षा',
  'class_teacher': 'कक्षा शिक्षक',
  'not_assigned': 'आवंटित नहीं',
  'courses_in_classroom': 'इस कक्षा में पाठ्यक्रम',
  'no_description_available': 'कोई विवरण उपलब्ध नहीं है',
  'instructor': 'प्रशिक्षक',
  'click_to_access_materials': 'सामग्री, मूल्यांकन और अन्य तक पहुँचने के लिए क्लिक करें',
  'attendance_summary': 'उपस्थिति सारांश',
  'present': 'उपस्थित',
  'absent': 'अनुपस्थित',
  'last_5_records': 'पिछले 5 रिकॉर्ड',
  'no_attendance_records': 'अभी तक कोई उपस्थिति रिकॉर्ड नहीं',
  'results_overview': 'परिणाम अवलोकन',
  'examination': 'परीक्षा',
  'pass': 'उत्तीर्ण',
  'fail': 'अनुत्तीर्ण',
  'subject_wise_marks': 'विषय-वार अंक',
  'fee_breakdown': 'शुल्क विवरण',
  'due_date': 'देय तिथि',
  'total_fee_amount': 'कुल शुल्क राशि',
  'save_primary_structure': 'प्राथमिक संरचना सहेजें',
  'create_secondary_fee_structure': 'माध्यमिक शुल्क संरचना बनाएं',
  'grades_5_12': 'कक्षा 5-12',
  'save_secondary_structure': 'माध्यमिक संरचना सहेजें',
  'edit_fee_structure': 'संपादित करें',
  'updating': 'अपडेट हो रहा है...',
  'update_structure': 'संरचना अपडेट करें',
  'could_not_load_mentors': 'मार्गदर्शक लोड नहीं हो सके',
  'failed_to_load_mentors': 'मार्गदर्शक लोड करने में विफल',
  'approval_failed': 'अनुमोदन विफल',
  'mentor_approved_successfully': 'मार्गदर्शक सफलतापूर्वक स्वीकृत हुआ',
  'could_not_approve_mentor': 'मार्गदर्शक को स्वीकृत नहीं किया जा सका',
  'confirm_remove_mentor': 'क्या मार्गदर्शक {name} को हटाना चाहते हैं?',
  'delete_failed': 'हटाना विफल',
  'mentor_removed_successfully': 'मार्गदर्शक सफलतापूर्वक हटा दिया गया',
  'could_not_remove_mentor': 'मार्गदर्शक को हटाया नहीं जा सका',
  'registration_failed': 'पंजीकरण विफल',
  'mentor_added_successfully': 'मार्गदर्शक सफलतापूर्वक जोड़ा गया',
  'could_not_add_mentor': 'मार्गदर्शक को जोड़ा नहीं जा सका',
  'loading_mentors': 'मार्गदर्शक लोड हो रहे हैं...',
  'mentor_approval_title': 'मार्गदर्शक अनुमोदन',
  'manage_mentor_applications': 'मार्गदर्शक आवेदनों का प्रबंधन करें',
  'no_mentors_found': 'कोई मार्गदर्शक नहीं मिला',
  'add_your_first_mentor': 'अपना पहला मार्गदर्शक जोड़ें',
  'mentor': 'मार्गदर्शक',
  'status': 'स्थिति',
  'actions': 'कार्रवाइयां',
  'approve': 'स्वीकृत करें',
  'reject': 'अस्वीकार करें',
  'remove': 'हटाएं',
  'add_new_mentor': 'नया मार्गदर्शक जोड़ें',
  'name': 'नाम',
  'loading_users': 'उपयोगकर्ता लोड हो रहे हैं...',
  'user_management': 'उपयोगकर्ता प्रबंधन',
  'manage_all_user_accounts': 'सभी उपयोगकर्ता खातों का प्रबंधन करें',
  'admins': 'एडमिन',
  'search_name_or_email': 'नाम या ईमेल खोजें...',
  'role': 'भूमिका',
  'all_roles': 'सभी भूमिकाएं',
  'clear_filters': 'फ़िल्टर साफ़ करें',
  'email_address': 'ईमेल पता',
  'id_colon': 'आईडी:',
  'n_a': 'लागू नहीं',
  'roll_no_colon': 'रोल नंबर:',
  'confirm_delete_user': 'क्या उपयोगकर्ता {name} को हटाना चाहते हैं? इसे पूर्ववत नहीं किया जा सकता।',
  'user_deleted_successfully': 'उपयोगकर्ता सफलतापूर्वक हटा दिया गया',
  'failed_to_delete_user': 'उपयोगकर्ता को हटाने में विफल',
  'no_users_found': 'कोई उपयोगकर्ता नहीं मिला',
  'try_adjusting_filters': 'अपनी खोज या फ़िल्टर समायोजित करने का प्रयास करें',
  'admin': 'एडमिन',
  'showing_users': '{total} में से {count} उपयोगकर्ता दिखाए जा रहे हैं',
  'add_new_user': 'नया उपयोगकर्ता जोड़ें',
  'active': 'सक्रिय',
  'inactive': 'निष्क्रिय',
  'parent_name': 'अभिभावक का नाम',
  'parent_contact': 'अभिभावक का संपर्क',
  'admission_date': 'प्रवेश तिथि',
  'joining_date': 'शामिल होने की तिथि',
  'date_joined': 'शामिल होने की तिथि',
  'registration_number': 'पंजीकरण संख्या',
  'employee_id': 'कर्मचारी आईडी',
  'student_id': 'छात्र आईडी',
  'teacher_id': 'शिक्षक आईडी',
  'mentor_id': 'मार्गदर्शक आईडी',
  'class': 'कक्षा',
  'classes': 'कक्षाएं',
  'class_name': 'कक्षा का नाम',
  'class_section': 'कक्षा अनुभाग',
  'shift': 'शिफ्ट',
  'medium': 'माध्यम',
  'stream': 'संकाय',
  'board': 'बोर्ड',
  'school': 'स्कूल',
  'university': 'विश्वविद्यालय',
  'institution': 'संस्थान',
  'organization': 'संगठन',
  'company': 'कंपनी',
  'industry': 'उद्योग',
  'create_user': 'उपयोगकर्ता बनाएं',
  'create_teacher': 'शिक्षक बनाएं',
  'create_student': 'छात्र बनाएं',
  'create_mentor': 'मार्गदर्शक बनाएं',
  'create_admin': 'एडमिन बनाएं',
  'create_classroom': 'कक्षा बनाएं',
  'create_announcement': 'सूचना बनाएं',
  'create_assessment': 'मूल्यांकन बनाएं',
  'create_university': 'विश्वविद्यालय बनाएं',
  'edit_user': 'उपयोगकर्ता संपादित करें',
  'edit_teacher': 'शिक्षक संपादित करें',
  'edit_student': 'छात्र संपादित करें',
  'edit_course': 'पाठ्यक्रम संपादित करें',
  'edit_classroom': 'कक्षा संपादित करें',
  'edit_announcement': 'सूचना संपादित करें',
  'edit_assessment': 'मूल्यांकन संपादित करें',
  'delete_user': 'उपयोगकर्ता हटाएं',
  'delete_teacher': 'शिक्षक हटाएं',
  'delete_student': 'छात्र हटाएं',
  'delete_course': 'पाठ्यक्रम हटाएं',
  'delete_classroom': 'कक्षा हटाएं',
  'delete_announcement': 'सूचना हटाएं',
  'delete_assessment': 'मूल्यांकन हटाएं',
  'user_created': 'उपयोगकर्ता सफलतापूर्वक बनाया गया!',
  'teacher_created': 'शिक्षक सफलतापूर्वक बनाया गया!',
  'student_created': 'छात्र सफलतापूर्वक बनाया गया!',
  'mentor_created': 'मार्गदर्शक सफलतापूर्वक बनाया गया!',
  'course_created': 'पाठ्यक्रम सफलतापूर्वक बनाया गया!',
  'classroom_created': 'कक्षा सफलतापूर्वक बनाई गई!',
  'announcement_created': 'सूचना सफलतापूर्वक बनाई गई!',
  'assessment_created': 'मूल्यांकन सफलतापूर्वक बनाया गया!',
  'user_updated': 'उपयोगकर्ता सफलतापूर्वक अपडेट किया गया!',
  'teacher_updated': 'शिक्षक सफलतापूर्वक अपडेट किया गया!',
  'student_updated': 'छात्र सफलतापूर्वक अपडेट किया गया!',
  'mentor_updated': 'मार्गदर्शक सफलतापूर्वक अपडेट किया गया!',
  'course_updated': 'पाठ्यक्रम सफलतापूर्वक अपडेट किया गया!',
  'classroom_updated': 'कक्षा सफलतापूर्वक अपडेट की गई!',
  'announcement_updated': 'सूचना सफलतापूर्वक अपडेट की गई!',
  'assessment_updated': 'मूल्यांकन सफलतापूर्वक अपडेट किया गया!',
  
  // Accountant and Financial
  'track_all_school_expenses': 'सभी स्कूल खर्चों और बिलों को ट्रैक करें',
  'total_expenses': 'कुल खर्च',
  'paid': 'भुगतान किया गया',
  'category': 'श्रेणी',
  'description': 'विवरण',
  'add_new_expense': 'नया खर्च जोड़ें',
  'offline_fee_collection': 'ऑफ़लाइन शुल्क संग्रह',
  'collect_fees': 'शुल्क संग्रह करें',
  'fee_receipt': 'शुल्क रसीद',
  'transaction_id': 'लेनदेन आईडी',
  'payment_mode': 'भुगतान का प्रकार',
  'cash': 'नकद',
  'cheque': 'चेक',
  'online': 'ऑनलाइन',
  'bank_transfer': 'बैंक ट्रांसफर',
  'amount_paid': 'भुगतान की गई राशि',
  'balance_due': 'बकाया राशि',
  'payment_date': 'भुगतान तिथि',
  'generate_receipt': 'रसीद जनरेट करें',
  'download_receipt': 'रसीद डाउनलोड करें',
  'download_invoice': 'चालान डाउनलोड करें',
  'reconciliation': 'समाधान एवं मिलान',
  'legacy_reconciliation': 'पूर्व शुल्क समाधान',
  'daily_collection': 'दैनिक संग्रह',
  'monthly_collection': 'मासिक संग्रह',
  'payment_history': 'भुगतान इतिहास',
  'fees_collected_today': 'आज एकत्र किया गया शुल्क',
  'unallocated_payments': 'अनावंटित भुगतान',
  'verify_payment': 'भुगतान सत्यापित करें',
  'fee_reminder': 'शुल्क अनुस्मारक',
  'send_reminder': 'अनुस्मारक भेजें',
  'reminder_sent_successfully': 'अनुस्मारक सफलतापूर्वक भेजा गया',
  
  // Storekeeper & Inventory
  'inventory': 'इन्वेंटरी',
  'vendors': 'विक्रेता',
  'vendor_stock': 'विक्रेता स्टॉक',
  'requirements': 'आवश्यकताएं',
  'reports': 'रिपोर्ट',
  'stock_stats': 'स्टॉक आंकड़े',
  'low_inventory_alert': 'कम इन्वेंटरी चेतावनी',
  'current_stock': 'वर्तमान स्टॉक',
  'minimum_threshold': 'न्यूनतम सीमा',
  'reorder_level': 'पुनः ऑर्डर स्तर',
  'add_inventory_item': 'इन्वेंटरी आइटम जोड़ें',
  'item_name': 'आइटम का नाम',
  'item_code': 'आइटम कोड',
  'quantity': 'मात्रा',
  'unit_price': 'इकाई मूल्य',
  'supplier': 'आपूर्तिकर्ता',
  'stock_in': 'स्टॉक इन',
  'stock_out': 'स्टॉक आउट',
  
  // Vendor portal
  'vendor_dashboard': 'विक्रेता डैशबोर्ड',
  'purchase_orders': 'खरीद आदेश',
  'order_number': 'ऑर्डर संख्या',
  'order_date': 'ऑर्डर तिथि',
  'delivery_date': 'वितरण तिथि',
  'order_status': 'ऑर्डर स्थिति',
  'submit_invoice': 'चालान सबमिट करें',
  'invoice_number': 'चालान संख्या',
  'invoices': 'चालान',
  'payments': 'भुगतान',
  'received_payments': 'प्राप्त भुगतान',
  'bank_reference': 'बैंक संदर्भ',
  
  // Missing 23 keys in code
  'footer_description': 'स्मार्ट शिक्षण और संस्थान प्रबंधन के साथ शैक्षिक उत्कृष्टता को सशक्त बनाना।',
  'quick_links': 'त्वरित लिंक',
  'legal': 'कानूनी',
  'privacy_policy': 'गोपनीयता नीति',
  'refund_policy': 'रिफंड नीति',
  'all_rights_reserved': 'सर्वाधिकार सुरक्षित।',
  'developed_by': 'उत्कृष्टता के साथ विकसित',
  'applicable_structure': 'लागू शुल्क संरचना',
  'choose_payment_plan': 'भुगतान योजना चुनें',
  'full_payment_single': 'पूर्ण भुगतान (एकल किस्त)',
  'edumentor_lms': 'Core5 एलएमएस',
  'professional_information': 'व्यावसायिक जानकारी',
  'failed_to_delete_classroom': 'कक्षा हटाने में विफल',
  'grade_level': 'कक्षा स्तर',
  'error_loading_announcements': 'सूचनाएं लोड करने में त्रुटि',
  'sign_in': 'साइन इन करें',
  'course_updated_successfully': 'पाठ्यक्रम सफलतापूर्वक अपडेट किया गया',
  'update_course': 'पाठ्यक्रम अपडेट करें',
  'chapter_completed': 'अध्याय पूर्ण हुआ',
  'error_marking_complete': 'अध्याय को पूर्ण चिह्नित करने में त्रुटि',
  'failed_load_course': 'पाठ्यक्रम लोड करने में विफल',
  'locked': 'लॉक किया गया'
};

// General fallback translator for other legacy keys
function getHindiTranslation(key, enVal) {
  if (translationsHi[key]) return translationsHi[key];
  
  // Check exact matches on lowercase enVal
  const lower = (enVal || key).toLowerCase().trim();
  const directMap = {
    'save': 'सहेजें',
    'cancel': 'रद्द करें',
    'delete': 'हटाएं',
    'edit': 'संपादित करें',
    'submit': 'सबमिट करें',
    'update': 'अपडेट करें',
    'search': 'खोजें',
    'filter': 'फ़िल्टर',
    'download': 'डाउनलोड करें',
    'upload': 'अपलोड करें',
    'view': 'देखें',
    'view details': 'विवरण देखें',
    'details': 'विवरण',
    'close': 'बंद करें',
    'back': 'वापस',
    'next': 'अगला',
    'previous': 'पिछला',
    'confirm': 'पुष्टि करें',
    'yes': 'हाँ',
    'no': 'नहीं',
    'ok': 'ठीक है',
    'status': 'स्थिति',
    'active': 'सक्रिय',
    'inactive': 'निष्क्रिय',
    'pending': 'लंबित',
    'approved': 'स्वीकृत',
    'rejected': 'अस्वीकृत',
    'date': 'तिथि',
    'time': 'समय',
    'name': 'नाम',
    'email': 'ईमेल',
    'phone': 'फ़ोन',
    'address': 'पता',
    'amount': 'राशि',
    'action': 'कार्रवाई',
    'actions': 'कार्रवाइयां',
    'loading...': 'लोड हो रहा है...',
    'success': 'सफल',
    'error': 'त्रुटि',
    'warning': 'चेतावनी',
    'info': 'जानकारी',
    'select': 'चुनें',
    'choose': 'चुनें',
    'add': 'जोड़ें',
    'create': 'बनाएं',
    'remove': 'हटाएं',
    'clear': 'साफ़ करें',
    'reset': 'रीसेट करें',
    'refresh': 'रीफ़्रेश',
    'print': 'प्रिंट करें',
    'export': 'निर्यात करें',
    'import': 'आयात करें',
    'total': 'कुल',
    'paid': 'भुगतान किया गया',
    'unpaid': 'अदत्त',
    'due': 'देय',
    'overdue': 'अतिदेय'
  };
  
  if (directMap[lower]) return directMap[lower];
  
  // If it starts with 'Enter '
  if (lower.startsWith('enter ')) {
    const rest = lower.substring(6);
    return `${directMap[rest] || rest} दर्ज करें`;
  }
  // If it starts with 'Select '
  if (lower.startsWith('select ')) {
    const rest = lower.substring(7);
    return `${directMap[rest] || rest} चुनें`;
  }
  
  // Return intelligent Hindi phrasing based on English string
  return enVal;
}

// Function to decide target namespace
function decideNamespace(key, enVal) {
  if (key.startsWith('nav_')) return 'navigation';
  if (key.startsWith('stat_') || key.startsWith('total_') || key.startsWith('chart_') || key.includes('overview') || key.includes('metric')) return 'dashboard';
  if (key.startsWith('field_') || key.startsWith('label_') || key.startsWith('placeholder_') || key.startsWith('error_') || key.startsWith('input_') || key.includes('_error') || key.includes('required')) return 'forms';
  if (key.startsWith('toast_') || key.startsWith('alert_') || key.startsWith('announcement') || key.includes('_success') || key.includes('_failed') || key.includes('notification')) return 'notifications';
  if (key.startsWith('tour_')) return 'tours';
  if (key.startsWith('bot_') || key.startsWith('chat_')) return 'chatbot';
  
  // Check common form patterns
  if (key.startsWith('add_') || key.startsWith('create_') || key.startsWith('edit_') || key.startsWith('update_') || key.includes('_placeholder')) {
    return 'forms';
  }
  
  return 'common';
}

// Combine all legacy keys and missing keys
const allNewKeys = {};
for (const [k, v] of Object.entries(legacyEn)) {
  allNewKeys[k] = v;
}

// Add the 23 code keys with standard English values
const missingCodeKeys = {
  'add_new_expense': 'Add New Expense',
  'footer_description': 'Empowering educational excellence with smart learning and institutional management.',
  'quick_links': 'Quick Links',
  'legal': 'Legal',
  'privacy_policy': 'Privacy Policy',
  'refund_policy': 'Refund Policy',
  'all_rights_reserved': 'All rights reserved.',
  'developed_by': 'Developed with excellence',
  'applicable_structure': 'Applicable Fee Structure',
  'choose_payment_plan': 'Choose Payment Plan',
  'full_payment_single': 'Full Payment (Single Installment)',
  'edumentor_lms': 'Core5 LMS',
  'professional_information': 'Professional Information',
  'failed_to_delete_classroom': 'Failed to delete classroom',
  'grade_level': 'Grade Level',
  'error_loading_announcements': 'Error loading announcements',
  'sign_in': 'Sign In',
  'course_updated_successfully': 'Course updated successfully',
  'update_course': 'Update Course',
  'chapter_completed': 'Chapter Completed',
  'error_marking_complete': 'Error marking chapter complete',
  'failed_load_course': 'Failed to load course',
  'locked': 'Locked'
};

for (const [k, v] of Object.entries(missingCodeKeys)) {
  allNewKeys[k] = v;
}

// Existing keys across all namespaces
const existingAll = new Set();
for (const ns of namespaces) {
  Object.keys(currentEn[ns]).forEach(k => existingAll.add(k));
}

let addedCount = 0;
for (const [key, enVal] of Object.entries(allNewKeys)) {
  if (existingAll.has(key)) {
    // Key already exists, ensure Hindi is not missing or empty
    for (const ns of namespaces) {
      if (currentEn[ns][key] !== undefined) {
        if (!currentHi[ns][key] || currentHi[ns][key] === '') {
          currentHi[ns][key] = getHindiTranslation(key, enVal);
        }
      }
    }
    continue;
  }
  
  const targetNs = decideNamespace(key, enVal);
  currentEn[targetNs][key] = enVal;
  currentHi[targetNs][key] = getHindiTranslation(key, enVal);
  existingAll.add(key);
  addedCount++;
}

console.log(`Successfully migrated ${addedCount} new keys into namespaces!`);

// Save all updated files back to disk with nice indentation
for (const ns of namespaces) {
  const enPath = path.join(localesDir, 'en-IN', `${ns}.json`);
  const hiPath = path.join(localesDir, 'hi-IN', `${ns}.json`);
  
  fs.writeFileSync(enPath, JSON.stringify(currentEn[ns], null, 2) + '\n', 'utf8');
  fs.writeFileSync(hiPath, JSON.stringify(currentHi[ns], null, 2) + '\n', 'utf8');
  
  console.log(`✓ ${ns}: en-IN (${Object.keys(currentEn[ns]).length} keys), hi-IN (${Object.keys(currentHi[ns]).length} keys)`);
}
