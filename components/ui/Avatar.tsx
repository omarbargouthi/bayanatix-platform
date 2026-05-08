import { cn } from "@/lib/utils";

const PALETTE = [
  "from-brand-light to-brand-purple",
  "from-brand-purple to-brand-violet",
  "from-brand-sky to-brand-navy",
  "from-brand-violet to-brand-deep",
];

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function Avatar({
  initials,
  size = 32,
  seed,
  className,
}: {
  initials: string;
  size?: number;
  seed?: string;
  className?: string;
}) {
  const grad = colorFor(seed ?? initials);
  return (
    <span
      className={cn(
        "inline-grid place-items-center rounded-full text-white font-bold border-2 border-white",
        `bg-gradient-to-br ${grad}`,
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {initials.slice(0, 2)}
    </span>
  );
}

export function AvatarStack({ users }: { users: { initials: string; userId: string }[] }) {
  const visible = users.slice(0, 4);
  return (
    <div className="flex items-center">
      {visible.map((u, i) => (
        <Avatar
          key={u.userId}
          initials={u.initials}
          seed={u.userId}
          size={26}
          className={i === 0 ? "" : "-ml-2"}
        />
      ))}
      {users.length > visible.length && (
        <span className="ml-1 text-xs font-semibold text-ink-soft">+{users.length - visible.length}</span>
      )}
    </div>
  );
}
