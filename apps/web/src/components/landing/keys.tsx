import { KEYS } from './content';
import { H2, ITEM } from './grid';

export function Keys() {
  return (
    <section aria-labelledby="keys-title">
      <h2 id="keys-title" className={H2}>
        {KEYS.title}
      </h2>
      <dl className="mt-8 border-t border-ink md:mt-10 wide:mt-[72px]">
        {KEYS.rows.map((row) => (
          <div
            key={row.label}
            className="grid gap-1 border-b border-rule py-3.5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-baseline sm:gap-x-6"
          >
            <dt className="text-sm font-semibold text-ash">{row.label}</dt>
            <dd className="text-pretty text-[17px] leading-[1.45] text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
      <ul role="list" className="mt-6 list-none">
        {KEYS.lines.map((line) => (
          <li key={line} className={ITEM}>
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
