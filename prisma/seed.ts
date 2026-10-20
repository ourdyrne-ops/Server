import { PrismaClient, MediaType, ContentStatus, ContentVisibility, AccessLevel, SubscriptionStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting database seed...');

  // 1. Admin User
  const hashedPassword = await bcrypt.hash('password123', 10);
  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@admin.com' },
    update: { password_hash: hashedPassword },
    create: {
      email: 'admin@admin.com',
      password_hash: hashedPassword,
      role: 'SUPER_ADMIN',
    },
  });
  console.log('✅ Admin user created: admin@admin.com');

  // 2. Plans
  const allAccessPlan = await prisma.plan.upsert({
    where: { id: 'plan_all_access' },
    update: {},
    create: {
      id: 'plan_all_access',
      name: 'All-Access Subscription',
      price: 500, // 500 Telegram Stars (XTR)
      currency: 'XTR',
      interval: 'monthly',
    },
  });

  await prisma.plan.upsert({
    where: { id: 'plan_v1' },
    update: {},
    create: {
      id: 'plan_v1',
      name: 'V1 Plan',
      price: 500,
      currency: 'XTR',
      interval: 'monthly',
    },
  });
  console.log('✅ Plans created');

  // 3. Categories
  const categoryNames = [
    'Sales & Outreach',
    'Marketing Mastery',
    'Automation & AI',
    'Design & UI/UX',
    'Finance & Growth',
  ];

  const categoriesMap: Record<string, string> = {};
  for (const name of categoryNames) {
    const cat = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    categoriesMap[name] = cat.id;
  }
  console.log('✅ Categories created:', Object.keys(categoriesMap));

  // 4. Content - Videos, Audios, and Text Study Guides
  const contentsData = [
    // --- VIDEOS ---
    {
      title: 'B2B Sales Masterclass: Prospecting to High-Ticket Closing',
      media_type: MediaType.VIDEO,
      category_id: categoriesMap['Sales & Outreach'],
      status: ContentStatus.PUBLISHED,
      visibility: ContentVisibility.VISIBLE,
      duration: 3600,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    },
    {
      title: 'Telegram Bot & Webhook Architecture in Production',
      media_type: MediaType.VIDEO,
      category_id: categoriesMap['Automation & AI'],
      status: ContentStatus.PUBLISHED,
      visibility: ContentVisibility.VISIBLE,
      duration: 2700,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    },
    {
      title: 'Modern Figma Design Systems & Micro-Interactions',
      media_type: MediaType.VIDEO,
      category_id: categoriesMap['Design & UI/UX'],
      status: ContentStatus.PUBLISHED,
      visibility: ContentVisibility.VISIBLE,
      duration: 4200,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    },
    {
      title: 'AI Agent Pipelines with LangChain & OpenAI APIs',
      media_type: MediaType.VIDEO,
      category_id: categoriesMap['Automation & AI'],
      status: ContentStatus.PUBLISHED,
      visibility: ContentVisibility.VISIBLE,
      duration: 3100,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    },
    {
      title: 'High-Converting Sales Funnels & Landing Page Optimization',
      media_type: MediaType.VIDEO,
      category_id: categoriesMap['Marketing Mastery'],
      status: ContentStatus.PUBLISHED,
      visibility: ContentVisibility.VISIBLE,
      duration: 2900,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    },

    // --- AUDIOS ---
    {
      title: 'High-Ticket Objection Handling Playbook (Audio Edition)',
      media_type: MediaType.AUDIO,
      category_id: categoriesMap['Sales & Outreach'],
      status: ContentStatus.PUBLISHED,
      visibility: ContentVisibility.VISIBLE,
      duration: 1800,
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    },
    {
      title: 'Mindset of Top 1% Closers & Deal Negotiators',
      media_type: MediaType.AUDIO,
      category_id: categoriesMap['Sales & Outreach'],
      status: ContentStatus.PUBLISHED,
      visibility: ContentVisibility.VISIBLE,
      duration: 2400,
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    },
    {
      title: 'Deep Work & Daily Peak Performance Protocols',
      media_type: MediaType.AUDIO,
      category_id: categoriesMap['Finance & Growth'],
      status: ContentStatus.PUBLISHED,
      visibility: ContentVisibility.VISIBLE,
      duration: 1500,
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    },
    {
      title: 'SaaS Growth & Customer Retention Psychology',
      media_type: MediaType.AUDIO,
      category_id: categoriesMap['Marketing Mastery'],
      status: ContentStatus.PUBLISHED,
      visibility: ContentVisibility.VISIBLE,
      duration: 2100,
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    },

    // --- TEXT STUDY GUIDES ---
    {
      title: 'Cold Email Mastery: 25 High-Converting Outbound Templates',
      media_type: MediaType.TEXT,
      category_id: categoriesMap['Marketing Mastery'],
      status: ContentStatus.PUBLISHED,
      visibility: ContentVisibility.VISIBLE,
      textBody: `📌 <b>Cold Email Master Playbook & Templates</b>

🔑 <b>Key Principles for 40%+ Open Rates:</b>
1. <b>Subject Line Formula:</b> Keep it under 4 words, casual, lower-case (e.g., <i>quick question re: {company}</i>).
2. <b>The 3-Sentence Rule:</b> 
   • Sentence 1: Personalized observation / trigger event.
   • Sentence 2: Concrete value proposition with metrics.
   • Sentence 3: Low-friction CTA (e.g., <i>Open to exploring?</i>).

📋 <b>Top 3 Tested Templates:</b>

<b>Template 1: The Specific Pain Point</b>
<blockquote>Hi {{firstName}},

Saw your recent expansion into {{market}} — congratulations.

Most founders in {{industry}} tell us their biggest bottleneck is qualified pipeline generation. We helped {{similarCompany}} add ₹14L in ARR in 45 days through automated outreach.

Open to seeing a 2-minute breakdown for {{company}}?</blockquote>

<b>Template 2: The Direct Case Study</b>
<blockquote>Hi {{firstName}},

We built a custom automation system for {{clientName}} that cut customer onboarding time from 3 days to 4 minutes.

Would love to share the blueprint if this is a priority for {{company}} this quarter. Let me know if you're open to a brief chat.</blockquote>`,
    },
    {
      title: 'Complete B2B Prospecting & Account Enrichment Blueprint',
      media_type: MediaType.TEXT,
      category_id: categoriesMap['Sales & Outreach'],
      status: ContentStatus.PUBLISHED,
      visibility: ContentVisibility.VISIBLE,
      textBody: `📌 <b>B2B Prospecting & ICP Definition Guide</b>

🔑 <b>Ideal Customer Profile (ICP) Criteria:</b>
• Company Headcount: 10 - 250 employees
• Geography: India, UAE, US, UK
• Decision Makers: Founder, CEO, Head of Growth, VP Sales

📋 <b>Enrichment Workflow:</b>
1. Scrape verified LinkedIn Sales Navigator queries.
2. Run email waterfall verification via Hunter & Dropcontact.
3. Validate MX records and SMTP handshake to keep bounce rate below 2%.
4. Feed verified leads into automated CRM pipelines.`,
    },
    {
      title: 'Telegram Mini-App Technical Blueprint & Payment Workflows',
      media_type: MediaType.TEXT,
      category_id: categoriesMap['Automation & AI'],
      status: ContentStatus.PUBLISHED,
      visibility: ContentVisibility.VISIBLE,
      textBody: `📌 <b>Telegram Bot & Webhook Architecture Guide</b>

🔑 <b>Architecture Overview:</b>
• NestJS Backend + Prisma ORM + PostgreSQL
• Webhook Signature Verification with <code>X-Telegram-Bot-Api-Secret-Token</code>
• Auto-Session State Management & Inactivity Message Cleanup
• Seamless Razorpay / Cashfree UPI redirection and instant access fulfillment.`,
    },
    {
      title: 'SaaS Unit Economics: CAC, LTV, and Churn Playbook',
      media_type: MediaType.TEXT,
      category_id: categoriesMap['Finance & Growth'],
      status: ContentStatus.PUBLISHED,
      visibility: ContentVisibility.VISIBLE,
      textBody: `📌 <b>SaaS Metrics & Financial Health Guide</b>

🔑 <b>Golden Ratios:</b>
• <b>LTV / CAC:</b> Must be > 3x for healthy scale.
• <b>Payback Period:</b> Under 12 months for cash-flow resilience.
• <b>Monthly Net Revenue Retention (NRR):</b> > 105% through expansion & renewals.`,
    },
  ];

  const createdContents = [];
  for (const c of contentsData) {
    let mediaRecord = null;
    if (c.videoUrl || c.audioUrl) {
      mediaRecord = await prisma.media.create({
        data: {
          storage_path: c.videoUrl || c.audioUrl || '',
          status: 'READY',
        },
      });
    }

    const content = await prisma.content.create({
      data: {
        title: c.title,
        media_type: c.media_type,
        category_id: c.category_id,
        duration: c.duration,
        visibility: c.visibility,
        status: c.status,
        access_level: AccessLevel.SUBSCRIBER,
        created_by: admin.id,
        media_id: mediaRecord?.id,
        text_content: c.textBody
          ? {
              create: {
                body: c.textBody,
              },
            }
          : undefined,
      },
    });
    createdContents.push(content);
  }
  console.log(`✅ Created ${createdContents.length} courses across Video, Audio, and Text`);

  // 5. Students & Subscriptions & Payments
  const studentsSeed = [
    { telegramId: BigInt(147566638), username: 'rahul_sharma_dev', first_name: 'Rahul', last_name: 'Sharma', status: SubscriptionStatus.ACTIVE, daysRemaining: 28, method: 'Stars', provider: 'TelegramStars' },
    { telegramId: BigInt(248102931), username: 'ananya_design', first_name: 'Ananya', last_name: 'Verma', status: SubscriptionStatus.ACTIVE, daysRemaining: 24, method: 'Stars', provider: 'TelegramStars' },
    { telegramId: BigInt(391029482), username: 'karthik_menon', first_name: 'Karthik', last_name: 'Menon', status: SubscriptionStatus.ACTIVE, daysRemaining: 19, method: 'Stars', provider: 'TelegramStars' },
    { telegramId: BigInt(482910394), username: 'sneha_patel', first_name: 'Sneha', last_name: 'Patel', status: SubscriptionStatus.ACTIVE, daysRemaining: 15, method: 'Stars', provider: 'TelegramStars' },
    { telegramId: BigInt(592019482), username: 'arjun_nair', first_name: 'Arjun', last_name: 'Nair', status: SubscriptionStatus.ACTIVE, daysRemaining: 11, method: 'Stars', provider: 'TelegramStars' },
    { telegramId: BigInt(601928491), username: 'pooja_hegde_biz', first_name: 'Pooja', last_name: 'Hegde', status: SubscriptionStatus.ACTIVE, daysRemaining: 6, method: 'Stars', provider: 'TelegramStars' },
    { telegramId: BigInt(719283019), username: 'sid_rao', first_name: 'Siddharth', last_name: 'Rao', status: SubscriptionStatus.ACTIVE, daysRemaining: 29, method: 'Stars', provider: 'TelegramStars', isRenewed: true },
    { telegramId: BigInt(829103847), username: 'farhan_biz', first_name: 'Mohammed', last_name: 'Farhan', status: SubscriptionStatus.EXPIRED, daysRemaining: -12, method: 'Stars', provider: 'TelegramStars' },
    { telegramId: BigInt(910293848), username: 'deepak_k', first_name: 'Deepak', last_name: 'Kumar', status: SubscriptionStatus.EXPIRED, daysRemaining: -25, method: 'Stars', provider: 'TelegramStars' },
    { telegramId: BigInt(102938475), username: 'riya_sen', first_name: 'Riya', last_name: 'Sen', status: SubscriptionStatus.PENDING, daysRemaining: 0, method: 'Stars', provider: 'TelegramStars' },
    { telegramId: BigInt(119283746), username: 'vishnu_raj', first_name: 'Vishnu', last_name: 'Raj', status: SubscriptionStatus.PENDING, daysRemaining: 0, method: 'Stars', provider: 'TelegramStars' },
    { telegramId: BigInt(128374659), username: 'meera_nambiar', first_name: 'Meera', last_name: 'Nambiar', status: SubscriptionStatus.ACTIVE, daysRemaining: 18, method: 'Stars', provider: 'TelegramStars', isRefunded: true },
  ];

  const now = new Date();

  for (let i = 0; i < studentsSeed.length; i++) {
    const s = studentsSeed[i];

    // Create Student
    const student = await prisma.student.upsert({
      where: { telegram_user_id: s.telegramId },
      update: {
        username: s.username,
        first_name: s.first_name,
        last_name: s.last_name,
        is_active: true,
      },
      create: {
        telegram_user_id: s.telegramId,
        username: s.username,
        first_name: s.first_name,
        last_name: s.last_name,
        is_active: true,
        created_at: new Date(now.getTime() - (30 - i * 2) * 86400000),
      },
    });

    if (s.status === SubscriptionStatus.ACTIVE || s.status === SubscriptionStatus.EXPIRED) {
      const periodStart = new Date(now.getTime() - (30 - s.daysRemaining) * 86400000);
      const periodEnd = new Date(now.getTime() + s.daysRemaining * 86400000);

      // Create Subscription
      const sub = await prisma.subscription.create({
        data: {
          student_id: student.id,
          plan_id: allAccessPlan.id,
          status: s.status,
          price: 500,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          started_at: periodStart,
          created_at: periodStart,
        },
      });

      // Create Payment
      const paymentStatus = s.isRefunded ? 'REFUNDED' : 'SUCCESS';
      const payment = await prisma.payment.create({
        data: {
          student_id: student.id,
          subscription_id: sub.id,
          amount: 500,
          currency: 'XTR',
          status: paymentStatus,
          provider: s.provider,
          payment_method: s.method,
          provider_order_id: `star_inv_${Date.now()}_${i}`,
          provider_payment_id: `star_charge_${Date.now()}_${i}`,
          paid_at: periodStart,
          created_at: periodStart,
        },
      });

      // If refunded
      if (s.isRefunded) {
        await prisma.refund.create({
          data: {
            payment_id: payment.id,
            student_id: student.id,
            amount: 500,
            percentage: 100,
            reason: 'Accidental double payment request',
            status: 'COMPLETED',
            provider_refund_id: `star_rfnd_${Date.now()}_${i}`,
            requested_at: new Date(now.getTime() - 2 * 86400000),
            processed_at: new Date(now.getTime() - 1 * 86400000),
          },
        });
      }

      // If renewed
      if (s.isRenewed) {
        await prisma.subscriptionRenewal.create({
          data: {
            subscription_id: sub.id,
            payment_id: payment.id,
            student_id: student.id,
            amount: 500,
            status: 'SUCCESS',
            previous_end_at: new Date(periodStart.getTime()),
            new_end_at: periodEnd,
            created_at: periodStart,
          },
        });
      }

      // Add Content Progress & Logs for Active Students
      if (s.status === SubscriptionStatus.ACTIVE && createdContents.length > 0) {
        const randomContent1 = createdContents[i % createdContents.length];
        const randomContent2 = createdContents[(i + 1) % createdContents.length];

        await prisma.contentProgress.createMany({
          data: [
            {
              student_id: student.id,
              content_id: randomContent1.id,
              completed: true,
              opened: true,
              last_position: 120,
              last_accessed: new Date(now.getTime() - (i + 1) * 3600000),
            },
            {
              student_id: student.id,
              content_id: randomContent2.id,
              completed: false,
              opened: true,
              last_position: 45,
              last_accessed: new Date(now.getTime() - (i + 2) * 3600000),
            },
          ],
          skipDuplicates: true,
        });

        await prisma.mediaAccessLog.create({
          data: {
            student_id: student.id,
            content_id: randomContent1.id,
            ip: '49.37.12.84',
            user_agent: 'TelegramBot/1.0',
            issued_at: new Date(now.getTime() - (i + 1) * 3600000),
          },
        });
      }
    }
  }

  // 6. Account Audit Logs
  await prisma.accountAuditLog.createMany({
    data: [
      {
        admin_user_id: admin.id,
        admin_email: 'admin@admin.com',
        action: 'SUBSCRIPTION_EXTENDED',
        entity: 'Subscription',
        entity_id: 'sub_sample_1',
        previous_value: { days: 0 },
        new_value: { days: 30 },
        reason: 'Manual extension granted via Admin Dashboard',
        created_at: new Date(now.getTime() - 24 * 3600000),
      },
      {
        admin_user_id: admin.id,
        admin_email: 'admin@admin.com',
        action: 'REFUND_PROCESSED',
        entity: 'Refund',
        entity_id: 'rfnd_sample_1',
        previous_value: { status: 'PENDING' },
        new_value: { status: 'COMPLETED' },
        reason: 'Customer requested refund within 24h grace window',
        created_at: new Date(now.getTime() - 48 * 3600000),
      },
    ],
  });

  console.log('✅ Students, Subscriptions, Payments, Renewals, Refunds & Audit Logs populated!');

  // 10. Course Bundles for Sales Agent
  const allContents = await prisma.content.findMany({ select: { id: true, title: true } });
  const aiContents = allContents.filter(c => c.title.toLowerCase().includes('ai') || c.title.toLowerCase().includes('bot'));
  const salesContents = allContents.filter(c => c.title.toLowerCase().includes('sales') || c.title.toLowerCase().includes('b2b'));

  const bundleAllAccess = await prisma.courseBundle.upsert({
    where: { slug: 'all_access_mastery' },
    update: {},
    create: {
      slug: 'all_access_mastery',
      name: 'Full University All-Access Pass',
      description: 'Comprehensive access to all premium video, audio, and text courses covering AI Automation, B2B Sales, Marketing, and Design.',
      benefits: [
        'Instant 24/7 access to all 13+ flagship masterclasses',
        'Direct streaming in Telegram Service Bot with offline caching',
        'Weekly live Q&A sessions with industry mentors',
        'Official Verified Completion Certificate'
      ],
      outcomes: [
        'Deploy production-ready AI agents and bots',
        'Close high-ticket sales deals with structured objection handling',
        'Build scalable design systems & financial projections'
      ],
      price_stars: 500,
      currency: 'XTR',
      duration_days: 30,
      plan_id: allAccessPlan.id,
      is_active: true,
    },
  });

  const bundleAi = await prisma.courseBundle.upsert({
    where: { slug: 'ai_automation_accelerator' },
    update: {},
    create: {
      slug: 'ai_automation_accelerator',
      name: 'AI & Automation Accelerator',
      description: 'Master AI Agent pipelines, Telegram bot production architectures, and LangChain systems.',
      benefits: [
        'Hands-on code repositories and deployment templates',
        'Streamable video masterclasses and audio briefings',
        'Automated progress tracking inside Telegram'
      ],
      outcomes: [
        'Architect enterprise Telegram bots from scratch',
        'Integrate LLM tool calling and persistent agent memory'
      ],
      price_stars: 250,
      currency: 'XTR',
      duration_days: 30,
      plan_id: allAccessPlan.id,
      is_active: true,
    },
  });

  const bundleSales = await prisma.courseBundle.upsert({
    where: { slug: 'sales_closing_bootcamp' },
    update: {},
    create: {
      slug: 'sales_closing_bootcamp',
      name: 'High-Ticket B2B Sales Bootcamp',
      description: 'Prospecting, qualification, objection handling, and closing frameworks for founders and sales reps.',
      benefits: [
        'Audio roleplays and real sales call breakdowns',
        'Cheat sheets and script templates in PDF/Text format',
        'Step-by-step objection handling playbook'
      ],
      outcomes: [
        'Consistently book qualified prospect meetings',
        'Increase closing rates on enterprise deals'
      ],
      price_stars: 250,
      currency: 'XTR',
      duration_days: 30,
      plan_id: allAccessPlan.id,
      is_active: true,
    },
  });

  // Link bundle items
  for (const item of allContents) {
    await prisma.courseBundleItem.upsert({
      where: {
        bundle_id_content_id: {
          bundle_id: bundleAllAccess.id,
          content_id: item.id,
        },
      },
      update: {},
      create: {
        bundle_id: bundleAllAccess.id,
        content_id: item.id,
      },
    });
  }

  for (const item of aiContents) {
    await prisma.courseBundleItem.upsert({
      where: {
        bundle_id_content_id: {
          bundle_id: bundleAi.id,
          content_id: item.id,
        },
      },
      update: {},
      create: {
        bundle_id: bundleAi.id,
        content_id: item.id,
      },
    });
  }

  for (const item of salesContents) {
    await prisma.courseBundleItem.upsert({
      where: {
        bundle_id_content_id: {
          bundle_id: bundleSales.id,
          content_id: item.id,
        },
      },
      update: {},
      create: {
        bundle_id: bundleSales.id,
        content_id: item.id,
      },
    });
  }

  // 11. Marketing Campaigns
  await prisma.salesCampaign.upsert({
    where: { code: 'alpha' },
    update: {},
    create: {
      code: 'alpha',
      name: 'Official Marketing Group Alpha',
      description: 'Primary trigger campaign in official Telegram marketing group',
      bundle_id: bundleAllAccess.id,
      is_active: true,
    },
  });

  await prisma.salesCampaign.upsert({
    where: { code: 'aihub' },
    update: {},
    create: {
      code: 'aihub',
      name: 'AI Engineers & Builders Community',
      description: 'Targeted promotion for AI & Automation accelerator',
      bundle_id: bundleAi.id,
      is_active: true,
    },
  });

  await prisma.salesCampaign.upsert({
    where: { code: 'salespro' },
    update: {},
    create: {
      code: 'salespro',
      name: 'Sales Professionals Group',
      description: 'Targeted promotion for B2B Sales Bootcamp',
      bundle_id: bundleSales.id,
      is_active: true,
    },
  });

  console.log('✅ Course Bundles, Bundle Items & Marketing Campaigns seeded successfully!');
  console.log('🎉 Seeding complete successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error during seeding:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

