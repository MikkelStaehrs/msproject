import Link from 'next/link'
import { Rule, StatusMark } from '@/components/ui'
import {
  COST_KINDS,
  COST_KIND_HINT,
  COST_KIND_LABEL,
  COST_STATES,
  COST_STATE_HINT,
  COST_STATE_LABEL,
  DECISION_TOPICS,
  DECISION_TOPIC_HINT,
  DECISION_TOPIC_LABEL,
  STATUS_LABEL,
  TYPE_HINT,
  TYPE_LABEL,
  type NodeStatus,
  type NodeType,
} from '@/lib/types'

export const metadata = { title: 'Guide' }

/**
 * How to use the thing, kept where you are when you need it.
 *
 * It lives in the app rather than in a file next to MASTER.md for the same
 * reason everything else is derived: two copies of the same explanation drift,
 * and the one in the repository is the one you would never open mid-week.
 *
 * MASTER.md says why the app is built the way it is. This says what to do.
 */

/**
 * Grouped, because a flat list of twenty three is a list you scroll past. The
 * headings are the same question a reader arrives with: where do I put this,
 * what does this node mean, what does it rest on, who am I showing it to.
 */
const SECTIONS = [
  ['Getting around', [
    ['start', 'Where to start'],
    ['quick', 'Quick entry'],
    ['tree', 'The tree'],
    ['writing', 'Writing it down'],
  ]],
  ['What a node says', [
    ['types', 'Types'],
    ['status', 'Status'],
    ['stuck', 'Blocked, on hold, not ready'],
    ['blockers', 'Blockers'],
    ['sequence', 'Sequence'],
    ['dates', 'Dates and milestones'],
    ['estimates', 'Estimates'],
    ['roles', 'Who does what'],
  ]],
  ['What it rests on', [
    ['strategy', 'Strategy'],
    ['basis', 'Basis'],
    ['cost', 'Cost'],
    ['documents', 'Documents'],
  ]],
  ['Working in it', [
    ['templates', 'Templates'],
    ['meeting', 'The meeting screen'],
    ['map', 'The map'],
  ]],
  ['Showing it to someone', [
    ['loose', 'Loose ends'],
    ['friday', 'The weekly report'],
    ['brief', 'The brief'],
    ['identity', 'Identity and numbers'],
  ]],
  ['', [
    ['habits', 'What makes it work'],
  ]],
] as const

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-12 scroll-mt-8 font-display text-[28px] font-medium first:mt-0">
      {children}
    </h2>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 max-w-[720px] text-[13.5px] leading-relaxed">{children}</p>
}

function Row({
  left,
  children,
}: {
  left: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid max-w-[1040px] grid-cols-1 lg:grid-cols-[168px_1fr] items-baseline gap-6 border-t border-rule py-3 last:border-b">
      <div className="lbl-tight text-muted">{left}</div>
      <div className="max-w-[820px] text-[13px] leading-relaxed">{children}</div>
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-sheet px-1.5 py-0.5 font-mono text-[11.5px] text-ink">
      {children}
    </span>
  )
}

