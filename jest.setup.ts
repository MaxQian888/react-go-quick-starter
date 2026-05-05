/**
 * Jest setup file
 * This file is executed before each test file
 */

import '@testing-library/jest-dom';
import React from 'react';

type MockNextImageProps = React.ComponentPropsWithoutRef<'img'> & {
  priority?: boolean;
  fill?: boolean;
};

// Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: MockNextImageProps) => {
    const normalizedProps = { ...props };
    delete normalizedProps.priority;
    delete normalizedProps.fill;
    return React.createElement('img', normalizedProps);
  },
}));

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      pathname: '/',
      query: {},
      asPath: '/',
    };
  },
  usePathname() {
    return '/';
  },
  useSearchParams() {
    return new URLSearchParams();
  },
}));

// Mock next-intl. Components that use `useTranslations` and friends throw
// without a `NextIntlClientProvider` ancestor; resolving keys against the real
// English bundle keeps tests that assert on visible text working without
// forcing every test to wrap in a provider, and avoids loading next-intl's
// ESM-only build through Jest's transform pipeline.
jest.mock('next-intl', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const messages = require('./i18n/messages/en.json') as Record<string, unknown>;

  const resolvePath = (
    root: Record<string, unknown> | undefined,
    dottedKey: string
  ): unknown => {
    if (!root) return undefined;
    const segments = dottedKey.split('.');
    let cursor: unknown = root;
    for (const seg of segments) {
      if (
        cursor &&
        typeof cursor === 'object' &&
        seg in (cursor as Record<string, unknown>)
      ) {
        cursor = (cursor as Record<string, unknown>)[seg];
      } else {
        return undefined;
      }
    }
    return cursor;
  };

  const interpolate = (template: string, values?: Record<string, unknown>) => {
    if (!values) return template;
    let out = template.replace(
      /\{(\w+),\s*(?:plural|select|selectordinal),\s*([^{}]*\{[^{}]*\}[^{}]*)*\s*other\s*\{([^}]*)\}\s*\}/g,
      (_match, _name, _branches, otherBody) => otherBody
    );
    out = Object.entries(values).reduce(
      (acc, [k, v]) =>
        acc.replace(new RegExp(`\\{\\s*${k}\\s*\\}`, 'g'), String(v)),
      out
    );
    return out;
  };

  const makeTranslator = (namespace?: string) => {
    const root = namespace
      ? (resolvePath(messages, namespace) as
          | Record<string, unknown>
          | undefined)
      : (messages as Record<string, unknown>);
    const t = (key: string, values?: Record<string, unknown>) => {
      const resolved = resolvePath(root, key);
      const template = typeof resolved === 'string' ? resolved : key;
      return interpolate(template, values);
    };
    (t as unknown as { rich: typeof t }).rich = t;
    (t as unknown as { markup: typeof t }).markup = t;
    (t as unknown as { has: (k: string) => boolean }).has = (k: string) =>
      typeof resolvePath(root, k) === 'string';
    return t;
  };

  return {
    useTranslations: (namespace?: string) => makeTranslator(namespace),
    getTranslations: async (namespace?: string) => makeTranslator(namespace),
    useLocale: () => 'en',
    useMessages: () => messages,
    useNow: () => new Date(),
    useTimeZone: () => 'UTC',
    useFormatter: () => ({
      dateTime: (d: Date | number) => new Date(d).toISOString(),
      number: (n: number) => String(n),
      relativeTime: (d: Date | number) => new Date(d).toISOString(),
      list: (items: Iterable<string>) => Array.from(items).join(', '),
    }),
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) =>
      children,
  };
});

// Suppress console errors in tests (optional)
// global.console = {
//   ...console,
//   error: jest.fn(),
//   warn: jest.fn(),
// };

