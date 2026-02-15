import { DEFAULT_SIZE_MAPPING, SCHEMA_VERSION } from './constants';

export function createSampleProduct() {
  const now = new Date().toISOString();
  const productId = crypto.randomUUID();

  // Releases
  const releases = [
    { id: crypto.randomUUID(), name: 'Release 1 - MVP', order: 1, description: 'Core billing functionality', targetDate: '2025-06-30' },
    { id: crypto.randomUUID(), name: 'Release 2', order: 2, description: 'Enhanced invoicing and customer features', targetDate: '2025-09-30' },
    { id: crypto.randomUUID(), name: 'Release 3', order: 3, description: 'Reporting and analytics', targetDate: '2025-12-31' },
    { id: crypto.randomUUID(), name: 'Release 4 - Future', order: 4, description: 'Advanced features and integrations', targetDate: '2026-03-31' },
  ];

  // Sprints (2-week cadence starting Jan 5 2026)
  const sprints = [
    { id: crypto.randomUUID(), name: 'Sprint 1', order: 1, endDate: '2026-01-16' },
    { id: crypto.randomUUID(), name: 'Sprint 2', order: 2, endDate: '2026-01-30' },
    { id: crypto.randomUUID(), name: 'Sprint 3', order: 3, endDate: '2026-02-13' },
    { id: crypto.randomUUID(), name: 'Sprint 4', order: 4, endDate: '2026-02-27' },
  ];

  // progress entries: [sprintIdx, releaseIdx, percentComplete, comment?]
  function makeRib(name, size, category, allocations, progress) {
    return {
      id: crypto.randomUUID(),
      name,
      description: '',
      order: 0,
      size,
      category: category || 'core',
      releaseAllocations: allocations.map(([relIdx, pct, memo]) => ({
        releaseId: releases[relIdx].id,
        percentage: pct,
        memo: memo || '',
      })),
      progressHistory: progress.map(([spIdx, relIdx, pct, comment]) => ({
        sprintId: sprints[spIdx].id,
        releaseId: releases[relIdx].id,
        percentComplete: pct,
        ...(comment ? { comment, updatedAt: sprints[spIdx].endDate + 'T17:00:00.000Z' } : {}),
      })),
    };
  }

  const themes = [
    {
      id: crypto.randomUUID(),
      name: 'Customer Management',
      order: 1,
      color: 'blue',
      backboneItems: [
        {
          id: crypto.randomUUID(),
          name: 'Customer Onboarding',
          description: 'New customer registration and setup workflows',
          order: 1,
          ribItems: [
            makeRib('Customer Registration Form', 'M', 'core', [[0, 100]], [[0, 0, 30], [1, 0, 70], [2, 0, 100]]),
            makeRib('Customer Verification', 'S', 'core', [[0, 100]], [
              [0, 0, 20, 'Email verification endpoint scaffolded'],
              [1, 0, 50], [2, 0, 80, 'Email flow done, SMS pending'],
              [3, 0, 100, 'All verification channels live'],
            ]),
            makeRib('Welcome Email Flow', 'XS', 'non-core', [[1, 100]], [[2, 1, 40], [3, 1, 60]]),
            makeRib('Bulk Customer Import', 'L', 'core', [[0, 60, 'Core import engine and CSV parsing'], [1, 40, 'Error handling and edge cases']], [
              [0, 0, 10, 'Started CSV parser implementation'],
              [1, 0, 30, 'Parser complete, working on validation rules'],
              [2, 0, 50, 'Validation done, integration tests passing'],
              [3, 0, 60, 'R1 import engine complete, all core tests passing'],
              [3, 1, 5, 'Started edge case handling for R2'],
            ]),
            makeRib('Customer Self-Service Portal', 'XL', 'non-core', [[2, 100]], []),
          ].map((r, i) => ({ ...r, order: i + 1 })),
        },
        {
          id: crypto.randomUUID(),
          name: 'Customer Profiles',
          description: 'Customer data management and profile features',
          order: 2,
          ribItems: [
            makeRib('Basic Profile Management', 'M', 'core', [[0, 100]], [[0, 0, 50], [1, 0, 90], [2, 0, 100]]),
            makeRib('Contact History', 'S', 'core', [[0, 100]], [[1, 0, 30], [2, 0, 60], [3, 0, 85]]),
            makeRib('Customer Notes & Tags', 'S', 'non-core', [[1, 100]], [[2, 1, 20], [3, 1, 45]]),
            makeRib('Customer Merge/Dedup', 'L', 'core', [[2, 100]], []),
          ].map((r, i) => ({ ...r, order: i + 1 })),
        },
        {
          id: crypto.randomUUID(),
          name: 'Customer Communications',
          description: 'Customer notifications and messaging',
          order: 3,
          ribItems: [
            makeRib('Email Notifications', 'M', 'core', [[0, 100]], [[0, 0, 15], [1, 0, 45], [2, 0, 75], [3, 0, 90]]),
            makeRib('SMS Notifications', 'M', 'non-core', [[2, 100]], []),
            makeRib('Communication Preferences', 'S', 'core', [[1, 100]], [[2, 1, 30], [3, 1, 55]]),
          ].map((r, i) => ({ ...r, order: i + 1 })),
        },
      ],
    },
    {
      id: crypto.randomUUID(),
      name: 'Invoicing & Payments',
      color: 'teal',
      order: 2,
      backboneItems: [
        {
          id: crypto.randomUUID(),
          name: 'Invoice Generation',
          description: 'Creating and managing invoices',
          order: 1,
          ribItems: [
            makeRib('Basic Invoice Creation', 'L', 'core', [[0, 100]], [
              [0, 0, 20], [1, 0, 55, 'Core invoice model and API done'],
              [2, 0, 80, 'Line items and tax calc integrated'],
              [3, 0, 95, 'Final validation edge cases remaining'],
            ]),
            makeRib('Invoice Templates', 'M', 'core', [[0, 70, 'Base templates and layout engine'], [1, 30, 'Custom template editor']], [
              [0, 0, 10],              // S1: R1=10
              [1, 0, 40],              // S2: R1=40
              [2, 0, 65],              // S3: R1=65
              [3, 0, 70], [3, 1, 10],  // S4: R1=70 (capped), R2=10
            ]),
            makeRib('Recurring Invoices', 'L', 'core', [[1, 100]], [[2, 1, 15], [3, 1, 30]]),
            makeRib('Credit Notes', 'M', 'core', [[1, 100]], [[2, 1, 10], [3, 1, 25]]),
            makeRib('Multi-Currency Support', 'XL', 'non-core', [[3, 100]], []),
            makeRib('Invoice PDF Export', 'S', 'core', [[0, 100]], [[0, 0, 40], [1, 0, 80], [2, 0, 100]]),
          ].map((r, i) => ({ ...r, order: i + 1 })),
        },
        {
          id: crypto.randomUUID(),
          name: 'Payment Processing',
          description: 'Handling payments and payment methods',
          order: 2,
          ribItems: [
            makeRib('Payment Recording', 'L', 'core', [[0, 100]], [[0, 0, 10], [1, 0, 35], [2, 0, 60], [3, 0, 75]]),
            makeRib('Online Payment Gateway', 'XXL', 'core', [[1, 50, 'Stripe integration and basic flow'], [2, 50, 'PayPal, retry logic, and webhooks']], [
              [2, 1, 10],              // S3: R2=10
              [3, 1, 20],              // S4: R2=20
            ]),
            makeRib('Payment Reminders', 'M', 'core', [[1, 100]], [[2, 1, 25], [3, 1, 50]]),
            makeRib('Refund Processing', 'L', 'core', [[2, 100]], []),
            makeRib('Payment Plans', 'XL', 'non-core', [[3, 100]], []),
          ].map((r, i) => ({ ...r, order: i + 1 })),
        },
        {
          id: crypto.randomUUID(),
          name: 'Tax Management',
          description: 'Tax calculation and compliance',
          order: 3,
          ribItems: [
            makeRib('Basic Tax Calculations', 'M', 'core', [[0, 100]], [[0, 0, 25], [1, 0, 60], [2, 0, 90], [3, 0, 100]]),
            makeRib('Tax Rate Configuration', 'S', 'core', [[0, 100]], [[0, 0, 50], [1, 0, 100]]),
            makeRib('Tax Reporting', 'L', 'non-core', [[2, 100]], []),
          ].map((r, i) => ({ ...r, order: i + 1 })),
        },
      ],
    },
    {
      id: crypto.randomUUID(),
      name: 'Reporting & Analytics',
      color: 'violet',
      order: 3,
      backboneItems: [
        {
          id: crypto.randomUUID(),
          name: 'Management Reports',
          description: 'Standard business reports',
          order: 1,
          ribItems: [
            makeRib('Revenue Dashboard', 'L', 'core', [[1, 60, 'Core charts and KPIs'], [2, 40, 'Drill-down and filtering']], [
              [2, 1, 10],              // S3: R2=10
              [3, 1, 20],              // S4: R2=20
            ]),
            makeRib('Accounts Receivable Report', 'M', 'core', [[2, 100]], []),
            makeRib('Customer Aging Report', 'M', 'core', [[2, 100]], []),
            makeRib('Custom Report Builder', 'XXL', 'non-core', [[3, 100]], []),
          ].map((r, i) => ({ ...r, order: i + 1 })),
        },
        {
          id: crypto.randomUUID(),
          name: 'Data Export',
          description: 'Data export and integration features',
          order: 2,
          ribItems: [
            makeRib('CSV Export', 'S', 'core', [[1, 100]], [[2, 1, 50], [3, 1, 80]]),
            makeRib('API Integration', 'XXXL', 'non-core', [[3, 100]], []),
            makeRib('Scheduled Reports', null, 'non-core', [], []),
            makeRib('Data Warehouse Sync', null, 'non-core', [], []),
          ].map((r, i) => ({ ...r, order: i + 1 })),
        },
      ],
    },
  ];

  return {
    id: productId,
    name: 'Billing System v2',
    description: 'Complete overhaul of the billing and invoicing system with improved customer management, payment processing, and reporting capabilities.',
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
    sizeMapping: [...DEFAULT_SIZE_MAPPING],
    releases,
    sprints,
    sprintCadenceWeeks: 2,
    themes,
  };
}
