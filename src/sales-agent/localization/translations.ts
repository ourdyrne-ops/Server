export interface TranslationDictionary {
  welcomeGreeting: string;
  selectLanguage: string;
  languageChanged: string;
  selectCustomerType: string;
  newCustomerBtn: string;
  existingCustomerBtn: string;
  newCustomerIntro: string;
  existingCustomerVerification: string;
  existingCustomerNotFound: string;
  existingCustomerFound: string;
  bundleOverviewTitle: string;
  bundlePriceLabel: string;
  bundleDurationLabel: string;
  bundleBenefitsLabel: string;
  bundleOutcomesLabel: string;
  coursesIncludedLabel: string;
  buyNowBtn: string;
  faqBtn: string;
  backBtn: string;
  askSupportBtn: string;
  switchLanguageBtn: string;
  faqTitle: string;
  faqPrompt: string;
  faqQuestions: {
    content: { q: string; a: string };
    access: { q: string; a: string };
    payment: { q: string; a: string };
    expiry: { q: string; a: string };
    refund: { q: string; a: string };
    support: { q: string; a: string };
  };
  checkoutTitle: string;
  checkoutDesc: string;
  payStarsBtn: string;
  orderCreated: string;
  paymentSuccessTitle: string;
  paymentSuccessBody: string;
  activateNowBtn: string;
  activationInstructions: string;
  provisioningInProgress: string;
  provisioningFailed: string;
  supportContactMsg: string;
  unknownCommandMsg: string;
  groupTeaserText: string;
  groupTeaserBtn: string;
}

