import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GlobalLoading from './loading';
import AdminLoading from './admin/loading';
import AiLoading from './ai/loading';
import AccountLoading from './account/loading';

describe('global route fallback', () => {
  it('does not resemble a specific destination page', () => {
    const markup = renderToStaticMarkup(<GlobalLoading />);

    expect(markup).toContain('Loading page');
    expect(markup).not.toContain('metric');
    expect(markup).not.toContain('page-header');
    expect(markup).not.toContain('surface-flat');
  });
});

describe('section route fallbacks', () => {
  it.each([
    ['Admin', AdminLoading],
    ['AI', AiLoading],
    ['Account', AccountLoading],
  ])('identifies the destination section while %s loads', (label, Component) => {
    const markup = renderToStaticMarkup(<Component />);
    expect(markup).toContain(`Loading ${label}`);
    expect(markup).not.toContain('metric');
  });
});
