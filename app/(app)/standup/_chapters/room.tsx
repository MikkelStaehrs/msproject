export type Attendee = { who: string; items: number; longestWait: number }

/**
 * Who the agenda needs in the room.
 *
 * Not an invitation list. A standing one invites the same six people every week
 * whether or not anything needs them, and then the one person who could unblock
 * the oldest item is not there.
 */
export function Room({ room }: { room: Attendee[] }) {
  return (
    <>
      <h2 className="font-display text-[22px] font-medium">The room</h2>
      {room.length === 0 ? (
        <p className="mt-2.5 text-[12.5px] text-muted">
          Nothing is waiting on anyone. Nobody has to be here but you.
        </p>
      ) : (
        <div className="mt-3">
          {room.map((a) => (
            <div
              key={a.who}
              className="flex items-baseline gap-3.5 border-t border-rule py-2.5 last:border-b"
            >
              <span
                className={`num min-w-[38px] text-[22px] leading-none ${
                  a.longestWait >= 30 ? 'text-oxblood' : 'text-ink'
                }`}
              >
                {a.longestWait}
              </span>
              <span className="flex-1">
                <span className="block text-[12.5px] leading-snug">{a.who}</span>
                <span className="mt-0.5 block text-[10.5px] text-muted">
                  {a.items} {a.items === 1 ? 'item' : 'items'} · longest wait{' '}
                  {a.longestWait} days
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