export const TRANSLATIONS: Record<string, TranslationDictionary> = {
  en: {
    welcomeGreeting: '👋 Welcome to Melcome University Course Sales!',
    selectLanguage: 'Please select your preferred language / कृपया अपनी पसंदीदा भाषा चुनें:',
    languageChanged: 'Language updated to English.',
    selectCustomerType: 'Are you a new student or an existing student with us?',
    newCustomerBtn: '✨ New Customer (First Time)',
    existingCustomerBtn: '🎓 Existing Customer',
    newCustomerIntro: 'Welcome! Explore our premier course bundles designed to accelerate your career and business.',
    existingCustomerVerification: '🔍 Checking your existing account record...',
    existingCustomerNotFound: 'ℹ️ No active subscription found for this Telegram account. You can purchase a bundle as a new student or contact support if you previously registered under another ID.',
    existingCustomerFound: '✅ Existing student record verified! Your current subscription status is active. Would you like to renew or add a new course bundle?',
    bundleOverviewTitle: '🌟 Course Bundle Details',
    bundlePriceLabel: 'Price',
    bundleDurationLabel: 'Access Duration',
    bundleBenefitsLabel: 'Key Benefits',
    bundleOutcomesLabel: 'What You Will Master',
    coursesIncludedLabel: 'Included Courses & Masterclasses',
    buyNowBtn: '⭐ Buy Now with Telegram Stars',
    faqBtn: '❓ Frequently Asked Questions',
    backBtn: '⬅️ Back',
    askSupportBtn: '💬 Ask Support',
    switchLanguageBtn: '🌐 Change Language',
    faqTitle: '❓ Frequently Asked Questions',
    faqPrompt: 'Select a question below to learn more:',
    faqQuestions: {
      content: {
        q: '📚 What courses are included in this bundle?',
        a: 'The bundle includes full access to 13+ masterclasses covering AI Automation, Telegram Bots, B2B High-Ticket Sales, UI/UX Design Systems, and Financial Forecasting. Content includes 4K video streams, downloadable audio guides, and interactive text summaries.'
      },
      access: {
        q: '📱 How and where do I access the lessons?',
        a: 'All lessons are streamed seamlessly inside our Telegram Service Bot (@melcome_university_bot). You can watch videos, listen to audios, track your lesson progress, and save bookmarks directly within Telegram on mobile or desktop.'
      },
      payment: {
        q: '⭐ How does Telegram Stars (XTR) payment work?',
        a: 'Telegram Stars can be purchased securely directly inside Telegram using Google Play, Apple App Store, or bank card. Once paid, your order is verified instantly in seconds without sharing payment credentials.'
      },
      expiry: {
        q: '⏳ How long is the access and how do renewals work?',
        a: 'Each purchase grants 30 days of full continuous access. You will receive gentle reminders 7 days and 3 days before expiry with an option to renew effortlessly using Stars.'
      },
      refund: {
        q: '🛡️ What is your refund policy?',
        a: 'We offer a 24-hour satisfaction guarantee with a 95% refund window (retaining only 5% payment gateway processing fees) if requested within 24 hours of purchase.'
      },
      support: {
        q: '👨‍💻 How do I reach human support if I need help?',
        a: 'You can tap "💬 Ask Support" anytime or reach our university team at @melcome_admin. Our support desk operates 7 days a week.'
      }
    },
    checkoutTitle: '🛒 Complete Your Purchase',
    checkoutDesc: 'You are purchasing the course bundle. Tap below to pay using Telegram Stars:',
    payStarsBtn: '⭐ Pay {amount} Stars',
    orderCreated: 'Order #{orderNumber} has been generated. Tap the invoice above to complete checkout.',
    paymentSuccessTitle: '🎉 Payment Successful!',
    paymentSuccessBody: 'Thank you for your purchase! Your order #{orderNumber} for {amount} Stars is confirmed.',
    activateNowBtn: '🚀 Activate Access in University Bot',
    activationInstructions: 'Tap the button below to link your student profile and unlock your courses in @melcome_university_bot immediately.',
    provisioningInProgress: '⏳ Provisioning your student entitlement... Generating your secure activation link.',
    provisioningFailed: '⚠️ Student provisioning is currently being retried. Our system will notify you shortly.',
    supportContactMsg: '📞 Need assistance? Contact our official support desk at @melcome_admin or reply to this message.',
    unknownCommandMsg: 'Please use the interactive buttons below to proceed.',
    groupTeaserText: '🚀 Unlock exclusive masterclasses in AI, Sales & Automation! Special pricing available inside our official sales bot:',
    groupTeaserBtn: '🌟 View Course Bundle & Special Offer'
  },
  hi: {
    welcomeGreeting: '👋 मेलकॉम यूनिवर्सिटी कोर्स सेल्स में आपका स्वागत है!',
    selectLanguage: 'कृपया अपनी पसंदीदा भाषा चुनें:',
    languageChanged: 'भाषा हिंदी में सेट कर दी गई है।',
    selectCustomerType: 'क्या आप पहली बार आ रहे हैं या हमारे मौजूदा छात्र हैं?',
    newCustomerBtn: '✨ नए छात्र (पहली बार)',
    existingCustomerBtn: '🎓 मौजूदा छात्र',
    newCustomerIntro: 'स्वागत है! अपने करियर और व्यवसाय को नई ऊँचाइयों पर ले जाने के लिए हमारे प्रीमियम कोर्स बंडलों को देखें।',
    existingCustomerVerification: '🔍 आपके खाते का विवरण जाँचा जा रहा है...',
    existingCustomerNotFound: 'ℹ️ इस टेलीग्राम खाते से कोई सक्रिय सब्सक्रिप्शन नहीं मिला। आप नए छात्र के रूप में बंडल खरीद सकते हैं या सहायता टीम से संपर्क कर सकते हैं।',
    existingCustomerFound: '✅ मौजूदा छात्र रिकॉर्ड सत्यापित! आपका सब्सक्रिप्शन सक्रिय है। क्या आप नया बंडल जोड़ना या नवीनीकरण करना चाहते हैं?',
    bundleOverviewTitle: '🌟 कोर्स बंडल विवरण',
    bundlePriceLabel: 'मूल्य',
    bundleDurationLabel: 'सत्र अवधि',
    bundleBenefitsLabel: 'प्रमुख लाभ',
    bundleOutcomesLabel: 'आप क्या सीखेंगे',
    coursesIncludedLabel: 'शामिल पाठ्यक्रम और मास्टरक्लास',
    buyNowBtn: '⭐ टेलीग्राम स्टार्स से अभी खरीदें',
    faqBtn: '❓ अक्सर पूछे जाने वाले सवाल',
    backBtn: '⬅️ पीछे जाएं',
    askSupportBtn: '💬 सहायता से संपर्क करें',
    switchLanguageBtn: '🌐 भाषा बदलें',
    faqTitle: '❓ अक्सर पूछे जाने वाले प्रश्न (FAQ)',
    faqPrompt: 'विस्तार से जानने के लिए नीचे दिए गए प्रश्नों में से चुनें:',
    faqQuestions: {
      content: {
        q: '📚 इस बंडल में कौन से कोर्स शामिल हैं?',
        a: 'इस बंडल में AI ऑटोमेशन, टेलीग्राम बॉट्स, B2B सेल्स, UI/UX डिज़ाइन और फाइनेंस पर 13+ प्रीमियम मास्टरक्लास शामिल हैं।'
      },
      access: {
        q: '📱 मुझे कक्षाएं कैसे और कहाँ मिलेंगी?',
        a: 'सभी पाठ हमारे टेलीग्राम सर्विस बॉट (@melcome_university_bot) में उपलब्ध हैं। आप सीधे टेलीग्राम पर वीडियो देख सकते हैं और ऑडियो सुन सकते हैं।'
      },
      payment: {
        q: '⭐ टेलीग्राम स्टार्स (XTR) से भुगतान कैसे होता है?',
        a: 'टेलीग्राम स्टार्स को गूगल प्ले, ऐप स्टोर या कार्ड के ज़रिए सीधे टेलीग्राम में खरीदा जा सकता है। भुगतान कुछ सेकंड में सुरक्षित रूप से पूरा हो जाता है।'
      },
      expiry: {
        q: '⏳ वैधता कितने दिन है और रिन्यूअल कैसे होगा?',
        a: 'प्रत्येक खरीद पर 30 दिन का पूरा एक्सेस मिलता है। समाप्ति से 7 दिन और 3 दिन पहले आपको रिमाइंडर भेजा जाएगा।'
      },
      refund: {
        q: '🛡️ रिफंड की क्या नीति है?',
        a: 'खरीद के 24 घंटों के भीतर अनुरोध करने पर 95% रिफंड गारंटी उपलब्ध है (केवल 5% पेमेंट गेटवे शुल्क कटेगा)।'
      },
      support: {
        q: '👨‍💻 सहायता के लिए किससे संपर्क करें?',
        a: 'आप किसी भी समय @melcome_admin पर हमारी टीम से संपर्क कर सकते हैं।'
      }
    },
    checkoutTitle: '🛒 अपनी खरीद पूरी करें',
    checkoutDesc: 'कोर्स बंडल खरीदने के लिए नीचे टेलीग्राम स्टार्स से भुगतान करें:',
    payStarsBtn: '⭐ {amount} स्टार्स का भुगतान करें',
    orderCreated: 'ऑर्डर #{orderNumber} तैयार है। भुगतान पूरा करने के लिए ऊपर दिए गए इनवॉइस पर टैप करें।',
    paymentSuccessTitle: '🎉 भुगतान सफल रहा!',
    paymentSuccessBody: 'धन्यवाद! आपका ऑर्डर #{orderNumber} ({amount} स्टार्स) सफलतापूर्वक पुष्ट हो गया है।',
    activateNowBtn: '🚀 यूनिवर्सिटी बॉट में कोर्स शुरू करें',
    activationInstructions: 'नीचे दिए गए बटन पर टैप करके तुरंत @melcome_university_bot में अपना कोर्स अनलॉक करें।',
    provisioningInProgress: '⏳ आपके खाते को सक्रिय किया जा रहा है...',
    provisioningFailed: '⚠️ सक्रियण प्रक्रिया पुनः प्रयास में है।',
    supportContactMsg: '📞 सहायता के लिए @melcome_admin पर संपर्क करें।',
    unknownCommandMsg: 'कृपया आगे बढ़ने के लिए नीचे दिए गए बटनों का उपयोग करें।',
    groupTeaserText: '🚀 AI, सेल्स और ऑटोमेशन के प्रीमियम कोर्स बंडल पर विशेष छूट उपलब्ध है!',
    groupTeaserBtn: '🌟 बंडल और विशेष ऑफर देखें'
  },
  bn: {
    welcomeGreeting: '👋 মেলকম ইউনিভার্সিটি কোর্স সেলসে স্বাগতম!',
    selectLanguage: 'অনুগ্রহ করে আপনার পছন্দের ভাষা নির্বাচন করুন:',
    languageChanged: 'ভাষা বাংলায় পরিবর্তিত হয়েছে।',
    selectCustomerType: 'আপনি কি নতুন শিক্ষার্থী নাকি আমাদের বর্তমান শিক্ষার্থী?',
    newCustomerBtn: '✨ নতুন শিক্ষার্থী (প্রথমবার)',
    existingCustomerBtn: '🎓 বর্তমান শিক্ষার্থী',
    newCustomerIntro: 'স্বাগতম! আপনার ক্যারিয়ার এবং ব্যবসাকে এগিয়ে নিতে আমাদের প্রিমিয়াম কোর্স বান্ডেলগুলো দেখুন।',
    existingCustomerVerification: '🔍 আপনার অ্যাকাউন্ট যাচাই করা হচ্ছে...',
    existingCustomerNotFound: 'ℹ️ এই টেলিগ্রাম অ্যাকাউন্টে কোনো সক্রিয় সাবস্ক্রিপশন পাওয়া যায়নি। আপনি নতুন শিক্ষার্থী হিসেবে বান্ডেল কিনতে পারেন।',
    existingCustomerFound: '✅ বর্তমান শিক্ষার্থী রেকর্ড যাচাই সম্পন্ন! আপনার সাবস্ক্রিপশন সক্রিয় আছে।',
    bundleOverviewTitle: '🌟 কোর্স বান্ডেল বিবরণ',
    bundlePriceLabel: 'মূল্য',
    bundleDurationLabel: 'মেয়াদ',
    bundleBenefitsLabel: 'প্রধান সুবিধাসমূহ',
    bundleOutcomesLabel: 'আপনি যা শিখবেন',
    coursesIncludedLabel: 'অন্তর্ভুক্ত কোর্সসমূহ',
    buyNowBtn: '⭐ টেলিগ্রাম স্টারস দিয়ে কিনুন',
    faqBtn: '❓ সাধারণ প্রশ্নোত্তর',
    backBtn: '⬅️ ফিরে যান',
    askSupportBtn: '💬 সাপোর্টে কথা বলুন',
    switchLanguageBtn: '🌐 ভাষা পরিবর্তন',
    faqTitle: '❓ সাধারণ প্রশ্নোত্তর (FAQ)',
    faqPrompt: 'বিস্তারিত জানতে নিচের যেকোনো প্রশ্নে ক্লিক করুন:',
    faqQuestions: {
      content: {
        q: '📚 এই বান্ডেলে কোন কোন কোর্স রয়েছে?',
        a: 'AI অটোমেশন, টেলিগ্রাম বট তৈরি, B2B সেলস, UI/UX ডিজাইন ও ফিনান্সের ১৩টিরও বেশি মাস্টারক্লাস অন্তর্ভুক্ত।'
      },
      access: {
        q: '📱 ক্লাসগুলো কীভাবে দেখতে পাব?',
        a: 'আমাদের টেলিগ্রাম সার্ভিস বট (@melcome_university_bot) থেকে সরাসরি ভিডিও, অডিও এবং স্টাডি নোট অ্যাক্সেস করতে পারবেন।'
      },
      payment: {
        q: '⭐ টেলিগ্রাম স্টারস পেমেন্ট কীভাবে কাজ করে?',
        a: 'টেলিগ্রামের ভেতরেই গুগল প্লে, অ্যাপ স্টোর বা কার্ড দিয়ে স্টারস কিনে সহজে পেমেন্ট করা যায়।'
      },
      expiry: {
        q: '⏳ কোর্সের মেয়াদ কতদিন থাকবে?',
        a: 'প্রতিটি ক্রয়ে ৩০ দিনের সম্পূর্ণ অ্যাক্সেস পাবেন। মেয়াদ শেষ হওয়ার আগে রিমাইন্ডার পাঠানো হবে।'
      },
      refund: {
        q: '🛡️ রিফান্ড পলিসি কী?',
        a: '২৪ ঘণ্টার মধ্যে আবেদন করলে ৯৫% রিফান্ড সুবিধা রয়েছে।'
      },
      support: {
        q: '👨‍💻 সাহায্য প্রয়োজন হলে কার সাথে যোগাযোগ করব?',
        a: 'সরাসরি @melcome_admin এ যোগাযোগ করতে পারেন।'
      }
    },
    checkoutTitle: '🛒 ক্রয় সম্পন্ন করুন',
    checkoutDesc: 'কোর্স বান্ডেল কিনতে নিচে টেলিগ্রাম স্টারস দিয়ে পেমেন্ট করুন:',
    payStarsBtn: '⭐ {amount} স্টারস পেমেন্ট করুন',
    orderCreated: 'অর্ডার #{orderNumber} তৈরি হয়েছে। পেমেন্ট করতে ইনভয়েসে ট্যাপ করুন।',
    paymentSuccessTitle: '🎉 পেমেন্ট সফল হয়েছে!',
    paymentSuccessBody: 'ধন্যবাদ! আপনার অর্ডার #{orderNumber} সফলভাবে নিশ্চিত হয়েছে।',
    activateNowBtn: '🚀 ইউনিভার্সিটি বটের কোর্স অ্যাক্টিভ করুন',
    activationInstructions: 'নিচের বোতামে ট্যাপ করে @melcome_university_bot এ কোর্স আনলক করুন।',
    provisioningInProgress: '⏳ অ্যাকাউন্ট সক্রিয় করা হচ্ছে...',
    provisioningFailed: '⚠️ প্রক্রিয়া পুনরায় চেষ্টা করা হচ্ছে।',
    supportContactMsg: '📞 সহায়তার জন্য @melcome_admin এ যোগাযোগ করুন।',
    unknownCommandMsg: 'অনুগ্রহ করে নিচের বাটনগুলো ব্যবহার করুন।',
    groupTeaserText: '🚀 AI, সেলস এবং অটোমেশনের প্রিমিয়াম কোর্স বান্ডেলে বিশেষ ছাড়!',
    groupTeaserBtn: '🌟 কোর্স বান্ডেল ও অফার দেখুন'
  },
  mr: {
    welcomeGreeting: '👋 मेलकॉम युनिव्हर्सिटी कोर्स सेल्समध्ये आपले स्वागत आहे!',
    selectLanguage: 'कृपया आपली पसंतीची भाषा निवडा:',
    languageChanged: 'भाषा मराठीमध्ये सेट केली आहे.',
    selectCustomerType: 'तुम्ही नवीन विद्यार्थी आहात की आमचे विद्यमान विद्यार्थी?',
    newCustomerBtn: '✨ नवीन विद्यार्थी (पहिल्यांदा)',
    existingCustomerBtn: '🎓 विद्यमान विद्यार्थी',
    newCustomerIntro: 'स्वागत आहे! आपल्या कौशल्यांमध्ये वाढ करण्यासाठी आमचे प्रिमियम कोर्स बंडल पहा.',
    existingCustomerVerification: '🔍 तुमच्या खात्याची माहिती तपासत आहोत...',
    existingCustomerNotFound: 'ℹ️ या टेलिग्राम खात्यासाठी कोणतीही सक्रिय सदस्यता आढळली नाही. आपण नवीन विद्यार्थी म्हणून बंडल खरेदी करू शकता.',
    existingCustomerFound: '✅ विद्यमान विद्यार्थी खात्याची पडताळणी झाली! आपली सदस्यता सक्रिय आहे.',
    bundleOverviewTitle: '🌟 कोर्स बंडल तपशील',
    bundlePriceLabel: 'किंमत',
    bundleDurationLabel: 'कालावधी',
    bundleBenefitsLabel: 'प्रमुख फायदे',
    bundleOutcomesLabel: 'तुम्ही काय शिकाल',
    coursesIncludedLabel: 'समाविष्ट अभ्यासक्रम',
    buyNowBtn: '⭐ टेलिग्राम स्टार्सने खरेदी करा',
    faqBtn: '❓ वारंवार विचारले जाणारे प्रश्न',
    backBtn: '⬅️ मागे जा',
    askSupportBtn: '💬 मदत मिळवा',
    switchLanguageBtn: '🌐 भाषा बदला',
    faqTitle: '❓ वारंवार विचारले जाणारे प्रश्न (FAQ)',
    faqPrompt: 'अधिक माहितीसाठी खालील प्रश्नांवर क्लिक करा:',
    faqQuestions: {
      content: {
        q: '📚 या बंडलमध्ये कोणते कोर्सेस आहेत?',
        a: 'AI ऑटोमेशन, टेलिग्राम बॉट्स, B2B सेल्स, UI/UX डिझाइन यावरील 13+ प्रिमियम कोर्सेस समाविष्ट आहेत.'
      },
      access: {
        q: '📱 क्लासेस कसे पाहता येतील?',
        a: 'सर्व कोर्सेस आमच्या टेलिग्राम सर्व्हिस बॉट (@melcome_university_bot) मध्ये थेट उपलब्ध आहेत.'
      },
      payment: {
        q: '⭐ टेलिग्राम स्टार्स पेमेंट कसे कार्य करते?',
        a: 'गुगल प्ले किंवा कार्डद्वारे थेट टेलिग्राममध्ये स्टार्स खरेदी करून सुरक्षित पेमेंट करता येते.'
      },
      expiry: {
        q: '⏳ वैधता किती दिवस आहे?',
        a: 'खरेदी केल्यावर 30 दिवसांचा पूर्ण ऍक्सेस मिळतो.'
      },
      refund: {
        q: '🛡️ परतावा (Refund) धोरण काय आहे?',
        a: '24 तासांच्या आत विनंती केल्यास 95% परतावा मिळतो.'
      },
      support: {
        q: '👨‍💻 मदतीसाठी कोणाशी संपर्क साधावा?',
        a: 'कोणत्याही वेळी @melcome_admin शी संपर्क साधा.'
      }
    },
    checkoutTitle: '🛒 खरेदी पूर्ण करा',
    checkoutDesc: 'कोर्स बंडल खरेदी करण्यासाठी खाली टेलिग्राम स्टार्सने पेमेंट करा:',
    payStarsBtn: '⭐ {amount} स्टार्स भरा',
    orderCreated: 'ऑर्डर #{orderNumber} तयार झाली आहे.',
    paymentSuccessTitle: '🎉 पेमेंट यशस्वी झाले!',
    paymentSuccessBody: 'धन्यवाद! तुमची ऑर्डर #{orderNumber} सुरक्षितपणे पूर्ण झाली आहे.',
    activateNowBtn: '🚀 युनिव्हर्सिटी बॉटमध्ये ऍक्टिव्हेट करा',
    activationInstructions: 'खालील बटनावर क्लिक करून @melcome_university_bot मध्ये कोर्सेस सुरू करा.',
    provisioningInProgress: '⏳ ऍक्टिव्हेशन सुरू आहे...',
    provisioningFailed: '⚠️ ऍक्टिव्हेशन पुन्हा प्रयत्न करत आहे.',
    supportContactMsg: '📞 मदतीसाठी @melcome_admin वर संपर्क करा.',
    unknownCommandMsg: 'कृपया खालील पर्यायांचा वापर करा.',
    groupTeaserText: '🚀 AI आणि सेल्स कौशल्यांसाठी विशेष कोर्स बंडल!',
    groupTeaserBtn: '🌟 ऑफर आणि बंडल पहा'
  },
  te: {
    welcomeGreeting: '👋 మెల్‌కమ్ యూనివర్సిటీ కోర్సు సేల్స్‌కు స్వాగతం!',
    selectLanguage: 'దయచేసి మీ ప్రాధాన్య భాషను ఎంచుకోండి:',
    languageChanged: 'భాష తెలుగులోకి మార్చబడింది.',
    selectCustomerType: 'మీరు కొత్త విద్యార్థినా లేదా ఇప్పటికే ఉన్న విద్యార్థినా?',
    newCustomerBtn: '✨ కొత్త విద్యార్థి (మొదటిసారి)',
    existingCustomerBtn: '🎓 ఇప్పటికే ఉన్న విద్యార్థి',
    newCustomerIntro: 'స్వాగతం! మీ నైపుణ్యాలను పెంపొందించుకోవడానికి మా ప్రీమియం కోర్సు బండిల్స్‌ను చూడండి.',
    existingCustomerVerification: '🔍 మీ ఖాతా వివరాలు పరిశీలిస్తున్నాము...',
    existingCustomerNotFound: 'ℹ️ ఈ టెలిగ్రామ్ ఖాతాలో క్రియాశీల చందా కనుగొనబడలేదు. మీరు కొత్త విద్యార్థిగా చేరవచ్చు.',
    existingCustomerFound: '✅ మీ విద్యార్థి ఖాతా ధృవీకరించబడింది! మీ సబ్‌స్క్రిప్షన్ యాక్టివ్‌గా ఉంది.',
    bundleOverviewTitle: '🌟 కోర్సు బండిల్ వివరాలు',
    bundlePriceLabel: 'ధర',
    bundleDurationLabel: 'వ్యవధి',
    bundleBenefitsLabel: 'ప్రధాన ప్రయోజనాలు',
    bundleOutcomesLabel: 'మీరు నేర్చుకునే అంశాలు',
    coursesIncludedLabel: 'చేర్చబడిన కోర్సులు',
    buyNowBtn: '⭐ టెలిగ్రామ్ స్టార్స్‌తో కొనండి',
    faqBtn: '❓ తరచుగా అడిగే ప్రశ్నలు',
    backBtn: '⬅️ వెనుకకు',
    askSupportBtn: '💬 సహాయం కోసం సంప్రదించండి',
    switchLanguageBtn: '🌐 భాష మార్చండి',
    faqTitle: '❓ తరచుగా అడిగే ప్రశ్నలు (FAQ)',
    faqPrompt: 'పూర్తి వివరాల కోసం క్రింది ప్రశ్నలను ఎంచుకోండి:',
    faqQuestions: {
      content: {
        q: '📚 ఈ బండిల్‌లో ఏ కోర్సులు ఉన్నాయి?',
        a: 'AI ఆటోమేషన్, టెలిగ్రామ్ బాట్స్, సేల్స్, డిజైన్‌పై 13+ మాస్టర్‌క్లాస్‌లు అందుబాటులో ఉన్నాయి.'
      },
      access: {
        q: '📱 తరగతులను ఎలా వీక్షించాలి?',
        a: 'మా టెలిగ్రామ్ సర్వీస్ బాట్ (@melcome_university_bot) ద్వారా నేరుగా వీక్షించవచ్చు.'
      },
      payment: {
        q: '⭐ టెలిగ్రామ్ స్టార్స్ చెల్లింపు ఎలా జరుగుతుంది?',
        a: 'గూగుల్ ప్లే లేదా కార్డుల ద్వారా టెలిగ్రామ్‌లోనే స్టార్స్ కొని క్షణాల్లో చెల్లించవచ్చు.'
      },
      expiry: {
        q: '⏳ కోర్సు ఎంతకాలం అందుబాటులో ఉంటుంది?',
        a: 'ప్రతి కొనుగోలుకు 30 రోజుల పూర్తి యాక్సెస్ లభిస్తుంది.'
      },
      refund: {
        q: '🛡️ రీఫండ్ విధానం ఏమిటి?',
        a: '24 గంటల్లోపు 95% రీఫండ్ హామీ కలదు.'
      },
      support: {
        q: '👨‍💻 సహాయం కోసం ఎవరిని సంప్రదించాలి?',
        a: '@melcome_admin వద్ద మా బృందాన్ని సంప్రదించవచ్చు.'
      }
    },
    checkoutTitle: '🛒 కొనుగోలును పూర్తి చేయండి',
    checkoutDesc: 'కోర్సు బండిల్ కోసం టెలిగ్రామ్ స్టార్స్‌తో చెల్లించండి:',
    payStarsBtn: '⭐ {amount} స్టార్స్ చెల్లించండి',
    orderCreated: 'ఆర్డర్ #{orderNumber} రూపొందించబడింది.',
    paymentSuccessTitle: '🎉 చెల్లింపు విజయవంతమైంది!',
    paymentSuccessBody: 'ధన్యవాదాలు! మీ ఆర్డర్ #{orderNumber} ధృవీకరించబడింది.',
    activateNowBtn: '🚀 యూనివర్సిటీ బాట్‌లో యాక్టివేట్ చేయండి',
    activationInstructions: 'క్రింది బటన్ నొక్కి @melcome_university_bot లో కోర్సులు ప్రారంభించండి.',
    provisioningInProgress: '⏳ యాక్టివేషన్ జరుగుతోంది...',
    provisioningFailed: '⚠️ మళ్లీ ప్రయత్నించబడుతోంది.',
    supportContactMsg: '📞 సహాయం కొరకు @melcome_admin ను సంప్రదించండి.',
    unknownCommandMsg: 'దయచేసి క్రింది బటన్లను ఉపయోగించండి.',
    groupTeaserText: '🚀 AI మరియు సేల్స్ కోర్సులపై ప్రత్యేక ఆఫర్లు!',
    groupTeaserBtn: '🌟 కోర్సు వివరాలు & ఆఫర్ చూడండి'
  },
  ta: {
    welcomeGreeting: '👋 மெல்கம் பல்கலைக்கழக பாடநெறி விற்பனைக்கு நல்வரவு!',
    selectLanguage: 'உங்கள் விருப்பமான மொழியைத் தேர்ந்தெடுக்கவும்:',
    languageChanged: 'மொழி தமிழுக்கு மாற்றப்பட்டது.',
    selectCustomerType: 'நீங்கள் புதிய மாணவரா அல்லது ஏற்கனவே உள்ள மாணவரா?',
    newCustomerBtn: '✨ புதிய மாணவர் (முதல் முறை)',
    existingCustomerBtn: '🎓 ஏற்கனவே உள்ள மாணவர்',
    newCustomerIntro: 'வரவேற்கிறோம்! உங்கள் தொழில் திறன்களை வளர்க்க எங்கள் பிரீமியம் பாடநெறி தொகுப்புகளைப் பாருங்கள்.',
    existingCustomerVerification: '🔍 உங்கள் கணக்கு சரிபார்க்கப்படுகிறது...',
    existingCustomerNotFound: 'ℹ️ இந்த டெலிகிராம் கணக்கில் செயலில் உள்ள சந்தா எதுவும் இல்லை. புதிய மாணவராக நீங்கள் இணையலாம்.',
    existingCustomerFound: '✅ மாணவர் விவரம் சரிபார்க்கப்பட்டது! உங்கள் சந்தா செயலில் உள்ளது.',
    bundleOverviewTitle: '🌟 பாடநெறி தொகுப்பு விவரங்கள்',
    bundlePriceLabel: 'விலை',
    bundleDurationLabel: 'கால அளவு',
    bundleBenefitsLabel: 'முக்கிய நன்மைகள்',
    bundleOutcomesLabel: 'நீங்கள் கற்பவை',
    coursesIncludedLabel: 'இணைக்கப்பட்டுள்ள பாடங்கள்',
    buyNowBtn: '⭐ டெலிகிராம் ஸ்டார்ஸ் மூலம் வாங்கவும்',
    faqBtn: '❓ அடிக்கடி கேட்கப்படும் கேள்விகள்',
    backBtn: '⬅️ பின்செல்லவும்',
    askSupportBtn: '💬 உதவி பெறவும்',
    switchLanguageBtn: '🌐 மொழியை மாற்றுக',
    faqTitle: '❓ அடிக்கடி கேட்கப்படும் கேள்விகள் (FAQ)',
    faqPrompt: 'விவரங்களை அறிய கீழே உள்ள கேள்விகளைத் தேர்ந்தெடுக்கவும்:',
    faqQuestions: {
      content: {
        q: '📚 இதில் என்னென்ன பாடங்கள் உள்ளன?',
        a: 'AI தானியக்கவியல், டெலிகிராம் பாட்கள், விற்பனை மற்றும் வடிவமைப்பு தொடர்பான 13+ மாஸ்டர்கிளாஸ்கள் உள்ளன.'
      },
      access: {
        q: '📱 வகுப்புகளை எப்படிப் பார்ப்பது?',
        a: 'எங்கள் டெலிகிராம் சர்வீஸ் பாட் (@melcome_university_bot) வழியாக நேரடியாகப் படிக்கலாம்.'
      },
      payment: {
        q: '⭐ டெலிகிராம் ஸ்டார்ஸ் கட்டணம் எவ்வாறு செயல்படுகிறது?',
        a: 'கூகிள் பிளே அல்லது அட்டை மூலம் டெலிகிராமிலேயே ஸ்டார்ஸ் வாங்கி எளிதாகப் பணம் செலுத்தலாம்.'
      },
      expiry: {
        q: '⏳ பாடநெறி எவ்வளவு காலம் செல்லுபடியாகும்?',
        a: 'ஒவ்வொரு வாங்குதலுக்கும் 30 நாட்கள் முழு அணுகல் கிடைக்கும்.'
      },
      refund: {
        q: '🛡️ கட்டணம் திரும்பப்பெறும் முறை என்ன?',
        a: '24 மணி நேரத்திற்குள் கோரினால் 95% ரீஃபண்ட் உண்டு.'
      },
      support: {
        q: '👨‍💻 உதவிக்கு யாரைத் தொடர்பு கொள்வது?',
        a: '@melcome_admin வழியாக எங்களைத் தொடர்பு கொள்ளலாம்.'
      }
    },
    checkoutTitle: '🛒 வாங்குதலை முடிக்கவும்',
    checkoutDesc: 'டெலிகிராம் ஸ்டார்ஸ் மூலம் பணம் செலுத்துங்கள்:',
    payStarsBtn: '⭐ {amount} ஸ்டார்ஸ் செலுத்தவும்',
    orderCreated: 'ஆர்டர் #{orderNumber} உருவாக்கப்பட்டது.',
    paymentSuccessTitle: '🎉 கட்டணம் வெற்றிகரமாகச் செலுத்தப்பட்டது!',
    paymentSuccessBody: 'நன்றி! உங்கள் ஆர்டர் #{orderNumber} உறுதி செய்யப்பட்டது.',
    activateNowBtn: '🚀 பல்கலைக்கழக பாட்டில் தொடங்கவும்',
    activationInstructions: 'கீழே உள்ள பொத்தானைக் கிளிக் செய்து @melcome_university_bot இல் பாடங்களைத் திறக்கவும்.',
    provisioningInProgress: '⏳ கணக்கு செயலாக்கப்படுகிறது...',
    provisioningFailed: '⚠️ மீண்டும் முயற்சி செய்யப்படுகிறது.',
    supportContactMsg: '📞 உதவிக்கு @melcome_admin ஐத் தொடர்பு கொள்ளவும்.',
    unknownCommandMsg: 'தயவுசெய்து கீழே உள்ள பொத்தான்களைப் பயன்படுத்தவும்.',
    groupTeaserText: '🚀 AI மற்றும் விற்பனை பாடநெறிகளில் சிறப்பு சலுகை!',
    groupTeaserBtn: '🌟 பாடநெறி விவரங்களைப் பார்க்க'
  },
  ml: {
    welcomeGreeting: '👋 മെൽക്കം യൂണിവേഴ്സിറ്റി കോഴ്സ് സെയിൽസിലേക്ക് സ്വാഗതം!',
    selectLanguage: 'ദയവായി നിങ്ങളുടെ ഇഷ്ടഭാഷ തിരഞ്ഞെടുക്കുക:',
    languageChanged: 'ഭാഷ മലയാളത്തിലേക്ക് മാറ്റി.',
    selectCustomerType: 'താങ്കൾ പുതിയ വിദ്യാർത്ഥിയാണോ അതോ നിലവിലുള്ള വിദ്യാർത്ഥിയാണോ?',
    newCustomerBtn: '✨ പുതിയ വിദ്യാർത്ഥി (ആദ്യമായി)',
    existingCustomerBtn: '🎓 നിലവിലുള്ള വിദ്യാർത്ഥി',
    newCustomerIntro: 'സ്വാഗതം! നിങ്ങളുടെ ബിസിനസ്സും കരിയറും വളർത്താൻ മികച്ച കോഴ്സ് ബണ്ടിലുകൾ പരിശോധിക്കൂ.',
    existingCustomerVerification: '🔍 അക്കൗണ്ട് പരിശോധിക്കുന്നു...',
    existingCustomerNotFound: 'ℹ️ ഈ ടെലിഗ്രാം അക്കൗണ്ടിൽ സജീവമായ വരിക്കാരെ കണ്ടെത്തിയില്ല. പുതിയ വിദ്യാർത്ഥിയായി ബണ്ടിൽ വാങ്ങാവുന്നതാണ്.',
    existingCustomerFound: '✅ വിദ്യാർത്ഥി അക്കൗണ്ട് സ്ഥിരീകരിച്ചു! നിങ്ങളുടെ സബ്സ്ക്രിപ്ഷൻ നിലവിൽ സജീവമാണ്.',
    bundleOverviewTitle: '🌟 കോഴ്സ് ബണ്ടിൽ വിവരങ്ങൾ',
    bundlePriceLabel: 'വില',
    bundleDurationLabel: 'കാലാവധി',
    bundleBenefitsLabel: 'പ്രധാന നേട്ടങ്ങൾ',
    bundleOutcomesLabel: 'നിങ്ങൾ പഠിക്കുന്നത്',
    coursesIncludedLabel: 'ഉൾപ്പെടുത്തിയിട്ടുള്ള കോഴ്സുകൾ',
    buyNowBtn: '⭐ ടെലിഗ്രാം സ്റ്റാർസ് വഴി വാങ്ങുക',
    faqBtn: '❓ പതിവായി ചോദിക്കുന്ന ചോദ്യങ്ങൾ',
    backBtn: '⬅️ പിന്നോട്ട്',
    askSupportBtn: '💬 സഹായത്തിന് ബന്ധപ്പെടുക',
    switchLanguageBtn: '🌐 ഭാഷ മാറ്റുക',
    faqTitle: '❓ പതിവായി ചോദിക്കുന്ന ചോദ്യങ്ങൾ (FAQ)',
    faqPrompt: 'കൂടുതൽ വിവരങ്ങൾക്ക് താഴെയുള്ള ചോദ്യങ്ങളിൽ ഒന്ന് തിരഞ്ഞെടുക്കുക:',
    faqQuestions: {
      content: {
        q: '📚 ഈ ബണ്ടിലിൽ എന്തൊക്കെ കോഴ്സുകളുണ്ട്?',
        a: 'AI ഓട്ടോമേഷൻ, ടെലിഗ്രാം ബോട്ട് നിർമ്മാണം, B2B സെയിൽസ്, UI/UX ഡിസൈൻ എന്നിവയിലെ 13+ മാസ്റ്റർക്ലാസ്സുകൾ പൂർണ്ണമായും ലഭ്യമാണ്.'
      },
      access: {
        q: '📱 ക്ലാസുകൾ എവിടെ എങ്ങനെ കാണാം?',
        a: 'ഞങ്ങളുടെ ടെലിഗ്രാം സർവീസ് ബോട്ടിൽ (@melcome_university_bot) നേരിട്ട് വീഡിയോകൾ കാണാനും ഓഡിയോകൾ കേൾക്കാനും സാധിക്കും.'
      },
      payment: {
        q: '⭐ ടെലിഗ്രാം സ്റ്റാർസ് (XTR) പേയ്മെന്റ് എങ്ങനെയാണ്?',
        a: 'ഗൂഗിൾ പ്ലേ വഴിയോ കാർഡ് വഴിയോ ടെലിഗ്രാമിൽ തന്നെ സ്റ്റാർസ് വാങ്ങി നിമിഷങ്ങൾക്കുള്ളിൽ സുരക്ഷിതമായി പണമടയ്ക്കാം.'
      },
      expiry: {
        q: '⏳ കാലാവധി എത്ര ദിവസമാണ്?',
        a: 'വാങ്ങുന്ന ഓരോ കോഴ്സിനും 30 ദിവസത്തെ പൂർണ്ണ ആക്സസ് ലഭിക്കും. കാലാവധി തീരുന്നതിന് മുൻപ് ഓർമ്മപ്പെടുത്തലുകൾ നൽകും.'
      },
      refund: {
        q: '🛡️ റീഫണ്ട് പോളിസി എന്താണ്?',
        a: 'വാങ്ങി 24 മണിക്കൂറിനുള്ളിൽ 95% റീഫണ്ട് വാഗ്ദാനം ചെയ്യുന്നു.'
      },
      support: {
        q: '👨‍💻 സംശയങ്ങൾക്ക് ആരെയാണ് ബന്ധപ്പെടേണ്ടത്?',
        a: '@melcome_admin വഴി ഞങ്ങളുടെ ടീമുമായി നേരിട്ട് ബന്ധപ്പെടാം.'
      }
    },
    checkoutTitle: '🛒 പർച്ചേസ് പൂർത്തിയാക്കുക',
    checkoutDesc: 'ടെലിഗ്രാം സ്റ്റാർസ് ഉപയോഗിച്ച് പേയ്‌മെന്റ് നടത്തുക:',
    payStarsBtn: '⭐ {amount} സ്റ്റാർസ് അടയ്ക്കുക',
    orderCreated: 'ഓർഡർ #{orderNumber} തയ്യാറായി.',
    paymentSuccessTitle: '🎉 പേയ്‌മെന്റ് വിജയകരം!',
    paymentSuccessBody: 'നന്ദി! നിങ്ങളുടെ ഓർഡർ #{orderNumber} സ്ഥിരീകരിച്ചു.',
    activateNowBtn: '🚀 യൂണിവേഴ്സിറ്റി ബോട്ടിൽ കോഴ്സ് ആരംഭിക്കുക',
    activationInstructions: 'താഴെയുള്ള ബട്ടൺ അമർത്തി @melcome_university_bot ൽ കോഴ്സ് തുറക്കുക.',
    provisioningInProgress: '⏳ അക്കൗണ്ട് ആക്റ്റിവേറ്റ് ചെയ്യുന്നു...',
    provisioningFailed: '⚠️ വീണ്ടും ശ്രമിക്കുന്നു...',
    supportContactMsg: '📞 സഹായത്തിന് @melcome_admin മായി ബന്ധപ്പെടുക.',
    unknownCommandMsg: 'ദയവായി താഴെയുള്ള ബട്ടണുകൾ ഉപയോഗിക്കുക.',
    groupTeaserText: '🚀 AI, സെയിൽസ് കോഴ്സുകൾക്ക് പ്രത്യേക ഓഫർ!',
    groupTeaserBtn: '🌟 കോഴ്സ് ബണ്ടിൽ കാണുക'
  }
};

export function getTranslation(lang: string = 'en'): TranslationDictionary {
  return TRANSLATIONS[lang] || TRANSLATIONS['en'];
}