export default function GuidePage() {
  return (
    <main>
      <div className="frame [--frame-margin:340px]">
        <div className="lbl pl-5 lg:pl-16 py-3 pr-5 text-muted">Guide</div>
        <div className="lbl border-l border-rule px-5 lg:px-10 py-3 text-muted">
          How to use it. MASTER.md says why it is built this way
        </div>
        <div className="border-l border-rule py-3 pl-5 lg:pl-8 pr-5 lg:pr-16" />
      </div>
      <Rule strong />

      <div className="frame [--frame-margin:340px] min-h-[70vh]">
        {/* Index */}
        <div className="pl-5 lg:pl-16 py-8 pr-5">
          <h1 className="font-display text-[30px] font-medium leading-[1.06] tracking-[-0.01em]">
            Guide
          </h1>
          <nav className="mt-5 flex flex-col gap-4">
            {SECTIONS.map(([group, items]) => (
              <div key={group} className="flex flex-col gap-2">
                {group !== '' && (
                  <span className="lbl-tight text-rule-strong">{group}</span>
                )}
                {items.map(([id, label]) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="text-[11px] leading-snug text-muted hover:text-green"
                  >
                    {label}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        </div>

        {/* The guide */}
        <div className="border-l border-rule px-5 lg:px-12 py-8">
          <H id="start">Where to start</H>
          <P>
            The point of this tool is that you never sit down to write a status report.
            You log what happens as it happens, and Friday assembles itself out of that.
            Everything else here serves that one idea.
          </P>
          <P>
            A new project starts on <Link href="/projects" className="text-green">Projects</Link>{' '}
            with New project. Give it a category so it gets a number, then break it down
            with New node and the <Code>+</Code> on each row. You do not have to plan the
            whole tree up front. Add parts as they become real.
          </P>

          <H id="quick">Quick entry</H>
          <P>
            <Code>Ctrl+K</Code> anywhere. One field, Enter saves, Esc closes. The first
            character decides what gets written.
          </P>
          <div className="mt-4">
            <Row left="No prefix">
              A log entry. <Code>Chased IT again on the VLAN</Code>
            </Row>
            <Row left="+">
              A task under the target. <Code>+ Write test protocol</Code>
            </Row>
            <Row left="!">
              A blocker. <Code>! Waiting for VLAN @ IT</Code>. The <Code>@</Code> is
              required: without it the line is rejected, because a blocker with nobody to
              wait on cannot be measured.
            </Row>
            <Row left="?">
              A decision. <Code>? Chose 130 kV // heavier seed needs it</Code>. Everything
              after <Code>//</Code> is the reason, and it is optional.
            </Row>
          </div>
          <P>
            The prefix only counts at the very start, so <Code>Load cells 4+2 mounted</Code>{' '}
            is an ordinary entry. <Code>Ctrl+1</Code> to <Code>Ctrl+4</Code> switch the kind
            of a log entry: work, note, meeting, risk. They apply to log entries only, and
            the row dims when a prefix is writing something else.
          </P>
          <P>
            The target is guessed: the part you have open, else the page you are on, else
            the node you last wrote on. <Code>Tab</Code> changes it, and the whole path is
            searched, so <Code>data serv</Code> finds Server access and VLAN inside Data
            platform. The grey line above the buttons always says what will be written
            before you press Enter. Read it if you are unsure.
          </P>

          <H id="tree">The tree</H>
          <P>
            The working surface. Every row is a node, and the columns never move: the
            status mark holds the same place whatever the depth, so you can scan straight
            down it. Only the title indents.
          </P>
          <div className="mt-4">
            <Row left="The code">
              <Code>.01.02</Code> is the path from the project, one segment per level. It
              follows the order of the tree, so it changes when you reorder. Do not quote it
              in an email; the project number is the identifier.
            </Row>
            <Row left="Folding">
              A container carries a triangle. A closed branch shows a summary of what is
              inside it, an open one does not, because its children already say it. The
              state travels in the address, so a link opens the same way for the next
              person. <Code>Expand all</Code> and <Code>Collapse all</Code> sit by New node.
            </Row>
            <Row left="Blocks">
              A direct part of the project opens with air and a heavier rule, and its title
              is a step up in weight. Everything below it is a plain row.
            </Row>
            <Row left="Row actions">
              <Code>open</Code> goes into the node on its own, <Code>edit</Code> opens its
              type, dates and delete button, <Code>log</Code> writes an entry on it,{' '}
              <Code>+</Code> adds a child, and <Code>▲▼</Code> moves it among its siblings.
            </Row>
          </div>
          <P>
            Reordering renumbers the whole sibling set in tens, which also repairs the gaps
            and duplicates left by earlier inserts. Only the rows that actually changed are
            written.
          </P>

          <H id="writing">Writing it down</H>
          <P>
            Every node has a description, and it is the one field worth being
            generous in. It is what the <span className="text-ink">brief</span>
            prints, what fills the meeting screen, and what somebody who was not
            in the room reads first.
          </P>
          <P>
            <strong className="font-medium">Paragraphs survive.</strong> Press
            return twice and you get a paragraph; press it once and you get a
            line break, so three sensors listed on three lines stay on three
            lines. Nothing is markdown, nothing is interpreted, and the text
            comes back out the shape it went in.
          </P>
          <P>
            At the top of a project the description is cut to its opening
            paragraph, with{' '}
            <span className="text-ink">Read the rest</span> underneath. The cut
            is always a paragraph, never a number of characters, so it reads as
            an opening rather than as a sentence stopped halfway. Written as one
            long paragraph, there is nothing to fold and it is shown whole. The
            brief never folds anything: it is printed, and paper does not hide
            things.
          </P>
          <P>
            To change a node itself, its title, type, dates, owner or
            description, press <Code>edit</Code> on its row in the tree, or{' '}
            <span className="text-ink">Edit</span> on the meeting screen. The
            delete button lives in that same form. Deleting a node deletes
            everything under it: its children, log, blockers, decisions, cost
            lines and files.
          </P>

          <H id="types">Types</H>
          <P>
            Four types, listed top down. The same words appear in the picker when you
            create or edit a node, because a type explained in two places eventually gets
            explained two different ways.
          </P>
          <div className="mt-4">
            {(Object.keys(TYPE_LABEL) as NodeType[]).map((t) => (
              <Row key={t} left={TYPE_LABEL[t]}>
                {TYPE_HINT[t]}
              </Row>
            ))}
          </div>
          <P>
            <strong className="font-medium">Only a task without children counts as work.</strong>{' '}
            A project made entirely of containers stands at 0 of 0, which is honest: nothing
            has been broken down far enough to be done. Containers are for reading, tasks are
            for finishing.
          </P>
          <P>
            <strong className="font-medium">
              Development and subproject are the same thing to the system.
            </strong>{' '}
            Only task and not-task change any calculation. The difference between the two
            is a convention, kept because it makes the tree readable to someone who was not
            in the room, and it is worth holding to:
          </P>
          <div className="mt-4">
            <Row left="Subproject">
              Divides. It is here because the project is too big to hold in one list.
              &laquo;Production Line: Cleaning&raquo;, &laquo;Datahub Holeby&raquo;. What
              hangs under it is usually more containers.
            </Row>
            <Row left="Development">
              Builds. It is here because a specific thing has to be made, and it breaks
              into the tasks that make it. &laquo;OEE Dashboards&raquo;, &laquo;Virtual
              Machine for SQL Storage&raquo;. What hangs under it is tasks.
            </Row>
          </div>
          <P>
            The useful consequence: a development is where the same tasks keep repeating.
            A basic web application is always Design, Frontend, Backend and Hosting, so
            capture one as a template on{' '}
            <Link href="/templates" className="text-green">Templates</Link> and deploy it
            under the next one instead of typing the four again.
          </P>
          <P>
            And a development that stays empty is a to-do, not a state. Nothing has been
            broken down yet, and the project frame counts those under the progress figure
            as <Code>parts not broken down</Code>, because otherwise 0 % looks the same
            whether the work is undone or simply unwritten.
          </P>

          <H id="status">Status</H>
          <P>
            Six, and you choose all six. Click the word in the tree and pick from the list.
          </P>
          <div className="mt-4">
            {(Object.keys(STATUS_LABEL) as NodeStatus[]).map((s) => (
              <Row
                key={s}
                left={
                  <span className="flex items-center gap-2">
                    <StatusMark status={s} />
                    {STATUS_LABEL[s]}
                  </span>
                }
              >
                {s === 'idea' && 'Written down so it is not forgotten. Nobody has committed to it.'}
                {s === 'planned' && 'Agreed and scheduled, not started.'}
                {s === 'active' && 'Being worked on now.'}
                {s === 'paused' &&
                  'Parked by a decision. This is the one that reports as On hold to the company.'}
                {s === 'done' && 'Finished. Sets the completion date and drops out of next dates.'}
                {s === 'cancelled' &&
                  'Will not happen. Counts neither for nor against progress, unlike done.'}
              </Row>
            ))}
          </div>
          <P>
            There is no Blocked in that list on purpose. See the next section.
          </P>

          <H id="stuck">Blocked, on hold, not ready</H>
          <P>
            Three different reasons work is not moving. They look similar and mean very
            different things, and this is the part worth getting right.
          </P>
          <div className="mt-4">
            <Row left={<span className="text-oxblood">Blocked</span>}>
              Someone outside your control is sitting on it. It is not a status you pick:
              open a blocker and the node reads Blocked by itself, with the day count beside
              it. Resolve the blocker and it goes back on its own.
            </Row>
            <Row left="On hold">
              <span className="text-ink">You</span> parked it. A decision you made, not a
              wait you are suffering. This is a status you set.
            </Row>
            <Row left="Not ready">
              Something has to finish first. Recorded under Sequence. Shown as{' '}
              <Code>waits on 2</Code> in grey while everything is on schedule, and{' '}
              <span className="text-oxblood">held up by 1</span> in red once a predecessor
              passes its own due date.
            </Row>
          </div>
          <P>
            The distinction matters because only blockers feed the waiting days on{' '}
            <Link href="/blockers" className="text-green">Blockers</Link>. That number exists
            so you can say &laquo;27 days on IT&raquo; to IT. Your own sequencing does not
            belong in it, or the number stops being an argument.
          </P>

          <H id="blockers">Blockers</H>
          <P>
            Open one the moment you are waiting, not when it becomes a problem. The clock
            starts at the opening date, and the whole value is in the measurement.
          </P>
          <P>
            The name after <Code>@</Code> is the party you are waiting on, and it is treated
            as an entity. Spelling is settled for you: type <Code>project board</Code> and it
            is stored as Project Board if that name is already in use. Quick entry offers the
            ones you know and says when a name is new, which is the moment a typo is still
            free to fix.
          </P>
          <P>
            The expected reply fills itself in from that recipient&rsquo;s own history: the
            median of the waits they have already closed. Until they have closed one, there
            is no date, which is deliberate. Close blockers when they resolve, with a line
            about what resolved them. That line is what teaches the next estimate.
          </P>
          <P>
            A resolved blocker stays on the case, muted. Never delete one to tidy up: the
            days it cost are the point.
          </P>

          <H id="sequence">Sequence</H>
          <P>
            Use it when one piece of work genuinely cannot start before another finishes.
            Press <Code>open</Code> on the node, then Sequence in the right column.
          </P>
          <P>
            It works between any two nodes, including across subprojects and across
            projects. It inherits downwards, so putting it on a subproject covers everything
            inside it. You do not record it twice.
          </P>
          <P>
            <strong className="font-medium">A dependency is not a problem.</strong> Work that
            comes after other work is a plan. It only turns red when a predecessor passes its
            own due date, and that is the only time it deserves your attention.
          </P>
          <P>
            If you are waiting on a <span className="text-ink">person</span>, that is a
            blocker. If you are waiting on <span className="text-ink">work</span>, that is
            sequence. When both are true, record both: they answer different questions.
          </P>

          <H id="dates">Dates and milestones</H>
          <P>
            Start and due are plain days. The next date shown on a project is simply the
            first unfinished node with a due date anywhere underneath it, so keeping due
            dates honest on the small things is what makes the top level useful.
          </P>
          <P>
            The milestone flag draws a diamond, gathers the node into the milestone list on
            Identity and in the Brief, and breaks a tie when two nodes share a date. It does
            nothing else. Use it for the handful of dates someone outside the project would
            ask about.
          </P>

          <H id="estimates">Estimates</H>
          <P>
            A range in days, filled in before the work starts: three to five, not four. It is
            deliberately a guess and it is never corrected afterwards.
          </P>
          <P>
            Nothing reads these yet. They are being collected so that in half a year the
            question &laquo;how far off am I, typically, on this kind of work&raquo; has an
            answer. That answer cannot be reconstructed later, which is why the field exists
            before the feature does. Fill it in when you create the node, or skip it. An
            empty estimate is better than an invented one.
          </P>

          <H id="roles">Who does what</H>
          <P>
            Roles live on Identity, and they can be set on any node: a hardware subproject
            may have a different project manager than the programme around it. A part with
            no roles of its own shows the project&rsquo;s, marked{' '}
            <Code>from the project</Code>, so an empty field never reads as
            &laquo;nobody&raquo;.
          </P>
          <P>
            <strong className="font-medium">Nothing is notified.</strong> No mail is sent
            from here. The roles exist because the company Status Update knows four of them,
            and because &laquo;who decided this&raquo; is unanswerable six months later if
            nobody wrote it down.
          </P>
          <div className="mt-4">
            <Row left="Project manager">
              Delivery. Plans, chases, reports. Cannot decide to stop it.
            </Row>
            <Row left="Project owner">
              The decision that it is worth doing. Holds the money, can stop it, and is
              where a blocker escalates when chasing stops working.
            </Row>
            <Row left="Product owner">
              Receives the result when the project closes and lives with it afterwards. The
              role that gives handover an address: leave it empty and the answer is you,
              indefinitely.
            </Row>
            <Row left="Process owner">
              The way of working that the project changes, while it runs. Says whether the
              change holds on the floor.
            </Row>
            <Row left="Created by">Who raised it. The company form notifies them.</Row>
            <Row left="Steering committee">
              Decides at the gates. Where a CAPEX application lands.
            </Row>
            <Row left="Project members">Who does the work.</Row>
            <Row left="Other stakeholders">
              Affected without doing. Who you inform, and the candidates offered under
              Waiting on.
            </Row>
          </div>
          <P>
            The three that get confused: <span className="text-ink">project owner</span>{' '}
            funds it and <span className="text-ink">product owner</span> receives it, and
            they separate exactly when the project closes.{' '}
            <span className="text-ink">Product owner</span> owns the thing while{' '}
            <span className="text-ink">process owner</span> owns the way of working. And a{' '}
            <span className="text-ink">project manager</span> delivers where an owner
            decides.
          </P>

          <H id="strategy">Strategy</H>
          <P>
            <Link href="/strategy" className="text-green">Strategy</Link> is the
            only page that cuts the tree sideways. A company strategy, cost of
            goods for instance, is fed by pieces of several unrelated projects
            at once, so it can never be read off any one of them.
          </P>
          <P>
            <strong className="font-medium">
              Mark the part that actually delivers it.
            </strong>{' '}
            Not always the whole project. A broad digitalisation project can
            have exactly one subproject that lowers cost of goods, and marking
            the project would credit the strategy with everything else in it
            too. Press <span className="text-ink">Mark work</span> on a strategy
            and pick the parts.
          </P>
          <P>
            Marked work carries the strategy name in the tree, in green, beside
            its title.
          </P>
          <P>
            If you mark a subproject that sits inside something already marked,
            it is kept but never added twice. Which marking counts is worked out
            rather than ticked: the topmost one in each branch is the one the
            figures use, and the one underneath still shows, because it says
            where the saving comes from.
          </P>
          <P>
            The money works the same way as everywhere else, with one wrinkle
            worth knowing. The expected annual benefit is typed on the{' '}
            <span className="text-ink">project</span>, under Identity, so a
            marked project already has its number. A marked subproject does not,
            and you give it one under <span className="text-ink">Figure</span>.
            Fill that in as well where a project serves the strategy only in
            part, or serves two.
          </P>
          <P>
            <strong className="font-medium">A blank is never counted as zero.</strong>{' '}
            Anything marked without a figure is reported as{' '}
            <span className="text-ink">no figure</span> and counted separately,
            and while any of them stand, the page refuses to show what is still
            to find. A gap computed from an incomplete sum reads as precise and
            is not, and the first person to notice stops trusting the whole
            page.
          </P>
          <div className="mt-4">
            <Row left="Promised a year">
              What the marked work is expected to be worth annually, once it
              runs.
            </Row>
            <Row left="Of that, delivered">
              The part coming from work that is actually finished. This is the
              number that is real.
            </Row>
            <Row left="Invested so far">
              Ordered and invoiced one-off cost under the marked work. What it
              took to get it.
            </Row>
            <Row left="Still to find">
              Target minus promised, where there is a target and nothing is
              missing a figure.
            </Row>
          </div>
          <P>
            A strategy that is over gets an end date and stays on the page. What
            it delivered is the evidence for the next one you are asked to
            approve.
          </P>

          <H id="basis">Basis</H>
          <P>
            <span className="text-ink">Basis</span> answers the question that gets
            asked last and should have been written down first: what did we choose,
            and what did we turn down to get there? It follows the focus, so
            standing on a development node shows what that node rests on rather
            than the whole programme.
          </P>
          <P>
            Two different things sit on the page, and they are kept apart on
            purpose. A <span className="text-ink">decision</span> is a moment: it
            happened, it is fixed, and it stays true. A{' '}
            <span className="text-ink">part</span> is a state: it moves until the
            thing is built.
          </P>
          <P>
            Every decision is filed under a topic, which is what turns a flat list
            into something that reads as a specification:
          </P>
          <div className="mt-4">
            {DECISION_TOPICS.filter((t) => t !== 'other').map((t) => (
              <Row key={t} left={DECISION_TOPIC_LABEL[t]}>
                {DECISION_TOPIC_HINT[t]}
              </Row>
            ))}
          </div>
          <P>
            Quick entry writes a decision without asking for a topic, and those
            land under <span className="text-ink">Not filed</span> until you open
            one and give it a heading. That is deliberate: filing it wrong
            silently would be worse than leaving it unfiled loudly.
          </P>
          <P>
            <strong className="font-medium">
              The rejected option is the half that survives.
            </strong>{' '}
            The reasoning behind a choice is usually guessable a year later. What
            you turned down never is, and it is the only thing that answers «why
            didn&rsquo;t you just use a Raspberry Pi» without you having to be in
            the room. A decision with nothing rejected is counted at the top of
            the page, so you can see how many are only half written.
          </P>
          <P>
            The parts come from the cost lines. There is no separate parts list,
            and that is the whole point: a sensor you are going to buy is already
            a priced line with a vendor and a quotation attached to it, and
            writing it a second time as a specification is how two lists start
            disagreeing. Each line carries what sort of thing it is:
          </P>
          <div className="mt-4">
            {COST_KINDS.filter((k) => k !== 'other').map((k) => (
              <Row key={k} left={COST_KIND_LABEL[k]}>
                {COST_KIND_HINT[k]}
              </Row>
            ))}
          </div>
          <P>
            Free software counts too, at nothing. It costs no money and it is
            still part of what the thing is built from, so a line at 0 with kind{' '}
            <span className="text-ink">software</span> is the honest entry, not a
            fudge.
          </P>
          <P>
            When you have been logging work on a development node and it still has
            no decisions on record, it turns up under{' '}
            <span className="text-ink">loose ends</span> on the front page. It is
            the one loose end whose answer is not a log line, so it links to Basis
            rather than to the entry box.
          </P>

          <H id="cost">Cost</H>
          <P>
            Two different numbers live under Identity and under{' '}
            <span className="text-ink">Cost</span>, and they are supposed to disagree.
          </P>
          <div className="mt-4">
            <Row left="Approved">What the board granted. A fact with a date on it.</Row>
            <Row left="Planned">
              What you told them it would be, on Identity. Typed once, early, and ageing
              from that day.
            </Row>
            <Row left="Priced">
              What the line items add up to. A guess replacing itself as you collect real
              prices.
            </Row>
            <Row left="Not priced">
              Planned minus priced. <strong className="font-medium">The one worth
              watching:</strong> it is the part of the budget still capable of surprising
              you.
            </Row>
          </div>
          <P>
            Add a line whenever a price lands, on the part of the tree it belongs to. A
            sensor goes on the task it is for, not on the project in general, and it rolls
            up from there the same way progress does.
          </P>
          <P>
            The price on a line is the price of <span className="text-ink">one</span>.
            Two IO-Link masters at 180 are entered as a quantity of 2 and a price of
            180, not as a single 360 that nobody can check a year later. A line of one
            reads as its own price and never shows the multiplication.
          </P>
          <P>
            Each line carries how certain it is, and moving it along is one click on the
            line itself:
          </P>
          <div className="mt-4">
            {COST_STATES.map((c) => (
              <Row key={c} left={COST_STATE_LABEL[c]}>
                {COST_STATE_HINT[c]}
              </Row>
            ))}
          </div>
          <P>
            Only <span className="text-ink">ordered</span> and{' '}
            <span className="text-ink">invoiced</span> count as committed, and only
            committed money is compared against the grant. A quote you have not accepted
            has not spent anything, and reporting it as a breach would be crying wolf.
          </P>
          <P>
            <strong className="font-medium">
              A one-off and a running cost are never added together.
            </strong>{' '}
            Buying a sensor for 4 200 and paying 800 a month for a licence are both costs,
            but one is an amount and the other is a rate. Each line says how often it falls
            due, and the page keeps the two apart:
          </P>
          <div className="mt-4">
            <Row left="Priced, one off">
              The investment. This is what the grant is measured against, and what «not
              priced» is subtracted from.
            </Row>
            <Row left="Every year">
              The running cost, whatever the interval, counted per year. It never touches
              the grant: a board approves a purchase, not next year&rsquo;s operating
              budget.
            </Row>
          </div>
          <P>
            Running costs do change one number, though. Payback is the investment divided
            by the saving <span className="text-ink">minus</span> what it costs to keep
            running. A saving of 10 000 a year against a licence of 9 600 a year is not a
            saving of 10 000, and where the running cost eats the benefit the answer is
            that it never pays back.
          </P>
          <P>
            <strong className="font-medium">CAPEX or OPEX is a second question,</strong>{' '}
            and it does not follow the first. Recurrence asks how often the money falls
            due; this asks whether it creates something you will own for years.
          </P>
          <div className="mt-4">
            <Row left="CAPEX">
              Creates or improves an asset: the sensor, the cabinet, the labour that gets
              it working, the freight. Capitalised and depreciated, and the only half a
              grant covers.
            </Row>
            <Row left="OPEX">
              Keeps things running: licences, support, consultancy, training. Expensed
              against the operating budget, and the part that comes off the payback.
            </Row>
          </div>
          <P>
            They cross. A consultant day is one off and OPEX. Installation labour is one
            off and CAPEX. A licence paid three years up front could be either, and that
            one is a question for finance rather than for you. Each line starts on the
            ordinary answer, CAPEX for a one off and OPEX for anything recurring, and
            changing it is one click.
          </P>
          <P>
            <strong className="font-medium">
              Write what the quote says. Everything reported is euro.
            </strong>{' '}
            A Rittal quote is in kroner and a Videometer quote is in euro, so the line
            keeps whichever it was, along with the rate that applied that day. Every total,
            every comparison and every figure that leaves the project is converted to euro.
          </P>
          <P>
            The rate sits on the line rather than on the project, and that is deliberate: a
            single project rate would quietly rewrite every past total the day it moved, and
            a report from week 34 would stop matching what it said in week 34. Change the
            rate on a new line whenever it has moved; the old ones stay as they were
            reported.
          </P>
          <P>
            Amounts are in whole kroner or euro, not thousands. Write{' '}
            <Code>38000</Code>, not <Code>38</Code>.
          </P>

          <H id="documents">Documents</H>
          <P>
            Files live on a project under <span className="text-ink">Documents</span>, in
            numbered folders. The numbering is part of the folder name, so folders sort
            themselves and there is no ordering to maintain.
          </P>
          <P>
            The store is private. There is no fixed address for a file: opening one asks the
            server for a signed link that expires after sixty seconds. Limit is 25 MB per
            file. Deleting a node deletes its files with it.
          </P>
          <P>
            A quote does not have to be uploaded here first. The cost form takes the file
            directly and files it under <Code>03 Quotes and pricing</Code>, because a
            document that has to be uploaded on one page and picked on another is a document
            that never gets attached.
          </P>
          <P>
            Worth knowing, and it was said when this was built: the company system has a
            Files tab of its own. If quotes and applications live in both, there are two
            places to look.
          </P>

          <H id="templates">Templates</H>
          <P>
            A template is a shape you have already built, captured and put down again
            somewhere else. Derive one from any container, not just a project: the four
            tasks under every development container are exactly the thing worth capturing.
          </P>
          <div className="mt-4">
            <Row left="Deploying">
              Either as a new project, numbered and with its own reporting, or{' '}
              <span className="text-ink">under an existing node</span>, where the tree
              simply hangs underneath and none of the project furniture applies. New nodes
              land after whatever is already there, so adding never reorders what you had.
            </Row>
            <Row left="Dates">
              Stored as days from the start, not as dates, so the shape can be laid down
              anywhere in the calendar. Give a start date at deployment and the due dates
              fall out of it. A template captures structure, not the calendar.
            </Row>
            <Row left="Known risks">
              A template can carry the blockers that always turn up. They are opened only if
              you tick the box.
            </Row>
            <Row left="Folders">
              The document skeleton travels too, so the folders exist before the first file
              does.
            </Row>
          </div>

          <H id="meeting">The meeting screen</H>
          <P>
            <span className="text-ink">Meeting</span> in the project menu is a working
            surface, not a slideshow. You bring up a project or a part, and then you walk
            its pieces one at a time while people talk about them.
          </P>
          <P>
            The list stays on the left with a status mark and the longest wait on each
            piece, so the room can see the shape. The piece under discussion fills the
            right: its description, what it is waiting on, its dates and estimate, its
            blockers, decisions, log and cost lines. <Code>Prev</Code> and{' '}
            <Code>Next</Code> walk the list without going back to it.
          </P>
          <P>
            <strong className="font-medium">You can change things from here.</strong> The
            status picker saves itself, a blocker or a decision opens in place, and{' '}
            <Code>Ctrl+K</Code> writes a line on whatever is selected. A meeting is exactly
            when a blocker surfaces and a decision gets made, and a record is worth nothing
            if writing it down means losing the room.
          </P>
          <P>
            Choose what the meeting is about in the band at the top, or press Meeting while
            standing on a part and it opens on that part.
          </P>

          <H id="map">The map</H>
          <P>
            The tree drawn as a diagram, landscape, and it prints on one A4. Grey elbows are
            the hierarchy, what sits under what. Dashed arrows are the sequence, what must
            finish before what, and they leave the boxes sideways so the two can never be
            confused. An arrow turns oxblood when the predecessor has passed its own date.
          </P>
          <div className="mt-4">
            <Row left="Depth">
              Stops the drawing at a level, and each cut branch says how much it holds:{' '}
              <Code>+ 15 below</Code>. Five levels of tasks on one sheet is a wall rather
              than an explanation, and cutting is not hiding.
            </Row>
            <Row left="Zoom">
              <Code>Fit</Code> means it fits on one printed sheet, which is a promise worth
              being able to keep. The geometry is computed at full size and then scaled, so
              the connectors keep meeting the box centres at any setting.
            </Row>
          </div>
          <P>
            Both settings travel in the address, so a map you send opens the way you saw it.
          </P>

          <H id="loose">Loose ends</H>
          <P>
            On <Link href="/" className="text-green">Overview</Link>, above the blockers.
            Things that happened without a line about them, and the cheapest defence against
            yourself in a busy week: rather than remembering to log, you are shown what
            already happened and asked to say a line about it.
          </P>
          <div className="mt-4">
            <Row left="Finished">
              Something you closed without writing what it took.
            </Row>
            <Row left="Started waiting">
              A blocker you opened without writing what you asked for.
            </Row>
            <Row left="An answer came">
              A blocker you resolved without writing what the answer was.
            </Row>
            <Row left="Silence">
              An active, dated task nobody has mentioned in a fortnight. Tasks only: a
              subproject is active because its children are, and you log on the work, not on
              the box.
            </Row>
            <Row left="Nothing decided">
              A development node you have been logging work on that has no
              decisions on record. The only one whose answer is not a log line,
              so it links to <span className="text-ink">Basis</span> rather than
              to the entry box.
            </Row>
          </div>
          <P>
            <strong className="font-medium">Nothing is stored and nothing is dismissed.</strong>{' '}
            A loose end is an event with no entry within two days of it, so writing the line
            is what makes it go away. Two days rather than the same day, because you finish
            something on Thursday and write about it on Friday and that is still writing
            about it.
          </P>
          <P>
            Its limitation is worth knowing: it only sees what happened{' '}
            <span className="text-ink">inside</span> the app. A week where you never opened
            it leaves no trace here, and the list is then empty for the wrong reason.
          </P>

          <H id="friday">The weekly report</H>
          <P>
            <Link href="/friday" className="text-green">Friday</Link> produces the four fields
            the company Power App asks for, per running project, each with its own copy
            button.
          </P>
          <div className="mt-4">
            <Row left="Status">Derived from the node status.</Row>
            <Row left="Stage">
              The one field you choose. It cannot be derived from anything we hold.
            </Row>
            <Row left="Progress">
              Derived. Off Track if a date is overdue or a blocker has passed its expected
              reply; At Risk if a blocker is open or a date falls within seven days;
              otherwise On Track.
            </Row>
            <Row left="Status comment">
              Assembled from your log entries since the last report, with open blockers and
              their day counts phrased in.
            </Row>
          </div>
          <P>
            The text is assembled, never rewritten. There is no language model in this app.
            If the wording is wrong, fix the log entry, not the report.
          </P>
          <P>
            <strong className="font-medium">Then mark it reported.</strong> That is worth
            more than the paste: it stores the week together with the figures behind it,
            progress, the next dated node, the open blockers and what had been priced. Those
            cannot be worked out afterwards, because they all answer for today and the tree
            has moved on. Every week you mark is a week you can later be compared against;
            every week you skip is gone.
          </P>
          <P>
            Saved weeks are kept under <span className="text-ink">Reports</span> on the
            project, newest first, so you can see what you told them in week 34 and what has
            moved since.
          </P>

          <H id="brief">The brief</H>
          <P>
            <span className="text-ink">Brief</span> is the one page you hand to
            somebody else. Not a screen to work in: a document, laid out for A4,
            that answers the questions a steering group asks in the order they
            ask them.
          </P>
          <P>
            It is assembled, never written. What it shows is the identity, the
            timeline, the progress, the open blockers with how long each has
            been waiting, the decisions with what was turned down, the cost
            picture in euro, and the milestones. Every one of those is already
            somewhere else in the application, which is the point: there is no
            field on this page, so there is nothing on it to keep up to date.
          </P>
          <P>
            The decisions are grouped by topic here, the same as on{' '}
            <span className="text-ink">Basis</span>. Twenty decisions in date
            order is a log, and the person reading this did not ask for a log.
          </P>
          <P>
            Print it from the browser. The page geometry is set for A4, so what
            you see is what comes out, and nothing is folded away.
          </P>

          <H id="identity">Identity and numbers</H>
          <P>
            The project number is assigned when you give a project a category, and frozen
            after that. Two letters for the category, two for the year, a four digit serial:{' '}
            <Code>PR-26-0001</Code>. Gaps are never reused.
          </P>
          <P>
            The dotted code on each row, <Code>.01.02</Code>, is a path and not an
            identifier. It follows the order of the tree, so it changes when you reorder with
            the arrows. Do not quote it in an email.
          </P>
          <P>
            Fill in Identity when the project is real, not before. The goal field is the one
            worth the most care: it is the only place that says what has to be true for this
            to have been worth doing, and the company PID has no field for it at all.
          </P>
          <P>
            The economics fields are in <span className="text-ink">euro</span>, always, and
            there is no choice to make. Cost lines keep the currency of their quote and are
            converted on the way up. The company PID that this app was built against had
            50 tDKK in one field and 8 to 10 tEUR in another, describing roughly the same
            saving, and one currency for anything that leaves the project is the fix.
          </P>

          <H id="habits">What makes it work</H>
          <P>
            All of this rests on one habit. If you do not log, Friday has nothing to
            assemble, and the tool becomes a place where you keep a tree of tasks nobody
            reads.
          </P>
          <div className="mt-4">
            <Row left="Log small">
              One line is enough. &laquo;Chased IT again, no date given&raquo; is a better
              entry than a paragraph written on Friday from memory.
            </Row>
            <Row left="Log at the moment">
              <Code>Ctrl+K</Code> takes five seconds from anywhere. Writing it later is what
              does not happen.
            </Row>
            <Row left="Open blockers early">
              The day count only starts when you open it. A blocker opened three weeks late
              has thrown away three weeks of evidence.
            </Row>
            <Row left="Close things">
              Done and resolved are what make progress, next dates and the median move. A
              tree where nothing is ever closed tells you nothing.
            </Row>
            <Row left="Write the reason">
              For a decision, the rejected alternative. For a blocker, what resolved it. In
              six months that is the only part you will actually need.
            </Row>
          </div>
        </div>

        {/* Quick reference */}
        <div className="border-l border-rule">
          <section className="py-8 pl-5 lg:pl-8 pr-5 lg:pr-12">
            <h2 className="font-display text-[26px] font-medium">At a glance</h2>

            <div className="lbl mt-6 text-muted">Quick entry</div>
            <div className="mt-2 flex flex-col gap-2 text-[12px]">
              <div>
                <Code>Ctrl+K</Code> <span className="text-muted">open anywhere</span>
              </div>
              <div>
                <Code>+</Code> <span className="text-muted">task</span>
              </div>
              <div>
                <Code>!</Code> <span className="text-muted">blocker, needs</span> <Code>@</Code>
              </div>
              <div>
                <Code>?</Code> <span className="text-muted">decision,</span> <Code>//</Code>{' '}
                <span className="text-muted">for the reason</span>
              </div>
              <div>
                <Code>Tab</Code> <span className="text-muted">change target</span>
              </div>
            </div>

            <div className="mt-8">
              <Rule />
            </div>

            <div className="lbl mt-6 text-muted">Row actions</div>
            <div className="mt-2 flex flex-col gap-2 text-[12px] text-muted">
              <div>
                <span className="text-ink">open</span> go into the node on its own
              </div>
              <div>
                <span className="text-ink">edit</span> its type, dates and delete
              </div>
              <div>
                <span className="text-ink">log</span> write an entry on it
              </div>
              <div>
                <span className="text-ink">+</span> add a child
              </div>
              <div>
                <span className="text-ink">&#9650;&#9660;</span> reorder among siblings
              </div>
            </div>

            <div className="mt-8">
              <Rule />
            </div>

            <div className="lbl mt-6 text-muted">Not moving, three ways</div>
            <div className="mt-3 flex flex-col gap-3 text-[12px] leading-relaxed">
              <div>
                <span className="text-oxblood">Blocked</span>
                <span className="text-muted"> someone else. Derived from a blocker</span>
              </div>
              <div>
                <span className="text-ink">On hold</span>
                <span className="text-muted"> you parked it. A status you set</span>
              </div>
              <div>
                <span className="text-ink">Not ready</span>
                <span className="text-muted"> other work first. Sequence</span>
              </div>
            </div>

            <div className="mt-8">
              <Rule />
            </div>

            <div className="lbl mt-6 text-muted">Where a thing goes</div>
            <div className="mt-3 flex flex-col gap-2 text-[12px] leading-relaxed">
              <div>
                <span className="text-ink">What happened</span>
                <span className="text-muted"> a log entry, on the task</span>
              </div>
              <div>
                <span className="text-ink">What we chose</span>
                <span className="text-muted"> a decision, on Basis</span>
              </div>
              <div>
                <span className="text-ink">What it costs</span>
                <span className="text-muted"> a cost line. It is also the part</span>
              </div>
              <div>
                <span className="text-ink">Who we wait for</span>
                <span className="text-muted"> a blocker, with a name</span>
              </div>
              <div>
                <span className="text-ink">What it is</span>
                <span className="text-muted"> the description on the node</span>
              </div>
              <div>
                <span className="text-ink">The paper</span>
                <span className="text-muted"> a document, or straight onto the cost line</span>
              </div>
            </div>

            <div className="mt-8">
              <Rule />
            </div>

            <div className="lbl mt-6 text-muted">Never edited by hand</div>
            <div className="mt-2 text-[12px] leading-relaxed text-muted">
              Progress, next date, blocked, waiting days, expected reply, readiness, WBS
              codes, every cost total in euro, and the Friday text. All of it is computed.
              If one of them is wrong, the thing underneath it is wrong.
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
