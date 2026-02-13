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

  // Sprints
  const sprints = [
    { id: crypto.randomUUID(), name: 'Sprint 1', order: 1, endDate: '2025-04-11' },
    { id: crypto.randomUUID(), name: 'Sprint 2', order: 2, endDate: '2025-04-25' },
    { id: crypto.randomUUID(), name: 'Sprint 3', order: 3, endDate: '2025-05-09' },
    { id: crypto.randomUUID(), name: 'Sprint 4', order: 4, endDate: '2025-05-23' },
  ];

  function makeRib(name, size, category, allocations, progress) {
    return {
      id: crypto.randomUUID(),
      name,
      description: '',
      order: 0,
      size,
      category: category || 'core',
      releaseAllocations: allocations.map(([relIdx, pct]) => ({
        releaseId: releases[relIdx].id,
        percentage: pct,
      })),
      progressHistory: progress.map(([spIdx, pct]) => ({
        sprintId: sprints[spIdx].id,
        percentComplete: pct,
      })),
    };
  }

  const themes = [
    {
      id: crypto.randomUUID(),
      name: 'Customer Management',
      order: 1,
      backboneItems: [
        {
          id: crypto.randomUUID(),
          name: 'Customer Onboarding',
          description: 'New customer registration and setup workflows',
          order: 1,
          ribItems: [
            makeRib('Customer Registration Form', 'M', 'core', [[0, 100]], [[0, 30], [1, 70], [2, 100]]),
            makeRib('Customer Verification', 'S', 'core', [[0, 100]], [[0, 20], [1, 50], [2, 80], [3, 100]]),
            makeRib('Welcome Email Flow', 'XS', 'non-core', [[1, 100]], [[2, 40], [3, 60]]),
            makeRib('Bulk Customer Import', 'L', 'core', [[0, 60], [1, 40]], [[0, 10], [1, 30], [2, 50], [3, 65]]),
            makeRib('Customer Self-Service Portal', 'XL', 'non-core', [[2, 100]], []),
          ].map((r, i) => ({ ...r, order: i + 1 })),
        },
        {
          id: crypto.randomUUID(),
          name: 'Customer Profiles',
          description: 'Customer data management and profile features',
          order: 2,
          ribItems: [
            makeRib('Basic Profile Management', 'M', 'core', [[0, 100]], [[0, 50], [1, 90], [2, 100]]),
            makeRib('Contact History', 'S', 'core', [[0, 100]], [[1, 30], [2, 60], [3, 85]]),
            makeRib('Customer Notes & Tags', 'S', 'non-core', [[1, 100]], [[2, 20], [3, 45]]),
            makeRib('Customer Merge/Dedup', 'L', 'core', [[2, 100]], []),
          ].map((r, i) => ({ ...r, order: i + 1 })),
        },
        {
          id: crypto.randomUUID(),
          name: 'Customer Communications',
          description: 'Customer notifications and messaging',
          order: 3,
          ribItems: [
            makeRib('Email Notifications', 'M', 'core', [[0, 100]], [[0, 15], [1, 45], [2, 75], [3, 90]]),
            makeRib('SMS Notifications', 'M', 'non-core', [[2, 100]], []),
            makeRib('Communication Preferences', 'S', 'core', [[1, 100]], [[2, 30], [3, 55]]),
          ].map((r, i) => ({ ...r, order: i + 1 })),
        },
      ],
    },
    {
      id: crypto.randomUUID(),
      name: 'Invoicing & Payments',
      order: 2,
      backboneItems: [
        {
          id: crypto.randomUUID(),
          name: 'Invoice Generation',
          description: 'Creating and managing invoices',
          order: 1,
          ribItems: [
            makeRib('Basic Invoice Creation', 'L', 'core', [[0, 100]], [[0, 20], [1, 55], [2, 80], [3, 95]]),
            makeRib('Invoice Templates', 'M', 'core', [[0, 70], [1, 30]], [[0, 10], [1, 40], [2, 65], [3, 80]]),
            makeRib('Recurring Invoices', 'L', 'core', [[1, 100]], [[2, 15], [3, 30]]),
            makeRib('Credit Notes', 'M', 'core', [[1, 100]], [[2, 10], [3, 25]]),
            makeRib('Multi-Currency Support', 'XL', 'non-core', [[3, 100]], []),
            makeRib('Invoice PDF Export', 'S', 'core', [[0, 100]], [[0, 40], [1, 80], [2, 100]]),
          ].map((r, i) => ({ ...r, order: i + 1 })),
        },
        {
          id: crypto.randomUUID(),
          name: 'Payment Processing',
          description: 'Handling payments and payment methods',
          order: 2,
          ribItems: [
            makeRib('Payment Recording', 'L', 'core', [[0, 100]], [[0, 10], [1, 35], [2, 60], [3, 75]]),
            makeRib('Online Payment Gateway', 'XXL', 'core', [[1, 50], [2, 50]], [[2, 10], [3, 20]]),
            makeRib('Payment Reminders', 'M', 'core', [[1, 100]], [[2, 25], [3, 50]]),
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
            makeRib('Basic Tax Calculations', 'M', 'core', [[0, 100]], [[0, 25], [1, 60], [2, 90], [3, 100]]),
            makeRib('Tax Rate Configuration', 'S', 'core', [[0, 100]], [[0, 50], [1, 100]]),
            makeRib('Tax Reporting', 'L', 'non-core', [[2, 100]], []),
          ].map((r, i) => ({ ...r, order: i + 1 })),
        },
      ],
    },
    {
      id: crypto.randomUUID(),
      name: 'Reporting & Analytics',
      order: 3,
      backboneItems: [
        {
          id: crypto.randomUUID(),
          name: 'Management Reports',
          description: 'Standard business reports',
          order: 1,
          ribItems: [
            makeRib('Revenue Dashboard', 'L', 'core', [[1, 60], [2, 40]], [[2, 10], [3, 20]]),
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
            makeRib('CSV Export', 'S', 'core', [[1, 100]], [[2, 50], [3, 80]]),
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
    themes,
  };
}
