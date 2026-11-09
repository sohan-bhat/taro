import { SAY } from './content';
import { GROUP, H2, ITEM } from './grid';

export function SayList() {
  return (
    <section aria-labelledby="say-title">
      <h2 id="say-title" className={H2}>
        {SAY.title}
      </h2>
      <div className="mt-8 grid gap-y-8 md:mt-10">
        {SAY.groups.map((group, g) => (
          <section key={group.title} aria-labelledby={`say-group-${g}`}>
            <h3 id={`say-group-${g}`} className={GROUP}>
              {group.title}
            </h3>
            <ul role="list" className="mt-3 list-none columns-2 gap-x-6 max-[359px]:columns-1 md:gap-x-8">
              {group.items.map((item) => (
                <li key={item} className={`${ITEM} break-inside-avoid`}>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
