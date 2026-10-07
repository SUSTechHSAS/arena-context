import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { App } from '../src/App';

it('demo renders 49 accessible map cells, scope notice and license', () => {
  const markup = renderToStaticMarkup(createElement(App));
  expect(markup.match(/aria-label="第/g)).toHaveLength(49);
  expect(markup).toContain('不是完整游戏');
  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain('href="/LICENSE.txt"');
});
