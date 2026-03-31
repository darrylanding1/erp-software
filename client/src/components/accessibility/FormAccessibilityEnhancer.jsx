import { useEffect } from 'react';

const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea';

const FIELD_CONTAINER_SELECTORS = [
  '[data-form-field]',
  '.form-group',
  '.field',
  '.input-group',
  '.form-control',
  '.control',
  '.space-y-2',
  '.space-y-3',
  '.space-y-4',
  '.space-y-5',
  '.space-y-6',
  '.flex',
  '.grid',
];

function normalizeText(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function slugify(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getFieldText(field, label) {
  return normalizeText(
    [
      field.getAttribute('name'),
      field.getAttribute('id'),
      field.getAttribute('placeholder'),
      field.getAttribute('aria-label'),
      label?.textContent,
    ]
      .filter(Boolean)
      .join(' ')
  );
}

function inferAutocomplete(field, label) {
  const type = normalizeText(field.getAttribute('type'));
  const tag = normalizeText(field.tagName);
  const text = getFieldText(field, label);

  if (type === 'email' || text.includes('email')) return 'email';
  if (type === 'tel' || text.includes('phone') || text.includes('mobile') || text.includes('telephone')) return 'tel';
  if (text.includes('first name') || text.includes('given name')) return 'given-name';
  if (text.includes('last name') || text.includes('surname') || text.includes('family name')) return 'family-name';
  if (text.includes('full name') || text === 'name' || text.includes('customer name') || text.includes('supplier name')) {
    return 'name';
  }
  if (text.includes('username') || text.includes('user name')) return 'username';

  if (type === 'password' || text.includes('password')) {
    if (text.includes('confirm')) return 'new-password';
    if (text.includes('new password')) return 'new-password';
    return 'current-password';
  }

  if (text.includes('search')) return 'search';
  if (text.includes('company') || text.includes('business') || text.includes('organization')) return 'organization';
  if (text.includes('address line 1') || text.includes('street address')) return 'address-line1';
  if (text.includes('address line 2') || text.includes('apartment') || text.includes('suite')) return 'address-line2';
  if (text.includes('city') || text.includes('town')) return 'address-level2';
  if (text.includes('state') || text.includes('province') || text.includes('region')) return 'address-level1';
  if (text.includes('zip') || text.includes('postal')) return 'postal-code';
  if (text.includes('country')) return 'country';

  if (tag === 'textarea') return 'street-address';

  return 'off';
}

function inferBaseName(field, label) {
  const autocomplete = inferAutocomplete(field, label);
  if (autocomplete && autocomplete !== 'off') {
    return autocomplete.replace(/-/g, '_');
  }

  const labelText = slugify(label?.textContent || '');
  if (labelText) return labelText;

  const placeholderText = slugify(field.getAttribute('placeholder') || '');
  if (placeholderText) return placeholderText;

  const type = normalizeText(field.getAttribute('type')) || field.tagName.toLowerCase();
  return type === 'input' ? 'form_field' : `${type}_field`;
}

function generateStableId(field, label, usedIds) {
  const existingId = field.getAttribute('id');
  if (existingId) {
    usedIds.add(existingId);
    return existingId;
  }

  const form = field.closest('form');
  const formName =
    slugify(form?.getAttribute('name') || '') ||
    slugify(form?.getAttribute('id') || '') ||
    'form';

  const base = `${formName}_${inferBaseName(field, label)}`
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  let candidate = base || 'form_field';
  let counter = 1;

  while (document.getElementById(candidate) || usedIds.has(candidate)) {
    counter += 1;
    candidate = `${base || 'form_field'}_${counter}`;
  }

  usedIds.add(candidate);
  return candidate;
}

function getFieldFromLabel(label) {
  if (!label) return null;

  const explicitFor = label.getAttribute('for');
  if (explicitFor) {
    return document.getElementById(explicitFor);
  }

  const nestedField = label.querySelector(FIELD_SELECTOR);
  if (nestedField) return nestedField;

  return null;
}

function findBestLabel(field) {
  const fieldId = field.getAttribute('id');
  if (fieldId) {
    const explicit = document.querySelector(`label[for="${CSS.escape(fieldId)}"]`);
    if (explicit) return explicit;
  }

  const wrapped = field.closest('label');
  if (wrapped) return wrapped;

  if (field.previousElementSibling?.tagName?.toLowerCase() === 'label') {
    return field.previousElementSibling;
  }

  for (const selector of FIELD_CONTAINER_SELECTORS) {
    const container = field.closest(selector);
    if (!container) continue;

    const labels = Array.from(container.querySelectorAll('label')).filter((label) => {
      const boundField = getFieldFromLabel(label);
      return !boundField || boundField === field;
    });

    if (labels.length === 1) {
      return labels[0];
    }
  }

  let parent = field.parentElement;
  let depth = 0;

  while (parent && depth < 3) {
    const labels = Array.from(parent.children).filter(
      (node) => node.tagName?.toLowerCase() === 'label'
    );

    if (labels.length === 1) {
      return labels[0];
    }

    parent = parent.parentElement;
    depth += 1;
  }

  return null;
}

function ensureFieldAccessibility(field, usedIds) {
  if (!(field instanceof HTMLElement)) return;

  const label = findBestLabel(field);
  const id = generateStableId(field, label, usedIds);

  if (!field.getAttribute('id')) {
    field.setAttribute('id', id);
  }

  if (!field.getAttribute('name')) {
    field.setAttribute('name', inferBaseName(field, label));
  }

  if (!field.getAttribute('autocomplete')) {
    field.setAttribute('autocomplete', inferAutocomplete(field, label));
  }

  if (label && !label.getAttribute('for') && !label.querySelector(FIELD_SELECTOR)) {
    label.setAttribute('for', id);
  }

  const hasAssociatedLabel =
    !!document.querySelector(`label[for="${CSS.escape(id)}"]`) || !!field.closest('label');

  if (!hasAssociatedLabel && !field.getAttribute('aria-label')) {
    const fallback =
      field.getAttribute('placeholder') ||
      label?.textContent?.trim() ||
      field.getAttribute('name') ||
      'Form field';

    field.setAttribute('aria-label', fallback);
  }
}

function enhanceForms(root = document) {
  const usedIds = new Set(
    Array.from(document.querySelectorAll('[id]'))
      .map((node) => node.getAttribute('id'))
      .filter(Boolean)
  );

  const fields = root.querySelectorAll ? root.querySelectorAll(FIELD_SELECTOR) : [];
  fields.forEach((field) => ensureFieldAccessibility(field, usedIds));
}

export default function FormAccessibilityEnhancer() {
  useEffect(() => {
    const run = () => enhanceForms(document);

    run();

    const observer = new MutationObserver((mutations) => {
      let shouldRunFullScan = false;

      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
          const target = mutation.target;
          if (target.matches?.(FIELD_SELECTOR) || target.tagName?.toLowerCase() === 'label') {
            shouldRunFullScan = true;
            break;
          }
        }

        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          if (node.matches?.(FIELD_SELECTOR)) {
            shouldRunFullScan = true;
            break;
          }

          if (node.querySelector?.(FIELD_SELECTOR) || node.querySelector?.('label')) {
            shouldRunFullScan = true;
            break;
          }
        }

        if (shouldRunFullScan) break;
      }

      if (shouldRunFullScan) {
        run();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['id', 'name', 'autocomplete', 'for', 'placeholder', 'type'],
    });

    return () => observer.disconnect();
  }, []);

  return null;
}