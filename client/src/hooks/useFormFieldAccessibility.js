import { useEffect } from 'react';

const FIELD_SELECTOR = 'input, select, textarea';

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function inferFieldKey(field, index) {
  const labelText =
    field
      .closest('label')
      ?.textContent?.trim() ||
    field
      .closest('div')
      ?.querySelector('label')
      ?.textContent?.trim() ||
    '';

  const candidates = [
    field.getAttribute('name'),
    field.getAttribute('id'),
    field.getAttribute('aria-label'),
    field.getAttribute('placeholder'),
    labelText,
    field.getAttribute('type'),
    `${field.tagName.toLowerCase()}_${index + 1}`,
  ];

  for (const candidate of candidates) {
    const normalized = slugify(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return `field_${index + 1}`;
}

function inferAutocompleteValue(field, key) {
  const type = (field.getAttribute('type') || '').toLowerCase();
  const text = `${key} ${field.getAttribute('placeholder') || ''} ${field.getAttribute('aria-label') || ''}`.toLowerCase();

  if (type === 'hidden') return null;
  if (type === 'password') {
    if (text.includes('new') || text.includes('confirm')) return 'new-password';
    return 'current-password';
  }
  if (type === 'email' || text.includes('email')) return 'email';
  if (type === 'tel' || text.includes('phone') || text.includes('mobile') || text.includes('contact')) {
    return 'tel';
  }
  if (text.includes('username') || text.includes('user_name') || text.includes('login')) {
    return 'username';
  }
  if (text.includes('first_name') || text.includes('firstname')) return 'given-name';
  if (text.includes('last_name') || text.includes('lastname') || text.includes('surname')) {
    return 'family-name';
  }
  if (text.includes('full_name') || text.includes('fullname') || text.includes('name')) return 'name';
  if (text.includes('address')) return 'street-address';
  if (text.includes('city')) return 'address-level2';
  if (text.includes('state') || text.includes('province')) return 'address-level1';
  if (text.includes('postal') || text.includes('zip')) return 'postal-code';
  if (text.includes('country')) return 'country';
  if (text.includes('search')) return 'off';

  if (
    type === 'date' ||
    type === 'datetime-local' ||
    type === 'number' ||
    type === 'checkbox' ||
    type === 'radio' ||
    field.tagName.toLowerCase() === 'select' ||
    field.tagName.toLowerCase() === 'textarea'
  ) {
    return 'off';
  }

  return 'on';
}

function applyFieldAccessibilityAttributes(root = document) {
  const forms = root.querySelectorAll('form');

  forms.forEach((form, formIndex) => {
    const formName = slugify(form.getAttribute('name') || form.getAttribute('id') || `form_${formIndex + 1}`);
    const fields = form.querySelectorAll(FIELD_SELECTOR);

    fields.forEach((field, fieldIndex) => {
      if (!(field instanceof HTMLElement)) return;

      const key = inferFieldKey(field, fieldIndex);
      const generatedId = `${formName}_${key}_${fieldIndex + 1}`;
      const generatedName = key;

      if (!field.getAttribute('id')) {
        field.setAttribute('id', generatedId);
      }

      if (!field.getAttribute('name')) {
        field.setAttribute('name', generatedName);
      }

      if (!field.getAttribute('autocomplete')) {
        const autoCompleteValue = inferAutocompleteValue(field, generatedName);
        if (autoCompleteValue) {
          field.setAttribute('autocomplete', autoCompleteValue);
        }
      }
    });
  });
}

export default function useFormFieldAccessibility() {
  useEffect(() => {
    applyFieldAccessibilityAttributes(document);

    const observer = new MutationObserver((mutations) => {
      let shouldRefresh = false;

      for (const mutation of mutations) {
        if (mutation.type !== 'childList') continue;

        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          if (
            node.matches?.('form, input, select, textarea') ||
            node.querySelector?.('form, input, select, textarea')
          ) {
            shouldRefresh = true;
            break;
          }
        }

        if (shouldRefresh) break;
      }

      if (shouldRefresh) {
        applyFieldAccessibilityAttributes(document);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);
}