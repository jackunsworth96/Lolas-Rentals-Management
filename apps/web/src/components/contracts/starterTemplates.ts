import type { CreateContractTemplateRequest } from '@lolas/shared';

/** Example wording to start from; staff are expected to review it before use. */
export const STARTER_CONTRACT_TEMPLATES: CreateContractTemplateRequest[] = [
  {
    name: 'Paw Card Partner Agreement',
    category: 'paw_card_partner',
    description: 'For cafes, restaurants and shops offering a discount to Paw Card holders.',
    isActive: true,
    placeholders: [
      { key: 'partner_name', label: 'Partner business name', type: 'text', required: true, source: 'name' },
      { key: 'partner_contact', label: 'Partner contact person', type: 'text', required: true },
      { key: 'offer', label: 'Offer for Paw Card holders', type: 'multiline', required: true, source: 'discount_headline' },
      { key: 'offer_conditions', label: 'Offer conditions', type: 'multiline', required: false, source: 'discount_conditions' },
      { key: 'start_date', label: 'Start date', type: 'date', required: true },
      { key: 'end_date', label: 'End date', type: 'date', required: true },
      { key: 'special_terms', label: 'Special terms', type: 'multiline', required: false },
    ],
    bodyMarkdown: `# Paw Card Partner Agreement

This agreement is made on {{today}} between **Lola's Rentals** ("Lola's") and **{{partner_name}}** ("the Partner"), represented by {{partner_contact}}.

## 1. The offer

The Partner agrees to give every valid Paw Card holder the following offer:

**{{offer}}**

{{offer_conditions}}

## 2. Term

This agreement starts on {{start_date}} and continues until {{end_date}}, unless either side ends it earlier with 30 days' written notice.

## 3. What Lola's will do

- List the Partner on the Paw Card partners page and in printed materials.
- Promote the Partner to Lola's customers.
- Report savings logged by Paw Card holders on request.

## 4. What the Partner will do

- Honour the offer for any customer showing a valid Paw Card.
- Tell Lola's in writing at least 14 days before changing the offer.
- Allow Lola's to use the Partner's name and logo to promote the Paw Card.

## 5. Special terms

{{special_terms}}

## 6. General

Either side may end this agreement with 30 days' written notice. This agreement is governed by the laws of the Republic of the Philippines.
`,
  },
  {
    name: 'Accommodation Partner Agreement',
    category: 'accommodation_partner',
    description: 'Referral and commission terms for hotels, resorts and hostels.',
    isActive: true,
    placeholders: [
      { key: 'partner_name', label: 'Accommodation name', type: 'text', required: true, source: 'name' },
      { key: 'partner_contact', label: 'Contact person', type: 'text', required: true, source: 'contact_name' },
      { key: 'commission', label: 'Commission per booking', type: 'text', required: true, source: 'commission_value' },
      { key: 'payment_terms', label: 'Payment terms', type: 'multiline', required: true, defaultValue: 'Commission is paid monthly, within 15 days of the end of each month, for completed rentals.' },
      { key: 'start_date', label: 'Start date', type: 'date', required: true },
    ],
    bodyMarkdown: `# Accommodation Partner Agreement

This agreement is made on {{today}} between **Lola's Rentals** ("Lola's") and **{{partner_name}}** ("the Partner"), represented by {{partner_contact}}.

## 1. Referrals

The Partner will recommend Lola's to its guests and share its partner booking link. Bookings made through the link, or confirmed by Lola's as referred by the Partner, count as Partner referrals.

## 2. Commission

Lola's will pay the Partner **{{commission}}** for each completed rental referred by the Partner.

{{payment_terms}}

## 3. Term

This agreement starts on {{start_date}} and continues until either side ends it with 30 days' written notice.

## 4. Conduct

- The Partner will describe Lola's services accurately to guests.
- Lola's is responsible for the rental contract with each customer.
- Neither side may commit the other to any obligation without written consent.

## 5. General

This agreement is governed by the laws of the Republic of the Philippines.
`,
  },
  {
    name: 'Employment Contract',
    category: 'staff',
    description: 'Standard employment terms for new staff.',
    isActive: true,
    placeholders: [
      { key: 'employee_name', label: 'Employee full name', type: 'text', required: true, source: 'full_name' },
      { key: 'position', label: 'Position', type: 'text', required: true, source: 'role' },
      { key: 'start_date', label: 'Start date', type: 'date', required: true, source: 'start_date' },
      { key: 'probation_end_date', label: 'Probation end date', type: 'date', required: true, source: 'probation_end_date' },
      { key: 'rate', label: 'Pay rate', type: 'money', required: true, source: 'basic_rate' },
      { key: 'rate_period', label: 'Pay period (daily / monthly)', type: 'text', required: true, source: 'rate_type' },
      { key: 'work_location', label: 'Work location', type: 'text', required: true, source: 'store_name' },
      { key: 'duties', label: 'Main duties', type: 'multiline', required: true },
    ],
    bodyMarkdown: `# Employment Contract

This contract is made on {{today}} between **Lola's Rentals** ("the Employer") and **{{employee_name}}** ("the Employee").

## 1. Position and start date

The Employee is employed as **{{position}}** at {{work_location}}, starting on {{start_date}}.

## 2. Probation

The Employee will be on probation until {{probation_end_date}}. Regular employment depends on meeting the standards explained at the start of employment.

## 3. Pay

The Employee will be paid **{{rate}}** ({{rate_period}}), less statutory deductions (SSS, PhilHealth, Pag-IBIG and withholding tax).

## 4. Duties

{{duties}}

## 5. Conduct and confidentiality

- The Employee will follow the Employer's policies and reasonable instructions.
- The Employee will keep customer and business information confidential during and after employment.

## 6. General

This contract is governed by the Labor Code of the Philippines.
`,
  },
];
