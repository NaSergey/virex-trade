'use client';

import { Fragment, type ReactNode } from 'react';
import type { Block } from '../content/types';
import { Say } from './Say';

/** `*слово*` → жирное: так в материале выделены ключевые формы. */
export function Emph({ text }: { text: string }) {
  const parts = text.split(/\*([^*]+)\*/);
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}

function English({ text }: { text: string }) {
  return (
    <span className="en-phrase">
      <span lang="en">{text}</span>
      <Say text={text} />
    </span>
  );
}

function BlockView({ block }: { block: Block }): ReactNode {
  switch (block.type) {
    case 'p':
      return (
        <p className="en-p">
          <Emph text={block.text} />
        </p>
      );
    case 'note':
      return (
        <aside className="en-note">
          <Emph text={block.text} />
        </aside>
      );
    case 'rule':
      return (
        <div className="en-rule">
          {block.title ? <h4>{block.title}</h4> : null}
          <table>
            <tbody>
              {block.rows.map(([form, example, ru]) => (
                <tr key={form + example}>
                  <th lang="en">{form}</th>
                  <td>
                    <English text={example} />
                  </td>
                  <td className="muted">{ru}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'examples':
      return (
        <ul className="en-examples">
          {block.items.map(([en, ru]) => (
            <li key={en}>
              <English text={en} />
              <span className="muted">{ru}</span>
            </li>
          ))}
        </ul>
      );
    case 'book':
      return (
        <section className="en-book">
          <h4>По книге</h4>
          <ol>
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>
      );
  }
}

export function Blocks({ blocks }: { blocks: readonly Block[] }) {
  return (
    <div className="en-blocks">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}
