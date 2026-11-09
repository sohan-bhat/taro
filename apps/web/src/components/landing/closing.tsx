import { HeardText, TranscriptRow } from '@/components/exchange';
import { PrimaryCta } from '@/components/sign-in';
import { CLOSING } from './content';
import { C } from './grid';

const SAID = 'said text-balance text-[clamp(1.75rem,1.2218rem+2.2535vw,3.25rem)] font-530 leading-[1.06] tracking-[-0.012em] text-white';
const ANSWER = 'text-balance text-[clamp(1.25rem,1.0739rem+0.7512vw,1.75rem)] font-750 leading-[1.15] tracking-[-0.025em] text-white';

export function Closing() {
  return (
    <section aria-label={CLOSING.label} className="on-taro mt-[88px] bg-taro py-16 text-white wide:mt-[120px] wide:py-24">
      <div className={C}>
        <h2>
          <TranscriptRow as="span" who="You" hideName>
            <span className={SAID}>
              <HeardText text={CLOSING.said} />
            </span>
          </TranscriptRow>
        </h2>
        <TranscriptRow who="Taro" taro hideName className="mt-4">
          <p className={ANSWER}>{CLOSING.answer}</p>
        </TranscriptRow>
        <div className="ml-14 mt-8 md:ml-28">
          <PrimaryCta variant="inverse" size="lg" className="w-full sm:w-auto" />
        </div>
      </div>
    </section>
  );
}
