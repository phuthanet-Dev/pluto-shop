-- Catalog names, visual codes, order, USD references, and availability mirror
-- the user-provided read-only source screenshot. Prices use the fixed project
-- conversion: whole USD reference price * 35 THB/USD * 100 satang/THB.
INSERT INTO products (
    id, slug, name_th, name_en, description_th, description_en, visual_code,
    type, price_minor, currency, stock_quantity, bundle_item_count,
    instant_delivery, catalog_order
) VALUES
    -- USD reference 29; 29 * 35 * 100 = 101500 satang
    (1, 'creator-launch-kit', 'ชุดเปิดตัวสำหรับครีเอเตอร์', 'Creator Launch Kit',
     'สินทรัพย์สี่รายการที่จัดเข้าชุดสำหรับครีเอเตอร์เตรียมเปิดตัวสินค้าดิจิทัลอย่างมืออาชีพ',
     'Four coordinated launch assets for creators preparing a polished digital release.',
     'CL', 'BUNDLE', 101500, 'THB', 1, 4, TRUE, 1),
    -- USD reference 34; 34 * 35 * 100 = 119000 satang
    (2, 'aurora-ui-component-library', 'คลังคอมโพเนนต์ยูไอออโรรา', 'Aurora UI Component Library',
     'คลังคอมโพเนนต์พร้อมใช้งานสำหรับสร้างอินเทอร์เฟซที่สม่ำเสมอและทันสมัย',
     'Production-ready Aurora UI components for consistent, modern product interfaces.',
     'UI', 'SINGLE', 119000, 'THB', 88, NULL, TRUE, 2),
    -- USD reference 18; 18 * 35 * 100 = 63000 satang
    (3, 'social-post-template-collection', 'คอลเลกชันเทมเพลตโพสต์โซเชียล', 'Social Post Template Collection',
     'เทมเพลตโพสต์หกแบบที่ปรับสี ภาพ และข้อความให้เข้ากับแคมเปญได้รวดเร็ว',
     'Six adaptable post templates for quickly matching campaign colors, images, and copy.',
     'SP', 'BUNDLE', 63000, 'THB', 1, 6, TRUE, 3),
    -- USD reference 24; 24 * 35 * 100 = 84000 satang
    (4, 'minimal-brand-guidelines', 'คู่มือแบรนด์มินิมอล', 'Minimal Brand Guidelines',
     'เทมเพลตคู่มือแบรนด์เรียบง่ายสำหรับบันทึกโลโก้ สี ตัวอักษร และแนวทางภาพ',
     'A clean guideline template for documenting logos, colors, typography, and imagery.',
     'BG', 'SINGLE', 84000, 'THB', 70, NULL, TRUE, 4),
    -- USD reference 16; 16 * 35 * 100 = 56000 satang
    (5, 'editorial-presentation-deck', 'ชุดสไลด์นำเสนอเอดิทอเรียล', 'Editorial Presentation Deck',
     'เลย์เอาต์สามแบบสำหรับเรื่องเล่ายาว ส่วนที่เน้นภาพ และงานนำเสนอเอดิทอเรียลที่เรียบร้อย',
     'Layouts for long-form narratives, image-led sections, and polished editorial presentations.',
     'PD', 'BUNDLE', 56000, 'THB', 1, 3, TRUE, 5),
    -- USD reference 9; 9 * 35 * 100 = 31500 satang
    (6, 'invoice-quote-template-bundle', 'ชุดเทมเพลตใบแจ้งหนี้และใบเสนอราคา', 'Invoice & Quote Template Bundle',
     'เทมเพลตเอกสารธุรกิจที่ช่วยจัดรายการ ราคา ภาษี และข้อมูลลูกค้าอย่างชัดเจน',
     'A business document template for clear line items, pricing, tax, and client details.',
     'IQ', 'SINGLE', 31500, 'THB', 200, NULL, TRUE, 6),
    -- USD reference 14; 14 * 35 * 100 = 49000 satang
    (7, 'freelance-project-starter-pack', 'ชุดเริ่มต้นโปรเจกต์ฟรีแลนซ์', 'Freelance Project Starter Pack',
     'เอกสารห้ารายการสำหรับรับบรีฟ วางขอบเขต ติดตามงาน และส่งมอบโปรเจกต์',
     'Five practical documents for briefs, scope, tracking, review, and project handoff.',
     'FP', 'BUNDLE', 49000, 'THB', 1, 5, TRUE, 7),
    -- USD reference 12; 12 * 35 * 100 = 42000 satang
    (8, 'podcast-cover-art-templates', 'เทมเพลตภาพปกพอดแคสต์', 'Podcast Cover Art Templates',
     'เทมเพลตภาพปกที่อ่านชัดในขนาดย่อและปรับชื่อรายการ ภาพ และสีได้ง่าย',
     'Editable podcast artwork designed to remain clear and recognizable at thumbnail size.',
     'PC', 'SINGLE', 42000, 'THB', 82, NULL, TRUE, 8),
    -- USD reference 28; 28 * 35 * 100 = 98000 satang
    (9, 'motion-title-graphics-pack', 'ชุดกราฟิกโมชั่นไตเติล', 'Motion Title Graphics Pack',
     'กราฟิกไตเติลเคลื่อนไหวสี่รูปแบบสำหรับอินโทร บท และข้อความเน้นในวิดีโอ',
     'Four motion title styles for video intros, chapters, and emphasized messages.',
     'MT', 'BUNDLE', 98000, 'THB', 1, 4, TRUE, 9),
    -- USD reference 19; 19 * 35 * 100 = 66500 satang
    (10, 'cinematic-color-presets', 'พรีเซ็ตสีภาพยนตร์', 'Cinematic Color Presets',
     'พรีเซ็ตสีสำหรับเพิ่มโทนภาพยนตร์โดยรักษาสีผิวและรายละเอียดในเงา',
     'Cinematic color treatments that preserve natural skin tones and shadow detail.',
     'CP', 'SINGLE', 66500, 'THB', 140, NULL, TRUE, 10),
    -- USD reference 22; 22 * 35 * 100 = 77000 satang
    (11, 'abstract-3d-shapes-collection', 'คอลเลกชันรูปทรงสามมิตินามธรรม', 'Abstract 3D Shapes Collection',
     'รูปทรงสามมิตินามธรรมสามชุดสำหรับภาพหน้าปก โฆษณา และงานจัดวางผลิตภัณฑ์',
     'Three abstract 3D shape sets for hero images, advertising, and product compositions.',
     '3D', 'BUNDLE', 77000, 'THB', 1, 3, TRUE, 11),
    -- USD reference 15; 15 * 35 * 100 = 52500 satang
    (12, 'essential-interface-icon-set', 'ชุดไอคอนอินเทอร์เฟซจำเป็น', 'Essential Interface Icon Set',
     'ไอคอนเส้นที่ครอบคลุมการนำทาง การทำงาน สถานะ และสื่อในผลิตภัณฑ์ดิจิทัล',
     'A cohesive line icon set covering navigation, actions, status, and media.',
     'IC', 'SINGLE', 52500, 'THB', 180, NULL, TRUE, 12),
    -- USD reference 13; 13 * 35 * 100 = 45500 satang
    (13, 'modern-resume-portfolio-kit', 'ชุดเรซูเม่และพอร์ตโฟลิโอสมัยใหม่', 'Modern Resume & Portfolio Kit',
     'เอกสารสี่รายการสำหรับนำเสนอประสบการณ์ ผลงาน กรณีศึกษา และข้อมูลติดต่อ',
     'Four coordinated documents for experience, selected work, case studies, and contact details.',
     'CV', 'BUNDLE', 45500, 'THB', 1, 4, TRUE, 13),
    -- USD reference 7; 7 * 35 * 100 = 24500 satang
    (14, 'daily-focus-planner', 'แพลนเนอร์โฟกัสรายวัน', 'Daily Focus Planner',
     'หน้าแพลนรายวันที่ช่วยเลือกงานสำคัญ จัดช่วงเวลา และทบทวนความคืบหน้า',
     'A focused daily page for priorities, time blocks, notes, and progress reflection.',
     'DF', 'SINGLE', 24500, 'THB', 230, NULL, TRUE, 14),
    -- USD reference 8; 8 * 35 * 100 = 28000 satang
    (15, 'travel-journal-page-bundle', 'ชุดหน้าสมุดบันทึกการเดินทาง', 'Travel Journal Page Bundle',
     'หน้าบันทึกสามแบบสำหรับแผนการเดินทาง ความทรงจำ และค่าใช้จ่ายระหว่างทริป',
     'Three journal pages for itineraries, memories, and expenses throughout a trip.',
     'TJ', 'BUNDLE', 28000, 'THB', 1, 3, TRUE, 15),
    -- USD reference 18; 18 * 35 * 100 = 63000 satang
    (16, 'recipe-book-layout-template', 'เทมเพลตเลย์เอาต์หนังสือสูตรอาหาร', 'Recipe Book Layout Template',
     'เลย์เอาต์สูตรอาหารที่จัดส่วนผสม ขั้นตอน เวลา และภาพประกอบให้อ่านง่าย',
     'A readable recipe layout for ingredients, steps, timing, notes, and photography.',
     'RB', 'SINGLE', 63000, 'THB', 76, NULL, TRUE, 16),
    -- USD reference 11; 11 * 35 * 100 = 38500 satang
    (17, 'personal-budget-spreadsheet', 'สเปรดชีตงบประมาณส่วนบุคคล', 'Personal Budget Spreadsheet',
     'สเปรดชีตใช้ง่ายสำหรับติดตามรายรับรายจ่าย เป้าหมายการออม และยอดคงเหลือรายเดือน',
     'An approachable spreadsheet for income, expenses, savings goals, and monthly balances.',
     'BS', 'SINGLE', 38500, 'THB', 210, NULL, TRUE, 17),
    -- USD reference 27; 27 * 35 * 100 = 94500 satang
    (18, 'small-business-finance-dashboard', 'แดชบอร์ดการเงินธุรกิจขนาดเล็ก', 'Small Business Finance Dashboard',
     'แดชบอร์ดสองส่วนสำหรับสรุปรายได้ ต้นทุน กระแสเงินสด และแนวโน้มสำคัญ',
     'Two connected dashboard views for revenue, costs, cash flow, and key trends.',
     'FD', 'BUNDLE', 94500, 'THB', 1, 2, TRUE, 18),
    -- USD reference 21; 21 * 35 * 100 = 73500 satang
    (19, 'project-planning-workspace', 'เวิร์กสเปซวางแผนโปรเจกต์', 'Project Planning Workspace',
     'พื้นที่ทำงานสำหรับเป้าหมาย ไทม์ไลน์ งาน ผู้รับผิดชอบ และบันทึกการตัดสินใจ',
     'A structured workspace for goals, timelines, tasks, owners, and decision notes.',
     'PW', 'SINGLE', 73500, 'THB', 99, NULL, TRUE, 19),
    -- USD reference 17; 17 * 35 * 100 = 59500 satang
    (20, 'online-course-workbook', 'เวิร์กบุ๊กคอร์สออนไลน์', 'Online Course Workbook',
     'เวิร์กบุ๊กสามส่วนสำหรับบทเรียน แบบฝึกหัด การสะท้อนผล และขั้นตอนถัดไป',
     'Three workbook sections for lessons, exercises, reflection, and next actions.',
     'CW', 'BUNDLE', 59500, 'THB', 1, 3, TRUE, 20),
    -- USD reference 32; 32 * 35 * 100 = 112000 satang
    (21, 'website-wireframe-library', 'คลังไวร์เฟรมเว็บไซต์', 'Website Wireframe Library',
     'คลังบล็อกไวร์เฟรมสำหรับวางโครงหน้าเว็บและทดสอบลำดับเนื้อหาอย่างรวดเร็ว',
     'A flexible wireframe library for composing pages and testing content hierarchy quickly.',
     'WW', 'SINGLE', 112000, 'THB', 49, NULL, TRUE, 21),
    -- USD reference 14; 14 * 35 * 100 = 49000 satang
    (22, 'email-campaign-template-set', 'ชุดเทมเพลตแคมเปญอีเมล', 'Email Campaign Template Set',
     'อีเมลห้าแบบสำหรับต้อนรับ ประกาศ โปรโมชัน เนื้อหา และติดตามผล',
     'Five campaign templates for welcome, announcement, promotion, editorial, and follow-up emails.',
     'EM', 'BUNDLE', 49000, 'THB', 1, 5, TRUE, 22),
    -- USD reference 12; 12 * 35 * 100 = 42000 satang
    (23, 'video-thumbnail-design-pack', 'ชุดดีไซน์ภาพปกวิดีโอ', 'Video Thumbnail Design Pack',
     'ดีไซน์ภาพปกวิดีโอที่เน้นหัวเรื่องชัด คอนทราสต์สูง และแก้ไขภาพได้รวดเร็ว',
     'High-contrast video thumbnail designs with strong titles and quick image replacement.',
     'VT', 'SINGLE', 42000, 'THB', 160, NULL, TRUE, 23),
    -- USD reference 23; 23 * 35 * 100 = 80500 satang
    (24, 'sound-effects-starter-library', 'คลังเอฟเฟกต์เสียงเริ่มต้น', 'Sound Effects Starter Library',
     'เอฟเฟกต์เสียงสี่หมวดสำหรับอินเทอร์เฟซ การเปลี่ยนฉาก บรรยากาศ และการเน้นจังหวะ',
     'Four sound categories for interfaces, transitions, ambience, and rhythmic accents.',
     'SF', 'BUNDLE', 80500, 'THB', 1, 4, TRUE, 24),
    -- USD reference 16; 16 * 35 * 100 = 56000 satang
    (25, 'ambient-audio-loop-collection', 'คอลเลกชันเสียงแอมเบียนต์ลูป', 'Ambient Audio Loop Collection',
     'เสียงบรรยากาศวนต่อเนื่องสำหรับวิดีโอ พอดแคสต์ เกม และพื้นที่ดิจิทัล',
     'Seamless ambient audio loops for video, podcasts, games, and digital spaces.',
     'AL', 'SINGLE', 56000, 'THB', 58, NULL, TRUE, 25),
    -- USD reference 36; 36 * 35 * 100 = 126000 satang
    (26, 'lifestyle-stock-photo-bundle', 'ชุดภาพสต็อกไลฟ์สไตล์', 'Lifestyle Stock Photo Bundle',
     'ภาพไลฟ์สไตล์หกชุดที่ครอบคลุมงาน บ้าน การเดินทาง อาหาร สุขภาพ และชุมชน',
     'Six lifestyle photo groups spanning work, home, travel, food, wellness, and community.',
     'PH', 'BUNDLE', 126000, 'THB', 1, 6, TRUE, 26),
    -- USD reference 19; 19 * 35 * 100 = 66500 satang
    (27, 'handwritten-font-pair', 'คู่ฟอนต์ลายมือ', 'Handwritten Font Pair',
     'คู่ฟอนต์ลายมือที่เข้ากันสำหรับหัวเรื่อง ลายเซ็น บรรจุภัณฑ์ และโพสต์โซเชียล',
     'A complementary handwritten font pair for headings, signatures, packaging, and social posts.',
     'HF', 'SINGLE', 66500, 'THB', 125, NULL, TRUE, 27),
    -- USD reference 25; 25 * 35 * 100 = 87500 satang
    (28, 'editorial-serif-display-font', 'ฟอนต์เซอริฟดิสเพลย์เอดิทอเรียล', 'Editorial Serif Display Font',
     'ฟอนต์เซอริฟสองสไตล์สำหรับหัวเรื่องนิตยสาร งานแบรนด์ และข้อความขนาดใหญ่',
     'Two serif display styles for magazine headlines, branding, and expressive large type.',
     'EF', 'BUNDLE', 87500, 'THB', 1, 2, TRUE, 28),
    -- USD reference 20; 20 * 35 * 100 = 70000 satang
    (29, 'monoline-illustration-kit', 'ชุดภาพประกอบเส้นโมโนไลน์', 'Monoline Illustration Kit',
     'ภาพประกอบเส้นน้ำหนักสม่ำเสมอสำหรับอธิบายบริการ ขั้นตอน และแนวคิดแบรนด์',
     'Consistent monoline illustrations for services, process steps, and brand concepts.',
     'MI', 'SINGLE', 70000, 'THB', 77, NULL, TRUE, 29),
    -- USD reference 10; 10 * 35 * 100 = 35000 satang
    (30, 'gradient-background-collection', 'คอลเลกชันพื้นหลังไล่สี', 'Gradient Background Collection',
     'พื้นหลังไล่สีแปดชุดสำหรับหน้าปก โซเชียล สไลด์ และส่วนฮีโร่ของเว็บไซต์',
     'Eight gradient groups for covers, social graphics, slides, and website hero sections.',
     'GB', 'BUNDLE', 35000, 'THB', 1, 8, TRUE, 30),
    -- USD reference 31; 31 * 35 * 100 = 108500 satang
    (31, 'ecommerce-product-mockups', 'ม็อกอัปสินค้าอีคอมเมิร์ซ', 'E-commerce Product Mockups',
     'ฉากม็อกอัปสำหรับนำเสนอสินค้าออนไลน์ด้วยมุมภาพ แสง และพื้นหลังที่แก้ไขได้',
     'Editable product mockup scenes with practical angles, lighting, and backgrounds for online shops.',
     'PM', 'SINGLE', 108500, 'THB', 52, NULL, TRUE, 31),
    -- USD reference 26; 26 * 35 * 100 = 91000 satang
    (32, 'packaging-mockup-essentials', 'ชุดม็อกอัปบรรจุภัณฑ์จำเป็น', 'Packaging Mockup Essentials',
     'ม็อกอัปบรรจุภัณฑ์สี่ประเภทสำหรับทดลองฉลาก สี วัสดุ และตำแหน่งกราฟิก',
     'Four packaging mockup types for testing labels, colors, materials, and graphic placement.',
     'PK', 'BUNDLE', 91000, 'THB', 1, 4, TRUE, 32),
    -- USD reference 24; 24 * 35 * 100 = 84000 satang
    (33, 'mobile-app-showcase-scenes', 'ซีนโชว์เคสแอปมือถือ', 'Mobile App Showcase Scenes',
     'ซีนอุปกรณ์สำหรับนำเสนอหน้าจอแอป ลำดับการใช้งาน และฟีเจอร์สำคัญ',
     'Device scenes for presenting mobile screens, user flows, and key app features.',
     'MA', 'SINGLE', 84000, 'THB', 80, NULL, TRUE, 33),
    -- USD reference 9; 9 * 35 * 100 = 31500 satang
    (34, 'creative-business-card-pack', 'ชุดนามบัตรธุรกิจสร้างสรรค์', 'Creative Business Card Pack',
     'นามบัตรห้าแนวทางสำหรับแบรนด์สร้างสรรค์ พร้อมด้านหน้า ด้านหลัง และกริดแก้ไขได้',
     'Five business card directions with editable fronts, backs, and layout grids.',
     'BC', 'BUNDLE', 31500, 'THB', 1, 5, TRUE, 34),
    -- USD reference 18; 18 * 35 * 100 = 63000 satang
    (35, 'newsletter-layout-system', 'ระบบเลย์เอาต์จดหมายข่าว', 'Newsletter Layout System',
     'ระบบโมดูลาร์สำหรับจัดข่าว บทความ รูปภาพ ลิงก์ และคำกระตุ้นให้ดำเนินการ',
     'A modular newsletter system for updates, articles, imagery, links, and calls to action.',
     'NL', 'SINGLE', 63000, 'THB', 90, NULL, TRUE, 35),
    -- USD reference 6; 6 * 35 * 100 = 21000 satang
    (36, 'digital-product-launch-checklist', 'เช็กลิสต์เปิดตัวสินค้าดิจิทัล', 'Digital Product Launch Checklist',
     'เช็กลิสต์เป็นขั้นตอนสำหรับตรวจสินค้า หน้าขาย ไฟล์ส่งมอบ การสื่อสาร และการติดตามผล',
     'A practical checklist for product QA, sales pages, delivery files, communication, and follow-up.',
     'LC', 'SINGLE', 21000, 'THB', 240, NULL, TRUE, 36);

ALTER TABLE products ALTER COLUMN id RESTART WITH 37;
