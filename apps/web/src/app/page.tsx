import { slackFace } from './fonts';
import { Closing } from '@/components/landing/closing';
import { NAV } from '@/components/landing/content';
import { Faq } from '@/components/landing/faq';
import { Footer } from '@/components/landing/footer';
import { C, LINE, SECTION_PAD } from '@/components/landing/grid';
import { Hero, INTRO } from '@/components/landing/hero';
import { IntroDone } from '@/components/landing/intro-done';
import { Keys } from '@/components/landing/keys';
import { Nav, NavSentinel } from '@/components/landing/nav';
import { SayList } from '@/components/landing/say-list';
import { ms } from '@/components/landing/talk';
import { Timeline } from '@/components/landing/timeline';
import { cn } from '@/lib/utils';

// Rendered on the server. The only client code is the nav's scroll rule, the listener that ends the
// first screen's intro early, the observer that plays each step of the meeting as it scrolls into
// view, the sign-in buttons, and the ding. Lato is loaded here and nowhere else, for the Slack mocks.
// --rest is when the nav and everything below the hero arrive (intro-late in globals.css).
export default function Home() {
  return (
    <div className={slackFace.variable} style={ms({ rest: INTRO.rest })}>
      <IntroDone ms={INTRO.end} />
      <Nav signIn={NAV.signIn} start={NAV.start} dashboard={NAV.dashboard} />
      <main id="main">
        <NavSentinel />
        <Hero />
        <Timeline />
        <div className={cn(C, SECTION_PAD)}>
          <div className={cn(LINE, 'grid gap-y-20 wide:grid-cols-2 wide:gap-x-12')}>
            <SayList />
            <Keys />
          </div>
        </div>
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}
